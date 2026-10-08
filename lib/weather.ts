import { TimeOfDay } from "./types";

export interface HourlyForecastItem {
    time: string; // ISO string e.g. "2026-10-08T18:00"
    timestamp: number; // epoch ms
    temperature: number; // °C
    precipitationProbability: number; // 0-100%
}

export interface BestTimeResult {
    startTime: string;
    reason: string;
}

/**
 * Fetches hourly forecast from Open-Meteo for given coordinates.
 * Verified against official documentation: https://open-meteo.com/en/docs
 * Parameters used:
 * - latitude: number
 * - longitude: number
 * - hourly: "temperature_2m,precipitation_probability"
 * - timezone: "auto"
 * - forecast_days: 2 (to cover the next 24+ hours)
 */
export async function getHourlyForecast(
    lat: number,
    lon: number
): Promise<HourlyForecastItem[]> {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(
        lat
    )}&longitude=${encodeURIComponent(
        lon
    )}&hourly=temperature_2m,precipitation_probability&timezone=auto&forecast_days=2`;

    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Open-Meteo API returned status ${res.status}`);
    }

    const data = await res.json();
    const times: string[] = data.hourly?.time ?? [];
    const temps: number[] = data.hourly?.temperature_2m ?? [];
    const precips: number[] = data.hourly?.precipitation_probability ?? [];

    const items: HourlyForecastItem[] = [];
    for (let i = 0; i < times.length; i++) {
        items.push({
            time: times[i],
            timestamp: new Date(times[i]).getTime(),
            temperature: temps[i] ?? 20,
            precipitationProbability: precips[i] ?? 0,
        });
    }

    return items;
}

/**
 * Helper to check whether a local hour matches the user's preferred time of day.
 * - morning: 06:00 to 11:59
 * - evening: 17:00 to 21:59
 * - any: matches all hours
 */
function matchesTimeOfDay(date: Date, pref: TimeOfDay): boolean {
    const h = date.getHours();
    if (pref === "morning") return h >= 6 && h < 12;
    if (pref === "evening") return h >= 17 && h <= 21;
    return true;
}

/**
 * Formats an ISO string (e.g. "2026-10-08T18:00") into a clean display time (e.g. "6:00 PM").
 */
export function formatHour(timeStr: string): string {
    const d = new Date(timeStr);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Evaluates forecast hours in the next 12 hours and selects the optimal start time:
 * 1. Low rain probability first.
 * 2. Comfortable temperature (roughly 18°C to 28°C).
 * 3. Prefers matching hours if timeOfDay is "morning" or "evening".
 *
 * Returns { startTime, reason } where reason is short, e.g. "dry, 27 degrees".
 */
export function pickBestStart(
    hours: HourlyForecastItem[],
    timeOfDay: TimeOfDay = "any",
    _durationMinutes: number = 30
): BestTimeResult {
    void _durationMinutes;
    if (!hours || hours.length === 0) {
        return {
            startTime: "Now",
            reason: "no forecast data",
        };
    }

    const now = Date.now();
    // Look at hours starting from current window up to 12 hours ahead
    let candidates = hours.filter(
        (h) =>
            h.timestamp >= now - 30 * 60 * 1000 &&
            h.timestamp <= now + 12 * 60 * 60 * 1000
    );

    // If no hours found in immediate 12-hour window (e.g. testing with future data), fallback to available hours
    if (candidates.length === 0) {
        candidates = hours.slice(0, 12);
    }

    // Score each candidate (lower score is better)
    const scored = candidates.map((item, idx) => {
        const date = new Date(item.time);
        const matchesPref = matchesTimeOfDay(date, timeOfDay);

        // 1. Rain penalty: low rain chance is top priority
        const rainPenalty = item.precipitationProbability * 8;

        // 2. Temperature penalty: comfortable range 18 to 28 C
        let tempPenalty = 0;
        if (item.temperature < 18) {
            tempPenalty = (18 - item.temperature) * 4;
        } else if (item.temperature > 28) {
            tempPenalty = (item.temperature - 28) * 4;
        } else {
            // Slight tie-breaker towards ideal ~23 C
            tempPenalty = Math.abs(item.temperature - 23) * 0.5;
        }

        // 3. Time of day preference penalty if not matching preferred window
        let timePrefPenalty = 0;
        if (timeOfDay !== "any" && !matchesPref) {
            timePrefPenalty = 150;
        }

        // Slight tiebreaker for earlier start times
        const timeOrderPenalty = idx * 0.1;

        const totalScore = rainPenalty + tempPenalty + timePrefPenalty + timeOrderPenalty;

        return { item, score: totalScore };
    });

    scored.sort((a, b) => a.score - b.score);
    const best = scored[0].item;

    // Build short reason, e.g. "dry, 27 degrees" or "10% rain, 22 degrees"
    const rainText = best.precipitationProbability < 20 ? "dry" : `${best.precipitationProbability}% rain`;
    const tempText = `${Math.round(best.temperature)} degrees`;
    const reason = `${rainText}, ${tempText}`;

    return {
        startTime: formatHour(best.time),
        reason,
    };
}
