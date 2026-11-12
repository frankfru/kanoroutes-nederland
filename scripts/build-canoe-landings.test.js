const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildQuery,
  elementGeometry,
  selectCanoeLandings,
  selectCanoePortages,
  validateOverpassTimestamp
} = require("./build-canoe-landings.js");

function feature(id, metersNorth, tags) {
  return {
    id,
    geometry: { type: "Point", coordinates: [0, metersNorth / 6371000 * 180 / Math.PI] },
    properties: { tags }
  };
}

test("selects only canoe-enabled piers and access points, and other portages", () => {
  const features = [
    feature("node/1", 0, { waterway: "access_point", canoe: "yes" }),
    feature("node/2", 1000, { man_made: "pier", canoe: "put_in" }),
    feature("node/3", 2000, { man_made: "pier", canoe: "portage" }),
    feature("node/4", 3000, { canoe: "portage", highway: "path" }),
    feature("node/5", 4000, { man_made: "pier", canoe: "no" }),
    feature("node/6", 5000, { waterway: "access_point" }),
    feature("node/7", 6000, { leisure: "slipway", canoe: "yes" }),
    feature("node/8", 7000, { "canoe:access": "yes" })
  ];
  assert.deepEqual(selectCanoeLandings(features).map(f => [f.id, f.properties.category]), [
    ["node/1", "landing"], ["node/2", "landing"], ["node/3", "landing-portage"], ["node/4", "portage"]
  ]);
  const query = buildQuery();
  for (const selector of [
    '["waterway"="access_point"]["canoe"]["canoe"!="no"]',
    '["man_made"="pier"]["canoe"]["canoe"!="no"]',
    '["canoe"="portage"]'
  ]) {
    for (const type of ["node", "way", "relation"]) assert.ok(query.includes(`${type}${selector}(area.nl);`));
  }
  assert.ok(query.includes("out center geom tags;"));
});

test("keeps raw portage node and way geometries separately from landing selection", () => {
  const elements = [
    { type: "node", id: 1, lat: 52, lon: 5, tags: { canoe: "portage" } },
    {
      type: "way",
      id: 2,
      geometry: [{ lat: 52, lon: 5 }, { lat: 52.001, lon: 5.001 }],
      tags: { canoe: "portage" }
    },
    { type: "way", id: 3, center: { lat: 52.1, lon: 5.1 }, tags: { canoe: "yes" } }
  ];

  assert.deepEqual(selectCanoePortages(elements), [
    {
      type: "Feature",
      id: "node/1",
      geometry: { type: "Point", coordinates: [5, 52] },
      properties: { osmType: "node", osmId: 1, tags: { canoe: "portage" } }
    },
    {
      type: "Feature",
      id: "way/2",
      geometry: { type: "LineString", coordinates: [[5, 52], [5.001, 52.001]] },
      properties: { osmType: "way", osmId: 2, tags: { canoe: "portage" } }
    }
  ]);
  assert.deepEqual(elementGeometry({
    type: "relation",
    members: [{ geometry: [{ lat: 52, lon: 5 }, { lat: 52.1, lon: 5.1 }] }]
  }), { type: "MultiLineString", coordinates: [[[5, 52], [5.1, 52.1]]] });
});

test("selects a point with only canoe=portage as a portage", () => {
  const tags = { canoe: "portage" };
  const result = selectCanoeLandings([feature("node/1", 0, tags)]);
  assert.equal(result.length, 1);
  assert.equal(result[0].properties.category, "portage");
  assert.deepEqual(result[0].properties.matchedBy, ["canoe-portage"]);
  assert.deepEqual(result[0].properties.tags, tags);
});

test("associates portages up to 100 meters away with every nearby landing without changing OSM tags", () => {
  const features = [
    feature("node/1", 0, { waterway: "access_point", canoe: "yes" }),
    feature("node/2", 20, { man_made: "pier", canoe: "put_in" }),
    feature("node/3", 100, { canoe: "portage" }),
    feature("node/4", 201, { canoe: "portage" }),
    feature("node/5", 1000, { man_made: "pier", canoe: "portage" })
  ];
  const result = selectCanoeLandings(features);
  assert.deepEqual(result.map(f => [f.id, f.properties.category, f.properties.portageSources]), [
    ["node/1", "landing-portage", ["node/3"]],
    ["node/2", "landing-portage", ["node/3"]],
    ["node/4", "portage", []],
    ["node/5", "landing-portage", []]
  ]);
  assert.equal(result[0].properties.tags.canoe, "yes");
  assert.deepEqual(features[0].properties, { tags: { waterway: "access_point", canoe: "yes" } });
});

test("clusters chains transitively and retains the most central existing point", () => {
  const features = [
    feature("node/1", 0, { canoe: "portage" }),
    feature("node/2", 90, { canoe: "portage" }),
    feature("node/3", 180, { canoe: "portage" }),
    feature("node/4", 280.1, { canoe: "portage" })
  ];
  const result = selectCanoeLandings(features);
  assert.deepEqual(result.map(f => [f.id, f.properties.portageSources]), [
    ["node/2", ["node/1", "node/3"]], ["node/4", []]
  ]);
  assert.deepEqual(selectCanoeLandings([...features].reverse()), result);
});

test("uses a deterministic id tie-breaker and handles an empty selection", () => {
  const features = [
    feature("node/2", 0, { canoe: "portage" }),
    feature("node/1", 100, { canoe: "portage" })
  ];
  const result = selectCanoeLandings(features);
  assert.deepEqual(result.map(f => [f.id, f.properties.portageSources]), [["node/1", ["node/2"]]]);
  assert.deepEqual(selectCanoeLandings([]), []);
});

test("rejects stale or missing OSM timestamps", () => {
  const now = Date.parse("2026-11-11T12:00:00Z");
  assert.doesNotThrow(() => validateOverpassTimestamp({ osm3s: { timestamp_osm_base: "2026-11-10T12:00:00Z" } }, now));
  assert.throws(() => validateOverpassTimestamp({ osm3s: { timestamp_osm_base: "2026-11-10T11:59:59Z" } }, now), /meer dan 24 uur oud/);
  assert.throws(() => validateOverpassTimestamp({}, now), /geen geldige OSM-datum/);
});
