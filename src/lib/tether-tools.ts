import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeepSeekChatMessage, DeepSeekTool } from "@/lib/deepseek";
import { deepseekChat } from "@/lib/deepseek";
import { isTrustedUploadUrl } from "@/lib/media/uploadMedia";

/**
 * Tether's tool-calling layer.
 *
 * Tether can act on the *calling* user's account — profile, notes, servers —
 * by calling functions that the model selects. Everything is scoped to the
 * authenticated user id passed in from the route (RLS is bypassed under the
 * service role, so every tool filters/anchors on `userId` explicitly and
 * never touches anyone else's data).
 */

type ServiceClient = NonNullable<ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>>;

const MAX_TOOL_ROUNDS = 4;
const ALLOWED_STATUS = ["online", "idle", "dnd", "offline"] as const;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export interface TetherToolContext {
  service: ServiceClient;
  userId: string;
  /** The current message's image attachment URL (already trusted-checked). */
  attachedImageUrl: string | null;
}

export const TETHER_TOOLS: DeepSeekTool[] = [
  {
    type: "function",
    function: {
      name: "update_my_profile",
      description:
        "Update the current user's Disband profile (their own account). Only include fields the user explicitly asked to change. Examples: \"set my bio to ...\", \"change my display name to ...\", \"set my status to do not disturb\", \"add a custom status\".",
      parameters: {
        type: "object",
        properties: {
          display_name: { type: "string", minLength: 1, maxLength: 32, description: "New display name." },
          bio: { type: "string", maxLength: 190, description: "Profile bio / about text." },
          status: { type: "string", enum: [...ALLOWED_STATUS], description: "Presence status: online, idle, dnd, offline." },
          preferred_status: { type: "string", enum: [...ALLOWED_STATUS], description: "Default presence status." },
          status_note: { type: ["string", "null"], maxLength: 64, description: "Custom status text. Pass null to clear it." },
          pronouns: { type: ["string", "null"], maxLength: 32, description: "Pronouns. Pass null to clear." },
          accent_color: { type: ["string", "null"], description: "Hex accent color like #ab4bec. Pass null to clear." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_note",
      description:
        "Save a private note for the current user. Notes are their own personal space for thoughts they can read later. Example: \"@tether make a note reminding me to study for my chem test tomorrow\".",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", minLength: 1, maxLength: 4000, description: "The note text." },
        },
        required: ["content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_server",
      description:
        "Create a Disband server (space) owned by the current user. It gets a #general, #welcome, and a voice channel automatically. Example: \"@tether create a server called Gaming Hangout\".",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 32, description: "Server name." },
          description: { type: "string", maxLength: 200, description: "Short server description (optional)." },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_my_avatar",
      description:
        "Set the current user's profile avatar. Either to the image they attached to this message (use_attached_image: true) or to an image URL they provided. Example: \"@tether set this image as my avatar\".",
      parameters: {
        type: "object",
        properties: {
          use_attached_image: { type: "boolean", description: "Use the image attached to this message as the avatar." },
          image_url: { type: "string", description: "A https:// image URL to use as the avatar (Disband-hosted preferred)." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_my_notes",
      description:
        "Read back the current user's saved notes, most recent first (pinned notes first). Use when they ask what a note says, want you to recite or summarize their notes, or ask what they wrote down. Example: \"@tether what did my notes say about the chem test?\".",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "How many notes to read (default 5, max 10)." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_my_banner",
      description:
        "Set the current user's profile banner (the wide image at the top of their profile). Either to the image they attached to this message (use_attached_image: true) or to an image URL they provided. Example: \"@tether set this image as my banner\".",
      parameters: {
        type: "object",
        properties: {
          use_attached_image: { type: "boolean", description: "Use the image attached to this message as the banner." },
          image_url: { type: "string", description: "A https:// image URL to use as the banner (Disband-hosted preferred)." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_my_servers",
      description:
        "List the servers the current user is in, with their ids, so you can act on one by id. Returns which ones they own. Example: before renaming or inviting to a server, call this to find the right server_id.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_my_server",
      description:
        "Customize a server the current user OWNS: rename it, change its description, or set its icon or banner image. Only include fields they explicitly asked to change. Example: \"@tether rename my Gaming Hangout server to Game Central\" or \"@tether use this image as my server's icon\".",
      parameters: {
        type: "object",
        properties: {
          server_id: { type: "string", description: "The server id (from list_my_servers)." },
          name: { type: "string", minLength: 1, maxLength: 32, description: "New server name." },
          description: { type: "string", maxLength: 200, description: "Short server description." },
          icon_url: { type: "string", description: "A https:// image URL for the server icon." },
          banner_url: { type: "string", description: "A https:// image URL for the server banner." },
          use_attached_image_for: {
            type: "string",
            enum: ["icon", "banner"],
            description: "Use the image attached to this message as the server's icon or banner.",
          },
        },
        required: ["server_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_server_invite",
      description:
        "Get (or create) the invite link for a server the current user OWNS, to share with others. Example: \"@tether give me an invite link for my Gaming Hangout server\".",
      parameters: {
        type: "object",
        properties: {
          server_id: { type: "string", description: "The server id (from list_my_servers)." },
        },
        required: ["server_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_servers",
      description:
        "Search Disband's public Discover directory for servers matching a query, with member counts. Use when the user wants to find a server or community by topic. Example: \"@tether find me a server about retro games\".",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", minLength: 1, maxLength: 100, description: "What to search for (topic, name, or keyword)." },
          limit: { type: "number", description: "How many results (default 5, max 10)." },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
];

type ToolResult = { ok: true; [k: string]: unknown } | { ok: false; error: string };

/** Replicates the create_server RPC with an explicit owner (service-role safe). */
async function createServerAsUser(
  service: ServiceClient,
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const name = String(args.name ?? "").trim().slice(0, 32);
  if (!name) return { ok: false, error: "A server name is required." };
  const description = args.description != null ? String(args.description).trim().slice(0, 200) : null;

  // Unique invite code.
  const { data: firstCode } = await service.rpc("generate_invite_code");
  let invite = String(firstCode ?? "");
  let guard = 0;
  while (invite) {
    const { data: clash } = await service.from("servers").select("id").eq("invite_code", invite).maybeSingle();
    if (!clash || guard++ > 5) break;
    const { data: again } = await service.rpc("generate_invite_code");
    invite = String(again ?? "");
  }

  const { data: server, error } = await service
    .from("servers")
    .insert({ name, description, owner_id: userId, invite_code: invite })
    .select("id")
    .single();
  if (error || !server) return { ok: false, error: error?.message ?? "Could not create the server." };
  const serverId = server.id;

  const { data: role } = await service
    .from("server_roles")
    .insert({ server_id: serverId, name: "@everyone", color: "#949ba4", position: 0, is_default: true })
    .select("id")
    .single();
  if (role) {
    await service.from("server_roles").update({
      permissions: { send_messages: true, add_reactions: true, attach_files: true },
    }).eq("id", role.id);
    await service.from("server_members").insert({ server_id: serverId, user_id: userId, role: "owner", role_id: role.id });
  }

  const { data: catText } = await service
    .from("channel_categories")
    .insert({ server_id: serverId, name: "Text Channels", position: 0 })
    .select("id")
    .single();
  const { data: catVoice } = await service
    .from("channel_categories")
    .insert({ server_id: serverId, name: "Voice Channels", position: 1 })
    .select("id")
    .single();
  if (catText) {
    await service.from("channels").insert([
      { server_id: serverId, category_id: catText.id, name: "general", type: "text", position: 0 },
      { server_id: serverId, category_id: catText.id, name: "welcome", type: "text", position: 1 },
    ]);
  }
  if (catVoice) {
    await service.from("channels").insert({ server_id: serverId, category_id: catVoice.id, name: "voice-1", type: "voice", position: 0 });
  }

  // Best-effort: the audit RPC gates on auth.uid(), which is null under the
  // service role, so it is expected to no-op here. Never fail the create over it.
  try {
    await service.rpc("write_audit_log", {
      p_server_id: serverId,
      p_action: "server.create",
      p_target_type: "server",
      p_target_id: serverId,
      p_details: { name },
    });
  } catch {
    // ignored
  }

  return { ok: true, server_id: serverId, name, message: `Created server "${name}".` };
}

async function updateMyProfile(
  service: ServiceClient,
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const patch: Record<string, unknown> = {};

  const put = (key: string, value: unknown) => {
    if (value !== undefined) patch[key] = value;
  };

  if (args.display_name !== undefined) {
    const v = String(args.display_name).trim();
    if (!v) return { ok: false, error: "Display name can't be empty." };
    if (v.length > 32) return { ok: false, error: "Display name is too long (max 32 characters)." };
    put("display_name", v);
  }
  if (args.bio !== undefined) {
    const v = String(args.bio).trim();
    if (v.length > 190) return { ok: false, error: "Bio is too long (max 190 characters)." };
    put("bio", v);
  }
  for (const key of ["status", "preferred_status"] as const) {
    if (args[key] !== undefined) {
      const v = String(args[key]);
      if (!ALLOWED_STATUS.includes(v as (typeof ALLOWED_STATUS)[number])) {
        return { ok: false, error: `"${v}" is not a valid status.` };
      }
      put(key, v);
    }
  }
  if (args.status_note !== undefined) {
    const v = args.status_note == null ? null : String(args.status_note).trim();
    if (v != null && v.length > 64) return { ok: false, error: "Status note is too long (max 64 characters)." };
    put("status_note", v);
  }
  if (args.pronouns !== undefined) {
    const v = args.pronouns == null ? null : String(args.pronouns).trim();
    if (v != null && v.length > 32) return { ok: false, error: "Pronouns are too long (max 32 characters)." };
    put("pronouns", v);
  }
  if (args.accent_color !== undefined) {
    const v = args.accent_color == null ? null : String(args.accent_color).trim();
    if (v != null && !HEX_COLOR.test(v)) return { ok: false, error: `"${v}" is not a valid hex color (use #rrggbb).` };
    put("accent_color", v);
  }

  const keys = Object.keys(patch);
  if (keys.length === 0) return { ok: false, error: "Tell me what to change (display name, bio, status, bio note...)." };

  const { error } = await service.from("profiles").update(patch).eq("id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, updated: keys, message: `Updated your profile: ${keys.join(", ")}.` };
}

async function createNote(
  service: ServiceClient,
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const content = String(args.content ?? "").trim();
  if (!content) return { ok: false, error: "The note is empty." };
  if (content.length > 4000) return { ok: false, error: "The note is too long (max 4000 characters)." };

  const { data, error } = await service
    .from("notes")
    .insert({ user_id: userId, content })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, note_id: data.id, message: "Note saved." };
}

/**
 * Read the calling user's notes back to them. Content is truncated per note
 * and the row count is capped: a user with hundreds of notes must not turn
 * one question into a context-window-sized dump.
 */
async function listMyNotes(
  service: ServiceClient,
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = Math.max(1, Math.min(Number(args.limit) || 5, 10));
  const { data, error } = await service
    .from("notes")
    .select("id, content, pinned, created_at")
    .eq("user_id", userId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message };
  const notes = (data ?? []).map((n: { content: string | null; pinned: boolean | null; created_at: string | null }) => {
    const full = (n.content ?? "").trim();
    const clipped = full.length > 500 ? `${full.slice(0, 500)}…` : full;
    return { content: clipped || "(empty note)", pinned: n.pinned === true, created_at: n.created_at };
  });
  if (notes.length === 0) return { ok: true, notes: [], message: "You have no notes yet." };
  return {
    ok: true,
    notes,
    message: `Found ${notes.length} note${notes.length === 1 ? "" : "s"} (newest first${(data ?? []).some((n: { pinned: boolean | null }) => n.pinned) ? ", pinned notes at the top" : ""}).`,
  };
}

/** Same contract as setMyAvatar, pointed at the profile banner. */
async function setMyBanner(
  service: ServiceClient,
  ctx: TetherToolContext,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  let url: string | null = args.image_url != null ? String(args.image_url).trim() : null;
  if ((!url || url.length === 0) && args.use_attached_image) url = ctx.attachedImageUrl;
  if (!url) {
    return { ok: false, error: "No image to use — attach an image to your message and ask again." };
  }
  if (!isTrustedUploadUrl(url)) {
    return { ok: false, error: "That image URL isn't trusted. Attach the image to your message instead." };
  }

  const { error } = await service.from("profiles").update({ banner_url: url }).eq("id", ctx.userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Banner updated." };
}

interface ServerRow {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
}

async function listMyServers(
  service: ServiceClient,
  userId: string,
): Promise<ToolResult> {
  const { data: memberships, error } = await service
    .from("server_members")
    .select("server_id")
    .eq("user_id", userId)
    .limit(100);
  if (error) return { ok: false, error: error.message };
  const ids = (memberships ?? []).map((m: { server_id: string }) => m.server_id);
  if (ids.length === 0) return { ok: true, servers: [], message: "You aren't in any servers yet." };

  const { data: rows, error: serversError } = await service
    .from("servers")
    .select("id, name, description, owner_id")
    .in("id", ids)
    .order("name");
  if (serversError) return { ok: false, error: serversError.message };
  const servers = (rows ?? []).map((s: ServerRow) => ({
    server_id: s.id,
    name: s.name,
    description: s.description ?? undefined,
    owned: s.owner_id === userId,
  }));
  return { ok: true, servers, message: `You're in ${servers.length} server${servers.length === 1 ? "" : "s"}.` };
}

/**
 * Resolve a server id the model supplied to a row the calling user OWNS.
 * Every server-mutating tool funnels through here — the service role
 * bypasses RLS, so ownership is the one check that matters.
 */
async function ownedServerOrError(
  service: ServiceClient,
  userId: string,
  serverId: unknown,
): Promise<{ ok: true; server: ServerRow } | { ok: false; error: string }> {
  const id = String(serverId ?? "").trim();
  if (!id) return { ok: false, error: "A server_id is required (use list_my_servers to find it)." };
  const { data, error } = await service
    .from("servers")
    .select("id, name, description, owner_id")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That server doesn't exist." };
  if (data.owner_id !== userId) {
    return { ok: false, error: "You can only customize servers you own." };
  }
  return { ok: true, server: data as ServerRow };
}

async function updateMyServer(
  service: ServiceClient,
  ctx: TetherToolContext,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const found = await ownedServerOrError(service, ctx.userId, args.server_id);
  if (!found.ok) return found;

  const patch: Record<string, unknown> = {};
  if (args.name !== undefined) {
    const v = String(args.name).trim();
    if (!v) return { ok: false, error: "A server name can't be empty." };
    if (v.length > 32) return { ok: false, error: "Server names are limited to 32 characters." };
    patch.name = v;
  }
  if (args.description !== undefined) {
    const v = args.description == null ? null : String(args.description).trim();
    if (v && v.length > 200) return { ok: false, error: "Descriptions are limited to 200 characters." };
    patch.description = v;
  }

  // Image fields: an explicit URL, or the message's attached image for
  // whichever surface the user pointed at.
  const attachedFor = args.use_attached_image_for == null ? null : String(args.use_attached_image_for);
  if (attachedFor && attachedFor !== "icon" && attachedFor !== "banner") {
    return { ok: false, error: "use_attached_image_for must be \"icon\" or \"banner\"." };
  }
  const attachedUrl = attachedFor ? ctx.attachedImageUrl : null;
  if (attachedFor && !attachedUrl) {
    return { ok: false, error: "No image attached to this message — attach one and ask again." };
  }
  if (args.icon_url !== undefined || attachedFor === "icon") {
    const url = attachedFor === "icon" ? attachedUrl : String(args.icon_url ?? "").trim();
    if (!url || !isTrustedUploadUrl(url)) {
      return { ok: false, error: "That icon URL isn't trusted. Attach the image to your message instead." };
    }
    patch.icon_url = url;
  }
  if (args.banner_url !== undefined || attachedFor === "banner") {
    const url = attachedFor === "banner" ? attachedUrl : String(args.banner_url ?? "").trim();
    if (!url || !isTrustedUploadUrl(url)) {
      return { ok: false, error: "That banner URL isn't trusted. Attach the image to your message instead." };
    }
    patch.banner_url = url;
  }

  const keys = Object.keys(patch);
  if (keys.length === 0) return { ok: false, error: "Tell me what to change (name, description, icon, banner)." };

  const { error } = await service.from("servers").update(patch).eq("id", found.server.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, server_id: found.server.id, updated: keys, message: `Updated ${keys.join(", ")} on "${found.server.name}".` };
}

async function createServerInvite(
  service: ServiceClient,
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const found = await ownedServerOrError(service, userId, args.server_id);
  if (!found.ok) return found;

  let code: string | null = null;
  const { data: server } = await service
    .from("servers")
    .select("invite_code, vanity_code")
    .eq("id", found.server.id)
    .single();
  if (server?.vanity_code) code = String(server.vanity_code);
  else if (server?.invite_code) code = String(server.invite_code);
  else {
    // Servers created before invite codes became universal can have none.
    const { data: generated } = await service.rpc("generate_invite_code");
    code = generated ? String(generated) : null;
    if (code) {
      const { error } = await service.from("servers").update({ invite_code: code }).eq("id", found.server.id);
      if (error) return { ok: false, error: error.message };
    }
  }
  if (!code) return { ok: false, error: "Couldn't generate an invite code." };

  const origin = process.env.APP_ORIGIN ?? "https://www.disband.dev";
  const url = `${origin.replace(/\/+$/, "")}/server/${code}`;
  return { ok: true, invite_code: code, invite_url: url, message: `Invite link for "${found.server.name}": ${url}` };
}

interface DiscoverableServer {
  id: string;
  name: string;
  description: string | null;
  member_count: number | string;
}

async function searchServers(
  service: ServiceClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const query = String(args.query ?? "").trim().toLowerCase();
  if (!query) return { ok: false, error: "Tell me what to search for." };
  const limit = Math.max(1, Math.min(Number(args.limit) || 5, 10));

  const { data, error } = await service.rpc("list_discoverable_servers");
  if (error) return { ok: false, error: error.message };
  const matches = ((data ?? []) as DiscoverableServer[])
    .filter((s) => s.name.toLowerCase().includes(query) || (s.description ?? "").toLowerCase().includes(query))
    .slice(0, limit)
    .map((s) => ({
      server_id: s.id,
      name: s.name,
      description: s.description ?? undefined,
      members: Number(s.member_count),
    }));
  if (matches.length === 0) {
    return { ok: true, results: [], message: `No public servers matched "${String(args.query).trim()}".` };
  }
  return { ok: true, results: matches, message: `Found ${matches.length} matching server${matches.length === 1 ? "" : "s"} on Discover.` };
}

async function setMyAvatar(
  service: ServiceClient,
  ctx: TetherToolContext,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  let url: string | null = args.image_url != null ? String(args.image_url).trim() : null;
  if ((!url || url.length === 0) && args.use_attached_image) url = ctx.attachedImageUrl;
  if (!url) {
    return { ok: false, error: "No image to use — attach an image to your message and ask again." };
  }
  if (!isTrustedUploadUrl(url)) {
    return { ok: false, error: "That image URL isn't trusted. Attach the image to your message instead." };
  }

  const { error } = await service.from("profiles").update({ avatar_url: url }).eq("id", ctx.userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Avatar updated." };
}

export async function executeTetherTool(
  service: ServiceClient,
  name: string,
  args: Record<string, unknown>,
  ctx: TetherToolContext,
): Promise<ToolResult> {
  switch (name) {
    case "update_my_profile":
      return updateMyProfile(service, ctx.userId, args);
    case "create_note":
      return createNote(service, ctx.userId, args);
    case "list_my_notes":
      return listMyNotes(service, ctx.userId, args);
    case "create_server":
      return createServerAsUser(service, ctx.userId, args);
    case "set_my_avatar":
      return setMyAvatar(service, ctx, args);
    case "set_my_banner":
      return setMyBanner(service, ctx, args);
    case "list_my_servers":
      return listMyServers(service, ctx.userId);
    case "update_my_server":
      return updateMyServer(service, ctx, args);
    case "create_server_invite":
      return createServerInvite(service, ctx.userId, args);
    case "search_servers":
      return searchServers(service, args);
    default:
      return { ok: false, error: `Unknown tool "${name}".` };
  }
}

/**
 * Run a full Tether turn with tool-calling. `history` already ends with the
 * current user message. The loop hands tool results back to the model until
 * it produces a final answer or the round cap is hit.
 */
export async function chatWithTether(opts: {
  service: ServiceClient;
  userId: string;
  system: string;
  history: DeepSeekChatMessage[];
  attachedImageUrl?: string | null;
}): Promise<string> {
  const { service, userId, system, history } = opts;
  const ctx: TetherToolContext = { service, userId, attachedImageUrl: opts.attachedImageUrl ?? null };
  const messages: DeepSeekChatMessage[] = [...history];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const res = await deepseekChat({ system, messages, tools: TETHER_TOOLS });
    if (res.toolCalls.length === 0) {
      return res.content || "Done.";
    }

    messages.push({
      role: "assistant",
      content: res.content || null,
      tool_calls: res.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    for (const tc of res.toolCalls) {
      let result: ToolResult | { ok: false; error: string };
      try {
        const args = JSON.parse(tc.arguments || "{}") as Record<string, unknown>;
        result = await executeTetherTool(service, tc.name, args, ctx);
      } catch (err) {
        result = { ok: false, error: err instanceof Error ? err.message : "The tool failed." };
      }
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
    }
  }

  return "That took a few tries — let's start over.";
}