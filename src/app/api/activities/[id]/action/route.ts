import { type NextRequest } from "next/server";
import { performActivityAction } from "@/lib/activities.server";
import { activityError, activityJson } from "@/lib/activity-api.server";
import { getUserFromRequest } from "@/lib/server-auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getUserFromRequest(request);
  if (!user) return activityJson({ error: "Sign in to play." }, 401);

  const limit = rateLimit(`activity:action:${user.id}`, 60, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const { id } = await params;
  try {
    return activityJson(await performActivityAction(user.id, id, body));
  } catch (error) {
    return activityError(error);
  }
}
