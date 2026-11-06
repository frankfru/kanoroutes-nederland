const { writeFile } = require("node:fs/promises");
const path = require("node:path");

const outputPath = path.join(__dirname, "waterway-network.json");
const endpoints = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];
const provinces = ["NL-DR", "NL-FL", "NL-FR", "NL-GE", "NL-GR", "NL-LI", "NL-NB", "NL-NH", "NL-OV", "NL-UT", "NL-ZE", "NL-ZH"];
const buildQuery = (province) => `[out:json][timeout:300];
area["ISO3166-2"="${province}"]->.a;
way(area.a)["waterway"~"^(canal|river)$"];
out body;
>;
out skel qt;`;
const simplificationToleranceMeters = 3;
const coordinateDecimals = 5;

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

async function main() {
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
    source: "OpenStreetMap (waterway=canal|river), © OpenStreetMap-bijdragers, ODbL",
    generated: new Date().toISOString().slice(0, 10),
    nodes: nodeList,
    ways: resultWays
  };
  await writeFile(outputPath, JSON.stringify(output));
  console.log(`${resultWays.length} vaarwegen, ${nodeList.length / 2} punten geschreven naar ${outputPath}`);
}

main().catch(error => {
  console.error("Vaarwegennetwerk bouwen mislukt:", error);
  process.exitCode = 1;
});
