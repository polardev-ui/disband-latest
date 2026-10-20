"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { catalystLevel, sanitizeVanity, vanityError } from "@/lib/catalysts";
import { getInviteUrl } from "@/lib/utils";
import { IconCheck, IconCopy } from "@/components/icons";
import { SendInvitePanel } from "@/components/modals/SendInvitePanel";
import { FieldLabel, InlineError, LevelLock, SettingsSection, btn } from "./ui";
import type { SectionProps } from "./types";

export function InvitesSection({ server, isOwner, catalystCount, onBoost }: SectionProps) {
  const { updateServer } = useApp();
  const level = catalystLevel(catalystCount).level;
  const code = server.vanity_code || server.invite_code || null;
  const inviteUrl = code ? getInviteUrl(code) : null;

  return (
    <div className="pb-10">
      <SettingsSection title="Invite link" description="Anyone with this link can join. Paste it in chat for a preview card with a Join button.">
        <div className="px-5 py-4">
          {inviteUrl ? <CopyField value={inviteUrl} /> : <p className="text-[13.5px] text-text-muted">This space doesn&apos;t have an invite link yet.</p>}
        </div>
      </SettingsSection>

      <VanityCard
        key={server.id}
        serverId={server.id}
        current={server.vanity_code ?? null}
        isOwner={isOwner}
        unlocked={level >= 2}
        catalystCount={catalystCount}
        onBoost={onBoost}
        save={(next) => updateServer(server.id, { vanity_code: next })}
      />

      {inviteUrl && (
        <SettingsSection title="Send to friends" description="Drops the invite into a DM, no copy and paste.">
          <SendInvitePanel inviteUrl={inviteUrl} serverName={server.name} />
        </SettingsSection>
      )}
    </div>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-10 min-w-0 flex-1 items-center rounded-[3px] border border-transparent bg-bg-tertiary px-3.5">
        <span className="truncate font-mono text-[13px] text-text-normal">{value}</span>
      </div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          });
        }}
        className={`${copied ? btn.secondary : btn.primary} h-10 w-[104px]`}
      >
        {copied ? (
          <span className="view-enter flex items-center gap-1.5 text-status-online">
            <IconCheck size={15} /> Copied
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <IconCopy size={15} /> Copy
          </span>
        )}
      </button>
    </div>
  );
}

function VanityCard({
  current,
  isOwner,
  unlocked,
  catalystCount,
  onBoost,
  save,
}: {
  serverId: string;
  current: string | null;
  isOwner: boolean;
  unlocked: boolean;
  catalystCount: number;
  onBoost?: () => void;
  save: (next: string | null) => Promise<string | null>;
}) {
  const [value, setValue] = useState(current ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => setValue(current ?? ""), [current]);

  const clean = sanitizeVanity(value);
  const dirty = clean !== (current ?? "");
  const preview = getInviteUrl(clean || "your-link");

  async function submit(next: string | null) {
    if (next) {
      const msg = vanityError(next);
      if (msg) {
        setError(msg);
        return;
      }
    }
    setSaving(true);
    setError(null);
    const err = await save(next);
    setSaving(false);
    if (err) {
      setError(/duplicate|unique/i.test(err) ? "Someone already has that link." : err);
      return;
    }
    setValue(next ?? "");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  }

  // Locked: say what it takes. A link claimed before the tier change keeps
  // working, and its owner can still release it.
  if (!unlocked) {
    return (
      <SettingsSection title="Custom invite link" description="A short, memorable link that's yours as long as the space stays at Level 2.">
        <LevelLock level={2} count={catalystCount} perk="Custom invite links" onBoost={onBoost} />
        {current && (
          <div className="flex items-center justify-between gap-3 border-t border-divider px-5 py-3.5">
            <p className="min-w-0 text-[13px] text-text-muted">
              Your current link <span className="font-mono text-text-normal">{current}</span> still works.
            </p>
            {isOwner && (
              <button type="button" disabled={saving} onClick={() => void submit(null)} className={btn.ghost}>
                Release it
              </button>
            )}
          </div>
        )}
        {error && <p className="border-t border-divider px-5 py-3 text-[13px] text-status-dnd">{error}</p>}
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title="Custom invite link" description="Letters, numbers and hyphens, 3 to 24 characters.">
      <div className="space-y-3 px-5 py-4">
        <div>
          <FieldLabel htmlFor="vanity" aside={`${value.length}/24`}>Your link</FieldLabel>
          <div className="flex gap-2">
            <input
              id="vanity"
              value={value}
              // Only filter characters while typing: trimming hyphens here made
              // "my-space" impossible to type one letter at a time.
              onChange={(e) => setValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && dirty) void submit(clean || null);
              }}
              disabled={!isOwner}
              placeholder="my-space"
              className="h-10 min-w-0 flex-1 rounded-[3px] border border-transparent bg-bg-tertiary px-3.5 font-mono text-[13.5px] text-text-normal outline-none placeholder:text-text-muted/70 focus:border-[#00a8fc] disabled:opacity-60"
            />
            {isOwner && (
              <button type="button" onClick={() => void submit(clean || null)} disabled={saving || !dirty} className={`${btn.primary} h-10`}>
                {saving ? "Saving…" : saved ? "Saved" : !clean && current ? "Release" : "Claim"}
              </button>
            )}
          </div>
          <p className="mt-2 truncate text-[12.5px] text-text-muted">
            {preview}
          </p>
        </div>
        <InlineError>{error}</InlineError>
      </div>
    </SettingsSection>
  );
}
