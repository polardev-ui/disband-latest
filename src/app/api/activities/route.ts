import { type NextRequest } from "next/server";
import { createActivity, listPublicActivities } from "@/lib/activities.server";
import { activityError, activityJson } from "@/lib/activity-api.server";
import { getUserFromRequest } from "@/lib/server-auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user)
    return activityJson({ error: "Sign in to start an activity." }, 401);

  const limit = rateLimit(`activity:create:${user.id}`, 8, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  try {
    const activity = await createActivity(
      user.id,
      body.kind,
      body.scope,
      body.scopeId,
    );
    return activityJson(activity, 201);
  } catch (error) {
    return activityError(error);
  }
}

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user)
    return activityJson({ error: "Sign in to browse public games." }, 401);
  const limit = rateLimit(`activity:lobby:${user.id}`, 30, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
  try {
    return activityJson(await listPublicActivities(user.id));
  } catch (error) {
    return activityError(error);
  }
}
