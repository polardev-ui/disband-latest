import "server-only";

import { NextResponse } from "next/server";
import { ActivityError } from "@/lib/activities.server";

export function activityJson(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function activityError(error: unknown): NextResponse {
  if (error instanceof ActivityError) {
    return activityJson({ error: error.message }, error.status);
  }
  console.error("[activities]", error);
  return activityJson({ error: "Something went wrong. Try again." }, 500);
}
