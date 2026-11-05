import { NextResponse, type NextRequest } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeEmbeds, safeEmbedUrl, type Embed } from "@/lib/embeds";
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

  let body: Record<string, unknown> = {};
  try {
    const raw = await request.text();
    if (raw.trim()) {
      const ct = request.headers.get("content-type") ?? "";
      if (ct.includes("application/x-www-form-urlencoded")) {
        const params = new URLSearchParams(raw);
        const payload = params.get("payload");
        body = payload ? (JSON.parse(payload) as Record<string, unknown>) : {};
      } else {
        body = JSON.parse(raw) as Record<string, unknown>;
      }
    }
  } catch {
    return discordError("Bad Request", 0, 400);
  }

  const event = request.headers.get("x-github-event") ?? "push";
  const formatted = formatGitHubEvent(event, body);
  // Keep the same validation/limits the Discord-compatible endpoint uses so
  // GitHub payloads can never write a malformed embed row.
  const norm = normalizeEmbeds(formatted.embeds);
  const embeds = norm.ok ? norm.embeds : [];
  if (!formatted.content && !embeds.length) return new NextResponse(null, { status: 204 });

  const { error } = await service.rpc("webhook_execute", {
    p_server_key: p.serverKey,
    p_token: p.token,
    p_content: formatted.content,
    p_username: "GitHub",
    p_avatar_url: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
    p_embeds: embeds.length ? embeds : null,
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

type GitHubRepo = {
  full_name?: string;
  name?: string;
  html_url?: string;
  description?: string | null;
  stargazers_count?: number;
  forks_count?: number;
};

type GitHubUser = { login?: string; avatar_url?: string };

function formatGitHubEvent(event: string, body: Record<string, unknown>): { content: string; embeds: Embed[] | null } {
  const repository = body.repository as GitHubRepo | undefined;
  const repo = repository?.full_name ?? repository?.name ?? "repository";
  const repoUrl = repository?.html_url;
  const senderObj = body.sender as GitHubUser | undefined;
  const sender = senderObj?.login ?? "someone";
  const senderIcon = safeEmbedUrl(senderObj?.avatar_url);
  // Discord-style author line: who did the thing, with their GitHub avatar.
  const author = { name: sender, icon_url: senderIcon };

  if (event === "push") {
    const commits = (body.commits as { message?: string; url?: string }[] | undefined) ?? [];
    const ref = String(body.ref ?? "");
    const isTag = ref.startsWith("refs/tags/");
    const createdAt = body.created === true;
    const deletedAt = body.deleted === true;
    const name = ref.replace(/^refs\/(heads|tags)\//, "");

    // GitHub sends tag pushes as a push event with zero commits. Showing
    // "pushed 0 commits to refs/tags/..." and no embed made tag releases look
    // broken; describe the tag itself instead.
    if (isTag) {
      const verb = deletedAt ? "deleted" : createdAt ? "created" : "updated";
      const tagUrl = repoUrl ? `${repoUrl}/tree/${encodeURIComponent(name)}` : undefined;
      return {
        content: `**${sender}** ${verb} tag \`${name}\` in **${repo}**`,
        embeds: [
          {
            title: `Tag ${name}`,
            url: tagUrl,
            description: deletedAt ? "This tag was deleted." : `Tag ${createdAt ? "created" : "updated"} on ${repo}.`,
            color: deletedAt ? 0xda3633 : 0x1f6feb,
            author,
            footer: { text: `github.com/${repo}` },
          },
        ],
      };
    }

    const count = commits.length;
    const lines = commits.slice(0, 5).map((c) => `• ${String(c.message ?? "").split("\n")[0]}`);
    const more = count > 5 ? `\n…and ${count - 5} more` : "";
    const content = deletedAt
      ? `**${sender}** deleted branch \`${name}\` in **${repo}**`
      : createdAt
        ? `**${sender}** created branch \`${name}\` in **${repo}**`
        : `**${sender}** pushed ${count} commit${count === 1 ? "" : "s"} to \`${name}\` in **${repo}**`;
    const compare = safeEmbedUrl(body.compare);
    const embed: Embed = {
      title: deletedAt
        ? `Branch deleted: ${name}`
        : createdAt
          ? `Branch created: ${name}`
          : `${count} commit${count === 1 ? "" : "s"} to ${name}`,
      description: count ? lines.join("\n") + more : deletedAt ? undefined : "No new commits.",
      url: compare ?? repoUrl,
      color: deletedAt ? 0xda3633 : 0x24292e,
      author,
      footer: { text: `github.com/${repo}` },
    };
    return { content, embeds: [embed] };
  }

  if (event === "create" || event === "delete") {
    const refType = String(body.ref_type ?? "branch");
    const name = String(body.ref ?? "");
    const label = refType === "tag" ? "tag" : "branch";
    const verb = event === "create" ? "created" : "deleted";
    return {
      content: `**${sender}** ${verb} ${label} \`${name}\` in **${repo}**`,
      embeds: [
        {
          title: `${label === "tag" ? "Tag" : "Branch"} ${verb}: ${name}`,
          url: repoUrl ? `${repoUrl}/tree/${encodeURIComponent(name)}` : undefined,
          color: event === "create" ? 0x238636 : 0xda3633,
          author,
          footer: { text: `github.com/${repo}` },
        },
      ],
    };
  }

  if (event === "pull_request") {
    const pr = body.pull_request as { number?: number; title?: string; merged?: boolean; state?: string; html_url?: string; body?: string } | undefined;
    const action = String(body.action ?? "updated");
    const verb = action === "closed" && pr?.merged ? "merged" : action;
    const content = `**${sender}** ${verb} pull request #${pr?.number ?? ""} in **${repo}**: ${pr?.title ?? ""}`;
    const embed = {
      title: `PR #${pr?.number ?? ""}: ${pr?.title ?? ""}`,
      description: (pr?.body ?? "").slice(0, 300) || undefined,
      url: pr?.html_url,
      color: pr?.merged ? 0x8957e5 : pr?.state === "open" ? 0x238636 : 0xda3633,
      author,
      footer: { text: `${sender} · ${verb}` },
    };
    return { content, embeds: [embed] };
  }

  if (event === "pull_request_review") {
    const review = body.review as { state?: string; html_url?: string; body?: string } | undefined;
    const pr = body.pull_request as { number?: number; title?: string; html_url?: string } | undefined;
    const state = String(review?.state ?? "commented").toLowerCase();
    const verb = state === "approved" ? "approved" : state === "changes_requested" ? "requested changes on" : "reviewed";
    return {
      content: `**${sender}** ${verb} PR #${pr?.number ?? ""} in **${repo}**: ${pr?.title ?? ""}`,
      embeds: [
        {
          title: `Review: ${pr?.title ?? `PR #${pr?.number ?? ""}`}`,
          description: (review?.body ?? "").slice(0, 300) || `${sender} ${verb} this pull request.`,
          url: review?.html_url ?? pr?.html_url,
          color: state === "approved" ? 0x238636 : state === "changes_requested" ? 0xda3633 : 0x1f6feb,
          author,
          footer: { text: `${sender} · ${verb}` },
        },
      ],
    };
  }

  if (event === "issues") {
    const issue = body.issue as { number?: number; title?: string; html_url?: string; body?: string } | undefined;
    const action = String(body.action ?? "updated");
    const content = `**${sender}** ${action} issue #${issue?.number ?? ""} in **${repo}**: ${issue?.title ?? ""}`;
    const embed = {
      title: `Issue #${issue?.number ?? ""}: ${issue?.title ?? ""}`,
      description: (issue?.body ?? "").slice(0, 300) || undefined,
      url: issue?.html_url,
      color: action === "closed" ? 0x8957e5 : 0x238636,
      author,
      footer: { text: `${sender} · ${action}` },
    };
    return { content, embeds: [embed] };
  }

  if (event === "issue_comment") {
    const issue = body.issue as { number?: number; title?: string; html_url?: string } | undefined;
    const comment = body.comment as { html_url?: string; body?: string } | undefined;
    const action = String(body.action ?? "created");
    return {
      content: `**${sender}** ${action} a comment on #${issue?.number ?? ""} in **${repo}**`,
      embeds: [
        {
          title: issue?.title ?? `Comment on #${issue?.number ?? ""}`,
          description: (comment?.body ?? "").slice(0, 300) || undefined,
          url: comment?.html_url ?? issue?.html_url,
          color: 0x1f6feb,
          author,
          footer: { text: `${sender} · ${action}` },
        },
      ],
    };
  }

  if (event === "release") {
    const release = body.release as { tag_name?: string; name?: string; html_url?: string; body?: string; published_at?: string } | undefined;
    const action = String(body.action ?? "published");
    const tag = release?.tag_name ?? release?.name ?? "";
    const content = `**${sender}** ${action} release \`${tag}\` in **${repo}**`;
    const embed = {
      title: release?.name ?? release?.tag_name ?? "Release",
      description: (release?.body ?? "").slice(0, 300) || undefined,
      url: release?.html_url,
      color: action === "deleted" ? 0xda3633 : 0x1f6feb,
      timestamp: release?.published_at,
      author,
      footer: { text: `${sender} · ${action}` },
    };
    return { content, embeds: [embed] };
  }

  if (event === "workflow_run") {
    const run = body.workflow_run as {
      name?: string;
      display_title?: string;
      conclusion?: string | null;
      status?: string;
      html_url?: string;
      head_branch?: string;
    } | undefined;
    const action = String(body.action ?? "completed");
    const conclusion = run?.conclusion ?? run?.status ?? "unknown";
    const failed = conclusion === "failure" || conclusion === "timed_out" || conclusion === "cancelled";
    const title = run?.display_title ? `${run.name ?? "Workflow"}: ${run.display_title}` : run?.name ?? "Workflow run";
    return {
      content: `**${sender}** workflow \`${run?.name ?? "run"}\` ${action} on \`${run?.head_branch ?? "unknown"}\` in **${repo}** — **${conclusion}**`,
      embeds: [
        {
          title,
          description: `Result: **${conclusion}**`,
          url: run?.html_url,
          color: failed ? 0xda3633 : conclusion === "success" ? 0x238636 : 0xf0b232,
          author,
          footer: { text: `${sender} · ${action}` },
        },
      ],
    };
  }

  if (event === "star" || event === "watch") {
    const action = String(body.action ?? "created");
    const removed = action === "deleted";
    return {
      content: `**${sender}** ${removed ? "removed a star from" : "starred"} **${repo}**`,
      embeds: [
        {
          title: removed ? `Star removed from ${repo}` : `New star on ${repo}`,
          description: repository?.description ?? undefined,
          url: repoUrl,
          color: removed ? 0xda3633 : 0xf0b232,
          author,
          footer: {
            text: repository?.stargazers_count != null ? `${repository.stargazers_count} stargazers` : `github.com/${repo}`,
          },
        },
      ],
    };
  }

  if (event === "fork") {
    const fork = body.forkee as { full_name?: string; html_url?: string } | undefined;
    return {
      content: `**${sender}** forked **${repo}**${fork?.full_name ? ` to **${fork.full_name}**` : ""}`,
      embeds: [
        {
          title: `Fork: ${fork?.full_name ?? repo}`,
          description: repository?.description ?? undefined,
          url: fork?.html_url ?? repoUrl,
          color: 0x1f6feb,
          author,
          footer: { text: `github.com/${repo}` },
        },
      ],
    };
  }

  if (event === "ping") {
    return {
      content: `GitHub webhook connected to **${repo}**`,
      embeds: [
        {
          title: "Webhook connected",
          description: String(body.zen ?? "GitHub successfully delivered a ping event to this channel."),
          url: repoUrl,
          color: 0x238636,
          author,
          footer: { text: `github.com/${repo}` },
        },
      ],
    };
  }

  const content = `GitHub event \`${event}\` in **${repo}** by ${sender}`;
  return {
    content,
    embeds: [
      {
        title: `GitHub event: ${event}`,
        description: `\`${event}\` event received from ${repo}.`,
        url: repoUrl,
        color: 0x24292e,
        author,
        footer: { text: `github.com/${repo}` },
      },
    ],
  };
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
