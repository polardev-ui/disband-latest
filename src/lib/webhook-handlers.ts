import { NextResponse, type NextRequest } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeEmbeds } from "@/lib/embeds";
import {
  DISCORD_CODES,
  WEBHOOK_CONTENT_MAX,
  discordError,
  discordRateLimited,
  isServerKey,
  isWebhookToken,
  parseExecute,
  readWebhookBody,
  toDiscordMessage,
  webhookRpcError,
  webhookUrl,
} from "@/lib/webhooks.server";

/*
 The webhook endpoints, written once and mounted at both
   /webhook/<server key>/<token>[/messages/<id>]
   /api/webhooks/<server key>/<token>[/messages/<id>]
*/

type Params = { serverKey: string; token: string; messageId?: string };

const unknownWebhook = () => discordError("Unknown Webhook", DISCORD_CODES.unknownWebhook, 404);

function validParams(p: Params) {
  return isServerKey(p.serverKey) && isWebhookToken(p.token);
}

async function loadHook(p: Params) {
  const service = getServiceSupabase();
  if (!service) return { service: null, hook: null };
  // The server key lives in server_webhook_keys (service role only), not on
  // the servers row every member can read.
  const { data: keyRow } = await service
    .from("server_webhook_keys")
    .select("server_id")
    .eq("webhook_key", p.serverKey)
    .maybeSingle();
  if (!keyRow) return { service, hook: null };
  const { data } = await service
    .from("webhooks")
    .select("id, server_id, channel_id, name, avatar_url, author_id")
    .eq("token", p.token)
    .eq("server_id", (keyRow as { server_id: string }).server_id)
    .is("deleted_at", null)
    .maybeSingle();
  return { service, hook: data as null | { id: string; server_id: string; channel_id: string; name: string; avatar_url: string | null; author_id: string } };
}

function webhookObject(hook: { id: string; server_id: string; channel_id: string; name: string; avatar_url: string | null }, p: Params) {
  return {
    id: hook.id,
    type: 1,
    name: hook.name,
    avatar: hook.avatar_url,
    channel_id: hook.channel_id,
    guild_id: hook.server_id,
    application_id: null,
    token: p.token,
    url: webhookUrl(p.serverKey, p.token),
  };
}

// --- /webhook/<key>/<token> ------------------------------------------------

export async function executeWebhook(request: NextRequest, p: Params) {
  if (!validParams(p)) return unknownWebhook();

  // Discord allows 5 requests per 2 seconds per webhook; match it, keyed on
  // the token so one noisy webhook can't slow another.
  const burst = rateLimit(`webhook:${p.token}`, 5, 2000);
  if (!burst.allowed) return discordRateLimited(burst.retryAfterSeconds);

  const read = await readWebhookBody(request);
  if (!read.ok) return read.response;
  const parsed = parseExecute(read.body, read.hasFiles);
  if (!parsed.ok) return parsed.response;
  const payload = parsed.payload;

  const service = getServiceSupabase();
  if (!service) return discordError("503: Service Unavailable", 0, 503);

  const { data, error } = await service.rpc("webhook_execute", {
    p_server_key: p.serverKey,
    p_token: p.token,
    p_content: payload.content,
    p_username: payload.username,
    p_avatar_url: payload.avatar_url,
    p_embeds: payload.embeds.length ? payload.embeds : null,
    p_parse_users: payload.parseUsers,
    p_parse_everyone: payload.parseEveryone,
  });
  if (error) return webhookRpcError(error);

  const wait = request.nextUrl.searchParams.get("wait");
  if (wait === "true" || wait === "1") {
    const { hook } = await loadHook(p);
    return NextResponse.json(toDiscordMessage(data, hook?.server_id ?? ""));
  }
  return new NextResponse(null, { status: 204 });
}

export async function getWebhook(_request: NextRequest, p: Params) {
  if (!validParams(p)) return unknownWebhook();
  const { hook } = await loadHook(p);
  if (!hook) return unknownWebhook();
  return NextResponse.json(webhookObject(hook, p));
}

