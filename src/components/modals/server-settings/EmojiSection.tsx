"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { useSubscription } from "@/hooks/useSubscription";
import { catalystLevel, EMOJI_SLOTS_BONUS } from "@/lib/catalysts";
import { safeImageUrl } from "@/lib/safe-url";
import { getSupabaseClient } from "@/lib/supabase/client";
import { IconEmoji, IconTrash } from "@/components/icons";
import { ConfirmDialog, DropZone, EmptyState, FieldLabel, InlineError, SettingsSection, SlotMeter, btn, enterStyle } from "./ui";
import type { SectionProps } from "./types";

interface CustomEmoji {
  id: number;
  name: string;
  url: string;
  uploader_id: string | null;
}

const EMOJI_TYPES = "image/png,image/gif,image/webp,image/jpeg";
const NAME_RE = /^[a-zA-Z0-9_]{2,32}$/;

export function EmojiSection({ server, catalystCount }: SectionProps) {
  const { user } = useApp();
  const { upload } = useMediaUpload();
  const { plan, entitlements } = useSubscription(user?.id);
  const [emoji, setEmoji] = useState<CustomEmoji[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<CustomEmoji | null>(null);

  useEffect(() => {
    let live = true;
    setLoaded(false);
    void getSupabaseClient()
      .from("custom_emoji")
      .select("id, name, url, uploader_id")
      .eq("server_id", server.id)
      .order("name")
      .then(({ data }) => {
        if (!live) return;
        setEmoji((data as CustomEmoji[] | null) ?? []);
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

  // Level 1 is where the bonus starts now (it used to be Level 2).
  const bonus = catalystLevel(catalystCount).level >= 1 ? EMOJI_SLOTS_BONUS : 0;
  const limit = typeof entitlements.customEmojiSlots === "number" ? entitlements.customEmojiSlots + bonus : null;
  const full = limit !== null && emoji.length >= limit;
  const cleanName = name.trim().toLowerCase();
  const nameTaken = useMemo(() => emoji.some((e) => e.name.toLowerCase() === cleanName), [emoji, cleanName]);

  function pick(f: File) {
    if (!f.type.startsWith("image/")) {
      setError("Emoji need to be an image: PNG, GIF, WebP or JPEG.");
      return;
    }
    if (f.size > 1024 * 1024) {
      setError("Emoji can be up to 1 MB.");
      return;
    }
    setError(null);
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 32));
  }

  async function add() {
    if (!file || !user) return;
    if (!NAME_RE.test(cleanName)) {
      setError("Names are 2 to 32 letters, numbers or underscores.");
      return;
    }
    if (nameTaken) {
      setError(`:${cleanName}: is already taken here.`);
      return;
    }
    if (full) {
      setError(`This space is at its ${limit} emoji limit.`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const res = await upload(file);
      if (!res) {
        setError("The upload didn't go through. Try again.");
        return;
      }
      const { data, error: dbErr } = await getSupabaseClient()
        .from("custom_emoji")
        .insert({ server_id: server.id, name: cleanName, url: res.url, uploader_id: user.id })
        .select("id, name, url, uploader_id")
        .single();
      if (dbErr) {
        setError(dbErr.message);
        return;
      }
      setEmoji((prev) => [...prev, data as CustomEmoji].sort((a, b) => a.name.localeCompare(b.name)));
      setFile(null);
      setName("");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="pb-10">
      <SettingsSection title="Slots">
        <SlotMeter used={emoji.length} limit={limit} label="Custom emoji" />
        {bonus > 0 && (
          <p className="border-t border-divider px-5 py-3 text-[12.5px] text-text-muted">
            Includes <span className="font-medium text-brand">+{EMOJI_SLOTS_BONUS}</span> from this space&apos;s Catalyst level.
          </p>
        )}
      </SettingsSection>

      {plan === "free" && limit === 0 ? (
        <SettingsSection title="Add emoji">
          <p className="px-5 py-4 text-[14px] text-text-muted">Custom emoji come with a paid plan, or with Catalyst Level 1 for this space.</p>
        </SettingsSection>
      ) : (
        !full && (
          <SettingsSection title="Add emoji" description="Square images look best. 128 × 128, up to 1 MB. GIFs animate.">
            <div className="grid gap-4 px-5 py-4 sm:grid-cols-[160px_1fr]">
              {preview ? (
                <div className="view-enter flex flex-col items-center justify-center rounded-lg bg-bg-tertiary p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="" className="h-14 w-14 object-contain" />
                  <button type="button" onClick={() => setFile(null)} className="mt-2 text-[12px] text-text-muted hover:text-text-normal">
                    Choose another
                  </button>
                </div>
              ) : (
                <DropZone accept={EMOJI_TYPES} onPick={pick} title="Drop an image" hint="or click to browse" />
              )}
              <div className="flex flex-col justify-end gap-3">
                <div>
                  <FieldLabel htmlFor="emoji-name" aside={`${name.length}/32`}>Name</FieldLabel>
                  <div className="flex h-10 items-center rounded-[3px] border border-transparent bg-bg-tertiary px-3 focus-within:border-brand">
                    <span className="text-text-muted">:</span>
                    <input
                      id="emoji-name"
                      value={name}
                      onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 32))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void add();
                      }}
                      placeholder="party_parrot"
                      className="min-w-0 flex-1 bg-transparent px-0.5 text-[14px] text-text-normal outline-none placeholder:text-text-muted/70"
                    />
                    <span className="text-text-muted">:</span>
                  </div>
                  {nameTaken && cleanName && <p className="mt-1.5 text-[12px] text-status-dnd">That name is taken here.</p>}
                </div>
                <button type="button" onClick={() => void add()} disabled={!file || !cleanName || uploading || nameTaken} className={`${btn.primary} self-start`}>
                  {uploading ? "Uploading…" : "Add emoji"}
                </button>
              </div>
            </div>
          </SettingsSection>
        )
      )}

      <InlineError>{error}</InlineError>

      <section className="mt-8">
        <h3 className="mb-3 text-[14.5px] font-semibold text-text-normal">
          Emoji <span className="font-normal text-text-muted">· {emoji.length}</span>
        </h3>
        {loaded && emoji.length === 0 ? (
          <div className="rounded-lg bg-bg-secondary">
            <EmptyState icon={<IconEmoji size={20} />} title="No custom emoji yet" body="Add one above and everyone here can use it." />
          </div>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2">
            {emoji.map((e, i) => {
              const src = safeImageUrl(e.url);
              return (
                <li
                  key={e.id}
                  className="view-enter group relative flex flex-col items-center rounded-lg bg-bg-secondary px-3 pb-3 pt-4 transition-colors hover:border-text-muted/40"
                  style={enterStyle(i)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {src && <img src={src} alt={`:${e.name}:`} className="h-10 w-10 object-contain" loading="lazy" />}
                  <span className="mt-2 w-full truncate text-center text-[12.5px] text-text-muted">:{e.name}:</span>
                  <button
                    type="button"
                    onClick={() => setRemoving(e)}
                    aria-label={`Delete :${e.name}:`}
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-[8px] text-text-muted opacity-0 transition-[opacity,background-color,color] hover:bg-status-dnd/12 hover:text-status-dnd focus-visible:opacity-100 group-hover:opacity-100"
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
        title={removing ? `Delete :${removing.name}:?` : ""}
        body="It disappears from every message that used it."
        confirmLabel="Delete emoji"
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          const { error: dbErr } = await getSupabaseClient().from("custom_emoji").delete().eq("id", removing.id);
          if (dbErr) setError(dbErr.message);
          else setEmoji((prev) => prev.filter((x) => x.id !== removing.id));
          setRemoving(null);
        }}
      />
    </div>
  );
}
