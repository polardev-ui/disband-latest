import { useEffect, useSyncExternalStore } from "react";
import type { MessageAttachmentPayload } from "@/lib/messages";

/**
 * Stickers: animated artwork sent as a message of its own, picked from the
 * composer's sticker picker.
 *
 * Every build has the built-in packs below (their files are in
 * public/stickers). On the dev server, more packs can come from local folders
 * (see src/app/api/dev/stickers), so unreleased stickers can be tried in real
 * chats. Spaces' own stickers come from src/lib/expressions. A sticker
 * message stores only the sticker's id and name (an
 * `attachments` entry of type "sticker"), and the art is looked up here when
 * the message is drawn.
 */

export interface Sticker {
  id: string;
  packId: string;
  name: string;
  /** Words (and emoji) that find the sticker in search. */
  tags: string[];
  /** Lottie (the local packs) or an image a space uploaded (PNG, APNG, GIF, WebP, JPEG). */
  format: "lottie" | "image";
  /** The Lottie JSON, or the image. */
  url: string;
  /** An animated WebP of the same sticker, for anywhere a player can't run. */
  fallbackUrl: string | null;
  /** The frame shown while a Lottie sticker isn't animating. */
  poster: number;
  /** The space it belongs to, for a space's sticker. */
  serverId?: string | null;
}

export interface StickerPack {
  id: string;
  name: string;
  description: string | null;
  /** Id of the sticker that stands for the pack in the picker. */
  icon: string | null;
  stickers: Sticker[];
  /** For a space's stickers: the space, whose icon stands for the pack. */
  serverId?: string | null;
  iconUrl?: string | null;
}

/* ---------------------------------------------------------------- packs */

/** Sticker packs every build ships with. Files live in public/stickers/<pack>/. */
function builtInPack(
  id: string,
  name: string,
  description: string,
  stickers: { id: string; name: string; tags: string[]; poster: number }[],
): StickerPack {
  return {
    id,
    name,
    description,
    icon: stickers[0]?.id ?? null,
    stickers: stickers.map((s) => ({
      ...s,
      packId: id,
      format: "lottie" as const,
      url: `/stickers/${id}/${s.id}.json`,
      fallbackUrl: `/stickers/${id}/${s.id}.webp`,
    })),
  };
}

