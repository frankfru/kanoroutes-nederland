const { readFile, writeFile } = require("node:fs/promises");
const { createHash } = require("node:crypto");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const outputPath = path.join(projectRoot, "waterway-network.json");
const candidatePath = path.join(projectRoot, "waterway-coverage-candidates.json");
const mergeCandidatesOnly = process.argv.includes("--merge-candidates-only");
const endpoints = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];
const provinces = ["NL-DR", "NL-FL", "NL-FR", "NL-GE", "NL-GR", "NL-LI", "NL-NB", "NL-NH", "NL-OV", "NL-UT", "NL-ZE", "NL-ZH"];
const buildQuery = (province) => `[out:json][timeout:300];
area["ISO3166-2"="${province}"]->.a;
way(area.a)["waterway"~"^(canal|river|fairway)$"];
out body;
>;
out skel qt;`;
const simplificationToleranceMeters = 3;
const coordinateDecimals = 5;
// Vangt de vereenvoudigingstolerantie en afronding op bij het herstellen van aansluitingen.
const candidateJoinToleranceMeters = 4;
const networkGridSize = 0.01;

async function fetchOverpass(province) {
  const query = buildQuery(province);
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          body: new URLSearchParams({ data: query }),
          headers: { "User-Agent": "kanoroutes-dinsdaggers waterway network builder" }
        });
        if (!response.ok) throw new Error(`${endpoint}: HTTP ${response.status}`);
        return await response.json();
      } catch (error) {
        lastError = error;
        console.warn(`${province}: Overpass-server mislukt (${error.message}); volgende proberen.`);
      }
    }
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  throw lastError;
}

function toMeters([latitude, longitude], referenceLatitude) {
  return [
    longitude * 111320 * Math.cos(referenceLatitude * Math.PI / 180),
    latitude * 110540
  ];
}

function distanceToSegment(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
}

// Douglas-Peucker; geeft indexen van te behouden punten terug.
function simplify(points, tolerance) {
  if (points.length <= 2) return points.map((_, index) => index);
  const referenceLatitude = points[0][0];
  const meters = points.map(point => toMeters(point, referenceLatitude));
  const keep = new Set([0, points.length - 1]);
  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop();
    let maxDistance = 0;
    let maxIndex = -1;
    for (let index = first + 1; index < last; index += 1) {
      const distance = distanceToSegment(meters[index], meters[first], meters[last]);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = index;
      }
    }
    if (maxDistance > tolerance && maxIndex !== -1) {
      keep.add(maxIndex);
      stack.push([first, maxIndex], [maxIndex, last]);
    }
  }
  return [...keep].sort((a, b) => a - b);
}

