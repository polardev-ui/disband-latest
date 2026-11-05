import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/server-auth";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  MAX_REPORT_DETAILS,
  isReportReason,
  type ReportReason,
  type ReportSurface,
  type ReportTargetType,
} from "@/lib/reports";

export const dynamic = "force-dynamic";

type MediaKind = "image" | "video" | "gif" | "file" | "audio";

interface SnapshotField {
  field: string;
  value: string;
}

interface SnapshotMedia {
  url: string;
  field: string;
  kind: MediaKind;
}

interface StoredAttachment {
  url?: unknown;
  type?: unknown;
  name?: unknown;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CDN_ORIGIN = "https://cdn.disband.dev";

function isCdnMediaUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.origin === CDN_ORIGIN
      && url.pathname.startsWith("/v1/images/")
      && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function attachmentKind(value: unknown): MediaKind {
  return value === "image" || value === "video" || value === "gif"
    || value === "audio" || value === "file"
    ? value
    : "file";
}

function storedAttachments(row: Record<string, unknown>): SnapshotMedia[] {
  const out: SnapshotMedia[] = [];
  const seen = new Set<string>();

  const add = (url: unknown, kind: unknown, field: string) => {
    if (!isCdnMediaUrl(url) || seen.has(url)) return;
    const mediaKind = attachmentKind(kind);
    // Audio has no visual surface for Sentinel to inspect; leaving it out
    // avoids turning every voice note into a human-review queue item.
    if (mediaKind === "audio") return;
    seen.add(url);
    out.push({ url, field, kind: mediaKind });
  };

  const attachments = Array.isArray(row.attachments) ? row.attachments as StoredAttachment[] : [];
  for (let i = 0; i < attachments.length; i++) {
    add(attachments[i]?.url, attachments[i]?.type, `attachments[${i}]`);
  }

  if (out.length === 0) {
    add(row.attachment_url, row.attachment_type, "attachment_url");
  }

  return out;
}

function profileMedia(profile: Record<string, unknown>): SnapshotMedia[] {
  const out: SnapshotMedia[] = [];
  if (isCdnMediaUrl(profile.avatar_url)) {
    out.push({ url: profile.avatar_url, field: "avatar_url", kind: "image" });
  }
  if (isCdnMediaUrl(profile.banner_url)) {
    out.push({ url: profile.banner_url, field: "banner_url", kind: "image" });
  }
  return out;
}

function profileFields(profile: Record<string, unknown>): SnapshotField[] {
  const out: SnapshotField[] = [];
  for (const field of ["display_name", "bio", "status_note"] as const) {
    const value = profile[field];
    if (typeof value === "string" && value.trim()) out.push({ field, value });
  }
  return out;
}

/**
 * What a space looks like to Sentinel: its name and description, its
 * channel names, and a sample of recent messages. Shared shape with the
 * routine space check in the content-sentinel function.
 */
async function serverSnapshot(
  service: NonNullable<ReturnType<typeof getServiceSupabase>>,
  server: Record<string, unknown>,
): Promise<{ textFields: SnapshotField[]; media: SnapshotMedia[] }> {
  const textFields: SnapshotField[] = [];
  if (typeof server.name === "string" && server.name.trim()) textFields.push({ field: "name", value: server.name });
  if (typeof server.description === "string" && server.description.trim()) {
    textFields.push({ field: "description", value: server.description });
  }

  const { data: channels } = await service.from("channels").select("id, name").eq("server_id", server.id as string).limit(200);
  const names = (channels ?? []).map((c: { name: string | null }) => c.name).filter(Boolean);
  if (names.length) textFields.push({ field: "channel_names", value: names.join(", ").slice(0, 2000) });

  const ids = (channels ?? []).map((c: { id: string }) => c.id);
  if (ids.length) {
    const { data: recent } = await service.from("messages").select("content")
      .in("channel_id", ids).not("content", "is", null)
      .order("created_at", { ascending: false }).limit(80);
    const sample = (recent ?? []).map((m: { content: string | null }) => (m.content ?? "").trim())
      .filter(Boolean).reverse().join("\n").slice(-6000);
    if (sample) textFields.push({ field: "recent_messages", value: sample });
  }

  const media: SnapshotMedia[] = [];
  if (isCdnMediaUrl(server.icon_url)) media.push({ url: server.icon_url, field: "icon_url", kind: "image" });
  if (isCdnMediaUrl(server.banner_url)) media.push({ url: server.banner_url, field: "banner_url", kind: "image" });
  return { textFields, media };
}

function profileContext(profile: Record<string, unknown>) {
  return {
    username: typeof profile.username === "string" ? profile.username : null,
    display_name: typeof profile.display_name === "string" ? profile.display_name : null,
  };
}

export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const ip = getClientIp(request) || "unknown";
  const perMinute = rateLimit(`reports:${user.id}:minute`, 5, 60_000);
  if (!perMinute.allowed) return tooManyRequests(perMinute.retryAfterSeconds);
  const perHour = rateLimit(`reports:${user.id}:hour`, 30, 3_600_000);
  if (!perHour.allowed) return tooManyRequests(perHour.retryAfterSeconds);
  const perIp = rateLimit(`reports:${ip}:minute`, 15, 60_000);
  if (!perIp.allowed) return tooManyRequests(perIp.retryAfterSeconds);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const targetType = body.targetType as ReportTargetType;
  const surface = body.surface as ReportSurface;
  const targetId = typeof body.targetId === "string" ? body.targetId : "";
  const reason = body.reason;
  const details = typeof body.details === "string" ? body.details.trim() : "";

