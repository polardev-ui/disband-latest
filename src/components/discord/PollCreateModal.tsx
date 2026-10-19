"use client";

import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { usePresence } from "@/hooks/usePresence";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createPoll } from "@/lib/poll";
import { IconClose, IconPlus } from "@/components/icons";

interface PollCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (pollId: string) => void;
}

const MAX_OPTIONS = 10;

export function PollCreateModal({ open, onClose, onCreated }: PollCreateModalProps) {
  const [mounted, setMounted] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setQuestion("");
    setOptions(["", ""]);
    setCreating(false);
    setError(null);
  }, [open]);

  useOverlayDismiss(onClose, open);
  const { mounted: pollMounted, exiting } = usePresence(open);

  if (!pollMounted || !mounted) return null;

  const validOptions = options.map((o) => o.trim()).filter(Boolean);
  const canCreate = question.trim().length > 0 && validOptions.length >= 2 && !creating;

  function updateOption(i: number, value: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }

  async function create() {
    if (!canCreate) return;
    setCreating(true);
    setError(null);
    try {
      const poll = await createPoll(question.trim(), validOptions);
      onCreated(poll.id);
    } catch {
      setError("Could not create the poll. Try again.");
      setCreating(false);
    }
  }

  const label = "mb-2 block text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-header-secondary";
  const field =
    "h-10 w-full rounded-[3px] border border-transparent bg-bg-tertiary px-2.5 text-[16px] text-text-normal outline-none placeholder:text-text-muted/80 focus:border-[#00a8fc]";

  return createPortal(
    <div
      className={`fixed inset-0 z-[130] flex items-center justify-center bg-black/85 p-4 overlay-fade${exiting ? " overlay-fade-out" : ""}`}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create a Poll"
        className={`classic-modal${exiting ? " modal-pop-out" : ""} flex max-h-[calc(100dvh-32px)] w-full max-w-[480px] flex-col overflow-hidden rounded-lg bg-bg-primary shadow-[var(--elevation-high)]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h2 className="text-[20px] font-semibold leading-6 text-header-primary">Create a Poll</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-interactive-normal hover:text-interactive-active">
            <IconClose size={22} />
          </button>
        </div>

        <div className="channel-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-3">
          <label className="block">
            <span className={label}>Question</span>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What question do you want to ask?"
              maxLength={200}
              autoFocus
              className={field}
            />
          </label>

          <p className={`${label} mt-6`}>Answers</p>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="group relative">
                <input
                  value={opt}
                  onChange={(e) => updateOption(i, e.target.value)}
                  placeholder="Type your answer"
                  aria-label={`Answer ${i + 1}`}
                  maxLength={100}
                  className={`${field} pr-10`}
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label={`Remove answer ${i + 1}`}
                    className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-interactive-normal opacity-0 transition-opacity hover:text-status-dnd focus:opacity-100 group-hover:opacity-100"
                  >
                    <IconClose size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {options.length < MAX_OPTIONS && (
            <button
              type="button"
              onClick={() => setOptions((prev) => [...prev, ""])}
              className="mt-2 flex h-10 w-full items-center gap-2 rounded-[3px] border border-dashed border-interactive-normal/40 px-2.5 text-[16px] text-header-secondary transition-colors hover:border-interactive-normal hover:text-header-primary"
            >
              <IconPlus size={16} />
              Add another answer
            </button>
          )}

          {error && <p className="mt-3 text-[14px] text-status-dnd">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 bg-bg-secondary p-4">
          <button type="button" onClick={onClose} className="h-[38px] px-4 text-[14px] font-medium text-white hover:underline">
            Cancel
          </button>
          <button
            type="button"
            disabled={!canCreate}
            onClick={() => void create()}
            className="h-[38px] min-w-[96px] rounded-[3px] bg-brand px-4 text-[14px] font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? "Posting…" : "Post"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
