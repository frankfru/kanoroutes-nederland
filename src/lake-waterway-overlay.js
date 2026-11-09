function isValidLine(line) {
  return Array.isArray(line) && line.length >= 2 &&
    line.every(point => Array.isArray(point) && point.length === 2 &&
      Number.isFinite(point[0]) && Number.isFinite(point[1]));
}

function getLineBounds(line) {
  return line.reduce((bounds, [latitude, longitude]) => ({
    south: Math.min(bounds.south, latitude),
    north: Math.max(bounds.north, latitude),
    west: Math.min(bounds.west, longitude),
    east: Math.max(bounds.east, longitude)
  }), { south: Infinity, north: -Infinity, west: Infinity, east: -Infinity });
}

function intersects(bounds, view) {
  return bounds.north >= view.getSouth() && bounds.south <= view.getNorth() &&
    bounds.east >= view.getWest() && bounds.west <= view.getEast();
}

export function createLakeWaterwayOverlay({ map, L, showError }) {
  map.createPane("lakeWaterwayPane");
  map.getPane("lakeWaterwayPane").style.zIndex = "400";
  map.getPane("lakeWaterwayPane").style.pointerEvents = "none";
  const layer = L.layerGroup();
  const statusControl = L.control({ position: "bottomleft" });
  let statusElement;
  let statusAdded = false;
  let loading;
  let lines;

  statusControl.onAdd = () => {
    statusElement = L.DomUtil.create("div", "leaflet-control-layers lake-waterway-status");
    statusElement.setAttribute("role", "status");
    statusElement.setAttribute("aria-live", "polite");
    return statusElement;
  };

  function setStatus(message) {
    if (!statusAdded) {
      statusControl.addTo(map);
      statusAdded = true;
    }
    statusElement.textContent = message;
  }

  function load() {
    if (lines) return Promise.resolve(lines);
    loading ||= fetch("lake-waterway-lines.json")
      .then(response => {
        if (!response.ok) {
          throw new Error(`De OSM-overlaydata kon niet worden geladen (HTTP ${response.status}). Bouw het bestand met node scripts/build-lake-waterway-lines.js.`);
        }
        return response.json();
      })
      .then(data => {
        if (data.version !== 1 || !Array.isArray(data.lines) || data.lines.some(line => !isValidLine(line))) {
          throw new Error("De OSM-overlaydata heeft een onbekend formaat.");
        }
        lines = data.lines.map(line => ({ line, bounds: getLineBounds(line) }));
        return lines;
      })
      .catch(error => {
        loading = null;
        throw error;
      });
    return loading;
  }

  function render() {
    const view = map.getBounds();
    const visibleLines = lines.filter(item => intersects(item.bounds, view));
    layer.clearLayers();
    if (visibleLines.length > 0) {
      L.polyline(visibleLines.map(item => item.line), {
        color: "#9b3bb2",
        weight: 3,
        opacity: 0.9,
        pane: "lakeWaterwayPane",
        interactive: false
      }).addTo(layer);
    }
    setStatus(visibleLines.length === 0
      ? "Geen niet-opgenomen OSM-waterwegen die meren raken in dit kaartbeeld."
      : `${visibleLines.length.toLocaleString("nl-NL")} niet-opgenomen OSM-waterwegen die meren raken in dit kaartbeeld.`);
  }

  async function activate() {
    if (!map.hasLayer(layer)) return;
    setStatus("OSM-waterweglijnen op meren laden…");
    try {
      await load();
      if (map.hasLayer(layer)) render();
    } catch (error) {
      console.error("OSM-waterweglijnen op meren laden mislukt:", error);
      setStatus("OSM-waterweglijnen konden niet worden geladen.");
      showError(error.message || "De OSM-waterweglijnen op meren konden niet worden geladen.");
    }
  }

  map.on("layeradd", event => {
    if (event.layer === layer) activate();
  });
  map.on("layerremove", event => {
    if (event.layer !== layer) return;
    if (statusAdded) statusControl.remove();
    statusAdded = false;
    statusElement = null;
  });
  map.on("moveend", () => {
    if (map.hasLayer(layer) && lines) render();
  });
  return layer;
}
