import type { NextRequest } from "next/server";
import { rematchActivity } from "@/lib/activities.server";
import { activityError, activityJson } from "@/lib/activity-api.server";
import { getUserFromRequest } from "@/lib/server-auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromRequest(request);
  if (!user) return activityJson({ error: "Sign in to play." }, 401);
  const limit = rateLimit(`activity:rematch:${user.id}`, 8, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
  try {
    return activityJson(await rematchActivity((await params).id, user.id));
  } catch (error) {
    return activityError(error);
  }
}
