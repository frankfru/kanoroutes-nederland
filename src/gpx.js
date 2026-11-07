const gpxMimeType = "application/gpx+xml;charset=utf-8";

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

export function downloadGpxTrack(name, segments, fallback) {
  downloadGpxFile(
    `${createGpxFileName(name, fallback)}.gpx`,
    createGpxTrack(name, segments)
  );
}
