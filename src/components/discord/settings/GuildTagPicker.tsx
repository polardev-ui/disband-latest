"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clearGuildTag,
  equipGuildTag,
  fetchMyGuildTagOptions,
  type GuildTagOption,
} from "@/lib/guild-tags";
import { primeGuildTag } from "@/lib/guild-tag-store";
import { GuildTagBadge } from "@/components/ui/GuildTag";
import { SettingsSection } from "@/components/discord/settings/SettingsPrimitives";
import { safeImageUrl } from "@/lib/safe-url";
import { serverInitials } from "@/lib/utils";

const ACTION =
  "shrink-0 rounded-[3px] px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:pointer-events-none disabled:opacity-50";

export function GuildTagPicker({ userId }: { userId: string }) {
  const [options, setOptions] = useState<GuildTagOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchMyGuildTagOptions();
    setOptions(result.options);
    setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function wear(option: GuildTagOption) {
    setBusy(option.server_id);
    setError(null);
    const result = await equipGuildTag(option.server_id);
    setBusy(null);
    if (result.error || !result.tag) {
      setError(result.error ?? "Could not wear that guild tag.");
      return;
    }
    primeGuildTag(userId, result.tag);
    setOptions((current) => current.map((item) => ({
      ...item,
      equipped: item.server_id === option.server_id,
    })));
  }

  async function remove() {
    setBusy("clear");
    setError(null);
    const message = await clearGuildTag();
    setBusy(null);
    if (message) {
      setError(message);
      return;
    }
    primeGuildTag(userId, null);
    setOptions((current) => current.map((item) => ({ ...item, equipped: false })));
  }

  return (
    <SettingsSection
      title="Guild tag"
      description="Wear a space's tag next to your name. You can wear one at a time, and wearing is always free — spaces need Catalyst Level 3 to create a tag."
    >
      {loading ? (
        <div className="space-y-1 p-2" aria-hidden>
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center gap-3 rounded-[4px] px-2 py-3">
              <span className="skeleton-glimmer h-8 w-8 shrink-0 rounded-full" />
              <span className="skeleton-glimmer h-3 flex-1 rounded" />
              <span className="skeleton-glimmer h-7 w-16 rounded-[3px]" />
            </div>
          ))}
        </div>
      ) : error && options.length === 0 ? (
        <div className="px-4 py-5">
          <p role="alert" className="text-[14px] leading-5 text-status-dnd">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-2 text-[13px] font-medium text-interactive-normal underline hover:text-interactive-active"
          >
            Try again
          </button>
        </div>
      ) : options.length === 0 ? (
        <div className="px-4 py-5">
          <p className="text-[14px] leading-5 text-text-normal">You&apos;re not in a space with a guild tag yet.</p>
          <p className="mt-1 text-[13px] leading-5 text-text-muted">
            Space owners can create one from Space settings → Guild tag once the space reaches Catalyst Level 3. Then anyone in the space can wear it here.
          </p>
        </div>
      ) : (
        <div>
          {options.map((option) => {
            const icon = safeImageUrl(option.server_icon_url);
            const isBusy = busy === option.server_id || (busy === "clear" && option.equipped);
            return (
              <div
                key={option.server_id}
                className="flex items-center gap-3 border-b border-divider/60 px-4 py-3 last:border-b-0"
              >
                {icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={icon} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-tertiary text-[11px] font-bold text-text-muted">
                    {serverInitials(option.server_name)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="truncate text-[15px] font-medium leading-5 text-header-primary">
                      {option.server_name}
                    </span>
                    <GuildTagBadge tag={option} size="sm" />
                  </div>
                  <p className="mt-0.5 text-[12px] leading-4 text-text-muted">
                    {option.equipped ? "Wearing this tag" : "Available to wear"}
                  </p>
                </div>
                {option.equipped ? (
                  <button
                    type="button"
                    onClick={() => void remove()}
                    disabled={isBusy}
                    className={`${ACTION} bg-bg-tertiary text-text-normal hover:bg-interactive-hover`}
                  >
                    {isBusy ? "Removing…" : "Remove"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void wear(option)}
                    disabled={!!busy}
                    className={`${ACTION} bg-brand text-white hover:bg-brand-hover`}
                  >
                    {isBusy ? "Wearing…" : "Wear"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && options.length > 0 && (
        <div className="flex items-start justify-between gap-3 border-t border-divider/60 px-4 py-3">
          <p role="alert" className="text-[13px] leading-5 text-status-dnd">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="shrink-0 text-[12px] font-medium text-interactive-normal underline hover:text-interactive-active"
          >
            Retry
          </button>
        </div>
      )}
    </SettingsSection>
  );
}
