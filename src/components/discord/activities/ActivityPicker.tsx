"use client";

import { useState } from "react";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { PublicActivityLobby } from "./PublicActivityLobby";
import { ActivityModal } from "./ActivityModal";
import {
  createActivity,
  ACTIVITIES,
  type ActivityKind,
} from "@/lib/activities";
import { IconClose } from "@/components/icons";
import { ActivityGlyph } from "./ActivityGlyph";

const GENRES = ["All", "Versus", "Puzzle", "Party", "Quiz"] as const;

interface ActivityPickerProps {
  open: boolean;
  busyKind: ActivityKind | null;
  error: string | null;
  onClose: () => void;
  onPick: (kind: ActivityKind) => void;
}

export function ActivityPicker({
  open,
  busyKind,
  error,
  onClose,
  onPick,
}: ActivityPickerProps) {
  const [mode, setMode] = useState<"chat" | "public">("chat");
  const [publicBusy, setPublicBusy] = useState<ActivityKind | null>(null);
  const [publicError, setPublicError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [genre, setGenre] = useState<(typeof GENRES)[number]>("All");
  const [highlight, setHighlight] = useState<ActivityKind | null>(null);
  useOverlayDismiss(onClose, open && !selectedId);
  async function pick(kind: ActivityKind) {
    if (mode === "chat") {
      onPick(kind);
      return;
    }
    setPublicBusy(kind);
    setPublicError(null);
    try {
      const activity = await createActivity(
        kind,
        "public",
        "00000000-0000-0000-0000-000000000000",
      );
      setSelectedId(activity.id);
    } catch (error) {
      setPublicError(
        error instanceof Error
          ? error.message
          : "Couldn’t start a public game.",
      );
    } finally {
      setPublicBusy(null);
    }
  }
  if (!open) return null;

  const shelf = ACTIVITIES.filter((a) => genre === "All" || a.genre === genre);
  const featured = shelf.find((a) => a.kind === highlight) ?? shelf[0];
  const busyFor = (kind: ActivityKind) => (mode === "public" ? publicBusy : busyKind) === kind;
  const anyBusy = busyKind !== null || publicBusy !== null;

  return (
    <>
      <div className="fixed inset-0 z-[70]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="Games"
        className="absolute bottom-full right-0 z-[71] mb-2 flex max-h-[min(640px,80dvh)] w-[600px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl bg-bg-primary shadow-[var(--elevation-high)]"
      >
        <div className="flex items-center gap-3 px-4 pb-3 pt-4">
          <h3 className="flex-1 text-[20px] font-bold leading-6 text-header-primary">Games</h3>
          <div className="flex rounded-lg bg-bg-tertiary p-0.5" role="group" aria-label="Who can join">
            {(["chat", "public"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                className={`rounded-md px-3 py-1.5 text-[13px] font-semibold ${mode === value ? "bg-bg-accent text-header-primary" : "text-interactive-normal hover:text-interactive-active"}`}
              >
                {value === "chat" ? "This chat" : "Public"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close games"
            className="flex h-8 w-8 items-center justify-center rounded-md text-interactive-normal transition-colors hover:bg-interactive-hover hover:text-interactive-active"
          >
            <IconClose size={18} />
          </button>
        </div>

        <div className="flex gap-1.5 px-4 pb-3" role="group" aria-label="Genre">
          {GENRES.map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={genre === g}
              onClick={() => setGenre(g)}
              className={`rounded-full px-3 py-1 text-[13px] font-semibold transition-colors ${genre === g ? "bg-header-primary text-bg-primary" : "bg-bg-secondary text-interactive-normal hover:text-interactive-active"}`}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="channel-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {featured && (
            <div
              className="relative mb-3 flex items-center gap-4 overflow-hidden rounded-xl p-4"
              style={{ background: `linear-gradient(120deg, color-mix(in srgb, ${featured.accent} 35%, #111214), #111214 75%)` }}
            >
              <ActivityGlyph kind={featured.kind} size={96} radius={22} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/70">{featured.genre} · {featured.players}</p>
                <p className="mt-0.5 text-[22px] font-black leading-7 text-white">{featured.name}</p>
                <p className="mt-1 line-clamp-2 text-[13px] leading-[18px] text-white/80">{featured.description}</p>
                <button
                  type="button"
                  disabled={anyBusy}
                  onClick={() => void pick(featured.kind)}
                  className="mt-3 h-9 rounded-lg bg-white px-5 text-[14px] font-bold text-[#111214] transition-transform hover:scale-[1.03] disabled:opacity-60"
                >
                  {busyFor(featured.kind) ? "Starting…" : mode === "public" ? "Host a public game" : "Play in this chat"}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            {shelf.map((activity) => (
              <button
                key={activity.kind}
                type="button"
                disabled={anyBusy}
                onMouseEnter={() => setHighlight(activity.kind)}
                onFocus={() => setHighlight(activity.kind)}
                onClick={() => void pick(activity.kind)}
                className={`group flex flex-col items-center gap-2 rounded-xl p-3 text-center transition-colors disabled:cursor-wait disabled:opacity-60 ${featured?.kind === activity.kind ? "bg-bg-accent" : "bg-bg-secondary hover:bg-bg-accent"}`}
              >
                <span className="transition-transform group-hover:-translate-y-0.5 group-hover:scale-105">
                  <ActivityGlyph kind={activity.kind} size={64} radius={16} />
                </span>
                <span className="text-[14px] font-bold leading-[18px] text-header-primary">{activity.name}</span>
                <span className="text-[12px] leading-4 text-text-muted">{busyFor(activity.kind) ? "Starting…" : activity.players}</span>
              </button>
            ))}
          </div>

          {mode === "public" && <div className="mt-3"><PublicActivityLobby onOpen={setSelectedId} /></div>}
        </div>

        <div className="border-t border-divider bg-bg-secondary px-4 py-2.5 text-[12px] leading-[18px] text-text-muted">
          {mode === "public"
            ? "Host a public room, or join one. Your chat is never shared."
            : "Games stay open for 24 hours, or until everyone has finished. Results stay in the chat."}
        </div>
        {(error || publicError) && (
          <p className="border-t border-divider px-4 py-2 text-[12px] text-status-dnd" role="alert">
            {publicError ?? error}
          </p>
        )}
      </div>
      <ActivityModal
        activityId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}
