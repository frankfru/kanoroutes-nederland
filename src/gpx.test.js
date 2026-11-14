const test = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

test("planner download uses the chosen filename and retains the GPX route name", async () => {
  const source = await readFile(path.join(__dirname, "gpx.js"), "utf8");
  const { normalizeGpxDownloadFileName, downloadGpxTrack } = await import(
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  );
  assert.equal(normalizeGpxDownloadFileName("Mooie tocht.GPX.gpx"), "Mooie tocht.gpx");
  assert.equal(normalizeGpxDownloadFileName(" Fryslân "), "Fryslân.gpx");
  for (const invalid of ["", ".gpx", "map/route", "CON", "route."]) {
    assert.equal(normalizeGpxDownloadFileName(invalid), null);
  }

  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalCreateObjectURL = URL.createObjectURL;
  let downloaded;
  let blob;
  globalThis.window = { setTimeout: () => {} };
  globalThis.document = {
    createElement: () => ({
      click() { downloaded = this.download; },
      remove() {}
    }),
    body: { append() {} }
  };
  URL.createObjectURL = value => {
    blob = value;
    return "blob:test";
  };
  try {
    downloadGpxTrack("Mijn route & meer", [[[52, 5], [52.1, 5.1]]], "Mooie tocht.gpx");
    assert.equal(downloaded, "Mooie tocht.gpx");
    assert.match(await blob.text(), /<name>Mijn route &amp; meer<\/name>/);
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    URL.createObjectURL = originalCreateObjectURL;
  }
});

test("imports separate tracks and routes and rejects invalid points", async t => {
  const source = await readFile(path.join(__dirname, "gpx.js"), "utf8");
  const { readGpxFile } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const namespace = "http://www.topografix.com/GPX/1/1";
  const node = (localName, children = [], attributes = {}, textContent = "") => ({
    localName, namespaceURI: namespace, children, textContent,
    getAttribute: name => attributes[name] ?? null
  });
  const point = (type, lat, lon) => node(type, [], { lat, lon });
  const segment = node("trkseg", [point("trkpt", "52", "5"), point("trkpt", "52.1", "5.1")]);
  const route = node("rte", [point("rtept", "53", "6"), point("rtept", "53.1", "6.1")]);
  const root = node("gpx", [node("trk", [node("name", [], {}, "Test"), segment]), route]);
  const originalParser = global.DOMParser;
  global.DOMParser = class {
    parseFromString() { return { documentElement: root, querySelector: () => null }; }
  };
  t.after(() => { global.DOMParser = originalParser; });
  const file = { size: 20, name: "test.gpx", text: async () => "<gpx/>" };
  assert.deepEqual(await readGpxFile(file), {
    name: "Test", segments: [[[52, 5], [52.1, 5.1]], [[53, 6], [53.1, 6.1]]]
  });
  segment.children[0] = point("trkpt", "", "5");
  await assert.rejects(readGpxFile(file), /ongeldig GPS-punt/);
  await assert.rejects(readGpxFile({ ...file, size: 10 * 1024 * 1024 + 1 }), /groter dan 10 MB/);
  await assert.rejects(readGpxFile({ ...file, text: async () => "<!DOCTYPE gpx><gpx/>" }), /documenttype/);
});
