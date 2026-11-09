"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getSupabaseClient } from "@/lib/supabase/client";
import { safeImageUrl } from "@/lib/safe-url";
import { apiFetch } from "@/lib/api";
import { alertDialog, confirmDialog, promptDialog } from "@/lib/dialogs";
import { handleTopmostEscape, pushEscapeHandler } from "@/lib/overlay";
import { IconBot, IconClose, IconCopy, IconCheck, IconShield, IconStaff, IconAlert } from "@/components/icons";

interface ViewedProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  accent_color: string | null;
  pronouns: string | null;
  status: string | null;
  bio: string | null;
  created_at: string | null;
  is_bot: boolean | null;
  account_type: string | null;
  deletion_requested_at: string | null;
}

export interface ViewedBan {
  reason: string | null;
  created_at: string;
}

const PLATFORM_ROLES = ["owner", "manager", "moderator", "staff"] as const;
const ROLE_LABEL: Record<string, string> = { owner: "Owner", manager: "Manager", moderator: "Moderator", staff: "Staff" };
const STATUS_COLOUR: Record<string, string> = {
  online: "var(--status-online, #23a55a)",
  idle: "var(--status-idle, #f0b232)",
  dnd: "var(--status-dnd, #f23f43)",
};

/**
 * The staff view of an account, shaped like a Discord profile card: banner,
 * avatar, names and platform roles up top, then the facts staff need (ID,
 * age, ban state, deletion) and the platform-ban action. The server decides
 * who may ban; this only offers it.
 */
