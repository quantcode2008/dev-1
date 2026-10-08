"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default Leaflet icon paths in Next.js bundlers (Turbopack / Webpack)
if (typeof window !== "undefined") {
  delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

// High-contrast SVG DivIcons for bright outdoor sunlight visibility
const startMarkerIcon = L.divIcon({
  className: "custom-start-marker",
  html: `
    <div style="
      width: 26px;
      height: 26px;
      background: #1d4ed8;
      border: 3px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="width: 8px; height: 8px; background: #ffffff; border-radius: 50%;"></div>
    </div>
  `,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  popupAnchor: [0, -13],
});

const destMarkerIcon = L.divIcon({
  className: "custom-dest-marker",
  html: `
    <div style="
      width: 26px;
      height: 26px;
      background: #047857;
      border: 3px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="width: 8px; height: 8px; background: #ffffff; border-radius: 50%;"></div>
    </div>
  `,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  popupAnchor: [0, -13],
});

/**
 * Helper component to fit map view to the route coordinates and user location
 */
function MapBoundsFitter({
  userLocation,
  routeCoordinates,
}: {
  userLocation: { lat: number; lon: number };
  routeCoordinates?: [number, number][];
}) {
  const map = useMap();

  useEffect(() => {
    if (routeCoordinates && routeCoordinates.length > 0) {
      // routeCoordinates are [lon, lat] pairs from GeoJSON standard
      const latLngs: L.LatLngTuple[] = routeCoordinates.map(([lon, lat]) => [lat, lon]);
      latLngs.push([userLocation.lat, userLocation.lon]);

      const bounds = L.latLngBounds(latLngs);
      if (bounds.isValid()) {
        map.fitBounds(bounds, {
          padding: [35, 35],
          maxZoom: 17,
          animate: true,
        });
      }
    } else {
      map.setView([userLocation.lat, userLocation.lon], 15);
    }
  }, [userLocation, routeCoordinates, map]);

  return null;
}

export interface MapProps {
  userLocation: { lat: number; lon: number };
  routeCoordinates?: [number, number][]; // [lon, lat] GeoJSON coordinates
  isEstimate?: boolean;
  destination?: { lat: number; lon: number; name?: string } | null;
}

export default function Map({
  userLocation,
  routeCoordinates,
  isEstimate = false,
  destination,
}: MapProps) {
  // Convert [lon, lat] GeoJSON pairs to Leaflet [lat, lon] tuples
  const polylinePositions: L.LatLngTuple[] = (routeCoordinates || []).map(
    ([lon, lat]) => [lat, lon]
  );

  return (
    <div className="h-72 sm:h-80 w-full rounded-lg overflow-hidden border border-gray-300 shadow-sm relative z-0">
      <MapContainer
        center={[userLocation.lat, userLocation.lon]}
        zoom={15}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        {/* User start position marker */}
        <Marker
          position={[userLocation.lat, userLocation.lon]}
          icon={startMarkerIcon}
        >
          <Popup>
            <span className="font-semibold text-xs">Start: Your Location</span>
          </Popup>
        </Marker>

        {/* Turnaround / destination marker if present */}
        {destination && (
          <Marker
            position={[destination.lat, destination.lon]}
            icon={destMarkerIcon}
          >
            <Popup>
              <span className="font-semibold text-xs">
                {destination.name || "Destination / Turnaround"}
              </span>
            </Popup>
          </Marker>
        )}

        {/* High-contrast outdoor route line */}
        {polylinePositions.length > 0 && (
          <>
            {/* White casing for high contrast against roads & green parks */}
            <Polyline
              positions={polylinePositions}
              pathOptions={{
                color: "#ffffff",
                weight: 8,
                opacity: 0.9,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
            {/* Core route line: royal blue for verified walk, amber dashed for fallback estimate */}
            <Polyline
              positions={polylinePositions}
              pathOptions={{
                color: isEstimate ? "#d97706" : "#1d4ed8",
                weight: 5,
                opacity: 1,
                dashArray: isEstimate ? "8, 8" : undefined,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          </>
        )}

        <MapBoundsFitter
          userLocation={userLocation}
          routeCoordinates={routeCoordinates}
        />
      </MapContainer>
    </div>
  );
}
