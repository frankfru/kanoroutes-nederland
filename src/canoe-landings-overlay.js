const validOsmTypes = new Set(["node", "way", "relation"]);
const categories = {
  "landing-portage": { label: "Mogelijke kanosteiger en overdraagpunt", color: "#624174", fillColor: "#a967c4" },
  landing: { label: "Mogelijke kanosteiger", color: "#174f45", fillColor: "#42c99a" },
  portage: { label: "Overdraagpunt", color: "#7a3d00", fillColor: "#f5a623" }
};

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
    Object.hasOwn(categories, properties.category) &&
    Array.isArray(properties.portageSources) &&
    properties.portageSources.every(id => typeof id === "string" && /^(node|way|relation)\/[0-9]+$/.test(id)) &&
    properties.tags && typeof properties.tags === "object" &&
    !Array.isArray(properties.tags) &&
    Array.isArray(properties.matchedBy) &&
    properties.matchedBy.every(match => typeof match === "string");
}

function createPopupContent(feature) {
  const { osmType, osmId, category, portageSources, tags } = feature.properties;
  const content = document.createElement("div");
  const heading = document.createElement("strong");
  heading.textContent = tags.name || categories[category].label;
  content.append(heading);

  const classification = document.createElement("p");
  classification.textContent = categories[category].label;
  content.append(classification);

  if (portageSources.length > 0) {
    const sources = document.createElement("p");
    sources.append(category === "landing-portage"
      ? "Overdraagpunt afgeleid van nabijgelegen OSM-elementen: "
      : "Samengevoegde OSM-elementen: ");
    portageSources.forEach((id, index) => {
      if (index > 0) sources.append(", ");
      const sourceLink = document.createElement("a");
      sourceLink.href = `https://www.openstreetmap.org/${id}`;
      sourceLink.target = "_blank";
      sourceLink.rel = "noopener noreferrer";
      sourceLink.textContent = id;
      sources.append(sourceLink);
    });
    content.append(sources);
  }

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
            typeof data.selectionIncomplete !== "boolean" ||
            data.features.some(feature => !isValidFeature(feature))) {
          throw new Error("De kanosteigerdata heeft een onbekend of ongeldig GeoJSON-formaat.");
        }
        markersLayer = L.geoJSON(data, {
          pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
            radius: 5,
            color: categories[feature.properties.category].color,
            weight: 1.5,
            fillColor: categories[feature.properties.category].fillColor,
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
    setStatus("Mogelijke kanosteigers en overdraagpunten laden…");
    try {
      const data = await load();
      if (!map.hasLayer(layer)) return;
      if (!layer.hasLayer(markersLayer)) layer.addLayer(markersLayer);
      const warning = data.selectionIncomplete ? " Let op: de bronselectie is onvolledig; sommige overdraagpunten kunnen ontbreken." : "";
      setStatus(`${data.features.length.toLocaleString("nl-NL")} OSM-punten. Groen: mogelijke kanosteiger; paars: kanosteiger en overdraagpunt; oranje: overdraagpunt. Een overdraagpunt is niet noodzakelijk een rustplek.${warning}`);
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
