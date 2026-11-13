export function enableOsmEditOnHold({ map, L, isBlocked = () => false }) {
  const container = map.getContainer();
  const HOLD_MS = 500;
  let press = null;
  let suppressClick = null;
  let holdTimer = null;

  function endPress() {
    clearTimeout(holdTimer);
    holdTimer = null;
    press = null;
  }

  function openEditPopup(latlng) {
    const zoom = Math.max(17, Math.min(19, map.getZoom()));
    const link = document.createElement("a");
    link.href = `https://www.openstreetmap.org/edit#map=${zoom}/${latlng.lat.toFixed(6)}/${latlng.lng.toFixed(6)}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Deze plek bewerken in OpenStreetMap";
    L.popup().setLatLng(latlng).setContent(link).openOn(map);
  }

  container.addEventListener("pointerdown", event => {
    if (press) {
      endPress();
      return;
    }
    if (isBlocked() || !event.isPrimary || event.button !== 0 ||
        event.target.closest(".leaflet-control, .leaflet-popup")) return;
    const latlng = map.mouseEventToLatLng(event).wrap();
    press = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, opened: false };
    holdTimer = setTimeout(() => {
      holdTimer = null;
      if (!press) return;
      press.opened = true;
      openEditPopup(latlng);
    }, HOLD_MS);
  }, true);

  window.addEventListener("pointermove", event => {
    if (press && event.pointerId === press.pointerId &&
        Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) {
      endPress();
    }
  }, true);

  window.addEventListener("pointercancel", event => {
    if (press && event.pointerId === press.pointerId) endPress();
  }, true);

  window.addEventListener("pointerup", event => {
    if (!press || event.pointerId !== press.pointerId) return;
    const held = press;
    endPress();
    if (held.opened) {
      suppressClick = { x: event.clientX, y: event.clientY, until: event.timeStamp + 500 };
    }
  }, true);

  container.addEventListener("click", event => {
    if (!suppressClick) return;
    const suppressed = suppressClick;
    suppressClick = null;
    if (event.detail !== 0 && event.timeStamp <= suppressed.until &&
        Math.hypot(event.clientX - suppressed.x, event.clientY - suppressed.y) <= 8) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  container.addEventListener("contextmenu", event => {
    if (press && press.pointerId !== undefined) event.preventDefault();
  }, true);
}
