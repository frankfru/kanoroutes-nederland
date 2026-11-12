// Haalt mogelijke kanosteigers en overdraagpunten uit OSM voor heel Nederland.
// Gebruik: node scripts/build-canoe-landings.js
const { writeFile } = require("node:fs/promises");
const path = require("node:path");

const outputPath = path.join(__dirname, "..", "canoe-landings.json");
const portagesOutputPath = path.join(__dirname, "..", "canoe-portages-osm.json");
const endpoints = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];

const selectors = [
  '["waterway"="access_point"]["canoe"]["canoe"!="no"]',
  '["man_made"="pier"]["canoe"]["canoe"!="no"]',
  '["canoe"="portage"]'
];

function buildQuery() {
  const parts = selectors.flatMap(filter => ["node", "way", "relation"].map(type => `${type}${filter}(area.nl);`));
  return `[out:json][timeout:300];area["ISO3166-1"="NL"][admin_level=2]->.nl;(${parts.join("")});out center geom tags;`;
}

function matchedBy(tags) {
  const canoeAllowed = "canoe" in tags && tags.canoe !== "no";
  return [
    canoeAllowed && tags.waterway === "access_point" ? "access-point" : null,
    canoeAllowed && tags.man_made === "pier" ? "pier-canoe" : null,
    tags.canoe === "portage" ? "canoe-portage" : null
  ].filter(Boolean);
}

