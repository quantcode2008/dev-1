# PRD: Walk Worthy

> Working name. Rename freely. Built for the "Touch Grass" open-source AI challenge.

## 1. Goal
Get people off the screen and onto a walk. The user types one sentence ("40 minute evening walk, somewhere green"), and the app returns **one route and one best time to leave**. The phone then goes back in the pocket.

## 2. Core rule: the screen is the shortest part
- One input, one answer, one big "Start walk" button.
- After "Start walk" the screen shows only: route line, time left, next turn. Nothing else.
- Optional spoken summary using the browser's built-in speech synthesis.
- No feeds, no accounts, no scrolling.

## 3. Why open-source AI is the core
- A local open-weight model (Gemma via Ollama) understands the user's sentence. It runs on the user's own machine.
- No prompts or locations are sent to an AI company's server.
- No per-request cost, no API keys.
- The model can be swapped by changing one string.
- The post must state honestly which parts work offline and which need internet.

## 4. User
Someone who wants to walk but won't plan it: a student, a remote worker, a run-club member checking a quick loop.

## 5. MVP features (must have)
1. Free-text walk request, parsed by local Gemma into structured JSON (duration, prefers green, time of day).
2. Get the user's location from the browser.
3. Weather for the next hours from Open-Meteo; pick the best time slot (low rain chance, comfortable temperature).
4. Find a nearby green place (park, garden, path) from OpenStreetMap data.
5. Walking route sized to the requested duration (about 5 km/h).
6. Map with the route (Leaflet + OpenStreetMap tiles).
7. A one-line result, e.g. "Leave at 6:10 pm. 38 minutes. Dry."
8. "Start walk" focus mode.

## 6. Stretch goals
- Offline pack: cache map tiles and park data for the user's area ahead of time.
- PWA install with a service worker.
- Spoken summary.
- Bird sound identification (BirdNET) as a separate mode.

## 7. Non-goals
- No user accounts, social features, or tracking.
- No cloud AI APIs.
- No turn-by-turn navigation engine of our own.

## 8. Success criteria
- Typing a sentence returns a route and a time in under about 30 seconds on the author's laptop.
- The language-understanding step works with Wi-Fi off.
- The author takes it on a real walk and writes down what broke (GPS, glare, battery, signal).
- The post explains clearly where open beat closed and where it didn't.
