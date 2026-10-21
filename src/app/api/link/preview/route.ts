import { NextRequest, NextResponse } from "next/server";
import { assertSafeUrl } from "@/lib/ssrf-guard";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

const MEDIA_API =
  process.env.NEXT_PUBLIC_MEDIA_API_URL ?? "https://cdn.disband.dev/v1";

export async function GET(req: NextRequest) {
  const ip = getClientIp(req) || "unknown";
  const limit = rateLimit(`link-preview:${ip}`, 30, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const target = req.nextUrl.searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "Missing url parameter." }, { status: 400 });
  }

  // The media service performs the actual fetch with its own DNS/redirect
  // protections. Do not fall back to fetching user-supplied URLs from this
  // process: a hostname can resolve to a private address after validation.
  try {
    await assertSafeUrl(target);
  } catch {
    return NextResponse.json({ error: "Invalid or disallowed url." }, { status: 400 });
  }

  try {
    const proxy = await fetch(
      `${MEDIA_API}/link/preview?url=${encodeURIComponent(target)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (proxy.ok) {
      const data = await proxy.json();
      return NextResponse.json(data, {
        headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
      });
    }
  } catch {
    // fall through to a bounded, non-fetching error
  }

  return NextResponse.json({ error: "Preview unavailable." }, { status: 502 });
}
