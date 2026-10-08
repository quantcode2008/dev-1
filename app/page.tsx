"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { getHourlyForecast, pickBestStart, BestTimeResult } from "@/lib/weather";
import { getNearbyGreenPlaces } from "@/lib/places";
import { getWalkingRoute } from "@/lib/routing";
import { Place, RouteResult } from "@/lib/types";

const Map = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => (
    <div className="h-72 sm:h-80 w-full bg-gray-100 flex items-center justify-center rounded-lg border border-gray-300 text-gray-500 text-sm">
      Loading map...
    </div>
  ),
});

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const [bestTime, setBestTime] = useState<BestTimeResult | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  const [places, setPlaces] = useState<Place[] | null>(null);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState<string | null>(null);

  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  async function calculateRoute(place: Place, originCoords?: { lat: number; lon: number }) {
    const origin = originCoords || coords;
    if (!origin) return;
    setSelectedPlace(place);
    setRouteLoading(true);
    try {
      const result = await getWalkingRoute(origin, { lat: place.lat, lon: place.lon }, 30);
      setRoute(result);
    } finally {
      setRouteLoading(false);
    }
  }

  async function send() {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    setReply((await res.json()).reply);
  }

  async function fetchWeather(lat: number, lon: number) {
    setWeatherLoading(true);
    setWeatherError(null);
    try {
      const hours = await getHourlyForecast(lat, lon);
      const result = pickBestStart(hours, "any", 30);
      setBestTime(result);
    } catch {
      setWeatherError("Unable to fetch weather forecast. Please check your network connection.");
    } finally {
      setWeatherLoading(false);
    }
  }

  async function fetchPlaces(lat: number, lon: number) {
    setPlacesLoading(true);
    setPlacesError(null);
    try {
      const results = await getNearbyGreenPlaces(lat, lon);
      setPlaces(results);
      if (results.length > 0) {
        calculateRoute(results[0], { lat, lon });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to fetch nearby green places.";
      setPlacesError(message);
    } finally {
      setPlacesLoading(false);
    }
  }

  function handleUseLocation() {
    setLocationError(null);
    setWeatherError(null);
    setPlacesError(null);

    if (!("geolocation" in navigator)) {
      setLocationError("Geolocation is not supported by your browser.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setCoords({ lat, lon });
        setLocating(false);
        fetchWeather(lat, lon);
        fetchPlaces(lat, lon);
      },
      (error) => {
        setLocating(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError("Location permission denied. Please allow location access in your browser settings.");
            break;
          case error.TIMEOUT:
            setLocationError("Location request timed out. Please try again.");
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError("Location information is unavailable.");
            break;
          default:
            setLocationError("An error occurred while getting your location.");
            break;
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }

  return (
    <main className="p-8 max-w-xl mx-auto space-y-4">
      <input
        className="border border-gray-400 bg-white text-black p-3 w-full rounded"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Ask your trail guide"
      />
      <div className="flex gap-3">
        <button className="bg-green-700 text-white px-4 py-2 rounded" onClick={send}>
          Ask
        </button>
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          onClick={handleUseLocation}
          disabled={locating}
        >
          {locating ? "Locating..." : "Use my location"}
        </button>
      </div>

      {coords && (
        <p className="text-sm text-gray-800 font-mono bg-gray-100 p-2 rounded">
          Location: {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)}
        </p>
      )}

      {locationError && (
        <p className="text-sm text-red-600 bg-red-50 p-2 rounded">
          {locationError}
        </p>
      )}

      {weatherLoading && (
        <p className="text-sm text-gray-500">Checking hourly weather forecast...</p>
      )}

      {bestTime && (
        <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-900">
          <p className="font-semibold">Best time to walk: {bestTime.startTime}</p>
          <p className="text-gray-700 capitalize">{bestTime.reason}</p>
        </div>
      )}

      {weatherError && (
        <p className="text-sm text-amber-800 bg-amber-50 p-2 rounded">
          {weatherError}
        </p>
      )}

      {placesLoading && (
        <p className="text-sm text-gray-500">Finding nearby green spaces...</p>
      )}

      {places && places.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-gray-200">
          <h3 className="font-semibold text-gray-900 text-sm">Nearby Green Spaces (within 2 km):</h3>
          <ul className="space-y-1.5">
            {places.map((place, idx) => {
              const isSelected = selectedPlace?.lat === place.lat && selectedPlace?.lon === place.lon;
              return (
                <li
                  key={`${place.lat}-${place.lon}-${idx}`}
                  onClick={() => calculateRoute(place)}
                  className={`text-sm p-2.5 rounded flex justify-between items-center border cursor-pointer transition-colors ${
                    isSelected ? "bg-blue-50 border-blue-400" : "bg-gray-50 hover:bg-gray-100 border-gray-200"
                  }`}
                >
                  <div>
                    <span className="font-medium text-gray-800">{place.name}</span>
                    <span className="text-xs text-blue-600 block">
                      {isSelected ? "Selected" : "Click to route"}
                    </span>
                  </div>
                  <span className="text-gray-500 font-mono text-xs">{place.distanceMeters} m</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {routeLoading && (
        <p className="text-sm text-gray-500">Calculating walking route (round-trip, ~5 km/h)...</p>
      )}

      {route && selectedPlace && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded text-sm space-y-2">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-blue-900">
              Walk Route: {selectedPlace.name} (Round Trip)
            </h3>
            <span
              className={`text-xs px-2 py-0.5 rounded font-medium ${
                route.isEstimate
                  ? "bg-amber-100 text-amber-800 border border-amber-300"
                  : "bg-emerald-100 text-emerald-800 border border-emerald-300"
              }`}
            >
              {route.isEstimate ? "⚠️ Straight-line estimate (offline fallback)" : "🟢 OpenStreetMap foot path"}
            </span>
          </div>
          <div className="flex gap-4 text-gray-700">
            <p>
              Distance: <strong className="font-mono">{route.distanceMeters} m</strong>
            </p>
            <p>
              Est. Time: <strong className="font-mono">{route.durationMinutes} mins</strong> (~5 km/h)
            </p>
            <p>
              Geometry: <strong className="font-mono">{route.coordinates.length} points</strong>
            </p>
          </div>
          {route.turnaroundPoint && (
            <p className="text-xs text-gray-500">
              Turnaround: {route.turnaroundPoint.lat.toFixed(4)}, {route.turnaroundPoint.lon.toFixed(4)}
              {route.turnaroundPoint.lat !== selectedPlace.lat && " (adjusted to match duration)"}
            </p>
          )}
        </div>
      )}

      {coords && (
        <div className="space-y-2 pt-2">
          <h3 className="font-semibold text-gray-900 text-sm">Interactive Route Map:</h3>
          <Map
            userLocation={coords}
            routeCoordinates={route?.coordinates}
            isEstimate={route?.isEstimate}
            destination={
              selectedPlace
                ? {
                    lat: route?.turnaroundPoint?.lat ?? selectedPlace.lat,
                    lon: route?.turnaroundPoint?.lon ?? selectedPlace.lon,
                    name: selectedPlace.name,
                  }
                : null
            }
          />
        </div>
      )}

      {places && places.length === 0 && !placesLoading && !placesError && (
        <p className="text-sm text-gray-500 italic">No parks, gardens, or nature reserves found within 2 km.</p>
      )}

      {placesError && (
        <p className="text-sm text-amber-800 bg-amber-50 p-2 rounded">
          {placesError}
        </p>
      )}

      <p>{reply}</p>
    </main>
  );
}