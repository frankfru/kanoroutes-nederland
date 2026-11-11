const { writeFile } = require("node:fs/promises");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const networkPath = path.join(projectRoot, "waterway-network.json");
const outputPath = path.join(projectRoot, "waterway-coverage-gaps.json");
const wfsUrl = "https://service.pdok.nl/rws/nationaal-wegenbestand-vaarwegen/wfs/v1_0";
const featureType = "nwbvaarwegen:vaarwegvakken";
const pageSize = 500;
const gridCellSize = 0.01;
const coverageToleranceMeters = 25;
const sampleSpacingMeters = 20;

function isValidNetwork(data) {
  return data.version === 1 && Array.isArray(data.nodes) &&
    data.nodes.length > 0 && data.nodes.length % 2 === 0 &&
    Array.isArray(data.ways);
}

function buildCoverageIndex(data) {
  const segments = [];
  const grid = new Map();
  const nodeCount = data.nodes.length / 2;
  const coordinate = index => [data.nodes[index * 2], data.nodes[index * 2 + 1]];

  for (const way of data.ways) {
    if (!Array.isArray(way) || way.length < 2 ||
        !way.every(index => Number.isInteger(index) && index >= 0 && index < nodeCount)) continue;
    for (let position = 1; position < way.length; position += 1) {
      const start = coordinate(way[position - 1]);
      const end = coordinate(way[position]);
      const segmentIndex = segments.length;
      segments.push([start, end]);
      const minRow = Math.floor(Math.min(start[0], end[0]) / gridCellSize);
      const maxRow = Math.floor(Math.max(start[0], end[0]) / gridCellSize);
      const minColumn = Math.floor(Math.min(start[1], end[1]) / gridCellSize);
      const maxColumn = Math.floor(Math.max(start[1], end[1]) / gridCellSize);
      for (let row = minRow; row <= maxRow; row += 1) {
        for (let column = minColumn; column <= maxColumn; column += 1) {
          const key = `${row}:${column}`;
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push(segmentIndex);
        }
      }
    }
  }
  return { segments, grid };
}

function hasCoverage([latitude, longitude], index) {
  const row = Math.floor(latitude / gridCellSize);
  const column = Math.floor(longitude / gridCellSize);
  const longitudeScale = 111320 * Math.cos(latitude * Math.PI / 180);
  const latitudeScale = 110540;
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      for (const segmentIndex of index.grid.get(`${row + rowOffset}:${column + columnOffset}`) || []) {
        const [start, end] = index.segments[segmentIndex];
        const ax = (start[1] - longitude) * longitudeScale;
        const ay = (start[0] - latitude) * latitudeScale;
        const dx = (end[1] - start[1]) * longitudeScale;
        const dy = (end[0] - start[0]) * latitudeScale;
        const lengthSquared = dx * dx + dy * dy;
        const t = lengthSquared === 0
          ? 0
          : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
        if (Math.hypot(ax + t * dx, ay + t * dy) <= coverageToleranceMeters) return true;
      }
    }
  }
  return false;
}

function interpolate(start, end, fraction) {
  return [
    start[0] + (end[0] - start[0]) * fraction,
    start[1] + (end[1] - start[1]) * fraction
  ];
}

function midpoint(start, end) {
  return interpolate(start, end, 0.5);
}

function simplify(points, toleranceMeters = 3) {
  if (points.length <= 2) return points;
  const referenceLatitude = points[0][0];
  const longitudeScale = 111320 * Math.cos(referenceLatitude * Math.PI / 180);
  const latitudeScale = 110540;
  const meters = points.map(([latitude, longitude]) => [
    longitude * longitudeScale,
    latitude * latitudeScale
  ]);
  const keep = new Set([0, points.length - 1]);
  const stack = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [first, last] = stack.pop();
    const [startX, startY] = meters[first];
    const [endX, endY] = meters[last];
    const dx = endX - startX;
    const dy = endY - startY;
    const lengthSquared = dx * dx + dy * dy;
    let maxDistance = 0;
    let maxIndex = -1;
    for (let index = first + 1; index < last; index += 1) {
      const [x, y] = meters[index];
      const fraction = lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, ((x - startX) * dx + (y - startY) * dy) / lengthSquared));
      const distance = Math.hypot(x - (startX + fraction * dx), y - (startY + fraction * dy));
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = index;
      }
    }
    if (maxDistance > toleranceMeters && maxIndex !== -1) {
      keep.add(maxIndex);
      stack.push([first, maxIndex], [maxIndex, last]);
    }
  }
  return [...keep].sort((a, b) => a - b).map(index => points[index]);
}

