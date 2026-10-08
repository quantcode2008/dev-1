// Walk Worthy Service Worker
// Version 1.0.1

const SHELL_CACHE_NAME = "walk-worthy-shell-v2";
const TILE_CACHE_NAME = "walk-worthy-tiles-v1";

// Core App Shell assets cached on install
const PRECACHE_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/icon.svg",
];

// Install Event: Pre-cache App Shell resiliently
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE_NAME).then(async (cache) => {
      console.log("[SW] Opened shell cache:", SHELL_CACHE_NAME);
      for (const asset of PRECACHE_ASSETS) {
        try {
          const response = await fetch(asset, { cache: "reload" });
          if (response && response.status === 200) {
            await cache.put(asset, response);
            console.log("[SW] Pre-cached asset:", asset);
          } else {
            console.warn("[SW] Non-200 response for asset:", asset, response.status);
          }
        } catch (err) {
          console.warn("[SW] Precache fetch error for asset:", asset, err);
        }
      }
    })
  );
});

// Activate Event: Clean up outdated caches and claim clients immediately
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== SHELL_CACHE_NAME && key !== TILE_CACHE_NAME) {
            console.log("[SW] Removing old cache:", key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Intelligent offline caching strategy
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. OpenStreetMap Tile Requests (tile.openstreetmap.org)
  // Strategy: Cache-first to serve saved/viewed map tiles offline
  if (url.hostname.includes("tile.openstreetmap.org")) {
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          // If offline and tile not cached, return empty transparent 200 image response
          return new Response("", { status: 408, statusText: "Tile offline" });
        }
      })
    );
    return;
  }

  // 2. Navigation / Page Requests (HTML App Shell)
  // Strategy: Network-first, fallback to cached App Shell ('/') when server is stopped or offline
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache the latest page version
          const clone = response.clone();
          caches.open(SHELL_CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(async () => {
          // Server stopped or offline -> serve cached App Shell
          const cache = await caches.open(SHELL_CACHE_NAME);
          const cached = await cache.match(event.request);
          return cached || (await cache.match("/"));
        })
    );
    return;
  }

  // 3. Static Next.js Assets (_next/static/*, fonts, icons)
  // Strategy: Stale-while-revalidate / Cache-first
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".woff2")
  ) {
    event.respondWith(
      caches.open(SHELL_CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 4. Default: Network with cache fallback
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(event.request);
      return cached || new Response("Network offline", { status: 503 });
    })
  );
});
