import { NextRequest, NextResponse } from "next/server";
import { normalizeEmbeds } from "@/lib/embeds";
import { normalizeComponents } from "@/lib/bot-commands";
import { limitParam, rpcError, withBot } from "@/lib/bot-route";

type Params = { params: Promise<{ channelId: string }> };

/**
 * A forum's posts, pinned first, then by latest activity (messages.read).
 * A post is a channel: read and reply to one with the channel endpoints,
 * using the post's id.
 */
export async function GET(request: NextRequest, { params }: Params) {
  return withBot(request, "read", "v1 forum posts GET", async (bot, service) => {
    const { channelId } = await params;
    const { data, error } = await service.rpc("bot_list_forum_posts", {
      p_bot_id: bot.botId,
      p_forum_id: channelId,
      p_limit: limitParam(request, 50, 100),
    });
    if (error) return rpcError(error);
    return NextResponse.json({ posts: data ?? [] });
  });
}

/** Starts a post in a forum (messages.write). */
export async function POST(request: NextRequest, { params }: Params) {
  return withBot(request, "write", "v1 forum posts POST", async (bot, service) => {
    const { channelId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      title?: unknown;
      content?: unknown;
      tags?: unknown;
      embeds?: unknown;
      components?: unknown;
    };
    if (typeof body.title !== "string") {
      return NextResponse.json({ error: "Post title is required" }, { status: 400 });
    }
    if (body.content !== undefined && typeof body.content !== "string") {
      return NextResponse.json({ error: "Invalid content" }, { status: 400 });
    }
    const tags = body.tags === undefined ? [] : body.tags;
    if (!Array.isArray(tags) || tags.some((t) => typeof t !== "string")) {
      return NextResponse.json({ error: "Invalid tags: send an array of tag names" }, { status: 400 });
    }
    const embeds = normalizeEmbeds(body.embeds);
    if (!embeds.ok) return NextResponse.json({ error: embeds.error }, { status: 400 });
    const components = normalizeComponents(body.components);
    if (!components.ok) return NextResponse.json({ error: components.error }, { status: 400 });

    const { data, error } = await service.rpc("bot_create_forum_post", {
      p_bot_id: bot.botId,
      p_forum_id: channelId,
      p_title: body.title,
      p_content: body.content ?? "",
      p_tags: tags,
      p_embeds: embeds.embeds.length ? embeds.embeds : null,
      p_components: components.value,
    });
    if (error) return rpcError(error);
    return NextResponse.json(data, { status: 201 });
  });
}
