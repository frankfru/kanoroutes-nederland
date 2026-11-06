export function createHeatmapFeature({ map, L, getAllRoutesBounds, showError }) {
  const kayakHeatmapModeButton = document.getElementById("kayak-heatmap-mode");
  const heatmapControls = document.getElementById("heatmap-controls");
  const heatmapIntensityInput = document.getElementById("heatmap-intensity");
  const heatmapWidthInput = document.getElementById("heatmap-width");
  const heatmapColorInput = document.getElementById("heatmap-color");
  const heatmapIntensityValue = document.getElementById("heatmap-intensity-value");
  const heatmapWidthValue = document.getElementById("heatmap-width-value");
  const heatmapColorValue = document.getElementById("heatmap-color-value");
  const heatmapSummary = document.getElementById("heatmap-summary");
  let kayakHeatmapLayer;
  let kayakHeatmapBounds;
  let kayakHeatmapMaxWeight = 1;
  let heatmapVisible = false;
  const defaults = { intensity: 1, width: 1, colorContrast: 1 };
  heatmapIntensityInput.value = String(defaults.intensity);
  heatmapWidthInput.value = String(defaults.width);
  heatmapColorInput.value = String(defaults.colorContrast);

        function heatmapStyleForZoom(zoom = map.getZoom()) {
          const baseRadius = Math.max(3, Math.min(12, Math.round(3 * 2 ** ((zoom - 7) / 3))));
          const radius = Math.max(2, Math.min(18, Math.round(baseRadius * Number(heatmapWidthInput.value))));
          return { radius, blur: Math.max(2, Math.round(radius * 0.5)) };
        }

        function heatmapGradient(contrast = Number(heatmapColorInput.value)) {
          const stops = [
            [0.2, "#2b83ba"],
            [0.45, "#abdda4"],
            [0.65, "#ffffbf"],
            [0.82, "#fdae61"],
            [1, "#d7191c"]
          ];
          return Object.fromEntries(stops.map(([stop, color]) => [
            Math.max(0, Math.min(1, 0.5 + (stop - 0.5) * contrast)),
            color
          ]));
        }

        function updateHeatmapStyleForZoom() {
          if (!kayakHeatmapLayer || !map.hasLayer(kayakHeatmapLayer)) return;
          const style = heatmapStyleForZoom();
          if (style.radius !== kayakHeatmapLayer.options.radius ||
              style.blur !== kayakHeatmapLayer.options.blur) {
            kayakHeatmapLayer.setOptions(style);
          }
        }

        function updateHeatmapControls() {
          const intensity = Number(heatmapIntensityInput.value);
          const width = Number(heatmapWidthInput.value);
          const contrast = Number(heatmapColorInput.value);
          heatmapIntensityValue.value = `${intensity.toFixed(1)}×`;
          heatmapWidthValue.value = `${width.toFixed(1)}×`;
          heatmapColorValue.value = `${contrast.toFixed(1)}×`;

          if (kayakHeatmapLayer && map.hasLayer(kayakHeatmapLayer)) {
            kayakHeatmapLayer.setOptions({
              ...heatmapStyleForZoom(),
              max: kayakHeatmapMaxWeight / intensity,
              gradient: heatmapGradient(contrast)
            });
          }
        }

        async function createKayakHeatmap() {
          if (typeof L.heatLayer !== "function") {
            throw new Error("De heatmap-bibliotheek kon niet worden geladen.");
          }

          const response = await fetch("kayak-heatmap-data.json", { cache: "no-store" });
          if (!response.ok) {
            throw new Error("De voorbewerkte kajak-heatmap kon niet worden geladen.");
          }
          const data = await response.json();
          if (data.version !== 1 || data.cellSizeMeters !== 25 ||
              !Number.isInteger(data.routeCount) || data.routeCount < 1 ||
              !Number.isInteger(data.recordingCount) || data.recordingCount < 1 ||
              !Array.isArray(data.points) || data.points.length === 0 ||
              !data.points.every(point => Array.isArray(point) && point.length === 3 &&
                point.every(Number.isFinite) && point[0] >= -90 && point[0] <= 90 &&
                point[1] >= -180 && point[1] <= 180 && point[2] > 0)) {
            throw new Error("De voorbewerkte kajak-heatmap bevat geen bruikbare routegegevens.");
          }

          const bounds = L.latLngBounds([]);
          data.points.forEach(([latitude, longitude]) => bounds.extend([latitude, longitude]));
          kayakHeatmapMaxWeight = data.points.reduce((maximum, point) => Math.max(maximum, point[2]), 1);
          heatmapSummary.textContent =
            `Dekking Noord-Holland e.o.: ${data.routeCount} kaart-routes + ${data.recordingCount} GPS-opnames · ` +
            `${data.points.length.toLocaleString("nl-NL")} routevakken van circa 25 meter`;

          return {
            layer: L.heatLayer(data.points, {
              ...heatmapStyleForZoom(),
              maxZoom: 11,
              max: kayakHeatmapMaxWeight / Number(heatmapIntensityInput.value),
              minOpacity: 0.16,
              pane: "heatmapPane",
              gradient: heatmapGradient()
            }),
            bounds
          };
        }

        async function toggleKayakHeatmap() {
          const showHeatmap = !heatmapVisible;
          kayakHeatmapModeButton.disabled = true;
          if (showHeatmap) kayakHeatmapModeButton.textContent = "Heatmap laden…";
          document.querySelector(".map-error")?.remove();

          try {
            if (showHeatmap) {
              if (!kayakHeatmapLayer) {
                const heatmap = await createKayakHeatmap();
                kayakHeatmapLayer = heatmap.layer;
                kayakHeatmapBounds = heatmap.bounds;
              }
              kayakHeatmapLayer.addTo(map);
              const heatmapCanvas = kayakHeatmapLayer._canvas;
              if (!heatmapCanvas) {
                throw new Error("De heatmap kon niet op de kaart worden geplaatst.");
              }
              map.getPane("heatmapPane").appendChild(heatmapCanvas);
              heatmapVisible = true;

              const bounds = L.latLngBounds(kayakHeatmapBounds);
              const allRoutesBounds = getAllRoutesBounds();
              if (allRoutesBounds?.isValid()) bounds.extend(allRoutesBounds);
              map.fitBounds(bounds, { padding: [36, 36], maxZoom: 10 });
            } else {
              const heatmapCanvas = kayakHeatmapLayer._canvas;
              if (heatmapCanvas?.parentNode === map.getPane("heatmapPane")) {
                map.getPane("overlayPane").appendChild(heatmapCanvas);
              }
              map.removeLayer(kayakHeatmapLayer);
              heatmapVisible = false;
            }

            heatmapControls.hidden = !heatmapVisible;
            kayakHeatmapModeButton.setAttribute("aria-pressed", String(heatmapVisible));
          } catch (error) {
            console.error("Kajakroute-heatmap laden mislukt:", error);
            showError(error.message || "De heatmap kon niet worden getoond.");
          } finally {
            kayakHeatmapModeButton.disabled = false;
            kayakHeatmapModeButton.textContent = "Kajakroute-heatmap";
          }
        }

        [heatmapIntensityInput, heatmapWidthInput, heatmapColorInput]
          .forEach(input => input.addEventListener("input", updateHeatmapControls));
        kayakHeatmapModeButton.addEventListener("click", toggleKayakHeatmap);
        map.on("zoomend", updateHeatmapStyleForZoom);
        updateHeatmapControls();
}
