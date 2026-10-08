import { Coordinates, RouteResult } from "./types";

/**
 * Calculates straight-line distance in meters between two coordinates using the Haversine formula.
 */
export function haversineDistance(c1: Coordinates, c2: Coordinates): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((c2.lat - c1.lat) * Math.PI) / 180;
  const dLon = ((c2.lon - c1.lon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((c1.lat * Math.PI) / 180) *
      Math.cos((c2.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Estimates a straight-line fallback route (origin -> turnaround -> origin).
 * Multiplies straight-line distance by 1.3 to approximate street grid detours.
 * Assumes average walking speed of 5 km/h (~83.33 m/min).
 */
export function getStraightLineFallback(
  origin: Coordinates,
  turnaround: Coordinates
): RouteResult {
  const oneWayDirect = haversineDistance(origin, turnaround);
  // In urban/suburban environments, actual walking route is roughly 1.3x straight-line
  const detourFactor = 1.3;
  const roundTripDistance = Math.round(oneWayDirect * 2 * detourFactor);
  // Walking speed 5 km/h = 5000m / 60min = ~83.33 m/min
  const walkingSpeedMpm = 5000 / 60;
  const durationMinutes = Math.max(1, Math.round(roundTripDistance / walkingSpeedMpm));

  return {
    coordinates: [
      [origin.lon, origin.lat],
      [turnaround.lon, turnaround.lat],
      [origin.lon, origin.lat],
    ],
    distanceMeters: roundTripDistance,
    durationMinutes,
    isEstimate: true,
    turnaroundPoint: turnaround,
  };
}

/**
 * Produces a walking route sized to duration_minutes at ~5 km/h.
 *
 * Algorithm:
 * 1. Target round-trip distance = durationMinutes * (5000 m / 60 min).
 * 2. Target one-way distance = target round-trip / 2.
 * 3. If destination is further than target one-way distance, interpolates a turnaround point
 *    along the bearing to the destination to respect the requested walking time.
 *    Otherwise, uses the destination green place directly as the turnaround.
 * 4. Requests a foot profile round-trip route (origin -> turnaround -> origin) from
 *    the FOSSGIS OSM Germany OSRM Foot router.
 * 5. If network/routing fails, falls back to a straight-line estimate clearly marked with isEstimate: true.
 */
export async function getWalkingRoute(
  origin: Coordinates,
  destination: Coordinates,
  durationMinutes: number = 30
): Promise<RouteResult> {
  const speedMpm = 5000 / 60; // ~83.33 m/min (5 km/h)
  const targetTotalDistance = durationMinutes * speedMpm;
  const targetOneWayDistance = targetTotalDistance / 2;

  const directDistance = haversineDistance(origin, destination);
  const estimatedStreetOneWay = directDistance * 1.3;

  // Decide turnaround point
  let turnaround: Coordinates;
  if (directDistance === 0) {
    turnaround = destination;
  } else if (estimatedStreetOneWay > targetOneWayDistance) {
    // Destination is further than half our target walking time
    // Interpolate a turnaround point along the vector to match target walking duration
    const ratio = Math.max(0.05, Math.min(1.0, targetOneWayDistance / estimatedStreetOneWay));
    turnaround = {
      lat: Number((origin.lat + ratio * (destination.lat - origin.lat)).toFixed(6)),
      lon: Number((origin.lon + ratio * (destination.lon - origin.lon)).toFixed(6)),
    };
  } else {
    // Destination is reachable within target duration; walk to the green place and back
    turnaround = destination;
  }

  // Attempt live OSRM foot routing from FOSSGIS OSM Germany
  const coordsString = `${origin.lon},${origin.lat};${turnaround.lon},${turnaround.lat};${origin.lon},${origin.lat}`;
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coordsString}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "NatureWalksGuide/1.0 (dev-1)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      throw new Error(`Routing HTTP error: ${res.status}`);
    }

    const data = await res.json();
    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
      throw new Error(`OSRM routing returned code: ${data.code}`);
    }

    const route = data.routes[0];
    const distanceMeters = Math.round(route.distance);
    // Duration in minutes calculated from real walking time (seconds / 60)
    const routeDurationMinutes = Math.max(1, Math.round(route.duration / 60));

    return {
      coordinates: route.geometry.coordinates as [number, number][],
      distanceMeters,
      durationMinutes: routeDurationMinutes,
      isEstimate: false,
      turnaroundPoint: turnaround,
    };
  } catch {
    // Fall back to straight-line estimate if offline or router fails
    return getStraightLineFallback(origin, turnaround);
  }
}
