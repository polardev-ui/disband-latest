import { type NextRequest } from "next/server";
import { getActivityById } from "@/lib/activities.server";
import { activityError, activityJson } from "@/lib/activity-api.server";
import { getUserFromRequest } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const user = await getUserFromRequest(request);
  if (!user)
    return activityJson({ error: "Sign in to open this activity." }, 401);
  const { id } = await params;
  try {
    return activityJson(await getActivityById(id, user.id));
  } catch (error) {
    return activityError(error);
  }
}
