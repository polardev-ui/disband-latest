import { NextRequest, NextResponse } from "next/server";
import { userAgent } from "next/server";
import { isMobileGateDisabled, isMobileUserAgent } from "@/lib/mobile-detect";

export function middleware(request: NextRequest) {
  if (isMobileGateDisabled()) {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;

  if (
    pathname.startsWith("/mobile")
    || pathname.startsWith("/api/")
    || pathname.startsWith("/_next")
    || pathname === "/favicon.ico"
    || pathname.startsWith("/privacy")
    || pathname.startsWith("/terms")
  ) {
    return NextResponse.next();
  }

  const ua = request.headers.get("user-agent");
  const { device } = userAgent(request);
  const mobile =
    device.type === "mobile"
    || device.type === "tablet"
    || isMobileUserAgent(ua);

  if (!mobile) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/mobile";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