  if (targetType !== "message" && targetType !== "profile" && targetType !== "server") {
    return NextResponse.json({ error: "Choose what you are reporting." }, { status: 400 });
  }
  if (!UUID_RE.test(targetId)) {
    return NextResponse.json({ error: "That report target is invalid." }, { status: 400 });
  }
  if (!isReportReason(reason)) {
    return NextResponse.json({ error: "Choose a reason for the report." }, { status: 400 });
  }
  if (details.length > MAX_REPORT_DETAILS) {
    return NextResponse.json(
      { error: `Keep the details under ${MAX_REPORT_DETAILS} characters.` },
      { status: 400 },
    );
  }

  if (targetType === "message" && surface !== "channel" && surface !== "dm" && surface !== "group") {
    return NextResponse.json({ error: "That message location is invalid." }, { status: 400 });
  }
  if (targetType === "server" && surface !== "server") {
    return NextResponse.json({ error: "That space report is invalid." }, { status: 400 });
  }
  if (targetType === "profile" && surface !== "profile") {
    return NextResponse.json({ error: "That profile report is invalid." }, { status: 400 });
  }

  const service = getServiceSupabase();
  if (!service) {
    return NextResponse.json({ error: "Reporting is unavailable right now." }, { status: 503 });
  }

  let targetTable: "messages" | "dm_messages" | "group_messages" | "profiles" | "servers";
  let containerId: string | null = null;
  let reportedUserId: string | null = null;
  let textFields: SnapshotField[] = [];
  let media: SnapshotMedia[] = [];
  let createdAt: string | null = null;
  let context: Record<string, unknown> = {};

