"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { getHourlyForecast, pickBestStart, BestTimeResult } from "@/lib/weather";
import { getNearbyGreenPlaces } from "@/lib/places";
import { getWalkingRoute } from "@/lib/routing";
import {
  saveOfflinePack,
  loadOfflinePack,
  cacheRouteTiles,
  registerServiceWorker,
} from "@/lib/offline";
import { Place, RouteResult, PlanPreferences, Coordinates, OfflinePack } from "@/lib/types";

// Client-only dynamic Leaflet map to prevent SSR window reference errors
const Map = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => (
    <div className="h-72 sm:h-80 w-full bg-slate-100 flex items-center justify-center rounded-2xl border-2 border-slate-300 text-slate-700 font-semibold text-base">
      Loading route map...
    </div>
  ),
});

/**
 * Speaks text using the browser's built-in SpeechSynthesis API (zero external network services).
 */
function speakText(text: string) {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (err: unknown) {
      console.warn("Speech synthesis unavailable:", err);
    }
  }
}

export default function Home() {
  // Input & Planning State
  const [prompt, setPrompt] = useState("40 minute evening walk, somewhere green");
  const [planning, setPlanning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Result State
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [nearbyParks, setNearbyParks] = useState<Place[]>([]);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [summarySentence, setSummarySentence] = useState<string | null>(null);

  // Focus Mode State (T8 requirement: route map, minutes remaining, distance left, End walk button)
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Offline Pack & PWA State (T10 requirement)
  const [savedPack, setSavedPack] = useState<OfflinePack | null>(null);
  const [savingOffline, setSavingOffline] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);

  // Optional Voice Feature (off by default)
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  // Register service worker and load any previously saved offline pack on mount
  useEffect(() => {
    registerServiceWorker();
    loadOfflinePack().then((pack) => {
      if (pack) {
        setSavedPack(pack);
      }
    });
  }, []);

  function handleStartWalk() {
    setElapsedSeconds(0);
    setIsFocusMode(true);
  }

  function handleEndWalk() {
    setElapsedSeconds(0);
    setIsFocusMode(false);
  }

  // Walk focus mode timer
  useEffect(() => {
    if (!isFocusMode) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isFocusMode]);

  // Request browser geolocation with a Promise wrapper
  const acquireLocation = useCallback((): Promise<Coordinates> => {
    return new Promise((resolve, reject) => {
      if (coords) {
        resolve(coords);
        return;
      }
      if (typeof window === "undefined" || !("geolocation" in navigator)) {
        reject(new Error("Geolocation is not supported by your browser."));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newCoords: Coordinates = {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          };
          setCoords(newCoords);
          resolve(newCoords);
        },
        (error) => {
          switch (error.code) {
            case error.PERMISSION_DENIED:
              reject(
                new Error(
                  "Location permission denied. Please allow location access in your browser to plan local walks."
                )
              );
              break;
            case error.TIMEOUT:
              reject(new Error("Location request timed out. Please try again."));
              break;
            case error.POSITION_UNAVAILABLE:
              reject(
                new Error(
                  "Location unavailable. (Devices without a hardware GPS sensor require an internet connection for location lookup)."
                )
              );
              break;
            default:
              reject(new Error("Unable to retrieve your location."));
              break;
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }, [coords]);

  // Unified walk planning flow: One input -> One button -> ONE sentence result + map
  async function handlePlanWalk(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const query = prompt.trim() || "30 minute walk, somewhere green";
    setPlanning(true);
    setErrorMessage(null);
    setSaveSuccessNotice(null);
    setStatusMessage("Understanding your walk with local AI...");

    try {
      // 1. Local AI plan extraction (gemma2:2b via Ollama)
      let prefs: PlanPreferences = {
        duration_minutes: 30,
        prefers_green: true,
        time_of_day: "any",
      };

      try {
        const planRes = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: query }),
        });

        if (planRes.ok) {
          prefs = await planRes.json();
        } else if (planRes.status === 503) {
          const errData = await planRes.json().catch(() => null);
          if (errData?.error && String(errData.error).includes("Ollama")) {
            throw new Error(
              "Local Ollama is not running. Please start Ollama at http://localhost:11434 with gemma2:2b."
            );
          } else {
            console.warn("Server offline, using default 30-min walk preferences.");
          }
        } else {
          console.warn("Unable to parse walk preferences via AI. Using defaults.");
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes("Local Ollama")) {
          throw err;
        }
        console.warn("Could not reach /api/plan, using defaults:", err);
      }

      // 2. Browser GPS location
      setStatusMessage("Acquiring your location...");
      const userCoords = await acquireLocation();

      // 3. Fetch weather and nearby green spaces in parallel
      setStatusMessage("Checking forecast and finding green spaces...");
      const [forecastHours, greenPlaces] = await Promise.all([
        getHourlyForecast(userCoords.lat, userCoords.lon).catch(() => []),
        getNearbyGreenPlaces(userCoords.lat, userCoords.lon).catch(() => []),
      ]);

      setNearbyParks(greenPlaces);

      // Pick best start time based on model preferences
      const bestTime: BestTimeResult = pickBestStart(
        forecastHours,
        prefs.time_of_day,
        prefs.duration_minutes
      );

      // Select nearest green place or a default green heading
      const topPlace: Place =
        greenPlaces.length > 0
          ? greenPlaces[0]
          : {
              name: "Local green loop (offline fallback)",
              lat: userCoords.lat + 0.005,
              lon: userCoords.lon + 0.005,
              distanceMeters: 500,
            };
      setSelectedPlace(topPlace);

      // 4. Calculate walking route sized to duration_minutes (~5 km/h)
      setStatusMessage("Mapping walking route...");
      const walkingRoute = await getWalkingRoute(
        userCoords,
        { lat: topPlace.lat, lon: topPlace.lon },
        prefs.duration_minutes
      );
      setRoute(walkingRoute);

      // 5. Construct ONE sentence of result: "Leave at [time]. [X] minutes. [Weather]."
      const leaveClause =
        bestTime.startTime.toLowerCase() === "now"
          ? "Leave now"
          : `Leave at ${bestTime.startTime}`;
      const durationClause = `${walkingRoute.durationMinutes} minutes`;
      const weatherClause =
        bestTime.reason.charAt(0).toUpperCase() + bestTime.reason.slice(1);

      const sentence = `${leaveClause}. ${durationClause}. ${weatherClause}.`;
      setSummarySentence(sentence);

      // Optional voice readout if enabled
      if (voiceEnabled) {
        speakText(sentence);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setErrorMessage(msg);
    } finally {
      setPlanning(false);
      setStatusMessage(null);
    }
  }

  // Save the current walk, nearby parks, and map tiles for offline use (T10)
  async function handleSaveOffline() {
    if (!coords || !route || !selectedPlace || !summarySentence) return;
    setSavingOffline(true);
    setSaveSuccessNotice(null);
    try {
      // Cache minimal map tiles covering the route (strictly complies with OSM Tile Usage Policy)
      const tileCount = await cacheRouteTiles(coords, route.coordinates, 15);

      const pack: OfflinePack = {
        savedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        coords,
        route,
        place: selectedPlace,
        summarySentence,
        parks: nearbyParks,
        tileCount,
      };

      await saveOfflinePack(pack);
      setSavedPack(pack);
      setSaveSuccessNotice(
        `Offline pack saved! Stored ${tileCount} map tiles, route geometry, and ${nearbyParks.length} nearby parks in IndexedDB.`
      );
    } catch (err: unknown) {
      console.warn("Failed to save offline pack:", err);
      setSaveSuccessNotice("Unable to save offline pack.");
    } finally {
      setSavingOffline(false);
    }
  }

  // Restore the saved offline walk from IndexedDB
  function handleRestoreOfflinePack() {
    if (!savedPack) return;
    setCoords(savedPack.coords);
    setSelectedPlace(savedPack.place);
    setRoute(savedPack.route);
    setSummarySentence(savedPack.summarySentence);
    setNearbyParks(savedPack.parks);
    setSaveSuccessNotice(
      `Restored offline walk for ${savedPack.place.name} (${savedPack.tileCount} cached map tiles).`
    );
  }

  // Calculate remaining stats during walk focus mode
  const totalDurationSeconds = Math.max(1, (route?.durationMinutes || 30) * 60);
  const remainingSeconds = Math.max(0, totalDurationSeconds - elapsedSeconds);
  const minutesRemaining = Math.max(0, Math.ceil(remainingSeconds / 60));

  const totalDistanceMeters = route?.distanceMeters || 2000;
  const distanceFractionRemaining = remainingSeconds / totalDurationSeconds;
  const distanceRemainingMeters = Math.max(
    0,
    Math.round(totalDistanceMeters * distanceFractionRemaining)
  );

  const formattedDistanceLeft =
    distanceRemainingMeters >= 1000
      ? `${(distanceRemainingMeters / 1000).toFixed(1)} km`
      : `${distanceRemainingMeters} m`;

  // =========================================================================
  // FOCUS MODE: Show ONLY the route map, minutes remaining, and distance left
  // Hide everything else!
  // =========================================================================
  if (isFocusMode && coords && route) {
    return (
      <main className="min-h-screen bg-white text-slate-950 p-4 sm:p-6 flex flex-col justify-between max-w-lg mx-auto">
        {/* Top Focus HUD: High-contrast, large outdoor metrics */}
        <header className="space-y-4 pt-2">
          <div className="flex justify-between items-end border-b-4 border-slate-950 pb-4">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-600">
                Time Remaining
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-5xl sm:text-6xl font-black font-mono tracking-tight text-slate-950">
                  {minutesRemaining}
                </span>
                <span className="text-lg font-bold text-slate-700">min</span>
              </div>
            </div>

            <div className="text-right">
              <p className="text-xs font-black uppercase tracking-widest text-slate-600">
                Distance Left
              </p>
              <span className="text-4xl sm:text-5xl font-black font-mono tracking-tight text-slate-950 block">
                {formattedDistanceLeft}
              </span>
            </div>
          </div>

          {remainingSeconds === 0 && (
            <div className="p-3 bg-emerald-100 border-2 border-emerald-600 rounded-xl text-center text-emerald-950 font-black text-lg">
              Walk completed! Welcome back.
            </div>
          )}
        </header>

        {/* Center: Full Route Map */}
        <section className="my-4 flex-1 flex flex-col justify-center min-h-[340px]">
          <Map
            userLocation={coords}
            routeCoordinates={route.coordinates}
            isEstimate={route.isEstimate}
            destination={
              selectedPlace
                ? {
                    lat: route.turnaroundPoint?.lat ?? selectedPlace.lat,
                    lon: route.turnaroundPoint?.lon ?? selectedPlace.lon,
                    name: selectedPlace.name,
                  }
                : null
            }
          />
        </section>

        {/* Bottom: Big High-Contrast "End walk" Button */}
        <footer className="pb-4">
          <button
            type="button"
            onClick={handleEndWalk}
            className="w-full py-5 bg-slate-950 active:bg-slate-800 text-white font-black text-2xl rounded-2xl shadow-xl transition-transform active:scale-[0.98] uppercase tracking-wider"
          >
            End walk
          </button>
        </footer>
      </main>
    );
  }

  // =========================================================================
  // MAIN FLOW: One input, one button, ONE sentence result + map
  // Screen is the shortest part of the walk!
  // =========================================================================
  return (
    <main className="min-h-screen bg-white text-slate-950 p-4 sm:p-6 max-w-lg mx-auto flex flex-col space-y-6">
      {/* Minimal Header */}
      <header className="pt-2">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-950">
          Walk Worthy
        </h1>
        <p className="text-sm font-semibold text-slate-600 mt-1">
          One sentence to get off the screen and into the world.
        </p>
      </header>

      {/* Offline Pack Available Notification (if previously saved) */}
      {savedPack && !summarySentence && (
        <div className="p-4 bg-emerald-50 border-2 border-emerald-500 rounded-2xl flex items-center justify-between gap-3 shadow-sm">
          <div>
            <p className="font-black text-emerald-950 text-sm">💾 Offline Pack Available</p>
            <p className="text-xs text-emerald-800">
              {savedPack.place.name} • {savedPack.route.durationMinutes} min • {savedPack.tileCount} map tiles saved
            </p>
          </div>
          <button
            type="button"
            onClick={handleRestoreOfflinePack}
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs rounded-xl shadow-md flex-shrink-0"
          >
            Load saved walk
          </button>
        </div>
      )}

      {/* ONE Input + ONE Button Form */}
      <form onSubmit={handlePlanWalk} className="space-y-3">
        <label htmlFor="walk-input" className="sr-only">
          What kind of walk do you want?
        </label>
        <input
          id="walk-input"
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. 40 minute evening walk, somewhere green"
          disabled={planning}
          className="w-full text-lg sm:text-xl font-bold p-4 bg-white text-slate-950 border-2 border-slate-950 rounded-2xl shadow-sm focus:outline-none focus:ring-4 focus:ring-slate-400 placeholder:text-slate-400 disabled:opacity-50"
        />

        <button
          type="submit"
          disabled={planning}
          className="w-full py-4 bg-slate-950 hover:bg-slate-800 active:bg-slate-900 text-white font-black text-xl rounded-2xl shadow-md transition-all active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {planning ? (
            <span>Planning your walk...</span>
          ) : (
            <span>Plan walk</span>
          )}
        </button>

        {/* Optional Voice Readout Toggle (Off by default) */}
        <div className="flex items-center justify-between px-1 pt-1">
          <label
            htmlFor="voice-toggle"
            className="text-xs font-bold uppercase tracking-wider text-slate-600 cursor-pointer select-none"
          >
            Voice summary
          </label>
          <button
            id="voice-toggle"
            type="button"
            role="switch"
            aria-checked={voiceEnabled}
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            className={`px-3 py-1 rounded-full text-xs font-black transition-colors ${
              voiceEnabled
                ? "bg-slate-950 text-white"
                : "bg-slate-200 text-slate-700 hover:bg-slate-300"
            }`}
          >
            {voiceEnabled ? "🔊 On" : "🔈 Off"}
          </button>
        </div>
      </form>

      {/* Planning Status or Errors */}
      {statusMessage && (
        <div className="p-4 bg-slate-100 border border-slate-300 rounded-2xl text-sm font-bold text-slate-800 animate-pulse">
          {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-red-50 border-2 border-red-500 rounded-2xl text-sm font-bold text-red-900 space-y-2">
          <p>{errorMessage}</p>
          {errorMessage.includes("Location") && (
            <button
              type="button"
              onClick={() => {
                setCoords({ lat: 52.5200, lon: 13.4050 });
                setErrorMessage(null);
              }}
              className="px-3 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800"
            >
              Set coordinates to test offline (52.5200, 13.4050)
            </button>
          )}
        </div>
      )}

      {/* ONE SENTENCE RESULT + MAP + START WALK BUTTON */}
      {summarySentence && coords && route && (
        <section className="space-y-5 pt-2 border-t-2 border-slate-200 animate-fadeIn">
          {/* ONE Sentence Result: Very large, high contrast for outdoors */}
          <div className="space-y-1">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-950 leading-tight tracking-tight">
                {summarySentence}
              </h2>
              {/* Optional Re-speak button */}
              <button
                type="button"
                onClick={() => speakText(summarySentence)}
                title="Speak summary aloud"
                className="p-2 text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 rounded-xl text-lg flex-shrink-0"
              >
                🔊
              </button>
            </div>
            {selectedPlace && (
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Loop via {selectedPlace.name} (Round-trip)
              </p>
            )}
            {route.isEstimate && (
              <p className="text-xs font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded-lg p-2 mt-2">
                ⚠️ Offline notice: Route is an estimated straight-line loop (weather forecast, park search, and live map tiles require network).
              </p>
            )}
          </div>

          {/* Leaflet Route Map */}
          <div className="rounded-2xl overflow-hidden border-2 border-slate-950 shadow-md">
            <Map
              userLocation={coords}
              routeCoordinates={route.coordinates}
              isEstimate={route.isEstimate}
              destination={
                selectedPlace
                  ? {
                      lat: route.turnaroundPoint?.lat ?? selectedPlace.lat,
                      lon: route.turnaroundPoint?.lon ?? selectedPlace.lon,
                      name: selectedPlace.name,
                    }
                  : null
              }
            />
          </div>

          {/* Large Thumb-Friendly "Start walk" Button */}
          <button
            type="button"
            onClick={handleStartWalk}
            className="w-full py-5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black text-2xl sm:text-3xl rounded-2xl shadow-xl transition-transform active:scale-[0.98] uppercase tracking-wider flex items-center justify-center gap-2"
          >
            <span>Start walk</span>
            <span aria-hidden="true">&rarr;</span>
          </button>

          {/* Save this area for offline (T10 requirement) */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleSaveOffline}
                disabled={savingOffline}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 border border-slate-300 rounded-xl text-xs font-black shadow-sm flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <span>💾</span>
                <span>{savingOffline ? "Saving offline pack..." : "Save this area for offline"}</span>
              </button>

              {savedPack && (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                  Pack ready ({savedPack.tileCount} tiles)
                </span>
              )}
            </div>

            {saveSuccessNotice && (
              <p className="text-xs font-bold text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                {saveSuccessNotice}
              </p>
            )}

            {/* Clearly show what is saved and what is NOT saved */}
            <div className="p-3.5 bg-slate-50 border border-slate-300 rounded-xl text-xs space-y-2">
              <p className="font-black text-slate-900 text-xs">Offline Pack Scope:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-800">
                <div className="bg-emerald-50 border border-emerald-200 p-2 rounded-lg">
                  <p className="font-black text-emerald-900 text-[11px] mb-1">✅ What is saved:</p>
                  <ul className="space-y-0.5 text-[11px] text-emerald-800 list-disc list-inside">
                    <li>App Shell (opens with server stopped)</li>
                    <li>Route line & turnaround waypoint</li>
                    <li>{nearbyParks.length > 0 ? nearbyParks.length : 1} nearby parks in IndexedDB</li>
                    <li>Map tiles for this route (zoom 15)</li>
                    <li>Focus mode countdown & distance</li>
                  </ul>
                </div>
                <div className="bg-amber-50 border border-amber-200 p-2 rounded-lg">
                  <p className="font-black text-amber-900 text-[11px] mb-1">❌ What is NOT saved:</p>
                  <ul className="space-y-0.5 text-[11px] text-amber-800 list-disc list-inside">
                    <li>Live weather (hourly rain/temp needs network)</li>
                    <li>Areas outside this immediate 2 km walk</li>
                    <li>High zoom levels outside the route</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}