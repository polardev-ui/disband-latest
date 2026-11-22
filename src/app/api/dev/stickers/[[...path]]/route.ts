import { NextResponse } from "next/server";

/**
 * Development-only: local sticker packs for the composer's sticker picker,
 * so unreleased stickers can be tried in real chats before they ship.
 *
 *   GET /api/dev/stickers                  -> { packs: StickerPack[] }
 *   GET /api/dev/stickers/<pack>/<file>    -> a file the pack's pack.json lists
 *
 * Packs are read from the folder in DISBAND_LOCAL_STICKERS, which is set in
 * .env.development.local (only `next dev` loads that file). The folder comes
 * from the environment rather than the code so a production build has no path
 * to trace: no artwork can be bundled into a deployment from here. Anything
 * but the dev server gets a 404.
 */

const CONTENT_TYPES: Record<string, string> = {
  ".json": "application/json",
  ".webp": "image/webp",
  ".png": "image/png",
  ".gif": "image/gif",
};

interface PackFile {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  stickers: {
    id: string;
    name: string;
    tags?: string[];
    lottie: string;
    fallback?: string;
    poster?: number;
  }[];
}

const notFound = () => new NextResponse(null, { status: 404 });

export async function GET(_request: Request, context: { params: Promise<{ path?: string[] }> }) {
  if (process.env.NODE_ENV !== "development") return notFound();
  const configured = process.env.DISBAND_LOCAL_STICKERS;
  if (!configured) return NextResponse.json({ packs: [] });

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const root = path.resolve(/* turbopackIgnore: true */ process.cwd(), configured);
  const segments = (await context.params).path ?? [];

  const readPack = async (dir: string): Promise<PackFile | null> => {
    try {
      const raw = JSON.parse(await fs.readFile(path.join(root, dir, "pack.json"), "utf8")) as PackFile;
      return Array.isArray(raw.stickers) ? raw : null;
    } catch {
      return null;
    }
  };

  if (segments.length === 0) {
    let dirs: string[] = [];
    try {
      dirs = (await fs.readdir(root, { withFileTypes: true }))
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();
    } catch {
      return NextResponse.json({ packs: [] });
    }
    const packs = [];
    for (const dir of dirs) {
      const pack = await readPack(dir);
      if (!pack) continue;
      const file = (rel: string) => `/api/dev/stickers/${encodeURIComponent(dir)}/${rel.split("/").map(encodeURIComponent).join("/")}`;
      packs.push({
        id: pack.id,
        name: pack.name,
        description: pack.description ?? null,
        icon: pack.icon ?? pack.stickers[0]?.id ?? null,
        stickers: pack.stickers.map((s) => ({
          id: s.id,
          packId: pack.id,
          name: s.name,
          tags: s.tags ?? [],
          format: "lottie" as const,
          url: file(s.lottie),
          fallbackUrl: s.fallback ? file(s.fallback) : null,
          poster: s.poster ?? 0,
        })),
      });
    }
    return NextResponse.json({ packs }, { headers: { "Cache-Control": "no-store" } });
  }

  // A file: only ones the pack lists, so nothing else in the folder is served.
  const [dir, ...rest] = segments;
  const rel = rest.join("/");
  const pack = await readPack(dir);
  const listed = pack?.stickers.some((s) => s.lottie === rel || s.fallback === rel);
  const type = CONTENT_TYPES[path.extname(rel).toLowerCase()];
  if (!pack || !listed || !type) return notFound();
  const full = path.resolve(root, dir, rel);
  if (!full.startsWith(root + path.sep)) return notFound();
  try {
    const body = await fs.readFile(full);
    return new NextResponse(new Uint8Array(body), {
      headers: { "Content-Type": type, "Cache-Control": "no-cache" },
    });
  } catch {
    return notFound();
  }
}