function mergeCoverageCandidates(network, candidates) {
  if (candidates.version !== 1 || !Array.isArray(candidates.lines) ||
      candidates.lines.some(candidate =>
        !candidate || !Number.isSafeInteger(candidate.id) ||
        !["connected", "wide-water", "both"].includes(candidate.reason) ||
        !Array.isArray(candidate.line) || candidate.line.length < 2 ||
        candidate.line.some(point =>
          !Array.isArray(point) || point.length !== 2 ||
          !Number.isFinite(point[0]) || !Number.isFinite(point[1])))) {
    throw new Error("De kandidaatdata voor de vaarwegdekking heeft een onbekend formaat.");
  }

  const fingerprint = createHash("sha256")
    .update(JSON.stringify(candidates.lines))
    .digest("hex");
  if (network.candidateCoverage?.fingerprint === fingerprint) {
    return { network, added: false, stats: network.candidateCoverage };
  }
  if (network.candidateCoverage) {
    throw new Error("De kandidaatdata is gewijzigd sinds de vorige netwerkintegratie. Bouw het basisnetwerk opnieuw voordat je deze data integreert.");
  }

  const round = value => Number(value.toFixed(coordinateDecimals));
  const coordinateKey = (latitude, longitude) =>
    `${round(latitude)},${round(longitude)}`;
  const coordinateIndex = new Map();
  for (let index = 0; index < network.nodes.length; index += 2) {
    const key = coordinateKey(network.nodes[index], network.nodes[index + 1]);
    if (!coordinateIndex.has(key)) coordinateIndex.set(key, index / 2);
  }

  function coordinate(index) {
    return [network.nodes[index * 2], network.nodes[index * 2 + 1]];
  }

  function gridCell(latitude, longitude) {
    return `${Math.floor(latitude / networkGridSize)}:${Math.floor(longitude / networkGridSize)}`;
  }

  const segmentGrid = new Map();
  for (const [wayIndex, way] of network.ways.entries()) {
    for (let position = 1; position < way.length; position += 1) {
      const segment = {
        wayIndex,
        position,
        startIndex: way[position - 1],
        endIndex: way[position],
        start: coordinate(way[position - 1]),
        end: coordinate(way[position])
      };
      for (let row = Math.floor(Math.min(segment.start[0], segment.end[0]) / networkGridSize);
        row <= Math.floor(Math.max(segment.start[0], segment.end[0]) / networkGridSize); row += 1) {
        for (let column = Math.floor(Math.min(segment.start[1], segment.end[1]) / networkGridSize);
          column <= Math.floor(Math.max(segment.start[1], segment.end[1]) / networkGridSize); column += 1) {
          const key = `${row}:${column}`;
          if (!segmentGrid.has(key)) segmentGrid.set(key, []);
          segmentGrid.get(key).push(segment);
        }
      }
    }
  }

  function nearestSegment(point) {
    const [latitude, longitude] = point;
    const [longitudeScale, latitudeScale] = [
      111320 * Math.cos(latitude * Math.PI / 180),
      110540
    ];
    const pointMeters = [longitude * longitudeScale, latitude * latitudeScale];
    const row = Math.floor(latitude / networkGridSize);
    const column = Math.floor(longitude / networkGridSize);
    let nearest = null;
    const checkedSegments = new Set();
    for (let cellRow = row - 1; cellRow <= row + 1; cellRow += 1) {
      for (let cellColumn = column - 1; cellColumn <= column + 1; cellColumn += 1) {
        for (const segment of segmentGrid.get(`${cellRow}:${cellColumn}`) || []) {
          if (checkedSegments.has(segment)) continue;
          checkedSegments.add(segment);
          const startMeters = [
            segment.start[1] * longitudeScale,
            segment.start[0] * latitudeScale
          ];
          const endMeters = [
            segment.end[1] * longitudeScale,
            segment.end[0] * latitudeScale
          ];
          const dx = endMeters[0] - startMeters[0];
          const dy = endMeters[1] - startMeters[1];
          const lengthSquared = dx * dx + dy * dy;
          const fraction = lengthSquared === 0
            ? 0
            : Math.max(0, Math.min(1,
              ((pointMeters[0] - startMeters[0]) * dx +
                (pointMeters[1] - startMeters[1]) * dy) / lengthSquared));
          const distance = Math.hypot(
            pointMeters[0] - startMeters[0] - fraction * dx,
            pointMeters[1] - startMeters[1] - fraction * dy
          );
          if (!nearest || distance < nearest.distance) {
            nearest = { ...segment, distance, fraction };
          }
        }
      }
    }
    return nearest;
  }

  const insertions = new Map();
  let attachedEndpoints = 0;
  let snappedEndpoints = 0;
  let isolatedEndpoints = 0;
  function addPoint(point, isEndpoint) {
    const latitude = round(point[0]);
    const longitude = round(point[1]);
    const key = coordinateKey(latitude, longitude);
    const existingIndex = coordinateIndex.get(key);
    if (existingIndex !== undefined) {
      if (isEndpoint) attachedEndpoints += 1;
      return existingIndex;
    }

    if (isEndpoint) {
      const nearest = nearestSegment([latitude, longitude]);
      if (nearest && nearest.distance <= candidateJoinToleranceMeters) {
        attachedEndpoints += 1;
        if (nearest.fraction <= 1e-6) {
          coordinateIndex.set(key, nearest.startIndex);
          return nearest.startIndex;
        }
        if (nearest.fraction >= 1 - 1e-6) {
          coordinateIndex.set(key, nearest.endIndex);
          return nearest.endIndex;
        }
        const index = network.nodes.length / 2;
        network.nodes.push(latitude, longitude);
        coordinateIndex.set(key, index);
        const insertionKey = `${nearest.wayIndex}:${nearest.position}`;
        if (!insertions.has(insertionKey)) insertions.set(insertionKey, []);
        insertions.get(insertionKey).push({ fraction: nearest.fraction, index });
        snappedEndpoints += 1;
        return index;
      }
      isolatedEndpoints += 1;
    }

    const index = network.nodes.length / 2;
    network.nodes.push(latitude, longitude);
    coordinateIndex.set(key, index);
    return index;
  }

  const candidateWays = [];
  const candidateIds = new Set();
  for (const candidate of candidates.lines) {
    if (candidateIds.has(candidate.id)) {
      throw new Error(`Dubbel kandidaat-ID in de vaarwegdekking: ${candidate.id}`);
    }
    candidateIds.add(candidate.id);
    candidateWays.push(candidate.line.map((point, index) =>
      addPoint(point, index === 0 || index === candidate.line.length - 1)));
  }

  const baseWays = network.ways;
  network.ways = baseWays.map((way, wayIndex) => {
    const extended = [];
    for (let position = 0; position < way.length; position += 1) {
      if (position > 0) {
        const additions = insertions.get(`${wayIndex}:${position}`);
        if (additions) {
          additions.sort((a, b) => a.fraction - b.fraction);
          extended.push(...additions.map(addition => addition.index));
        }
      }
      extended.push(way[position]);
    }
    return extended;
  });
  network.ways.push(...candidateWays);
  network.source += "; aangevuld met goedgekeurde brede-water- en knooppunttrajecten";
  network.candidateCoverage = {
    generated: candidates.generated,
    count: candidates.lines.length,
    fingerprint,
    attachedEndpoints,
    snappedEndpoints,
    isolatedEndpoints
  };
  return { network, added: true, stats: network.candidateCoverage };
}

