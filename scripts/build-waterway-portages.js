// Bouwt routeerbare overdrachten uit OSM-overdraagpunten en het vaarwegennetwerk.
// Gebruik: node scripts/build-waterway-portages.js
const { readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const germanyOnly = process.argv.includes("--germany-only");
const portagesPath = path.join(projectRoot, germanyOnly ? "canoe-portages-osm-germany.json" : "canoe-portages-osm.json");
const networkPath = path.join(projectRoot, germanyOnly ? "waterway-network-germany.json" : "waterway-network.json");
const outputPath = path.join(projectRoot, germanyOnly ? "waterway-portages-germany.json" : "waterway-portages.json");
const gridSize = 0.01;
const maxSnapMeters = 100;
const maxPortageLengthMeters = 1000;
const minEndpointSeparationMeters = 10;
const coincidentSnapMeters = 5;

function metersPerDegree(latitude) {
  return [111320 * Math.cos(latitude * Math.PI / 180), 110540];
}

function distanceMeters([latitude1, longitude1], [latitude2, longitude2]) {
  const [longitudeScale, latitudeScale] = metersPerDegree((latitude1 + latitude2) / 2);
  return Math.hypot(
    (longitude2 - longitude1) * longitudeScale,
    (latitude2 - latitude1) * latitudeScale
  );
}

function createNetworkIndex(network) {
  if (network.version !== 1 || !Array.isArray(network.nodes) || network.nodes.length % 2 !== 0 ||
      !Array.isArray(network.ways) || network.nodes.length === 0) {
    throw new Error("Het vaarwegennetwerk heeft een onbekend formaat.");
  }

  const nodeCount = network.nodes.length / 2;
  const coordinate = index => [network.nodes[index * 2], network.nodes[index * 2 + 1]];
  const segments = [];
  const grid = new Map();
  for (const [wayIndex, way] of network.ways.entries()) {
    if (!Array.isArray(way)) continue;
    for (let position = 1; position < way.length; position += 1) {
      const a = way[position - 1];
      const b = way[position];
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 ||
          a >= nodeCount || b >= nodeCount || a === b) continue;
      const segmentIndex = segments.length;
      const start = coordinate(a);
      const end = coordinate(b);
      segments.push({ wayIndex, a, b, start, end });
      for (let row = Math.floor(Math.min(start[0], end[0]) / gridSize);
        row <= Math.floor(Math.max(start[0], end[0]) / gridSize); row += 1) {
        for (let column = Math.floor(Math.min(start[1], end[1]) / gridSize);
          column <= Math.floor(Math.max(start[1], end[1]) / gridSize); column += 1) {
          const key = `${row}:${column}`;
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push(segmentIndex);
        }
      }
    }
  }
  return { segments, grid };
}

function nearestSegments(point, index, maxDistance = maxSnapMeters) {
  const [latitude, longitude] = point;
  const [longitudeScale, latitudeScale] = metersPerDegree(latitude);
  const row = Math.floor(latitude / gridSize);
  const column = Math.floor(longitude / gridSize);
  const reach = Math.ceil(maxDistance / (gridSize * Math.min(longitudeScale, latitudeScale))) || 1;
  const byWay = new Map();
  const seen = new Set();
  for (let dRow = -reach; dRow <= reach; dRow += 1) {
    for (let dColumn = -reach; dColumn <= reach; dColumn += 1) {
      for (const segmentIndex of index.grid.get(`${row + dRow}:${column + dColumn}`) || []) {
        if (seen.has(segmentIndex)) continue;
        seen.add(segmentIndex);
        const segment = index.segments[segmentIndex];
        const ax = (segment.start[1] - longitude) * longitudeScale;
        const ay = (segment.start[0] - latitude) * latitudeScale;
        const dx = (segment.end[1] - segment.start[1]) * longitudeScale;
        const dy = (segment.end[0] - segment.start[0]) * latitudeScale;
        const lengthSquared = dx * dx + dy * dy;
        const fraction = lengthSquared === 0
          ? 0
          : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
        const distance = Math.hypot(ax + fraction * dx, ay + fraction * dy);
        if (distance > maxDistance) continue;
        const candidate = {
          ...segment,
          fraction,
          distance,
          point: [
            segment.start[0] + fraction * (segment.end[0] - segment.start[0]),
            segment.start[1] + fraction * (segment.end[1] - segment.start[1])
          ]
        };
        const previous = byWay.get(segment.wayIndex);
        if (!previous || candidate.distance < previous.distance) byWay.set(segment.wayIndex, candidate);
      }
    }
  }
  return [...byWay.values()].sort((a, b) => a.distance - b.distance);
}

function uniqueSnaps(candidates) {
  const unique = [];
  for (const candidate of candidates) {
    if (unique.every(existing => distanceMeters(existing.point, candidate.point) >= coincidentSnapMeters)) {
      unique.push(candidate);
    }
  }
  return unique;
}

