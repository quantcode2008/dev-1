const MODEL = "gemma2:2b";
const OLLAMA_URL = "http://localhost:11434/api/chat";

export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface ChatOptions {
    format?: "json";
}

export class OllamaConnectionError extends Error {
    constructor(
        message = "Ollama is not running. Please start Ollama at http://localhost:11434",
        public cause?: unknown
    ) {
        super(message);
        this.name = "OllamaConnectionError";
    }
}

/**
 * Sends messages to local Ollama instance and returns the response text.
 * The model name lives exclusively in this file.
 */
export async function chat(
    messages: ChatMessage[],
    options?: ChatOptions
): Promise<string> {
    let res: Response;
    try {
        res = await fetch(OLLAMA_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: MODEL,
                stream: false,
                ...(options?.format ? { format: options.format } : {}),
                messages,
            }),
        });
    } catch (err: unknown) {
        const errorObj = err as { code?: string; cause?: { code?: string }; message?: string };
        if (
            errorObj?.code === "ECONNREFUSED" ||
            errorObj?.cause?.code === "ECONNREFUSED" ||
            errorObj?.message?.includes("fetch failed") ||
            errorObj?.message?.includes("ECONNREFUSED")
        ) {
            throw new OllamaConnectionError(
                "Ollama is not running. Please start Ollama at http://localhost:11434",
                err
            );
        }
        throw err;
    }

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Ollama request failed (${res.status}): ${errorText}`);
    }

    const data = await res.json();
    return data.message?.content ?? "";
}
