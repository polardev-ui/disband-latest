"use client";

import { LoadingDots } from "@/components/ui/LoadingDots";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Bot as BotIcon,
  Check,
  Circle,
  CircleCheck,
  ExternalLink,
  Globe,
  Info,
  KeyRound,
  LayoutDashboard,
  Link2,
  Plus,
  Server,
  Sparkles,
  SquareSlash,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";
import { BOT_SCOPE_LABELS } from "@/lib/bot-scopes";
import type { BotScope } from "@/lib/bot-auth";
import type { CommandOption } from "@/lib/bot-commands";
import { confirmDialog } from "@/lib/dialogs";
import { uploadMedia } from "@/lib/media/uploadMedia";
import { getSupabaseClient } from "@/lib/supabase/client";
import { DOCS_URL } from "@/components/developers/DevelopersHeader";
import { CopyButton, QuickStart, RESOURCES, WHATS_NEW } from "@/components/developers/DevContent";

/*
 The developer portal: a grid of your applications, and inside one a sidebar
 of pages.

   Overview              status, a setup checklist, quick start, what's new
   General information   name, picture, banner, description, tags, legal links
   Bot                   token reset, public/private, connection, scopes
   Commands              the slash commands the bot registered
   Installation          the install link and what a space owner will see
   Danger zone           delete
*/

interface Bot {
  id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  scopes: BotScope[];
  token_prefix: string | null;
  revoked_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  description: string | null;
  tags: string[] | null;
  terms_url: string | null;
  privacy_url: string | null;
  is_public: boolean;
  space_count: number;
}

interface RegisteredCommand {
  id: string;
  name: string;
  description: string;
  options: CommandOption[];
  updated_at: string;
}

type Page = "overview" | "general" | "bot" | "commands" | "install" | "danger";

const PAGES: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "general", label: "General information", icon: Info },
  { id: "bot", label: "Bot", icon: BotIcon },
  { id: "commands", label: "Commands", icon: SquareSlash },
  { id: "install", label: "Installation", icon: Link2 },
  { id: "danger", label: "Danger zone", icon: TriangleAlert },
];

const GROUPS: { label: string; scopes: BotScope[] }[] = [
  { label: "Messages", scopes: ["messages.read", "messages.write", "messages.delete", "messages.react"] },
  { label: "Members", scopes: ["members.read", "members.kick", "members.ban", "members.timeout"] },
  { label: "Channels", scopes: ["channels.read", "channels.manage", "webhooks.manage"] },
  { label: "Roles and the space", scopes: ["roles.manage", "servers.read", "audit.read"] },
];

const INPUT =
  "w-full rounded-lg border border-transparent bg-bg-tertiary px-3 py-2.5 text-[15px] text-text-normal outline-none transition-colors placeholder:text-text-muted focus:border-brand";
const PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[14px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50";
const SECONDARY =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-button-secondary px-4 py-2 text-[14px] font-semibold text-header-primary transition-colors hover:bg-button-secondary-hover disabled:opacity-50";

async function call<T>(url: string, body: unknown, method = "POST"): Promise<{ ok: boolean; data: T & { error?: string } }> {
  const res = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as T & { error?: string } };
}

