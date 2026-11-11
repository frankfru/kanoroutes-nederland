const validOsmTypes = new Set(["node", "way", "relation"]);

function isValidFeature(feature) {
  const coordinates = feature?.geometry?.coordinates;
  const properties = feature?.properties;
  return feature?.type === "Feature" &&
    feature.geometry.type === "Point" &&
    Array.isArray(coordinates) && coordinates.length === 2 &&
    Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1]) &&
    coordinates[0] >= -180 && coordinates[0] <= 180 &&
    coordinates[1] >= -90 && coordinates[1] <= 90 &&
    validOsmTypes.has(properties?.osmType) &&
    Number.isSafeInteger(properties.osmId) &&
    properties.tags && typeof properties.tags === "object" &&
    !Array.isArray(properties.tags) &&
    Array.isArray(properties.matchedBy) &&
    properties.matchedBy.every(match => typeof match === "string");
}

function createPopupContent(feature) {
  const { osmType, osmId, matchedBy, tags } = feature.properties;
  const content = document.createElement("div");
  const heading = document.createElement("strong");
  heading.textContent = tags.name || "Mogelijke kanosteiger";
  content.append(heading);

  const methods = document.createElement("p");
  methods.textContent = `Geselecteerd op basis van: ${matchedBy.join(", ") || "OSM-tags"}`;
  content.append(methods);

  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "OpenStreetMap-tags";
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

export function createCanoeLandingsOverlay({ map, L, showError }) {
  map.createPane("canoeLandingsPane");
  map.getPane("canoeLandingsPane").style.zIndex = "430";
  const layer = L.layerGroup();
  const statusControl = L.control({ position: "bottomleft" });
  let statusElement;
  let statusAdded = false;
  let loading;
  let markersLayer;

  statusControl.onAdd = () => {
    statusElement = L.DomUtil.create("div", "leaflet-control-layers canoe-landings-status");
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
    loading ||= fetch("canoe-landings.json")
      .then(response => {
        if (!response.ok) {
          throw new Error(`De kanosteigerdata kon niet worden geladen (HTTP ${response.status}). Zorg dat canoe-landings.json naast index.html staat.`);
        }
        return response.json();
      })
      .then(data => {
        if (data.type !== "FeatureCollection" || !Array.isArray(data.features) ||
            data.count !== data.features.length ||
            data.features.some(feature => !isValidFeature(feature))) {
          throw new Error("De kanosteigerdata heeft een onbekend of ongeldig GeoJSON-formaat.");
        }
        markersLayer = L.geoJSON(data, {
          pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
            radius: 5,
            color: "#174f45",
            weight: 1.5,
            fillColor: "#42c99a",
            fillOpacity: 0.9,
            pane: "canoeLandingsPane",
            bubblingMouseEvents: false
          }),
          onEachFeature: (feature, marker) => {
            marker.bindPopup(() => createPopupContent(feature), { maxWidth: 300, maxHeight: 320 });
          }
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
    setStatus("Mogelijke kanosteigers laden…");
    try {
      const data = await load();
      if (!map.hasLayer(layer)) return;
      if (!layer.hasLayer(markersLayer)) layer.addLayer(markersLayer);
      setStatus(`${data.features.length.toLocaleString("nl-NL")} mogelijke kanosteigers uit OpenStreetMap. Klik op een punt voor details.`);
    } catch (error) {
      console.error("Kanosteigerlaag laden mislukt:", error);
      setStatus("De kanosteigerlaag kon niet worden geladen.");
      showError(error.message || "De kanosteigerlaag kon niet worden geladen.");
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
