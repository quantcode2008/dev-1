export type TimeOfDay = "morning" | "evening" | "any";

export interface PlanPreferences {
    duration_minutes: number;
    prefers_green: boolean;
    time_of_day: TimeOfDay;
    fallback?: boolean;
}

export interface BestTimeResult {
    startTime: string;
    reason: string;
}

export interface Place {
    name: string;
    lat: number;
    lon: number;
    distanceMeters: number;
}

export interface Coordinates {
    lat: number;
    lon: number;
}

export interface RouteResult {
    coordinates: [number, number][]; // GeoJSON [longitude, latitude] pairs
    distanceMeters: number;
    durationMinutes: number;
    isEstimate: boolean;
    turnaroundPoint?: Coordinates;
}
