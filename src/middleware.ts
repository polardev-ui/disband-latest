import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com https:",
].join("; ");

/**
 * Origins allowed to call our API cross-origin.
 *
 * The desktop app is a Tauri bundle: it is served from `tauri://localhost`
 * (macOS/Linux) or `https://tauri.localhost` (Windows) and has no API routes of
 * its own, so every call it makes to /api is cross-origin. Routes authenticate
 * by bearer token and never by cookie, so no credentials ride along on these
 * requests and an allowlisted origin grants no ambient authority.
 */
const ALLOWED_ORIGINS = new Set([
  "tauri://localhost",
  "https://tauri.localhost",
  "http://tauri.localhost",
  "https://www.disband.dev",
  "https://disband.dev",
  "http://localhost:3000",
  "http://localhost:1420",
]);

const CORS_METHODS = "GET, POST, PATCH, DELETE, OPTIONS";
const CORS_HEADERS = "Authorization, Content-Type";

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": CORS_METHODS,
    "Access-Control-Allow-Headers": CORS_HEADERS,
    "Access-Control-Max-Age": "86400",
    // The response varies by origin, so it must not be cached across origins.
    Vary: "Origin",
  };
}

export function middleware(_request: NextRequest) {
  const { pathname } = _request.nextUrl;

  // /api/bot and /api/v1 already carry `Access-Control-Allow-Origin: *` from
  // next.config for self-hosted bots. Setting it again here would emit the
  // header twice, which browsers reject outright.
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/bot") && !pathname.startsWith("/api/v1")) {
    const origin = _request.headers.get("origin");
    if (origin && ALLOWED_ORIGINS.has(origin)) {
      const headers = corsHeaders(origin);
      // A preflight never reaches the route handler, so it has to be answered
      // here — this is what the desktop app was failing on: a bare 204 with no
      // CORS headers, which the browser reports as "not allowed by
      // Access-Control-Allow-Origin" before the real request is ever sent.
      if (_request.method === "OPTIONS") {
        return new NextResponse(null, { status: 204, headers });
      }
      const response = NextResponse.next();
      for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      return response;
    }
    return NextResponse.next();
  }

  return middlewareForPages(_request);
}

function middlewareForPages(_request: NextRequest) {
  const requestHeaders = new Headers(_request.headers);
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-DNS-Prefetch-Control", "off");

  return response;
}

export const config = {
  // API routes are included for CORS (the desktop app calls them
  // cross-origin); the document security headers still only apply to HTML.
  matcher: [
    "/api/:path*",
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
