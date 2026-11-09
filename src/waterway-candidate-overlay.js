function isValidLine(line) {
  return Array.isArray(line) && line.length >= 2 &&
    line.every(point => Array.isArray(point) && point.length === 2 &&
      Number.isFinite(point[0]) && Number.isFinite(point[1]));
}

function isValidCandidate(candidate) {
  return candidate && Number.isSafeInteger(candidate.id) &&
    isValidLine(candidate.line) &&
    ["connected", "wide-water", "both"].includes(candidate.reason);
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

export function createWaterwayCandidateOverlay({ map, L, showError }) {
  map.createPane("waterwayCandidatePane");
  map.getPane("waterwayCandidatePane").style.zIndex = "410";
  map.getPane("waterwayCandidatePane").style.pointerEvents = "none";
  const layer = L.layerGroup();
  const statusControl = L.control({ position: "bottomleft" });
  let statusElement;
  let statusAdded = false;
  let loading;
  let candidates;

  statusControl.onAdd = () => {
    statusElement = L.DomUtil.create("div", "leaflet-control-layers waterway-candidate-status");
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
    if (candidates) return Promise.resolve(candidates);
    loading ||= fetch("waterway-coverage-candidates.json")
      .then(response => {
        if (!response.ok) {
          throw new Error(`De toegevoegde vaarwegtrajecten konden niet worden geladen (HTTP ${response.status}). Bouw de data met node scripts/build-lake-waterway-lines.js.`);
        }
        return response.json();
      })
      .then(data => {
        if (data.version !== 1 || !Array.isArray(data.lines) ||
            data.lines.some(candidate => !isValidCandidate(candidate))) {
          throw new Error("De data voor toegevoegde vaarwegtrajecten heeft een onbekend formaat.");
        }
        candidates = data.lines.map(candidate => ({
          ...candidate,
          bounds: getLineBounds(candidate.line)
        }));
        return candidates;
      })
      .catch(error => {
        loading = null;
        throw error;
      });
    return loading;
  }

  function render() {
    const view = map.getBounds();
    const visible = candidates.filter(candidate => intersects(candidate.bounds, view));
    const categories = [
      { reason: "connected", color: "#00838f" },
      { reason: "wide-water", color: "#ef8c00" },
      { reason: "both", color: "#8e44ad" }
    ];
    layer.clearLayers();
    for (const category of categories) {
      const lines = visible
        .filter(candidate => candidate.reason === category.reason)
        .map(candidate => candidate.line);
      if (lines.length > 0) {
        L.polyline(lines, {
          color: category.color,
          weight: 4,
          opacity: 0.95,
          pane: "waterwayCandidatePane",
          interactive: false
        }).addTo(layer);
      }
    }

    const counts = {
      connected: visible.filter(candidate => candidate.reason === "connected").length,
      wide: visible.filter(candidate => candidate.reason === "wide-water").length,
      both: visible.filter(candidate => candidate.reason === "both").length
    };
    const total = visible.length;
    setStatus(total === 0
      ? "Geen toegevoegde trajecten in dit kaartbeeld."
      : `${total.toLocaleString("nl-NL")} toegevoegde trajecten. Turquoise: ${counts.connected.toLocaleString("nl-NL")} met gedeelde OSM-knooppunten; oranje: ${counts.wide.toLocaleString("nl-NL")} door breed water; paars: ${counts.both.toLocaleString("nl-NL")} via beide.`);
  }

  async function activate() {
    if (!map.hasLayer(layer)) return;
    setStatus("Toegevoegde vaarwegtrajecten laden…");
    try {
      await load();
      if (map.hasLayer(layer)) render();
    } catch (error) {
      console.error("Toegevoegde vaarwegtrajecten laden mislukt:", error);
      setStatus("Toegevoegde vaarwegtrajecten konden niet worden geladen.");
      showError(error.message || "De toegevoegde vaarwegtrajecten konden niet worden geladen.");
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
    if (map.hasLayer(layer) && candidates) render();
  });
  return layer;
}
