export function setupMobileRouteSheet({
  sidebar,
  sidebarContent,
  sheetToggle,
  mobileLayout,
  onResize,
  onLayoutChange = () => {}
}) {
  function setExpanded(expanded) {
    const shouldExpand = mobileLayout.matches && expanded;
    sidebar.classList.toggle("is-expanded", shouldExpand);
    sheetToggle.setAttribute("aria-expanded", String(shouldExpand));
    sheetToggle.setAttribute("aria-label", shouldExpand ? "Routes sluiten" : "Routes openen");
    document.getElementById("sheet-toggle-label").textContent = shouldExpand ? "Kaart bekijken" : "Routes bekijken";
    sidebarContent.inert = mobileLayout.matches && !shouldExpand;
  }

  setExpanded(false);
  mobileLayout.addEventListener("change", () => {
    setExpanded(false);
    onLayoutChange();
  });
  sheetToggle.addEventListener("click", () => {
    if (sheetToggle.dataset.swiped === "true") {
      delete sheetToggle.dataset.swiped;
      return;
    }
    setExpanded(sheetToggle.getAttribute("aria-expanded") !== "true");
    onResize();
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
    setExpanded(dragDistance < 0);
    onResize();
  });
  sheetToggle.addEventListener("pointercancel", () => { dragStartY = null; });

  return setExpanded;
}
