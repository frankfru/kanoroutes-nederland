function isValidFeature(feature) {
  const coordinates = feature?.geometry?.coordinates;
  const properties = feature?.properties;
  return feature?.type === "Feature" &&
    feature.geometry.type === "Point" &&
    Array.isArray(coordinates) && coordinates.length === 2 &&
    Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1]) &&
    coordinates[0] >= -180 && coordinates[0] <= 180 &&
    coordinates[1] >= -90 && coordinates[1] <= 90 &&
    ["node", "way", "relation"].includes(properties?.osmType) &&
    Number.isSafeInteger(properties.osmId) &&
    properties.tags && typeof properties.tags === "object" &&
    !Array.isArray(properties.tags);
}

function createPopupContent(feature) {
  const { osmType, osmId, tags } = feature.properties;
  const content = document.createElement("div");
  const heading = document.createElement("strong");
  heading.textContent = tags.name || "Punt uit de vorige selectie";
  content.append(heading);

  const message = document.createElement("p");
  message.textContent = "Dit OSM-element staat in de eerdere selectie, maar niet als punt in de huidige selectie.";
  content.append(message);

  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "Tags in het eerdere bestand";
  details.append(summary);
  const tagList = document.createElement("dl");
  for (const [key, value] of Object.entries(tags)) {
    const term = document.createElement("dt");
    term.textContent = key;
    const description = document.createElement("dd");
    description.textContent = String(value);
    tagList.append(term, description);
  }
  details.append(tagList);
  content.append(details);

  const link = document.createElement("a");
  link.href = `https://www.openstreetmap.org/${osmType}/${osmId}`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Bekijk in OpenStreetMap";
  content.append(link);
  return content;
}

export function createPreviousCanoeLandingsOverlay({ map, L, showError }) {
  map.createPane("previousCanoeLandingsPane");
  map.getPane("previousCanoeLandingsPane").style.zIndex = "432";
  const layer = L.layerGroup();
  const statusControl = L.control({ position: "bottomleft" });
  let statusElement;
  let statusAdded = false;
  let loading;
  let markersLayer;

  statusControl.onAdd = () => {
    statusElement = L.DomUtil.create("div", "leaflet-control-layers previous-canoe-landings-status");
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
    loading ||= fetch("canoe-landings-previous-only.json")
      .then(response => {
        if (!response.ok) throw new Error(`De historische kanosteigerpunten konden niet worden geladen (HTTP ${response.status}).`);
        return response.json();
      })
      .then(data => {
        if (data.type !== "FeatureCollection" || !Array.isArray(data.features) ||
            data.count !== data.features.length ||
            !data.comparison || data.features.some(feature => !isValidFeature(feature))) {
          throw new Error("De historische kanosteigerpunten hebben een onbekend of ongeldig formaat.");
        }
        markersLayer = L.geoJSON(data, {
          pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
            radius: 5,
            color: "#702f48",
            weight: 1.5,
            fillColor: "#e87891",
            fillOpacity: 0.9,
            pane: "previousCanoeLandingsPane",
            bubblingMouseEvents: false
          }),
          onEachFeature: (feature, marker) => marker.bindPopup(
            () => createPopupContent(feature),
            { maxWidth: 300, maxHeight: 320 }
          )
        });
        return data;
      })
      .catch(error => {
        loading = null;
        throw error;
      });
    return loading;
  }

  async function activate() {
    if (!map.hasLayer(layer)) return;
    setStatus("Historische punten laden…");
    try {
      const data = await load();
      if (!map.hasLayer(layer)) return;
      if (!layer.hasLayer(markersLayer)) layer.addLayer(markersLayer);
      const previousDate = data.comparison.previousOsmBaseTimestamp || "onbekende datum";
      const currentDate = data.comparison.currentOsmBaseTimestamp || "onbekende datum";
      setStatus(`${data.count.toLocaleString("nl-NL")} punten uit de eerdere selectie (${previousDate}) die niet als punt in de huidige selectie (${currentDate}) staan. Roze: historische punten; controleer de huidige OSM-status.`);
    } catch (error) {
      console.error("Historische kanosteigerlaag laden mislukt:", error);
      setStatus("De historische kanosteigerlaag kon niet worden geladen.");
      showError(error.message || "De historische kanosteigerlaag kon niet worden geladen.");
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
  return layer;
}
