import { getWalkingRoute, haversineDistance, getStraightLineFallback } from "../lib/routing.ts";

async function runTests() {
  console.log("=== Testing lib/routing.ts ===");

  // 1. Haversine distance test
  const p1 = { lat: 52.5200, lon: 13.4050 };
  const p2 = { lat: 52.5250, lon: 13.4150 };
  const d = haversineDistance(p1, p2);
  console.log("Haversine distance (Berlin test points):", d, "meters");

  // 2. Normal live walking route test (30 minutes)
  console.log("\n--- Test 2: Live walk to green place (30 min) ---");
  const route30 = await getWalkingRoute(p1, p2, 30);
  console.log("Is estimate?", route30.isEstimate);
  console.log("Distance:", route30.distanceMeters, "meters");
  console.log("Duration:", route30.durationMinutes, "minutes");
  console.log("Geometry coordinates count:", route30.coordinates.length);
  console.log("Start coord:", route30.coordinates[0]);
  console.log("End coord:", route30.coordinates[route30.coordinates.length - 1]);

  // 3. Sizing test: short duration requested (10 minutes = ~833m total, ~416m one-way)
  // Since p1 -> p2 is ~870m direct, it should interpolate a turnaround point closer to p1!
  console.log("\n--- Test 3: Sizing to short walk (10 min) with far destination ---");
  const route10 = await getWalkingRoute(p1, p2, 10);
  console.log("Is estimate?", route10.isEstimate);
  console.log("Distance:", route10.distanceMeters, "meters");
  console.log("Duration:", route10.durationMinutes, "minutes");
  console.log("Turnaround point:", route10.turnaroundPoint);
  const turnaroundDist = haversineDistance(p1, route10.turnaroundPoint);
  console.log("Turnaround distance from origin:", turnaroundDist, "meters (should be ~320-416m)");

  // 4. Fallback test: force straight-line estimate
  console.log("\n--- Test 4: Offline / Straight-line Fallback ---");
  const fallbackRoute = getStraightLineFallback(p1, p2);
  console.log("Is estimate?", fallbackRoute.isEstimate);
  console.log("Estimated Distance:", fallbackRoute.distanceMeters, "meters");
  console.log("Estimated Duration:", fallbackRoute.durationMinutes, "minutes");
  console.log("Coordinates count:", fallbackRoute.coordinates.length);
  console.log("Coordinates:", fallbackRoute.coordinates);
}

runTests().catch(console.error);
