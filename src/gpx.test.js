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
