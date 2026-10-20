"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Avatar } from "@/components/ui/Avatar";
import { IconLock } from "@/components/icons";
import { displayName } from "@/lib/utils";
import { ConfirmDialog, EmptyState, InlineError, SearchField, enterStyle } from "./ui";
import type { SectionProps } from "./types";

export function BansSection(_props: SectionProps) {
  const { serverBans, unbanMember } = useApp();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lifting, setLifting] = useState<{ userId: string; name: string } | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return serverBans;
    return serverBans.filter((b) =>
      `${b.profile ? displayName(b.profile) : ""} ${b.profile?.username ?? ""} ${b.reason ?? ""}`.toLowerCase().includes(q),
    );
  }, [serverBans, query]);

  return (
    <div className="pb-10">
      {serverBans.length > 5 && (
        <div className="mb-4">
          <SearchField value={query} onChange={setQuery} placeholder="Search bans" label="Search bans" />
        </div>
      )}
      <InlineError>{error}</InlineError>
      <div className="mt-3 overflow-hidden rounded-lg bg-bg-secondary">
        {shown.length === 0 ? (
          <EmptyState
            icon={<IconLock size={20} />}
            title={serverBans.length === 0 ? "Nobody is banned" : "No bans match that"}
            body={serverBans.length === 0 ? "When you ban someone from Members, they'll appear here." : undefined}
          />
        ) : (
          <ul>
            {shown.map((b, i) => {
              const name = b.profile ? displayName(b.profile) : "Banned user";
              return (
                <li key={b.user_id} className="view-enter flex items-center gap-3 border-b border-divider px-4 py-3 last:border-b-0" style={enterStyle(i)}>
                  <Avatar profile={b.profile ?? { display_name: name }} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-text-normal">{name}</p>
                    <p className="truncate text-[12.5px] text-text-muted">
                      {b.reason ? b.reason : "No reason given"}
                      {b.created_at ? ` · ${new Date(b.created_at).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLifting({ userId: b.user_id, name })}
                    className="inline-flex h-8 shrink-0 items-center rounded-[8px] border border-divider px-3 text-[13px] font-medium text-text-normal transition-colors hover:bg-interactive-hover"
                  >
                    Lift ban
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!lifting}
        tone="primary"
        title={lifting ? `Lift ${lifting.name}'s ban?` : ""}
        body="They'll be able to rejoin with an invite. They don't come back automatically."
        confirmLabel="Lift ban"
        onCancel={() => setLifting(null)}
        onConfirm={async () => {
          if (!lifting) return;
          setError(null);
          const err = await unbanMember(lifting.userId);
          if (err) setError(err);
          setLifting(null);
        }}
      />
    </div>
  );
}
