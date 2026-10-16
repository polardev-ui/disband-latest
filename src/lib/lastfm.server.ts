import { md5 } from "@/lib/md5";

/**
 * Server-side Last.fm helpers for the one-click connect flow. The API secret
 * never reaches the browser: the client only sees a ready-made auth URL.
 * Flow: auth.getToken → user approves on last.fm → the API account's fixed
 * callback URL carries the token back → auth.getSession names the user.
 */

const API_ROOT = "https://ws.audioscrobbler.com/2.0/";

export function lastfmServerConfig(): { apiKey: string; secret: string } | null {
  const apiKey = process.env.LASTFM_API_KEY ?? process.env.NEXT_PUBLIC_LASTFM_API_KEY;
  const secret = process.env.LASTFM_API_SECRET;
  if (!apiKey || !secret) return null;
  return { apiKey, secret };
}

/**
 * api_sig = md5 of every parameter sorted by name, each name directly
 * followed by its value, then the secret. `format` and `callback` are
 * excluded. Last.fm has used this scheme unchanged since forever.
 */
export function lastfmSignature(params: Record<string, string>, secret: string): string {
  const base = Object.keys(params)
    .filter((key) => key !== "format" && key !== "callback")
    .sort()
    .map((key) => key + params[key])
    .join("");
  return md5(base + secret);
}

export async function lastfmCall<Response>(
  method: string,
  params: Record<string, string>,
  config: { apiKey: string; secret: string },
): Promise<Response> {
  const all: Record<string, string> = { method, api_key: config.apiKey, ...params };
  const url = new URL(API_ROOT);
  for (const [key, value] of Object.entries(all)) url.searchParams.set(key, value);
  url.searchParams.set("api_sig", lastfmSignature(all, config.secret));
  url.searchParams.set("format", "json");

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const json = (await res.json()) as Record<string, unknown> & { error?: number; message?: string };
  if (typeof json.error === "number") {
    throw new Error(`Last.fm error ${json.error}: ${json.message ?? "unknown"}`);
  }
  return json as Response;
}