function geometryLine(feature) {
  if (feature.geometry?.type !== "LineString" || !Array.isArray(feature.geometry.coordinates) ||
      feature.geometry.coordinates.length < 2) return null;
  const line = feature.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]);
  return line.every(point => point.every(Number.isFinite)) ? line : null;
}

function lengthMeters(line) {
  let length = 0;
  for (let index = 1; index < line.length; index += 1) {
    length += distanceMeters(line[index - 1], line[index]);
  }
  return length;
}

function cleanLine(line) {
  return line.filter((point, index) =>
    index === 0 || distanceMeters(line[index - 1], point) > 0.01);
}

function buildWaterwayPortages(
  portages,
  network,
  generatedAt = new Date().toISOString(),
  source = "Derived from canoe-portage OSM data and its country-specific waterway network"
) {
  if (portages.type !== "FeatureCollection" || !Array.isArray(portages.features)) {
    throw new Error("De OSM-overdraagpunten hebben een onbekend formaat.");
  }
  const index = createNetworkIndex(network);
  const connectionsByEndpoints = new Map();
  const unresolved = [];

  function recordUnresolved(feature, reason) {
    unresolved.push({
      id: feature.id,
      reason,
      geometry: feature.geometry
    });
  }

  function addConnection(feature, line) {
    const coordinates = cleanLine(line);
    const length = lengthMeters(coordinates);
    if (distanceMeters(coordinates[0], coordinates[coordinates.length - 1]) <
        minEndpointSeparationMeters) {
      recordUnresolved(feature, "endpoints-too-close");
      return;
    }
    if (length > maxPortageLengthMeters) {
      recordUnresolved(feature, "portage-too-long");
      return;
    }

    const endpointKey = point => point.map(value => Number(value.toFixed(5))).join(",");
    const endpoints = [endpointKey(coordinates[0]), endpointKey(coordinates[coordinates.length - 1])].sort();
    const key = endpoints.join("|");
    const sourceId = feature.id || `${feature.properties?.osmType}/${feature.properties?.osmId}`;
    const previous = connectionsByEndpoints.get(key);
    if (previous) {
      previous.sourceIds.push(sourceId);
      if (length < previous.lengthMeters) {
        previous.line = coordinates;
        previous.lengthMeters = length;
      }
      return;
    }
    connectionsByEndpoints.set(key, {
      id: sourceId,
      sourceIds: [sourceId],
      line: coordinates,
      lengthMeters: length
    });
  }

  for (const feature of portages.features) {
    if (feature.geometry?.type === "LineString") {
      const line = geometryLine(feature);
      if (!line) {
        recordUnresolved(feature, "invalid-line-geometry");
        continue;
      }
      const start = nearestSegments(line[0], index)[0];
      const end = nearestSegments(line[line.length - 1], index)[0];
      if (!start || !end) {
        recordUnresolved(feature, "waterway-not-found-near-endpoint");
        continue;
      }
      addConnection(feature, [start.point, ...line, end.point]);
      continue;
    }

    if (feature.geometry?.type !== "Point" ||
        !Array.isArray(feature.geometry.coordinates) || feature.geometry.coordinates.length !== 2 ||
        !feature.geometry.coordinates.every(Number.isFinite)) {
      recordUnresolved(feature, "unsupported-geometry");
      continue;
    }
    const [longitude, latitude] = feature.geometry.coordinates;
    const point = [latitude, longitude];
    const candidates = uniqueSnaps(nearestSegments(point, index));
    if (candidates.length !== 2) {
      recordUnresolved(feature, candidates.length < 2
        ? "fewer-than-two-waterway-matches"
        : "ambiguous-waterway-matches");
      continue;
    }
    addConnection(feature, [candidates[0].point, point, candidates[1].point]);
  }

  const connections = [...connectionsByEndpoints.values()]
    .map(connection => ({ ...connection, sourceIds: [...new Set(connection.sourceIds)].sort() }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    version: 1,
    generatedAt,
    source,
    osmBaseTimestamp: portages.osmBaseTimestamp || null,
    waterwayGenerated: network.generated || null,
    portageCount: portages.features.length,
    connectionCount: connections.length,
    unresolvedCount: unresolved.length,
    connections,
    unresolved
  };
}

async function main() {
  const [portages, network] = await Promise.all([
    readFile(portagesPath, "utf8").then(JSON.parse),
    readFile(networkPath, "utf8").then(JSON.parse)
  ]);
  const output = buildWaterwayPortages(
    portages,
    network,
    undefined,
    `Derived from ${path.basename(portagesPath)} and ${path.basename(networkPath)}`
  );
  await writeFile(outputPath, `${JSON.stringify(output, null, 1)}\n`);
  console.log(
    `${output.connectionCount} overdrachten routeerbaar; ${output.unresolvedCount} onopgelost ` +
    `van ${output.portageCount} OSM-punten/ways (${outputPath})`
  );
}

if (require.main === module) {
  main().catch(error => {
    console.error("Overdraagverbindingen bouwen mislukt:", error);
    process.exitCode = 1;
  });
}

module.exports = { buildWaterwayPortages, createNetworkIndex, nearestSegments };
