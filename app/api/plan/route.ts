import { NextResponse } from "next/server";
import { chat, OllamaConnectionError } from "@/lib/llm";
import { PlanPreferences } from "@/lib/types";

const DEFAULTS: PlanPreferences = {
    duration_minutes: 30,
    prefers_green: true,
    time_of_day: "any",
};

export async function POST(req: Request) {
    let body: { text?: unknown };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }

    const text = typeof body?.text === "string" ? body.text : "";

    let content: string;
    try {
        content = await chat(
            [
                {
                    role: "system",
                    content:
                        'Extract walk preferences. Reply ONLY with JSON: {"duration_minutes": number, "prefers_green": boolean, "time_of_day": "morning"|"evening"|"any"}. Use 30 if duration is not given.',
                },
                { role: "user", content: text },
            ],
            { format: "json" }
        );
    } catch (err: unknown) {
        const errorObj = err as { name?: string; code?: string; cause?: { code?: string }; message?: string };
        if (
            err instanceof OllamaConnectionError ||
            errorObj?.name === "OllamaConnectionError" ||
            errorObj?.code === "ECONNREFUSED" ||
            errorObj?.cause?.code === "ECONNREFUSED" ||
            errorObj?.message?.includes("Ollama is not running") ||
            errorObj?.message?.includes("ECONNREFUSED") ||
            errorObj?.message?.includes("fetch failed")
        ) {
            return NextResponse.json(
                { error: "Ollama is not running. Please start Ollama at http://localhost:11434" },
                { status: 503 }
            );
        }
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }

    // Parse model output
    let parsed: Record<string, unknown>;
    try {
        const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
        parsed = JSON.parse(cleaned);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            throw new Error("Model response is not a JSON object");
        }
    } catch {
        return NextResponse.json(
            {
                ...DEFAULTS,
                fallback: true,
            },
            { status: 200 }
        );
    }

    // Validate fields and apply defaults
    let duration_minutes = DEFAULTS.duration_minutes;
    if (
        typeof parsed.duration_minutes === "number" &&
        !Number.isNaN(parsed.duration_minutes) &&
        parsed.duration_minutes >= 5 &&
        parsed.duration_minutes <= 240
    ) {
        duration_minutes = Math.round(parsed.duration_minutes);
    }

    let prefers_green = DEFAULTS.prefers_green;
    if (typeof parsed.prefers_green === "boolean") {
        prefers_green = parsed.prefers_green;
    }

    let time_of_day = DEFAULTS.time_of_day;
    if (
        parsed.time_of_day === "morning" ||
        parsed.time_of_day === "evening" ||
        parsed.time_of_day === "any"
    ) {
        time_of_day = parsed.time_of_day;
    }

    const result: PlanPreferences = {
        duration_minutes,
        prefers_green,
        time_of_day,
    };

    return NextResponse.json(result);
}