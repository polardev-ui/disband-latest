"use client";

import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { IconClose, IconTimer } from "@/components/icons";
import { displayName } from "@/lib/utils";
import type { Profile } from "@/lib/supabase/types";

/// Matches the ceiling enforced by `timeout_server_member` in migration 0084.
const MAX_SECONDS = 2_419_200; // 28 days

const PRESETS: { label: string; seconds: number }[] = [
  { label: "60 secs", seconds: 60 },
  { label: "5 mins", seconds: 300 },
  { label: "10 mins", seconds: 600 },
  { label: "1 hour", seconds: 3600 },
  { label: "1 day", seconds: 86_400 },
  { label: "1 week", seconds: 604_800 },
];

const UNITS: { id: string; label: string; seconds: number }[] = [
  { id: "minutes", label: "Minutes", seconds: 60 },
  { id: "hours", label: "Hours", seconds: 3600 },
  { id: "days", label: "Days", seconds: 86_400 },
];

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const parts: string[] = [];
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (mins) parts.push(`${mins} minute${mins === 1 ? "" : "s"}`);
  return parts.join(" ");
}

interface TimeoutModalProps {
  open: boolean;
  profile: Profile | null;
  onClose: () => void;
  onSubmit: (seconds: number, reason: string) => Promise<string | null>;
}

export function TimeoutModal({ open, profile, onClose, onSubmit }: TimeoutModalProps) {
  const [preset, setPreset] = useState<number | null>(600);
  const [amount, setAmount] = useState("30");
  const [unit, setUnit] = useState(UNITS[0]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset to a sane default every time the dialog is opened for someone new,
  // so a previous target's custom duration is never applied by accident.
  useEffect(() => {
    if (!open) return;
    setPreset(600);
    setAmount("30");
    setUnit(UNITS[0]);
    setReason("");
    setError(null);
    setBusy(false);
  }, [open, profile?.id]);

  const customSeconds = useMemo(() => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.floor(n * unit.seconds);
  }, [amount, unit]);

  const seconds = preset ?? customSeconds;
  const tooLong = seconds !== null && seconds > MAX_SECONDS;
  const valid = seconds !== null && seconds >= 1 && !tooLong;

  const expiresAt = useMemo(() => {
    if (!valid || seconds === null) return null;
    return new Date(Date.now() + seconds * 1000);
  }, [valid, seconds]);

  if (!open || !profile) return null;

  const submit = async () => {
    if (!valid || seconds === null || busy) return;
    setBusy(true);
    setError(null);
    const err = await onSubmit(seconds, reason.trim());
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={busy ? undefined : onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Time out ${displayName(profile)}`}
        className="relative w-full max-w-md rounded-lg bg-bg-primary p-6 shadow-2xl"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          disabled={busy}
          className="absolute right-4 top-4 text-text-muted transition-colors hover:text-text-normal"
        >
          <IconClose size={18} />
        </button>

        <div className="flex items-center gap-3">
          <Avatar profile={profile} size="md" />
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-text-normal">
              <IconTimer size={18} />
              Time out
            </h2>
            <p className="truncate text-sm text-text-muted">{displayName(profile)}</p>
          </div>
        </div>

        <p className="mt-4 text-sm text-text-muted">
          They stay in the server but cannot send messages, react, or speak until the
          timeout expires.
        </p>

        <fieldset className="mt-4">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Duration
          </legend>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.seconds}
                type="button"
                aria-pressed={preset === p.seconds}
                onClick={() => setPreset(p.seconds)}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  preset === p.seconds
                    ? "bg-brand text-white"
                    : "bg-bg-secondary text-text-normal hover:bg-interactive-hover"
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={preset === null}
              onClick={() => setPreset(null)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                preset === null
                  ? "bg-brand text-white"
                  : "bg-bg-secondary text-text-normal hover:bg-interactive-hover"
              }`}
            >
              Custom
            </button>
          </div>

          {preset === null && (
            <div className="mt-3 flex gap-2">
              <input
                type="number"
                min={1}
                value={amount}
                autoFocus
                onChange={(e) => setAmount(e.target.value)}
                aria-label="Timeout length"
                className="w-28 rounded-md bg-bg-secondary px-3 py-2 text-sm text-text-normal outline-none focus:ring-2 focus:ring-brand"
              />
              <select
                value={unit.id}
                onChange={(e) => setUnit(UNITS.find((u) => u.id === e.target.value) ?? UNITS[0])}
                aria-label="Timeout unit"
                className="flex-1 rounded-md bg-bg-secondary px-3 py-2 text-sm text-text-normal outline-none focus:ring-2 focus:ring-brand"
              >
                {UNITS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </fieldset>

        <label className="mt-4 block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-text-muted">
            Reason <span className="normal-case text-text-muted">(optional)</span>
          </span>
          <input
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Shown in the audit log"
            className="w-full rounded-md bg-bg-secondary px-3 py-2 text-sm text-text-normal outline-none placeholder:text-text-muted focus:ring-2 focus:ring-brand"
          />
        </label>

        <div className="mt-4 rounded-md border border-divider bg-bg-secondary px-3 py-2 text-sm">
          {tooLong ? (
            <span className="text-status-dnd">Timeouts cannot be longer than 28 days.</span>
          ) : valid && expiresAt ? (
            <span className="text-text-muted">
              Muted for{" "}
              <span className="font-medium text-text-normal">{formatDuration(seconds!)}</span>, until{" "}
              <span className="font-medium text-text-normal">
                {expiresAt.toLocaleString(undefined, {
                  weekday: "short",
                  hour: "numeric",
                  minute: "2-digit",
                  month: "short",
                  day: "numeric",
                })}
              </span>
              .
            </span>
          ) : (
            <span className="text-status-dnd">Enter a duration of at least 1 minute.</span>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-status-dnd">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md px-4 py-2 text-sm text-text-normal transition-colors hover:underline disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!valid || busy}
            className="rounded-md bg-status-dnd px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Timing out…" : "Time out"}
          </button>
        </div>
      </div>
    </div>
  );
}
