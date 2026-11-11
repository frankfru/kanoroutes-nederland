// Haalt kano-instap/uitstapplekken (kanosteigers) uit OSM voor heel Nederland, inclusief alle tags.
// Gebruik: node scripts/build-canoe-landings.js
const { writeFile } = require("node:fs/promises");
const path = require("node:path");

const outputPath = path.join(__dirname, "..", "canoe-landings.json");
const endpoints = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];

// Bewust ruim geselecteerd; fijnslijpen kan later op basis van de tags en "matchedBy".
const selectors = [
  // Waterlopen zelf (canoe=yes op kanalen e.d.) zijn geen steigers en worden uitgesloten.
  { name: "canoe-tag", filter: '["canoe"]["canoe"!="no"]["waterway"!~"^(canal|river|ditch|stream|drain|fairway|link|tidal_channel|flowline)$"]' },
  { name: "canoe-yes-access", filter: '["canoe:access"]["waterway"!~"^(canal|river|ditch|stream|drain|fairway|link|tidal_channel|flowline)$"]' },
  { name: "slipway-canoe", filter: '["leisure"="slipway"]["canoe"~"yes|put_in|launch"]' },
  { name: "access-point", filter: '["waterway"="access_point"]' },
  { name: "canoe-rental", filter: '["amenity"="boat_rental"]["canoe"="yes"]' },
  { name: "name-kano", filter: '["name"~"kano|kajak|canoe|kayak",i]["man_made"~"pier|slipway"]' },
  { name: "pier-canoe", filter: '["man_made"="pier"]["canoe"]' }
];

function buildQuery() {
  const parts = selectors.flatMap(({ filter }) => ["node", "way", "relation"].map(type => `${type}${filter}(area.nl);`));
  return `[out:json][timeout:300];area["ISO3166-1"="NL"][admin_level=2]->.nl;(${parts.join("")});out center tags;`;
}

function matchedBy(tags) {
  const checks = {
    "canoe-tag": tags.canoe !== undefined && tags.canoe !== "no",
    "canoe-yes-access": "canoe:access" in tags,
    "slipway-canoe": tags.leisure === "slipway" && /^(yes|put_in|launch)$/.test(tags.canoe || ""),
    "access-point": tags.waterway === "access_point",
    "canoe-rental": tags.amenity === "boat_rental" && tags.canoe === "yes",
    "name-kano": /kano|kajak|canoe|kayak/i.test(tags.name || "") && /^(pier|slipway)$/.test(tags.man_made || ""),
    "pier-canoe": tags.man_made === "pier" && "canoe" in tags
  };
  return Object.keys(checks).filter(key => checks[key]);
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
  const features = data.elements.map(element => {
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    const tags = element.tags || {};
    return {
      type: "Feature",
      id: `${element.type}/${element.id}`,
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: { osmType: element.type, osmId: element.id, matchedBy: matchedBy(tags), tags }
    };
  }).filter(feature => Number.isFinite(feature.geometry.coordinates[0]) && Number.isFinite(feature.geometry.coordinates[1]))
    .sort((a, b) => a.id.localeCompare(b.id));

  const output = {
    type: "FeatureCollection",
    generatedAt: new Date().toISOString(),
    source: "OpenStreetMap via Overpass API",
    osmBaseTimestamp: data.osm3s?.timestamp_osm_base || null,
    count: features.length,
    features
  };
  await writeFile(outputPath, `${JSON.stringify(output, null, 1)}\n`);
  console.log(`${features.length} elementen opgeslagen in ${outputPath}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
