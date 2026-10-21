"use client";

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { ConfirmDialog, InlineError, btn } from "./ui";
import type { SectionProps } from "./types";

export function DangerSection({ server, onDeleted }: SectionProps & { onDeleted: () => void }) {
  const { deleteServer } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="pb-10">
      <section className="overflow-hidden rounded-lg border border-status-dnd/30 bg-status-dnd/[0.04]">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div className="min-w-0 max-w-md">
            <p className="text-[14.5px] font-semibold text-text-normal">Delete this space</p>
            <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
              Every channel, message, role, emoji and sound goes with it, and every member loses access. There is no undo.
            </p>
          </div>
          <button type="button" onClick={() => setConfirming(true)} className={btn.danger}>
            Delete space
          </button>
        </div>
      </section>
      <div className="mt-4">
        <InlineError>{error}</InlineError>
      </div>

      <ConfirmDialog
        open={confirming}
        title={`Delete ${server.name}?`}
        body="This permanently removes the space for everyone."
        requireText={server.name}
        confirmLabel="Delete forever"
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          setError(null);
          const err = await deleteServer(server.id);
          setConfirming(false);
          if (err) setError(err);
          else onDeleted();
        }}
      />
    </div>
  );
}
