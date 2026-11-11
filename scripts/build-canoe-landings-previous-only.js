const { readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const currentPath = path.join(__dirname, "..", "canoe-landings.json");
const outputPath = path.join(__dirname, "..", "canoe-landings-previous-only.json");

function getPreviousOnly(previous, current) {
  if (previous?.type !== "FeatureCollection" || !Array.isArray(previous.features) ||
      previous.count !== previous.features.length) {
    throw new Error("Het vorige kanosteigerbestand is geen geldige FeatureCollection.");
  }
  if (current?.type !== "FeatureCollection" || !Array.isArray(current.features) ||
      current.count !== current.features.length) {
    throw new Error("Het huidige kanosteigerbestand is geen geldige FeatureCollection.");
  }
  const currentIds = new Set(current.features.map(feature => feature.id));
  return previous.features.filter(feature => !currentIds.has(feature.id));
}

async function main() {
  const previousPath = process.argv[2];
  if (!previousPath) {
    throw new Error("Gebruik: node scripts/build-canoe-landings-previous-only.js <vorig-canoe-landings.json>");
  }
  const [previous, current] = await Promise.all([
    readFile(path.resolve(previousPath), "utf8").then(JSON.parse),
    readFile(currentPath, "utf8").then(JSON.parse)
  ]);
  const features = getPreviousOnly(previous, current);
  const output = {
    type: "FeatureCollection",
    generatedAt: new Date().toISOString(),
    source: "OSM-elementen uit eerdere kanosteigerselectie, vergeleken op OSM-element-ID",
    comparison: {
      previousGeneratedAt: previous.generatedAt || null,
      previousOsmBaseTimestamp: previous.osmBaseTimestamp || null,
      currentGeneratedAt: current.generatedAt || null,
      currentOsmBaseTimestamp: current.osmBaseTimestamp || null,
      previousCount: previous.count,
      currentCount: current.count
    },
    count: features.length,
    features
  };
  await writeFile(outputPath, `${JSON.stringify(output, null, 1)}\n`);
  console.log(`${features.length} punten staan alleen in het vorige bestand (${outputPath})`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { getPreviousOnly };