function Initial({ bot, size = 40 }: { bot: Pick<Bot, "name" | "avatar_url">; size?: number }) {
  return bot.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={bot.avatar_url} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-brand font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {bot.name.charAt(0).toUpperCase()}
    </span>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-header-secondary">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[13px] text-text-muted">{hint}</span>}
    </label>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? "bg-status-online" : "bg-interactive-muted"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-[left] duration-150 ${checked ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

function Card({ title, description, icon: Icon, actions, tone, children }: {
  title?: string; description?: ReactNode; icon?: LucideIcon; actions?: ReactNode; tone?: "danger"; children?: ReactNode;
}) {
  return (
    <section className={`rounded-xl border p-5 ${tone === "danger" ? "border-status-dnd/40 bg-status-dnd/[0.04]" : "border-divider bg-bg-secondary"}`}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            {Icon && (
              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone === "danger" ? "bg-status-dnd/15 text-status-dnd" : "bg-bg-tertiary text-text-muted"}`}>
                <Icon size={16} strokeWidth={2.2} />
              </span>
            )}
            <div className="min-w-0">
              {title && <h3 className="text-[16px] font-semibold text-header-primary">{title}</h3>}
              {description && <p className="mt-0.5 text-[14px] leading-relaxed text-text-muted">{description}</p>}
            </div>
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      )}
      {children && <div className={title || actions ? "mt-4" : ""}>{children}</div>}
    </section>
  );
}

function ImagePick({ label, url, wide, busy, onPick, onClear }: {
  label: string; url: string; wide?: boolean; busy: boolean; onPick: (file: File) => void; onClear: () => void;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-semibold text-header-secondary">{label}</span>
      <div className="flex items-center gap-3">
        <div className={`shrink-0 overflow-hidden bg-bg-tertiary ${wide ? "h-16 w-36 rounded-lg" : "h-16 w-16 rounded-full"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {url && <img src={url} alt="" className="h-full w-full object-cover" />}
        </div>
        <label className={`cursor-pointer ${SECONDARY} ${busy ? "pointer-events-none opacity-50" : ""}`}>
          {busy ? <LoadingDots size={6} className="mx-auto" /> : url ? "Change" : "Upload"}
          <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onPick(f); }} />
        </label>
        {url && <button type="button" onClick={onClear} className="text-[14px] text-text-muted hover:text-status-dnd">Remove</button>}
      </div>
    </div>
  );
}

function ScopePicker({ value, onChange, allowed }: { value: BotScope[]; onChange: (v: BotScope[]) => void; allowed?: BotScope[] }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {GROUPS.map((g) => (
        <fieldset key={g.label} className="rounded-xl border border-divider bg-bg-secondary px-4 pb-2 pt-1">
          <legend className="px-1 text-[12px] font-semibold uppercase tracking-[0.05em] text-text-muted">{g.label}</legend>
          {g.scopes.filter((s) => BOT_SCOPE_LABELS[s]).map((s) => {
            const disabled = allowed ? !allowed.includes(s) : false;
            return (
              <label key={s} className={`flex gap-3 rounded-lg px-1 py-2 ${disabled ? "opacity-40" : "cursor-pointer"}`}>
                <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[#5865f2]" disabled={disabled} checked={value.includes(s)}
                  onChange={(e) => onChange(e.target.checked ? [...value, s] : value.filter((x) => x !== s))} />
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-header-primary">{BOT_SCOPE_LABELS[s].label}</span>
                  <span className="block text-[12px] leading-snug text-text-muted">{BOT_SCOPE_LABELS[s].description}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}

function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-6">
      <h2 className="text-[26px] font-bold tracking-[-0.01em] text-header-primary">{title}</h2>
      {children && <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-text-muted">{children}</p>}
    </header>
  );
}

function StatusDot({ live }: { live: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-online opacity-60 motion-reduce:hidden" />}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${live ? "bg-status-online" : "bg-interactive-muted"}`} />
    </span>
  );
}

function gatewayStatus(lastSeen: string | null): { label: string; live: boolean } {
  if (!lastSeen) return { label: "Never connected", live: false };
  const ago = Date.now() - new Date(lastSeen).getTime();
  if (ago < 2 * 60_000) return { label: "Connected", live: true };
  return { label: `Last seen ${new Date(lastSeen).toLocaleString()}`, live: false };
}

/** The developer portal: your applications, their bots, commands and install links. */
export function DeveloperPortal() {
  const { user } = useApp();
  const [bots, setBots] = useState<Bot[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState<Page>("overview");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);

  const [draft, setDraft] = useState({ name: "", avatar: "", banner: "", bio: "", description: "", tags: "", terms: "", privacy: "" });
  const [draftScopes, setDraftScopes] = useState<BotScope[]>([]);
  const [installScopes, setInstallScopes] = useState<BotScope[]>([]);
  const [installUrl, setInstallUrl] = useState<string | null>(null);
  const [commands, setCommands] = useState<RegisteredCommand[] | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/bot/list");
    const json = (await res.json().catch(() => ({}))) as { bots?: Bot[]; error?: string };
    if (!res.ok) setError(json.error ?? "Couldn't load your applications.");
    setBots(json.bots ?? []);
  }, []);
  useEffect(() => { if (user) void load(); }, [user, load]);

  const live = useMemo(() => (bots ?? []).filter((b) => !b.revoked_at), [bots]);
  const selected = live.find((b) => b.id === selectedId) ?? null;
  // Names used by more than one of your applications, to point out duplicates.
  const dupes = useMemo(() => {
    const seen = new Map<string, number>();
    for (const b of live) seen.set(b.name.toLowerCase(), (seen.get(b.name.toLowerCase()) ?? 0) + 1);
    return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
  }, [live]);

  const loadCommands = useCallback(async (botId: string) => {
    setCommands(null);
    const { data } = await getSupabaseClient().from("bot_commands").select("id, name, description, options, updated_at").eq("bot_id", botId).order("name");
    setCommands((data as RegisteredCommand[] | null) ?? []);
  }, []);

  useEffect(() => {
    if (!selected) return;
    setDraft({
      name: selected.name,
      avatar: selected.avatar_url ?? "",
      banner: "",
      bio: "",
      description: selected.description ?? "",
      tags: (selected.tags ?? []).join(", "),
      terms: selected.terms_url ?? "",
      privacy: selected.privacy_url ?? "",
    });
    // Banner and bio live on the bot's profile row.
    void getSupabaseClient().from("profiles").select("banner_url, bio").eq("id", selected.user_id).maybeSingle()
      .then(({ data }) => {
        const p = data as { banner_url: string | null; bio: string | null } | null;
        setDraft((d) => ({ ...d, banner: p?.banner_url ?? "", bio: p?.bio ?? "" }));
      });
    setDraftScopes(selected.scopes);
    setInstallScopes(selected.scopes);
    setInstallUrl(null);
    setError(null);
    setNotice(null);
    void loadCommands(selected.id);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function open(id: string, p: Page = "overview") {
    setSelectedId(id);
    setPage(p);
    setCreating(false);
    window.scrollTo({ top: 0 });
  }

  function go(p: Page) {
    setPage(p);
    setNotice(null);
    setError(null);
    window.scrollTo({ top: 0 });
  }

  async function create() {
    setSaving(true);
    setError(null);
    const { ok, data } = await call<{ bot?: { id: string }; token?: string }>("/api/bot/register", { name: newName.trim(), scopes: ["messages.read", "messages.write"] });
    setSaving(false);
    if (!ok || !data.bot) return setError(data.error ?? "Couldn't create the application.");
    setToken(data.token ?? null);
    setNewName("");
    await load();
    open(data.bot.id, "overview");
  }

  async function save(patch: Record<string, unknown>, done = "Saved.") {
    if (!selected) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    const { ok, data } = await call("/api/bot/update", { botId: selected.id, ...patch });
    setSaving(false);
    if (!ok) return setError(data.error ?? "Couldn't save.");
    setNotice(done);
    void load();
  }

  async function pickImage(kind: "avatar" | "banner", file: File) {
    if (!file.type.startsWith("image/")) return setError("Pick an image file.");
    setUploading(kind);
    setError(null);
    try {
      const { url } = await uploadMedia(file, { maxUploadBytes: 8 * 1024 * 1024 });
      setDraft((d) => ({ ...d, [kind]: url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload that image.");
    } finally {
      setUploading(null);
    }
  }

  async function resetToken() {
    if (!selected) return;
    await confirmDialog({ title: "Reset the token?", body: "The current token stops working straight away. Any running copy of your bot disconnects until you give it the new one.", confirmLabel: "Reset token", action: async () => {
      const { ok: done, data } = await call<{ token?: string }>("/api/bot/reset-token", { botId: selected.id });
      if (!done || !data.token) return setError(data.error ?? "Couldn't reset the token.");
      setToken(data.token);
      await load();
    } });
  }

  async function makeLink() {
    if (!selected) return;
    setError(null);
    const { ok, data } = await call<{ url?: string }>("/api/bot/install-link", { botId: selected.id, scopes: installScopes });
    if (!ok || !data.url) setError(data.error ?? "Couldn't make the link.");
    else setInstallUrl(data.url);
  }

  async function deleteCommand(name: string) {
    if (!selected) return;
    await confirmDialog({ title: `Delete /${name}?`, body: "It disappears from every space. Your bot can register it again at any time.", confirmLabel: "Delete", action: async () => {
      const res = await apiFetch(`/api/bot/commands?botId=${encodeURIComponent(selected.id)}&name=${encodeURIComponent(name)}`, { method: "DELETE" });
      if (!res.ok) setError("Couldn't delete that command.");
      await loadCommands(selected.id);
    } });
  }

  async function revoke(bot: Bot) {
    await confirmDialog({ title: `Delete ${bot.name}?`, body: "Its token stops working immediately and the bot leaves every space. This can't be undone.", confirmLabel: "Delete application", action: async () => {
      const res = await call("/api/bot/revoke", { botId: bot.id });
      if (!res.ok) return setError(res.data.error ?? "Couldn't delete.");
      await load();
      setSelectedId(null);
    } });
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-secondary text-text-muted"><BotIcon size={26} /></span>
        <h2 className="mt-4 text-[22px] font-bold text-header-primary">Sign in to build on Disband</h2>
        <p className="mt-1 text-[15px] text-text-muted">Your applications, bot tokens and install links live here.</p>
        <a href="/app" className={`mt-5 ${PRIMARY}`}>Open Disband</a>
      </div>
    );
  }

  const banner = (
    <>
      {error && <p role="alert" className="mb-4 rounded-lg bg-status-dnd/15 px-3 py-2 text-[14px] text-status-dnd">{error}</p>}
      {notice && !error && <p role="status" className="mb-4 flex items-center gap-2 rounded-lg bg-status-online/15 px-3 py-2 text-[14px] text-status-online"><Check size={15} strokeWidth={2.4} />{notice}</p>}
      {token && (
        <div className="mb-6 rounded-xl border border-status-idle/40 bg-status-idle/10 p-4">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-header-primary"><KeyRound size={15} /> Your bot token. Copy it now: it&apos;s only shown once.</p>
          <p className="mt-1 text-[13px] text-text-muted">Keep it secret. Anyone with it can act as your bot. Never put it in a public repository.</p>
          <code className="mt-3 block break-all rounded-lg bg-bg-tertiary px-3 py-2 text-[13px]">{token}</code>
          <div className="mt-3 flex gap-2">
            <CopyButton text={token} label="Copy token" />
            <button type="button" className="rounded-lg px-3 py-1.5 text-[13px] text-text-muted hover:text-text-normal hover:underline" onClick={() => setToken(null)}>I&apos;ve saved it</button>
          </div>
        </div>
      )}
    </>
  );

  // --- The application list -----------------------------------------------------
  if (!selected) {
    return (
      <div className="animate-[portal-in_220ms_ease-out]">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[32px] font-bold tracking-[-0.02em] text-header-primary">Applications</h2>
            <p className="mt-1 text-[15px] text-text-muted">Each application is a bot: its own account, token, slash commands and install link.</p>
          </div>
          <button type="button" onClick={() => { setCreating(true); setError(null); }} disabled={live.length >= 5} className={PRIMARY}>
            <Plus size={16} strokeWidth={2.4} /> New application
          </button>
        </div>
        {banner}
        {creating && (
          <div className="mb-8 max-w-md rounded-xl border border-divider bg-bg-secondary p-5">
            <h3 className="text-[17px] font-bold text-header-primary">Create an application</h3>
            <p className="mb-4 mt-0.5 text-[14px] text-text-muted">You can change its name, picture and permissions later.</p>
            <Field label="Name">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={25} autoFocus className={INPUT} placeholder="My bot"
                onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) void create(); if (e.key === "Escape") setCreating(false); }} />
            </Field>
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={saving || !newName.trim()} onClick={() => void create()} className={`${PRIMARY} min-w-[88px]`}>{saving ? <LoadingDots size={6} className="mx-auto" /> : "Create"}</button>
              <button type="button" onClick={() => setCreating(false)} className="rounded-lg px-4 py-2 text-[14px] text-text-normal hover:underline">Cancel</button>
            </div>
          </div>
        )}
        {bots === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-[188px] animate-pulse rounded-xl bg-bg-secondary" />)}
          </div>
        ) : live.length === 0 && !creating ? (
          <div className="rounded-2xl border border-dashed border-divider bg-bg-secondary/60 px-6 py-14 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-tertiary text-text-muted"><BotIcon size={26} /></span>
            <p className="mt-4 text-[18px] font-semibold text-header-primary">Build something for Disband</p>
            <p className="mx-auto mt-1 max-w-sm text-[14px] text-text-muted">Create an application to get a bot, its token and an install link anyone can use.</p>
            <button type="button" onClick={() => setCreating(true)} className={`mt-5 ${PRIMARY}`}><Plus size={16} strokeWidth={2.4} /> New application</button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {live.map((b) => {
              const status = gatewayStatus(b.last_seen_at);
              return (
                <button key={b.id} type="button" onClick={() => open(b.id)}
                  className="group overflow-hidden rounded-xl border border-divider bg-bg-secondary text-left transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-reduce:hover:translate-y-0">
                  <div className="h-14 bg-gradient-to-r from-brand/25 via-brand/10 to-transparent" />
                  <div className="-mt-8 px-5 pb-5">
                    <span className="inline-block rounded-full border-4 border-bg-secondary"><Initial bot={b} size={56} /></span>
                    <p className="mt-2 truncate text-[17px] font-semibold text-header-primary">{b.name}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-text-muted">
                      <span className="flex items-center gap-1.5"><StatusDot live={status.live} />{status.live ? "Connected" : "Offline"}</span>
                      <span className="flex items-center gap-1"><Server size={13} />{b.space_count} {b.space_count === 1 ? "space" : "spaces"}</span>
                      <span className="flex items-center gap-1"><Globe size={13} />{b.is_public ? "Public" : "Private"}</span>
                    </div>
                    {dupes.has(b.name.toLowerCase()) && (
                      <span className="mt-3 inline-block rounded-md bg-status-idle/15 px-2 py-0.5 text-[11px] font-semibold text-status-idle">Same name as another app</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <p className="mt-4 text-[13px] text-text-muted">{live.length} of 5 applications.</p>

        <h3 className="mb-3 mt-12 text-[13px] font-semibold uppercase tracking-[0.06em] text-text-muted">Resources</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {RESOURCES.map((r) => (
            <a key={r.title} href={r.href} target="_blank" rel="noreferrer"
              className="group rounded-xl border border-divider bg-bg-secondary p-4 transition-colors hover:border-brand/50">
              <span className="flex items-center justify-between text-[15px] font-semibold text-header-primary">
                {r.title}
                <ExternalLink size={14} className="text-text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 block text-[13px] leading-snug text-text-muted">{r.body}</span>
            </a>
          ))}
        </div>
      </div>
    );
  }

  // --- One application ------------------------------------------------------------
  const status = gatewayStatus(selected.last_seen_at);
  const tagList = draft.tags.split(",").map((t) => t.trim()).filter(Boolean);
  const checklist: { label: string; done: boolean; action?: { label: string; page?: Page; href?: string } }[] = [
    { label: "Create the application", done: true },
    { label: "Give it an icon and a description", done: Boolean(selected.avatar_url && selected.description), action: { label: "Edit", page: "general" } },
    { label: "Connect your bot with its token", done: Boolean(selected.last_seen_at), action: { label: "See how", href: `${DOCS_URL}/getting-started/` } },
    { label: "Register a slash command", done: (commands?.length ?? 0) > 0, action: { label: "Commands", page: "commands" } },
    { label: "Add it to a space", done: selected.space_count > 0, action: { label: "Install link", page: "install" } },
  ];
  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <div className="grid gap-8 md:grid-cols-[236px_minmax(0,1fr)]">
      <aside className="md:sticky md:top-20 md:self-start">
        <button type="button" onClick={() => setSelectedId(null)} className="mb-5 flex items-center gap-1.5 text-[14px] text-text-muted transition-colors hover:text-text-normal">
          <ArrowLeft size={15} /> All applications
        </button>
        <div className="mb-4 flex items-center gap-3 rounded-xl bg-bg-secondary p-3">
          <Initial bot={selected} size={40} />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold text-header-primary">{selected.name}</span>
            <span className="flex items-center gap-1.5 text-[12px] text-text-muted"><StatusDot live={status.live} />{status.live ? "Connected" : "Offline"}</span>
          </span>
        </div>
        <nav aria-label="Application settings" className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
          {PAGES.map((p) => {
            const Icon = p.icon;
            const active = page === p.id;
            return (
              <button key={p.id} type="button" onClick={() => go(p.id)} aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[14px] font-medium transition-colors md:w-full ${
                  active
                    ? "bg-interactive-hover text-header-primary"
                    : p.id === "danger"
                      ? "text-status-dnd hover:bg-status-dnd/10"
                      : "text-text-muted hover:bg-interactive-hover hover:text-text-normal"
                }`}>
                <Icon size={16} strokeWidth={2.1} />
                <span className="flex-1">{p.label}</span>
                {p.id === "commands" && commands && commands.length > 0 && (
                  <span className="rounded-full bg-bg-tertiary px-1.5 text-[12px] text-text-muted">{commands.length}</span>
                )}
              </button>
            );
          })}
        </nav>
        <a href={`${DOCS_URL}/api-reference/`} target="_blank" rel="noreferrer"
          className="mt-6 hidden items-center gap-2 px-2.5 text-[13px] text-text-muted hover:text-text-normal md:flex">
          <BookOpen size={14} /> API reference <ExternalLink size={12} />
        </a>
      </aside>

      <div key={page} className="min-w-0 animate-[portal-in_200ms_ease-out]">
        {banner}

        {page === "overview" && (
          <div className="max-w-3xl space-y-5">
            <PageHeader title="Overview">Everything you need to get {selected.name} running.</PageHeader>

            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { label: "Gateway", value: status.live ? "Connected" : "Offline", hint: status.live ? "Polling now" : status.label },
                { label: "Spaces", value: String(selected.space_count), hint: selected.is_public ? "Public bot" : "Private bot" },
                { label: "Commands", value: commands === null ? "…" : String(commands.length), hint: "Slash commands" },
                { label: "Created", value: new Date(selected.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" }), hint: new Date(selected.created_at).getFullYear().toString() },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-divider bg-bg-secondary p-4">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-text-muted">{s.label}</p>
                  <p className="mt-1 flex items-center gap-2 truncate text-[20px] font-bold text-header-primary">
                    {s.label === "Gateway" && <StatusDot live={status.live} />}{s.value}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-text-muted">{s.hint}</p>
                </div>
              ))}
            </div>

            <Card title="Setup" icon={CircleCheck} description={`${doneCount} of ${checklist.length} done`}>
              <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-bg-tertiary">
                <div className="h-full rounded-full bg-status-online transition-[width] duration-500" style={{ width: `${(doneCount / checklist.length) * 100}%` }} />
              </div>
              <ul className="space-y-1">
                {checklist.map((c) => (
                  <li key={c.label} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
                    {c.done
                      ? <CircleCheck size={18} className="shrink-0 text-status-online" />
                      : <Circle size={18} className="shrink-0 text-interactive-muted" />}
                    <span className={`flex-1 text-[14px] ${c.done ? "text-text-muted line-through decoration-text-muted/40" : "text-text-normal"}`}>{c.label}</span>
                    {!c.done && c.action && (c.action.href
                      ? <a href={c.action.href} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-text-link hover:underline">{c.action.label}</a>
                      : <button type="button" onClick={() => go(c.action!.page!)} className="text-[13px] font-semibold text-text-link hover:underline">{c.action.label}</button>)}
                  </li>
                ))}
              </ul>
            </Card>

            <QuickStart />

            <Card title="New in the API" icon={Sparkles} description="Recent additions for bots. Update @disband/bot or disband-bot to 0.3.0 to use them from the libraries.">
              <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {WHATS_NEW.map((w) => (
                  <li key={w.title}>
                    <p className="text-[14px] font-semibold text-header-primary">{w.title}</p>
                    <p className="text-[13px] leading-snug text-text-muted">{w.body}</p>
                  </li>
                ))}
              </ul>
              <a href={`${DOCS_URL}/api-reference/`} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-text-link hover:underline">
                Read the API reference <ExternalLink size={12} />
              </a>
            </Card>
          </div>
        )}

        {page === "general" && (
          <div className="max-w-2xl space-y-6">
            <PageHeader title="General information">What people see when they find your app, add it to a space or open its profile.</PageHeader>
            <Card>
              <div className="space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <ImagePick label="App icon" url={draft.avatar} busy={uploading === "avatar"} onPick={(f) => void pickImage("avatar", f)} onClear={() => setDraft((d) => ({ ...d, avatar: "" }))} />
                  <ImagePick label="Banner" wide url={draft.banner} busy={uploading === "banner"} onPick={(f) => void pickImage("banner", f)} onClear={() => setDraft((d) => ({ ...d, banner: "" }))} />
                </div>
                <Field label="Name">
                  <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} maxLength={25} className={INPUT} />
                </Field>
                <Field label="Description" hint={`Shown when someone adds your app. ${draft.description.length}/400`}>
                  <textarea value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} maxLength={400} rows={4} className={`${INPUT} resize-y`} />
                </Field>
                <Field label="Profile bio" hint="The About Me on the bot's profile.">
                  <textarea value={draft.bio} onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))} maxLength={190} rows={2} className={`${INPUT} resize-y`} />
                </Field>
                <div>
                  <Field label="Tags" hint="Up to 5, separated by commas, like moderation, music, games.">
                    <input value={draft.tags} onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))} className={INPUT} />
                  </Field>
                  {tagList.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {tagList.slice(0, 5).map((t) => <span key={t} className="rounded-full bg-bg-tertiary px-2.5 py-0.5 text-[12px] text-text-normal">{t.toLowerCase()}</span>)}
                    </div>
                  )}
                </div>
                <div className="grid gap-6 sm:grid-cols-2">
                  <Field label="Terms of Service URL">
                    <input value={draft.terms} onChange={(e) => setDraft((d) => ({ ...d, terms: e.target.value }))} placeholder="https://" className={INPUT} />
                  </Field>
                  <Field label="Privacy Policy URL">
                    <input value={draft.privacy} onChange={(e) => setDraft((d) => ({ ...d, privacy: e.target.value }))} placeholder="https://" className={INPUT} />
                  </Field>
                </div>
              </div>
            </Card>
            <Card title="Application ID" description="Use it in install links and when you talk to support.">
              <div className="flex items-center gap-2 rounded-lg bg-bg-tertiary px-3 py-2">
                <code className="min-w-0 flex-1 truncate text-[13px]">{selected.id}</code>
                <CopyButton text={selected.id} label="Copy application ID" compact />
              </div>
            </Card>
            <div className="sticky bottom-4 z-10 flex justify-end">
              <button type="button" disabled={saving || uploading !== null || !draft.name.trim()} className={`${PRIMARY} min-w-[132px] shadow-lg`}
                onClick={() => void save({
                  name: draft.name,
                  avatarUrl: draft.avatar.trim() || null,
                  bannerUrl: draft.banner || null,
                  bio: draft.bio,
                  description: draft.description,
                  tags: tagList,
                  termsUrl: draft.terms,
                  privacyUrl: draft.privacy,
                }, "Changes saved.")}>
                {saving ? <LoadingDots size={6} className="mx-auto" /> : "Save changes"}
              </button>
            </div>
          </div>
        )}

        {page === "bot" && (
          <div className="max-w-3xl space-y-5">
            <PageHeader title="Bot">Your bot&apos;s token, who can add it, and everything it&apos;s allowed to ask spaces for.</PageHeader>

            <Card title="Token" icon={KeyRound}
              description={<>Tokens are only shown once. If you lost yours or think it leaked, reset it. The current one starts <code className="rounded bg-bg-tertiary px-1 text-text-normal">{selected.token_prefix ?? "—"}…</code></>}
              actions={<button type="button" onClick={() => void resetToken()} className={PRIMARY}>Reset token</button>} />

            <Card title="Public bot" icon={Globe}
              description="On: anyone who manages a space can add it with your install link. Off: only you can add it."
              actions={<Toggle label="Public bot" checked={selected.is_public} onChange={(v) => void save({ isPublic: v }, v ? "Your bot is public." : "Your bot is private.")} />} />

            <Card title="Connection" icon={Activity}
              description={<span className="flex items-center gap-2"><StatusDot live={status.live} />{status.label}</span>}>
              <p className="text-[13px] leading-relaxed text-text-muted">
                Your bot connects by polling <code className="rounded bg-bg-tertiary px-1 text-text-normal">GET /api/v1/gateway</code> with the header{" "}
                <code className="rounded bg-bg-tertiary px-1 text-text-normal">Authorization: Bot &lt;token&gt;</code>. The client libraries do this for you and
                retry when they&apos;re rate limited.
              </p>
            </Card>

            <div className="space-y-4 pt-2">
              <div>
                <h3 className="text-[18px] font-semibold text-header-primary">Permissions</h3>
                <p className="mt-1 text-[14px] text-text-muted">Everything this bot is allowed to ask for. Spaces grant some or all of these when they add it. Slash commands and buttons work without any of them.</p>
              </div>
              <ScopePicker value={draftScopes} onChange={setDraftScopes} />
              <button type="button" disabled={saving || draftScopes.length === 0} onClick={() => void save({ scopes: draftScopes }, "Permissions saved.")} className={`${PRIMARY} min-w-[150px]`}>
                {saving ? <LoadingDots size={6} className="mx-auto" /> : "Save permissions"}
              </button>
            </div>
          </div>
        )}

        {page === "commands" && (
          <div className="max-w-3xl space-y-5">
            <PageHeader title="Commands">
              Slash commands your bot registered. They show up in the &ldquo;/&rdquo; list in every space it&apos;s in.
            </PageHeader>
            {commands === null ? (
              <div className="h-24 animate-pulse rounded-xl bg-bg-secondary" />
            ) : commands.length === 0 ? (
              <Card title="No commands yet" icon={SquareSlash} description="Register them from your bot's code. This replaces the whole list:">
                <pre className="overflow-x-auto rounded-lg bg-bg-tertiary p-4 text-[13px] leading-relaxed">{`curl -X PUT https://www.disband.dev/api/v1/commands \\
  -H "Authorization: Bot $DISBAND_BOT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "commands": [{ "name": "ping", "description": "Check the bot is alive" }] }'`}</pre>
                <p className="mt-3 text-[13px] text-text-muted">
                  Or <code className="rounded bg-bg-tertiary px-1">client.setCommands([...])</code> in the libraries. See{" "}
                  <a className="text-text-link hover:underline" href={`${DOCS_URL}/api-reference/#slash-commands`} target="_blank" rel="noreferrer">slash commands</a> for options, replies and buttons.
                </p>
              </Card>
            ) : (
              <ul className="divide-y divide-divider overflow-hidden rounded-xl border border-divider bg-bg-secondary">
                {commands.map((c) => (
                  <li key={c.id} className="flex items-start gap-4 p-4 transition-colors hover:bg-bg-secondary-alt">
                    <span aria-hidden className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-tertiary text-[16px] font-bold text-text-muted">/</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-header-primary">/{c.name}</p>
                      <p className="text-[14px] text-text-muted">{c.description}</p>
                      {c.options.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {c.options.map((o) => (
                            <span key={o.name} className="rounded-md bg-bg-tertiary px-2 py-0.5 text-[12px] text-text-normal" title={o.description}>
                              {o.name}
                              <span className="text-text-muted"> · {o.type}{o.required ? "" : " · optional"}{o.choices?.length ? ` · ${o.choices.length} choices` : ""}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={() => void deleteCommand(c.name)} className="shrink-0 rounded-lg px-2 py-1 text-[13px] text-text-muted transition-colors hover:bg-status-dnd/10 hover:text-status-dnd">Delete</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {page === "install" && (
          <div className="space-y-6">
            <PageHeader title="Installation">
              One link for everyone. Anyone who manages a space can open it, pick their space and add the bot with these permissions.
              {!selected.is_public && " Your bot is private, so only you can use the link."}
            </PageHeader>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="space-y-4">
                <ScopePicker value={installScopes} onChange={(v) => { setInstallScopes(v); setInstallUrl(null); }} allowed={selected.scopes} />
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" disabled={installScopes.length === 0} onClick={() => void makeLink()} className={PRIMARY}>
                    <Link2 size={15} /> Generate install link
                  </button>
                </div>
                {installUrl && (
                  <div className="flex items-center gap-2 rounded-lg border border-divider bg-bg-secondary px-3 py-2">
                    <code className="min-w-0 flex-1 truncate text-[13px]">{installUrl}</code>
                    <CopyButton text={installUrl} label="Copy install link" compact />
                    <a href={installUrl} target="_blank" rel="noreferrer" aria-label="Open install link"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-interactive-hover hover:text-header-primary">
                      <ExternalLink size={15} />
                    </a>
                  </div>
                )}
              </div>
              <aside aria-label="What a space owner sees" className="h-fit rounded-xl border border-divider bg-bg-secondary p-5 xl:sticky xl:top-20">
                <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-text-muted">What they&apos;ll see</p>
                <div className="mt-3 flex items-center gap-3">
                  <Initial bot={selected} size={44} />
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-header-primary">{selected.name}</p>
                    <p className="text-[12px] text-text-muted">wants to join your space</p>
                  </div>
                </div>
                <p className="mt-4 text-[13px] font-semibold text-header-secondary">It will be able to</p>
                {installScopes.length === 0 ? (
                  <p className="mt-2 text-[13px] text-text-muted">Answer slash commands and buttons only.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {installScopes.filter((s) => BOT_SCOPE_LABELS[s]).map((s) => (
                      <li key={s} className="flex items-start gap-2 text-[13px] text-text-normal">
                        <Check size={14} strokeWidth={2.6} className="mt-0.5 shrink-0 text-status-online" />
                        {BOT_SCOPE_LABELS[s].label}
                      </li>
                    ))}
                  </ul>
                )}
              </aside>
            </div>
          </div>
        )}

        {page === "danger" && (
          <div className="max-w-2xl space-y-6">
            <PageHeader title="Danger zone">Actions here can&apos;t be undone.</PageHeader>
            <Card tone="danger" icon={TriangleAlert} title="Delete this application"
              description="Its token stops working at once, its commands disappear and the bot leaves every space.">
              <button type="button" onClick={() => void revoke(selected)} className="rounded-lg bg-button-danger px-4 py-2 text-[14px] font-semibold text-white transition-colors hover:bg-button-danger-hover">Delete application</button>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
