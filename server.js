const http = require("node:http");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/routes-data.js", ["routes-data.js", "text/javascript; charset=utf-8"]],
  ["/routes-noord-holland-data.js", ["routes-noord-holland-data.js", "text/javascript; charset=utf-8"]],
  ["/routes-kanoroutes-data.js", ["routes-kanoroutes-data.js", "text/javascript; charset=utf-8"]],
  ["/routes-utrecht-data.js", ["routes-utrecht-data.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/src/main.js", ["src/main.js", "text/javascript; charset=utf-8"]],
  ["/src/heatmap.js", ["src/heatmap.js", "text/javascript; charset=utf-8"]],
  ["/src/gpx.js", ["src/gpx.js", "text/javascript; charset=utf-8"]],
  ["/src/route-builder.js", ["src/route-builder.js", "text/javascript; charset=utf-8"]],
  ["/src/waterway-router.js", ["src/waterway-router.js", "text/javascript; charset=utf-8"]],
  ["/kayak-heatmap-data.json", ["kayak-heatmap-data.json", "application/json; charset=utf-8"]],
  ["/waterway-network.json", ["waterway-network.json", "application/json; charset=utf-8"]]
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
