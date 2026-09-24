import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/server-auth";
import { persistentRateLimitCheck } from "@/lib/auth-guard";
import { getClientIp, hashIp } from "@/lib/request-ip";
import { planFromSubscription, type Subscription } from "@/lib/subscription";
import { isTrustedUploadUrl } from "@/lib/media/uploadMedia";
import { deepseekChat, DeepSeekError, DeepSeekUnavailableError } from "@/lib/deepseek";

export const maxDuration = 90;
export const dynamic = "force-dynamic";

const TETHER_EMAIL = "tether@disband.dev";
const TETHER_USERNAME = "tether";
const TETHER_DISPLAY_NAME = "Tether";
const TETHER_MENTION_RE = /@tether\b/i;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // DeepSeek's largest supported upload
const IMAGE_FETCH_TIMEOUT_MS = 15_000;

type Surface = "server" | "dm" | "group";

interface AskBody {
  messageId?: string;
  surface?: Surface;
}

// Cached per instance so provisioning happens once; harmless if another
// instance provisions first (lookup is idempotent).
let cachedTetherUserId: string | null = null;

/**
 * The reply is authored by a fixed, bot-flagged system user so it renders
 * like any other message (own avatar bubble, reply chain, realtime push).
 * Provision idempotently: look up by username, else create the auth user
 * with a stable email that other instances can rediscover.
 */
async function ensureTetherUser(service: NonNullable<ReturnType<typeof getServiceSupabase>>): Promise<string | null> {
  if (cachedTetherUserId) return cachedTetherUserId;

  const { data: existing } = await service
    .from("profiles")
    .select("id, username")
    .eq("username", TETHER_USERNAME)
    .maybeSingle();
  if (existing?.id) {
    cachedTetherUserId = existing.id;
    return existing.id;
  }

  const password = randomBytes(24).toString("base64url");
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: TETHER_EMAIL,
    password,
    email_confirm: true,
  });

  if (createError || !created?.user?.id) {
    // Already registered by a concurrent ask on another instance: rediscover.
    const { data: retry } = await service
      .from("profiles")
      .select("id")
      .eq("username", TETHER_USERNAME)
      .maybeSingle();
    if (retry?.id) {
      cachedTetherUserId = retry.id;
      return retry.id;
    }
    return null;
  }

  const id = created.user.id;
  const { error: profileError } = await service.from("profiles").update({
    display_name: TETHER_DISPLAY_NAME,
    username: TETHER_USERNAME,
    is_bot: true,
  }).eq("id", id);

  if (profileError) {
    // Profile update is what makes the identity discoverable; clean up so a
    // retry provisions cleanly instead of leaving a stray auth user.
    await service.auth.admin.deleteUser(id).catch(() => {});
    return null;
  }

  cachedTetherUserId = id;
  return id;
}

function mimeForUrl(url: string): string {
  const clean = url.split("?")[0]?.toLowerCase() ?? "";
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

/** Fetch an uploaded image/gif and return it as a base64 data URL for DeepSeek. */
async function attachmentAsDataUrl(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return null;
      const length = Number(res.headers.get("content-length") ?? 0);
      if (length > MAX_IMAGE_BYTES) return null;
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.byteLength > MAX_IMAGE_BYTES) return null;
      const mime = res.headers.get("content-type")?.split(";")[0] ?? mimeForUrl(url);
      return `data:${mime};base64,${buffer.toString("base64")}`;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}

function fallbackReply(): string {
  return "Tether is warming up — ask again in a moment.";
}

