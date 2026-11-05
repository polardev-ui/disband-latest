import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * The build this deployment is running, for WebUpdateWatcher to compare
 * against the build baked into an open tab. Empty outside Vercel, which
 * turns the check off.
 */
export function GET() {
  return NextResponse.json(
    { build: process.env.VERCEL_GIT_COMMIT_SHA ?? "" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
