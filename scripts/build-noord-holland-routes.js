const { readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const pageUrl = "https://www.akvodysseus.nl/disciplines/toerkano/routes-kanotochten/";
const apiUrl = "https://www.akvodysseus.nl/wp-json/wp/v2/pages?slug=routes-kanotochten&_fields=content";
const projectRoot = path.resolve(__dirname, "..");
const outputPath = path.join(projectRoot, "routes-noord-holland-data.js");
const maxConcurrentDownloads = 3;
const simplificationToleranceMeters = 5;

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

function parseCoordinates(segment, pointTag) {
  const attributes = new Map(
    [...pointTag.matchAll(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/g)].map(match => [match[1], match[3]])
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
    throw new Error(`Ongeldige GPS-coördinaten in ${segment}`);
  }

  return [latitude, longitude];
}

function parsePoints(content, tagName, sourceUrl) {
  const points = [];
  const pointPattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");

  for (const match of content.matchAll(pointPattern)) {
    points.push(parseCoordinates(sourceUrl, match[0]));
  }

  return points;
}

function parseGpx(gpx, sourceUrl) {
  const trackSegments = [...gpx.matchAll(/<trkseg\b[^>]*>([\s\S]*?)<\/trkseg>/gi)]
    .map(match => parsePoints(match[1], "trkpt", sourceUrl))
    .filter(segment => segment.length > 1);

  if (trackSegments.length > 0) {
    return trackSegments;
  }

  return [...gpx.matchAll(/<rte\b[^>]*>([\s\S]*?)<\/rte>/gi)]
    .map(match => parsePoints(match[1], "rtept", sourceUrl))
    .filter(segment => segment.length > 1);
}

function simplifySegment(points) {
  if (points.length <= 2) return points;

  const radius = 6378137;
  const coordinates = points.map(([latitude, longitude]) => {
    const latitudeRadians = (latitude * Math.PI) / 180;
    const longitudeRadians = (longitude * Math.PI) / 180;
    const clampedLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude));
    const clampedLatitudeRadians = (clampedLatitude * Math.PI) / 180;
    return [
      radius * longitudeRadians,
      radius * Math.log(Math.tan(Math.PI / 4 + clampedLatitudeRadians / 2))
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

function findRouteGroup(name, groups) {
  const prefix = name.match(/^\s*(\d+)(?=\.|\s|-|$)/)?.[1];
  return (prefix && groups.get(prefix)) || "Overige vertrekplaatsen";
}

function findPdfLink(name, pdfLinks) {
  const routeId = name.match(/^\s*(\d+(?:\.\d+)?)(?=\.|\s|-|$)/)?.[1];
  if (!routeId) return null;

  const exactMatch = pdfLinks.get(routeId);
  if (exactMatch) return exactMatch;

  const sectionMatches = [...pdfLinks.entries()]
    .filter(([id]) => id.startsWith(`${routeId}.`))
    .map(([, url]) => url);

  return sectionMatches.length === 1 ? sectionMatches[0] : null;
}

async function downloadRoute(route) {
  let response;
  let lastError;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(route.url, { signal: AbortSignal.timeout(90000) });
      if (response.ok) break;
      lastError = new Error(`HTTP ${response.status}`);
      if (response.status < 500 && response.status !== 429) {
        throw new Error(`GPX-download mislukt (${response.status}): ${route.url}`);
      }
    } catch (error) {
      if (error.message.startsWith("GPX-download mislukt")) throw error;
      lastError = error;
    }

    if (attempt < 2) {
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  if (!response?.ok) {
    throw new Error(`GPX-download mislukt na 3 pogingen: ${route.url}`, { cause: lastError });
  }

  const gpx = await response.text();
  const originalSegments = parseGpx(gpx, route.url);
  if (originalSegments.length === 0) {
    throw new Error(`Geen routepunten gevonden in ${route.url}`);
  }

  const sourcePointCount = originalSegments.reduce((sum, segment) => sum + segment.length, 0);
  return {
    name: route.name,
    folder: route.folder,
    source: route.url,
    pdf: route.pdf,
    sourcePointCount,
    segments: originalSegments.map(simplifySegment)
  };
}

async function main() {
  if (process.argv.includes("--simplify-existing")) {
    const source = await readFile(outputPath, "utf8");
    const prefix = "window.GPX_ROUTES_NOORD_HOLLAND = ";
    if (!source.startsWith(prefix)) {
      throw new Error(`Ongeldig routebestand: ${outputPath}`);
    }

    const routes = JSON.parse(source.slice(prefix.length).trim().replace(/;\s*$/, ""));
    if (!Array.isArray(routes) || routes.length === 0) {
      throw new Error(`Geen routes gevonden in ${outputPath}`);
    }

    for (const route of routes) {
      const originalSegments = route.segments;
      route.sourcePointCount ??= originalSegments.reduce((sum, segment) => sum + segment.length, 0);
      route.segments = originalSegments.map(simplifySegment);
    }

    const displayedPointCount = routes.reduce(
      (total, route) => total + route.segments.reduce((sum, segment) => sum + segment.length, 0),
      0
    );
    const sourcePointCount = routes.reduce((total, route) => total + route.sourcePointCount, 0);
    await writeFile(outputPath, `window.GPX_ROUTES_NOORD_HOLLAND = ${JSON.stringify(routes)};\n`, "utf8");
    console.log(`Routes: ${routes.length}`);
    console.log(`Originele GPS-meetpunten: ${sourcePointCount}`);
    console.log(`GPS-punten op de kaart (vereenvoudigd tot ${simplificationToleranceMeters} m): ${displayedPointCount}`);
    console.log(`Databestand: ${outputPath}`);
    return;
  }

  const pageResponse = await fetch(apiUrl, { signal: AbortSignal.timeout(30000) });
  if (!pageResponse.ok) {
    throw new Error(`Bronpagina niet bereikbaar (${pageResponse.status}): ${pageUrl}`);
  }

  const pages = await pageResponse.json();
  const html = pages[0]?.content?.rendered;
  if (typeof html !== "string" || html.length === 0) {
    throw new Error(`Geen routeoverzicht gevonden op ${pageUrl}`);
  }

  const groups = new Map();
  for (const match of html.matchAll(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const heading = extractText(match[2]).match(/^\s*(\d+)\.\s*(.+)$/);
    if (heading) {
      groups.set(heading[1], `${heading[1]}. ${heading[2]}`);
    }
  }

  const pdfLinks = new Map();
  const routeLinks = [];
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)) {
    const name = extractText(match[3]);
    if (!name) continue;

    const url = new URL(match[2].replace(/&amp;/gi, "&"), pageUrl);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "www.akvodysseus.nl" ||
      !/\.gpx$/i.test(url.pathname)
    ) {
      continue;
    }

    if (/\.pdf$/i.test(url.pathname)) {
      const fileName = decodeURIComponent(path.basename(url.pathname));
      const pdfId = fileName.match(/^(\d+(?:\.\d+)?)(?=[-.])/i)?.[1];
      if (pdfId) pdfLinks.set(pdfId, url.href);
    } else if (/\.gpx$/i.test(url.pathname)) {
      routeLinks.push({
        name,
        folder: findRouteGroup(name, groups),
        url: url.href
      });
    }
  }

  if (routeLinks.length === 0) {
    throw new Error(`Geen downloadbare GPX-routes gevonden op ${pageUrl}`);
  }

  const missingPdfLinks = routeLinks.filter(route => !findPdfLink(route.name, pdfLinks));
  if (missingPdfLinks.length > 0) {
    throw new Error(
      `Geen bijbehorende PDF-link gevonden voor: ${missingPdfLinks.map(route => route.name).join(", ")}`
    );
  }

  const routes = routeLinks.map(route => ({
    ...route,
    pdf: findPdfLink(route.name, pdfLinks)
  }));

  const results = new Array(routes.length);
  let nextIndex = 0;
  async function downloadWorker() {
    while (nextIndex < routes.length) {
      const index = nextIndex++;
      results[index] = await downloadRoute(routes[index]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(maxConcurrentDownloads, routes.length) },
      () => downloadWorker()
    )
  );

  const displayedPointCount = results.reduce(
    (total, route) => total + route.segments.reduce((sum, segment) => sum + segment.length, 0),
    0
  );
  const sourcePointCount = results.reduce((total, route) => total + route.sourcePointCount, 0);
  const json = JSON.stringify(results);
  const output = `window.GPX_ROUTES_NOORD_HOLLAND = ${json};\n`;
  await writeFile(outputPath, output, "utf8");

  console.log(`Routes: ${results.length}`);
  console.log(`Vertrekplaatsen: ${groups.size}`);
  console.log(`Originele GPS-meetpunten: ${sourcePointCount}`);
  console.log(`GPS-punten op de kaart (vereenvoudigd tot ${simplificationToleranceMeters} m): ${displayedPointCount}`);
  console.log(`Databestand: ${outputPath}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