async function main() {
  const candidates = JSON.parse(await readFile(candidatePath, "utf8"));
  if (mergeCandidatesOnly) {
    const network = JSON.parse(await readFile(outputPath, "utf8"));
    const result = mergeCoverageCandidates(network, candidates);
    if (!result.added) {
      console.log(`${result.stats.count} kandidaattrajecten waren al in het netwerk opgenomen.`);
      return;
    }
    await writeFile(outputPath, JSON.stringify(result.network));
    console.log(
      `${result.stats.count} kandidaattrajecten toegevoegd; ` +
      `${result.stats.attachedEndpoints} aansluitingen, ` +
      `${result.stats.snappedEndpoints} punten ingevoegd op bestaande vaarwegen, ` +
      `${result.stats.isolatedEndpoints} losse eindpunten.`
    );
    return;
  }

  const coordinates = new Map();
  const ways = [];
  const seenWays = new Set();
  for (const province of provinces) {
    const data = await fetchOverpass(province);
    console.log(`${province}: ${data.elements.length} elementen`);
    for (const element of data.elements) {
      if (element.type === "node") {
        coordinates.set(element.id, [element.lat, element.lon]);
      } else if (element.type === "way") {
        if (seenWays.has(element.id)) continue;
        seenWays.add(element.id);
        const tags = element.tags || {};
        if (tags.boat === "no" || tags.tunnel === "culvert" || tags.access === "no") continue;
        ways.push(element.nodes);
      }
    }
  }

  // Knooppunten waar vaarwegen samenkomen of eindigen blijven altijd behouden.
  const usage = new Map();
  for (const nodes of ways) {
    for (const id of nodes) usage.set(id, (usage.get(id) || 0) + 1);
  }

  const nodeIndexes = new Map();
  const nodeList = [];
  const resultWays = [];
  const round = value => Number(value.toFixed(coordinateDecimals));

  function indexOf(id) {
    let index = nodeIndexes.get(id);
    if (index === undefined) {
      const [latitude, longitude] = coordinates.get(id);
      index = nodeList.length / 2;
      nodeList.push(round(latitude), round(longitude));
      nodeIndexes.set(id, index);
    }
    return index;
  }

  for (const nodes of ways) {
    const valid = nodes.filter(id => coordinates.has(id));
    if (valid.length < 2) continue;

    const pieces = [];
    let piece = [valid[0]];
    for (let index = 1; index < valid.length; index += 1) {
      piece.push(valid[index]);
      if (usage.get(valid[index]) > 1 && index < valid.length - 1) {
        pieces.push(piece);
        piece = [valid[index]];
      }
    }
    pieces.push(piece);

    const simplified = [];
    for (const pieceNodes of pieces) {
      const keep = simplify(pieceNodes.map(id => coordinates.get(id)), simplificationToleranceMeters);
      const kept = keep.map(index => pieceNodes[index]);
      simplified.push(...(simplified.length > 0 ? kept.slice(1) : kept));
    }
    if (simplified.length >= 2) resultWays.push(simplified.map(indexOf));
  }

  const output = {
    version: 1,
    source: "OpenStreetMap (waterway=canal|river|fairway), © OpenStreetMap-bijdragers, ODbL",
    generated: new Date().toISOString().slice(0, 10),
    nodes: nodeList,
    ways: resultWays
  };
  const merged = mergeCoverageCandidates(output, candidates);
  await writeFile(outputPath, JSON.stringify(merged.network));
  console.log(
    `${merged.network.ways.length} vaarwegen, ${merged.network.nodes.length / 2} punten; ` +
    `${merged.stats.count} kandidaattrajecten opgenomen in ${outputPath}`
  );
}

main().catch(error => {
  console.error("Vaarwegennetwerk bouwen mislukt:", error);
  process.exitCode = 1;
});
