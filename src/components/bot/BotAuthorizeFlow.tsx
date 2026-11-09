"use client";

/**
 * Adding a bot to a space: who it is, which space (a picker with each
 * space's icon), what it can do, and an optional Administrator role. Used by
 * the /bot-invite page and by the popup from an invite card in chat.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import { BOT_SCOPE_LABELS } from "@/lib/bot-scopes";
import type { BotScope } from "@/lib/bot-auth";
import { BotTag } from "@/components/ui/BotTag";
import { BUSY_BUTTON, BusyLabel, LoadingDots } from "@/components/ui/LoadingDots";
import { safeImageUrl } from "@/lib/safe-url";

export interface BotInviteData {
  code: string;
  status: "pending" | "approved" | "declined" | "expired";
  scopes: BotScope[];
  bot: { id: string; user_id: string; name: string; avatar_url: string | null };
  server: { id: string; name: string; icon_url: string | null; owner_id: string } | null;
}

interface Space {
  id: string;
  name: string;
  icon_url: string | null;
  owner_id: string;
}

type Load =
  | { state: "loading" }
  | { state: "missing" }
  | { state: "failed"; message: string }
  | { state: "ready"; invite: BotInviteData };

export async function fetchBotInvite(code: string): Promise<Load> {
  try {
    const res = await apiFetch(`/api/bot/invites/${encodeURIComponent(code)}`);
    if (res.status === 429) return { state: "failed", message: "Too many tries. Wait a minute, then try again." };
    const data = await res.json().catch(() => ({}));
    if (res.status === 404 || !data?.bot) return { state: "missing" };
    if (!res.ok) return { state: "failed", message: "Couldn't load this invite just now. Try again in a moment." };
    return { state: "ready", invite: data as BotInviteData };
  } catch {
    return { state: "failed", message: "Couldn't load this invite just now. Try again in a moment." };
  }
}

function SpaceIcon({ space, size = 32 }: { space: Pick<Space, "name" | "icon_url">; size?: number }) {
  const icon = safeImageUrl(space.icon_url);
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-[30%] bg-bg-tertiary font-semibold text-text-normal"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {icon ? <img src={icon} alt="" className="h-full w-full object-cover" /> : space.name.slice(0, 2)}
    </span>
  );
}

/** A dropdown of your spaces, each with its icon. */
function SpacePicker({ spaces, value, onChange }: { spaces: Space[] | null; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const chosen = spaces?.find((s) => s.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc, true); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-12 w-full items-center gap-3 rounded-xl border bg-bg-secondary px-3 text-left transition-colors ${open ? "border-brand" : "border-border-subtle hover:border-border-strong"}`}
      >
        {chosen ? (
          <>
            <SpaceIcon space={chosen} size={28} />
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-text-normal">{chosen.name}</span>
          </>
        ) : (
          <span className="min-w-0 flex-1 text-[15px] text-text-muted">Pick a space</span>
        )}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div role="listbox" className="menu-pop absolute inset-x-0 top-[calc(100%+6px)] z-20 max-h-[260px] overflow-y-auto rounded-xl border border-border-subtle bg-bg-floating p-1.5 shadow-[var(--elevation-high)]">
          {spaces === null ? (
            <div className="flex justify-center px-3 py-4"><LoadingDots size={7} className="text-text-muted" /></div>
          ) : spaces.length === 0 ? (
            <p className="px-3 py-3 text-[13px] text-text-muted">You aren&apos;t in any spaces yet.</p>
          ) : spaces.map((s) => (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={s.id === value}
              onClick={() => { onChange(s.id); setOpen(false); }}
              className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${s.id === value ? "bg-brand-soft" : "hover:bg-interactive-hover"}`}
            >
              <SpaceIcon space={s} size={32} />
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-text-normal">{s.name}</span>
              {s.id === value && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-brand" aria-hidden>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function BotAuthorizeFlow({
  code,
  onClose,
  onOpenSpace,
}: {
  code: string;
  /** Shown as a Cancel/Done button when the flow sits in a popup. */
  onClose?: () => void;
  /** After success: open the space (in the app), instead of a plain link. */
  onOpenSpace?: (serverId: string) => void;
}) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [verified, setVerified] = useState(false);
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [serverId, setServerId] = useState("");
  const [admin, setAdmin] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ serverId: string; name: string; adminNote: string | null } | null>(null);

  useEffect(() => {
    let live = true;
    void fetchBotInvite(code).then((l) => {
      if (!live) return;
      setLoad(l);
      if (l.state === "ready") {
        void getSupabaseClient().from("profiles").select("verified_bot").eq("id", l.invite.bot.user_id).maybeSingle()
          .then(({ data }) => { if (live) setVerified(!!(data as { verified_bot?: boolean } | null)?.verified_bot); });
      }
    });
    return () => { live = false; };
  }, [code]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const supabase = getSupabaseClient();
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;
      if (!live) return;
      setUserId(uid);
      if (!uid) return;
      // Two plain lookups (memberships, then those spaces) rather than one
      // embedded select, which came back empty.
      const { data: rows } = await supabase
        .from("server_members")
        .select("server_id, role")
        .eq("user_id", uid)
        .limit(500);
      const roles = new Map(((rows ?? []) as { server_id: string; role: string }[]).map((r) => [r.server_id, r.role]));
      if (!live || roles.size === 0) {
        if (live) setSpaces([]);
        return;
      }
      const { data: servers } = await supabase
        .from("servers")
        .select("id, name, icon_url, owner_id")
        .in("id", [...roles.keys()]);
      if (!live) return;
      const canAdd = (s: Space) => s.owner_id === uid || roles.get(s.id) === "admin";
      const list = ((servers ?? []) as Space[])
        // Owners and admins first: they're the ones who can add bots.
        .sort((a, b) => Number(canAdd(b)) - Number(canAdd(a)) || a.name.localeCompare(b.name));
      setSpaces(list);
    })();
    return () => { live = false; };
  }, []);

  const invite = load.state === "ready" ? load.invite : null;
  const fixedSpace = invite?.server ?? null;
  const target = fixedSpace ? fixedSpace.id : serverId;
  const chosen = useMemo(() => (spaces ?? []).find((s) => s.id === target) ?? (fixedSpace ? { ...fixedSpace } : null), [spaces, target, fixedSpace]);
  const isOwner = !!chosen && !!userId && chosen.owner_id === userId;

  const authorize = useCallback(async () => {
    if (!invite || busy) return;
    if (!target) { setError("Pick a space to add it to."); return; }
    setBusy(true);
    setError(null);
    try {
      const { data: { session } } = await getSupabaseClient().auth.getSession();
      if (!session) { setUserId(null); return; }
      const res = await apiFetch(`/api/bot/invites/${encodeURIComponent(code)}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: fixedSpace ? undefined : JSON.stringify({ serverId: target }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "That didn't work. Try again.");
      let adminNote: string | null = null;
      if (admin && isOwner) {
        const { error: err } = await getSupabaseClient().rpc("grant_bot_admin_role", { p_server_id: target, p_bot_user_id: invite.bot.user_id });
        if (err) adminNote = `Added, but I couldn't give it Administrator: ${err.message}`;
      }
      setDone({ serverId: target, name: chosen?.name ?? "your space", adminNote });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }, [invite, busy, target, code, fixedSpace, admin, isOwner, chosen]);

  if (load.state === "loading") {
    return (
      <div className="flex flex-col items-center gap-4 px-6 py-16" role="status" aria-label="Loading">
        <LoadingDots size={9} className="text-text-muted" />
      </div>
    );
  }
  if (load.state !== "ready" || !invite) {
    return (
      <div className="px-6 py-10 text-center">
        <p className="text-[18px] font-bold text-header-primary">{load.state === "missing" ? "This invite doesn't work" : "Something went wrong"}</p>
        <p className="mx-auto mt-2 max-w-xs text-[14px] leading-5 text-text-muted">
          {load.state === "failed" ? load.message : "The link may have expired. Ask whoever shared it for a new one."}
        </p>
        {onClose && <button type="button" onClick={onClose} className="mt-6 h-10 rounded-xl bg-button-secondary px-5 text-[14px] font-semibold text-header-primary hover:bg-button-secondary-hover">Close</button>}
      </div>
    );
  }

  const avatar = safeImageUrl(invite.bot.avatar_url);
  const head = (
    <div className="flex flex-col items-center px-6 pt-8 text-center">
      <div className="relative">
        <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-bg-tertiary text-[28px] font-bold text-header-primary ring-4 ring-bg-primary">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : invite.bot.name.slice(0, 1)}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <h2 className="text-[22px] font-extrabold leading-7 text-header-primary">{invite.bot.name}</h2>
        <BotTag profile={{ is_bot: true, verified_bot: verified }} />
      </div>
    </div>
  );

  if (done) {
    return (
      <div className="pb-6">
        {head}
        <div className="mt-5 flex flex-col items-center px-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-status-online/15 text-status-online">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>
          </span>
          <p className="mt-3 text-[16px] font-bold text-header-primary">Added to {done.name}</p>
          <p className="mt-1 max-w-xs text-[13px] leading-5 text-text-muted">
            {done.adminNote ?? `${invite.bot.name} is in your space now. Try /help there.`}
          </p>
          <div className="mt-5 flex w-full gap-2">
            {onClose && <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl bg-button-secondary text-[14px] font-semibold text-header-primary hover:bg-button-secondary-hover">Done</button>}
            {onOpenSpace ? (
              <button type="button" onClick={() => onOpenSpace(done.serverId)} className="h-11 flex-1 rounded-xl bg-brand text-[14px] font-semibold text-white hover:bg-brand-hover">Go to space</button>
            ) : (
              <a href="/app" className="flex h-11 flex-1 items-center justify-center rounded-xl bg-brand text-[14px] font-semibold text-white hover:bg-brand-hover">Open Disband</a>
            )}
          </div>
        </div>
      </div>
    );
  }

  const pending = invite.status === "pending";

  return (
    <div>
      {head}
      <p className="mt-1 px-6 text-center text-[14px] text-text-muted">
        {fixedSpace ? <>wants to join <span className="font-semibold text-text-normal">{fixedSpace.name}</span></> : "wants to join one of your spaces"}
      </p>

      <div className="space-y-5 px-6 pb-2 pt-6">
        {!pending ? (
          <p className="rounded-xl bg-bg-secondary px-4 py-3 text-center text-[14px] text-text-muted">
            This invite has been {invite.status === "approved" ? "used" : invite.status}.
          </p>
        ) : userId === null ? (
          <p className="rounded-xl bg-bg-secondary px-4 py-3 text-center text-[14px] text-text-muted">Log in to add it to a space.</p>
        ) : (
          <>
            {!fixedSpace && (
              <div>
                <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.06em] text-text-muted">Add to space</p>
                <SpacePicker spaces={spaces} value={serverId} onChange={(id) => { setServerId(id); setError(null); }} />
              </div>
            )}

            <div>
              <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.06em] text-text-muted">It will be able to</p>
              <ul className="space-y-1.5">
                {invite.scopes.map((scope) => (
                  <li key={scope} className="flex items-start gap-2.5 text-[14px] leading-5">
                    <span className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-status-online/15 text-status-online">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>
                    </span>
                    <span className="text-text-normal">{BOT_SCOPE_LABELS[scope]?.label ?? scope}</span>
                  </li>
                ))}
              </ul>
            </div>

            {chosen && (
              <label className={`flex items-start gap-3 rounded-xl border p-3 ${isOwner ? "cursor-pointer border-border-subtle bg-bg-secondary" : "border-border-subtle bg-bg-secondary opacity-60"}`}>
                <input
                  type="checkbox"
                  checked={admin && isOwner}
                  disabled={!isOwner}
                  onChange={(e) => setAdmin(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
                />
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-header-primary">Give it Administrator</span>
                  <span className="mt-0.5 block text-[12px] leading-4 text-text-muted">
                    {isOwner
                      ? "Gives it a role with every permission, so all its commands work. Only do this for bots you trust."
                      : "Only the space's owner can give a bot Administrator."}
                  </span>
                </span>
              </label>
            )}
          </>
        )}

        {error && <p role="alert" className="rounded-xl bg-status-dnd/10 px-3 py-2 text-[13px] text-status-dnd">{error}</p>}
      </div>

      <div className="flex gap-2 px-6 pb-6 pt-4">
        {onClose && (
          <button type="button" onClick={onClose} disabled={busy} className="h-11 rounded-xl px-5 text-[14px] font-semibold text-text-normal hover:bg-interactive-hover disabled:opacity-50">
            Cancel
          </button>
        )}
        {pending && userId === null ? (
          <a href={`/login?next=${encodeURIComponent(`/bot-invite/${code}`)}`} className="flex h-11 flex-1 items-center justify-center rounded-xl bg-brand text-[15px] font-semibold text-white hover:bg-brand-hover">
            Log in
          </a>
        ) : pending ? (
          <button
            type="button"
            onClick={() => void authorize()}
            disabled={busy || (!fixedSpace && !serverId)}
            className={`h-11 flex-1 rounded-xl bg-brand text-[15px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50 ${busy ? BUSY_BUTTON : ""}`}
          >
            <BusyLabel busy={busy}>Authorize</BusyLabel>
          </button>
        ) : null}
      </div>
    </div>
  );
}
