"use client";

import { LoadingDots } from "@/components/ui/LoadingDots";

import { useEffect, useMemo, useState } from "react";
import { SolidStickerIcon } from "@/components/icons/SolidIcons";
import { IconTrash } from "@/components/icons";
import { useApp } from "@/contexts/AppContext";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { refreshSpace } from "@/lib/expressions";
import { safeImageUrl } from "@/lib/safe-url";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ConfirmDialog, DropZone, EmptyState, FieldLabel, InlineError, SettingsSection, SlotMeter, btn, enterStyle } from "./ui";
import type { SectionProps } from "./types";
import { useI18n } from "@/contexts/I18nContext";

/*
 A space's stickers: images members can send from the sticker picker, in any
 chat. PNG, APNG, GIF, WebP or JPEG, transparency and animation kept as they
 are. Same permission as custom emoji.
*/

interface SpaceStickerRow {
  id: string;
  name: string;
  tags: string;
  url: string;
  format: string;
  uploader_id: string | null;
}

const STICKER_TYPES = "image/png,image/apng,image/gif,image/webp,image/jpeg";
const MAX_BYTES = 2 * 1024 * 1024;
const LIMIT = 60;

/** The stored format; a PNG with an animation control chunk is an APNG. */
async function stickerFormat(file: File): Promise<"png" | "apng" | "gif" | "webp" | "jpeg" | null> {
  const type = file.type.toLowerCase();
  if (type === "image/gif") return "gif";
  if (type === "image/webp") return "webp";
  if (type === "image/jpeg" || type === "image/jpg") return "jpeg";
  if (type === "image/apng") return "apng";
  if (type === "image/png") {
    const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
    for (let i = 8; i < head.length - 4; i++) {
      if (head[i] === 0x61 && head[i + 1] === 0x63 && head[i + 2] === 0x54 && head[i + 3] === 0x4c) return "apng";
    }
    return "png";
  }
  return null;
}