function distanceMeters([lon1, lat1], [lon2, lat2]) {
  const radians = Math.PI / 180;
  const latitudeDifference = (lat2 - lat1) * radians;
  const longitudeDifference = (lon2 - lon1) * radians;
  const a = Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin(longitudeDifference / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function selectCanoeLandings(features) {
  const landings = [];
  const portages = [];
  for (const feature of [...features].sort((a, b) => a.id.localeCompare(b.id))) {
    const { tags } = feature.properties;
    const matches = matchedBy(tags);
    if (matches.includes("access-point") || matches.includes("pier-canoe")) {
      landings.push({
        ...feature,
        properties: {
          ...feature.properties,
          matchedBy: matches,
          category: tags.canoe === "portage" ? "landing-portage" : "landing",
          portageSources: []
        }
      });
    } else if (tags.canoe === "portage") {
      portages.push({ ...feature, properties: { ...feature.properties, matchedBy: matches } });
    }
  }

  const remaining = [];
  for (const portage of portages) {
    const nearby = landings.filter(landing =>
      distanceMeters(portage.geometry.coordinates, landing.geometry.coordinates) <= 100
    );
    if (nearby.length === 0) {
      remaining.push(portage);
    } else {
      for (const landing of nearby) {
        landing.properties.category = "landing-portage";
        landing.properties.portageSources.push(portage.id);
      }
    }
  }

  const visited = new Set();
  const merged = [];
  for (let i = 0; i < remaining.length; i += 1) {
    if (visited.has(i)) continue;
    const group = [i];
    visited.add(i);
    for (let cursor = 0; cursor < group.length; cursor += 1) {
      for (let j = 0; j < remaining.length; j += 1) {
        if (!visited.has(j) && distanceMeters(
          remaining[group[cursor]].geometry.coordinates, remaining[j].geometry.coordinates
        ) <= 100) {
          visited.add(j);
          group.push(j);
        }
      }
    }
    const central = group.map(index => ({
      index,
      distance: group.reduce((sum, other) => sum + distanceMeters(
        remaining[index].geometry.coordinates, remaining[other].geometry.coordinates
      ), 0)
    })).sort((a, b) => a.distance - b.distance || remaining[a.index].id.localeCompare(remaining[b.index].id))[0];
    const representative = remaining[central.index];
    merged.push({
      ...representative,
      properties: {
        ...representative.properties,
        category: "portage",
        portageSources: group.map(index => remaining[index].id).filter(id => id !== representative.id).sort()
      }
    });
  }
  return [...landings, ...merged].sort((a, b) => a.id.localeCompare(b.id));
}

function elementGeometry(element) {
  const toCoordinate = point =>
    Number.isFinite(point?.lon) && Number.isFinite(point?.lat) ? [point.lon, point.lat] : null;
  if (element.type === "node") {
    const coordinate = toCoordinate(element);
    return coordinate ? { type: "Point", coordinates: coordinate } : null;
  }

  if (element.type === "way" && Array.isArray(element.geometry)) {
    const coordinates = element.geometry.map(toCoordinate);
    if (coordinates.length >= 2 && coordinates.every(Boolean)) {
      return { type: "LineString", coordinates };
    }
  }

  if (element.type === "relation" && Array.isArray(element.members)) {
    const lines = element.members
      .filter(member => Array.isArray(member.geometry))
      .map(member => member.geometry.map(toCoordinate))
      .filter(line => line.length >= 2 && line.every(Boolean));
    if (lines.length > 0) return { type: "MultiLineString", coordinates: lines };
  }

  return null;
}

function selectCanoePortages(elements) {
  return elements
    .filter(element => element.tags?.canoe === "portage")
    .map(element => ({
      type: "Feature",
      id: `${element.type}/${element.id}`,
      geometry: elementGeometry(element),
      properties: {
        osmType: element.type,
        osmId: element.id,
        tags: element.tags || {}
      }
    }));
}

function validateOverpassTimestamp(data, now = Date.now()) {
  const timestamp = data.osm3s?.timestamp_osm_base;
  const time = typeof timestamp === "string" ? Date.parse(timestamp) : NaN;
  if (!Number.isFinite(time)) throw new Error("Overpass geeft geen geldige OSM-datum");
  if (now - time > 24 * 60 * 60 * 1000) throw new Error(`Overpass-data is meer dan 24 uur oud (${timestamp})`);
}

async function fetchOverpass(query) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          body: new URLSearchParams({ data: query }),
          headers: { "User-Agent": "kanoroutes-nederland canoe landing builder" },
          signal: AbortSignal.timeout(300000)
        });
        if (!response.ok) throw new Error(`${endpoint}: HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.elements) || data.elements.length === 0) throw new Error(`${endpoint}: geen elementen`);
        if (data.remark) throw new Error(`${endpoint}: Overpass meldt ${data.remark}`);
        validateOverpassTimestamp(data);
        return data;
      } catch (error) {
        lastError = error;
        console.warn(`Overpass-server mislukt (${error.message}); volgende proberen.`);
      }
    }
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  throw lastError;
}

async function main() {
  const data = await fetchOverpass(buildQuery());
  const candidates = data.elements.map(element => {
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    const tags = element.tags || {};
    return {
      type: "Feature",
      id: `${element.type}/${element.id}`,
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: { osmType: element.type, osmId: element.id, matchedBy: matchedBy(tags), tags }
    };
  }).filter(feature => Number.isFinite(feature.geometry.coordinates[0]) && Number.isFinite(feature.geometry.coordinates[1]));
  const features = selectCanoeLandings(candidates);
  const portages = selectCanoePortages(data.elements);
  const generatedAt = new Date().toISOString();
  const source = "OpenStreetMap via Overpass API";
  const osmBaseTimestamp = data.osm3s?.timestamp_osm_base || null;

  const output = {
    type: "FeatureCollection",
    generatedAt,
    source,
    osmBaseTimestamp,
    selectionIncomplete: false,
    count: features.length,
    features
  };
  const portagesOutput = {
    type: "FeatureCollection",
    generatedAt,
    source,
    osmBaseTimestamp,
    count: portages.length,
    features: portages
  };
  await Promise.all([
    writeFile(outputPath, `${JSON.stringify(output, null, 1)}\n`),
    writeFile(portagesOutputPath, `${JSON.stringify(portagesOutput, null, 1)}\n`)
  ]);
  console.log(`${features.length} kanosteigerpunten opgeslagen in ${outputPath}`);
  console.log(`${portages.length} oorspronkelijke overdraagpunten opgeslagen in ${portagesOutputPath}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  buildQuery,
  elementGeometry,
  selectCanoeLandings,
  selectCanoePortages,
  validateOverpassTimestamp
};