export const BUILT_IN_PACKS: StickerPack[] = [
  builtInPack("spectre", "Spectre", "Disband's mascot, in thirteen moods.", [
    { id: "spectre-hello", name: "Hello", tags: ["hello", "hi", "hey", "wave", "greetings", "👋"], poster: 48 },
    { id: "spectre-lol", name: "LOL", tags: ["lol", "laugh", "haha", "funny", "lmao", "😂"], poster: 32 },
    { id: "spectre-sad", name: "Sad", tags: ["sad", "cry", "crying", "tears", "upset", "😢", "😭"], poster: 40 },
    { id: "spectre-love", name: "Love", tags: ["love", "heart", "hearts", "crush", "adore", "😍", "❤️"], poster: 8 },
    { id: "spectre-party", name: "Party", tags: ["party", "celebrate", "yay", "hype", "confetti", "jump", "🎉"], poster: 48 },
    { id: "spectre-typing", name: "Typing", tags: ["typing", "type", "keyboard", "laptop", "mash", "busy", "working", "coding", "⌨️", "💻"], poster: 4 },
    { id: "spectre-sleepy", name: "Sleepy", tags: ["sleepy", "sleep", "tired", "zzz", "night", "goodnight", "bed", "😴", "💤"], poster: 40 },
    { id: "spectre-thinking", name: "Hmm", tags: ["hmm", "think", "thinking", "wonder", "confused", "question", "🤔"], poster: 20 },
    { id: "spectre-shocked", name: "Shocked", tags: ["shocked", "shock", "omg", "wow", "surprised", "scared", "what", "😱", "😮"], poster: 30 },
    { id: "spectre-angry", name: "Angry", tags: ["angry", "mad", "rage", "furious", "grr", "😠", "😡", "💢"], poster: 10 },
    { id: "spectre-cool", name: "Cool", tags: ["cool", "sunglasses", "shades", "chill", "swag", "😎"], poster: 0 },
    { id: "spectre-dance", name: "Dance", tags: ["dance", "dancing", "groove", "vibe", "music", "disco", "🕺", "💃", "🎶"], poster: 6 },
    { id: "spectre-shrug", name: "Shrug", tags: ["shrug", "idk", "dunno", "whatever", "meh", "🤷"], poster: 40 },
  ]),
  builtInPack("wisp", "Wisp", "Wisp, in ten moods.", [
    { id: "wisp-hi", name: "Hi", tags: ["hi", "hello", "hey", "wave", "👋"], poster: 60 },
    { id: "wisp-yay", name: "Yay", tags: ["yay", "hooray", "celebrate", "excited", "jump", "🎉", "✨"], poster: 36 },
    { id: "wisp-thanks", name: "Thanks", tags: ["thanks", "thank you", "ty", "grateful", "bow", "🙏"], poster: 60 },
    { id: "wisp-shy", name: "Shy", tags: ["shy", "blush", "embarrassed", "cute", "flustered", "😳", "☺️"], poster: 38 },
    { id: "wisp-sad", name: "Sad", tags: ["sad", "cry", "crying", "tears", "upset", "😢", "😭"], poster: 40 },
    { id: "wisp-love", name: "Love", tags: ["love", "heart", "hug", "adore", "crush", "❤️", "🥰"], poster: 6 },
    { id: "wisp-please", name: "Please", tags: ["please", "pleading", "beg", "pretty please", "puppy eyes", "🥺"], poster: 20 },
    { id: "wisp-pout", name: "Pout", tags: ["pout", "hmph", "angry", "mad", "sulk", "grumpy", "😤", "😠"], poster: 10 },
    { id: "wisp-sleepy", name: "Sleepy", tags: ["sleepy", "sleep", "tired", "zzz", "night", "goodnight", "😴", "💤"], poster: 60 },
    { id: "wisp-wink", name: "Wink", tags: ["wink", "flirt", "cheeky", "playful", "😉"], poster: 50 },
  ]),
];

interface PackState {
  packs: StickerPack[];
  ready: boolean;
}

let packState: PackState = { packs: BUILT_IN_PACKS, ready: false };
let packLoad: "idle" | "loading" | "done" = "idle";
const packListeners = new Set<() => void>();
const SERVER_PACKS: PackState = { packs: BUILT_IN_PACKS, ready: false };

function loadPacks() {
  if (packLoad !== "idle") return;
  packLoad = "loading";
  const finish = (local: StickerPack[]) => {
    packLoad = "done";
    // A local pack with a built-in pack's id is that pack's work in progress.
    const localIds = new Set(local.map((p) => p.id));
    const packs = [...BUILT_IN_PACKS.filter((p) => !localIds.has(p.id)), ...local];
    packState = { packs, ready: true };
    packListeners.forEach((l) => l());
  };
  // Only the dev server has local packs. The condition is a build-time constant, so
  // a production bundle doesn't even contain the request.
  if (process.env.NODE_ENV !== "development") {
    finish([]);
    return;
  }
  fetch("/api/dev/stickers", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : { packs: [] }))
    .then((body: { packs?: StickerPack[] }) => finish(Array.isArray(body.packs) ? body.packs : []))
    .catch(() => finish([]));
}

function subscribePacks(listener: () => void) {
  packListeners.add(listener);
  return () => packListeners.delete(listener);
}

/** Every sticker pack this build can offer; empty until loaded. */
export function useStickerPacks(): PackState {
  const state = useSyncExternalStore(subscribePacks, () => packState, () => SERVER_PACKS);
  useEffect(() => {
    loadPacks();
  }, []);
  return state;
}

export function findSticker(packs: StickerPack[], id: string): Sticker | null {
  for (const pack of packs) {
    const hit = pack.stickers.find((s) => s.id === id);
    if (hit) return hit;
  }
  return null;
}

export function findPack(packs: StickerPack[], id: string): StickerPack | null {
  return packs.find((p) => p.id === id) ?? null;
}

/** The sticker that stands for a pack (its icon, else its first sticker). */
export function packIcon(pack: StickerPack): Sticker | null {
  return pack.stickers.find((s) => s.id === pack.icon) ?? pack.stickers[0] ?? null;
}

