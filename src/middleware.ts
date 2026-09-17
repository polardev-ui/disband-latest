import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === "development" ? "'unsafe-eval'" : ""} https://challenges.cloudflare.com https://js.stripe.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com https:",
].join("; ");

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

    Vary: "Origin",
  };
}

const MOBILE_UA = /Mobile|iPhone|iPod|iPad|Android|webOS|BlackBerry|IEMobile|Opera Mini/;
const BOT_UA = /Googlebot|Google-InspectionTool|bingbot|Baiduspider|YandexBot|DuckDuckBot|Slurp|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Applebot|Discordbot|WhatsApp|TelegramBot|SkypeUriPreview|Slackbot|rogerbot|Pinterest|GPTBot|ClaudeBot|CCBot|PerplexityBot|OAI-SearchBot|Bytespider|Diffbot|archive\.org_bot|ia_archiver|SemrushBot|AhrefsBot|DotBot|MJ12bot|Moz/;

function isMobilePageView(request: NextRequest): boolean {
  const ua = request.headers.get("user-agent") ?? "";
  return MOBILE_UA.test(ua) && !BOT_UA.test(ua);
}

const MOBILE_REDIRECT_PATHS = new Set(["/", "/app", "/login", "/home"]);

export function middleware(_request: NextRequest) {
  const { pathname } = _request.nextUrl;

  if (pathname.startsWith("/server/")) {
    const code = pathname.slice("/server/".length).split("/")[0];
    if (code) {
      if (isMobilePageView(_request)) {
        return NextResponse.redirect(new URL("/mobile", _request.url), 302);
      }
      const url = new URL("/app", _request.url);
      url.search = _request.nextUrl.search;
      return NextResponse.rewrite(url);
    }
  }

  if (MOBILE_REDIRECT_PATHS.has(pathname) && isMobilePageView(_request)) {
    return NextResponse.redirect(new URL("/mobile", _request.url), 302);
  }

  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/bot") && !pathname.startsWith("/api/v1")) {
    const origin = _request.headers.get("origin");
    if (origin && ALLOWED_ORIGINS.has(origin)) {
      const headers = corsHeaders(origin);

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

  matcher: [
    "/api/:path*",
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
