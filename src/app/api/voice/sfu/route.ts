import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/server-auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

/*
 The browser's side of Cloudflare Realtime (an SFU). The app secret never
 leaves the server, so every SDP exchange comes through here.

   GET                     { enabled } — whether voice uses the SFU at all
   POST { action: ... , channelId }
     session               start a Cloudflare session for my seat in this room
     push    offer, tracks start sending my tracks ([{ mid, trackName }])
     pull    tracks        receive others' tracks ([{ userId, trackName }])
     renegotiate answer    finish an exchange the SFU started (after pull)
     close   offer, mids   stop receiving tracks I pulled

 Every call checks that the caller is live in that voice channel, and pulls
 only reach people live in the same channel, so a session ID alone gets
 nobody's audio.
*/

const API = "https://rtc.live.cloudflare.com/v1/apps";
const TRACK_NAMES = new Set(["audio", "camera", "screen", "screenaudio"]);

function config() {
  const appId = process.env.CLOUDFLARE_REALTIME_APP_ID;
  const token = process.env.CLOUDFLARE_REALTIME_APP_TOKEN;
  return appId && token ? { appId, token } : null;
}

async function cf(path: string, method: "POST" | "PUT", body?: unknown) {
  const c = config()!;
  const res = await fetch(`${API}/${c.appId}${path}`, {
    method,
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || json.errorCode) {
    console.error("realtime sfu error", path, res.status, json.errorCode, json.errorDescription);
    return { ok: false as const, json };
  }
  return { ok: true as const, json };
}

export async function GET() {
  return NextResponse.json({ enabled: !!config() });
}

type Body = {
  action?: string;
  channelId?: string;
  offer?: { type?: string; sdp?: string };
  answer?: { type?: string; sdp?: string };
  tracks?: { mid?: string; trackName?: string; userId?: string }[];
  mids?: string[];
};

function sdp(d: Body["offer"], type: "offer" | "answer") {
  return d && d.type === type && typeof d.sdp === "string" && d.sdp.length < 200_000 ? { type, sdp: d.sdp } : null;
}

export async function POST(request: NextRequest) {
  if (!config()) return NextResponse.json({ error: "Voice servers aren't set up.", fallback: true }, { status: 503 });

  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Joining, toggling camera and people coming and going each cost a call or two.
  const gate = rateLimit(`sfu:${user.id}`, 120, 60_000);
  if (!gate.allowed) return tooManyRequests(gate.retryAfterSeconds);

  const body = (await request.json().catch(() => ({}))) as Body;
  const channelId = body.channelId ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(channelId)) return NextResponse.json({ error: "channelId is required." }, { status: 400 });

  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

  const { data: seat } = await service
    .from("voice_presence_live")
    .select("sfu_session_id")
    .eq("channel_id", channelId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!seat) return NextResponse.json({ error: "Join the voice channel first." }, { status: 403 });

  if (body.action === "session") {
    const r = await cf("/sessions/new", "POST");
    const sessionId = r.ok ? (r.json.sessionId as string | undefined) : undefined;
    if (!sessionId) return NextResponse.json({ error: "Couldn't reach the voice server." }, { status: 502 });
    await service
      .from("voice_presence")
      .update({ sfu_session_id: sessionId, sfu_tracks: [] })
      .eq("channel_id", channelId)
      .eq("user_id", user.id);
    return NextResponse.json({ sessionId });
  }

  const sessionId = seat.sfu_session_id as string | null;
  if (!sessionId) return NextResponse.json({ error: "No voice session yet." }, { status: 409 });

  if (body.action === "push") {
    const offer = sdp(body.offer, "offer");
    const tracks = (body.tracks ?? []).filter((t) => typeof t.mid === "string" && TRACK_NAMES.has(t.trackName ?? ""));
    if (!offer || tracks.length === 0) return NextResponse.json({ error: "An offer and tracks are required." }, { status: 400 });
    const r = await cf(`/sessions/${sessionId}/tracks/new`, "POST", {
      sessionDescription: offer,
      tracks: tracks.map((t) => ({ location: "local", mid: t.mid, trackName: t.trackName })),
    });
    return NextResponse.json(r.json, { status: r.ok ? 200 : 502 });
  }

  if (body.action === "pull") {
    const wanted = (body.tracks ?? []).filter((t) => typeof t.userId === "string" && TRACK_NAMES.has(t.trackName ?? ""));
    if (wanted.length === 0 || wanted.length > 64) return NextResponse.json({ error: "Pick 1–64 tracks." }, { status: 400 });
    const { data: others } = await service
      .from("voice_presence_live")
      .select("user_id, sfu_session_id")
      .eq("channel_id", channelId)
      .in("user_id", [...new Set(wanted.map((t) => t.userId!))]);
    const sessions = new Map((others ?? []).filter((o) => o.sfu_session_id).map((o) => [o.user_id as string, o.sfu_session_id as string]));
    const tracks = wanted
      .filter((t) => sessions.has(t.userId!) && t.userId !== user.id)
      .map((t) => ({ location: "remote", sessionId: sessions.get(t.userId!), trackName: t.trackName }));
    if (tracks.length === 0) return NextResponse.json({ error: "Those people aren't in this room." }, { status: 404 });
    const r = await cf(`/sessions/${sessionId}/tracks/new`, "POST", { tracks });
    return NextResponse.json(r.json, { status: r.ok ? 200 : 502 });
  }

  if (body.action === "renegotiate") {
    const answer = sdp(body.answer, "answer");
    if (!answer) return NextResponse.json({ error: "An answer is required." }, { status: 400 });
    const r = await cf(`/sessions/${sessionId}/renegotiate`, "PUT", { sessionDescription: answer });
    return NextResponse.json(r.json, { status: r.ok ? 200 : 502 });
  }

  if (body.action === "close") {
    const offer = sdp(body.offer, "offer");
    const mids = (body.mids ?? []).filter((m) => typeof m === "string" && m.length < 16);
    if (!offer || mids.length === 0) return NextResponse.json({ error: "An offer and mids are required." }, { status: 400 });
    const r = await cf(`/sessions/${sessionId}/tracks/close`, "PUT", {
      sessionDescription: offer,
      tracks: mids.map((mid) => ({ mid })),
      force: false,
    });
    return NextResponse.json(r.json, { status: r.ok ? 200 : 502 });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
