const { readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const outputPath = path.join(projectRoot, "lake-waterway-lines.json");
const candidateOutputPath = path.join(projectRoot, "waterway-coverage-candidates.json");
const wideWaterThresholdMeters = 50;
const minimumWideWaterLengthMeters = 100;
const wideWaterSampleSpacingMeters = 25;
const endpoints = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];
const provinces = ["NL-DR", "NL-FL", "NL-FR", "NL-GE", "NL-GR", "NL-LI", "NL-NB", "NL-NH", "NL-OV", "NL-UT", "NL-ZE", "NL-ZH"];
const requestedProvinces = process.argv.slice(2);
const provincesToBuild = requestedProvinces.length > 0 ? requestedProvinces : provinces;
const unknownProvinces = provincesToBuild.filter(province => !provinces.includes(province));
if (unknownProvinces.length > 0) {
  throw new Error(`Onbekende provinciecode(s): ${unknownProvinces.join(", ")}`);
}

function buildQuery(province) {
  return `[out:json][timeout:300];
area["ISO3166-2"="${province}"]->.province;
(
  way(area.province)["natural"="water"];
  relation(area.province)["natural"="water"];
  way(area.province)["landuse"="reservoir"];
  relation(area.province)["landuse"="reservoir"];
)->.waterAreas;
(
  way(area.province)["waterway"]["waterway"!~"^(canal|river)$"];
  way(area.province)["waterway"~"^(canal|river)$"]["access"="no"];
  way(area.province)["waterway"~"^(canal|river)$"]["boat"="no"];
  way(area.province)["waterway"~"^(canal|river)$"]["tunnel"="culvert"];
)->.waterways;
(
  way(area.province)["waterway"~"^(canal|river)$"];
)->.covered;
.waterAreas out geom;
.waterways out body geom;
.covered out body;`;
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function samePoint(a, b) {
  return Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lon - b.lon) < 1e-7;
}

