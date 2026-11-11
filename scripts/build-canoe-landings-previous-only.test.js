const test = require("node:test");
const assert = require("node:assert/strict");
const { getPreviousOnly } = require("./build-canoe-landings-previous-only.js");

function collection(features) {
  return { type: "FeatureCollection", count: features.length, features };
}

test("returns only old features whose OSM element IDs are absent from current data", () => {
  const oldFeature = { id: "node/1" };
  const sharedFeature = { id: "way/2" };
  const changedProperties = { id: "way/2", properties: { category: "portage" } };
  assert.deepEqual(
    getPreviousOnly(collection([oldFeature, sharedFeature]), collection([changedProperties])),
    [oldFeature]
  );
});

test("rejects malformed or inconsistent collections", () => {
  assert.throws(() => getPreviousOnly({}, collection([])), /vorige/);
  assert.throws(() => getPreviousOnly(collection([]), { type: "FeatureCollection", count: 1, features: [] }), /huidige/);
});
