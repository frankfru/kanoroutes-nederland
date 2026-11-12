const { writeFile } = require("node:fs/promises");
const path = require("node:path");

const homepageUrl = "https://kanokaartutrecht.nl/";
const projectRoot = path.resolve(__dirname, "..");
const outputPath = path.join(projectRoot, "shared", "routes-utrecht-data.js");
const maxConcurrentRequests = 5;
const simplificationToleranceMeters = 5;

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function extractText(html) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePoints(content, tagName, source) {
  const points = [];
  const pointPattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");

  for (const match of content.matchAll(pointPattern)) {
    const attributes = new Map(
      [...match[0].matchAll(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/g)].map(result => [
        result[1],
        result[3]
      ])
    );
    const latitude = Number(attributes.get("lat"));
    const longitude = Number(attributes.get("lon"));

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new Error(`Ongeldige GPS-coördinaten in ${source}`);
    }

    points.push([latitude, longitude]);
  }

  return points;
}

function parseGpx(gpx, source) {
  const trackSegments = [...gpx.matchAll(/<trkseg\b[^>]*>([\s\S]*?)<\/trkseg>/gi)]
    .map(match => parsePoints(match[1], "trkpt", source))
    .filter(segment => segment.length > 1);
  if (trackSegments.length > 0) return trackSegments;

  return [...gpx.matchAll(/<rte\b[^>]*>([\s\S]*?)<\/rte>/gi)]
    .map(match => parsePoints(match[1], "rtept", source))
    .filter(segment => segment.length > 1);
}

function getRouteName(gpx, source, fallbackName) {
  const trackName = gpx.match(/<trk\b[^>]*>[\s\S]*?<name\b[^>]*>([\s\S]*?)<\/name>/i)?.[1];
  const metadataName = gpx.match(/<metadata\b[^>]*>[\s\S]*?<name\b[^>]*>([\s\S]*?)<\/name>/i)?.[1];
  const name = decodeXml(trackName || metadataName || "")
    .replace(/^Wikiloc\s*-\s*/i, "")
    .replace(/\s*-\s*Wikiloc$/i, "");
  return name || fallbackName;
}

function simplifySegment(points) {
  if (points.length <= 2) return points;

  const radius = 6378137;
  const coordinates = points.map(([latitude, longitude]) => {
    const clampedLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude));
    const latitudeRadians = (clampedLatitude * Math.PI) / 180;
    return [
      (radius * longitude * Math.PI) / 180,
      radius * Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2))
    ];
  });
  const keep = new Uint8Array(points.length);
  const pendingRanges = [[0, points.length - 1]];
  const toleranceSquared = simplificationToleranceMeters ** 2;
  keep[0] = 1;
  keep[points.length - 1] = 1;

  while (pendingRanges.length > 0) {
    const [startIndex, endIndex] = pendingRanges.pop();
    const start = coordinates[startIndex];
    const end = coordinates[endIndex];
    const deltaX = end[0] - start[0];
    const deltaY = end[1] - start[1];
    const lineLengthSquared = deltaX * deltaX + deltaY * deltaY;
    let furthestIndex = -1;
    let furthestDistanceSquared = toleranceSquared;

    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const point = coordinates[index];
      const projection =
        lineLengthSquared === 0
          ? 0
          : Math.max(
              0,
              Math.min(
                1,
                ((point[0] - start[0]) * deltaX + (point[1] - start[1]) * deltaY) /
                  lineLengthSquared
              )
            );
      const distanceX = point[0] - (start[0] + projection * deltaX);
      const distanceY = point[1] - (start[1] + projection * deltaY);
      const distanceSquared = distanceX * distanceX + distanceY * distanceY;

      if (distanceSquared > furthestDistanceSquared) {
        furthestDistanceSquared = distanceSquared;
        furthestIndex = index;
      }
    }

    if (furthestIndex !== -1) {
      keep[furthestIndex] = 1;
      pendingRanges.push([startIndex, furthestIndex], [furthestIndex, endIndex]);
    }
  }

  return points.filter((_, index) => keep[index] === 1);
}

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.text();
}

