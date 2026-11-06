const { readFile, readdir, writeFile } = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const gpxDirectory = path.resolve(
  process.env.KAYAK_GPX_DIRECTORY || "D:\\Dinsdaggers\\whatsapp"
);
const outputFile = path.join(root, "kayak-heatmap-data.json");
const latitudeCellSize = 0.00025;
const longitudeCellSize = 0.0004;
const maxInterpolatedGapMeters = 500;

function getAttribute(attributes, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escapedName}\\s*=\\s*["']([^"']+)["']`, "i").exec(attributes)?.[1];
}

function parsePoints(xml, tagName) {
  const points = [];
  const pointPattern = new RegExp(`<${tagName}\\b([^>]*)>`, "gi");

  for (const match of xml.matchAll(pointPattern)) {
    const latitudeValue = getAttribute(match[1], "lat");
    const longitudeValue = getAttribute(match[1], "lon");
    const latitude = Number(latitudeValue);
    const longitude = Number(longitudeValue);
    if (!latitudeValue || !longitudeValue || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new Error("GPX contains an invalid GPS point");
    }
    points.push([latitude, longitude]);
  }

  return points;
}

function getRecordingSegments(xml, fileName) {
  const segments = [...xml.matchAll(/<trkseg\b[^>]*>([\s\S]*?)<\/trkseg>/gi)]
    .map(match => parsePoints(match[1], "trkpt"))
    .filter(segment => segment.length > 0);

  if (segments.length > 0) return segments;

  const trackPoints = parsePoints(xml, "trkpt");
  if (trackPoints.length > 0) return [trackPoints];

  const routePoints = parsePoints(xml, "rtept");
  if (routePoints.length > 0) return [routePoints];

  throw new Error(`${fileName} contains no usable GPS points`);
}

function parseCatalogRoutes(source) {
  const match = /^window\.GPX_ROUTES_NOORD_HOLLAND\s*=\s*(\[[\s\S]*\]);?\s*$/.exec(source);
  if (!match) {
    throw new Error("Could not parse route catalog from routes-noord-holland-data.js");
  }

  const routes = JSON.parse(match[1]);
  if (!Array.isArray(routes) || routes.length === 0) {
    throw new Error("Route catalog is empty");
  }
  return routes;
}

function addSequenceToCells(points, cells) {
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (index === 0) addCell(point[0], point[1], cells);

    const nextPoint = points[index + 1];
    if (!nextPoint) continue;

    const meanLatitude = (point[0] + nextPoint[0]) / 2 * Math.PI / 180;
    const latitudeMeters = (nextPoint[0] - point[0]) * 111320;
    const longitudeMeters = (nextPoint[1] - point[1]) * 111320 * Math.cos(meanLatitude);
    const distanceMeters = Math.hypot(latitudeMeters, longitudeMeters);
    const steps = distanceMeters > maxInterpolatedGapMeters
      ? 1
      : Math.max(1, Math.ceil(distanceMeters / 15));

    for (let step = 0; step <= steps; step += 1) {
      const fraction = step / steps;
      addCell(
        point[0] + (nextPoint[0] - point[0]) * fraction,
        point[1] + (nextPoint[1] - point[1]) * fraction,
        cells
      );
    }
  }
}

function addCell(latitude, longitude, cells) {
  const latitudeIndex = Math.floor(latitude / latitudeCellSize);
  const longitudeIndex = Math.floor(longitude / longitudeCellSize);
  cells.add(`${latitudeIndex},${longitudeIndex}`);
}

function addRouteToDensity(segments, density) {
  const routeCells = new Set();
  for (const segment of segments) {
    if (Array.isArray(segment) && segment.length > 0) {
      addSequenceToCells(segment, routeCells);
    }
  }

  if (routeCells.size === 0) return false;
  for (const cell of routeCells) {
    density.set(cell, (density.get(cell) || 0) + 1);
  }
  return true;
}

function buildPoints(density) {
  return [...density].map(([cell, weight]) => {
    const [latitudeIndex, longitudeIndex] = cell.split(",").map(Number);
    return [
      Number(((latitudeIndex + 0.5) * latitudeCellSize).toFixed(6)),
      Number(((longitudeIndex + 0.5) * longitudeCellSize).toFixed(6)),
      weight
    ];
  });
}

async function main() {
  const catalogSource = await readFile(path.join(root, "routes-noord-holland-data.js"), "utf8");
  const routes = parseCatalogRoutes(catalogSource);
  const recordingFiles = (await readdir(gpxDirectory, { withFileTypes: true }))
    .filter(entry => entry.isFile() && /\.gpx$/i.test(entry.name))
    .sort((first, second) => first.name.localeCompare(second.name));
  if (recordingFiles.length === 0) {
    throw new Error(`No GPX files found in ${gpxDirectory}`);
  }

  const density = new Map();
  let routeCount = 0;
  for (const route of routes) {
    if (addRouteToDensity(route.segments || [], density)) routeCount += 1;
  }

  for (const file of recordingFiles) {
    const xml = await readFile(path.join(gpxDirectory, file.name), "utf8");
    if (!addRouteToDensity(getRecordingSegments(xml, file.name), density)) {
      throw new Error(`${file.name} contains no usable GPS points`);
    }
  }

  const output = {
    version: 1,
    cellSizeMeters: 25,
    routeCount,
    recordingCount: recordingFiles.length,
    points: buildPoints(density)
  };
  await writeFile(outputFile, `${JSON.stringify(output)}\n`, "utf8");
  const bytes = Buffer.byteLength(JSON.stringify(output));
  console.log(
    `Built ${output.points.length.toLocaleString("en-US")} aggregated cells from ` +
    `${routeCount} catalog routes and ${recordingFiles.length} local GPX recordings ` +
    `(${(bytes / 1024).toFixed(1)} KB): ${outputFile}`
  );
}

main().catch(error => {
  console.error("Failed to build kayak heatmap:", error);
  process.exitCode = 1;
});