export function AccountViewerModal({
  userId,
  onClose,
  ban,
  onBanChange,
}: {
  userId: string | null;
  onClose: () => void;
  /** The account's platform ban, when the caller knows it. */
  ban?: ViewedBan | null;
  /** Called after a ban or unban succeeds. */
  onBanChange?: () => void;
}) {
  const [profile, setProfile] = useState<ViewedProfile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setLoading(true);
    (async () => {
      const supabase = getSupabaseClient();
      const [{ data }, { data: badges }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, banner_url, accent_color, pronouns, status, bio, created_at, is_bot, account_type, deletion_requested_at")
          .eq("id", userId)
          .maybeSingle(),
        supabase.from("user_badges").select("badge_key").eq("user_id", userId).in("badge_key", [...PLATFORM_ROLES]),
      ]);
      if (!alive) return;
      setProfile((data as ViewedProfile | null) ?? null);
      setRoles(PLATFORM_ROLES.filter((r) => (badges ?? []).some((b: { badge_key: string }) => b.badge_key === r)));
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const release = pushEscapeHandler(onClose);
    const onKey = (e: KeyboardEvent) => handleTopmostEscape(e);
    document.addEventListener("keydown", onKey);
    return () => {
      release();
      document.removeEventListener("keydown", onKey);
    };
  }, [userId, onClose]);

  if (!userId || typeof document === "undefined") return null;

  const name = profile?.display_name || profile?.username || "Unknown account";
  const avatar = safeImageUrl(profile?.avatar_url ?? null);
  const banner = safeImageUrl(profile?.banner_url ?? null);
  const accent = profile?.accent_color || "#5865f2";

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(userId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the ID is selectable */
    }
  };

  const changeBan = async () => {
    if (busy) return;
    // Sends the change; returns an error to show, or null.
    const send = async (body: Record<string, string>) => {
      setBusy(true);
      const res = await apiFetch("/api/moderation/platform-ban", { method: "POST", body: JSON.stringify(body) });
      setBusy(false);
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        return json?.error ?? "That didn't work. Try again.";
      }
      onBanChange?.();
      return null;
    };
    let failure: string | null = null;
    if (ban) {
      // The popup stays open, showing it working, until the unban is done.
      await confirmDialog({
        title: `Unban ${name}?`,
        body: "They can sign in and use Disband again straight away.",
        confirmLabel: "Unban",
        tone: "danger",
        action: async () => { failure = await send({ action: "unban", userId }); },
      });
    } else {
      const reason = await promptDialog({
        title: `Ban ${name} from Disband?`,
        body: "They're signed out and can't sign in or make a new account with the same email.",
        label: "Reason",
        placeholder: "What they did",
        confirmLabel: "Ban",
        maxLength: 300,
      });
      if (reason === null) return;
      failure = await send({ action: "ban", userId, reason: reason.trim() });
    }
    // Shown after the popup has closed (an alert queues behind an open one).
    if (failure) await alertDialog(failure);
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="overlay-fade absolute inset-0 bg-overlay-scrim-strong" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Account: ${name}`}
        className="classic-modal relative flex max-h-[min(720px,calc(100dvh-32px))] w-full max-w-[480px] flex-col overflow-hidden rounded-xl border border-border-subtle bg-bg-floating shadow-[var(--elevation-high)]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/60 hover:text-white"
        >
          <IconClose size={18} />
        </button>

        {/* Banner, then the avatar cut into it, as on a Discord profile. */}
        <div className="relative h-[120px] shrink-0" style={{ background: banner ? undefined : accent }}>
          {banner && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={banner} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="relative shrink-0 px-4">
          <div className="absolute -top-[46px] left-4 rounded-full bg-bg-floating p-[6px]">
            <div className="relative h-20 w-20 overflow-hidden rounded-full bg-bg-tertiary">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[32px] font-semibold text-white" style={{ background: accent }}>
                  {name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            {profile?.status && STATUS_COLOUR[profile.status] && (
              <span
                aria-label={profile.status}
                className="absolute bottom-[6px] right-[6px] h-6 w-6 rounded-full border-[5px] border-bg-floating"
                style={{ background: STATUS_COLOUR[profile.status] }}
              />
            )}
          </div>
          <div className="flex h-[52px] items-center justify-end gap-1.5">
            {ban && <Tag tone="danger"><IconShield size={12} /> Banned</Tag>}
            {roles.map((r) => (
              <Tag key={r} tone={r === "owner" || r === "manager" ? "brand" : "neutral"}>
                <IconStaff size={12} /> {ROLE_LABEL[r]}
              </Tag>
            ))}
            {profile?.is_bot && <Tag tone="brand"><IconBot size={12} /> Bot</Tag>}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {loading ? (
            <div className="space-y-2 pt-2" aria-hidden>
              <div className="h-5 w-1/2 animate-pulse rounded bg-bg-tertiary" />
              <div className="h-3.5 w-1/3 animate-pulse rounded bg-bg-tertiary" />
              <div className="mt-4 h-24 animate-pulse rounded-lg bg-bg-secondary" />
            </div>
          ) : !profile ? (
            <div className="rounded-lg bg-bg-secondary p-4 text-[14px] text-text-muted">
              This account couldn&apos;t be loaded. It may have been deleted.
              <p className="mt-2 break-all font-mono text-[12px]">{userId}</p>
            </div>
          ) : (
            <>
              <h2 className="break-words text-[20px] font-semibold leading-6 text-header-primary">{name}</h2>
              <p className="mt-0.5 text-[14px] text-text-normal">
                {profile.username ? `@${profile.username}` : "No username"}
                {profile.pronouns && <span className="text-text-muted"> · {profile.pronouns}</span>}
              </p>

              {profile.deletion_requested_at && (
                <Notice tone="danger">Deletion requested {formatDate(profile.deletion_requested_at, true)}</Notice>
              )}
              {ban && (
                <Notice tone="danger">
                  Banned from Disband {formatDate(ban.created_at, true)}
                  {ban.reason ? <> · <span className="text-text-normal">{ban.reason}</span></> : null}
                </Notice>
              )}

              <div className="mt-4 overflow-hidden rounded-lg bg-bg-secondary">
                {profile.bio && (
                  <Section title="About me">
                    <p className="whitespace-pre-wrap break-words text-[14px] leading-[1.125rem] text-text-normal">{profile.bio}</p>
                  </Section>
                )}
                <Section title="Disband member since">
                  <p className="text-[14px] text-text-normal">{profile.created_at ? formatDate(profile.created_at) : "Unknown"}</p>
                </Section>
                <Section title="User ID">
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 select-all break-all font-mono text-[13px] text-text-normal">{profile.id}</code>
                    <button
                      type="button"
                      onClick={() => void copyId()}
                      aria-label="Copy user ID"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-interactive-normal transition-colors hover:bg-interactive-hover hover:text-interactive-active"
                    >
                      {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                    </button>
                  </div>
                </Section>
                <Section title="Account">
                  <p className="text-[14px] capitalize text-text-normal">
                    {(profile.account_type || "standard").replace(/_/g, " ")}
                    {profile.status ? <span className="text-text-muted"> · {profile.status}</span> : null}
                  </p>
                </Section>
              </div>
            </>
          )}
        </div>

        {profile && (
          <div className="flex shrink-0 items-center justify-end gap-2 bg-bg-secondary p-4">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-[38px] min-w-[96px] items-center justify-center rounded-lg px-4 text-[14px] font-medium text-text-normal hover:underline"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => void changeBan()}
              disabled={busy}
              className={`inline-flex h-[38px] min-w-[96px] items-center justify-center gap-1.5 rounded-lg px-4 text-[14px] font-medium text-white transition-colors disabled:opacity-50 ${
                ban ? "bg-button-secondary hover:bg-button-secondary-hover" : "bg-button-danger hover:bg-button-danger-hover"
              }`}
            >
              {!ban && <IconAlert size={16} />}
              {busy ? "Saving…" : ban ? "Lift ban" : "Ban from Disband"}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Tag({ tone, children }: { tone: "brand" | "danger" | "neutral"; children: React.ReactNode }) {
  const cls =
    tone === "danger"
      ? "bg-status-dnd/15 text-status-dnd"
      : tone === "brand"
        ? "bg-brand/15 text-brand"
        : "bg-bg-secondary text-text-normal";
  return <span className={`inline-flex h-6 items-center gap-1 rounded-full px-2 text-[12px] font-semibold ${cls}`}>{children}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-divider/60 px-3 py-3 last:border-b-0">
      <h3 className="mb-1.5 text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-header-secondary">{title}</h3>
      {children}
    </div>
  );
}

function Notice({ tone, children }: { tone: "danger"; children: React.ReactNode }) {
  return (
    <p className={`mt-3 rounded-lg px-3 py-2 text-[13px] ${tone === "danger" ? "bg-status-dnd/10 text-status-dnd" : ""}`}>{children}</p>
  );
}

function formatDate(value: string, withTime = false) {
  return new Date(value).toLocaleString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}
