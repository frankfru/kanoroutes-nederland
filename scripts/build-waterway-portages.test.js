const test = require("node:test");
const assert = require("node:assert/strict");
const { buildWaterwayPortages } = require("./build-waterway-portages.js");

function network(lines) {
  const nodes = [];
  const ways = lines.map(line => line.map(([latitude, longitude]) => {
    const index = nodes.length / 2;
    nodes.push(latitude, longitude);
    return index;
  }));
  return { version: 1, generated: "2026-11-11", nodes, ways };
}

function pointFeature(id, latitude, longitude) {
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    properties: { osmType: "node", osmId: Number(id.split("/")[1]), tags: { canoe: "portage" } }
  };
}

test("projects both ends of a portage way onto waterway segments without changing the network", () => {
  const waterways = network([
    [[52, 5], [52, 5.001]],
    [[52.001, 5], [52.001, 5.001]]
  ]);
  const originalWays = structuredClone(waterways.ways);
  const portages = {
    type: "FeatureCollection",
    osmBaseTimestamp: "2026-11-11T12:00:00Z",
    features: [{
      type: "Feature",
      id: "way/10",
      geometry: {
        type: "LineString",
        coordinates: [[5.0005, 52.0001], [5.0005, 52.0009]]
      },
      properties: { osmType: "way", osmId: 10 }
    }]
  };

  const result = buildWaterwayPortages(portages, waterways, "2026-11-11T13:00:00Z");
  assert.equal(result.connectionCount, 1);
  assert.equal(result.unresolvedCount, 0);
  assert.equal(result.waterwayGenerated, waterways.generated);
  assert.ok(result.connections[0].lengthMeters > 80);
  assert.ok(result.connections[0].lengthMeters < 130);
  assert.deepEqual(result.connections[0].line[0], [52, 5.0005]);
  assert.deepEqual(result.connections[0].line.at(-1), [52.001, 5.0005]);
  assert.deepEqual(waterways.ways, originalWays);
});

test("connects an unambiguous point portage and leaves an ambiguous one unresolved", () => {
  const waterways = network([
    [[52, 5], [52, 5.001]],
    [[52.001, 5], [52.001, 5.001]],
    [[52.0005, 5.01], [52.0005, 5.011]]
  ]);
  const portages = {
    type: "FeatureCollection",
    features: [
      pointFeature("node/1", 52.0005, 5.0005),
      pointFeature("node/2", 52.0005, 5.0105)
    ]
  };

  const result = buildWaterwayPortages(portages, waterways, "2026-11-11T13:00:00Z");
  assert.equal(result.connectionCount, 1);
  assert.equal(result.unresolvedCount, 1);
  assert.equal(result.connections[0].id, "node/1");
  assert.equal(result.unresolved[0].id, "node/2");
  assert.equal(result.unresolved[0].reason, "fewer-than-two-waterway-matches");
});

test("does not guess between more than two nearby waterways", () => {
  const waterways = network([
    [[52, 5], [52, 5.001]],
    [[52.0005, 5], [52.0005, 5.001]],
    [[52.001, 5], [52.001, 5.001]]
  ]);
  const result = buildWaterwayPortages({
    type: "FeatureCollection",
    features: [pointFeature("node/3", 52.0005, 5.0005)]
  }, waterways, "2026-11-11T13:00:00Z");

  assert.equal(result.connectionCount, 0);
  assert.equal(result.unresolved[0].reason, "ambiguous-waterway-matches");
});
