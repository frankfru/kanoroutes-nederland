import { createWaterwayRouter } from "./waterway-router.js";
import { createLakeWaterwayOverlay } from "./lake-waterway-overlay.js";
import { createHeatmapFeature } from "./heatmap.js";
import { createRouteBuilder } from "./route-builder.js";
import { createGpxTrack, createGpxFileName, downloadGpxFile } from "./gpx.js";

      (() => {
        const regionColors = new Map([
          ["noord", "#0057b8"],
          ["dinsdaggers", "#c45b00"],
          ["utrecht", "#007a3d"],
          ["kanoroutes", "#a0005a"]
        ]);
        const routeList = document.getElementById("route-list");
        const searchInput = document.getElementById("search");
        const routeCount = document.getElementById("route-count");
        const sourceNote = document.getElementById("source-note");
        const mapLabel = document.getElementById("map-label");
        const sidebar = document.querySelector(".sidebar");
        const sidebarContent = document.getElementById("sidebar-content");
        const sheetToggle = document.getElementById("sheet-toggle");
        const sheetToggleLabel = document.getElementById("sheet-toggle-label");
        const fullscreenButton = document.getElementById("fullscreen-button");
        const mapWrap = document.querySelector(".map-wrap");
        const startpointLegendSymbol = document.getElementById("startpoint-legend-symbol");
        const mobileLayout = window.matchMedia("(max-width: 720px)");
        const supportsGpxFileSharing = (() => {
          if (typeof File !== "function" || typeof navigator.share !== "function" ||
              typeof navigator.canShare !== "function") return false;
          try {
            return navigator.canShare({
              files: [new File([""], "route.gpx", { type: "text/xml" })]
            });
          } catch (error) {
            console.warn("GPX-bestandsdelen controleren mislukt:", error);
            return false;
          }
        })();

        const routeShowWaterwaysInput = document.getElementById("route-show-waterways");
        const routeWaterwayCoverageInfo = document.getElementById("route-waterway-coverage-info");
        const routeWaterwayCoverageStatus = document.getElementById("route-waterway-coverage-status");
        const regionButtons = [...document.querySelectorAll(".region-button")];




















        const layers = new Map();
        const routeDistances = new Map();
        const popupContents = new Map();
        const rows = new Map();
        const routeButtons = new Map();
        let routeIds = new Map();
        let routeIndexesById = new Map();
        let map;
        let allRoutesBounds;
        let selectedRoute = null;
        let activeRoutes = [];
        let activeRegions = new Set();
        let northHollandLoadPromise;
        let kanoroutesLoadPromise;
        let utrechtLoadPromise;
        let regionLoadId = 0;
        let regionStateInitialized = false;































        function routeSlug(name) {
          return name
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLocaleLowerCase("nl")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || "route";
        }

        function updateShareUrl(routeId = null, replace = false) {
          const url = new URL(location.href);
          url.searchParams.set("region", [...activeRegions].join(","));
          if (routeId) url.searchParams.set("route", routeId);
          else url.searchParams.delete("route");
          history[replace ? "replaceState" : "pushState"]({ routeId }, "", url);
        }

        const regionLabels = new Map(regionButtons.map(button => [button.dataset.region, button.textContent.trim()]));
        const regionIds = new Set(regionLabels.keys());
        const regionSources = new Map([
          ["dinsdaggers", 'GPX-bron: <a href="https://www.akvodysseus.nl/disciplines/toerkano/routes-kanotochten/" target="_blank" rel="noopener noreferrer">AKV Odysseus</a>. Routeoverzicht van Peter Groen; kaartlijnen vereenvoudigd voor snel laden.'],
          ["utrecht", 'GPX-bron: <a href="https://kanokaartutrecht.nl/" target="_blank" rel="noopener noreferrer">Kanokaart Utrecht &amp; ’t Gooi</a>. Open de routepagina voor meer informatie.'],
          ["kanoroutes", 'GPS-bron: <a href="https://kanoroutes.nl/" target="_blank" rel="noopener noreferrer">kanoroutes.nl</a>. Alleen routes in Nederland; open de routepagina voor meer informatie.']
        ]);

        function parseRegions(value) {
          if (value === null) return new Set(["dinsdaggers"]);
          const regions = new Set(
            (value || "")
              .split(",")
              .map(region => region.trim())
              .filter(region => regionIds.has(region))
          );
          return regions;
        }

        function sameRegions(first, second) {
          return first.size === second.size && [...first].every(region => second.has(region));
        }

        function showError(message) {
          const error = document.createElement("div");
          error.className = "map-error";
          error.setAttribute("role", "alert");
          error.textContent = message;
          document.querySelector(".map-wrap").append(error);
        }

        if (typeof L === "undefined") {
          showError("De kaartbibliotheek kon niet worden geladen. Controleer je internetverbinding en laad de pagina opnieuw.");
          routeCount.textContent = "Kaart niet beschikbaar";
          return;
        }

        if (!Array.isArray(window.GPX_ROUTES) || window.GPX_ROUTES.length === 0) {
          showError("Er zijn geen routegegevens gevonden. Controleer of routes-data.js naast index.html staat.");
          routeCount.textContent = "Geen routes gevonden";
          return;
        }

        map = L.map("map", { zoomControl: false, preferCanvas: true }).setView([52.15, 5.3], 7);
        map.createPane("heatmapPane");
        map.getPane("heatmapPane").style.zIndex = "350";
        map.createPane("waterwayCoveragePane");
        map.getPane("waterwayCoveragePane").style.zIndex = "390";
        map.getPane("waterwayCoveragePane").style.pointerEvents = "none";
        const waterwayCoverageLayer = L.polyline([], {
          color: "#27a4c7",
          weight: 2,
          opacity: 0.75,
          pane: "waterwayCoveragePane",
          interactive: false
        });
        const lakeWaterwayLayer = createLakeWaterwayOverlay({ map, L, showError });
        const routePopup = L.popup();
        map.on("popupopen", event => {
          if (event.popup !== routePopup) return;
          const element = event.popup.getElement();
          const baseButton = element?.querySelector("[data-route-base]");
          if (baseButton) {
            L.DomEvent.on(baseButton, "click", L.DomEvent.stop);
            L.DomEvent.on(baseButton, "click", () => {
              const routeIndex = Number(baseButton.getAttribute("data-route-base"));
              if (Number.isInteger(routeIndex)) routeBuilder.useSelectedRouteAsBase(routeIndex);
            });
          }
          const shareButton = element?.querySelector("[data-route-share]");
          if (shareButton) {
            L.DomEvent.on(shareButton, "click", L.DomEvent.stop);
            L.DomEvent.on(shareButton, "click", () => {
              const routeIndex = Number(shareButton.getAttribute("data-route-share"));
              if (Number.isInteger(routeIndex)) shareRouteAsGpx(routeIndex);
            });
          }
        });
        L.control.zoom({ position: "bottomright" }).addTo(map);
        const openStreetMap = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers'
        });
        const brtBackgroundMap = L.tileLayer("https://service.pdok.nl/kadaster/brt-achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.kadaster.nl/">Kadaster</a> | <a href="https://www.pdok.nl/">PDOK</a> - BRT-Achtergrondkaart'
        });
        const aerialPhoto = L.tileLayer("https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.kadaster.nl/">Kadaster</a> | <a href="https://www.pdok.nl/">PDOK</a> - Luchtfoto Actueel Ortho 8cm RGB'
        });
        const top25Raster = L.tileLayer.wms("https://service.pdok.nl/kadaster/brt-topraster/wms/v1_0", {
          layers: "top25raster",
          format: "image/png",
          transparent: false,
          attribution: '&copy; <a href="https://www.kadaster.nl/">Kadaster</a> | <a href="https://www.pdok.nl/">PDOK</a> - TOP25raster'
        });
        const natura2000 = L.tileLayer.wms("https://service.pdok.nl/rvo/natura2000/wms/v1_0", {
          layers: "natura2000",
          format: "image/png",
          transparent: true,
          attribution: '&copy; <a href="https://www.rvo.nl/">RVO</a> | <a href="https://www.pdok.nl/">PDOK</a> - Natura 2000'
        });
        const dutchWaterways = L.tileLayer.wms("https://service.pdok.nl/rws/nationaal-wegenbestand-vaarwegen/wms/v1_0", {
          layers: "vaarwegvakken",
          format: "image/png",
          transparent: true,
          attribution: '<a href="https://www.rijkswaterstaat.nl/">Rijkswaterstaat</a> | <a href="https://www.pdok.nl/">PDOK</a> - Nationaal Wegenbestand Vaarwegen'
        });
        const cadastralMap = L.tileLayer.wms("https://service.pdok.nl/kadaster/brk-kadastrale-kaart/wms/v5_0", {
          layers: "Kadastralekaart",
          styles: "",
          format: "image/png",
          transparent: false,
          minZoom: 17,
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.kadaster.nl/">Kadaster</a> | <a href="https://www.pdok.nl/">PDOK</a> - Kadastrale kaart'
        });
        const openTopoMap = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          maxNativeZoom: 17,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers, SRTM | Kaartstijl: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
        });
        openStreetMap.addTo(map);
        L.control.layers({
          "OpenStreetMap": openStreetMap,
          "Topografisch (OpenTopoMap)": openTopoMap,
          "Topografisch (BRT - Kadaster/PDOK)": brtBackgroundMap,
          "Luchtfoto (PDOK)": aerialPhoto,
          "Topografisch (TOP25 - Kadaster/PDOK)": top25Raster,
          "Kadastrale kaart (PDOK)": cadastralMap
        }, {
          "Natura 2000 (PDOK)": natura2000,
          "Vaarwegen Nederland (NWB)": dutchWaterways,
          "Vaarwegdekking (Volg vaarwegen)": waterwayCoverageLayer,
          "Niet-opgenomen OSM-waterwegen op meren": lakeWaterwayLayer
        }, { position: "topleft" }).addTo(map);

        function updateMapZoomLimits() {
          const top25Selected = map.hasLayer(top25Raster);
          const cadastralSelected = map.hasLayer(cadastralMap);
          const minZoom = cadastralSelected ? 17 : top25Selected ? 14 : 0;
          const maxZoom = cadastralSelected ? 19 : top25Selected ? 16 : 19;
          map.setMinZoom(minZoom);
          map.setMaxZoom(maxZoom);
          map.setZoom(Math.max(minZoom, Math.min(maxZoom, map.getZoom())));
        }

        map.on("baselayerchange", updateMapZoomLimits);

        createHeatmapFeature({ map, L, getAllRoutesBounds: () => allRoutesBounds, showError });

        function setSheetExpanded(expanded) {
          const shouldExpand = mobileLayout.matches && expanded;
          sidebar.classList.toggle("is-expanded", shouldExpand);
          sheetToggle.setAttribute("aria-expanded", String(shouldExpand));
          sheetToggle.setAttribute("aria-label", shouldExpand ? "Routes sluiten" : "Routes openen");
          sheetToggleLabel.textContent = shouldExpand ? "Kaart bekijken" : "Routes bekijken";
          sidebarContent.inert = mobileLayout.matches && !shouldExpand;
        }

        function syncFullscreenButton() {
          const isFullscreen = document.fullscreenElement === mapWrap || mapWrap.classList.contains("is-fullscreen");
          fullscreenButton.setAttribute("aria-label", isFullscreen ? "Volledig scherm sluiten" : "Kaart op volledig scherm");
          fullscreenButton.title = isFullscreen ? "Volledig scherm sluiten" : "Volledig scherm";
        }

        function refreshMapSize() {
          requestAnimationFrame(() => map.invalidateSize({ pan: false }));
        }

        async function toggleFullscreen() {
          try {
            if (document.fullscreenElement === mapWrap) {
              await document.exitFullscreen();
            } else if (mapWrap.classList.contains("is-fullscreen")) {
              mapWrap.classList.remove("is-fullscreen");
            } else if (typeof mapWrap.requestFullscreen === "function") {
              await mapWrap.requestFullscreen();
            } else {
              mapWrap.classList.add("is-fullscreen");
            }
            syncFullscreenButton();
            refreshMapSize();
          } catch (error) {
            console.error("Volledig scherm openen mislukt:", error);
            showError("De kaart kon niet op volledig scherm worden geopend.");
          }
        }

        setSheetExpanded(false);
        mobileLayout.addEventListener("change", () => {
          setSheetExpanded(false);
          updateRouteHitWidths();
        });
        sheetToggle.addEventListener("click", () => {
          if (sheetToggle.dataset.swiped === "true") {
            delete sheetToggle.dataset.swiped;
            return;
          }
          setSheetExpanded(sheetToggle.getAttribute("aria-expanded") !== "true");
          refreshMapSize();
        });
        let dragStartY = null;
        sheetToggle.addEventListener("pointerdown", event => {
          if (!mobileLayout.matches) return;
          dragStartY = event.clientY;
          sheetToggle.setPointerCapture(event.pointerId);
        });
        sheetToggle.addEventListener("pointerup", event => {
          if (dragStartY === null) return;
          const dragDistance = event.clientY - dragStartY;
          dragStartY = null;
          if (Math.abs(dragDistance) < 35) return;
          sheetToggle.dataset.swiped = "true";
          setSheetExpanded(dragDistance < 0);
          refreshMapSize();
        });
        sheetToggle.addEventListener("pointercancel", () => { dragStartY = null; });
        fullscreenButton.addEventListener("click", toggleFullscreen);
        document.addEventListener("fullscreenchange", () => {
          syncFullscreenButton();
          refreshMapSize();
        });

        function routeColor(index) {
          return regionColors.get(activeRoutes[index]?.sourceRegion) || "#0057b8";
        }

        function routeHitWidth() {
          return mobileLayout.matches ? 32 : 20;
        }

        function updateRouteHitWidths() {
          layers.forEach(layer => {
            layer.eachLayer(child => {
              if (child instanceof L.Polyline && child.options.interactive !== false) {
                child.setStyle({ weight: routeHitWidth() });
              }
            });
          });
        }

        function calculateDistanceKm(segments) {
          const earthRadiusKm = 6371.0088;
          let distanceKm = 0;
          for (const segment of segments) {
            for (let index = 1; index < segment.length; index += 1) {
              const [latitude1, longitude1] = segment[index - 1];
              const [latitude2, longitude2] = segment[index];
              const latitudeDelta = (latitude2 - latitude1) * Math.PI / 180;
              const longitudeDelta = (longitude2 - longitude1) * Math.PI / 180;
              const haversine =
                Math.sin(latitudeDelta / 2) ** 2 +
                Math.cos(latitude1 * Math.PI / 180) *
                  Math.cos(latitude2 * Math.PI / 180) *
                  Math.sin(longitudeDelta / 2) ** 2;
              distanceKm += 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
            }
          }
          return distanceKm;
        }

        const waterwayRouter = createWaterwayRouter();

        let waterwayCoverageRequestId = 0;

        function updateWaterwayCoverage() {
          if (!routeShowWaterwaysInput.checked) return;
          const coverage = waterwayRouter.coverage(map.getBounds());
          if (!coverage) return;

          waterwayCoverageLayer.setLatLngs(coverage.lines);
          if (!map.hasLayer(waterwayCoverageLayer)) waterwayCoverageLayer.addTo(map);
          const count = coverage.lines.length;
          const label = count === 0
            ? "Geen routervaarwegen in dit kaartbeeld"
            : `${count.toLocaleString("nl-NL")} vaarwegdelen in dit kaartbeeld`;
          routeWaterwayCoverageStatus.textContent =
            `${label} · OpenStreetMap-routerdata van ${coverage.generated || "onbekende datum"}.`;
        }

        async function handleWaterwayCoverageToggle() {
          const requestId = ++waterwayCoverageRequestId;
          if (!routeShowWaterwaysInput.checked) {
            waterwayCoverageLayer.remove();
            waterwayCoverageLayer.setLatLngs([]);
            routeWaterwayCoverageInfo.hidden = true;
            return;
          }

          routeWaterwayCoverageInfo.hidden = false;
          routeWaterwayCoverageStatus.textContent = "Vaarwegdekking laden…";
          try {
            await waterwayRouter.load();
            if (requestId !== waterwayCoverageRequestId || !routeShowWaterwaysInput.checked) return;
            updateWaterwayCoverage();
          } catch (error) {
            if (requestId !== waterwayCoverageRequestId || !routeShowWaterwaysInput.checked) return;
            console.error("Vaarwegdekking laden mislukt:", error);
            waterwayCoverageLayer.setLatLngs([]);
            if (!map.hasLayer(waterwayCoverageLayer)) waterwayCoverageLayer.addTo(map);
            routeWaterwayCoverageStatus.textContent =
              "Vaarwegdekking kon niet worden geladen. Schakel de optie uit en weer in om opnieuw te proberen.";
          }
        }

        map.on("moveend", updateWaterwayCoverage);
        map.on("layeradd", event => {
          if (event.layer !== waterwayCoverageLayer || routeShowWaterwaysInput.checked) return;
          routeShowWaterwaysInput.checked = true;
          handleWaterwayCoverageToggle();
        });
        map.on("layerremove", event => {
          if (event.layer !== waterwayCoverageLayer || !routeShowWaterwaysInput.checked) return;
          routeShowWaterwaysInput.checked = false;
          handleWaterwayCoverageToggle();
        });

        const routeBuilder = createRouteBuilder({
          map, L, waterwayRouter, calculateDistanceKm, routeButtons, applyRouteStyles,
          getActiveRoutes: () => activeRoutes, mobileLayout, setSheetExpanded, refreshMapSize
        });
        function routeInteractionLocked() {
          return routeBuilder.isLocked();
        }
        routeShowWaterwaysInput.addEventListener("change", handleWaterwayCoverageToggle);

        function applyRouteStyles() {
          const hasSelection = selectedRoute !== null;
          const locked = routeInteractionLocked();
          layers.forEach((layer, routeIndex) => {
            const selected = routeIndex === selectedRoute;
            const dimmed = locked ? !selected || !hasSelection : hasSelection && !selected;
            layer.eachLayer(child => {
              if (child instanceof L.Polyline && child.options.routeCasing === true) {
                child.setStyle({
                  color: "#fff",
                  weight: selected ? 8 : 7,
                  opacity: locked && dimmed ? 0.55 : 0.98
                });
              } else if (child instanceof L.Polyline && child.options.interactive === false) {
                child.setStyle({
                  color: selected ? "#d93611" : routeColor(routeIndex),
                  weight: selected ? 6 : hasSelection && !locked ? 4 : 5,
                  opacity: selected ? 1 : dimmed ? 0.4 : hasSelection ? 0.7 : 1
                });
                if (selected) child.bringToFront();
              } else if (child instanceof L.CircleMarker) {
                child.setStyle({
                  opacity: selected ? 1 : 0,
                  fillOpacity: selected ? 1 : 0
                });
              }
            });
            if (selected) {
              layer.eachLayer(child => {
                if (child instanceof L.CircleMarker) child.bringToFront();
              });
            }
          });
          startpointLegendSymbol.classList.toggle("is-hidden", !hasSelection);
        }

        function clearSelection({ syncUrl = true, replaceUrl = true } = {}) {
          selectedRoute = null;
          applyRouteStyles();
          routeButtons.forEach(button => {
            button.closest(".route-row").classList.remove("selected");
            button.setAttribute("aria-pressed", "false");
          });
          map.closePopup();
          if (syncUrl && activeRegions.size) updateShareUrl(null, replaceUrl);
        }

        function selectRoute(index, { syncUrl = true } = {}) {
          if (routeInteractionLocked() && index !== selectedRoute) return;
          selectedRoute = index;
          applyRouteStyles();
          routeButtons.forEach((button, routeIndex) => {
            const selected = routeIndex === selectedRoute;
            button.closest(".route-row").classList.toggle("selected", selected);
            button.setAttribute("aria-pressed", String(selected));
          });
          if (syncUrl) updateShareUrl(routeIds.get(index));
        }

        function toggleRouteSelection(index, options) {
          if (routeInteractionLocked()) return;
          if (selectedRoute === index) clearSelection(options);
          else selectRoute(index, options);
        }

        function openRoutePopup(index) {
          const layer = layers.get(index);
          const content = popupContents.get(index);
          if (layer && content) {
            routePopup
              .setLatLng(layer.getBounds().getCenter())
              .setContent(content);
            map.openPopup(routePopup);
          }
        }

        async function shareRouteAsGpx(index) {
          const route = activeRoutes[index];
          const segments = Array.isArray(route?.segments)
            ? route.segments.filter(segment => Array.isArray(segment) && segment.length > 1)
            : [];
          if (!route || segments.length === 0) {
            showError("Deze route bevat geen bruikbare GPX-geometrie.");
            return;
          }

          let gpx;
          try {
            gpx = createGpxTrack(route.name, segments);
          } catch (error) {
            console.error("GPX-bestand maken mislukt:", error);
            showError(error.message || "De route kon niet als GPX worden gemaakt.");
            return;
          }

          const fileName = `${createGpxFileName(route.name)}.gpx`;
          if (typeof File === "function" && typeof navigator.share === "function") {
            const file = new File([gpx], fileName, { type: "text/xml" });
            try {
              await navigator.share({ files: [file], title: route.name });
              return;
            } catch (error) {
              if (error.name === "AbortError") return;
              console.error("GPX delen mislukt:", error);
              showError("Delen is niet gelukt; de GPX wordt gedownload.");
            }
          }

          downloadGpxFile(fileName, gpx);
        }

        function restoreRoute(routeId) {
          const index = routeIndexesById.get(routeId);
          const layer = layers.get(index);
          if (routeInteractionLocked() && index !== selectedRoute) return false;
          if (index === undefined || !layer || !layer.getBounds().isValid()) return false;

          if (!map.hasLayer(layer)) {
            layer.addTo(map);
            const checkbox = rows.get(index);
            if (checkbox) checkbox.checked = true;
          }
          selectRoute(index, { syncUrl: false });
          map.fitBounds(layer.getBounds(), { padding: [30, 30], maxZoom: 14 });
          map.closePopup();
          openRoutePopup(index);
          return true;
        }

        function renderList(filter = "") {
          const normalizedFilter = filter.trim().toLocaleLowerCase("nl");
          routeList.replaceChildren();
          rows.clear();
          routeButtons.clear();

          const groups = new Map();
          activeRoutes.forEach((route, index) => {
            const searchableText =
              `${route.name} ${route.location || ""} ${route.folder || route.group || ""}`.toLocaleLowerCase("nl");
            if (!searchableText.includes(normalizedFilter)) return;
            const routeGroup = route.folder || route.group || "GPS Groningen";
            const group = activeRegions.size > 1
              ? `${regionLabels.get(route.sourceRegion)} · ${routeGroup}`
              : routeGroup;
            if (!groups.has(group)) groups.set(group, []);
            groups.get(group).push({ route, index });
          });

          if (groups.size === 0) {
            const empty = document.createElement("div");
            empty.className = "empty-state";
            empty.textContent = "Geen routes gevonden.";
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
              if (index === selectedRoute) row.classList.add("selected");

              const checkbox = document.createElement("input");
              checkbox.className = "route-toggle";
              checkbox.type = "checkbox";
              checkbox.checked = map.hasLayer(layers.get(index));
              checkbox.setAttribute("aria-label", `Toon ${route.name} op de kaart`);

              const color = document.createElement("span");
              color.className = "route-color";
              color.style.backgroundColor = routeColor(index);

              const name = document.createElement("button");
              name.className = "route-name";
              name.type = "button";
              const distanceKm = routeDistances.get(index);
              const distanceLabel = Number.isFinite(distanceKm)
                ? ` (${Math.round(distanceKm).toLocaleString("nl-NL")} km)`
                : "";
              name.textContent = `${route.name}${distanceLabel}`;
              name.disabled = routeInteractionLocked();
              name.title = routeInteractionLocked() ? "Stop tekenen of aanpassen om een route te selecteren" : "Zoom naar en licht deze route uit";
              name.setAttribute("aria-pressed", String(index === selectedRoute));

              checkbox.addEventListener("change", () => {
                const layer = layers.get(index);
                if (!layer) return;
                if (checkbox.checked) layer.addTo(map);
                else {
                  map.removeLayer(layer);
                  if (selectedRoute === index) clearSelection();
                }
              });

              name.addEventListener("click", () => {
                if (routeInteractionLocked()) return;
                const layer = layers.get(index);
                if (layer && layer.getBounds().isValid()) {
                  if (selectedRoute === index) {
                    clearSelection();
                    return;
                  }
                  if (!map.hasLayer(layer)) {
                    layer.addTo(map);
                    checkbox.checked = true;
                  }
                  selectRoute(index);
                  map.fitBounds(layer.getBounds(), { padding: [30, 30], maxZoom: 14 });
                  map.closePopup();
                  openRoutePopup(index);
                  if (mobileLayout.matches) setSheetExpanded(false);
                }
              });

              row.append(checkbox, color, name);
              routeList.append(row);
              rows.set(index, checkbox);
              routeButtons.set(index, name);
            });
          });
        }

        function escapeHtml(value) {
          return String(value).replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
          })[character]);
        }

        function renderRoutes(routes, { fitMap = true } = {}) {
          activeRoutes = routes;
          selectedRoute = null;
          routeIds = new Map();
          routeIndexesById = new Map();
          routeDistances.clear();
          popupContents.clear();
          const slugCounts = new Map();
          activeRoutes.forEach((route, index) => {
            const slug = routeSlug(route.name);
            const routeKey = activeRegions.size > 1 ? `${route.sourceRegion}-${slug}` : slug;
            const count = (slugCounts.get(routeKey) || 0) + 1;
            slugCounts.set(routeKey, count);
            const routeId = count === 1 ? routeKey : `${routeKey}-${count}`;
            routeIds.set(index, routeId);
            routeIndexesById.set(routeId, index);
          });
          layers.forEach(layer => map.removeLayer(layer));
          layers.clear();
          rows.clear();
          routeButtons.clear();

          let routesWithPoints = 0;
          const routeBounds = [];

          activeRoutes.forEach((route, index) => {
            const segments = Array.isArray(route.segments) ? route.segments : [];
            const validSegments = segments.filter(segment => Array.isArray(segment) && segment.length > 1);
            if (validSegments.length === 0) return;

            const layer = L.featureGroup();
            validSegments.forEach(segment => {
              L.polyline(segment, {
                color: "#fff",
                weight: 7,
                opacity: 0.98,
                lineCap: "round",
                lineJoin: "round",
                interactive: false,
                routeCasing: true
              }).addTo(layer);
              L.polyline(segment, {
                color: routeColor(index),
                weight: 5,
                opacity: 1,
                lineCap: "round",
                lineJoin: "round",
                interactive: false
              }).addTo(layer);
              const hitArea = L.polyline(segment, {
                color: routeColor(index),
                weight: routeHitWidth(),
                opacity: 0,
                lineCap: "round",
                lineJoin: "round",
                interactive: true,
                bubblingMouseEvents: true
              }).addTo(layer);
              hitArea.on("mouseover", () => {
                if (routeInteractionLocked() || selectedRoute === index) return;
                const dimmed = selectedRoute !== null;
                layer.eachLayer(child => {
                  if (child instanceof L.Polyline && child.options.routeCasing === true) {
                    child.setStyle({ weight: 7.5 });
                    child.bringToFront();
                  } else if (child instanceof L.Polyline && child.options.interactive === false) {
                    child.setStyle({
                      weight: dimmed ? 5.5 : 6.5,
                      opacity: dimmed ? 0.9 : 1
                    });
                    child.bringToFront();
                  }
                });
              });
              hitArea.on("mouseout", () => {
                applyRouteStyles();
              });
              hitArea.on("click", () => {
                if (routeInteractionLocked()) return;
                toggleRouteSelection(index);
                if (selectedRoute === index) openRoutePopup(index);
              });
            });
            const startPoint = validSegments[0][0];
            L.circleMarker(startPoint, {
              radius: 6,
              color: "#fff",
              weight: 2,
              fillColor: "#168a63",
              opacity: 0,
              fillOpacity: 0,
              interactive: false
            }).addTo(layer);

            const pdfLink = typeof route.pdf === "string"
              ? `<p class="popup-detail"><a href="${escapeHtml(route.pdf)}" target="_blank" rel="noopener noreferrer">Routebeschrijving openen (PDF)</a></p>`
              : "";
            const sourceLink = typeof route.source === "string"
              ? `<p class="popup-detail"><a href="${escapeHtml(route.source)}" target="_blank" rel="noopener noreferrer">${/\.zip(?:$|[?#])/i.test(route.source) ? "Originele GPS-route downloaden (ZIP)" : "Originele GPX downloaden"}</a></p>`
              : "";
            const routePageLink = typeof route.sourcePage === "string"
              ? `<p class="popup-detail"><a href="${escapeHtml(route.sourcePage)}" target="_blank" rel="noopener noreferrer">Routepagina openen</a></p>`
              : "";
            const routeShareAction = supportsGpxFileSharing
              ? `<p class="popup-detail"><button class="popup-action" type="button" data-route-share="${index}">Deel route (gpx)</button></p>`
              : "";
            const routeBaseAction =
              `<p class="popup-detail"><button class="popup-action" type="button" data-route-base="${index}">Gebruik als basis voor nieuwe route</button></p>`;
            const distanceKm = calculateDistanceKm(validSegments);
            routeDistances.set(index, distanceKm);
            const popupContent =
              `<p class="popup-title">${escapeHtml(route.name)}</p><p class="popup-detail">${distanceKm.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km</p>${pdfLink}${sourceLink}${routePageLink}${routeShareAction}${routeBaseAction}`;
            popupContents.set(index, popupContent);
            layer.addTo(map);
            layers.set(index, layer);
            routeBounds.push(layer.getBounds());
            routesWithPoints += 1;
          });

          allRoutesBounds = routeBounds.length > 0
            ? routeBounds.reduce((bounds, routeBound) => bounds.extend(routeBound), L.latLngBounds([]))
            : null;

          if (allRoutesBounds && allRoutesBounds.isValid()) {
            if (fitMap) map.fitBounds(allRoutesBounds, { padding: [36, 36], maxZoom: 10 });
          } else {
            showError("De routegegevens bevatten geen bruikbare GPS-punten.");
          }

          routeCount.textContent = `${routesWithPoints} routes`;
          renderList(searchInput.value);
          applyRouteStyles();
        }

        function loadNorthHollandRoutes() {
          if (Array.isArray(window.GPX_ROUTES_NOORD_HOLLAND)) {
            return Promise.resolve(window.GPX_ROUTES_NOORD_HOLLAND);
          }

          if (!northHollandLoadPromise) {
            northHollandLoadPromise = new Promise((resolve, reject) => {
              const script = document.createElement("script");
              script.src = "routes-noord-holland-data.js";
              script.onload = () => {
                if (Array.isArray(window.GPX_ROUTES_NOORD_HOLLAND)) {
                  resolve(window.GPX_ROUTES_NOORD_HOLLAND);
                } else {
                  reject(new Error("Het Noord-Holland-bestand bevat geen routegegevens."));
                }
              };
              script.onerror = () => reject(new Error("routes-noord-holland-data.js kon niet worden geladen."));
              document.body.append(script);
            }).catch(error => {
              northHollandLoadPromise = null;
              throw error;
            });
          }

          return northHollandLoadPromise;
        }

        function loadKanoroutesRoutes() {
          if (Array.isArray(window.GPX_ROUTES_KANOROUTES)) {
            return Promise.resolve(window.GPX_ROUTES_KANOROUTES);
          }

          if (!kanoroutesLoadPromise) {
            kanoroutesLoadPromise = new Promise((resolve, reject) => {
              const script = document.createElement("script");
              script.src = "routes-kanoroutes-data.js?v=province-groups-1";
              script.onload = () => {
                if (Array.isArray(window.GPX_ROUTES_KANOROUTES)) {
                  resolve(window.GPX_ROUTES_KANOROUTES);
                } else {
                  reject(new Error("Het kanoroutes.nl-bestand bevat geen routegegevens."));
                }
              };
              script.onerror = () => reject(new Error("routes-kanoroutes-data.js kon niet worden geladen."));
              document.body.append(script);
            }).catch(error => {
              kanoroutesLoadPromise = null;
              throw error;
            });
          }

          return kanoroutesLoadPromise;
        }

        function loadUtrechtRoutes() {
          if (Array.isArray(window.GPX_ROUTES_UTRECHT)) {
            return Promise.resolve(window.GPX_ROUTES_UTRECHT);
          }

          if (!utrechtLoadPromise) {
            utrechtLoadPromise = new Promise((resolve, reject) => {
              const script = document.createElement("script");
              script.src = "routes-utrecht-data.js";
              script.onload = () => {
                if (Array.isArray(window.GPX_ROUTES_UTRECHT)) {
                  resolve(window.GPX_ROUTES_UTRECHT);
                } else {
                  reject(new Error("Het Utrecht-bestand bevat geen routegegevens."));
                }
              };
              script.onerror = () => reject(new Error("routes-utrecht-data.js kon niet worden geladen."));
              document.body.append(script);
            }).catch(error => {
              utrechtLoadPromise = null;
              throw error;
            });
          }

          return utrechtLoadPromise;
        }

        async function changeRegions(regions, { syncUrl = true, routeId = null } = {}) {
          if (regionStateInitialized && sameRegions(regions, activeRegions) &&
              (regions.size === 0 || activeRoutes.length > 0)) return;
          regionStateInitialized = true;
          const loadId = ++regionLoadId;
          const fitMap = activeRegions.size === 0;
          activeRegions = new Set(regions);
          regionButtons.forEach(button => {
            button.setAttribute("aria-pressed", String(activeRegions.has(button.dataset.region)));
          });
          if (syncUrl) updateShareUrl(null);
          document.querySelector(".map-error")?.remove();

          map.closePopup();
          layers.forEach(layer => map.removeLayer(layer));
          layers.clear();
          rows.clear();
          routeButtons.clear();
          selectedRoute = null;
          activeRoutes = [];
          routeList.replaceChildren();
          allRoutesBounds = null;
          const mapLabels = new Map([
            ["noord", "Groningen · Friesland · Drenthe"],
            ["dinsdaggers", "Dinsdaggers"],
            ["utrecht", "Utrecht en ’t Gooi"],
            ["kanoroutes", "Nederland · kanoroutes.nl"]
          ]);
          mapLabel.textContent = activeRegions.size
            ? [...activeRegions].map(region => mapLabels.get(region)).join(" · ")
            : "Selecteer een routegebied";
          const sources = [...activeRegions]
            .map(region => regionSources.get(region))
            .filter(Boolean);
          if (sources.length) {
            sourceNote.hidden = false;
            sourceNote.innerHTML = sources.join("<br>");
          } else {
            sourceNote.hidden = true;
            sourceNote.replaceChildren();
          }

          if (activeRegions.size === 0) {
            routeCount.textContent = "0 routes";
            const empty = document.createElement("div");
            empty.className = "empty-state";
            empty.textContent = "Selecteer een routegebied om routes te tonen.";
            routeList.append(empty);
            return;
          }

          routeCount.textContent = "Routes laden…";
          try {
            const routesByRegion = await Promise.all([...activeRegions].map(async region => {
              const routes = region === "dinsdaggers"
                ? await loadNorthHollandRoutes()
                : region === "utrecht"
                  ? await loadUtrechtRoutes()
                  : region === "kanoroutes"
                    ? await loadKanoroutesRoutes()
                    : window.GPX_ROUTES;
              return routes.map(route => ({ ...route, sourceRegion: region }));
            }));
            if (regionLoadId !== loadId) return;
            const routes = routesByRegion.flat();
            renderRoutes(routes, { fitMap });
            if (routeId && !restoreRoute(routeId)) {
              showError("De gedeelde route kon niet worden gevonden in dit routegebied.");
            }
          } catch (error) {
            if (regionLoadId !== loadId) return;
            console.error("Routegebied laden mislukt:", error);
            routeCount.textContent = "Routes laden mislukt";
            showError("De routes konden niet worden geladen. Probeer het opnieuw.");
          }
        }

        regionButtons.forEach(button => {
          button.addEventListener("click", () => {
            const regions = new Set(activeRegions);
            if (regions.has(button.dataset.region)) regions.delete(button.dataset.region);
            else regions.add(button.dataset.region);
            changeRegions(regions);
          });
        });
        const sharedUrl = new URL(location.href);
        const initialRegions = parseRegions(sharedUrl.searchParams.get("region"));
        const initialRouteId = sharedUrl.searchParams.get("route");
        changeRegions(initialRegions, { syncUrl: false, routeId: initialRouteId });

        window.addEventListener("popstate", () => {
          const url = new URL(location.href);
          const regions = parseRegions(url.searchParams.get("region"));
          const routeId = url.searchParams.get("route");
          if (!sameRegions(regions, activeRegions) || (regions.size > 0 && activeRoutes.length === 0)) {
            changeRegions(regions, { syncUrl: false, routeId });
          } else if (routeId) {
            if (!restoreRoute(routeId)) {
              clearSelection({ syncUrl: false });
              showError("De gedeelde route kon niet worden gevonden in dit routegebied.");
            } else {
              document.querySelector(".map-error")?.remove();
            }
          } else {
            document.querySelector(".map-error")?.remove();
            clearSelection({ syncUrl: false });
          }
        });

        searchInput.addEventListener("input", () => renderList(searchInput.value));
        document.getElementById("show-all").addEventListener("click", () => {
          layers.forEach(layer => layer.addTo(map));
          rows.forEach(checkbox => { checkbox.checked = true; });
          if (allRoutesBounds && allRoutesBounds.isValid()) {
            map.fitBounds(allRoutesBounds, { padding: [36, 36], maxZoom: 10 });
          }
        });
        document.getElementById("hide-all").addEventListener("click", () => {
          layers.forEach(layer => map.removeLayer(layer));
          rows.forEach(checkbox => { checkbox.checked = false; });
          clearSelection();
        });
      })();
