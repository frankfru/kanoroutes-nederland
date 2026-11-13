export function createWaterwayRouter() {
          const maxSnapMeters = 500;
          const maxPortageSnapMeters = 10;
          const cellSize = 0.01;
          let loading;
          let network;

          function metersPerDegree(latitude) {
            return [111320 * Math.cos(latitude * Math.PI / 180), 110540];
          }

          function distanceMeters([latitude1, longitude1], [latitude2, longitude2]) {
            const [lngScale, latScale] = metersPerDegree((latitude1 + latitude2) / 2);
            return Math.hypot((longitude2 - longitude1) * lngScale, (latitude2 - latitude1) * latScale);
          }

          function build(data, germanyData, portageData, germanyPortageData) {
            if (data.version !== 1 || !Array.isArray(data.nodes) || data.nodes.length % 2 !== 0 ||
                !Array.isArray(data.ways) || data.nodes.length === 0) {
              throw new Error("Het vaarwegennetwerk heeft een onbekend formaat.");
            }
            if (germanyData.version !== 1 || !Array.isArray(germanyData.nodes) ||
                germanyData.nodes.length % 2 !== 0 || !Array.isArray(germanyData.ways)) {
              throw new Error("Het Duitse vaarwegennetwerk heeft een onbekend formaat.");
            }
            if (portageData.version !== 1 || !Array.isArray(portageData.connections) ||
                portageData.waterwayGenerated !== (data.generated || null) ||
                portageData.connectionCount !== portageData.connections.length) {
              throw new Error("De Nederlandse overdraagverbindingen horen niet bij het Nederlandse vaarwegennetwerk.");
            }
            if (germanyPortageData.version !== 1 || !Array.isArray(germanyPortageData.connections) ||
                germanyPortageData.waterwayGenerated !== (germanyData.generated || null) ||
                germanyPortageData.connectionCount !== germanyPortageData.connections.length) {
              throw new Error("De Duitse overdraagverbindingen horen niet bij het Duitse vaarwegennetwerk.");
            }
            const germanyOffset = data.nodes.length / 2;
            const ways = [
              ...data.ways,
              ...germanyData.ways.map(way =>
                Array.isArray(way)
                  ? way.map(index => Number.isInteger(index) ? index + germanyOffset : index)
                  : way)
            ];
            const nodes = [...data.nodes, ...germanyData.nodes];
            let nodeCount = nodes.length / 2;
            const adjacency = Array.from({ length: nodeCount }, () => []);
            const segments = [];
            const grid = new Map();
            const virtualNodesBySegment = new Map();
            const coverageWays = [];
            const coveragePortages = [];
            const coordinate = index => [nodes[index * 2], nodes[index * 2 + 1]];

            for (const way of ways) {
              if (!Array.isArray(way)) continue;
              if (way.length > 1 && way.every(index =>
                Number.isInteger(index) && index >= 0 && index < nodeCount)) {
                let south = Infinity;
                let north = -Infinity;
                let west = Infinity;
                let east = -Infinity;
                for (const index of way) {
                  const [latitude, longitude] = coordinate(index);
                  south = Math.min(south, latitude);
                  north = Math.max(north, latitude);
                  west = Math.min(west, longitude);
                  east = Math.max(east, longitude);
                }
                coverageWays.push({ way, south, north, west, east });
              }
              for (let position = 1; position < way.length; position += 1) {
                const a = way[position - 1];
                const b = way[position];
                if (!Number.isInteger(a) || !Number.isInteger(b) ||
                    a < 0 || b < 0 || a >= nodeCount || b >= nodeCount || a === b) continue;
                const weight = distanceMeters(coordinate(a), coordinate(b));
                adjacency[a].push([b, weight]);
                adjacency[b].push([a, weight]);
                const segmentIndex = segments.length;
                segments.push([a, b]);
                const [latitudeA, longitudeA] = coordinate(a);
                const [latitudeB, longitudeB] = coordinate(b);
                for (let row = Math.floor(Math.min(latitudeA, latitudeB) / cellSize);
                  row <= Math.floor(Math.max(latitudeA, latitudeB) / cellSize); row += 1) {
                  for (let column = Math.floor(Math.min(longitudeA, longitudeB) / cellSize);
                    column <= Math.floor(Math.max(longitudeA, longitudeB) / cellSize); column += 1) {
                    const key = `${row}:${column}`;
                    if (!grid.has(key)) grid.set(key, []);
                    grid.get(key).push(segmentIndex);
                  }
                }
              }
            }

            const built = {
              nodes, nodeCount, adjacency, segments, grid, coverageWays, coveragePortages,
              virtualNodesBySegment, coordinate, generated: data.generated,
              germanyGenerated: germanyData.generated
            };
            network = built;
            for (const connection of [...portageData.connections, ...germanyPortageData.connections]) {
              if (!Array.isArray(connection.line) || connection.line.length < 2 ||
                  connection.line.some(point =>
                    !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite))) {
                throw new Error(`Ongeldige geometrie voor overdracht ${connection.id || "zonder ID"}.`);
              }
              const from = snap(connection.line[0]);
              const to = snap(connection.line[connection.line.length - 1]);
              if (!from || !to || from.distance > maxPortageSnapMeters || to.distance > maxPortageSnapMeters) {
                throw new Error(`Overdracht ${connection.id || "zonder ID"} sluit niet aan op dit vaarwegennetwerk.`);
              }

              const fromNode = addVirtualNode(from);
              const toNode = addVirtualNode(to);
              const line = connection.line.map(point => point.slice());
              line[0] = from.point;
              line[line.length - 1] = to.point;
              let weight = 0;
              for (let index = 1; index < line.length; index += 1) {
                weight += distanceMeters(line[index - 1], line[index]);
              }
              if (!Number.isFinite(weight) || weight <= 0) {
                throw new Error(`Ongeldige lengte voor overdracht ${connection.id || "zonder ID"}.`);
              }
              adjacency[fromNode].push([toNode, weight, line]);
              adjacency[toNode].push([fromNode, weight, [...line].reverse()]);
              const latitudes = line.map(point => point[0]);
              const longitudes = line.map(point => point[1]);
              coveragePortages.push({
                line,
                south: Math.min(...latitudes),
                north: Math.max(...latitudes),
                west: Math.min(...longitudes),
                east: Math.max(...longitudes)
              });
            }
            return built;
          }

          function coverage(bounds) {
            if (!network) return null;
            const south = bounds.getSouth();
            const north = bounds.getNorth();
            const west = bounds.getWest();
            const east = bounds.getEast();
            const lines = network.coverageWays
              .filter(way => way.north >= south && way.south <= north && way.east >= west && way.west <= east)
              .map(way => way.way.map(network.coordinate));
            const portages = network.coveragePortages
              .filter(portage => portage.north >= south && portage.south <= north &&
                portage.east >= west && portage.west <= east)
              .map(portage => portage.line);
            return {
              lines,
              portages,
              generated: network.generated,
              germanyGenerated: network.germanyGenerated
            };
          }

          function load() {
            if (network) return Promise.resolve(network);
            loading ||= Promise.all([
              "waterway-network.json",
              "waterway-network-germany.json",
              "waterway-portages.json",
              "waterway-portages-germany.json"
            ].map(file =>
              fetch(file).then(response => {
                if (!response.ok) throw new Error(`Het bestand ${file} kon niet worden geladen.`);
                return response.json();
              })
            ))
              .then(([data, germanyData, portageData, germanyPortageData]) => {
                network = build(data, germanyData, portageData, germanyPortageData);
                return network;
              })
              .catch(error => {
                network = null;
                loading = null;
                throw error;
              });
            return loading;
          }

          function snap([latitude, longitude]) {
            const [lngScale, latScale] = metersPerDegree(latitude);
            const row = Math.floor(latitude / cellSize);
            const column = Math.floor(longitude / cellSize);
            const reach = Math.ceil(maxSnapMeters / (cellSize * Math.min(lngScale, latScale))) || 1;
            const seen = new Set();
            let best = null;
            for (let dRow = -reach; dRow <= reach; dRow += 1) {
              for (let dColumn = -reach; dColumn <= reach; dColumn += 1) {
                for (const segmentIndex of network.grid.get(`${row + dRow}:${column + dColumn}`) || []) {
                  if (seen.has(segmentIndex)) continue;
                  seen.add(segmentIndex);
                  const [a, b] = network.segments[segmentIndex];
                  const [latitudeA, longitudeA] = network.coordinate(a);
                  const [latitudeB, longitudeB] = network.coordinate(b);
                  const ax = (longitudeA - longitude) * lngScale;
                  const ay = (latitudeA - latitude) * latScale;
                  const dx = (longitudeB - longitudeA) * lngScale;
                  const dy = (latitudeB - latitudeA) * latScale;
                  const lengthSquared = dx * dx + dy * dy;
                  const t = lengthSquared === 0
                    ? 0
                    : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
                  const distance = Math.hypot(ax + t * dx, ay + t * dy);
                  if (distance <= maxSnapMeters && (!best || distance < best.distance)) {
                    best = {
                      segmentIndex,
                      a,
                      b,
                      distance,
                      point: [latitudeA + t * (latitudeB - latitudeA), longitudeA + t * (longitudeB - longitudeA)]
                    };
                  }
                }
              }
            }
            return best;
          }

          function addVirtualNode(snapResult) {
            const node = network.nodeCount;
            network.nodes.push(...snapResult.point);
            network.adjacency.push([]);
            network.nodeCount += 1;
            const [a, b] = network.segments[snapResult.segmentIndex];
            const sameSegmentNodes = network.virtualNodesBySegment.get(snapResult.segmentIndex) || [];
            for (const otherNode of sameSegmentNodes) {
              const weight = distanceMeters(snapResult.point, network.coordinate(otherNode));
              network.adjacency[node].push([otherNode, weight]);
              network.adjacency[otherNode].push([node, weight]);
            }
            sameSegmentNodes.push(node);
            network.virtualNodesBySegment.set(snapResult.segmentIndex, sameSegmentNodes);
            for (const neighbor of [a, b]) {
              const weight = distanceMeters(snapResult.point, network.coordinate(neighbor));
              network.adjacency[node].push([neighbor, weight]);
              network.adjacency[neighbor].push([node, weight]);
            }
            return node;
          }

          function route(from, to) {
            if (from.segmentIndex === to.segmentIndex) return [from.point, to.point];

            const { adjacency, nodeCount, coordinate } = network;
            const distances = new Float64Array(nodeCount).fill(Infinity);
            const previous = new Int32Array(nodeCount).fill(-1);
            const previousGeometry = new Array(nodeCount).fill(null);
            const heap = [];
            const push = (node, distance) => {
              heap.push([distance, node]);
              let child = heap.length - 1;
              while (child > 0) {
                const parent = (child - 1) >> 1;
                if (heap[parent][0] <= heap[child][0]) break;
                [heap[parent], heap[child]] = [heap[child], heap[parent]];
                child = parent;
              }
            };
            const pop = () => {
              const top = heap[0];
              const last = heap.pop();
              if (heap.length > 0) {
                heap[0] = last;
                let parent = 0;
                for (;;) {
                  const left = parent * 2 + 1;
                  const right = left + 1;
                  let smallest = parent;
                  if (left < heap.length && heap[left][0] < heap[smallest][0]) smallest = left;
                  if (right < heap.length && heap[right][0] < heap[smallest][0]) smallest = right;
                  if (smallest === parent) break;
                  [heap[parent], heap[smallest]] = [heap[smallest], heap[parent]];
                  parent = smallest;
                }
              }
              return top;
            };

            for (const node of [from.a, from.b]) {
              distances[node] = distanceMeters(from.point, coordinate(node));
              push(node, distances[node]);
            }
            const targets = [to.a, to.b].map(node => [node, distanceMeters(to.point, coordinate(node))]);
            let bestTotal = Infinity;
            let bestTarget = -1;

            while (heap.length > 0) {
              const [distance, node] = pop();
              if (distance > distances[node]) continue;
              if (distance >= bestTotal) break;
              for (const [target, extra] of targets) {
                if (node === target && distance + extra < bestTotal) {
                  bestTotal = distance + extra;
                  bestTarget = target;
                }
              }
              for (const [neighbor, weight, geometry] of adjacency[node]) {
                const candidate = distance + weight;
                if (candidate < distances[neighbor]) {
                  distances[neighbor] = candidate;
                  previous[neighbor] = node;
                  previousGeometry[neighbor] = geometry || null;
                  push(neighbor, candidate);
                }
              }
            }

            if (bestTarget === -1) return null;
            const path = [];
            for (let node = bestTarget; node !== -1; node = previous[node]) path.push(node);
            path.reverse();
            const route = [from.point, coordinate(path[0])];
            for (let index = 1; index < path.length; index += 1) {
              const edgeGeometry = previousGeometry[path[index]];
              if (edgeGeometry) route.push(...edgeGeometry.slice(1));
              else route.push(coordinate(path[index]));
            }
            route.push(to.point);
            return route;
          }

          return { load, snap, route, coverage };
}
