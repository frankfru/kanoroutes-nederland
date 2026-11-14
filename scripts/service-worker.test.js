const test = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

test("receives one shared GPX locally under the app scope and rejects invalid shares", async t => {
  const root = path.join(__dirname, "..");
  const gpx = await readFile(path.join(root, "src", "gpx.js"), "utf8");
  const gpxUrl = `data:text/javascript;base64,${Buffer.from(gpx).toString("base64")}`;
  const source = (await readFile(path.join(root, "service-worker.js"), "utf8"))
    .replace("./src/gpx.js", gpxUrl);
  const previousSelf = global.self;
  const previousCaches = global.caches;
  const listeners = {};
  const messages = [];
  const entries = new Map();
  const cache = {
    keys: async () => [...entries.keys()].map(url => new Request(url)),
    match: async request => entries.get(String(request.url || request))?.clone(),
    put: async (request, response) => entries.set(String(request.url || request), response.clone()),
    delete: async request => entries.delete(String(request.url || request))
  };
  global.self = {
    registration: { scope: "https://example.test/kanoroutes-nederland/" },
    clients: {
      get: async () => ({
        url: "https://example.test/kanoroutes-nederland/",
        postMessage: message => messages.push(message)
      })
    },
    addEventListener: (type, listener) => { listeners[type] = listener; }
  };
  global.caches = { open: async () => cache };
  t.after(() => { global.self = previousSelf; global.caches = previousCaches; });
  await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

  async function share(files, clientId = "") {
    const form = new FormData();
    files.forEach(file => form.append("gpx", file));
    const request = new Request("https://example.test/kanoroutes-nederland/share-target", {
      method: "POST", body: form
    });
    let response;
    listeners.fetch({ request, clientId, respondWith: promise => { response = promise; } });
    return await response;
  }

  const response = await share([new File(["<gpx/>"], "tocht.gpx", { type: "application/gpx+xml" })]);
  assert.equal(response.status, 303);
  const destination = new URL(response.headers.get("location"));
  assert.equal(destination.pathname, "/kanoroutes-nederland/");
  const id = destination.searchParams.get("shared-gpx");
  const key = `https://example.test/kanoroutes-nederland/__shared-gpx/${id}`;
  assert.equal(await entries.get(key).clone().text(), "<gpx/>");
  assert.equal(entries.get(key).headers.get("x-file-name"), "tocht.gpx");

  const inExistingPage = await share([new File(["<gpx/>"], "ander.gpx")], "existing");
  assert.equal(inExistingPage.status, 204);
  assert.equal(messages[0].type, "shared-gpx");
  assert.ok(entries.has(`https://example.test/kanoroutes-nederland/__shared-gpx/${messages[0].id}`));

  const invalid = await share([]);
  assert.equal(new URL(invalid.headers.get("location")).searchParams.get("share-error"), "invalid");
  const large = await share([new File([new Uint8Array(10 * 1024 * 1024 + 1)], "groot.gpx")]);
  assert.equal(new URL(large.headers.get("location")).searchParams.get("share-error"), "size");
  assert.equal((await share([], "existing")).status, 204);
  assert.equal(messages[1].error, "invalid");
  assert.equal(entries.size, 2);
});
