import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/*
 Creator Program connections. Each platform is a standard OAuth code flow:
 we redirect to the platform, it redirects back with a code, we exchange it
 for a token, read the follower count from the platform's own API, and
 store only the count, the handle and the account id (never the token).

 Credentials (server env): GOOGLE_OAUTH_CLIENT_ID/SECRET (YouTube Data API
 enabled), TIKTOK_CLIENT_KEY/SECRET (Login Kit, user.info.stats approved),
 TWITCH_CLIENT_ID/SECRET. A platform without credentials shows as
 unavailable rather than failing.
*/

export const CREATOR_THRESHOLD = 2500;
export type CreatorPlatform = "youtube" | "tiktok" | "twitch";
export const PLATFORMS: CreatorPlatform[] = ["youtube", "tiktok", "twitch"];

export interface CreatorAccount {
  accountId: string;
  handle: string;
  followers: number;
}

function env(name: string): string {
  return process.env[name] ?? "";
}

export function platformConfigured(p: CreatorPlatform): boolean {
  if (p === "youtube") return !!env("GOOGLE_OAUTH_CLIENT_ID") && !!env("GOOGLE_OAUTH_CLIENT_SECRET");
  if (p === "tiktok") return !!env("TIKTOK_CLIENT_KEY") && !!env("TIKTOK_CLIENT_SECRET");
  return !!env("TWITCH_CLIENT_ID") && !!env("TWITCH_CLIENT_SECRET");
}

function stateSecret(): string {
  return env("CREATOR_STATE_SECRET") || env("SUPABASE_SERVICE_ROLE_KEY");
}

/** A signed, ten-minute state tying the callback to the user who started it. */
export function signState(userId: string, platform: CreatorPlatform): string {
  const payload = `${userId}.${platform}.${Date.now()}`;
  const sig = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

export function verifyState(state: string, platform: CreatorPlatform): string | null {
  const [body, sig] = state.split(".");
  if (!body || !sig || !stateSecret()) return null;
  const payload = Buffer.from(body, "base64url").toString();
  const expected = createHmac("sha256", stateSecret()).update(payload).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const [userId, p, at] = payload.split(".");
  if (p !== platform || Date.now() - Number(at) > 10 * 60_000) return null;
  return userId;
}

export function redirectUri(origin: string, p: CreatorPlatform): string {
  return `${origin}/api/creator/callback/${p}`;
}

export function authorizeUrl(p: CreatorPlatform, origin: string, state: string): string {
  const redirect = redirectUri(origin, p);
  if (p === "youtube") {
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.search = new URLSearchParams({
      client_id: env("GOOGLE_OAUTH_CLIENT_ID"), redirect_uri: redirect, response_type: "code",
      scope: "https://www.googleapis.com/auth/youtube.readonly", state, prompt: "consent",
    }).toString();
    return u.toString();
  }
  if (p === "tiktok") {
    const u = new URL("https://www.tiktok.com/v2/auth/authorize/");
    u.search = new URLSearchParams({
      client_key: env("TIKTOK_CLIENT_KEY"), redirect_uri: redirect, response_type: "code",
      scope: "user.info.basic,user.info.profile,user.info.stats", state,
    }).toString();
    return u.toString();
  }
  const u = new URL("https://id.twitch.tv/oauth2/authorize");
  u.search = new URLSearchParams({
    client_id: env("TWITCH_CLIENT_ID"), redirect_uri: redirect, response_type: "code", scope: "", state,
  }).toString();
  return u.toString();
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return (await res.json()) as T;
}

/** Exchange the code and read the account's follower count. */
export async function fetchAccount(p: CreatorPlatform, code: string, origin: string): Promise<CreatorAccount> {
  const redirect = redirectUri(origin, p);
  if (p === "youtube") {
    const token = await json<{ access_token: string }>(await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: env("GOOGLE_OAUTH_CLIENT_ID"), client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"), redirect_uri: redirect, grant_type: "authorization_code" }),
    }));
    const data = await json<{ items?: { id: string; snippet?: { title?: string; customUrl?: string }; statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean } }[] }>(
      await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true", { headers: { Authorization: `Bearer ${token.access_token}` } }),
    );
    const ch = data.items?.[0];
    if (!ch) throw new Error("That Google account has no YouTube channel.");
    if (ch.statistics?.hiddenSubscriberCount) throw new Error("Your subscriber count is hidden on YouTube. Make it public, then try again.");
    return { accountId: ch.id, handle: ch.snippet?.customUrl ?? ch.snippet?.title ?? "YouTube", followers: Number(ch.statistics?.subscriberCount ?? 0) };
  }
  if (p === "tiktok") {
    const token = await json<{ access_token: string }>(await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_key: env("TIKTOK_CLIENT_KEY"), client_secret: env("TIKTOK_CLIENT_SECRET"), redirect_uri: redirect, grant_type: "authorization_code" }),
    }));
    const data = await json<{ data?: { user?: { open_id: string; username?: string; display_name?: string; follower_count?: number } } }>(
      await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,username,display_name,follower_count", { headers: { Authorization: `Bearer ${token.access_token}` } }),
    );
    const u = data.data?.user;
    if (!u) throw new Error("TikTok didn't return your account.");
    return { accountId: u.open_id, handle: u.username ? `@${u.username}` : u.display_name ?? "TikTok", followers: u.follower_count ?? 0 };
  }
  const token = await json<{ access_token: string }>(await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env("TWITCH_CLIENT_ID"), client_secret: env("TWITCH_CLIENT_SECRET"), redirect_uri: redirect, grant_type: "authorization_code" }),
  }));
  const headers = { Authorization: `Bearer ${token.access_token}`, "Client-Id": env("TWITCH_CLIENT_ID") };
  const users = await json<{ data: { id: string; login: string }[] }>(await fetch("https://api.twitch.tv/helix/users", { headers }));
  const me = users.data[0];
  if (!me) throw new Error("Twitch didn't return your account.");
  const followers = await json<{ total: number }>(await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${me.id}&first=1`, { headers }));
  return { accountId: me.id, handle: me.login, followers: followers.total ?? 0 };
}
