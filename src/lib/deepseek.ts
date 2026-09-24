import "server-only";

/**
 * Tether's model client.
 *
 * DeepSeek's API is OpenAI-compatible and serves `deepseek-flash`
 * (V4.1-Flash), a cheap native-vision model — the right fit for a fast,
 * Aero-only in-app assistant. Vision input is passed as `image_url` parts
 * inside a `user` message only (DeepSeek does not accept images on the
 * assistant/system roles).
 */

const MAX_TOKENS = 800; // hard cap on reply length — Tether stays terse

export interface DeepSeekContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string | DeepSeekContentPart[];
}

export class DeepSeekError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeepSeekError";
  }
}

export class DeepSeekUnavailableError extends DeepSeekError {}

// Module-level so a single instance reuses config; reads env each call so
// changes pick up on refresh.
function endpoint(): string {
  return (process.env.DEEPSEEK_API_URL || "https://api.deepseek.com").replace(/\/+$/, "");
}

function model(): string {
  return process.env.DEEPSEEK_MODEL || "deepseek-flash";
}

// Tether is a first-party assistant, but its key is the DeepSeek API key.
// Accept both spellings so the env var name doesn't matter.
function apiKey(): string {
  return process.env.DEEPSEEK_API_KEY || process.env.TETHER_API_KEY || "";
}

/**
 * Ask DeepSeek for a completion. Throws DeepSeekUnavailableError when the
 * model cannot be reached (missing key, transport failure, 4xx/5xx) so the
 * route can degrade. Returns the plain text reply.
 */
export async function deepseekChat(opts: {
  system?: string;
  messages: DeepSeekMessage[];
  maxTokens?: number;
}): Promise<string> {
  const key = apiKey();
  if (!key) {
    throw new DeepSeekUnavailableError("DeepSeek API key is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const body: Record<string, unknown> = {
      model: model(),
      messages: [
        ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
        ...opts.messages,
      ],
      max_tokens: opts.maxTokens ?? MAX_TOKENS,
      temperature: 0.4,
      stream: false,
    };

    const res = await fetch(`${endpoint()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new DeepSeekError(`DeepSeek responded ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) throw new DeepSeekError("DeepSeek returned an empty reply.");
    return text;
  } catch (err) {
    if (err instanceof DeepSeekError) throw err;
    throw new DeepSeekUnavailableError(
      err instanceof Error && err.name === "AbortError"
        ? "The model request timed out."
        : err instanceof Error
          ? err.message
          : "The model request failed.",
    );
  } finally {
    clearTimeout(timeout);
  }
}