/**
 * Stickers whose name or tags match, best first: a name that starts with the
 * query, then a tag that does, then any match inside a name or tag.
 */
export function searchStickers(packs: StickerPack[], query: string): Sticker[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { sticker: Sticker; score: number }[] = [];
  for (const pack of packs) {
    for (const sticker of pack.stickers) {
      const name = sticker.name.toLowerCase();
      const tags = sticker.tags.map((t) => t.toLowerCase());
      let score = 0;
      if (name.startsWith(q)) score = 3;
      else if (tags.some((t) => t.startsWith(q))) score = 2;
      else if (name.includes(q) || tags.some((t) => t.includes(q)) || pack.name.toLowerCase().includes(q)) score = 1;
      if (score) scored.push({ sticker, score });
    }
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.sticker);
}

/** What a sticker message stores: the sticker's id, and its name for anywhere the art can't be found. */
/** A space's uploaded sticker in the picker's shape. */
export function fromSpaceSticker(s: { id: string; serverId: string; name: string; tags: string[]; url: string }): Sticker {
  return { id: s.id, packId: `space:${s.serverId}`, name: s.name, tags: s.tags, format: "image", url: s.url, fallbackUrl: null, poster: 0, serverId: s.serverId };
}

export function stickerAttachment(sticker: Sticker): MessageAttachmentPayload {
  return { url: sticker.id, type: "sticker", name: sticker.name };
}

/** A link to the sticker as an image (its animated WebP), else to its Lottie file. */
export function stickerImageLink(sticker: Sticker): string {
  const path = sticker.fallbackUrl ?? sticker.url;
  return typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
}

/* --------------------------------------------------------- sticker data */

const dataCache = new Map<string, Promise<string>>();

/** The sticker's Lottie JSON, fetched once and shared by every player. */
export function loadStickerData(sticker: Sticker): Promise<string> {
  let pending = dataCache.get(sticker.url);
  if (!pending) {
    pending = fetch(sticker.url).then((res) => {
      if (!res.ok) throw new Error(`Sticker ${sticker.id} failed to load (${res.status})`);
      return res.text();
    });
    // A failed fetch shouldn't stick: the next player to ask tries again.
    pending.catch(() => dataCache.delete(sticker.url));
    dataCache.set(sticker.url, pending);
  }
  return pending;
}

/* ----------------------------------------------- favourites and recents */

const FAVOURITES_KEY = "disband:sticker-favourites";
const RECENT_KEY = "disband:sticker-recent";
const RECENT_MAX = 12;

interface StickerPrefs {
  favourites: string[];
  recent: string[];
}

const EMPTY_PREFS: StickerPrefs = { favourites: [], recent: [] };
let prefs: StickerPrefs | null = null;
const prefListeners = new Set<() => void>();

function readIds(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Private mode or storage full: the list still works for this visit.
  }
}

function currentPrefs(): StickerPrefs {
  if (!prefs) prefs = { favourites: readIds(FAVOURITES_KEY), recent: readIds(RECENT_KEY) };
  return prefs;
}

function setPrefs(next: StickerPrefs) {
  prefs = next;
  writeIds(FAVOURITES_KEY, next.favourites);
  writeIds(RECENT_KEY, next.recent);
  prefListeners.forEach((l) => l());
}

function subscribePrefs(listener: () => void) {
  prefListeners.add(listener);
  // Another tab changed them.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== FAVOURITES_KEY && e.key !== RECENT_KEY) return;
    prefs = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    prefListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Favourite and recently sent stickers, kept in this browser. */
export function useStickerPrefs(): StickerPrefs {
  return useSyncExternalStore(subscribePrefs, currentPrefs, () => EMPTY_PREFS);
}

export function toggleFavouriteSticker(id: string) {
  const p = currentPrefs();
  const favourites = p.favourites.includes(id) ? p.favourites.filter((f) => f !== id) : [id, ...p.favourites];
  setPrefs({ ...p, favourites });
}

export function recordStickerUse(id: string) {
  const p = currentPrefs();
  setPrefs({ ...p, recent: [id, ...p.recent.filter((r) => r !== id)].slice(0, RECENT_MAX) });
}
