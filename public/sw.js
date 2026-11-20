// ডিজিটাল সার্ভিস পয়েন্ট DSP ePOS Service Worker
const CACHE_VERSION = "dsp-epos-v2.4.0";
const PRECACHE_ASSETS = [
  "/",
  "/manifest.json",
  "/icon.svg",
  "/sqlite/sqlite3.wasm",
  "/sqlite/sqlite3-opfs-async-proxy.js"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_VERSION) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // In local development, BYPASS cache so edits take effect immediately
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return;
  }

  // Skip Google Script API sync requests
  if (url.hostname.includes("script.google.com") || url.hostname.includes("googleapis.com")) {
    return;
  }

  // Production: Cache static assets, WASM, fonts
  if (
    url.pathname.endsWith(".wasm") ||
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/sqlite/") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png")
  ) {
    event.respondWith(
      caches.match(req).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(req).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          }
          return networkResponse;
        });
      })
    );
  }
});
