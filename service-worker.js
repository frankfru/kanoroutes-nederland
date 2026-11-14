import { MAX_GPX_BYTES } from "./src/gpx.js";

const cacheName = "shared-gpx-v1";
const scope = new URL(self.registration.scope);
const sharePath = new URL("share-target", scope).pathname;

self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.origin !== scope.origin || url.pathname !== sharePath) return;
  event.respondWith((async () => {
    const destination = new URL("./", scope);
    try {
      const form = await event.request.formData();
      const files = form.getAll("gpx");
      if (files.length !== 1 || !(files[0] instanceof File) || files[0].size === 0) {
        destination.searchParams.set("share-error", "invalid");
      } else if (files[0].size > MAX_GPX_BYTES) {
        destination.searchParams.set("share-error", "size");
      } else {
        const cache = await caches.open(cacheName);
        for (const request of await cache.keys()) {
          const response = await cache.match(request);
          const savedAt = Number(response.headers.get("x-saved-at"));
          if (!savedAt || Date.now() - savedAt > 24 * 60 * 60 * 1000) await cache.delete(request);
        }
        const id = crypto.randomUUID();
        const key = new URL(`__shared-gpx/${id}`, scope);
        await cache.put(key, new Response(files[0], {
          headers: {
            "content-type": "application/octet-stream",
            "x-file-name": encodeURIComponent(files[0].name),
            "x-saved-at": String(Date.now())
          }
        }));
        destination.searchParams.set("shared-gpx", id);
      }
      const client = event.clientId ? await self.clients.get(event.clientId) : null;
      if (client && client.url.startsWith(scope.href)) {
        client.postMessage({
          type: "shared-gpx",
          id: destination.searchParams.get("shared-gpx"),
          error: destination.searchParams.get("share-error")
        });
        return new Response(null, { status: 204 });
      }
    } catch (error) {
      console.error("Gedeeld GPX-bestand ontvangen mislukt:", error);
      destination.searchParams.set("share-error", "storage");
    }
    return Response.redirect(destination.href, 303);
  })());
});
