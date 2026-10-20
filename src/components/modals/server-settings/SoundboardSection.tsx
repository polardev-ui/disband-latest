"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { deleteServerSound, fetchServerSounds, uploadServerSound } from "@/lib/server-sounds";
import type { ServerSound } from "@/lib/supabase/types";
import { IconMusic, IconTrash } from "@/components/icons";
import { ConfirmDialog, DropZone, EmptyState, FieldLabel, InlineError, SettingsSection, SlotMeter, btn, enterStyle, iconBtnDanger } from "./ui";
import type { SectionProps } from "./types";

const MAX_SOUNDS = 15;
const MAX_BYTES = 10 * 1024 * 1024;

export function SoundboardSection({ server, isOwner }: SectionProps) {
  const { user } = useApp();
  const [sounds, setSounds] = useState<ServerSound[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ServerSound | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let live = true;
    setLoaded(false);
    void fetchServerSounds(server.id).then((list) => {
      if (!live) return;
      setSounds(list);
      setLoaded(true);
    });
    return () => {
      live = false;
      audioRef.current?.pause();
    };
  }, [server.id]);

  function play(sound: ServerSound) {
    const current = audioRef.current;
    if (current) {
      current.pause();
      current.currentTime = 0;
    }
    if (playingId === sound.id) {
      setPlayingId(null);
      return;
    }
    const audio = new Audio(sound.url);
    audioRef.current = audio;
    audio.onended = () => setPlayingId((id) => (id === sound.id ? null : id));
    setPlayingId(sound.id);
    void audio.play().catch(() => setPlayingId(null));
  }

  function pick(f: File) {
    if (!f.type.startsWith("audio/")) {
      setError("That file isn't audio. MP3, OGG, WAV or M4A work.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("Sounds can be up to 10 MB.");
      return;
    }
    setError(null);
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, "").slice(0, 32));
  }

  async function add() {
    if (!file || !name.trim() || !emoji.trim() || !user) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadServerSound({
        file,
        name: name.trim(),
        emoji: emoji.trim(),
        serverId: server.id,
        userId: user.id,
        currentCount: sounds.length,
      });
      if (!uploaded) {
        setError("That sound couldn't be added. Check it's under 10 MB and try again.");
        return;
      }
      setSounds((prev) => [uploaded, ...prev]);
      setFile(null);
      setName("");
      setEmoji("");
    } finally {
      setUploading(false);
    }
  }

  const full = sounds.length >= MAX_SOUNDS;

  return (
    <div className="pb-10">
      <SettingsSection title="Slots">
        <SlotMeter used={sounds.length} limit={MAX_SOUNDS} label="Sounds" />
      </SettingsSection>

      {isOwner && !full && (
        <SettingsSection title="Add a sound" description="Keep it short: a few seconds plays best. Every sound gets an emoji so it's easy to spot on the board.">
          <div className="space-y-4 px-5 py-4">
            {file ? (
              <div className="view-enter flex items-center gap-3 rounded-lg bg-bg-tertiary px-4 py-3">
                <IconMusic size={18} className="shrink-0 text-brand" />
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-text-normal">{file.name}</span>
                <span className="shrink-0 text-[12px] tabular-nums text-text-muted">{(file.size / 1024).toFixed(0)} KB</span>
                <button type="button" onClick={() => setFile(null)} className="shrink-0 text-[12.5px] text-text-muted hover:text-text-normal">
                  Change
                </button>
              </div>
            ) : (
              <DropZone accept="audio/*" onPick={pick} title="Drop an audio file" hint="MP3, OGG, WAV or M4A · up to 10 MB" />
            )}
            <div className="grid gap-3 sm:grid-cols-[1fr_96px]">
              <div>
                <FieldLabel htmlFor="sound-name" aside={`${name.length}/32`}>Name</FieldLabel>
                <input
                  id="sound-name"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 32))}
                  placeholder="Airhorn"
                  className="h-10 w-full rounded-[3px] border border-transparent bg-bg-tertiary px-3.5 text-[14px] text-text-normal outline-none placeholder:text-text-muted/70 focus:border-[#00a8fc]"
                />
              </div>
              <div>
                <FieldLabel htmlFor="sound-emoji">Emoji</FieldLabel>
                <input
                  id="sound-emoji"
                  value={emoji}
                  onChange={(e) => setEmoji(Array.from(e.target.value).slice(-4).join(""))}
                  placeholder="📣"
                  className="h-10 w-full rounded-[3px] border border-transparent bg-bg-tertiary px-3 text-center text-[20px] text-text-normal outline-none placeholder:opacity-50 focus:border-[#00a8fc]"
                />
              </div>
            </div>
            <button type="button" onClick={() => void add()} disabled={!file || !name.trim() || !emoji.trim() || uploading} className={btn.primary}>
              {uploading ? "Uploading…" : "Add sound"}
            </button>
          </div>
        </SettingsSection>
      )}

      <InlineError>{error}</InlineError>

      <section className="mt-8">
        <h3 className="mb-3 text-[14.5px] font-semibold text-text-normal">
          Board <span className="font-normal text-text-muted">· {sounds.length}</span>
        </h3>
        {loaded && sounds.length === 0 ? (
          <div className="rounded-lg bg-bg-secondary">
            <EmptyState icon={<IconMusic size={20} />} title="No sounds yet" body="Add one above and members can play it in voice." />
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {sounds.map((s, i) => {
              const playing = playingId === s.id;
              return (
                <li
                  key={s.id}
                  className={`view-enter flex items-center gap-3 rounded-[14px] border bg-bg-secondary px-3 py-2.5 transition-colors ${
                    playing ? "border-brand/60" : "border-divider"
                  }`}
                  style={enterStyle(i)}
                >
                  <button
                    type="button"
                    onClick={() => play(s)}
                    aria-label={playing ? `Stop ${s.name}` : `Play ${s.name}`}
                    className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] text-[22px] transition-[background-color,transform] duration-150 active:scale-95 ${
                      playing ? "bg-brand/18" : "bg-bg-accent hover:bg-interactive-hover"
                    }`}
                  >
                    <span className={playing ? "animate-pulse" : ""}>{s.emoji}</span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-text-normal">{s.name}</p>
                    <p className="text-[12px] text-text-muted">{playing ? "Playing…" : "Tap to preview"}</p>
                  </div>
                  {isOwner && (
                    <button type="button" onClick={() => setRemoving(s)} className={iconBtnDanger} aria-label={`Remove ${s.name}`} title="Remove">
                      <IconTrash size={15} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={!!removing}
        title={removing ? `Remove ${removing.name}?` : ""}
        body="It comes off the board for everyone."
        confirmLabel="Remove sound"
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          await deleteServerSound(removing);
          setSounds((prev) => prev.filter((x) => x.id !== removing.id));
          setRemoving(null);
        }}
      />
    </div>
  );
}
