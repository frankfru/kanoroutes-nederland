import * as maplibregl from "https://unpkg.com/maplibre-gl@6.18.0/dist/maplibre-gl.mjs";
import {
  bindRouteCategoryButtons,
  createRouteCategoryButtons,
  loadRouteCategory,
  parseRouteCategories,
  ROUTE_CATEGORIES,
  sameRouteCategories,
  updateRouteSourceNote
} from "../shared/route-categories.js";
import { calculateDistanceKm } from "../shared/route-geometry.js";
import { createRoutePopupContent } from "../shared/route-popup.js";
import { setupMobileRouteSheet } from "../shared/mobile-route-sheet.js";

const categoryById = new Map(ROUTE_CATEGORIES.map(category => [category.id, category]));
const regionButtons = createRouteCategoryButtons(document.getElementById("region-switch"));
const routeCount = document.getElementById("route-count");
const routeList = document.getElementById("route-list");
const sourceNote = document.getElementById("source-note");
const mapLabel = document.getElementById("map-label");
const searchInput = document.getElementById("search");
const activeRegions = new Set();
const hiddenRoutes = new Set();
const routeBounds = new Map();
const routeDistances = new Map();
const routeButtons = new Map();
regionButtons.forEach(button => { button.disabled = true; });
let activeRoutes = [];
let routeEntries = [];
let allRoutesBounds = null;
let regionLoadId = 0;
let mapReady = false;
let selectedRouteIndex = null;
let hoveredRouteIndex = null;
let routePopup = null;

const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: [5.3, 52.15],
  zoom: 7
});
map.addControl(new maplibregl.NavigationControl(), "bottom-right");

const setSheetExpanded = setupMobileRouteSheet({
  sidebar: document.querySelector(".sidebar"),
  sidebarContent: document.getElementById("sidebar-content"),
  sheetToggle: document.getElementById("sheet-toggle"),
  mobileLayout: window.matchMedia("(max-width: 720px)"),
  onResize: () => requestAnimationFrame(() => map.resize())
});

function showError(message) {
  let error = document.querySelector(".map-error");
  if (!error) {
    error = document.createElement("div");
    error.className = "map-error";
    error.setAttribute("role", "alert");
    document.querySelector(".map-wrap").append(error);
  }
  error.textContent = message;
}

function updateShareUrl() {
  const url = new URL(location.href);
  url.searchParams.set("region", [...activeRegions].join(","));
  history.pushState(null, "", url);
}

function prepareRouteFeatures(routes) {
  const features = [];
  const entries = [];
  const boundsByRoute = new Map();
  let minLongitude = Infinity;
  let minLatitude = Infinity;
  let maxLongitude = -Infinity;
  let maxLatitude = -Infinity;

  routes.forEach((route, index) => {
    const segments = [];
    const distanceSegments = [];
    let routeMinLongitude = Infinity;
    let routeMinLatitude = Infinity;
    let routeMaxLongitude = -Infinity;
    let routeMaxLatitude = -Infinity;

    for (const segment of Array.isArray(route.segments) ? route.segments : []) {
      if (!Array.isArray(segment) || segment.length < 2 ||
          segment.some(point => !Array.isArray(point) || point.length < 2 ||
            !Number.isFinite(point[0]) || !Number.isFinite(point[1]))) continue;

      const coordinates = segment.map(([latitude, longitude]) => [longitude, latitude]);
      segments.push(coordinates);
      distanceSegments.push(segment);
      coordinates.forEach(([longitude, latitude]) => {
        routeMinLongitude = Math.min(routeMinLongitude, longitude);
        routeMinLatitude = Math.min(routeMinLatitude, latitude);
        routeMaxLongitude = Math.max(routeMaxLongitude, longitude);
        routeMaxLatitude = Math.max(routeMaxLatitude, latitude);
      });
    }
    if (segments.length === 0) return;

    const category = categoryById.get(route.sourceRegion);
    const bounds = [[routeMinLongitude, routeMinLatitude], [routeMaxLongitude, routeMaxLatitude]];

    boundsByRoute.set(index, bounds);
    routeDistances.set(index, calculateDistanceKm(distanceSegments));
    minLongitude = Math.min(minLongitude, routeMinLongitude);
    minLatitude = Math.min(minLatitude, routeMinLatitude);
    maxLongitude = Math.max(maxLongitude, routeMaxLongitude);
    maxLatitude = Math.max(maxLatitude, routeMaxLatitude);
    entries.push({ route, index });
    features.push({
      type: "Feature",
      id: index,
      properties: { routeIndex: index, color: category.color },
      geometry: segments.length === 1
        ? { type: "LineString", coordinates: segments[0] }
        : { type: "MultiLineString", coordinates: segments }
    });
  });

  return {
    entries,
    features,
    boundsByRoute,
    bounds: entries.length ? [[minLongitude, minLatitude], [maxLongitude, maxLatitude]] : null
  };
}

