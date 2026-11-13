const test = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

async function loadPopup() {
  const source = await readFile(path.join(__dirname, "route-popup.js"), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

test("dummy routes show a warning instead of a distance or route actions", async () => {
  const { createRoutePopupContent } = await loadPopup();
  const popup = createRoutePopupContent({
    name: "Test", isDummy: true, source: "https://example.org/test.gpx"
  }, {
    distanceKm: 6.3, routeIndex: 1, supportsGpxFileSharing: true, includeRouteBuilderAction: true
  });
  assert.match(popup, /Dummyroute: geen echte vaarroute/);
  assert.match(popup, /Dummy-GPX downloaden/);
  assert.doesNotMatch(popup, /6,3 km|data-route-share/);
  assert.match(popup, /data-route-base="1"/);
});

test("real routes retain their distance, downloads and actions", async () => {
  const { createRoutePopupContent } = await loadPopup();
  const popup = createRoutePopupContent({
    name: "Test", source: "https://example.org/test.gpx"
  }, {
    distanceKm: 6.3, routeIndex: 1, supportsGpxFileSharing: true, includeRouteBuilderAction: true
  });
  assert.match(popup, /6,3 km/);
  assert.match(popup, /Originele GPX downloaden/);
  assert.match(popup, /data-route-share="1"/);
  assert.match(popup, /data-route-base="1"/);
});