export async function modifyWebhook(request: NextRequest, p: Params) {
  if (!validParams(p)) return unknownWebhook();
  const { service, hook } = await loadHook(p);
  if (!service || !hook) return unknownWebhook();
  const read = await readWebhookBody(request);
  if (!read.ok) return read.response;
  const name = typeof read.body.name === "string" ? read.body.name.trim().slice(0, 80) : null;
  if (name === "") return discordError("Invalid Form Body: name: This field is required", DISCORD_CODES.invalidBody, 400);
  if (name) {
    await service.from("webhooks").update({ name }).eq("id", hook.id);
    await service.from("profiles").update({ display_name: name }).eq("id", hook.author_id);
    hook.name = name;
  }
  return NextResponse.json(webhookObject(hook, p));
}

export async function deleteWebhook(_request: NextRequest, p: Params) {
  if (!validParams(p)) return unknownWebhook();
  const { service, hook } = await loadHook(p);
  if (!service || !hook) return unknownWebhook();
  await service.from("webhooks").update({ deleted_at: new Date().toISOString() }).eq("id", hook.id);
  return new NextResponse(null, { status: 204 });
}

// --- /webhook/<key>/<token>/messages/<id> ----------------------------------

function messageId(p: Params): number | null {
  return p.messageId && /^[0-9]{1,18}$/.test(p.messageId) ? Number(p.messageId) : null;
}

export async function getWebhookMessage(_request: NextRequest, p: Params) {
  if (!validParams(p)) return unknownWebhook();
  const id = messageId(p);
  const { service, hook } = await loadHook(p);
  if (!service || !hook) return unknownWebhook();
  if (id === null) return discordError("Unknown Message", DISCORD_CODES.unknownMessage, 404);
  const { data } = await service.from("messages").select("*").eq("display_id", id).eq("author_id", hook.author_id).maybeSingle();
  if (!data) return discordError("Unknown Message", DISCORD_CODES.unknownMessage, 404);
  return NextResponse.json(toDiscordMessage(data, hook.server_id));
}

export async function editWebhookMessage(request: NextRequest, p: Params) {
  if (!validParams(p)) return unknownWebhook();
  const id = messageId(p);
  if (id === null) return discordError("Unknown Message", DISCORD_CODES.unknownMessage, 404);
  const burst = rateLimit(`webhook:${p.token}`, 5, 2000);
  if (!burst.allowed) return discordRateLimited(burst.retryAfterSeconds);

  const read = await readWebhookBody(request);
  if (!read.ok) return read.response;
  const body = read.body;
  const setContent = "content" in body;
  const content = typeof body.content === "string" ? body.content : null;
  if (content && content.length > WEBHOOK_CONTENT_MAX) {
    return discordError(`Invalid Form Body: content: Must be ${WEBHOOK_CONTENT_MAX} or fewer in length.`, DISCORD_CODES.invalidBody, 400);
  }
  const setEmbeds = "embeds" in body;
  const norm = normalizeEmbeds(body.embeds);
  if (!norm.ok) return discordError(`Invalid Form Body: ${norm.error}`, DISCORD_CODES.invalidBody, 400);

  const service = getServiceSupabase();
  if (!service) return discordError("503: Service Unavailable", 0, 503);
  const { data, error } = await service.rpc("webhook_edit_message", {
    p_server_key: p.serverKey,
    p_token: p.token,
    p_display_id: id,
    p_content: content,
    p_set_content: setContent,
    p_embeds: norm.embeds.length ? norm.embeds : null,
    p_set_embeds: setEmbeds,
  });
  if (error) return webhookRpcError(error);
  const { hook } = await loadHook(p);
  return NextResponse.json(toDiscordMessage(data, hook?.server_id ?? ""));
}

