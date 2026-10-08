# ARCHITECTURE

## Stack
| Layer | Choice | Notes |
|---|---|---|
| App | Next.js (App Router, TypeScript, Tailwind) | Already created |
| Local LLM | Ollama + `gemma2:2b` | Server at `http://localhost:11434` |
| Weather | Open-Meteo | Free, no API key. Verify current URL format in its docs |
| Places | OpenStreetMap data via Overpass API | Public servers are rate limited |
| Routing | Walking-capable OSM router (see DECISIONS.md) | Must support a foot profile |
| Map | Leaflet + OpenStreetMap tiles | |
| Storage | Browser localStorage / IndexedDB | Only for per-user convenience |

## Request flow
```
Browser page
  1. user types a sentence
  2. POST /api/plan  ->  Ollama (gemma2:2b)  ->  JSON preferences
  3. browser geolocation -> lat/lon
  4. GET weather (Open-Meteo) -> best time slot
  5. places lookup (Overpass) -> nearest green area
  6. routing -> walking route sized to duration
  7. draw route on Leaflet map, show one-line result
```

## Existing routes
- `app/api/ask/route.ts`: test route that proves page -> Ollama works. Keep until /api/plan is stable, then it may be removed.
- `app/api/plan/route.ts`: turns text into JSON preferences.

## Planned modules
```
lib/llm.ts         // the ONLY file that calls Ollama; model name lives here
lib/weather.ts     // Open-Meteo calls, best-slot picker
lib/places.ts      // Overpass query for parks / green areas
lib/routing.ts     // walking route + duration estimate
lib/types.ts       // Preferences, Place, Route types
components/Map.tsx // Leaflet map (client only)
```

## JSON contract from the LLM
```json
{ "duration_minutes": 40, "prefers_green": true, "time_of_day": "evening" }
```
Allowed `time_of_day`: `morning`, `evening`, `any`. Code must validate and fall back to defaults (30 min, any, green true) if the model returns something invalid. A 2B model will sometimes slip.

## Hard rules
1. **No cloud AI APIs.** No OpenAI, Gemini, Anthropic or other hosted model calls from the app. No AI API keys anywhere.
2. All model calls go through `lib/llm.ts` so the model can be swapped by changing one string.
3. The LLM only reads the user's request. It never invents routes, places, distances or weather.
4. Only free open data sources, no paid APIs.
5. Never commit secrets. None should be needed.

## What works offline vs online
| Part | Offline? |
|---|---|
| Understanding the sentence (Gemma via Ollama) | Yes |
| The app itself, once running locally | Yes |
| Weather | No, unless cached |
| Places and routing | No, unless cached |
| Map tiles | No, unless cached |

State this table honestly in the post. An "offline pack" is a stretch goal that moves the last rows to Yes.

## Testing
- Before declaring anything offline, stop network access (Wi-Fi off) and re-test.
- Check the code for any `fetch` to an external AI endpoint before every commit.
