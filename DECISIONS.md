# DECISIONS

Format: decision, reason, what would change it.

## D1. Build the walk route builder first
- **Why:** best fit for React/Node skills and finishes in a few days. Gets people outside.
- **Alternatives:** offline bird companion (BirdNET in a browser is the riskiest part), planting planner (simpler, less impressive).
- **Revisit if:** the routing step proves too hard. Then use a simpler "nearest park + estimated loop" version.

## D2. Local model: `gemma2:2b` through Ollama
- **Why:** open-weight, small, runs on a laptop, already tested and working.
- **Not used:** `-cloud` models in Ollama. They run on remote servers, which breaks the "works offline" and "data stays on the device" story.
- **Revisit if:** extraction accuracy is poor. Try a larger local Gemma or another small open model by changing one string in `lib/llm.ts`.

## D3. The LLM only extracts preferences
- **Why:** small models invent facts. Routes, weather and places come from real data. The model reads the user's sentence and turns it into JSON.
- **Consequence:** all outputs are validated in code with safe defaults.

## D4. Google Antigravity is the builder, not the product
- **Why:** it writes code faster. The shipped app must not depend on it or on any closed model at runtime.
- **Post note:** say this openly.

## D5. Weather: Open-Meteo
- **Why:** free, no API key.
- **Check:** current terms and URL format before relying on it.

## D6. Places: OpenStreetMap via Overpass
- **Why:** open data, no key.
- **Risk:** public Overpass servers are rate limited and can be slow. Keep queries small (a radius around the user, only park/garden/path tags) and cache results.

## D7. Routing: FOSSGIS OSM Germany OSRM Foot Profile (`routing.openstreetmap.de/routed-foot`)
- **Requirement:** an OpenStreetMap router with a genuine **foot / walking profile**, free to use without an API key.
- **Candidate Evaluation (Tested between 52.5200, 13.4050 and 52.5250, 13.4150):**
  | Candidate | Endpoint Tested | Distance / Duration | Speed | Walking Profile? | Notes |
  |---|---|---|---|---|---|
  | **OSRM Project Demo** | `router.project-osrm.org/route/v1/foot` | 1738 m / 195 s | ~32.2 km/h | ❌ No (Car) | Ignores `/foot/` parameter; routes on car roads at driving speeds. |
  | **OSM Germany OSRM Foot** | `routing.openstreetmap.de/routed-foot/route/v1/foot` | 1299 m / 1039 s | **~4.5 km/h** | 🟢 **Yes** | Dedicated foot profile through pedestrian ways and plazas. |
  | **OSM Germany Valhalla** | `valhalla1.openstreetmap.de/route` (`pedestrian`) | 1297 m / 985 s | **~4.7 km/h** | 🟢 **Yes** | Genuine walking profile; requires JSON POST payload. |
  | **BRouter Web** | `brouter.de/brouter` (`foot-walking`) | — | — | ❌ Failed | Returned HTTP 500 error. |
- **Decision:** Use **FOSSGIS OSM Germany OSRM Foot** (`https://routing.openstreetmap.de/routed-foot/route/v1/foot/...`).
  - Standard GET request returning GeoJSON `LineString` coordinates.
  - Sized to pedestrian walking speed (~4.5–5 km/h).
  - Supports multi-waypoint round trips (`origin -> destination -> origin`).
- **Usage Policy:** Operated by FOSSGIS e.V. for OSM community & non-commercial use. Requires a descriptive `User-Agent` header (`NatureWalksGuide/1.0`), standard non-bulk query rate.
- **Fallback:** If offline or the routing service fails, compute an out-and-back straight-line distance (Haversine formula with a 1.3× urban detour factor) at 5 km/h, returning straight-line coordinates clearly marked with `isEstimate: true`.

## D8. Map: Leaflet with OpenStreetMap tiles
- **Why:** open source, light, easy in React. Load it client-side only via `next/dynamic` with `ssr: false` to avoid SSR `window is not defined` errors.
- **Packages:** `leaflet`, `react-leaflet`, `@types/leaflet`.
- **Marker Icon Fix:** Fixed the Next.js bundler 404 issue by overriding `L.Icon.Default` options and creating standalone high-contrast SVG DivIcons for the user's start position and destination/turnaround points.
- **Outdoor Visibility:** Applied high-contrast dual-line polyline (white casing + vivid blue/amber stroke) so the route is clearly visible against road networks and green park polygons in direct sunlight.

## D9. Be honest about offline
- **Why:** only the language step is truly offline in the MVP. The post will say that plainly, and will describe the offline pack as future work or as done, whichever is true.
