import { type NextRequest } from "next/server";
import { getActivityLeaderboard } from "@/lib/activities.server";
import { activityError, activityJson } from "@/lib/activity-api.server";
import { getUserFromRequest } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user)
    return activityJson({ error: "Sign in to see the leaderboard." }, 401);
  const kind = request.nextUrl.searchParams.get("kind");
  try {
    return activityJson({
      leaderboard: await getActivityLeaderboard(user.id, kind),
    });
  } catch (error) {
    return activityError(error);
  }
}
