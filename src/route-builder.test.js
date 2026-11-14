const test = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

async function setup(t, draggingInitiallyEnabled = true) {
  const gpx = await readFile(path.join(__dirname, "gpx.js"), "utf8");
  const gpxUrl = `data:text/javascript;base64,${Buffer.from(gpx).toString("base64")}`;
  const source = (await readFile(path.join(__dirname, "route-builder.js"), "utf8"))
    .replace("./gpx.js", gpxUrl);
  const { createRouteBuilder } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  t.mock.timers.enable({ apis: ["setTimeout"] });

  function element() {
    const handlers = {};
    const classes = new Set();
    return {
      handlers, open: false, textContent: "", style: { setProperty() {} },
      classList: {
        add: value => classes.add(value),
        remove: value => classes.delete(value),
        contains: value => classes.has(value),
        toggle(value, active) { if (active) classes.add(value); else classes.delete(value); }
      },
      addEventListener(type, handler) { handlers[type] = handler; },
      setAttribute() {},
      querySelector() { return element(); },
      getBoundingClientRect() { return { left: 0, top: 0 }; }
    };
  }

  const elements = new Map();
  const previousDocument = global.document;
  global.document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    addEventListener() {}
  };
  t.after(() => { global.document = previousDocument; });
  const container = element();
  let dragging = draggingInitiallyEnabled;
  const map = {
    createPane() {},
    getPane() { return { style: {} }; },
    getContainer() { return container; },
    dragging: {
      enabled: () => dragging,
      enable() { dragging = true; },
      disable() { dragging = false; }
    },
    mouseEventToLatLng: event => ({ lat: event.clientY, lng: event.clientX }),
    fitBounds() {},
    closePopup() {},
    on() {},
    off() {}
  };
  const layer = () => ({ addTo() { return this; }, setLatLngs() {}, clearLayers() {} });
  const markers = [];
  const L = {
    featureGroup: layer,
    polyline: layer,
    latLng: (lat, lng) => ({ lat, lng }),
    latLngBounds: coordinates => coordinates,
    circleMarker(point) { markers.push(point); return layer(); }
  };
  const builder = createRouteBuilder({
    map, L, waterwayRouter: { load: async () => {}, snap: () => null }, calculateDistanceKm: () => 0,
    routeButtons: [], applyRouteStyles() {}, getActiveRoutes: () => []
  });
  const planner = elements.get("route-builder");
  planner.open = true;
  planner.handlers.toggle();
  const touch = (type, x = 20, y = 100) => ({
    type, pointerType: "touch", clientX: x, clientY: y
  });
  return { builder, container, elements, map, markers, touch };
}

test("holds the map still while positioning a free touch point and restores dragging", async t => {
  const { container, elements, map, markers, touch } = await setup(t);
  container.handlers.pointerdown(touch("pointerdown"));
  t.mock.timers.tick(500);
  assert.equal(map.dragging.enabled(), false);
  container.handlers.pointermove(touch("pointermove", 40, 120));
  container.handlers.pointerup(touch("pointerup", 40, 120));
  assert.equal(map.dragging.enabled(), true);
  assert.deepEqual(markers, [{ lat: 60, lng: 40 }]);
  assert.match(elements.get("route-builder-status").textContent, /1 punt.*vrij punt/);
});

test("restores dragging after cancellation or stopping the planner", async t => {
  const { container, elements, map, touch } = await setup(t);
  for (const cancel of [
    () => container.handlers.pointercancel(touch("pointercancel")),
    () => elements.get("route-draw-toggle").handlers.click()
  ]) {
    container.handlers.pointerdown(touch("pointerdown"));
    t.mock.timers.tick(500);
    assert.equal(map.dragging.enabled(), false);
    cancel();
    assert.equal(map.dragging.enabled(), true);
    assert.equal(container.classList.contains("route-long-press-ready"), false);
  }
});

test("does not enable map dragging if it was already disabled", async t => {
  const { container, map, touch } = await setup(t, false);
  container.handlers.pointerdown(touch("pointerdown"));
  t.mock.timers.tick(500);
  container.handlers.pointercancel(touch("pointercancel"));
  assert.equal(map.dragging.enabled(), false);
});

test("keeps normal dragging available when moving before the hold completes", async t => {
  const { container, map, touch } = await setup(t);
  container.handlers.pointerdown(touch("pointerdown"));
  container.handlers.pointermove(touch("pointermove", 40, 100));
  t.mock.timers.tick(500);
  assert.equal(map.dragging.enabled(), true);
  assert.equal(container.classList.contains("route-long-press-ready"), false);
});

test("confirms before replacing the current route with an imported GPX", async t => {
  const { builder, container, elements, touch } = await setup(t);
  const previousWindow = global.window;
  let confirmed = false;
  global.window = { confirm: () => confirmed, clearTimeout };
  t.after(() => { global.window = previousWindow; });
  container.handlers.pointerdown(touch("pointerdown"));
  t.mock.timers.tick(500);
  container.handlers.pointerup(touch("pointerup"));
  const route = { name: "Nieuwe route", segments: [[[52, 5], [52.1, 5.1]]] };
  assert.equal(await builder.importRoute(route), false);
  assert.match(elements.get("route-builder-status").textContent, /1 punt/);
  confirmed = true;
  assert.equal(await builder.importRoute(route), true);
  assert.equal(elements.get("route-name").value, "Nieuwe route");
  assert.match(elements.get("route-builder-status").textContent, /alleen routelijn en naam/);
});