export function StickerSection({ server }: SectionProps) {
  const { t } = useI18n();
  const { user } = useApp();
  const { upload } = useMediaUpload();
  const [stickers, setStickers] = useState<SpaceStickerRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<SpaceStickerRow | null>(null);

  useEffect(() => {
    let live = true;
    setLoaded(false);
    void getSupabaseClient()
      .from("server_stickers")
      .select("id, name, tags, url, format, uploader_id")
      .eq("server_id", server.id)
      .order("created_at")
      .then(({ data, error: dbErr }) => {
        if (!live) return;
        // The table arrives with migration 0283.
        setSetupNeeded(!!dbErr && /server_stickers|relation|schema cache/i.test(dbErr.message));
        setStickers((data as SpaceStickerRow[] | null) ?? []);
        setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, [server.id]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const full = stickers.length >= LIMIT;
  const cleanName = name.trim().replace(/\s+/g, " ");
  const nameTaken = useMemo(
    () => stickers.some((s) => s.name.trim().toLowerCase() === cleanName.toLowerCase()),
    [stickers, cleanName],
  );

  function pick(f: File) {
    if (!f.type.startsWith("image/")) {
      setError(t("Stickers need to be an image: PNG, APNG, GIF, WebP or JPEG."));
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(t("Stickers can be up to 2 MB."));
      return;
    }
    setError(null);
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 30));
  }

  async function add() {
    if (!file || !user) return;
    if (cleanName.length < 2 || cleanName.length > 30) {
      setError(t("Names are 2 to 30 characters."));
      return;
    }
    if (nameTaken) {
      setError(t("There's already a sticker called {name} here.", { name: cleanName }));
      return;
    }
    const format = await stickerFormat(file);
    if (!format) {
      setError(t("Stickers need to be an image: PNG, APNG, GIF, WebP or JPEG."));
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const res = await upload(file);
      if (!res) {
        setError(t("The upload didn't go through. Try again."));
        return;
      }
      const { data, error: dbErr } = await getSupabaseClient()
        .from("server_stickers")
        .insert({
          server_id: server.id,
          name: cleanName,
          tags: tags.trim().slice(0, 200),
          url: res.url,
          format,
          size: file.size,
          uploader_id: user.id,
        })
        .select("id, name, tags, url, format, uploader_id")
        .single();
      if (dbErr) {
        setError(dbErr.message);
        return;
      }
      setStickers((prev) => [...prev, data as SpaceStickerRow]);
      refreshSpace(server.id);
      setFile(null);
      setName("");
      setTags("");
    } finally {
      setUploading(false);
    }
  }

  if (setupNeeded) {
    return (
      <SettingsSection title={t("Stickers")}>
        <p className="px-5 py-4 text-[14px] text-text-muted">
          {t("Space stickers need database migration 0283 (space stickers and shared emoji), which hasn't been applied yet.")}
        </p>
      </SettingsSection>
    );
  }

  return (
    <div className="pb-10">
      <SettingsSection title={t("Slots")}>
        <SlotMeter used={stickers.length} limit={LIMIT} label={t("Stickers")} />
      </SettingsSection>

      {!full && (
        <SettingsSection
          title={t("Add a sticker")}
          description={t("Any image: PNG, APNG, GIF, WebP or JPEG, up to 2 MB. Transparent backgrounds stay transparent and GIFs animate. Square, around 320 × 320, looks best.")}
        >
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-[180px_1fr]">
            {preview ? (
              <div className="view-enter flex flex-col items-center justify-center rounded-lg bg-[conic-gradient(var(--bg-tertiary)_25%,var(--bg-secondary)_0_50%,var(--bg-tertiary)_0_75%,var(--bg-secondary)_0)] bg-[length:16px_16px] p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="" className="h-32 w-32 object-contain" />
                <button type="button" onClick={() => setFile(null)} className="mt-2 rounded bg-bg-floating/80 px-2 text-[12px] text-text-muted hover:text-text-normal">
                  {t("Choose another")}
                </button>
              </div>
            ) : (
              <DropZone accept={STICKER_TYPES} onPick={pick} title={t("Drop an image")} hint="or click to browse" />
            )}
            <div className="flex flex-col justify-end gap-3">
              <div>
                <FieldLabel htmlFor="sticker-name" aside={`${name.length}/30`}>{t("Name")}</FieldLabel>
                <input
                  id="sticker-name"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 30))}
                  placeholder="Happy dance"
                  className="h-10 w-full rounded-md border border-border-subtle bg-bg-tertiary px-3 text-[14px] text-text-normal outline-none placeholder:text-text-muted/70 focus:border-brand"
                />
                {nameTaken && cleanName && <p className="mt-1.5 text-[12px] text-status-dnd">{t("That name is taken here.")}</p>}
              </div>
              <div>
                <FieldLabel htmlFor="sticker-tags">{t("Search words")}</FieldLabel>
                <input
                  id="sticker-tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value.slice(0, 200))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void add();
                  }}
                  placeholder="dance happy yay 🎉"
                  className="h-10 w-full rounded-md border border-border-subtle bg-bg-tertiary px-3 text-[14px] text-text-normal outline-none placeholder:text-text-muted/70 focus:border-brand"
                />
              </div>
              <button type="button" onClick={() => void add()} disabled={!file || cleanName.length < 2 || uploading || nameTaken} className={`${btn.primary} self-start`}>
                {uploading ? <LoadingDots size={6} className="mx-auto" /> : t("Add sticker")}
              </button>
            </div>
          </div>
        </SettingsSection>
      )}

      <InlineError>{error}</InlineError>

      <section className="mt-8">
        <h3 className="mb-3 text-[14.5px] font-semibold text-text-normal">
          {t("Stickers")}{" "}<span className="font-normal text-text-muted">· {stickers.length}</span>
        </h3>
        {!loaded ? (
          <LoadingDots size={6} />
        ) : stickers.length === 0 ? (
          <div className="rounded-lg bg-bg-secondary">
            <EmptyState icon={<SolidStickerIcon size={20} />} title={t("No stickers yet")} body="Add one above and everyone here can send it, in any chat." />
          </div>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
            {stickers.map((s, i) => {
              const src = safeImageUrl(s.url);
              return (
                <li
                  key={s.id}
                  className="view-enter group relative flex flex-col items-center rounded-xl border border-border-subtle bg-surface-raised px-3 pb-3 pt-4 transition-colors hover:border-text-muted/40"
                  style={enterStyle(i)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {src && <img src={src} alt={s.name} className="h-24 w-24 object-contain" loading="lazy" />}
                  <span className="mt-2 w-full truncate text-center text-[13px] font-medium text-text-normal">{s.name}</span>
                  <span className="w-full truncate text-center text-[12px] text-text-muted">{s.format.toUpperCase()}{s.tags ? ` · ${s.tags}` : ""}</span>
                  <button
                    type="button"
                    onClick={() => setRemoving(s)}
                    aria-label={t("Delete {name}", { name: s.name })}
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-xl text-text-muted opacity-0 transition-[opacity,background-color,color] hover:bg-status-dnd/12 hover:text-status-dnd focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <IconTrash size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={!!removing}
        title={removing ? t("Delete {name}?", { name: removing.name }) : ""}
        body="Messages that sent it will show it as unavailable."
        confirmLabel={t("Delete sticker")}
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          const { error: dbErr } = await getSupabaseClient().from("server_stickers").delete().eq("id", removing.id);
          if (dbErr) setError(dbErr.message);
          else {
            setStickers((prev) => prev.filter((x) => x.id !== removing.id));
            refreshSpace(server.id);
          }
          setRemoving(null);
        }}
      />
    </div>
  );
}
