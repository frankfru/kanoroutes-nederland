const { readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { inflateRawSync } = require("node:zlib");

const homepageUrl = "https://kanoroutes.nl/";
const boundaryUrl =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson";
const provincesUrl =
  "https://service.pdok.nl/kadaster/bestuurlijkegebieden/wfs/v1_0?service=WFS&version=2.0.0&request=GetFeature&typeNames=bestuurlijkegebieden:Provinciegebied&outputFormat=application/json&srsName=EPSG:4326";
const projectRoot = path.resolve(__dirname, "..");
const outputPath = path.join(projectRoot, "routes-kanoroutes-data.js");
const maxConcurrentRequests = 5;
const simplificationToleranceMeters = 5;
const denHelderPage = "nl-denhelder.htm";

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .trim();
}

function extractText(html) {
  return decodeHtml(html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " "));
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "Kajakroutes Dinsdaggers (personal route map)" },
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }
  return response.text();
}

async function fetchBytes(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Kajakroutes Dinsdaggers (personal route map)" },
        signal: AbortSignal.timeout(60000)
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw new Error(`Routebestand niet opgehaald na 3 pogingen: ${url}`, { cause: lastError });
}

function parseZip(buffer) {
  let endOffset = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("Het ZIP-bestand heeft geen geldige directory.");

  const entryCount = buffer.readUInt16LE(endOffset + 10);
  let entryOffset = buffer.readUInt32LE(endOffset + 16);
  const entries = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(entryOffset) !== 0x02014b50) {
      throw new Error("Ongeldige ZIP-directory.");
    }
    const flags = buffer.readUInt16LE(entryOffset + 8);
    const method = buffer.readUInt16LE(entryOffset + 10);
    const compressedSize = buffer.readUInt32LE(entryOffset + 20);
    const uncompressedSize = buffer.readUInt32LE(entryOffset + 24);
    const nameLength = buffer.readUInt16LE(entryOffset + 28);
    const extraLength = buffer.readUInt16LE(entryOffset + 30);
    const commentLength = buffer.readUInt16LE(entryOffset + 32);
    const localOffset = buffer.readUInt32LE(entryOffset + 42);
    const nameBytes = buffer.subarray(entryOffset + 46, entryOffset + 46 + nameLength);
    const name = new TextDecoder(flags & 0x800 ? "utf-8" : "windows-1252").decode(nameBytes);

    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error(`ZIP64 wordt niet ondersteund: ${name}`);
    }
    if ((flags & 1) !== 0) throw new Error(`Versleuteld GPX-bestand: ${name}`);

    if (!name.endsWith("/")) {
      const dataOffset =
        localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
      const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
      let data;
      if (method === 0) data = compressed;
      else if (method === 8) data = inflateRawSync(compressed, { maxOutputLength: 50 * 1024 * 1024 });
      else if (/\.gpx$/i.test(name)) throw new Error(`Niet-ondersteunde ZIP-compressie voor ${name}`);

      if (data && data.length !== uncompressedSize) {
        throw new Error(`Onvolledig ZIP-bestand: ${name}`);
      }
      if (data) entries.push({ name, data });
    }

    entryOffset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function parsePoint(tag, source) {
  const attributes = new Map(
    [...tag.matchAll(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/g)].map(match => [match[1], match[3]])
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
  return [latitude, longitude];
}

function parsePoints(content, tagName, source) {
  return [...content.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "gi"))]
    .map(match => parsePoint(match[0], source));
}

