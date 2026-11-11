const test = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

async function setup() {
  const source = await readFile(path.join(__dirname, "..", "src", "osm-edit.js"), "utf8");
  const { enableOsmEditOnHold } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const handlers = {};
  const container = {
    addEventListener(type, handler) { handlers[`container:${type}`] = handler; },
    contains(target) { return !target.outside; }
  };
  const originalWindow = global.window;
  const originalDocument = global.document;
  global.window = { addEventListener(type, handler) { handlers[`window:${type}`] = handler; } };
  global.document = { createElement() { return {}; } };
  const popups = [];
  const map = {
    getContainer: () => container,
    getZoom: () => 10,
    mouseEventToLatLng: () => ({ wrap: () => ({ lat: 52.1234567, lng: 5.7654321 }) })
  };
  const L = {
    popup() {
      return {
        setLatLng(latlng) { this.latlng = latlng; return this; },
        setContent(content) { this.content = content; return this; },
        openOn() { popups.push(this); }
      };
    }
  };
  enableOsmEditOnHold({ map, L });
  const event = (overrides = {}) => ({
    pointerId: 1, isPrimary: true, button: 0, clientX: 100, clientY: 100,
    timeStamp: 0, target: { closest: () => false }, ...overrides
  });
  return {
    handlers, popups, event,
    cleanup() { global.window = originalWindow; global.document = originalDocument; }
  };
}

test("opens an OSM edit link only after holding longer than 500 ms", async t => {
  const { handlers, popups, event, cleanup } = await setup();
  t.after(cleanup);
  for (const duration of [200, 500, 501]) {
    handlers["container:pointerdown"](event());
    handlers["window:pointerup"](event({ timeStamp: duration }));
  }
  assert.equal(popups.length, 1);
  assert.equal(popups[0].content.href, "https://www.openstreetmap.org/edit#map=17/52.123457/5.765432");
  assert.equal(popups[0].content.target, "_blank");
  let stopped = false;
  handlers["container:click"](event({
    timeStamp: 502, detail: 1,
    preventDefault() {}, stopImmediatePropagation() { stopped = true; }
  }));
  assert.equal(stopped, true);
});

test("ignores drags, cancelled presses, controls, and multiple pointers", async t => {
  const { handlers, popups, event, cleanup } = await setup();
  t.after(cleanup);
  const down = handlers["container:pointerdown"];
  const up = handlers["window:pointerup"];
  down(event());
  handlers["window:pointermove"](event({ clientX: 109 }));
  up(event({ timeStamp: 600, clientX: 109 }));
  down(event());
  handlers["window:pointercancel"](event());
  up(event({ timeStamp: 600 }));
  down(event({ target: { closest: () => true } }));
  up(event({ timeStamp: 600 }));
  down(event());
  down(event({ pointerId: 2, isPrimary: false }));
  up(event({ timeStamp: 600 }));
  assert.equal(popups.length, 0);
});
