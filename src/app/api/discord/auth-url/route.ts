import { NextResponse } from "next/server";
import { getRouteUser } from "@/lib/supabase/server";
import { buildAuthorizeUrl, signOAuthState } from "@/lib/discord";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { randomBytes } from "node:crypto";

export async function GET(req: Request) {
  try {
    const user = await getRouteUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const limit = rateLimit(`discord:auth-url:${user.id}`, 10, 60_000);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const guild = new URL(req.url).searchParams.get("guild") ?? "";
    if (!/^\d{5,25}$/.test(guild)) {
      return NextResponse.json({ error: "Missing Discord space." }, { status: 400 });
    }

    const state = await signOAuthState({
      userId: user.id,
      guild,
      nonce: randomBytes(16).toString("hex"),
    });
    return NextResponse.json({ url: buildAuthorizeUrl(state) });
  } catch (err) {
    console.error("Discord auth-url error:", err);
    const message = err instanceof Error ? err.message : "";
    if (/not configured|signing key/.test(message)) {
      return NextResponse.json({ error: "Discord connect is not set up yet." }, { status: 500 });
    }
    return NextResponse.json({ error: "Failed to start Discord connect" }, { status: 500 });
  }
}