export async function executeGitHubWebhook(request: NextRequest, p: Params) {
  if (!validParams(p)) return unknownWebhook();

  const burst = rateLimit(`webhook:${p.token}`, 5, 2000);
  if (!burst.allowed) return discordRateLimited(burst.retryAfterSeconds);

  const service = getServiceSupabase();
  if (!service) return discordError("503: Service Unavailable", 0, 503);

  const { hook } = await loadHook(p);
  if (!hook) return unknownWebhook();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return discordError("Bad Request", 0, 400);
  }

  const event = request.headers.get("x-github-event") ?? "push";
  const content = formatGitHubEvent(event, body);
  if (!content) return new NextResponse(null, { status: 204 });

  const { error } = await service.rpc("webhook_execute", {
    p_server_key: p.serverKey,
    p_token: p.token,
    p_content: content,
    p_username: "GitHub",
    p_avatar_url: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
    p_embeds: null,
    p_parse_users: false,
    p_parse_everyone: false,
  });
  if (error) return webhookRpcError(error);

  const wait = request.nextUrl.searchParams.get("wait");
  if (wait === "true" || wait === "1") {
    return NextResponse.json({ ok: true });
  }
  return new NextResponse(null, { status: 204 });
}

function formatGitHubEvent(event: string, body: Record<string, unknown>): string {
  const repo = (body.repository as { full_name?: string; name?: string } | undefined)?.full_name
    ?? (body.repository as { name?: string } | undefined)?.name
    ?? "repository";
  const sender = (body.sender as { login?: string } | undefined)?.login ?? "someone";

  if (event === "push") {
    const commits = (body.commits as { message?: string }[] | undefined) ?? [];
    const branch = String(body.ref ?? "").replace("refs/heads/", "");
    const lines = commits.slice(0, 5).map((c) => `• ${String(c.message ?? "").split("\\n")[0]}`);
    const more = commits.length > 5 ? `\\n…and ${commits.length - 5} more` : "";
    return `**${sender}** pushed ${commits.length} commit${commits.length === 1 ? "" : "s"} to \`${branch}\` in **${repo}**${lines.length ? "\\n" + lines.join("\\n") + more : ""}`;
  }
  if (event === "pull_request") {
    const pr = body.pull_request as { number?: number; title?: string; merged?: boolean; state?: string; html_url?: string } | undefined;
    const action = String(body.action ?? "updated");
    const verb = action === "closed" && pr?.merged ? "merged" : action;
    return `**${sender}** ${verb} pull request #${pr?.number ?? ""} in **${repo}**: ${pr?.title ?? ""}`;
  }
  if (event === "issues") {
    const issue = body.issue as { number?: number; title?: string } | undefined;
    const action = String(body.action ?? "updated");
    return `**${sender}** ${action} issue #${issue?.number ?? ""} in **${repo}**: ${issue?.title ?? ""}`;
  }
  if (event === "release") {
    const release = body.release as { tag_name?: string; name?: string } | undefined;
    const action = String(body.action ?? "published");
    return `**${sender}** ${action} release \`${release?.tag_name ?? release?.name ?? ""}\` in **${repo}**`;
  }
  if (event === "star" || event === "watch") {
    return `**${sender}** starred **${repo}**`;
  }
  if (event === "fork") {
    return `**${sender}** forked **${repo}**`;
  }
  return `GitHub event \`${event}\` in **${repo}** by ${sender}`;
}

export async function deleteWebhookMessage(_request: NextRequest, p: Params) {
  if (!validParams(p)) return unknownWebhook();
  const id = messageId(p);
  if (id === null) return discordError("Unknown Message", DISCORD_CODES.unknownMessage, 404);
  const service = getServiceSupabase();
  if (!service) return discordError("503: Service Unavailable", 0, 503);
  const { error } = await service.rpc("webhook_delete_message", {
    p_server_key: p.serverKey,
    p_token: p.token,
    p_display_id: id,
  });
  if (error) return webhookRpcError(error);
  return new NextResponse(null, { status: 204 });
}
