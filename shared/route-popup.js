function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

export function createRoutePopupContent(route, {
  distanceKm,
  routeIndex,
  supportsGpxFileSharing = false,
  includeRouteBuilderAction = false,
  includeDeselectAction = false
}) {
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
    ? `<p class="popup-detail"><button class="popup-action" type="button" data-route-share="${routeIndex}">Deel route (gpx)</button></p>`
    : "";
  const routeBaseAction = includeRouteBuilderAction
    ? `<p class="popup-detail"><button class="popup-action" type="button" data-route-base="${routeIndex}">Gebruik als basis voor nieuwe route</button></p>`
    : "";
  const deselectAction = includeDeselectAction
    ? `<p class="popup-detail"><button class="popup-action" type="button" data-route-deselect>Selectie wissen</button></p>`
    : "";

  return `<p class="popup-title">${escapeHtml(route.name)}</p><p class="popup-detail">${distanceKm.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km</p>${pdfLink}${sourceLink}${routePageLink}${routeShareAction}${routeBaseAction}${deselectAction}`;
}