export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Service not available." }, { status: 500 });

  // Aero gate first: cheapest rejection, and it is the point of the feature.
  const { data: sub, error: subError } = await service
    .from("subscriptions")
    .select("id, plan, status, current_period_end, canceled_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (subError) return NextResponse.json({ error: "Could not check your subscription." }, { status: 500 });
  const plan = planFromSubscription((sub ?? null) as Subscription | null);
  if (plan !== "aero") {
    return NextResponse.json({ error: "Tether is a Disband Aero feature." }, { status: 403 });
  }

  // Loose caps: 25 asks/hr per user, 50/hr per IP. Persistent so they hold
  // across instances on Cloudflare.
  const ip = getClientIp(request);
  const checks = [
    { key: `tether:user:${user.id}:hr`, max: 25, windowSeconds: 3600 },
  ];
  if (ip) checks.push({ key: `tether:ip:${hashIp(ip)}:hr`, max: 50, windowSeconds: 3600 });
  const limitedKey = await persistentRateLimitCheck(service, checks);
  if (limitedKey) {
    return NextResponse.json({ error: "Tether is rate limited for a bit — take a breath." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as AskBody;
  const messageId = typeof body.messageId === "string" ? body.messageId.trim() : "";
  const surface = body.surface;
  if (!messageId || !surface || !["server", "dm", "group"].includes(surface)) {
    return NextResponse.json({ error: "messageId and surface are required." }, { status: 400 });
  }

  // Tether identity must exist before the loop guard compares author ids.
  const tetherUserId = await ensureTetherUser(service);
  if (!tetherUserId) {
    return NextResponse.json({ error: "Tether could not be set up yet." }, { status: 500 });
  }

  interface LoadedMessage {
    authorId: string;
    content: string;
    attachmentUrl: string | null;
    attachmentType: string | null;
    containerId: string; // channel/thread/group id for the reply insert
  }

  let loaded: LoadedMessage | null = null;
  let visible = false;

  if (surface === "server") {
    const { data: msg } = await service
      .from("messages")
      .select("id, channel_id, author_id, content, attachment_url, attachment_type")
      .eq("id", messageId)
      .maybeSingle();
    if (msg) {
      // Service role bypasses RLS, so check channel visibility explicitly.
      const { data: allowed } = await service.rpc("channel_permission_for", {
        p_actor: user.id,
        p_channel_id: msg.channel_id,
        p_permission: "view",
      });
      visible = allowed === true;
      loaded = msg && {
        authorId: msg.author_id,
        content: msg.content ?? "",
        attachmentUrl: msg.attachment_url,
        attachmentType: msg.attachment_type,
        containerId: msg.channel_id,
      };
    }
  } else if (surface === "dm") {
    const { data: msg } = await service
      .from("dm_messages")
      .select("id, thread_id, author_id, content, attachment_url, attachment_type")
      .eq("id", messageId)
      .maybeSingle();
    if (msg) {
      const { data: thread } = await service
        .from("dm_threads")
        .select("id, user_a, user_b")
        .eq("id", msg.thread_id)
        .maybeSingle();
      visible = !!thread && (thread.user_a === user.id || thread.user_b === user.id);
      loaded = msg && {
        authorId: msg.author_id,
        content: msg.content ?? "",
        attachmentUrl: msg.attachment_url,
        attachmentType: msg.attachment_type,
        containerId: msg.thread_id,
      };
    }
  } else {
    const { data: msg } = await service
      .from("group_messages")
      .select("id, group_id, author_id, content, attachment_url, attachment_type")
      .eq("id", messageId)
      .maybeSingle();
    if (msg) {
      const { count } = await service
        .from("group_chat_members")
        .select("id", { count: "exact", head: true })
        .eq("group_id", msg.group_id)
        .eq("user_id", user.id);
      visible = (count ?? 0) > 0;
      loaded = msg && {
        authorId: msg.author_id,
        content: msg.content ?? "",
        attachmentUrl: msg.attachment_url,
        attachmentType: msg.attachment_type,
        containerId: msg.group_id,
      };
    }
  }

  if (!loaded || !visible) {
    return NextResponse.json({ error: "That message is not available." }, { status: 404 });
  }

  // The client only fires for @tether mentions; enforce here too so the
  // endpoint cannot be used to burn model calls on arbitrary messages.
  if (!TETHER_MENTION_RE.test(loaded.content)) {
    return NextResponse.json({ error: "No Tether mention in that message." }, { status: 400 });
  }

  // Loop guard: never let Tether talk to itself.
  if (loaded.authorId === tetherUserId) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Vision: pass image/gif attachments as a data URL in the user content.
  const isImage = loaded.attachmentType === "image" || loaded.attachmentType === "gif";
  const attachmentUrl = isImage && loaded.attachmentUrl ? loaded.attachmentUrl : null;

  let reply: string;
  try {
    const imageDataUrl = attachmentUrl && isTrustedUploadUrl(attachmentUrl)
      ? await attachmentAsDataUrl(attachmentUrl)
      : null;

    const userContent = [
      { type: "text" as const, text: loaded.content || "What do you think?" },
      ...(imageDataUrl ? [{ type: "image_url" as const, image_url: { url: imageDataUrl } }] : []),
    ];

    reply = await deepseekChat({
      system:
        "You are Tether, Disband's in-app AI assistant built into the Disband app. " +
        "Answer the user's message directly and concisely in 1-4 short sentences. " +
        "Use plain text only (no markdown headings, bold, or bullet lists). If an image is attached, look at it. " +
        "If the message is just a greeting or a nudge, respond briefly and warmly. " +
        "Never mention that you are an AI model or your limitations unless directly asked.",
      messages: [{ role: "user", content: userContent }],
    });
  } catch (err) {
    if (err instanceof DeepSeekUnavailableError) {
      reply = fallbackReply();
    } else if (err instanceof DeepSeekError) {
      // Provider rejected the request (bad image, rate limit, etc.).
      reply = "Tether hit a snag on that one — try again in a moment.";
    } else {
      return NextResponse.json({ error: "Tether could not answer right now." }, { status: 502 });
    }
  }

  const replyRow = {
    author_id: tetherUserId,
    content: reply,
    reply_to_id: messageId,
    mentions: [],
  };

  let insertError: { message: string } | null = null;
  if (surface === "server") {
    const { error } = await service
      .from("messages")
      .insert({ ...replyRow, channel_id: loaded.containerId });
    insertError = error;
  } else if (surface === "dm") {
    const { error } = await service
      .from("dm_messages")
      .insert({ ...replyRow, thread_id: loaded.containerId });
    insertError = error;
  } else {
    const { error } = await service
      .from("group_messages")
      .insert({ ...replyRow, group_id: loaded.containerId });
    insertError = error;
  }

  if (insertError) {
    return NextResponse.json({ error: `Tether's reply could not be delivered: ${insertError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, reply: { content: reply } }, { status: 200 });
}