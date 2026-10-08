import { pickBestStart } from "../lib/weather.ts";
import { getStraightLineFallback } from "../lib/routing.ts";
import { chat } from "../lib/llm.ts";

async function verifyOffline() {
  console.log("=== Auditing Offline Behavior ===");

  // 1. Verify Local Ollama without external internet
  console.log("\n1. Testing Local Ollama (lib/llm.ts)...");
  try {
    const res = await chat(
      [
        { role: "system", content: "Reply ONLY with JSON: {\"test\": true}" },
        { role: "user", content: "hello" },
      ],
      { format: "json" }
    );
    console.log("Ollama response:", res.trim());
    console.log("Local LLM offline check: PASSED");
  } catch (err) {
    console.error("Local LLM offline check failed:", err.message);
  }

  // 2. Verify Weather offline fallback
  console.log("\n2. Testing Weather offline fallback (pickBestStart with empty hours)...");
  const weatherRes = pickBestStart([], "any", 30);
  console.log("Weather fallback result:", weatherRes);
  if (weatherRes.startTime === "Now" && weatherRes.reason.includes("offline")) {
    console.log("Weather offline fallback check: PASSED");
  } else {
    console.error("Weather offline fallback check: UNEXPECTED", weatherRes);
  }

  // 3. Verify Routing offline fallback
  console.log("\n3. Testing Routing offline fallback (getStraightLineFallback)...");
  const p1 = { lat: 52.5200, lon: 13.4050 };
  const p2 = { lat: 52.5250, lon: 13.4150 };
  const routeRes = getStraightLineFallback(p1, p2);
  console.log("Straight-line fallback result:", {
    isEstimate: routeRes.isEstimate,
    distanceMeters: routeRes.distanceMeters,
    durationMinutes: routeRes.durationMinutes,
    pointsCount: routeRes.coordinates.length,
  });
  if (routeRes.isEstimate === true && routeRes.distanceMeters > 0) {
    console.log("Routing offline fallback check: PASSED");
  } else {
    console.error("Routing offline fallback check: UNEXPECTED", routeRes);
  }
}

verifyOffline().catch(console.error);