function uncoveredParts(coordinates, index) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
  const samples = [];
  for (let segmentIndex = 1; segmentIndex < coordinates.length; segmentIndex += 1) {
    const start = coordinates[segmentIndex - 1];
    const end = coordinates[segmentIndex];
    if (!Array.isArray(start) || !Array.isArray(end) ||
        !Number.isFinite(start[0]) || !Number.isFinite(start[1]) ||
        !Number.isFinite(end[0]) || !Number.isFinite(end[1])) continue;
    const [longitude1, latitude1] = start;
    const [longitude2, latitude2] = end;
    const midpointLatitude = (latitude1 + latitude2) / 2;
    const lengthMeters = Math.hypot(
      (longitude2 - longitude1) * 111320 * Math.cos(midpointLatitude * Math.PI / 180),
      (latitude2 - latitude1) * 110540
    );
    const steps = Math.max(1, Math.ceil(lengthMeters / sampleSpacingMeters));
    if (samples.length === 0) samples.push([latitude1, longitude1]);
    for (let step = 1; step <= steps; step += 1) {
      const point = interpolate(
        [latitude1, longitude1],
        [latitude2, longitude2],
        step / steps
      );
      samples.push(point);
    }
  }

  const covered = samples.map(point => hasCoverage(point, index));
  const parts = [];
  let current = null;
  for (let position = 0; position < samples.length; position += 1) {
    if (!covered[position]) {
      if (!current) {
        current = position > 0 && covered[position - 1]
          ? [midpoint(samples[position - 1], samples[position])]
          : [samples[position]];
      }
      current.push(samples[position]);
    } else if (current) {
      current.push(midpoint(samples[position - 1], samples[position]));
      if (current.length >= 2) parts.push(simplify(current));
      current = null;
    }
  }
  if (current && current.length >= 2) parts.push(simplify(current));
  return parts;
}

async function fetchPage(startIndex) {
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: featureType,
    count: String(pageSize),
    startIndex: String(startIndex),
    outputFormat: "application/json; subtype=geojson",
    srsName: "EPSG:4326"
  });
  const response = await fetch(`${wfsUrl}?${params}`, {
    headers: { "User-Agent": "kanoroutes-nederland waterway coverage overlay builder" }
  });
  if (!response.ok) throw new Error(`NWB WFS-aanvraag mislukt (HTTP ${response.status}).`);
  const data = await response.json();
  if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
    throw new Error("De NWB WFS gaf geen geldige GeoJSON FeatureCollection terug.");
  }
  return data.features;
}

async function fetchWaterways() {
  const features = [];
  for (let startIndex = 0; ; startIndex += pageSize) {
    const page = await fetchPage(startIndex);
    features.push(...page);
    console.log(`NWB-vaarwegvakken opgehaald: ${features.length}`);
    if (page.length < pageSize) return features;
  }
}

function geometryLines(geometry) {
  if (geometry?.type === "LineString") return [geometry.coordinates];
  if (geometry?.type === "MultiLineString") return geometry.coordinates;
  return [];
}

async function main() {
  const network = JSON.parse(await require("node:fs/promises").readFile(networkPath, "utf8"));
  if (!isValidNetwork(network)) throw new Error("Het vaarwegennetwerk heeft een onbekend formaat.");
  const coverageIndex = buildCoverageIndex(network);
  if (coverageIndex.segments.length === 0) throw new Error("Het vaarwegennetwerk bevat geen geldige lijnsegmenten.");

  const waterways = await fetchWaterways();
  const lines = [];
  const unmatchedWaterways = new Set();
  for (const feature of waterways) {
    const properties = feature.properties || {};
    for (const coordinates of geometryLines(feature.geometry)) {
      const parts = uncoveredParts(coordinates, coverageIndex);
      if (parts.length > 0) unmatchedWaterways.add(feature.id || properties.objectid);
      for (const line of parts) {
        lines.push({
          id: feature.id || String(properties.objectid || lines.length),
          waterwayName: properties.vwgNaam || properties.vrtNaam || "Naamloze vaarweg",
          routeName: properties.vrtNaam || "",
          line
        });
      }
    }
  }
  if (lines.length === 0) throw new Error("Er zijn geen NWB-vaarwegdelen buiten de dekking gevonden; de uitvoer is niet gewijzigd.");

  const output = {
    version: 1,
    source: "NWB Vaarwegen (PDOK WFS), CC0",
    generated: new Date().toISOString().slice(0, 10),
    coverageToleranceMeters,
    sampleSpacingMeters,
    lines
  };
  await writeFile(outputPath, `${JSON.stringify(output)}\n`);
  console.log(`${lines.length} niet-gedekte NWB-trajecten uit ${unmatchedWaterways.size} vaarwegvakken geschreven naar ${path.basename(outputPath)}.`);
}

main().catch(error => {
  console.error("NWB-vaarwegdekking opbouwen mislukt:", error);
  process.exitCode = 1;
});
