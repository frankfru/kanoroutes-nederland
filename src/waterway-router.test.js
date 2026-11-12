const test = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

test("routes through portages while keeping waterway coverage geometry unchanged", async () => {
  const source = await readFile(path.join(__dirname, "waterway-router.js"), "utf8");
  const { createWaterwayRouter } = await import(
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  );
  const waterwayData = {
    version: 1,
    generated: "2026-11-11",
    nodes: [52, 5, 52, 5.001, 52.001, 5, 52.001, 5.001],
    ways: [[0, 1], [2, 3]]
  };
  const portageData = {
    version: 1,
    waterwayGenerated: waterwayData.generated,
    connectionCount: 1,
    connections: [{
      id: "way/10",
      line: [[52, 5.0005], [52.0005, 5.0005], [52.001, 5.0005]]
    }]
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async file => ({
    ok: true,
    json: async () => file === "waterway-network.json" ? waterwayData : portageData
  });

  try {
    const router = createWaterwayRouter();
    await router.load();
    const from = router.snap([52, 5.0001]);
    const to = router.snap([52.001, 5.0009]);
    const route = router.route(from, to);
    const coverage = router.coverage({
      getSouth: () => 51.99,
      getNorth: () => 52.01,
      getWest: () => 4.99,
      getEast: () => 5.01
    });

    assert.ok(route.some(([latitude]) => Math.abs(latitude - 52.0005) < 0.000001));
    assert.equal(coverage.lines.length, 2);
    assert.deepEqual(coverage.lines, [
      [[52, 5], [52, 5.001]],
      [[52.001, 5], [52.001, 5.001]]
    ]);
    assert.equal(coverage.portages.length, 1);
    assert.deepEqual(coverage.portages[0], portageData.connections[0].line);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
