import { type NextRequest } from "next/server";
import { joinActivity } from "@/lib/activities.server";
import { activityError, activityJson } from "@/lib/activity-api.server";
import { getUserFromRequest } from "@/lib/server-auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getUserFromRequest(request);
  if (!user)
    return activityJson({ error: "Sign in to join this activity." }, 401);
  const limit = rateLimit(`activity:join:${user.id}`, 30, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
  const { id } = await params;
  try {
    return activityJson(await joinActivity(id, user.id));
  } catch (error) {
    return activityError(error);
  }
}
