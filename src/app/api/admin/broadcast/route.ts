import { NextResponse } from "next/server";
import {
  getUserFromRequest,
  requirePlatformOwner,
  verifyOwnerPassword,
} from "@/lib/server-auth";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  BROADCAST_TEMPLATES,
  countHumanAudience,
  getDeliverySummary,
  listBroadcasts,
  refreshBroadcastEmailStatus,
  resolveRecipient,
  sendBroadcast,
  type BroadcastKind,
} from "@/lib/disband-official";

export const dynamic = "force-dynamic";

/**
 * Owner-only control surface for the official @disband account.
 *
 * GET  — broadcast history, delivery counts, and the templates.
 * POST — resolve a recipient, or send.
 *
 * Reads need only owner auth. Sending additionally requires the owner password,
 * matching the raffle and platform-ban routes: a stolen session should be able
 * to look at what has been sent but not to address nine thousand people.
 *
 * The password is checked *after* the rate limit, so a wrong password cannot be
 * used to make a lot of requests, and *before* anything touches the database.
 */

const KINDS: BroadcastKind[] = ["announcement", "account_action", "restriction", "service_notice"];

type Action = "send" | "resolve" | "delivery";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function requireOwner(request: Request) {
  const user = await getUserFromRequest(request as import("next/server").NextRequest);
  if (!user) return { ok: false as const, response: errorResponse("Not authenticated.", 401) };
  if (!(await requirePlatformOwner(user.id))) {
    return { ok: false as const, response: errorResponse("Insufficient permissions.", 403) };
  }
  return { ok: true as const, user };
}

export async function GET(request: Request) {
  try {
    const owner = await requireOwner(request);
    if (!owner.ok) return owner.response;

    const ip = getClientIp(request) || "unknown";
    const limit = rateLimit(`broadcast:read:ip:${ip}`, 60, 60_000);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const url = new URL(request.url);
    const broadcastId = url.searchParams.get("id");

    if (broadcastId) {
      return NextResponse.json({ delivery: await getDeliverySummary(broadcastId) });
    }

    const [history, audience] = await Promise.all([
      listBroadcasts(25),
      countHumanAudience(),
    ]);

    return NextResponse.json({
      history,
      audience,
      templates: BROADCAST_TEMPLATES.map((t) => ({
        id: t.id,
        label: t.label,
        description: t.description,
        kind: t.kind,
        title: t.title,
        body: t.body,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return errorResponse(message, 500);
  }
}

export async function POST(request: Request) {
  try {
    const owner = await requireOwner(request);
    if (!owner.ok) return owner.response;

    const ip = getClientIp(request) || "unknown";
    const ipLimit = rateLimit(`broadcast:write:ip:${ip}`, 20, 60_000);
    if (!ipLimit.allowed) return tooManyRequests(ipLimit.retryAfterSeconds);
    const userLimit = rateLimit(`broadcast:write:user:${owner.user.id}`, 20, 60_000);
    if (!userLimit.allowed) return tooManyRequests(userLimit.retryAfterSeconds);

    let body: {
      action?: Action;
      password?: string;
      query?: string;
      audience?: string;
      targetUserId?: string;
      kind?: string;
      title?: string;
      body?: string;
      link?: string;
      sendEmail?: boolean;
      broadcastId?: string;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return errorResponse("Invalid request.", 400);
    }

    const action = body.action;
    if (!action || !["send", "resolve", "delivery"].includes(action)) {
      return errorResponse("Unknown action.", 400);
    }

    // Looking someone up changes nothing, so it does not need the password.
    if (action === "resolve") {
      const found = await resolveRecipient(body.query ?? "");
      if ("error" in found) return errorResponse(found.error, 400);
      return NextResponse.json({ recipient: found });
    }

    if (!verifyOwnerPassword(body.password)) {
      return errorResponse("Invalid owner password.", 403);
    }

    if (action === "delivery") {
      if (!body.broadcastId) return errorResponse("A broadcast id is required.", 400);
      const refreshed = await refreshBroadcastEmailStatus(body.broadcastId);
      return NextResponse.json({
        ...refreshed,
        delivery: await getDeliverySummary(body.broadcastId),
      });
    }

    const audience = body.audience;
    if (audience !== "everyone" && audience !== "user") {
      return errorResponse("Audience must be everyone or a single user.", 400);
    }
    const kind = body.kind as BroadcastKind;
    if (!KINDS.includes(kind)) return errorResponse("Unknown message kind.", 400);

    const title = (body.title ?? "").trim();
    const message = (body.body ?? "").trim();
    if (!title) return errorResponse("A title is required.", 400);
    if (!message) return errorResponse("A message body is required.", 400);

    if (audience === "user" && !body.targetUserId) {
      return errorResponse("Pick a user to send to.", 400);
    }

    const result = await sendBroadcast({
      audience,
      targetUserId: audience === "user" ? body.targetUserId! : null,
      kind,
      title,
      body: message,
      link: body.link?.trim() || null,
      // Defaults to off: emailing the whole userbase has to be a decision made
      // on purpose, every time.
      sendEmail: body.sendEmail === true,
      actor: owner.user.id,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    // The database is the authority on audience, kind, link shape and length, so
    // its refusals are user errors, not server faults.
    const isValidation =
      /audience must|unsupported broadcast kind|unsupported origin|title is required|body is required|target user is required|No such user|Link must be|official account/.test(
        message,
      );
    return errorResponse(message, isValidation ? 400 : 500);
  }
}
