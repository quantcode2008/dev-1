# TASKS

## Instructions for the coding agent (read first)
- Read PRD.md, ARCHITECTURE.md and DECISIONS.md before starting.
- Do **one task at a time**. After each task, stop and summarize what changed and how to test it.
- **Hard rules:** no cloud AI APIs, no AI API keys, all inference through local Ollama, the model name lives only in `lib/llm.ts`.
- If a task seems to need a runtime network call to an AI service, **stop and ask**.
- Do not invent package names or API URLs. If unsure, check the official docs and say what you checked.
- Keep the UI minimal. The screen should be the shortest part of the experience.
- Do not delete existing working code without asking.

## Done
- [x] Next.js app created
- [x] Ollama running locally with `gemma2:2b`
- [x] `/api/ask` test route works end to end
- [x] Offline test of the LLM loop (Wi-Fi off)
- [x] T1. Move the model call into `lib/llm.ts`
- [x] T2. Harden `/api/plan`
- [x] T3. Get the user's location
- [x] T4. Weather and best time
- [x] T5. Find a green place
- [x] T6. Walking route (decision task: tested candidates, D7 updated, lib/routing.ts created)
- [x] T7. Map (components/Map.tsx with client-side Leaflet, OpenStreetMap tiles, high-contrast sunlight line)
- [x] T8. One-line result and focus mode (one input, one button, ONE sentence, big Start Walk & End Walk buttons, focus mode HUD, optional speech synthesis)
- [x] T9. Offline honesty check (codebase audit for AI APIs/keys, external network calls listed, ARCHITECTURE.md offline table updated, offline degradation verified)
- [x] T10 (stretch). PWA and offline pack (app/manifest.ts, public/sw.js service worker, IndexedDB pack persistence, OSM tile caching, offline restore)

## To do
*(All core and stretch tasks T1–T10 completed!)*

## Field test log (filled in by the human, outdoors)
- Date / place:
- What worked:
- What broke (GPS, glare, battery, signal, wrong route):
- Offline results:
- Screenshots / photos taken:
