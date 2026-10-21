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

  return (
    <>
      <div className="fixed inset-0 z-[70]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="Start an activity"
        className="absolute bottom-full right-0 z-[71] mb-2 w-[440px] max-w-[calc(100vw-24px)] overflow-hidden rounded-lg bg-bg-primary shadow-[var(--elevation-high)]"
      >
        <div className="flex items-center justify-between bg-bg-secondary px-4 py-4">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.02em] text-text-muted">
              Play together
            </p>
            <h3 className="text-[20px] font-semibold leading-6 text-header-primary">
              Start an activity
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close activity picker"
            className="flex h-7 w-7 items-center justify-center rounded-[2px] text-interactive-normal transition-colors hover:bg-interactive-hover hover:text-interactive-active"
          >
            <IconClose size={16} />
          </button>
        </div>

        <div
          className="flex gap-2 px-3 pt-3"
          role="group"
          aria-label="Game visibility"
        >
          {(["chat", "public"] as const).map((value) => (
            <button
              key={value}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={`flex-1 rounded-[3px] px-3 py-2 text-[14px] font-medium ${mode === value ? "bg-interactive-selected text-header-primary" : "text-interactive-normal hover:bg-interactive-hover"}`}
            >
              {value === "chat" ? "This chat" : "Public games"}
            </button>
          ))}
        </div>
        <div className="channel-scroll max-h-[50dvh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-2 p-3">
            {ACTIVITIES.map((activity) => {
              const busy =
                (mode === "public" ? publicBusy : busyKind) === activity.kind;
              return (
                <button
                  key={activity.kind}
                  type="button"

                  disabled={busyKind !== null || publicBusy !== null}
                  onClick={() => void pick(activity.kind)}
                  className="flex w-full flex-col items-start gap-3 rounded-[4px] bg-bg-secondary p-3 text-left transition-colors hover:bg-interactive-hover focus-visible:bg-interactive-hover focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
                >
                  <ActivityGlyph kind={activity.kind} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-[14px] font-semibold leading-[18px] text-header-primary">
                        {activity.name}
                      </span>
                      <span className="shrink-0 text-[12px] text-text-muted">
                        {activity.players}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-[16px] text-text-muted">
                      {busy ? "Starting…" : activity.tagline}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {mode === "public" && <PublicActivityLobby onOpen={setSelectedId} />}
        </div>

        <div className="bg-bg-secondary px-4 py-3 text-[12px] leading-[18px] text-text-muted">
          {mode === "public"
            ? "Choose a game to host a public room, or join an open room. Your chat is never shared."
            : "Start a game for this conversation. Everyone here can join from its activity card."}
        </div>
        {(error || publicError) && (
          <p
            className="border-t border-divider px-3.5 py-2 text-[12px] text-status-dnd"
            role="alert"
          >
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
