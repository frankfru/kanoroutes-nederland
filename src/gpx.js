const gpxMimeType = "application/gpx+xml;charset=utf-8";
export const MAX_GPX_BYTES = 10 * 1024 * 1024;

export async function readGpxFile(file) {
  if (!file || file.size === 0) throw new Error("Het GPX-bestand is leeg.");
  if (file.size > MAX_GPX_BYTES) throw new Error("Het GPX-bestand is groter dan 10 MB.");
  const text = await file.text();
  if (/<!DOCTYPE/i.test(text)) throw new Error("GPX-bestanden met een documenttype worden niet ondersteund.");
  const document = new DOMParser().parseFromString(text, "application/xml");
  const root = document.documentElement;
  const namespace = root?.namespaceURI || "";
  if (document.querySelector("parsererror") || root?.localName !== "gpx" ||
      !["", "http://www.topografix.com/GPX/1/0", "http://www.topografix.com/GPX/1/1"].includes(namespace)) {
    throw new Error("Het bestand is geen geldig GPX-bestand.");
  }
  const children = (element, name) => Array.from(element.children)
    .filter(child => child.localName === name && (child.namespaceURI || "") === namespace);
  const readPoints = (element, pointName) => {
    const points = children(element, pointName).map(point => {
      const lat = point.getAttribute("lat");
      const lon = point.getAttribute("lon");
      if (lat === null || lon === null || !lat.trim() || !lon.trim() ||
          !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon)) ||
          Number(lat) < -90 || Number(lat) > 90 || Number(lon) < -180 || Number(lon) > 180) {
        throw new Error("Het GPX-bestand bevat een ongeldig GPS-punt.");
      }
      return [Number(lat), Number(lon)];
    });
    if (points.length < 2) throw new Error("Elk GPX-routegedeelte moet minstens twee punten bevatten.");
    return points;
  };
  const segments = [];
  let name = "";
  for (const element of Array.from(root.children)) {
    if ((element.namespaceURI || "") !== namespace) continue;
    if (element.localName === "trk") {
      if (!name) name = children(element, "name")[0]?.textContent.trim() || "";
      for (const segment of children(element, "trkseg")) segments.push(readPoints(segment, "trkpt"));
    } else if (element.localName === "rte") {
      if (!name) name = children(element, "name")[0]?.textContent.trim() || "";
      segments.push(readPoints(element, "rtept"));
    }
  }
  if (segments.length === 0) throw new Error("Het GPX-bestand bevat geen bruikbare track of route.");
  return { name: name || file.name.replace(/\.gpx$/i, "") || "Geïmporteerde route", segments };
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&apos;"
  })[character]);
}

export function createGpxTrack(name, segments) {
  const validSegments = segments
    .filter(segment => Array.isArray(segment) && segment.length > 1)
    .map(segment => segment.map(coordinate => {
      if (!Array.isArray(coordinate) || coordinate.length < 2 ||
          !Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1]) ||
          coordinate[0] < -90 || coordinate[0] > 90 ||
          coordinate[1] < -180 || coordinate[1] > 180) {
        throw new Error("De route bevat een ongeldig GPS-punt.");
      }
      return coordinate;
    }));
  if (validSegments.length === 0) {
    throw new Error("De route bevat geen bruikbare routelijn.");
  }

  const trackSegments = validSegments.map(segment => {
    const trackPoints = segment.map(([latitude, longitude]) =>
      `      <trkpt lat="${latitude.toFixed(7)}" lon="${longitude.toFixed(7)}"></trkpt>`
    ).join("\n");
    return `    <trkseg>\n${trackPoints}\n    </trkseg>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Kajakroutes Nederland" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 https://www.topografix.com/GPX/1/1/gpx.xsd">\n  <trk>\n    <name>${escapeXml(name)}</name>\n${trackSegments}\n  </trk>\n</gpx>\n`;
}

export function createGpxFileName(name, fallback = "route") {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("nl")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

export function downloadGpxFile(fileName, gpx) {
  const fileUrl = URL.createObjectURL(new Blob([gpx], { type: gpxMimeType }));
  const link = document.createElement("a");
  link.href = fileUrl;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
}

export function normalizeGpxDownloadFileName(input) {
  const baseName = input.trim().replace(/(\.gpx)+$/i, "").trim();
  if (!baseName || /[<>:"/\\|?*\x00-\x1f]/.test(baseName) ||
      /[. ]$/.test(baseName) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(baseName)) {
    return null;
  }
  return `${baseName}.gpx`;
}

export function downloadGpxTrack(name, segments, fileName) {
  downloadGpxFile(fileName, createGpxTrack(name, segments));
}
