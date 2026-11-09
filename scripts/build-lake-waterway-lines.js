const { writeFile } = require("node:fs/promises");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const outputPath = path.join(projectRoot, "lake-waterway-lines.json");
const endpoints = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];
const provinces = ["NL-DR", "NL-FL", "NL-FR", "NL-GE", "NL-GR", "NL-LI", "NL-NB", "NL-NH", "NL-OV", "NL-UT", "NL-ZE", "NL-ZH"];

function buildQuery(province) {
  return `[out:json][timeout:300];
area["ISO3166-2"="${province}"]->.province;
(
  way(area.province)["natural"="water"]["water"~"^(lake|pond|reservoir|lagoon)$"];
  relation(area.province)["natural"="water"]["water"~"^(lake|pond|reservoir|lagoon)$"];
  way(area.province)["natural"="water"][!"water"];
  relation(area.province)["natural"="water"][!"water"];
  way(area.province)["landuse"="reservoir"];
  relation(area.province)["landuse"="reservoir"];
)->.lakes;
(
  way(area.province)["waterway"]["waterway"!~"^(canal|river)$"];
  way(area.province)["waterway"~"^(canal|river)$"]["access"="no"];
  way(area.province)["waterway"~"^(canal|river)$"]["boat"="no"];
  way(area.province)["waterway"~"^(canal|river)$"]["tunnel"="culvert"];
)->.waterways;
.lakes out geom;
.waterways out geom;`;
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
    const isLake = (tags.natural === "water" &&
      (!tags.water || /^(lake|pond|reservoir|lagoon)$/.test(tags.water))) ||
      tags.landuse === "reservoir";
    if (!isLake) continue;

    if (element.type === "way" && Array.isArray(element.geometry)) {
      const [outer] = joinRings([element.geometry]);
      if (outer) polygons.push({ outer, inner: [] });
    } else if (element.type === "relation" && Array.isArray(element.members)) {
      const outer = joinRings(element.members
        .filter(member => member.role === "outer")
        .map(member => member.geometry));
      const inner = joinRings(element.members
        .filter(member => member.role === "inner")
        .map(member => member.geometry));
      for (const ring of outer) polygons.push({ outer: ring, inner });
    }
  }
  return polygons;
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
  for (const [index, province] of provinces.entries()) {
    const data = await fetchOverpass(province);
    const lakes = indexLakePolygons(lakePolygons(data.elements));
    let candidates = 0;
    let matches = 0;
    for (const element of data.elements) {
      if (element.type !== "way" || element.id === undefined || !element.tags?.waterway ||
          !Array.isArray(element.geometry) || element.geometry.length < 2) continue;
      candidates += 1;
      const tags = element.tags;
      const isCovered = (tags.waterway === "canal" || tags.waterway === "river") &&
        tags.access !== "no" && tags.boat !== "no" && tags.tunnel !== "culvert";
      if (isCovered) continue;
      if (!lineTouchesLake(element.geometry, nearbyLakePolygons(element.geometry, lakes))) continue;
      matches += 1;
      const line = element.geometry.map(point => [round(point.lat), round(point.lon)]);
      uniqueLines.set(element.id, line);
    }
    console.log(`${province}: ${lakes.polygons.length} meerpolygonen, ${candidates} kandidaat-waterwegen, ${matches} op meren`);
    if (index < provinces.length - 1) await delay(1500);
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
  await writeFile(outputPath, JSON.stringify(output));
  console.log(`${lines.length} lijnstukken geschreven naar ${outputPath}`);
}

main().catch(error => {
  console.error("OSM-waterweglijnen op meren bouwen mislukt:", error);
  process.exitCode = 1;
});
