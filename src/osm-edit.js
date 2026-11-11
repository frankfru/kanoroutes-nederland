export function enableOsmEditOnHold({ map, L }) {
  const container = map.getContainer();
  let press = null;
  let suppressClick = null;

  container.addEventListener("pointerdown", event => {
    if (press) {
      press = null;
      return;
    }
    if (!event.isPrimary || event.button !== 0 ||
        event.target.closest(".leaflet-control, .leaflet-popup")) return;
    press = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
      latlng: map.mouseEventToLatLng(event).wrap()
    };
  }, true);

  window.addEventListener("pointermove", event => {
    if (press && event.pointerId === press.pointerId &&
        Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) {
      press = null;
    }
  }, true);

  window.addEventListener("pointercancel", event => {
    if (press && event.pointerId === press.pointerId) press = null;
  }, true);

  window.addEventListener("pointerup", event => {
    if (!press || event.pointerId !== press.pointerId) return;
    const held = press;
    press = null;
    if (event.timeStamp - held.time <= 500 || !container.contains(event.target) ||
        Math.hypot(event.clientX - held.x, event.clientY - held.y) > 8) return;

    suppressClick = { x: event.clientX, y: event.clientY, until: event.timeStamp + 500 };
    const zoom = Math.max(17, Math.min(19, map.getZoom()));
    const link = document.createElement("a");
    link.href = `https://www.openstreetmap.org/edit#map=${zoom}/${held.latlng.lat.toFixed(6)}/${held.latlng.lng.toFixed(6)}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Deze plek bewerken in OpenStreetMap";
    L.popup().setLatLng(held.latlng).setContent(link).openOn(map);
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
