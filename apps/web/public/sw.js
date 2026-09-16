// Hand-written, intentionally minimal service worker.
//
// Scope is deliberately narrow: make the app *shell* bootable with no
// network, and never risk serving one tenant's cached authenticated page to
// another session. Actual data offline-support (caching read results,
// queuing writes) happens in application code against IndexedDB — see
// src/lib/offline/ — not here.
//
// - Static, hashed /_next/static/** assets: cache-first (safe, immutable).
// - Navigations (HTML documents): network-only; on failure, fall back to a
//   tiny static offline notice page instead of a browser error screen.
// - Everything else (RSC data fetches, server actions, API routes): always
//   network-only, never cached, so no stale/wrong-tenant data is ever served.

// Static assets are content-hashed by Next.js, so a fixed cache name is safe
// across deploys: new builds produce new hashed filenames (cache-missed and
// fetched fresh) while old entries simply go unused rather than going stale.
// skipWaiting()/clients.claim() below make each new sw.js take over as soon
// as the browser's own byte-diff update check notices this file changed, so
// no manual version string needs to be embedded here.
const STATIC_CACHE = "pm-static-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.add(OFFLINE_URL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never intercept mutations/server actions

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.json";

  if (isStaticAsset) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(STATIC_CACHE);
        const offline = await cache.match(OFFLINE_URL);
        return offline || Response.error();
      })
    );
    return;
  }

  // RSC payload fetches, server actions, API routes: no interception at all.
});