function setRouteVisible(index, visible) {
  if (visible) hiddenRoutes.delete(index);
  else hiddenRoutes.add(index);
  if (!visible && selectedRouteIndex === index) {
    clearSelection();
    return;
  }
  updateRouteFeatureState(index);
}

function updateRouteFeatureState(index) {
  map.setFeatureState({ source: "routes", id: index }, {
    hidden: hiddenRoutes.has(index),
    selected: selectedRouteIndex === index,
    hovered: hoveredRouteIndex === index,
    dimmed: selectedRouteIndex !== null && selectedRouteIndex !== index
  });
}

function updateRouteSelectionUI() {
  routeButtons.forEach((button, index) => {
    const selected = index === selectedRouteIndex;
    button.closest(".route-row").classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function clearSelection() {
  selectedRouteIndex = null;
  updateRouteSelectionUI();
  routeEntries.forEach(({ index }) => updateRouteFeatureState(index));
  routePopup?.remove();
  routePopup = null;
}

function selectRoute(index) {
  selectedRouteIndex = index;
  updateRouteSelectionUI();
  routeEntries.forEach(({ index: routeIndex }) => updateRouteFeatureState(routeIndex));
}

function toggleRouteSelection(index) {
  if (selectedRouteIndex === index) {
    clearSelection();
    return false;
  }
  routePopup?.remove();
  routePopup = null;
  selectRoute(index);
  return true;
}

function openRoutePopup(index) {
  const route = activeRoutes[index];
  const bounds = routeBounds.get(index);
  const distanceKm = routeDistances.get(index);
  if (!route || !bounds || !Number.isFinite(distanceKm)) return;

  const center = [
    (bounds[0][0] + bounds[1][0]) / 2,
    (bounds[0][1] + bounds[1][1]) / 2
  ];
  routePopup?.remove();
  routePopup = new maplibregl.Popup({ className: "maplibre-route-popup", closeOnClick: true })
    .setLngLat(center)
    .setHTML(createRoutePopupContent(route, { distanceKm, includeDeselectAction: true }))
    .addTo(map);
  routePopup.getElement().querySelector("[data-route-deselect]")?.addEventListener("click", event => {
    event.stopPropagation();
    clearSelection();
  });
}

function setHoveredRoute(index) {
  if (hoveredRouteIndex === index) return;
  const previousIndex = hoveredRouteIndex;
  hoveredRouteIndex = index;
  if (previousIndex !== null) updateRouteFeatureState(previousIndex);
  if (index !== null) updateRouteFeatureState(index);
  map.getCanvas().style.cursor = index === null ? "" : "pointer";
}

function focusRoute(index) {
  const bounds = routeBounds.get(index);
  if (!bounds) return;
  if (!toggleRouteSelection(index)) return;
  map.fitBounds(bounds, { padding: 30, maxZoom: 14 });
  openRoutePopup(index);
  setSheetExpanded(false);
  requestAnimationFrame(() => map.resize());
}

function renderList(filter = "") {
  routeList.replaceChildren();
  routeButtons.clear();
  const normalizedFilter = filter.trim().toLocaleLowerCase("nl");
  const groups = new Map();

  routeEntries.forEach(({ route, index }) => {
    const searchableText = `${route.name} ${route.location || ""} ${route.folder || route.group || ""}`.toLocaleLowerCase("nl");
    if (!searchableText.includes(normalizedFilter)) return;
    const routeGroup = route.folder || route.group || "GPS Groningen";
    const group = activeRegions.size > 1
      ? `${categoryById.get(route.sourceRegion).label} · ${routeGroup}`
      : routeGroup;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ route, index });
  });

  if (groups.size === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = activeRegions.size ? "Geen routes gevonden." : "Selecteer een routegebied om routes te tonen.";
    routeList.append(empty);
    return;
  }

  groups.forEach((items, group) => {
    const heading = document.createElement("h3");
    heading.className = "group-title";
    heading.textContent = group;
    routeList.append(heading);

    items.forEach(({ route, index }) => {
      const row = document.createElement("div");
      row.className = "route-row";
      if (index === selectedRouteIndex) row.classList.add("selected");

      const checkbox = document.createElement("input");
      checkbox.className = "route-toggle";
      checkbox.type = "checkbox";
      checkbox.checked = !hiddenRoutes.has(index);
      checkbox.setAttribute("aria-label", `Toon ${route.name} op de kaart`);

      const color = document.createElement("span");
      color.className = "route-color";
      color.style.backgroundColor = categoryById.get(route.sourceRegion).color;

      const name = document.createElement("button");
      name.className = "route-name";
      name.type = "button";
      const distanceKm = routeDistances.get(index);
      const distanceLabel = Number.isFinite(distanceKm)
        ? ` (${Math.round(distanceKm).toLocaleString("nl-NL")} km)`
        : "";
      name.textContent = `${route.name}${distanceLabel}`;
      name.title = "Zoom naar deze route";
      name.setAttribute("aria-pressed", String(index === selectedRouteIndex));

      checkbox.addEventListener("change", () => setRouteVisible(index, checkbox.checked));
      name.addEventListener("click", () => focusRoute(index));
      routeButtons.set(index, name);
      row.append(checkbox, color, name);
      routeList.append(row);
    });
  });
}

async function changeRegions(regions, { syncUrl = true } = {}) {
  if (mapReady && sameRouteCategories(regions, activeRegions) &&
      (regions.size === 0 || activeRoutes.length > 0)) return;

  const loadId = ++regionLoadId;
  const fitMap = activeRegions.size === 0;
  activeRegions.clear();
  regions.forEach(region => activeRegions.add(region));
  regionButtons.forEach(button => {
    button.setAttribute("aria-pressed", String(activeRegions.has(button.dataset.region)));
  });
  if (syncUrl) updateShareUrl();
  document.querySelector(".map-error")?.remove();

  routeList.replaceChildren();
  routeEntries.forEach(({ index }) => {
    map.setFeatureState({ source: "routes", id: index }, {
      hidden: false,
      selected: false,
      hovered: false,
      dimmed: false
    });
  });
  routeBounds.clear();
  hiddenRoutes.clear();
  routeDistances.clear();
  routePopup?.remove();
  routePopup = null;
  selectedRouteIndex = null;
  hoveredRouteIndex = null;
  map.getCanvas().style.cursor = "";
  activeRoutes = [];
  routeEntries = [];
  allRoutesBounds = null;
  mapLabel.textContent = activeRegions.size
    ? [...activeRegions].map(region => categoryById.get(region).mapLabel).join(" · ")
    : "Selecteer een routegebied";
  updateRouteSourceNote(sourceNote, activeRegions);
  map.getSource("routes").setData({ type: "FeatureCollection", features: [] });

  if (activeRegions.size === 0) {
    routeCount.textContent = "0 routes";
    renderList(searchInput.value);
    return;
  }

  routeCount.textContent = "Routes laden…";
  try {
    const routesByRegion = await Promise.all([...activeRegions].map(loadRouteCategory));
    if (regionLoadId !== loadId) return;

    activeRoutes = routesByRegion.flat();
    const preparedRoutes = prepareRouteFeatures(activeRoutes);
    routeEntries = preparedRoutes.entries;
    allRoutesBounds = preparedRoutes.bounds;
    preparedRoutes.boundsByRoute.forEach((bounds, index) => routeBounds.set(index, bounds));
    map.getSource("routes").setData({ type: "FeatureCollection", features: preparedRoutes.features });
    routeCount.textContent = `${routeEntries.length} routes`;
    renderList(searchInput.value);
    if (fitMap && allRoutesBounds) {
      map.fitBounds(allRoutesBounds, { padding: [36, 36], maxZoom: 10 });
    }
  } catch (error) {
    if (regionLoadId !== loadId) return;
    console.error("Routecategorieën laden mislukt:", error);
    routeCount.textContent = "Routes laden mislukt";
    showError("De routes konden niet worden geladen. Probeer het opnieuw.");
  }
}

searchInput.addEventListener("input", () => renderList(searchInput.value));
document.getElementById("show-all").addEventListener("click", () => {
  routeEntries.forEach(({ index }) => setRouteVisible(index, true));
  routeList.querySelectorAll(".route-toggle").forEach(checkbox => { checkbox.checked = true; });
  if (allRoutesBounds) map.fitBounds(allRoutesBounds, { padding: [36, 36], maxZoom: 10 });
});
document.getElementById("hide-all").addEventListener("click", () => {
  routeEntries.forEach(({ index }) => setRouteVisible(index, false));
  routeList.querySelectorAll(".route-toggle").forEach(checkbox => { checkbox.checked = false; });
});

map.on("load", () => {
  map.addSource("routes", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] }
  });
  const selected = ["boolean", ["feature-state", "selected"], false];
  const hovered = ["boolean", ["feature-state", "hovered"], false];
  const dimmed = ["boolean", ["feature-state", "dimmed"], false];
  map.addLayer({
    id: "route-casing",
    type: "line",
    source: "routes",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#fff",
      "line-width": ["case", selected, 8, hovered, 7.5, 7],
      "line-opacity": ["case", ["boolean", ["feature-state", "hidden"], false], 0, dimmed, 0.4, 0.98]
    }
  });
  map.addLayer({
    id: "route-lines",
    type: "line",
    source: "routes",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["case", selected, "#d93611", ["get", "color"]],
      "line-width": [
        "case",
        selected, 6,
        hovered, ["case", dimmed, 5.5, 6.5],
        dimmed, 4,
        5
      ],
      "line-opacity": [
        "case",
        ["boolean", ["feature-state", "hidden"], false], 0,
        selected, 1,
        hovered, ["case", dimmed, 0.9, 1],
        dimmed, 0.4,
        0.98
      ]
    }
  });
  map.on("click", "route-lines", event => {
    const index = Number(event.features?.[0]?.properties?.routeIndex);
    if (Number.isInteger(index) && toggleRouteSelection(index)) openRoutePopup(index);
  });
  map.on("click", event => {
    if (selectedRouteIndex === null) return;
    const clickedVisibleRoute = map.queryRenderedFeatures(event.point, { layers: ["route-lines"] })
      .some(feature => {
        const index = Number(feature.properties?.routeIndex);
        return Number.isInteger(index) && !hiddenRoutes.has(index);
      });
    if (!clickedVisibleRoute) clearSelection();
  });
  map.on("mousemove", "route-lines", event => {
    const index = Number(event.features?.[0]?.properties?.routeIndex);
    setHoveredRoute(Number.isInteger(index) ? index : null);
  });
  map.on("mouseleave", "route-lines", () => setHoveredRoute(null));
  mapReady = true;
  regionButtons.forEach(button => { button.disabled = false; });
  bindRouteCategoryButtons(regionButtons, () => activeRegions, changeRegions);

  const initialUrl = new URL(location.href);
  changeRegions(parseRouteCategories(initialUrl.searchParams.get("region")), { syncUrl: false });
});

window.addEventListener("popstate", () => {
  if (!mapReady) return;
  const url = new URL(location.href);
  const regions = parseRouteCategories(url.searchParams.get("region"));
  if (!sameRouteCategories(regions, activeRegions)) {
    changeRegions(regions, { syncUrl: false });
  }
});
