export function setupPwa({ importGpxFile, showError }) {
  function showShareError(shareError) {
    const messages = {
      invalid: "Deel één niet-leeg GPX-bestand.",
      size: "Het gedeelde GPX-bestand is groter dan 10 MB.",
      storage: "Het gedeelde GPX-bestand kon niet lokaal worden opgeslagen."
    };
    showError(messages[shareError] || "Het gedeelde GPX-bestand kon niet worden ontvangen.");
  }

  function receiveSharedFile(shareId) {
    (async () => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(shareId)) {
        throw new Error("De verwijzing naar het gedeelde GPX-bestand is ongeldig.");
      }
      const scope = new URL("../", import.meta.url);
      const key = new URL(`__shared-gpx/${shareId}`, scope);
      const cache = await caches.open("shared-gpx-v1");
      const response = await cache.match(key);
      if (!response) throw new Error("Het gedeelde GPX-bestand is niet meer beschikbaar.");
      try {
        const name = decodeURIComponent(response.headers.get("x-file-name") || "route.gpx");
        const file = new File([await response.blob()], name, { type: "application/gpx+xml" });
        await importGpxFile(file);
      } finally {
        await cache.delete(key);
      }
    })().catch(error => {
      console.error("Gedeeld GPX-bestand openen mislukt:", error);
      showError(error.message || "Het gedeelde GPX-bestand kon niet worden geopend.");
    });
  }

  const url = new URL(window.location.href);
  const shareId = url.searchParams.get("shared-gpx");
  const shareError = url.searchParams.get("share-error");
  if (shareId || shareError) {
    url.searchParams.delete("shared-gpx");
    url.searchParams.delete("share-error");
    history.replaceState(history.state, "", url);
  }

  if (shareError) showShareError(shareError);

  if (shareId) receiveSharedFile(shareId);

  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.addEventListener("message", event => {
      if (event.data?.type !== "shared-gpx") return;
      if (event.data.error) showShareError(event.data.error);
      else if (event.data.id) receiveSharedFile(event.data.id);
    });
    navigator.serviceWorker.register(new URL("../service-worker.js", import.meta.url), { type: "module" })
      .catch(error => {
        console.error("Webapp registreren mislukt:", error);
        showError("De webapp kon niet worden geïnstalleerd voor het ontvangen van gedeelde GPX-bestanden.");
      });
  }
}