function joinRings(segments) {
  const pending = segments
    .filter(segment => Array.isArray(segment) && segment.length >= 2)
    .map(segment => [...segment]);
  const rings = [];

  while (pending.length > 0) {
    const ring = pending.shift();
    while (!samePoint(ring[0], ring[ring.length - 1])) {
      const last = ring[ring.length - 1];
      const first = ring[0];
      const nextIndex = pending.findIndex(segment =>
        samePoint(segment[0], last) || samePoint(segment[segment.length - 1], last) ||
        samePoint(segment[0], first) || samePoint(segment[segment.length - 1], first));
      if (nextIndex === -1) break;

      let next = pending.splice(nextIndex, 1)[0];
      if (samePoint(next[0], last)) {
        ring.push(...next.slice(1));
      } else if (samePoint(next[next.length - 1], last)) {
        next.reverse();
        ring.push(...next.slice(1));
      } else if (samePoint(next[next.length - 1], first)) {
        ring.unshift(...next.slice(0, -1));
      } else {
        next.reverse();
        ring.unshift(...next.slice(1));
      }
    }
    if (ring.length >= 4 && samePoint(ring[0], ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

function lakePolygons(elements) {
  const polygons = [];
  for (const element of elements) {
    const tags = element.tags || {};
    if (!isWaterArea(tags)) continue;

    if (element.type === "way" && Array.isArray(element.geometry)) {
      const [outer] = joinRings([element.geometry]);
      if (outer) polygons.push({ outer, inner: [], tags });
    } else if (element.type === "relation" && Array.isArray(element.members)) {
      const outer = joinRings(element.members
        .filter(member => member.role === "outer")
        .map(member => member.geometry));
      const inner = joinRings(element.members
        .filter(member => member.role === "inner")
        .map(member => member.geometry));
      for (const ring of outer) polygons.push({ outer: ring, inner, tags });
    }
  }
  return polygons;
}

function isWaterArea(tags) {
  return tags.natural === "water" || tags.landuse === "reservoir";
}

function isLakeArea(tags) {
  return (tags.natural === "water" &&
    (!tags.water || /^(lake|pond|reservoir|lagoon)$/.test(tags.water))) ||
    tags.landuse === "reservoir";
}

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    const crosses = (a.lat > point.lat) !== (b.lat > point.lat) &&
      point.lon < (b.lon - a.lon) * (point.lat - a.lat) / (b.lat - a.lat) + a.lon;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInLake(point, polygon) {
  return pointInRing(point, polygon.outer) &&
    !polygon.inner.some(ring => pointInRing(point, ring));
}

function boundsOf(points) {
  return points.reduce((bounds, point) => ({
    minLat: Math.min(bounds.minLat, point.lat),
    maxLat: Math.max(bounds.maxLat, point.lat),
    minLon: Math.min(bounds.minLon, point.lon),
    maxLon: Math.max(bounds.maxLon, point.lon)
  }), {
    minLat: Infinity,
    maxLat: -Infinity,
    minLon: Infinity,
    maxLon: -Infinity
  });
}

function cellRange(bounds) {
  const cellSize = 0.1;
  return {
    minLat: Math.floor(bounds.minLat / cellSize),
    maxLat: Math.floor(bounds.maxLat / cellSize),
    minLon: Math.floor(bounds.minLon / cellSize),
    maxLon: Math.floor(bounds.maxLon / cellSize)
  };
}

function indexLakePolygons(polygons) {
  const cells = new Map();
  for (const [index, polygon] of polygons.entries()) {
    polygon.bounds = boundsOf(polygon.outer);
    const range = cellRange(polygon.bounds);
    for (let lat = range.minLat; lat <= range.maxLat; lat += 1) {
      for (let lon = range.minLon; lon <= range.maxLon; lon += 1) {
        const key = `${lat}:${lon}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(index);
      }
    }
  }
  return { cells, polygons };
}

function filterPolygons(polygons, predicate) {
  return indexLakePolygons(polygons.polygons.filter(polygon => predicate(polygon.tags)));
}

function nearbyLakePolygons(line, index) {
  const range = cellRange(boundsOf(line));
  const nearby = new Set();
  for (let lat = range.minLat; lat <= range.maxLat; lat += 1) {
    for (let lon = range.minLon; lon <= range.maxLon; lon += 1) {
      for (const polygonIndex of index.cells.get(`${lat}:${lon}`) || []) nearby.add(polygonIndex);
    }
  }
  return [...nearby].map(polygonIndex => index.polygons[polygonIndex]);
}

function bothEndpointsShareCoverageNodes(way, coverageNodeIds) {
  return Array.isArray(way.nodes) && way.nodes.length >= 2 &&
    coverageNodeIds.has(way.nodes[0]) &&
    coverageNodeIds.has(way.nodes[way.nodes.length - 1]);
}

function parseWidthMeters(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d+(?:[.,]\d+)?)\s*(m|meter|meters|km)?$/i);
  if (!match) return null;
  const width = Number(match[1].replace(",", "."));
  return match[2]?.toLowerCase() === "km" ? width * 1000 : width;
}

function crossProduct(a, b) {
  return a[0] * b[1] - a[1] * b[0];
}

function distanceMeters(start, end) {
  const latitude = (start.lat + end.lat) / 2 * Math.PI / 180;
  const dx = (end.lon - start.lon) * 111320 * Math.cos(latitude);
  const dy = (end.lat - start.lat) * 110540;
  return Math.hypot(dx, dy);
}

function interpolatePoint(start, end, fraction) {
  return {
    lat: start.lat + (end.lat - start.lat) * fraction,
    lon: start.lon + (end.lon - start.lon) * fraction
  };
}

function localMeters(point, origin) {
  const latitude = origin.lat * Math.PI / 180;
  return [
    (point.lon - origin.lon) * 111320 * Math.cos(latitude),
    (point.lat - origin.lat) * 110540
  ];
}

function waterWidthAt(point, direction, polygon) {
  const dx = (direction.end.lon - direction.start.lon) * 111320 *
    Math.cos(point.lat * Math.PI / 180);
  const dy = (direction.end.lat - direction.start.lat) * 110540;
  const length = Math.hypot(dx, dy);
  if (length === 0) return 0;
  const normal = [-dy / length, dx / length];
  const intersections = [-25000, 25000];

  for (const ring of [polygon.outer, ...polygon.inner]) {
    for (let index = 1; index < ring.length; index += 1) {
      const a = localMeters(ring[index - 1], point);
      const b = localMeters(ring[index], point);
      const edge = [b[0] - a[0], b[1] - a[1]];
      const denominator = crossProduct(normal, edge);
      if (Math.abs(denominator) < 1e-9) continue;
      const distance = crossProduct(a, edge) / denominator;
      const edgePosition = crossProduct(a, normal) / denominator;
      if (edgePosition >= 0 && edgePosition <= 1 && distance > -25000 && distance < 25000) {
        intersections.push(distance);
      }
    }
  }

  intersections.sort((a, b) => a - b);
  for (let index = 1; index < intersections.length; index += 1) {
    const start = intersections[index - 1];
    const end = intersections[index];
    if (start > 0 || end < 0) continue;
    const middle = (start + end) / 2;
    const sample = {
      lat: point.lat + normal[1] * middle / 110540,
      lon: point.lon + normal[0] * middle /
        (111320 * Math.cos(point.lat * Math.PI / 180))
    };
    if (pointInLake(sample, polygon)) return end - start;
  }
  return 0;
}

function lineCrossesWideWater(line, polygons) {
  let continuousWideLength = 0;
  for (let index = 1; index < line.length; index += 1) {
    const start = line[index - 1];
    const end = line[index];
    const segmentLength = distanceMeters(start, end);
    if (segmentLength === 0) continue;
    const sampleCount = Math.ceil(segmentLength / wideWaterSampleSpacingMeters);
    const sampleLength = segmentLength / sampleCount;
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const midpoint = interpolatePoint(start, end, (sampleIndex + 0.5) / sampleCount);
      const isWide = nearbyLakePolygons([midpoint], polygons).some(polygon =>
        pointInLake(midpoint, polygon) &&
        waterWidthAt(midpoint, { start, end }, polygon) >= wideWaterThresholdMeters);
      if (!isWide) {
        continuousWideLength = 0;
        continue;
      }
      continuousWideLength += sampleLength;
      if (continuousWideLength >= minimumWideWaterLengthMeters) return true;
    }
  }
  return false;
}

function segmentsIntersect(a, b, c, d) {
  const orient = (p, q, r) =>
    (q.lon - p.lon) * (r.lat - p.lat) - (q.lat - p.lat) * (r.lon - p.lon);
  const onSegment = (p, q, r) =>
    q.lon >= Math.min(p.lon, r.lon) && q.lon <= Math.max(p.lon, r.lon) &&
    q.lat >= Math.min(p.lat, r.lat) && q.lat <= Math.max(p.lat, r.lat);
  const abC = orient(a, b, c);
  const abD = orient(a, b, d);
  const cdA = orient(c, d, a);
  const cdB = orient(c, d, b);
  if (((abC < 0 && abD > 0) || (abC > 0 && abD < 0)) &&
      ((cdA < 0 && cdB > 0) || (cdA > 0 && cdB < 0))) return true;
  return (abC === 0 && onSegment(a, c, b)) ||
    (abD === 0 && onSegment(a, d, b)) ||
    (cdA === 0 && onSegment(c, a, d)) ||
    (cdB === 0 && onSegment(c, b, d));
}

function lineTouchesLake(line, polygons) {
  return polygons.some(polygon => {
    if (line.some(point => pointInLake(point, polygon))) return true;
    for (let index = 1; index < line.length; index += 1) {
      const start = line[index - 1];
      const end = line[index];
      const midpoint = { lat: (start.lat + end.lat) / 2, lon: (start.lon + end.lon) / 2 };
      if (pointInLake(midpoint, polygon)) return true;
      for (let ringIndex = 1; ringIndex < polygon.outer.length; ringIndex += 1) {
        if (segmentsIntersect(start, end, polygon.outer[ringIndex - 1], polygon.outer[ringIndex])) return true;
      }
    }
    return false;
  });
}

async function fetchOverpass(province) {
  const query = buildQuery(province);
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          body: new URLSearchParams({ data: query }),
          headers: { "User-Agent": "kanoroutes-dinsdaggers lake waterway overlay builder" },
          signal: AbortSignal.timeout(300000)
        });
        if (!response.ok) throw new Error(`${endpoint}: HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.elements)) throw new Error(`${endpoint}: ongeldige OSM-data`);
        if (data.elements.length === 0) throw new Error(`${endpoint}: geen OSM-elementen teruggegeven`);
        if (data.remark) throw new Error(`${endpoint}: Overpass meldt ${data.remark}`);
        return data;
      } catch (error) {
        lastError = error;
        console.warn(`${province}: Overpass-server mislukt (${error.message}); volgende proberen.`);
      }
    }
    if (attempt < 2) await delay(10000);
  }
  throw lastError;
}

async function main() {
  const round = value => Number(value.toFixed(5));
  const uniqueLines = new Map();
  const candidateMap = new Map();
  if (requestedProvinces.length > 0) {
    const previousLakes = JSON.parse(await readFile(outputPath, "utf8"));
    const previousCandidates = JSON.parse(await readFile(candidateOutputPath, "utf8"));
    for (const line of previousLakes.lines) uniqueLines.set(JSON.stringify(line), line);
    for (const candidate of previousCandidates.lines) candidateMap.set(candidate.id, candidate);
  }
  for (const [index, province] of provincesToBuild.entries()) {
    const data = await fetchOverpass(province);
    const waterAreas = indexLakePolygons(lakePolygons(data.elements));
    const lakes = filterPolygons(waterAreas, isLakeArea);
    const coverageNodeIds = new Set();
    for (const element of data.elements) {
      const tags = element.tags || {};
      if (element.type === "way" &&
          (tags.waterway === "canal" || tags.waterway === "river") &&
          tags.access !== "no" && tags.boat !== "no" && tags.tunnel !== "culvert" &&
          Array.isArray(element.nodes)) {
        for (const nodeId of element.nodes) coverageNodeIds.add(nodeId);
      }
    }
    let candidateCount = 0;
    let lakeMatches = 0;
    let coverageMatches = 0;
    for (const element of data.elements) {
      if (element.type !== "way" || element.id === undefined || !element.tags?.waterway ||
          !Array.isArray(element.geometry) || element.geometry.length < 2) continue;
      const wayTags = element.tags;
      if (wayTags.area === "yes" || wayTags.natural === "water") continue;
      const isForbidden = wayTags.access === "no" || wayTags.boat === "no" || wayTags.tunnel === "culvert";
      const isCovered = (wayTags.waterway === "canal" || wayTags.waterway === "river") && !isForbidden;
      const line = element.geometry;
      if (!isCovered && lineTouchesLake(line, nearbyLakePolygons(line, lakes))) {
        const coordinates = line.map(point => [round(point.lat), round(point.lon)]);
        uniqueLines.set(JSON.stringify(coordinates), coordinates);
        lakeMatches += 1;
      }
      if (isCovered || isForbidden) continue;
      candidateCount += 1;

      const connects = bothEndpointsShareCoverageNodes(element, coverageNodeIds);
      const parsedWidth = parseWidthMeters(wayTags.width);
      const hasWidthTag = parsedWidth !== null && parsedWidth >= wideWaterThresholdMeters;
      const isDrainageDitch = wayTags.waterway === "ditch" || wayTags.waterway === "drain";
      const isWide = !isDrainageDitch &&
        (hasWidthTag || lineCrossesWideWater(line, waterAreas));
      if (!connects && !isWide) continue;
      const reason = connects && isWide ? "both" : connects ? "connected" : "wide-water";
      const coordinates = line.map(point => [round(point.lat), round(point.lon)]);
      candidateMap.set(element.id, { id: element.id, line: coordinates, reason });
      coverageMatches += 1;
    }
    console.log(`${province}: ${waterAreas.polygons.length} waterpolygonen, ${candidateCount} niet-uitgesloten kandidaat-waterwegen, ${lakeMatches} op meren, ${coverageMatches} voor dekking`);
    if (index < provincesToBuild.length - 1) await delay(1500);
  }

  if (uniqueLines.size === 0) {
    throw new Error("Er zijn geen niet-opgenomen waterweglijnen op meren gevonden; het bestaande bestand is niet gewijzigd.");
  }

  const lines = [...uniqueLines.values()];
  const outsideNetherlands = lines.some(line => line.some(([latitude, longitude]) =>
    latitude < 49.5 || latitude > 54.5 || longitude < 2 || longitude > 8.5));
  if (outsideNetherlands) {
    throw new Error("De Overpass-selectie bevat coördinaten buiten Nederland; het bestaande bestand is niet gewijzigd.");
  }
  const output = {
    version: 1,
    source: "OpenStreetMap-waterwegen en meren, © OpenStreetMap-bijdragers, ODbL",
    generated: new Date().toISOString().slice(0, 10),
    lines
  };
  if (candidateMap.size === 0) {
    throw new Error("Er zijn geen kandidaten voor de vaarwegdekking gevonden; het bestaande kandidaatbestand is niet gewijzigd.");
  }
  const candidateLines = [...candidateMap.values()];
  const candidatesOutsideNetherlands = candidateLines.some(candidate =>
    candidate.line.some(([latitude, longitude]) =>
      latitude < 49.5 || latitude > 54.5 || longitude < 2 || longitude > 8.5));
  if (candidatesOutsideNetherlands) {
    throw new Error("De Overpass-selectie voor de kandidaat-overlay bevat coördinaten buiten Nederland; het bestaande kandidaatbestand is niet gewijzigd.");
  }
  const candidateOutput = {
    version: 1,
    source: "OpenStreetMap-waterwegen en wateroppervlakken, © OpenStreetMap-bijdragers, ODbL",
    generated: output.generated,
    widthThresholdMeters: wideWaterThresholdMeters,
    minimumWideWaterLengthMeters,
    connectionMethod: "beide eindknooppunten delen een OSM-node met de bestaande dekking",
    lines: candidateLines
  };
  await writeFile(outputPath, JSON.stringify(output));
  console.log(`${lines.length} lijnstukken geschreven naar ${outputPath}`);
  await writeFile(candidateOutputPath, JSON.stringify(candidateOutput));
  console.log(`${candidateLines.length} kandidaten geschreven naar ${candidateOutputPath}`);
}

main().catch(error => {
  console.error("OSM-waterweglijnen op meren bouwen mislukt:", error);
  process.exitCode = 1;
});
