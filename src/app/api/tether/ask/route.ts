import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/server-auth";
import { persistentRateLimitCheck } from "@/lib/auth-guard";
import { getClientIp, hashIp } from "@/lib/request-ip";
import { planFromSubscription, type Subscription } from "@/lib/subscription";
import { isTrustedUploadUrl } from "@/lib/media/uploadMedia";
import { DeepSeekError, DeepSeekUnavailableError } from "@/lib/deepseek";
import {
  ensureTetherUser,
  broadcastTetherTyping,
  typingTopic,
  buildTetherContextWindow,
  tetherHistoryMessages,
  type TetherContextMessage,
} from "@/lib/tether-server";
import { chatWithTether } from "@/lib/tether-tools";

export const maxDuration = 90;
export const dynamic = "force-dynamic";

const TETHER_MENTION_RE = /@tether\b/i;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // DeepSeek's largest supported upload
const IMAGE_FETCH_TIMEOUT_MS = 15_000;
const TYPING_REPEAT_MS = 4000;

type Surface = "server" | "dm" | "group";

interface AskBody {
  messageId?: string;
  surface?: Surface;
}

const TETHER_SYSTEM_PROMPT =
  "You are Tether, Disband's built-in AI assistant. You live inside the Disband app and are " +
  "triggered when someone writes @tether in a server channel, a direct message, or a group " +
  "chat, and when they reply to you. Disband is a real-time messaging and community app: people " +
  "create and join servers with text and voice channels, exchange DMs and group chats, write " +
  "notes, share images and files, and make calls. You are developed and run by the Disband team. " +
  "The person talking to you is a paying Disband Aero subscriber, which is what unlocks you.\n\n" +
  "You can take real actions on the account of the person talking to you by calling the tools " +
  "available to you: update_my_profile, set_my_avatar, set_my_banner, create_note, " +
  "list_my_notes, create_server, list_my_servers, update_my_server, create_server_invite, and " +
  "search_servers. Use a tool whenever they ask you to DO something instead of explaining how — " +
  "for example \"set my bio to ...\", \"make a note reminding me to ...\", \"what do my notes say " +
  "about ...\", \"create a server called ...\", \"rename my server X to Y\", \"give me an invite link " +
  "for my server\", \"find me a server about ...\", or \"use this image as my avatar/icon/banner\". " +
  "When a server action needs a server_id, call list_my_servers first to find it — never guess " +
  "an id. Only change the fields they actually asked you to change, and never " +
  "invent a value they did not give you: if a required detail is missing, ask for it in plain " +
  "text instead of calling the tool with a made-up value. You can only customize servers the " +
  "user owns. After a tool runs, confirm in one short " +
  "sentence what actually happened. Never claim you did something unless the tool reported " +
  "success — if it failed, say briefly that it did not work and what you would need instead. " +
  "These tools only ever touch the calling user's own account, so never describe somebody else's " +
  "account as something you changed. Notes are private to the user, so do not write a password, " +
  "card number, or API key into one unless they explicitly ask you to.\n\n" +
  "Answer directly and concisely in 1-4 short sentences, in plain text only (no markdown " +
  "headings, bold, or bullet lists), and in the same language the user wrote in. If they " +
  "attached an image, look at it and mention what you see when it is relevant. If asked who you " +
  "are, say you are Tether, Disband's in-app AI assistant. If asked who owns Disband, say it is " +
  "developed by the Disband team. Never claim to be human. Do not invent facts about the user or " +
  "the app you don't actually know — it is better to say you don't have that information.";

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

  // One shape across all three surfaces, so the context builder and the model
  // don't need to know where the ask came from.
  type LoadedMessage = TetherContextMessage;

  let loaded: LoadedMessage | null = null;
  let visible = false;
  // A DM with Tether itself is a direct conversation: every message is an
  // ask, no @tether required (you're already talking to it).
  let isTetherDm = false;

  if (surface === "server") {
    const { data: msg } = await service
      .from("messages")
      .select("id, channel_id, author_id, content, attachment_url, attachment_type, created_at")
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
        createdAt: msg.created_at,
      };
    }
  } else if (surface === "dm") {
    const { data: msg } = await service
      .from("dm_messages")
      .select("id, thread_id, author_id, content, attachment_url, attachment_type, created_at")
      .eq("id", messageId)
      .maybeSingle();
    if (msg) {
      const { data: thread } = await service
        .from("dm_threads")
        .select("id, user_a, user_b")
        .eq("id", msg.thread_id)
        .maybeSingle();
      visible = !!thread && (thread.user_a === user.id || thread.user_b === user.id);
      isTetherDm = !!thread && (thread.user_a === tetherUserId || thread.user_b === tetherUserId);
      loaded = msg && {
        authorId: msg.author_id,
        content: msg.content ?? "",
        attachmentUrl: msg.attachment_url,
        attachmentType: msg.attachment_type,
        containerId: msg.thread_id,
        createdAt: msg.created_at,
      };
    }
  } else {
    const { data: msg } = await service
      .from("group_messages")
      .select("id, group_id, author_id, content, attachment_url, attachment_type, created_at")
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
        createdAt: msg.created_at,
      };
    }
  }

  if (!loaded || !visible) {
    return NextResponse.json({ error: "That message is not available." }, { status: 404 });
  }

  // Runtime guard: never let Tether talk to itself.
  if (loaded.authorId === tetherUserId) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Tether's tool loop is intentionally bounded and always has a hard
  // deadline — one concern with function calling is a model that loops forever.
  const history = await buildTetherContextWindow(service, surface, loaded);

  // Continuation: once Tether has spoken in this conversation, a reply keeps
  // the thread going even without a fresh @tether. A DM with Tether itself is
  // always an ask (you're already talking to it). Otherwise the ask must
  // mention us, so the endpoint can't be used to burn model calls on
  // arbitrary messages.
  const continued = history.some((m) => m.authorId === tetherUserId);
  if (!isTetherDm && !continued && !TETHER_MENTION_RE.test(loaded.content)) {
    return NextResponse.json({ error: "No Tether mention in that message." }, { status: 400 });
  }

  // Vision: pass image/gif attachments as a data URL in the user content.
  const isImage = loaded.attachmentType === "image" || loaded.attachmentType === "gif";
  const attachmentUrl = isImage && loaded.attachmentUrl ? loaded.attachmentUrl : null;

  // Typing indicator: broadcast on the conversation's typing topic so every
  // client (including the asker) sees "Tether is typing…" while we work. The
  // client TTLs the indicator at 5s, so re-broadcast every few seconds.
  const topic = typingTopic(surface, loaded.containerId);
  const typingTimer = setInterval(() => {
    void broadcastTetherTyping(service, topic, tetherUserId);
  }, TYPING_REPEAT_MS);
  void broadcastTetherTyping(service, topic, tetherUserId);

  let reply: string;
  try {
    // Vision: the ask's own image rides along as a data URL on the final
    // message. Tether only ever gets the picture that triggered the ask —
    // older attachments stay as text placeholders.
    const imageDataUrl = attachmentUrl && isTrustedUploadUrl(attachmentUrl)
      ? await attachmentAsDataUrl(attachmentUrl)
      : null;

    const messages = tetherHistoryMessages(history, tetherUserId, { finalImageDataUrl: imageDataUrl });

    reply = await chatWithTether({
      service,
      userId: user.id,
      system: TETHER_SYSTEM_PROMPT,
      history: messages,
      // The avatar tool wants the original Disband-hosted URL, not the
      // base64 copy we hand to the model.
      attachedImageUrl: attachmentUrl && isTrustedUploadUrl(attachmentUrl) ? attachmentUrl : null,
    });
  } catch (err) {
    if (err instanceof DeepSeekUnavailableError) {
      reply = fallbackReply();
    } else if (err instanceof DeepSeekError) {
      // Provider rejected the request (bad image, rate limit, etc.).
      reply = "Tether hit a snag on that one — try again in a moment.";
    } else {
      clearInterval(typingTimer);
      return NextResponse.json({ error: "Tether could not answer right now." }, { status: 502 });
    }
  } finally {
    clearInterval(typingTimer);
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