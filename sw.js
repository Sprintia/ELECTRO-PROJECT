// Electro Terrain — Service Worker (offline shell)
const CACHE = "electro-terrain-v5-auto";
const ASSETS = [
  "./",
  "./index.html",
  "./assets/style.css",
  "./manifest.json",
  "./js/app.js",
  "./js/router.js",
  "./js/db.js",
  "./js/ui.js",
  "./js/modules/home.js",
  "./js/modules/usines.js",
  "./js/modules/nodeView.js",
  "./js/modules/history.js",
  "./js/modules/tools.js",
  "./js/modules/settings.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/maskable-512.png",
  "./assets/icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE) ? caches.delete(k) : null));
    self.clients.claim();
  })());
});

// Cache-first for app shell; network-first for everything else (not used much in V1)
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  // SPA hash routing: always serve index.html for navigations
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match("./index.html");
      try {
        const fresh = await fetch(req);
        return fresh;
      } catch {
        return cached || fetch("./index.html");
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      // cache static files
      if (req.method === "GET" && (url.pathname.includes("/assets/") || url.pathname.includes("/js/"))) {
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (e) {
      return cached || new Response("Offline", {status: 503});
    }
  })());
});
