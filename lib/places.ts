import { Place } from "./types";

/**
 * In-memory cache for the current session.
 * Maps rounded coordinate keys ("lat,lon") to cached Place results.
 */
const sessionPlacesCache = new Map<string, Place[]>();

/**
 * Calculates the great-circle distance between two coordinates in meters using the Haversine formula.
 */
export function haversineDistanceMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const R = 6371e3; // Earth's mean radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c);
}

/**
 * Queries OpenStreetMap Overpass API for parks, gardens, and nature reserves
 * within about 2 km of the user's location.
 *
 * Official documentation checked:
 * - https://wiki.openstreetmap.org/wiki/Overpass_API
 * - https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL
 *
 * Endpoint: https://overpass-api.de/api/interpreter
 */
export async function getNearbyGreenPlaces(
    lat: number,
    lon: number,
    radiusMeters: number = 2000
): Promise<Place[]> {
    // Check in-memory session cache (coordinates rounded to 3 decimal places ~110m)
    const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)},${radiusMeters}`;
    if (sessionPlacesCache.has(cacheKey)) {
        return sessionPlacesCache.get(cacheKey)!;
    }

    // Overpass QL query: only parks, gardens, nature reserves with a 10s timeout
    const query = `[out:json][timeout:10];
(
  node["leisure"~"^(park|garden|nature_reserve)$"](around:${radiusMeters},${lat},${lon});
  way["leisure"~"^(park|garden|nature_reserve)$"](around:${radiusMeters},${lat},${lon});
  relation["leisure"~"^(park|garden|nature_reserve)$"](around:${radiusMeters},${lat},${lon});
);
out center 30;`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    let res: Response;
    try {
        res = await fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "WalkWorthy-App/1.0",
            },
            body: `data=${encodeURIComponent(query)}`,
            signal: controller.signal,
        });
    } catch (err: unknown) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === "AbortError") {
            throw new Error("Places lookup timed out. The server took too long to respond.");
        }
        throw new Error("Unable to reach the places service. Please check your internet connection.");
    } finally {
        clearTimeout(timeoutId);
    }

    if (res.status === 429) {
        throw new Error("Places service is busy (rate limit reached). Please wait a moment and try again.");
    }

    if (res.status === 504) {
        throw new Error("Places lookup timed out on the server. Please try again later.");
    }

    if (!res.ok) {
        throw new Error(`Places service error (${res.status})`);
    }

    let data: { elements?: Array<{ lat?: number; lon?: number; center?: { lat?: number; lon?: number }; tags?: { name?: string } }> };
    try {
        data = await res.json();
    } catch {
        throw new Error("Invalid response received from places service.");
    }

    const elements = data.elements ?? [];
    const seenNames = new Set<string>();
    const places: Place[] = [];

    for (const el of elements) {
        const placeLat = el.lat ?? el.center?.lat;
        const placeLon = el.lon ?? el.center?.lon;
        if (typeof placeLat !== "number" || typeof placeLon !== "number") {
            continue;
        }

        const name = (el.tags?.name || "").trim() || "Unnamed green area";
        const distanceMeters = haversineDistanceMeters(lat, lon, placeLat, placeLon);

        // Deduplicate adjacent elements with the exact same name (e.g. multi-polygon parks)
        const dedupKey = `${name}-${Math.round(distanceMeters / 100)}`;
        if (name !== "Unnamed green area" && seenNames.has(dedupKey)) {
            continue;
        }
        seenNames.add(dedupKey);

        places.push({
            name,
            lat: placeLat,
            lon: placeLon,
            distanceMeters,
        });
    }

    // Sort by distance ascending and return top 5
    places.sort((a, b) => a.distanceMeters - b.distanceMeters);
    const topPlaces = places.slice(0, 5);

    // Cache results in memory for the session
    sessionPlacesCache.set(cacheKey, topPlaces);

    return topPlaces;
}
