/*
 Rich embeds, in Discord's shape and with Discord's limits, so payloads built
 for Discord (webhooks, bot libraries, embed builders) work unchanged.

   title 256 · description 4096 · fields 25 (name 256, value 1024)
   footer.text 2048 · author.name 256 · 10 embeds per message
   6000 characters across every embed in a message

 normalizeEmbeds() is the only way embeds reach the database: it keeps known
 keys, trims to the limits above, drops unsafe URLs, and reports the first
 hard error in Discord's wording.
*/

export interface EmbedMedia {
  url: string;
  width?: number;
  height?: number;
}

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface Embed {
  title?: string;
  description?: string;
  url?: string;
  /** 0xRRGGBB as an integer, like Discord. */
  color?: number;
  timestamp?: string;
  footer?: { text: string; icon_url?: string };
  image?: EmbedMedia;
  thumbnail?: EmbedMedia;
  video?: EmbedMedia;
  author?: { name: string; url?: string; icon_url?: string };
  provider?: { name?: string; url?: string };
  fields?: EmbedField[];
}

/** What a webhook message carries for its displayed sender. */
export interface MessageWebhookInfo {
  id: string;
  name: string;
  avatar_url: string | null;
}

export const EMBED_LIMITS = {
  embeds: 10,
  title: 256,
  description: 4096,
  fields: 25,
  fieldName: 256,
  fieldValue: 1024,
  footer: 2048,
  author: 256,
  total: 6000,
} as const;

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

/** http(s) only, no credentials, sensible length. Anything else is dropped. */
export function safeEmbedUrl(v: unknown): string | undefined {
  if (typeof v !== "string" || v.length > 2048) return undefined;
  try {
    const u = new URL(v.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
    if (u.username || u.password) return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

function media(v: unknown): EmbedMedia | undefined {
  if (!v || typeof v !== "object") return undefined;
  const url = safeEmbedUrl((v as { url?: unknown }).url);
  return url ? { url } : undefined;
}

export type NormalizeResult = { ok: true; embeds: Embed[] } | { ok: false; error: string };

export function normalizeEmbeds(input: unknown): NormalizeResult {
  if (input == null) return { ok: true, embeds: [] };
  if (!Array.isArray(input)) return { ok: false, error: "embeds: must be an array" };
  if (input.length > EMBED_LIMITS.embeds) {
    return { ok: false, error: `embeds: Must be ${EMBED_LIMITS.embeds} or fewer in length.` };
  }

  const out: Embed[] = [];
  let total = 0;
  for (let i = 0; i < input.length; i++) {
    const raw = input[i] as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object") return { ok: false, error: `embeds.${i}: must be an object` };
    const e: Embed = {};

    e.title = str(raw.title, EMBED_LIMITS.title);
    e.description = str(raw.description, EMBED_LIMITS.description);
    e.url = safeEmbedUrl(raw.url);

    if (raw.color != null) {
      const c = typeof raw.color === "string" ? parseInt(raw.color.replace(/^#/, ""), 16) : Number(raw.color);
      if (Number.isFinite(c) && c >= 0 && c <= 0xffffff) e.color = Math.floor(c);
    }

    if (typeof raw.timestamp === "string" && !Number.isNaN(Date.parse(raw.timestamp))) {
      e.timestamp = new Date(raw.timestamp).toISOString();
    }

    const footer = raw.footer as Record<string, unknown> | undefined;
    const footerText = footer ? str(footer.text, EMBED_LIMITS.footer) : undefined;
    if (footerText) e.footer = { text: footerText, icon_url: safeEmbedUrl(footer?.icon_url) };

    const author = raw.author as Record<string, unknown> | undefined;
    const authorName = author ? str(author.name, EMBED_LIMITS.author) : undefined;
    if (authorName) e.author = { name: authorName, url: safeEmbedUrl(author?.url), icon_url: safeEmbedUrl(author?.icon_url) };

    const provider = raw.provider as Record<string, unknown> | undefined;
    if (provider) {
      const name = str(provider.name, EMBED_LIMITS.author);
      if (name) e.provider = { name, url: safeEmbedUrl(provider.url) };
    }

    e.image = media(raw.image);
    e.thumbnail = media(raw.thumbnail);
    e.video = media(raw.video);

    if (raw.fields != null) {
      if (!Array.isArray(raw.fields)) return { ok: false, error: `embeds.${i}.fields: must be an array` };
      if (raw.fields.length > EMBED_LIMITS.fields) {
        return { ok: false, error: `embeds.${i}.fields: Must be ${EMBED_LIMITS.fields} or fewer in length.` };
      }
      const fields: EmbedField[] = [];
      for (let j = 0; j < raw.fields.length; j++) {
        const f = raw.fields[j] as Record<string, unknown> | null;
        const name = f ? str(f.name, EMBED_LIMITS.fieldName) : undefined;
        const value = f ? str(f.value, EMBED_LIMITS.fieldValue) : undefined;
        if (!name || !value) {
          return { ok: false, error: `embeds.${i}.fields.${j}: name and value are required` };
        }
        fields.push({ name, value, inline: f?.inline === true });
      }
      if (fields.length) e.fields = fields;
    }

    total +=
      (e.title?.length ?? 0) +
      (e.description?.length ?? 0) +
      (e.footer?.text.length ?? 0) +
      (e.author?.name.length ?? 0) +
      (e.fields ?? []).reduce((n, f) => n + f.name.length + f.value.length, 0);

    // Strip undefined keys so stored JSON stays tidy.
    const clean = JSON.parse(JSON.stringify(e)) as Embed;
    if (Object.keys(clean).length === 0) return { ok: false, error: `embeds.${i}: Embed is empty` };
    out.push(clean);
  }

  if (total > EMBED_LIMITS.total) {
    return { ok: false, error: `embeds: Embed size exceeds maximum size of ${EMBED_LIMITS.total}` };
  }
  return { ok: true, embeds: out };
}

/** 0xRRGGBB integer → "#rrggbb". */
export function embedColorHex(color: number | undefined): string | null {
  if (color == null) return null;
  return `#${color.toString(16).padStart(6, "0")}`;
}
