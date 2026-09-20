import { PUBLIC_ENV } from "@/lib/public-env";

const API = "https://discord.com/api/v10";

export function discordCallbackUrl(): string {
  return `${PUBLIC_ENV.webAppUrl}/api/discord/callback`;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function getDiscordClientId(): string {
  return requireEnv("DISCORD_CLIENT_ID");
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Space signing key is not configured");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`discord-oauth:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signOAuthState(payload: { userId: string; guild: string; nonce: string }): Promise<string> {
  const key = await hmacKey();
  const body = JSON.stringify(payload);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `${Buffer.from(body).toString("base64url")}.${hex}`;
}

export async function verifyOAuthState(state: string): Promise<{ userId: string; guild: string; nonce: string } | null> {
  try {
    const [b64, hex] = state.split(".");
    if (!b64 || !hex) return null;
    const body = Buffer.from(b64, "base64url").toString("utf8");
    const key = await hmacKey();
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    const bytes = new Uint8Array(sig);
    let expected = "";
    for (const b of bytes) expected += b.toString(16).padStart(2, "0");
    if (expected.length !== hex.length) return null;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ hex.charCodeAt(i);
    if (diff !== 0) return null;
    const payload = JSON.parse(body) as { userId?: unknown; guild?: unknown; nonce?: unknown };
    if (typeof payload.userId !== "string" || typeof payload.guild !== "string" || typeof payload.nonce !== "string") {
      return null;
    }
    return { userId: payload.userId, guild: payload.guild, nonce: payload.nonce };
  } catch {
    return null;
  }
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getDiscordClientId(),
    redirect_uri: discordCallbackUrl(),
    response_type: "code",
    scope: "identify",
    state,
    prompt: "consent",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<string> {
  const res = await fetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getDiscordClientId(),
      client_secret: requireEnv("DISCORD_CLIENT_SECRET"),
      grant_type: "authorization_code",
      code,
      redirect_uri: discordCallbackUrl(),
    }),
  });
  if (!res.ok) throw new Error("Discord code exchange failed");
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Discord did not return an access token");
  return data.access_token;
}

export async function fetchDiscordUser(accessToken: string): Promise<{ id: string; username: string }> {
  const res = await fetch(`${API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Could not read your Discord profile");
  const data = (await res.json()) as { id?: string; username?: string };
  if (!data.id || !data.username) throw new Error("Discord profile was incomplete");
  return { id: data.id, username: data.username };
}

function botHeaders(): Record<string, string> {
  return {
    Authorization: `Bot ${requireEnv("DISCORD_BOT_TOKEN")}`,
    "Content-Type": "application/json",
  };
}

export async function ensureGuildRole(guildId: string, roleName: string): Promise<{ id: string; name: string }> {
  const list = await fetch(`${API}/guilds/${guildId}/roles`, { headers: botHeaders() });
  if (!list.ok) {
    if (list.status === 403 || list.status === 401) {
      throw new Error("The bot cannot see that space — check its token and permissions");
    }
    throw new Error("Could not read the space's roles");
  }
  const roles = (await list.json()) as { id: string; name: string }[];
  const existing = roles.find((r) => r.name.toLowerCase() === roleName.toLowerCase());
  if (existing) return { id: existing.id, name: existing.name };
  const created = await fetch(`${API}/guilds/${guildId}/roles`, {
    method: "POST",
    headers: botHeaders(),
    body: JSON.stringify({ name: roleName.slice(0, 100), mentionable: false }),
  });
  if (!created.ok) {
    if (created.status === 403) {
      throw new Error("The bot needs the Manage Roles permission in that space");
    }
    throw new Error("Could not create the role — the bot's own role may sit too low");
  }
  const role = (await created.json()) as { id: string; name: string };
  return { id: role.id, name: role.name };
}

export async function assignGuildRole(guildId: string, discordUserId: string, roleId: string): Promise<void> {
  const res = await fetch(`${API}/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`, {
    method: "PUT",
    headers: botHeaders(),
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error("You are not in that Discord space — join it first");
    if (res.status === 403) {
      throw new Error("The bot cannot assign the role — its own role must sit above it");
    }
    throw new Error("Could not assign the role");
  }
}
