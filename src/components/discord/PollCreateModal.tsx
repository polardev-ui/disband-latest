"use client";

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

  if (!open || !mounted) return null;

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

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-divider bg-bg-secondary p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-normal">Create a poll</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-text-muted hover:bg-interactive-hover hover:text-text-normal"
          >
            <IconClose size={18} />
          </button>
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase text-text-muted">Question</span>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What&apos;s your favorite color?"
            maxLength={200}
            autoFocus
            className="w-full rounded-md border border-black/20 bg-bg-accent px-3 py-2 text-sm text-text-normal placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40"
          />
        </label>

        <div className="mt-3 space-y-2">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={opt}
                onChange={(e) => updateOption(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                maxLength={100}
                className="flex-1 rounded-md border border-black/20 bg-bg-accent px-3 py-2 text-sm text-text-normal placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40"
              />
              {options.length > 2 && (
                <button
                  type="button"
                  onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label="Remove option"
                  className="shrink-0 rounded p-1.5 text-text-muted hover:bg-interactive-hover hover:text-status-dnd"
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
            className="mt-2 flex items-center gap-1 rounded px-1 py-1 text-xs font-medium text-brand hover:underline"
          >
            <IconPlus size={14} />
            Add option
          </button>
        )}

        {error && <p className="mt-2 text-xs text-status-dnd">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-sm font-medium text-text-muted hover:bg-interactive-hover hover:text-text-normal"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canCreate}
            onClick={() => void create()}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create poll"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
