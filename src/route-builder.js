import { downloadGpxTrack } from "./gpx.js";

export function createRouteBuilder({ map, L, waterwayRouter, calculateDistanceKm, routeButtons, applyRouteStyles, getActiveRoutes }) {
  const routeBuilderDetails = document.getElementById("route-builder");
  const routeBuilderSummary = routeBuilderDetails.querySelector("summary");
  const routeBuilderMode = document.getElementById("route-builder-mode");
  const routeNameInput = document.getElementById("route-name");
  const routeFollowWaterInput = document.getElementById("route-follow-water");
  const routeBuilderStatus = document.getElementById("route-builder-status");
  const routeDrawToggle = document.getElementById("route-draw-toggle");
  const routeUndoButton = document.getElementById("route-undo");
  const routeRedoButton = document.getElementById("route-redo");
  const routeClearButton = document.getElementById("route-clear");
  const routeDownloadButton = document.getElementById("route-download");
  const routeEditToggle = document.getElementById("route-edit-toggle");
  const routeEditPreviewButton = document.getElementById("route-edit-preview");
  const routeEditApplyButton = document.getElementById("route-edit-apply");
  const routeEditHelp = document.getElementById("route-edit-help");
  const routeSettingsToggle = document.getElementById("route-settings-toggle");
  const routeSettings = document.getElementById("route-settings");
  let isDrawingRoute = false;
  let isEditingRoute = false;
  let isCalculatingRouteEdit = false;
  let draftRouteNote = "";
  let isAddingRoutePoint = false;
  let draftRouteBaseSegments = [];
  let routeEditStart = null;
  let routeEditEnd = null;
  let routeEditSegmentIndex = null;
  let routeEditViaPoints = [];
  let routeEditPreviewPath = null;
  let routeEditMessage = "";
  let routeEditRequestId = 0;
  let routeEditPreviewTimeout;
  const draftRoutePoints = [];
  const draftRouteLegs = [];
  const draftRouteSnaps = [];
  const draftRouteMarkers = [];
  const draftRouteUndoActions = [];
  const draftRouteRedoActions = [];
  map.createPane("draftRoutePane");
  map.getPane("draftRoutePane").style.zIndex = "650";
  map.getPane("draftRoutePane").style.pointerEvents = "none";
  const draftRouteLayer = L.featureGroup().addTo(map);
  let draftRouteLine = L.polyline([], {
    color: "#126f9a",
    weight: 5,
    opacity: 0.95,
    pane: "draftRoutePane"
  }).addTo(draftRouteLayer);
  const routeEditLayer = L.featureGroup().addTo(map);

        function draftRouteSegments() {
          const segments = [...draftRouteBaseSegments];
          const drawnPath = draftRouteLegs.flat();
          if (segments.length > 0) {
            if (drawnPath.length > 0) {
              const lastSegment = segments.length - 1;
              segments[lastSegment] = [...segments[lastSegment], ...drawnPath];
            }
            return segments;
          }
          return drawnPath.length > 0 ? [drawnPath] : [];
        }

        function routeInteractionLocked() {
          return isDrawingRoute || isEditingRoute;
        }

        function updateRouteInteractionState() {
          const locked = routeInteractionLocked();
          routeBuilderDetails.classList.toggle("is-editing", isEditingRoute);
          routeBuilderDetails.classList.toggle("is-active", locked);
          routeBuilderMode.textContent = isEditingRoute ? " · aanpassen actief" : isDrawingRoute ? " · tekenen actief" : "";
          const plannerLabel = `Routeplanner${routeBuilderMode.textContent}`;
          routeBuilderSummary.setAttribute("aria-label", plannerLabel);
          routeBuilderSummary.title = plannerLabel;
          map.getContainer().style.cursor = locked ? "crosshair" : "";
          routeButtons.forEach(button => {
            button.disabled = locked;
            button.title = locked ? "Stop tekenen of aanpassen om een route te selecteren" : "Zoom naar en licht deze route uit";
          });
          applyRouteStyles();
        }

        function setRouteButtonLabel(button, label, shortcut = "") {
          button.setAttribute("aria-label", label);
          button.title = shortcut ? `${label} (${shortcut})` : label;
        }

        function updateDraftRouteControls() {
          const pointCount = draftRoutePoints.length;
          const segments = draftRouteSegments();
          const distanceKm = calculateDistanceKm(segments);
          const distanceLabel = `${distanceKm.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
          const addedPointCount = Math.max(0, pointCount - (draftRouteBaseSegments.length > 0 ? 1 : 0));
          const summary = isEditingRoute
            ? routeEditMessage
            : draftRouteBaseSegments.length > 0
              ? `Basisroute geladen · ${distanceLabel}${addedPointCount > 0 ? ` · ${addedPointCount} extra ${addedPointCount === 1 ? "punt" : "punten"}` : ""}${isDrawingRoute ? " · tekenen actief" : ""}`
              : pointCount === 0
                ? isDrawingRoute ? "Klik op de kaart om routepunten toe te voegen." : "Nog geen routepunten."
                : `${pointCount} ${pointCount === 1 ? "punt" : "punten"} · ${distanceLabel}${isDrawingRoute ? " · tekenen actief" : ""}`;
          routeBuilderStatus.textContent = isEditingRoute || !draftRouteNote
            ? summary
            : `${summary} · ${draftRouteNote}`;
          setRouteButtonLabel(routeUndoButton, draftRouteUndoActions.at(-1)?.type === "edit" ? "Wijziging terug" : "Punt terug", "Ctrl+Z");
          setRouteButtonLabel(routeRedoButton, draftRouteRedoActions.at(-1)?.type === "edit" ? "Wijziging vooruit" : "Punt vooruit", "Ctrl+Y");
          routeUndoButton.disabled = isEditingRoute || isAddingRoutePoint || pointCount === 0;
          routeRedoButton.disabled = isEditingRoute || isAddingRoutePoint || draftRouteRedoActions.length === 0;
          routeClearButton.disabled = isEditingRoute || isAddingRoutePoint || segments.length === 0;
          routeDownloadButton.disabled = isEditingRoute || isAddingRoutePoint || !segments.some(segment => segment.length > 1);
          routeDrawToggle.disabled = isEditingRoute || isAddingRoutePoint;
          routeEditToggle.disabled = isAddingRoutePoint || isDrawingRoute || (!isEditingRoute && !segments.some(segment => segment.length > 1));
          setRouteButtonLabel(routeEditToggle, isEditingRoute ? "Annuleer bewerking" : "Traject aanpassen");
          routeEditToggle.setAttribute("aria-pressed", String(isEditingRoute));
          routeEditPreviewButton.hidden = !isEditingRoute || !routeEditStart || !routeEditEnd;
          setRouteButtonLabel(routeEditPreviewButton, routeEditPreviewPath ? "Bereken opnieuw" : "Bereken omleiding");
          routeEditPreviewButton.disabled = !isEditingRoute || !routeEditStart || !routeEditEnd ||
            routeEditViaPoints.length === 0 || isCalculatingRouteEdit;
          routeEditApplyButton.hidden = !isEditingRoute || !routeEditPreviewPath;
          routeEditApplyButton.disabled = !routeEditPreviewPath || isCalculatingRouteEdit;
          routeEditHelp.hidden = !isEditingRoute;
        }

        function setRouteDrawing(active) {
          if (active && isEditingRoute) return;
          if (isDrawingRoute === active) return;
          isDrawingRoute = active;
          routeDrawToggle.setAttribute("aria-pressed", String(active));
          setRouteButtonLabel(routeDrawToggle, active ? "Stop tekenen" : "Start tekenen");
          updateRouteInteractionState();
          if (active) {
            map.closePopup();
            map.on("click", addDraftRoutePoint);
          }
          else map.off("click", addDraftRoutePoint);
          updateDraftRouteControls();
        }

        async function addDraftRoutePoint(event) {
          if (!isDrawingRoute || isEditingRoute || isAddingRoutePoint) return;
          let point = event.latlng;
          if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng) ||
              point.lat < -90 || point.lat > 90 || point.lng < -180 || point.lng > 180) {
            return;
          }

          isAddingRoutePoint = true;
          updateDraftRouteControls();
          try {
            let snapped = null;
            let leg = null;
            draftRouteNote = "";
            if (routeFollowWaterInput.checked) {
              try {
                routeBuilderStatus.textContent = "Vaarwegen laden…";
                await waterwayRouter.load();
                snapped = waterwayRouter.snap([point.lat, point.lng]);
                if (snapped) point = L.latLng(snapped.point[0], snapped.point[1]);
                else draftRouteNote = "geen vaarweg binnen 500 m, punt niet gekoppeld";
              } catch (error) {
                console.error("Vaarwegennetwerk laden mislukt:", error);
                draftRouteNote = "vaarwegen niet beschikbaar, rechte lijn gebruikt";
              }
            }

            const previousSnap = draftRouteSnaps[draftRouteSnaps.length - 1];
            if (draftRoutePoints.length === 0) {
              leg = [[point.lat, point.lng]];
            } else {
              if (snapped && previousSnap) leg = waterwayRouter.route(previousSnap, snapped);
              if (leg) {
                const extendingBase = draftRouteBaseSegments.length > 0 &&
                  draftRoutePoints.length === 1 && draftRouteLegs.length === 0;
                leg = leg.slice(extendingBase ? 0 : 1);
              }
              else {
                if (snapped && previousSnap) draftRouteNote = "geen vaarwegverbinding gevonden, rechte lijn gebruikt";
                else if (routeFollowWaterInput.checked && !draftRouteNote) draftRouteNote = "vorig punt niet op een vaarweg, rechte lijn gebruikt";
                leg = [[point.lat, point.lng]];
              }
            }

            draftRoutePoints.push(point);
            draftRouteLegs.push(leg);
            draftRouteSnaps.push(snapped);
            draftRouteUndoActions.push({ type: "point" });
            draftRouteRedoActions.length = 0;
            draftRouteLine.setLatLngs(draftRouteSegments());
            addDraftRouteMarker(point, draftRoutePoints.length === 1 && draftRouteBaseSegments.length === 0);
          } finally {
            isAddingRoutePoint = false;
            updateDraftRouteControls();
          }
        }

        function undoDraftRoutePoint() {
          if (isEditingRoute || isAddingRoutePoint || draftRoutePoints.length === 0) return;
          const action = draftRouteUndoActions.pop();
          draftRouteRedoActions.push({
            type: action?.type || "point",
            snapshot: captureDraftRouteSnapshot()
          });
          if (action?.type === "edit") {
            restoreDraftRouteSnapshot(action.snapshot);
            return;
          }
          draftRoutePoints.pop();
          draftRouteLegs.pop();
          draftRouteSnaps.pop();
          draftRouteNote = "";
          if (draftRouteBaseSegments.length > 0 && draftRoutePoints.length === 0) {
            draftRouteBaseSegments = [];
          }
          rebuildDraftRouteLayer();
          updateDraftRouteControls();
        }

        function redoDraftRoutePoint() {
          if (isEditingRoute || isAddingRoutePoint || draftRouteRedoActions.length === 0) return;
          const action = draftRouteRedoActions.pop();
          draftRouteUndoActions.push(action.type === "edit"
            ? { type: "edit", snapshot: captureDraftRouteSnapshot() }
            : { type: "point" });
          restoreDraftRouteSnapshot(action.snapshot);
        }

        function handleRouteHistoryShortcut(event) {
          if (event.defaultPrevented || !event.ctrlKey || event.altKey || event.metaKey || event.shiftKey ||
              (!routeBuilderDetails.open && !isDrawingRoute)) return;
          const target = event.target;
          if (target instanceof HTMLElement &&
              (target.isContentEditable || target.closest("input, textarea, select"))) return;
          const key = event.key.toLowerCase();
          if (key === "z" && !routeUndoButton.disabled) {
            event.preventDefault();
            undoDraftRoutePoint();
          } else if (key === "y" && !routeRedoButton.disabled) {
            event.preventDefault();
            redoDraftRoutePoint();
          }
        }

        function addDraftRouteMarker(point, firstPoint) {
          const marker = L.circleMarker(point, {
            radius: firstPoint ? 6 : 5,
            color: "#fff",
            weight: 2,
            fillColor: firstPoint ? "#168a63" : "#126f9a",
            fillOpacity: 1,
            pane: "draftRoutePane",
            interactive: false
          }).addTo(draftRouteLayer);
          draftRouteMarkers.push(marker);
        }

        function rebuildDraftRouteLayer() {
          draftRouteLayer.clearLayers();
          draftRouteLine = L.polyline(draftRouteSegments(), {
            color: "#126f9a",
            weight: 5,
            opacity: 0.95,
            pane: "draftRoutePane",
            interactive: false
          }).addTo(draftRouteLayer);
          draftRouteMarkers.length = 0;
          draftRoutePoints.forEach((point, index) => {
            addDraftRouteMarker(point, draftRouteBaseSegments.length === 0 && index === 0);
          });
        }

        function clearDraftRoute() {
          draftRouteBaseSegments = [];
          draftRoutePoints.length = 0;
          draftRouteLegs.length = 0;
          draftRouteSnaps.length = 0;
          draftRouteMarkers.length = 0;
          draftRouteUndoActions.length = 0;
          draftRouteRedoActions.length = 0;
          draftRouteNote = "";
          routeEditLayer.clearLayers();
          rebuildDraftRouteLayer();
          updateDraftRouteControls();
        }

        function startRouteEdit() {
          if (routeInteractionLocked() || !draftRouteSegments().some(segment => segment.length > 1)) return;
          isEditingRoute = true;
          window.clearTimeout(routeEditPreviewTimeout);
          routeEditPreviewTimeout = null;
          routeEditRequestId += 1;
          routeEditStart = null;
          routeEditEnd = null;
          routeEditSegmentIndex = null;
          routeEditViaPoints = [];
          routeEditPreviewPath = null;
          routeEditMessage = "Klik op het bestaande traject om het beginpunt te kiezen.";
          routeEditLayer.clearLayers();
          routeBuilderDetails.open = true;
          map.closePopup();
          map.on("click", handleRouteEditMapClick);
          updateRouteInteractionState();
          updateDraftRouteControls();
        }

        function cancelRouteEdit() {
          if (!isEditingRoute) return;
          map.off("click", handleRouteEditMapClick);
          window.clearTimeout(routeEditPreviewTimeout);
          routeEditPreviewTimeout = null;
          routeEditRequestId += 1;
          isCalculatingRouteEdit = false;
          isEditingRoute = false;
          routeEditStart = null;
          routeEditEnd = null;
          routeEditSegmentIndex = null;
          routeEditViaPoints = [];
          routeEditPreviewPath = null;
          routeEditMessage = "";
          routeEditLayer.clearLayers();
          updateRouteInteractionState();
          updateDraftRouteControls();
        }

        function findNearestRoutePosition(layerPoint) {
          const segments = draftRouteSegments();
          let nearest = null;
          for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
            const segment = segments[segmentIndex];
            for (let vertexIndex = 0; vertexIndex < segment.length - 1; vertexIndex += 1) {
              const start = map.latLngToLayerPoint(L.latLng(...segment[vertexIndex]));
              const end = map.latLngToLayerPoint(L.latLng(...segment[vertexIndex + 1]));
              const deltaX = end.x - start.x;
              const deltaY = end.y - start.y;
              const lengthSquared = deltaX * deltaX + deltaY * deltaY;
              let fraction = lengthSquared === 0
                ? 0
                : ((layerPoint.x - start.x) * deltaX + (layerPoint.y - start.y) * deltaY) / lengthSquared;
              fraction = Math.max(0, Math.min(1, fraction));
              const closestPoint = L.point(start.x + deltaX * fraction, start.y + deltaY * fraction);
              const distance = layerPoint.distanceTo(closestPoint);
              if (!nearest || distance < nearest.distance) {
                let point = map.layerPointToLatLng(closestPoint);
                if (fraction < 1e-6) {
                  fraction = 0;
                  point = L.latLng(...segment[vertexIndex]);
                } else if (fraction > 1 - 1e-6) {
                  fraction = 1;
                  point = L.latLng(...segment[vertexIndex + 1]);
                }
                nearest = { segmentIndex, vertexIndex, fraction, point, distance };
              }
            }
          }
          return nearest && nearest.distance <= 18 ? nearest : null;
        }

        function splitRouteSegmentAt(segment, location) {
          const point = [location.point.lat, location.point.lng];
          const prefix = segment.slice(0, location.vertexIndex + 1).map(coordinate => [...coordinate]);
          if (location.fraction > 1e-6) prefix.push(point);
          const suffixStart = location.fraction >= 1 - 1e-6
            ? location.vertexIndex + 2
            : location.vertexIndex + 1;
          const suffix = [point, ...segment.slice(suffixStart).map(coordinate => [...coordinate])];
          return { prefix, suffix };
        }

        function routeEditSelectedPath() {
          if (!routeEditStart || !routeEditEnd || routeEditSegmentIndex === null) return [];
          const segment = draftRouteSegments()[routeEditSegmentIndex];
          if (!segment) return [];
          return [
            [routeEditStart.point.lat, routeEditStart.point.lng],
            ...segment.slice(routeEditStart.vertexIndex + 1, routeEditEnd.vertexIndex + 1),
            [routeEditEnd.point.lat, routeEditEnd.point.lng]
          ];
        }

        function addRouteEditMarker(point, color, radius = 6) {
          L.circleMarker(point, {
            radius,
            color: "#fff",
            weight: 2,
            fillColor: color,
            fillOpacity: 1,
            pane: "draftRoutePane",
            interactive: false
          }).addTo(routeEditLayer);
        }

        function renderRouteEditOverlay() {
          routeEditLayer.clearLayers();
          const selectedPath = routeEditSelectedPath();
          if (selectedPath.length > 1) {
            L.polyline(selectedPath, {
              color: "#58645e",
              weight: 8,
              opacity: 0.75,
              dashArray: "5 6",
              pane: "draftRoutePane",
              interactive: false
            }).addTo(routeEditLayer);
          }
          if (routeEditPreviewPath) {
            L.polyline(routeEditPreviewPath, {
              color: "#8a45b5",
              weight: 6,
              opacity: 0.95,
              dashArray: "8 6",
              pane: "draftRoutePane",
              interactive: false
            }).addTo(routeEditLayer);
          }
          if (routeEditStart) addRouteEditMarker(routeEditStart.point, "#168a63", 7);
          if (routeEditEnd) addRouteEditMarker(routeEditEnd.point, "#d98516", 7);
          routeEditViaPoints.forEach(point => addRouteEditMarker(point, "#8a45b5", 6));
        }

        function scheduleRouteEditPreview() {
          if (!isEditingRoute || !routeEditStart || !routeEditEnd || routeEditViaPoints.length === 0) return;
          window.clearTimeout(routeEditPreviewTimeout);
          routeEditRequestId += 1;
          const requestId = routeEditRequestId;
          isCalculatingRouteEdit = true;
          routeEditPreviewPath = null;
          routeEditMessage = "Omleiding wordt bijgewerkt…";
          renderRouteEditOverlay();
          updateDraftRouteControls();
          routeEditPreviewTimeout = window.setTimeout(() => {
            if (requestId !== routeEditRequestId || !isEditingRoute) return;
            routeEditPreviewTimeout = null;
            isCalculatingRouteEdit = false;
            previewRouteEdit();
          }, 350);
        }

        function handleRouteEditMapClick(event) {
          if (!isEditingRoute || !event.layerPoint) return;
          if (routeEditPreviewPath) routeEditPreviewPath = null;

          if (!routeEditStart || !routeEditEnd) {
            const nearest = findNearestRoutePosition(event.layerPoint);
            if (!nearest) {
              routeEditMessage = "Klik dichter op een bestaand routedeel.";
            } else if (!routeEditStart) {
              routeEditStart = nearest;
              routeEditSegmentIndex = nearest.segmentIndex;
              routeEditMessage = "Kies het eindpunt verderop op hetzelfde routegedeelte.";
            } else if (nearest.segmentIndex !== routeEditSegmentIndex) {
              routeEditMessage = "Begin- en eindpunt moeten op hetzelfde GPX-segment liggen.";
            } else if (map.distance(routeEditStart.point, nearest.point) < 20) {
              routeEditMessage = "Kies begin- en eindpunten op voldoende afstand van elkaar.";
            } else {
              const startPosition = routeEditStart.vertexIndex + routeEditStart.fraction;
              const endPosition = nearest.vertexIndex + nearest.fraction;
              if (endPosition < startPosition) {
                routeEditEnd = routeEditStart;
                routeEditStart = nearest;
              } else {
                routeEditEnd = nearest;
              }
              routeEditMessage = "Traject geselecteerd in routevolgorde. Klik één of meer tussenpunten; de omleiding verschijnt automatisch.";
            }
          } else {
            routeEditViaPoints.push(event.latlng);
            routeEditMessage = `${routeEditViaPoints.length} tussenpunt${routeEditViaPoints.length === 1 ? "" : "en"} gekozen. Omleiding wordt automatisch bijgewerkt.`;
          }

          renderRouteEditOverlay();
          updateDraftRouteControls();
          if (routeEditViaPoints.length > 0) scheduleRouteEditPreview();
        }

        async function previewRouteEdit() {
          if (!isEditingRoute || !routeEditStart || !routeEditEnd || routeEditViaPoints.length === 0) return;
          window.clearTimeout(routeEditPreviewTimeout);
          routeEditPreviewTimeout = null;
          const requestId = ++routeEditRequestId;
          isCalculatingRouteEdit = true;
          routeEditPreviewPath = null;
          routeEditMessage = "Omleiding berekenen…";
          updateDraftRouteControls();

          try {
            const anchors = [routeEditStart.point, ...routeEditViaPoints, routeEditEnd.point];
            let path;
            if (!routeFollowWaterInput.checked) {
              path = anchors.map(point => [point.lat, point.lng]);
            } else {
              await waterwayRouter.load();
              if (requestId !== routeEditRequestId || !isEditingRoute) return;
              const snappedAnchors = anchors.map(point => waterwayRouter.snap([point.lat, point.lng]));
              const unsnappedIndex = snappedAnchors.findIndex(point => !point);
              if (unsnappedIndex !== -1) {
                routeEditMessage = `Punt ${unsnappedIndex + 1} ligt niet binnen 500 m van een beschikbare vaarweg; de route is niet gewijzigd.`;
                return;
              }

              path = [[anchors[0].lat, anchors[0].lng]];
              for (let index = 1; index < snappedAnchors.length; index += 1) {
                const leg = waterwayRouter.route(snappedAnchors[index - 1], snappedAnchors[index]);
                if (!leg) {
                  routeEditMessage = `Geen vaarwegverbinding gevonden bij tussenpunt ${index}; de route is niet gewijzigd.`;
                  return;
                }
                path.push(...(index === 1 ? leg : leg.slice(1)));
              }
              path.push([anchors[anchors.length - 1].lat, anchors[anchors.length - 1].lng]);
            }

            if (requestId !== routeEditRequestId || !isEditingRoute) return;
            routeEditPreviewPath = path;
            const distanceKm = calculateDistanceKm([path]);
            routeEditMessage = `Omleiding klaar · ${distanceKm.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km. Controleer de stippellijn en pas de wijziging toe.`;
          } catch (error) {
            if (requestId !== routeEditRequestId || !isEditingRoute) return;
            console.error("Omleiding berekenen mislukt:", error);
            routeEditMessage = "De omleiding kon niet worden berekend; de route is niet gewijzigd.";
          } finally {
            if (requestId === routeEditRequestId) {
              isCalculatingRouteEdit = false;
              renderRouteEditOverlay();
              updateDraftRouteControls();
            }
          }
        }

        function captureDraftRouteSnapshot() {
          return {
            baseSegments: draftRouteBaseSegments.map(segment => segment.map(coordinate => [...coordinate])),
            points: draftRoutePoints.map(point => [point.lat, point.lng]),
            legs: draftRouteLegs.map(leg => leg.map(coordinate => [...coordinate])),
            snaps: [...draftRouteSnaps],
            note: draftRouteNote
          };
        }

        function restoreDraftRouteSnapshot(snapshot) {
          draftRouteBaseSegments = snapshot.baseSegments.map(segment => segment.map(coordinate => [...coordinate]));
          draftRoutePoints.length = 0;
          snapshot.points.forEach(point => draftRoutePoints.push(L.latLng(...point)));
          draftRouteLegs.length = 0;
          snapshot.legs.forEach(leg => draftRouteLegs.push(leg.map(coordinate => [...coordinate])));
          draftRouteSnaps.length = 0;
          draftRouteSnaps.push(...snapshot.snaps);
          draftRouteNote = snapshot.note;
          rebuildDraftRouteLayer();
          updateDraftRouteControls();
        }

        function applyRouteEdit() {
          if (!isEditingRoute || !routeEditPreviewPath || routeEditSegmentIndex === null) return;
          const segments = draftRouteSegments().map(segment => segment.map(coordinate => [...coordinate]));
          const segment = segments[routeEditSegmentIndex];
          if (!segment) return;
          const { prefix } = splitRouteSegmentAt(segment, routeEditStart);
          const { suffix } = splitRouteSegmentAt(segment, routeEditEnd);
          segments[routeEditSegmentIndex] = [
            ...prefix,
            ...routeEditPreviewPath.slice(1, -1),
            ...suffix
          ];

          draftRouteUndoActions.push({ type: "edit", snapshot: captureDraftRouteSnapshot() });
          draftRouteRedoActions.length = 0;
          draftRouteBaseSegments = segments;
          draftRoutePoints.length = 0;
          draftRouteLegs.length = 0;
          draftRouteSnaps.length = 0;
          draftRouteMarkers.length = 0;
          const endpoint = draftRouteBaseSegments[draftRouteBaseSegments.length - 1].at(-1);
          draftRoutePoints.push(L.latLng(...endpoint));
          draftRouteSnaps.push(routeFollowWaterInput.checked ? waterwayRouter.snap(endpoint) : null);
          draftRouteNote = "";
          rebuildDraftRouteLayer();
          cancelRouteEdit();
          updateDraftRouteControls();
        }

        async function useSelectedRouteAsBase(index) {
          if (routeInteractionLocked()) return;
          const route = getActiveRoutes()[index];
          const segments = Array.isArray(route?.segments)
            ? route.segments.filter(segment => Array.isArray(segment) && segment.length > 1)
            : [];
          if (!route || segments.length === 0) return;
          if ((draftRoutePoints.length > 0 || draftRouteBaseSegments.length > 0) &&
              !window.confirm("De huidige route wordt vervangen door de geselecteerde route. Doorgaan?")) {
            return;
          }

          clearDraftRoute();
          draftRouteBaseSegments = segments.map(segment => segment.map(([latitude, longitude]) => [latitude, longitude]));
          const endpoint = L.latLng(...draftRouteBaseSegments[draftRouteBaseSegments.length - 1].at(-1));
          draftRoutePoints.push(endpoint);
          draftRouteSnaps.push(null);
          rebuildDraftRouteLayer();
          const routeName = `Nieuwe route op basis van ${route.name}`;
          routeNameInput.value = routeName.slice(0, routeNameInput.maxLength);
          routeBuilderDetails.open = true;
          isAddingRoutePoint = routeFollowWaterInput.checked;
          setRouteDrawing(true);
          map.closePopup();
          updateDraftRouteControls();

          if (routeFollowWaterInput.checked) {
            routeBuilderStatus.textContent = "Basisroute geladen · vaarwegen laden…";
            try {
              await waterwayRouter.load();
              const snappedEndpoint = waterwayRouter.snap([endpoint.lat, endpoint.lng]);
              draftRouteSnaps[0] = snappedEndpoint;
              if (!snappedEndpoint) draftRouteNote = "eindpunt basisroute ligt niet op een beschikbare vaarweg";
            } catch (error) {
              console.error("Vaarwegennetwerk laden mislukt:", error);
              draftRouteNote = "vaarwegen niet beschikbaar, nieuwe punten worden rechtstreeks verbonden";
            } finally {
              isAddingRoutePoint = false;
            }
            updateDraftRouteControls();
          }
        }

        function downloadDraftRoute() {
          const segments = draftRouteSegments().filter(segment => segment.length > 1);
          if (segments.length === 0) {
            updateDraftRouteControls();
            return;
          }

          const name = routeNameInput.value.trim() || "Mijn vaarroute";
          downloadGpxTrack(name, segments, "mijn-vaarroute");
        }

        routeBuilderDetails.addEventListener("toggle", () => {
          if (routeBuilderDetails.open && !isEditingRoute) setRouteDrawing(true);
        });
        routeDrawToggle.addEventListener("click", () => setRouteDrawing(!isDrawingRoute));
        routeUndoButton.addEventListener("click", undoDraftRoutePoint);
        routeRedoButton.addEventListener("click", redoDraftRoutePoint);
        document.addEventListener("keydown", handleRouteHistoryShortcut);
        routeSettingsToggle.addEventListener("click", () => {
          routeSettings.hidden = !routeSettings.hidden;
          routeSettingsToggle.setAttribute("aria-expanded", String(!routeSettings.hidden));
        });
        routeClearButton.addEventListener("click", clearDraftRoute);
        routeDownloadButton.addEventListener("click", downloadDraftRoute);
        routeEditToggle.addEventListener("click", () => {
          if (isEditingRoute) cancelRouteEdit();
          else startRouteEdit();
        });
        routeFollowWaterInput.addEventListener("change", () => {
          if (routeEditViaPoints.length > 0) scheduleRouteEditPreview();
        });
        routeEditPreviewButton.addEventListener("click", previewRouteEdit);
        routeEditApplyButton.addEventListener("click", applyRouteEdit);
        routeNameInput.addEventListener("input", updateDraftRouteControls);
        updateDraftRouteControls();


  return { isLocked: routeInteractionLocked, useSelectedRouteAsBase };
}
