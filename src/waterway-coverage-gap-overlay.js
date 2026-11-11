function isValidLine(line) {
  return Array.isArray(line) && line.length >= 2 &&
    line.every(point => Array.isArray(point) && point.length === 2 &&
      Number.isFinite(point[0]) && Number.isFinite(point[1]));
}

function isValidGap(gap) {
  return gap && typeof gap.id === "string" &&
    typeof gap.waterwayName === "string" &&
    isValidLine(gap.line);
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

export function createWaterwayCoverageGapOverlay({ map, L, showError }) {
  map.createPane("waterwayCoverageGapPane");
  map.getPane("waterwayCoverageGapPane").style.zIndex = "405";
  map.getPane("waterwayCoverageGapPane").style.pointerEvents = "none";
  const layer = L.layerGroup();
  const statusControl = L.control({ position: "bottomleft" });
  let statusElement;
  let statusAdded = false;
  let loading;
  let gaps;

  statusControl.onAdd = () => {
    statusElement = L.DomUtil.create("div", "leaflet-control-layers waterway-coverage-gap-status");
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
    if (gaps) return Promise.resolve(gaps);
    loading ||= fetch("waterway-coverage-gaps.json")
      .then(response => {
        if (!response.ok) {
          throw new Error(`De NWB-vaarwegdekking kon niet worden geladen (HTTP ${response.status}). Bouw het bestand met node scripts/build-waterway-coverage-gaps.js.`);
        }
        return response.json();
      })
      .then(data => {
        if (data.version !== 1 || !Array.isArray(data.lines) ||
            data.lines.some(gap => !isValidGap(gap))) {
          throw new Error("De data voor ontbrekende NWB-vaarwegen heeft een onbekend formaat.");
        }
        gaps = data.lines.map(gap => ({ ...gap, bounds: getLineBounds(gap.line) }));
        return gaps;
      })
      .catch(error => {
        loading = null;
        throw error;
      });
    return loading;
  }

  function render() {
    const view = map.getBounds();
    const visible = gaps.filter(gap => intersects(gap.bounds, view));
    layer.clearLayers();
    if (visible.length > 0) {
      L.polyline(visible.map(gap => gap.line), {
        color: "#d43f52",
        weight: 4,
        opacity: 0.95,
        pane: "waterwayCoverageGapPane",
        interactive: false
      }).addTo(layer);
    }
    setStatus(visible.length === 0
      ? "Geen NWB-vaarwegen buiten de vaarwegdekking in dit kaartbeeld."
      : `${visible.length.toLocaleString("nl-NL")} niet-gedekte NWB-trajecten in dit kaartbeeld.`);
  }

  async function activate() {
    if (!map.hasLayer(layer)) return;
    setStatus("Niet-gedekte NWB-vaarwegen laden…");
    try {
      await load();
      if (map.hasLayer(layer)) render();
    } catch (error) {
      console.error("Niet-gedekte NWB-vaarwegen laden mislukt:", error);
      setStatus("Niet-gedekte NWB-vaarwegen konden niet worden geladen.");
      showError(error.message || "De niet-gedekte NWB-vaarwegen konden niet worden geladen.");
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
    if (map.hasLayer(layer) && gaps) render();
  });
  return layer;
}
