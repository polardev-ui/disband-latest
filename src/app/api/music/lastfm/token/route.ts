import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/server-auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { lastfmCall, lastfmServerConfig } from "@/lib/lastfm.server";

/**
 * Starts the one-click Last.fm connect: swaps the API key + secret for a
 * request token and hands the browser the last.fm approval URL to open in a
 * popup. The secret never leaves the server.
 */
export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request as import("next/server").NextRequest);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const ip = getClientIp(request) || "unknown";
    const limit = rateLimit(`lastfm-token:user:${user.id}:${ip}`, 20, 60_000);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const config = lastfmServerConfig();
    if (!config) {
      return NextResponse.json(
        { error: "Last.fm connect is not configured on this server yet." },
        { status: 503 },
      );
    }

    const data = await lastfmCall<{ token?: string }>("auth.getToken", {}, config);
    if (!data.token) throw new Error("Last.fm returned no token");

    const authUrl =
      "https://www.last.fm/api/auth/?" +
      new URLSearchParams({ api_key: config.apiKey, token: data.token }).toString();
    // Last.fm's browser flow can end on Last.fm's own "you can close this
    // window" page when no callback URL is registered for the API account.
    // Return the short-lived token so the client can finish the exchange by
    // polling instead of depending on that redirect (see SettingsModal).
    return NextResponse.json({ authUrl, token: data.token });
  } catch {
    return NextResponse.json({ error: "Couldn't start the Last.fm connection." }, { status: 502 });
  }
}
