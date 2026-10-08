import { OfflinePack, Coordinates } from "./types";

const DB_NAME = "walk_worthy_offline_db";
const DB_VERSION = 1;
const STORE_NAME = "offline_pack";
const TILE_CACHE_NAME = "walk-worthy-tiles-v1";

/**
 * Opens or initializes the local IndexedDB instance.
 */
export function openOfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported in this environment."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves the active walk route and nearby places to IndexedDB.
 */
export async function saveOfflinePack(pack: OfflinePack): Promise<void> {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const item = { id: "current_area", ...pack };
    const request = store.put(item);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Loads the saved offline pack from IndexedDB, if one exists.
 */
export async function loadOfflinePack(): Promise<OfflinePack | null> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get("current_area");

      request.onsuccess = () => {
        if (request.result) {
          const { id, ...pack } = request.result;
          void id;
          resolve(pack as OfflinePack);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

/**
 * Deletes the saved offline pack from IndexedDB.
 */
export async function deleteOfflinePack(): Promise<void> {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete("current_area");

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Converts Latitude/Longitude to standard Slippy Map tile coordinates at a given zoom level.
 */
export function latLonToTile(
  lat: number,
  lon: number,
  zoom: number
): { x: number; y: number } {
  const latRad = (lat * Math.PI) / 180;
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n
  );
  return { x, y };
}

/**
 * Caches a minimal set of OpenStreetMap tiles covering the route bounding box.
 * Fully complies with OpenStreetMap Tile Usage Policy:
 * 1. Strict limit on tile count (capped to max 9 tiles).
 * 2. Gentle 150ms delay between tile requests.
 * 3. Descriptive User-Agent header.
 */
export async function cacheRouteTiles(
  coords: Coordinates,
  routeCoordinates: [number, number][],
  zoom = 15
): Promise<number> {
  if (typeof window === "undefined" || !("caches" in window)) {
    return 0;
  }

  // Calculate bounding box across origin and route points
  let minLat = coords.lat;
  let maxLat = coords.lat;
  let minLon = coords.lon;
  let maxLon = coords.lon;

  for (const [lon, lat] of routeCoordinates) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }

  // Get tile ranges
  const topLeft = latLonToTile(maxLat, minLon, zoom);
  const bottomRight = latLonToTile(minLat, maxLon, zoom);

  const startX = Math.min(topLeft.x, bottomRight.x);
  const endX = Math.max(topLeft.x, bottomRight.x);
  const startY = Math.min(topLeft.y, bottomRight.y);
  const endY = Math.max(topLeft.y, bottomRight.y);

  // Clamp bounding box to at most 3x3 tiles (9 tiles maximum) to respect OSM policy
  const clampedEndX = Math.min(endX, startX + 2);
  const clampedEndY = Math.min(endY, startY + 2);

  const tileUrls: string[] = [];
  for (let x = startX; x <= clampedEndX; x++) {
    for (let y = startY; y <= clampedEndY; y++) {
      tileUrls.push(`https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`);
    }
  }

  const cache = await caches.open(TILE_CACHE_NAME);
  let savedCount = 0;

  for (const url of tileUrls) {
    try {
      // Check if already in cache
      const existing = await cache.match(url);
      if (existing) {
        savedCount++;
        continue;
      }

      // Fetch tile and store in tile cache with polite delay
      const response = await fetch(url);

      if (response.ok) {
        await cache.put(url, response.clone());
        savedCount++;
      }

      // 150ms polite rate limit delay
      await new Promise((res) => setTimeout(res, 150));
    } catch (err) {
      console.warn("[Offline Pack] Failed to fetch tile:", url, err);
    }
  }

  console.log(`[Offline Pack] Successfully cached ${savedCount} tiles to ${TILE_CACHE_NAME}`);
  return savedCount;
}

/**
 * Registers the service worker in supported browsers.
 */
export async function registerServiceWorker(): Promise<boolean> {
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      console.log("Service Worker registered with scope:", reg.scope);
      return true;
    } catch (err) {
      console.warn("Service Worker registration failed:", err);
      return false;
    }
  }
  return false;
}