function parseGpx(content, source) {
  const tracks = [...content.matchAll(/<trkseg\b[^>]*>([\s\S]*?)<\/trkseg>/gi)]
    .map(match => parsePoints(match[1], "trkpt", source))
    .filter(segment => segment.length > 1);
  if (tracks.length > 0) return tracks;

  return [...content.matchAll(/<rte\b[^>]*>([\s\S]*?)<\/rte>/gi)]
    .map(match => parsePoints(match[1], "rtept", source))
    .filter(segment => segment.length > 1);
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
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;
    let furthestIndex = -1;
    let furthestDistanceSquared = toleranceSquared;

    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const point = coordinates[index];
      const projection =
        lengthSquared === 0
          ? 0
          : Math.max(
              0,
              Math.min(
                1,
                ((point[0] - start[0]) * deltaX + (point[1] - start[1]) * deltaY) / lengthSquared
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

function pointInRing(longitude, latitude, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [longitude1, latitude1] = ring[index];
    const [longitude2, latitude2] = ring[previous];
    if (
      (latitude1 > latitude) !== (latitude2 > latitude) &&
      longitude < ((longitude2 - longitude1) * (latitude - latitude1)) / (latitude2 - latitude1) + longitude1
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function isInCountry([latitude, longitude], rings) {
  return rings.some(ring => pointInRing(longitude, latitude, ring));
}

function prepareProvinces(featureCollection) {
  const provinces = featureCollection.features
    .map(feature => ({
      name: feature.properties.naam,
      rings: feature.geometry.coordinates.map(polygon => polygon[0])
    }))
    .filter(province => province.name && province.rings.length > 0);
  if (provinces.length !== 12) {
    throw new Error(`Er werden ${provinces.length} provincies gevonden; verwacht werden er 12.`);
  }
  return provinces;
}

function distanceToRing(latitude, longitude, ring) {
  const latitudeScale = 111320;
  const longitudeScale = latitudeScale * Math.cos((latitude * Math.PI) / 180);
  const pointX = longitude * longitudeScale;
  const pointY = latitude * latitudeScale;
  let minimumDistanceSquared = Infinity;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [longitude1, latitude1] = ring[index];
    const [longitude2, latitude2] = ring[previous];
    const startX = longitude1 * longitudeScale;
    const startY = latitude1 * latitudeScale;
    const deltaX = (longitude2 - longitude1) * longitudeScale;
    const deltaY = (latitude2 - latitude1) * latitudeScale;
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;
    const projection =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((pointX - startX) * deltaX + (pointY - startY) * deltaY) / lengthSquared
            )
          );
    const distanceX = pointX - (startX + projection * deltaX);
    const distanceY = pointY - (startY + projection * deltaY);
    minimumDistanceSquared = Math.min(
      minimumDistanceSquared,
      distanceX * distanceX + distanceY * distanceY
    );
  }
  return minimumDistanceSquared;
}

function provinceForTrack(segments, provinces) {
  const pointCounts = new Map(provinces.map(province => [province.name, 0]));
  const points = segments.flat();

  for (const point of points) {
    for (const province of provinces) {
      if (province.rings.some(ring => pointInRing(point[1], point[0], ring))) {
        pointCounts.set(province.name, pointCounts.get(province.name) + 1);
        break;
      }
    }
  }

  const largestCount = Math.max(...pointCounts.values());
  if (largestCount > 0) {
    return [...pointCounts].find(([, count]) => count === largestCount)[0];
  }

  const latitude = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const longitude = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  return provinces
    .map(province => ({
      name: province.name,
      distanceSquared: Math.min(
        ...province.rings.map(ring => distanceToRing(latitude, longitude, ring))
      )
    }))
    .sort((first, second) => first.distanceSquared - second.distanceSquared)[0].name;
}

function trackIsInNetherlands(segments, sourcePage, countryRings) {
  const points = segments.flat();
  const insideCount = points.filter(point => isInCountry(point, countryRings)).length;
  if (insideCount / points.length >= 0.5) return true;

  // The land boundary excludes Dutch territorial waters around Den Helder.
  return sourcePage === denHelderPage && points.every(([lat, lon]) =>
    lat >= 52.75 && lat <= 53.1 && lon >= 4.5 && lon <= 5.05
  );
}

function trackName(filename) {
  return path
    .basename(filename, path.extname(filename))
    .replace(/[_-]+/g, " ")
    .replace(/([a-zà-ÿ])([A-Z])/g, "$1 $2")
    .replace(/([^\d\s])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .replace(/\b(\d+(?:[.,]\d+)?)\s*km\b/gi, "$1 km")
    .trim();
}

function routeLocation(title, pageUrl) {
  const cleaned = title
    .replace(/^kanoroutes?\s*/i, "")
    .replace(/\s*[-|].*$/, "")
    .trim();
  if (cleaned) return cleaned;
  return path.basename(new URL(pageUrl).pathname, ".htm").replace(/^nl-/, "");
}

function displayRouteName(location, filename) {
  const name = trackName(filename)
    .replace(/\s+\d+(?:[.,]\d+)?\s*km$/i, "")
    .trim();
  return name.toLocaleLowerCase("nl").includes(location.toLocaleLowerCase("nl"))
    ? name
    : `${location} · ${name}`;
}

function collectRoutePages(homepage) {
  const pageUrls = new Set();
  for (const match of homepage.matchAll(/<a\b[^>]*href\s*=\s*(["'])(.*?)\1/gi)) {
    const url = new URL(decodeHtml(match[2]), homepageUrl);
    if (
      url.protocol === "https:" &&
      url.hostname === "kanoroutes.nl" &&
      /^\/nl-[a-z0-9-]+\.htm$/i.test(url.pathname)
    ) {
      pageUrls.add(url.href);
    }
  }
  return [...pageUrls];
}

function collectAssets(pageHtml, pageUrl) {
  const assets = [];
  for (const match of pageHtml.matchAll(
    /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi
  )) {
    const url = new URL(decodeHtml(match[2]), pageUrl);
    if (
      url.protocol === "https:" &&
      url.hostname === "kanoroutes.nl" &&
      /\.(?:gpx|zip)$/i.test(url.pathname)
    ) {
      assets.push(url.href);
    }
  }
  return assets;
}

async function mapConcurrent(items, concurrency, callback) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await callback(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function main() {
  if (process.argv.includes("--regroup-existing")) {
    const source = await readFile(outputPath, "utf8");
    const prefix = "window.GPX_ROUTES_KANOROUTES = ";
    if (!source.startsWith(prefix)) {
      throw new Error(`Ongeldig routebestand: ${outputPath}`);
    }

    const routes = JSON.parse(source.slice(prefix.length).trim().replace(/;\s*$/, ""));
    if (!Array.isArray(routes) || routes.length === 0) {
      throw new Error(`Geen routes gevonden in ${outputPath}`);
    }
    const provinceJson = await fetchText(provincesUrl);
    const provinces = prepareProvinces(JSON.parse(provinceJson));
    for (const route of routes) {
      route.province = provinceForTrack(route.segments, provinces);
      route.folder = route.province;
    }
    routes.sort((first, second) =>
      first.province.localeCompare(second.province, "nl") ||
      first.location.localeCompare(second.location, "nl") ||
      first.name.localeCompare(second.name, "nl")
    );
    await writeFile(outputPath, `window.GPX_ROUTES_KANOROUTES = ${JSON.stringify(routes)};\n`, "utf8");
    console.log(`Nederlandse routes: ${routes.length}`);
    console.log(`Provincies: ${new Set(routes.map(route => route.province)).size}`);
    console.log(`Databestand: ${outputPath}`);
    return;
  }

  const [homepage, boundaryJson, provinceJson] = await Promise.all([
    fetchText(homepageUrl),
    fetchText(boundaryUrl),
    fetchText(provincesUrl)
  ]);
  const boundary = JSON.parse(boundaryJson);
  const netherlands = boundary.features.find(feature => feature.properties.ADMIN === "Netherlands");
  if (!netherlands) throw new Error("Nederlandse landsgrens niet gevonden in de Natural Earth-data.");
  const provinces = prepareProvinces(JSON.parse(provinceJson));

  const countryRings = netherlands.geometry.coordinates
    .map(polygon => polygon[0])
    .filter(ring => {
      const longitudes = ring.map(point => point[0]);
      const latitudes = ring.map(point => point[1]);
      return (
        Math.max(...longitudes) > 2 &&
        Math.min(...longitudes) < 8 &&
        Math.max(...latitudes) > 50 &&
        Math.min(...latitudes) < 55
      );
    });
  if (countryRings.length === 0) throw new Error("Geen Nederlandse grenspolygonen gevonden.");

  const pageUrls = collectRoutePages(homepage);
  const pages = await mapConcurrent(pageUrls, maxConcurrentRequests, async url => {
    const html = await fetchText(url);
    const title = extractText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
    return { url, title, assets: collectAssets(html, url) };
  });
  const assetPages = new Map();
  for (const page of pages) {
    for (const asset of page.assets) {
      if (!assetPages.has(asset)) assetPages.set(asset, page);
    }
  }

  const missingFiles = [];
  const routes = [];
  let excludedForeignRoutes = 0;
  const assets = [...assetPages.entries()];
  await mapConcurrent(assets, maxConcurrentRequests, async ([asset, page]) => {
    const bytes = await fetchBytes(asset);
    if (!bytes) {
      missingFiles.push(asset);
      return;
    }

    const entries = /\.zip$/i.test(new URL(asset).pathname)
      ? parseZip(bytes)
      : [{ name: path.basename(new URL(asset).pathname), data: bytes }];
    const gpxEntries = entries.filter(entry => /\.gpx$/i.test(entry.name));

    for (const entry of gpxEntries) {
      const source = `${asset}#${encodeURIComponent(entry.name)}`;
      const originalSegments = parseGpx(entry.data.toString("utf8"), source);
      if (originalSegments.length === 0) {
        throw new Error(`Geen routepunten gevonden in ${source}`);
      }
      if (!trackIsInNetherlands(originalSegments, path.basename(new URL(page.url).pathname), countryRings)) {
        excludedForeignRoutes += 1;
        continue;
      }

      const province = provinceForTrack(originalSegments, provinces);
      routes.push({
        name: displayRouteName(routeLocation(page.title, page.url), entry.name),
        folder: province,
        province,
        location: routeLocation(page.title, page.url),
        source: asset,
        sourcePage: page.url,
        sourcePointCount: originalSegments.reduce((sum, segment) => sum + segment.length, 0),
        segments: originalSegments.map(simplifySegment)
      });
    }
  });

  if (routes.length === 0) throw new Error("Geen Nederlandse GPS-routes gevonden.");
  routes.sort((first, second) =>
    first.location.localeCompare(second.location, "nl") || first.name.localeCompare(second.name, "nl")
  );
  const displayedPoints = routes.reduce(
    (total, route) => total + route.segments.reduce((sum, segment) => sum + segment.length, 0),
    0
  );
  await writeFile(outputPath, `window.GPX_ROUTES_KANOROUTES = ${JSON.stringify(routes)};\n`, "utf8");

  console.log(`Nederlandse routes: ${routes.length}`);
  console.log(`Provincies: ${new Set(routes.map(route => route.province)).size}`);
  console.log(`Routepagina's gecontroleerd: ${pages.length}`);
  console.log(`Unieke GPX/ZIP-bestanden: ${assets.length}`);
  console.log(`Routes buiten Nederland uitgesloten: ${excludedForeignRoutes}`);
  console.log(`GPS-punten na vereenvoudiging (${simplificationToleranceMeters} m): ${displayedPoints}`);
  if (missingFiles.length > 0) {
    console.warn(`Niet-beschikbare routebestanden (${missingFiles.length}):`);
    missingFiles.forEach(url => console.warn(`- ${url}`));
  }
  console.log(`Databestand: ${outputPath}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
