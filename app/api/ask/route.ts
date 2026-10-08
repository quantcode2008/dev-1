import { NextResponse } from "next/server";
import { chat } from "@/lib/llm";

export async function POST(req: Request) {
    const { prompt } = await req.json();

    const reply = await chat([
        { role: "system", content: "You are a trail guide. Answer in one short sentence." },
        { role: "user", content: prompt },
    ]);

    return NextResponse.json({ reply });
}