async function downloadRoute(route) {
  const gpx = await fetchText(route.source);
  const originalSegments = parseGpx(gpx, route.source);
  if (originalSegments.length === 0) {
    throw new Error(`Geen routepunten gevonden in ${route.source}`);
  }

  const sourcePointCount = originalSegments.reduce((sum, segment) => sum + segment.length, 0);
  return {
    name: getRouteName(gpx, route.source, route.name),
    folder: route.folder,
    source: route.source,
    sourcePage: route.sourcePage,
    sourcePointCount,
    segments: originalSegments.map(simplifySegment)
  };
}

async function main() {
  const homepage = await fetchText(homepageUrl);
  const pages = new Set();
  for (const match of homepage.matchAll(/<a\b[^>]*href\s*=\s*(["'])(.*?)\1/gi)) {
    const href = match[2].replace(/&amp;/gi, "&");
    try {
      const url = new URL(href, homepageUrl);
      if (
        url.protocol === "https:" &&
        url.hostname === "kanokaartutrecht.nl" &&
        /\.html?$/i.test(url.pathname)
      ) {
        pages.add(url.href);
      }
    } catch {
      continue;
    }
  }

  const routePages = [];
  const pageList = [...pages];
  let nextPageIndex = 0;
  async function pageWorker() {
    while (nextPageIndex < pageList.length) {
      const url = pageList[nextPageIndex++];
      const html = await fetchText(url);
      const heading =
        html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ||
        html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
      const folder = extractText(heading || "") || "Overige routes";

      for (const match of html.matchAll(
        /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi
      )) {
        const href = match[2].replace(/&amp;/gi, "&");
        let source;
        try {
          const sourceUrl = new URL(href, url);
          if (
            sourceUrl.protocol !== "https:" ||
            sourceUrl.hostname !== "kanokaartutrecht.nl" ||
            !/^\/gpx\/.+\.gpx$/i.test(sourceUrl.pathname)
          ) {
            continue;
          }
          source = sourceUrl.href;
        } catch {
          continue;
        }

        const fallbackName = decodeURIComponent(path.basename(new URL(source).pathname))
          .replace(/\.gpx$/i, "")
          .replace(/[-_]+/g, " ")
          .replace(/\b\w/g, character => character.toLocaleUpperCase("nl"));
        routePages.push({
          name: extractText(match[3]) === "hier" ? fallbackName : extractText(match[3]),
          folder,
          source,
          sourcePage: url
        });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(maxConcurrentRequests, pageList.length) }, () => pageWorker())
  );

  const uniqueRoutes = [...new Map(routePages.map(route => [route.source, route])).values()];
  if (uniqueRoutes.length === 0) {
    throw new Error(`Geen downloadbare GPX-routes gevonden op ${homepageUrl}`);
  }

  const results = new Array(uniqueRoutes.length);
  let nextRouteIndex = 0;
  async function routeWorker() {
    while (nextRouteIndex < uniqueRoutes.length) {
      const index = nextRouteIndex++;
      results[index] = await downloadRoute(uniqueRoutes[index]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(maxConcurrentRequests, uniqueRoutes.length) },
      () => routeWorker()
    )
  );

  const sourcePointCount = results.reduce((sum, route) => sum + route.sourcePointCount, 0);
  const displayedPointCount = results.reduce(
    (sum, route) => sum + route.segments.reduce((segmentSum, segment) => segmentSum + segment.length, 0),
    0
  );
  await writeFile(outputPath, `window.GPX_ROUTES_UTRECHT = ${JSON.stringify(results)};\n`, "utf8");

  console.log(`Routepagina's gecontroleerd: ${pages.size}`);
  console.log(`Routes: ${results.length}`);
  console.log(`Originele GPS-meetpunten: ${sourcePointCount}`);
  console.log(
    `GPS-punten op de kaart (vereenvoudigd tot ${simplificationToleranceMeters} m): ${displayedPointCount}`
  );
  console.log(`Databestand: ${outputPath}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
