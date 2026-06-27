import { NextRequest, NextResponse } from "next/server";
import { userAgent } from "next/server";
import { isMobileGateDisabled, isMobileUserAgent } from "@/lib/mobile-detect";

export function middleware(request: NextRequest) {
  if (isMobileGateDisabled()) {
    const res = NextResponse.next();
    addSecurityHeaders(res);
    return res;
  }

  const pathname = request.nextUrl.pathname;

  if (
    pathname.startsWith("/mobile")
    || pathname.startsWith("/_next")
    || pathname === "/favicon.ico"
    || pathname.startsWith("/privacy")
    || pathname.startsWith("/terms")
  ) {
    const res = NextResponse.next();
    addSecurityHeaders(res);
    return res;
  }

  const ua = request.headers.get("user-agent");
  const { device } = userAgent(request);
  const mobile =
    device.type === "mobile"
    || device.type === "tablet"
    || isMobileUserAgent(ua);

  if (!mobile) {
    const res = NextResponse.next();
    addSecurityHeaders(res);
    return res;
  }

  const url = request.nextUrl.clone();
  url.pathname = "/mobile";
  url.search = "";
  const redirect = NextResponse.redirect(url);
  addSecurityHeaders(redirect);
  return redirect;
}

function addSecurityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