  if (targetType === "message") {
    if (surface === "channel") {
      const { data: message, error } = await service
        .from("messages")
        .select("id, channel_id, author_id, content, attachment_url, attachment_type, attachments, created_at")
        .eq("id", targetId)
        .maybeSingle();
      if (error) return NextResponse.json({ error: "Could not load that message." }, { status: 500 });
      if (!message) return NextResponse.json({ error: "That message no longer exists." }, { status: 404 });

      const { data: allowed } = await service.rpc("channel_permission_for", {
        p_actor: user.id,
        p_channel_id: message.channel_id,
        p_permission: "view",
      });
      if (allowed !== true) {
        return NextResponse.json({ error: "That message is not available." }, { status: 404 });
      }

      targetTable = "messages";
      containerId = message.channel_id;
      reportedUserId = message.author_id;
      textFields = message.content?.trim()
        ? [{ field: "content", value: message.content }]
        : [];
      media = storedAttachments(message);
      createdAt = message.created_at;
    } else if (surface === "dm") {
      const { data: message, error } = await service
        .from("dm_messages")
        .select("id, thread_id, author_id, content, attachment_url, attachment_type, attachments, created_at")
        .eq("id", targetId)
        .maybeSingle();
      if (error) return NextResponse.json({ error: "Could not load that message." }, { status: 500 });
      if (!message) return NextResponse.json({ error: "That message no longer exists." }, { status: 404 });

      const { data: thread } = await service
        .from("dm_threads")
        .select("id, user_a, user_b")
        .eq("id", message.thread_id)
        .maybeSingle();
      if (!thread || (thread.user_a !== user.id && thread.user_b !== user.id)) {
        return NextResponse.json({ error: "That message is not available." }, { status: 404 });
      }

      targetTable = "dm_messages";
      containerId = message.thread_id;
      reportedUserId = message.author_id;
      textFields = message.content?.trim()
        ? [{ field: "content", value: message.content }]
        : [];
      media = storedAttachments(message);
      createdAt = message.created_at;
    } else {
      const { data: message, error } = await service
        .from("group_messages")
        .select("id, group_id, author_id, content, attachment_url, attachment_type, attachments, created_at")
        .eq("id", targetId)
        .maybeSingle();
      if (error) return NextResponse.json({ error: "Could not load that message." }, { status: 500 });
      if (!message) return NextResponse.json({ error: "That message no longer exists." }, { status: 404 });

      const { count } = await service
        .from("group_chat_members")
        .select("group_id", { count: "exact", head: true })
        .eq("group_id", message.group_id)
        .eq("user_id", user.id);
      if ((count ?? 0) === 0) {
        return NextResponse.json({ error: "That message is not available." }, { status: 404 });
      }

      targetTable = "group_messages";
      containerId = message.group_id;
      reportedUserId = message.author_id;
      textFields = message.content?.trim()
        ? [{ field: "content", value: message.content }]
        : [];
      media = storedAttachments(message);
      createdAt = message.created_at;
    }

    if (reportedUserId === user.id) {
      return NextResponse.json({ error: "You cannot report your own message." }, { status: 400 });
    }

    if (reportedUserId) {
      const { data: author } = await service
        .from("profiles")
        .select("username, display_name")
        .eq("id", reportedUserId)
        .maybeSingle();
      if (author) context = profileContext(author);
    }
  } else if (targetType === "server") {
    const { data: server, error } = await service
      .from("servers")
      .select("id, name, description, icon_url, banner_url, owner_id, discoverable, created_at")
      .eq("id", targetId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Could not load that space." }, { status: 500 });
    if (!server) return NextResponse.json({ error: "That space no longer exists." }, { status: 404 });

    // Members can report a space, and so can anyone who can see it on Discover.
    const { count } = await service.from("server_members")
      .select("server_id", { count: "exact", head: true })
      .eq("server_id", server.id).eq("user_id", user.id);
    if ((count ?? 0) === 0 && !server.discoverable) {
      return NextResponse.json({ error: "That space is not available." }, { status: 404 });
    }
    if (server.owner_id === user.id) {
      return NextResponse.json({ error: "You cannot report your own space." }, { status: 400 });
    }

    targetTable = "servers";
    reportedUserId = server.owner_id ?? null;
    ({ textFields, media } = await serverSnapshot(service, server));
    createdAt = server.created_at;
    context = { space_name: server.name };
  } else {
    const { data: profile, error } = await service
      .from("profiles")
      .select("id, username, display_name, avatar_url, banner_url, bio, status_note, created_at")
      .eq("id", targetId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Could not load that profile." }, { status: 500 });
    if (!profile) return NextResponse.json({ error: "That profile no longer exists." }, { status: 404 });
    if (profile.id === user.id) {
      return NextResponse.json({ error: "You cannot report your own profile." }, { status: 400 });
    }

    targetTable = "profiles";
    reportedUserId = profile.id;
    textFields = profileFields(profile);
    media = profileMedia(profile);
    createdAt = profile.created_at;
    context = profileContext(profile);
  }

  const snapshot = {
    version: 1,
    target_type: targetType,
    surface,
    container_id: containerId,
    target_created_at: createdAt,
    context,
    text_fields: textFields,
    media,
  };

  const { data: report, error: insertError } = await service
    .from("message_reports")
    .insert({
      reporter_id: user.id,
      target_type: targetType,
      target_surface: surface,
      target_table: targetTable,
      target_id: targetId,
      container_id: containerId,
      reported_user_id: reportedUserId,
      reason: reason as ReportReason,
      details: details || null,
      snapshot,
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "You have already reported this. It is waiting for review." },
        { status: 409 },
      );
    }
    console.error("[reports] insert", insertError.message);
    return NextResponse.json({ error: "Could not file the report." }, { status: 500 });
  }

  // Keep the response deliberately small: the reporter does not need a copy of
  // the moderation snapshot, and it may contain content they should not see
  // again.
  return NextResponse.json({ ok: true, reportId: report?.id ?? null }, { status: 201 });
}
