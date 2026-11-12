const http = require("node:http");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/map-libre", ["map-libre/index.html", "text/html; charset=utf-8"]],
  ["/map-libre/", ["map-libre/index.html", "text/html; charset=utf-8"]],
  ["/map-libre/index.html", ["map-libre/index.html", "text/html; charset=utf-8"]],
  ["/map-libre/main.js", ["map-libre/main.js", "text/javascript; charset=utf-8"]],
  ["/shared/route-categories.js", ["shared/route-categories.js", "text/javascript; charset=utf-8"]],
  ["/shared/route-geometry.js", ["shared/route-geometry.js", "text/javascript; charset=utf-8"]],
  ["/shared/route-popup.js", ["shared/route-popup.js", "text/javascript; charset=utf-8"]],
  ["/shared/mobile-route-sheet.js", ["shared/mobile-route-sheet.js", "text/javascript; charset=utf-8"]],
  ["/shared/routes-data.js", ["shared/routes-data.js", "text/javascript; charset=utf-8"]],
  ["/shared/routes-noord-holland-data.js", ["shared/routes-noord-holland-data.js", "text/javascript; charset=utf-8"]],
  ["/shared/routes-kanoroutes-data.js", ["shared/routes-kanoroutes-data.js", "text/javascript; charset=utf-8"]],
  ["/shared/routes-utrecht-data.js", ["shared/routes-utrecht-data.js", "text/javascript; charset=utf-8"]],
  ["/shared/styles.css", ["shared/styles.css", "text/css; charset=utf-8"]],
  ["/src/main.js", ["src/main.js", "text/javascript; charset=utf-8"]],
  ["/src/osm-edit.js", ["src/osm-edit.js", "text/javascript; charset=utf-8"]],
  ["/src/lake-waterway-overlay.js", ["src/lake-waterway-overlay.js", "text/javascript; charset=utf-8"]],
  ["/src/waterway-candidate-overlay.js", ["src/waterway-candidate-overlay.js", "text/javascript; charset=utf-8"]],
  ["/src/waterway-coverage-gap-overlay.js", ["src/waterway-coverage-gap-overlay.js", "text/javascript; charset=utf-8"]],
  ["/src/canoe-landings-overlay.js", ["src/canoe-landings-overlay.js", "text/javascript; charset=utf-8"]],
  ["/src/canoe-landings-previous-overlay.js", ["src/canoe-landings-previous-overlay.js", "text/javascript; charset=utf-8"]],
  ["/src/heatmap.js", ["src/heatmap.js", "text/javascript; charset=utf-8"]],
  ["/src/gpx.js", ["src/gpx.js", "text/javascript; charset=utf-8"]],
  ["/src/route-builder.js", ["src/route-builder.js", "text/javascript; charset=utf-8"]],
  ["/src/waterway-router.js", ["src/waterway-router.js", "text/javascript; charset=utf-8"]],
  ["/kayak-heatmap-data.json", ["kayak-heatmap-data.json", "application/json; charset=utf-8"]],
  ["/waterway-network.json", ["waterway-network.json", "application/json; charset=utf-8"]],
  ["/lake-waterway-lines.json", ["lake-waterway-lines.json", "application/json; charset=utf-8"]],
  ["/waterway-coverage-candidates.json", ["waterway-coverage-candidates.json", "application/json; charset=utf-8"]],
  ["/waterway-coverage-gaps.json", ["waterway-coverage-gaps.json", "application/json; charset=utf-8"]],
  ["/canoe-landings.json", ["canoe-landings.json", "application/json; charset=utf-8"]],
  ["/canoe-landings-previous-only.json", ["canoe-landings-previous-only.json", "application/json; charset=utf-8"]]
]);

const server = http.createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  if (pathname === "/map-libre") {
    response.writeHead(301, { Location: "/map-libre/" });
    response.end();
    return;
  }

  const file = files.get(pathname);
  if (!file) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  try {
    const body = await readFile(path.join(root, file[0]));
    response.writeHead(200, {
      "Content-Type": file[1],
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    console.error(`Failed to serve ${file[0]}:`, error);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Internal server error");
  }
});

server.on("error", error => {
  console.error("Webserver failed:", error);
  process.exitCode = 1;
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Kanoroutekaart beschikbaar op http://localhost:${port}`);
});
