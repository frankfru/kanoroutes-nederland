const test = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

test("routes through Dutch and German portages while keeping waterway coverage geometry unchanged", async () => {
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
  const germanyData = {
    version: 1,
    generated: "2026-11-12",
    nodes: [52.002, 5, 52.002, 5.001, 52.003, 5, 52.003, 5.001],
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
  const germanyPortageData = {
    version: 1,
    waterwayGenerated: germanyData.generated,
    connectionCount: 1,
    connections: [{
      id: "way/11",
      line: [[52.002, 5.0005], [52.0025, 5.0005], [52.003, 5.0005]]
    }]
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async file => {
    const data = {
      "waterway-network.json": waterwayData,
      "waterway-network-germany.json": germanyData,
      "waterway-portages.json": portageData,
      "waterway-portages-germany.json": germanyPortageData
    }[file];
    return { ok: true, json: async () => data };
  };

  try {
    const router = createWaterwayRouter();
    await router.load();
    const from = router.snap([52, 5.0001]);
    const to = router.snap([52.001, 5.0009]);
    const route = router.route(from, to);
    const germanyFrom = router.snap([52.002, 5.0001]);
    const germanyTo = router.snap([52.003, 5.0009]);
    const germanyRoute = router.route(germanyFrom, germanyTo);
    const coverage = router.coverage({
      getSouth: () => 51.99,
      getNorth: () => 52.01,
      getWest: () => 4.99,
      getEast: () => 5.01
    });

    assert.ok(route.some(([latitude]) => Math.abs(latitude - 52.0005) < 0.000001));
    assert.equal(coverage.lines.length, 4);
    assert.deepEqual(coverage.lines, [
      [[52, 5], [52, 5.001]],
      [[52.001, 5], [52.001, 5.001]],
      [[52.002, 5], [52.002, 5.001]],
      [[52.003, 5], [52.003, 5.001]]
    ]);
    assert.equal(coverage.generated, waterwayData.generated);
    assert.equal(coverage.germanyGenerated, germanyData.generated);
    assert.ok(germanyRoute.length >= 2);
    assert.ok(germanyRoute.some(([latitude]) => Math.abs(latitude - 52.0025) < 0.000001));
    assert.equal(coverage.portages.length, 2);
    assert.deepEqual(coverage.portages[0], portageData.connections[0].line);
    assert.deepEqual(coverage.portages[1], germanyPortageData.connections[0].line);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
