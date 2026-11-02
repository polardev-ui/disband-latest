"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";
import { BOT_SCOPE_LABELS } from "@/lib/bot-scopes";
import type { BotScope } from "@/lib/bot-auth";
import type { CommandOption } from "@/lib/bot-commands";
import { confirmDialog } from "@/lib/dialogs";
import { uploadMedia } from "@/lib/media/uploadMedia";
import { getSupabaseClient } from "@/lib/supabase/client";

/*
 The developer portal, laid out like Discord's: a grid of your applications,
 and inside one a sidebar of pages.

   General Information   name, picture, banner, description, tags, legal links
   Bot                   token reset, public/private, gateway status, scopes
   Commands              the slash commands the bot registered
   Installation          the install link and the permissions it asks for
   Danger zone           revoke
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

type Page = "general" | "bot" | "commands" | "install" | "danger";

const PAGES: { id: Page; label: string }[] = [
  { id: "general", label: "General Information" },
  { id: "bot", label: "Bot" },
  { id: "commands", label: "Commands" },
  { id: "install", label: "Installation" },
  { id: "danger", label: "Danger zone" },
];

const GROUPS: { label: string; scopes: BotScope[] }[] = [
  { label: "Messages", scopes: ["messages.read", "messages.write", "messages.delete", "messages.react"] },
  { label: "Members", scopes: ["members.read", "members.kick", "members.ban", "members.timeout"] },
  { label: "Channels", scopes: ["channels.read", "channels.manage", "webhooks.manage"] },
  { label: "Roles", scopes: ["roles.manage"] },
];

const INPUT = "w-full rounded-[3px] bg-bg-tertiary px-3 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-[#00a8fc]";
const PRIMARY = "rounded bg-brand px-4 py-2 text-[14px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50";
const SECONDARY = "rounded bg-button-secondary px-4 py-2 text-[14px] font-semibold text-header-primary hover:bg-button-secondary-hover disabled:opacity-50";

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
      <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.02em] text-header-secondary">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[13px] text-text-muted">{hint}</span>}
    </label>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? "bg-status-online" : "bg-interactive-muted"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-[left] ${checked ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

function ImagePick({ label, url, wide, busy, onPick, onClear }: {
  label: string; url: string; wide?: boolean; busy: boolean; onPick: (file: File) => void; onClear: () => void;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.02em] text-header-secondary">{label}</span>
      <div className="flex items-center gap-3">
        <div className={`shrink-0 overflow-hidden bg-bg-tertiary ${wide ? "h-16 w-36 rounded-md" : "h-16 w-16 rounded-full"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {url && <img src={url} alt="" className="h-full w-full object-cover" />}
        </div>
        <label className={`cursor-pointer ${SECONDARY} ${busy ? "pointer-events-none opacity-50" : ""}`}>
          {busy ? "Uploading…" : url ? "Change" : "Upload"}
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
    <div className="grid gap-4 lg:grid-cols-3">
      {GROUPS.map((g) => (
        <fieldset key={g.label} className="rounded-lg border border-divider p-4">
          <legend className="px-1 text-[12px] font-bold uppercase tracking-[0.04em] text-text-muted">{g.label}</legend>
          {g.scopes.map((s) => {
            const disabled = allowed ? !allowed.includes(s) : false;
            return (
              <label key={s} className={`flex gap-2.5 py-2 ${disabled ? "opacity-40" : "cursor-pointer"}`}>
                <input type="checkbox" className="mt-1 accent-[#5865f2]" disabled={disabled} checked={value.includes(s)}
                  onChange={(e) => onChange(e.target.checked ? [...value, s] : value.filter((x) => x !== s))} />
                <span>
                  <span className="block text-[14px] font-semibold text-header-primary">{BOT_SCOPE_LABELS[s].label}</span>
                  <span className="block text-[12px] text-text-muted">{BOT_SCOPE_LABELS[s].description}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={SECONDARY}
      onClick={() => { void navigator.clipboard.writeText(text); setDone(true); window.setTimeout(() => setDone(false), 1500); }}>
      {done ? "Copied" : label}
    </button>
  );
}

function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-6">
      <h2 className="text-[24px] font-bold text-header-primary">{title}</h2>
      {children && <p className="mt-1 max-w-2xl text-[15px] text-text-muted">{children}</p>}
    </header>
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
  const [page, setPage] = useState<Page>("general");
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

  function open(id: string, p: Page = "general") {
    setSelectedId(id);
    setPage(p);
    setCreating(false);
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
    open(data.bot.id, "bot");
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
    const ok = await confirmDialog({ title: "Reset the token?", body: "The current token stops working straight away. Any running copy of your bot disconnects until you give it the new one.", confirmLabel: "Reset token" });
    if (!ok) return;
    const { ok: done, data } = await call<{ token?: string }>("/api/bot/reset-token", { botId: selected.id });
    if (!done || !data.token) return setError(data.error ?? "Couldn't reset the token.");
    setToken(data.token);
    void load();
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
    const ok = await confirmDialog({ title: `Delete /${name}?`, body: "It disappears from every space. Your bot can register it again at any time.", confirmLabel: "Delete" });
    if (!ok) return;
    const res = await apiFetch(`/api/bot/commands?botId=${encodeURIComponent(selected.id)}&name=${encodeURIComponent(name)}`, { method: "DELETE" });
    if (!res.ok) setError("Couldn't delete that command.");
    void loadCommands(selected.id);
  }

  async function revoke(bot: Bot) {
    const ok = await confirmDialog({ title: `Delete ${bot.name}?`, body: "Its token stops working immediately and the bot leaves every space. This can't be undone.", confirmLabel: "Delete application" });
    if (!ok) return;
    const res = await call("/api/bot/revoke", { botId: bot.id });
    if (!res.ok) return setError(res.data.error ?? "Couldn't delete.");
    setSelectedId(null);
    void load();
  }

  if (!user) return <p className="py-20 text-center text-text-muted">Sign in to Disband to manage your applications.</p>;

  const banner = (
    <>
      {error && <p role="alert" className="mb-4 rounded-md bg-status-dnd/15 px-3 py-2 text-[14px] text-status-dnd">{error}</p>}
      {notice && !error && <p role="status" className="mb-4 rounded-md bg-status-online/15 px-3 py-2 text-[14px] text-status-online">{notice}</p>}
      {token && (
        <div className="mb-6 rounded-lg border border-status-idle/40 bg-status-idle/10 p-4">
          <p className="text-[14px] font-semibold text-header-primary">Your bot token. Copy it now: it&apos;s only shown once.</p>
          <p className="mt-1 text-[13px] text-text-muted">Keep it secret. Anyone with it can act as your bot. Never put it in a public repository.</p>
          <code className="mt-2 block break-all rounded bg-bg-tertiary px-3 py-2 text-[13px]">{token}</code>
          <div className="mt-2 flex gap-2">
            <CopyButton text={token} label="Copy token" />
            <button type="button" className="rounded px-3 py-1.5 text-[13px] text-text-muted hover:underline" onClick={() => setToken(null)}>I&apos;ve saved it</button>
          </div>
        </div>
      )}
    </>
  );

  // --- The application list -----------------------------------------------------
  if (!selected) {
    return (
      <div>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[28px] font-bold text-header-primary">Applications</h2>
            <p className="text-[15px] text-text-muted">Each application has a bot account, a token, slash commands and an install link.</p>
          </div>
          <button type="button" onClick={() => { setCreating(true); setError(null); }} className={PRIMARY}>New Application</button>
        </div>
        {banner}
        {creating && (
          <div className="mb-6 max-w-md space-y-3 rounded-xl bg-bg-secondary p-5">
            <h3 className="text-lg font-bold text-header-primary">Create an application</h3>
            <Field label="Name" hint="You can change it, its picture and its permissions later.">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={25} autoFocus className={INPUT}
                onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) void create(); }} />
            </Field>
            <div className="flex gap-2">
              <button type="button" disabled={saving || !newName.trim()} onClick={() => void create()} className={PRIMARY}>{saving ? "Creating…" : "Create"}</button>
              <button type="button" onClick={() => setCreating(false)} className="rounded px-4 py-2 text-[14px] text-text-normal hover:underline">Cancel</button>
            </div>
          </div>
        )}
        {bots === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2].map((i) => <div key={i} className="h-44 animate-pulse rounded-xl bg-bg-secondary" />)}
          </div>
        ) : live.length === 0 && !creating ? (
          <div className="rounded-xl bg-bg-secondary p-10 text-center">
            <p className="text-lg font-semibold text-header-primary">Build something for Disband</p>
            <p className="mt-1 text-[14px] text-text-muted">Create an application to get a bot, its token and an install link anyone can use.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {live.map((b) => {
              const status = gatewayStatus(b.last_seen_at);
              return (
                <button key={b.id} type="button" onClick={() => open(b.id)}
                  className="group flex flex-col items-center rounded-xl bg-bg-secondary p-5 text-center transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-bg-secondary-alt">
                  <Initial bot={b} size={80} />
                  <span className="mt-3 w-full truncate text-[16px] font-semibold text-header-primary">{b.name}</span>
                  <span className="mt-1 flex items-center gap-1.5 text-[12px] text-text-muted">
                    <span className={`h-2 w-2 rounded-full ${status.live ? "bg-status-online" : "bg-interactive-muted"}`} />
                    {status.live ? "Connected" : `${b.space_count} ${b.space_count === 1 ? "space" : "spaces"}`}
                  </span>
                  {dupes.has(b.name.toLowerCase()) && (
                    <span className="mt-2 rounded bg-status-idle/15 px-2 py-0.5 text-[11px] font-semibold text-status-idle">Same name as another app</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        <p className="mt-8 text-[13px] text-text-muted">You can have up to 5 applications. New to bots? Start with the <a className="text-text-link hover:underline" href="/developers/docs">docs</a>.</p>
      </div>
    );
  }

  // --- One application ------------------------------------------------------------
  const status = gatewayStatus(selected.last_seen_at);
  const tagList = draft.tags.split(",").map((t) => t.trim()).filter(Boolean);

  return (
    <div className="grid gap-8 md:grid-cols-[232px_1fr]">
      <aside>
        <button type="button" onClick={() => setSelectedId(null)} className="mb-4 flex items-center gap-1 text-[14px] text-text-muted hover:text-text-normal">
          <span aria-hidden>←</span> All applications
        </button>
        <div className="mb-4 flex items-center gap-3 px-1">
          <Initial bot={selected} size={40} />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold text-header-primary">{selected.name}</span>
            <span className="flex items-center gap-1.5 text-[12px] text-text-muted">
              <span className={`h-2 w-2 rounded-full ${status.live ? "bg-status-online" : "bg-interactive-muted"}`} />
              {status.live ? "Connected" : "Offline"}
            </span>
          </span>
        </div>
        <nav aria-label="Application settings" className="space-y-0.5">
          {PAGES.map((p) => (
            <button key={p.id} type="button" onClick={() => { setPage(p.id); setNotice(null); setError(null); }}
              aria-current={page === p.id ? "page" : undefined}
              className={`flex w-full items-center justify-between rounded-[4px] px-2.5 py-1.5 text-left text-[15px] font-medium transition-colors ${
                page === p.id ? "bg-interactive-hover text-header-primary" : p.id === "danger" ? "text-status-dnd hover:bg-interactive-hover" : "text-text-muted hover:bg-interactive-hover hover:text-text-normal"
              }`}>
              {p.label}
              {p.id === "commands" && commands && commands.length > 0 && (
                <span className="rounded-full bg-bg-tertiary px-1.5 text-[12px] text-text-muted">{commands.length}</span>
              )}
            </button>
          ))}
        </nav>
      </aside>

      <section className="min-w-0">
        {banner}

        {page === "general" && (
          <div className="max-w-2xl space-y-6">
            <PageHeader title="General Information">What people see when they find your app, add it to a space or open its profile.</PageHeader>
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
            <Field label="Tags" hint="Up to 5, separated by commas, like moderation, music, games.">
              <input value={draft.tags} onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))} className={INPUT} />
            </Field>
            {tagList.length > 0 && (
              <div className="-mt-3 flex flex-wrap gap-1.5">
                {tagList.slice(0, 5).map((t) => <span key={t} className="rounded-full bg-bg-tertiary px-2.5 py-0.5 text-[12px] text-text-normal">{t.toLowerCase()}</span>)}
              </div>
            )}
            <div className="grid gap-6 sm:grid-cols-2">
              <Field label="Terms of Service URL">
                <input value={draft.terms} onChange={(e) => setDraft((d) => ({ ...d, terms: e.target.value }))} placeholder="https://" className={INPUT} />
              </Field>
              <Field label="Privacy Policy URL">
                <input value={draft.privacy} onChange={(e) => setDraft((d) => ({ ...d, privacy: e.target.value }))} placeholder="https://" className={INPUT} />
              </Field>
            </div>
            <dl className="grid gap-4 rounded-lg bg-bg-secondary p-4 text-[14px] sm:grid-cols-3">
              <div>
                <dt className="text-[12px] font-bold uppercase text-header-secondary">Application ID</dt>
                <dd className="mt-1 flex items-center gap-2"><code className="truncate text-[13px]">{selected.id}</code></dd>
                <dd className="mt-2"><CopyButton text={selected.id} /></dd>
              </div>
              <div>
                <dt className="text-[12px] font-bold uppercase text-header-secondary">Spaces</dt>
                <dd className="mt-1 text-[20px] font-semibold text-header-primary">{selected.space_count}</dd>
              </div>
              <div>
                <dt className="text-[12px] font-bold uppercase text-header-secondary">Created</dt>
                <dd className="mt-1">{new Date(selected.created_at).toLocaleDateString()}</dd>
              </div>
            </dl>
            <button type="button" disabled={saving || uploading !== null || !draft.name.trim()} className={PRIMARY}
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
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        )}

        {page === "bot" && (
          <div className="max-w-3xl space-y-8">
            <PageHeader title="Bot">Your bot&apos;s token, who can add it, and everything it&apos;s allowed to ask spaces for.</PageHeader>

            <div className="rounded-lg bg-bg-secondary p-5">
              <h3 className="text-[16px] font-semibold text-header-primary">Token</h3>
              <p className="mt-1 text-[14px] text-text-muted">
                For security, tokens are only shown once. If you lost yours or think it leaked, reset it.
                Current token starts <code className="text-text-normal">{selected.token_prefix ?? "—"}…</code>
              </p>
              <button type="button" onClick={() => void resetToken()} className={`mt-3 ${PRIMARY}`}>Reset Token</button>
            </div>

            <div className="rounded-lg bg-bg-secondary p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-[16px] font-semibold text-header-primary">Public Bot</h3>
                  <p className="mt-1 text-[14px] text-text-muted">On: anyone who manages a space can add it with your install link. Off: only you can add it.</p>
                </div>
                <Toggle label="Public bot" checked={selected.is_public} onChange={(v) => void save({ isPublic: v }, v ? "Your bot is public." : "Your bot is private.")} />
              </div>
            </div>

            <div className="rounded-lg bg-bg-secondary p-5">
              <h3 className="text-[16px] font-semibold text-header-primary">Gateway</h3>
              <p className="mt-1 flex items-center gap-2 text-[14px] text-text-muted">
                <span className={`h-2.5 w-2.5 rounded-full ${status.live ? "bg-status-online" : "bg-interactive-muted"}`} />
                {status.label}
              </p>
              <p className="mt-2 text-[13px] text-text-muted">
                Your bot connects with <code>GET https://www.disband.dev/api/v1/gateway</code> and the header{" "}
                <code>Authorization: Bot &lt;token&gt;</code>.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-[16px] font-semibold text-header-primary">Permissions</h3>
                <p className="mt-1 text-[14px] text-text-muted">Everything this bot is allowed to ask for. Spaces grant some or all of these when they add it. Slash commands and buttons work without any of them.</p>
              </div>
              <ScopePicker value={draftScopes} onChange={setDraftScopes} />
              <button type="button" disabled={saving || draftScopes.length === 0} onClick={() => void save({ scopes: draftScopes }, "Permissions saved.")} className={PRIMARY}>
                {saving ? "Saving…" : "Save Permissions"}
              </button>
            </div>
          </div>
        )}

        {page === "commands" && (
          <div className="max-w-3xl space-y-6">
            <PageHeader title="Commands">
              Slash commands your bot registered. They show up in the &ldquo;/&rdquo; list in every space it&apos;s in.
            </PageHeader>
            {commands === null ? (
              <div className="h-24 animate-pulse rounded-lg bg-bg-secondary" />
            ) : commands.length === 0 ? (
              <div className="rounded-lg bg-bg-secondary p-6">
                <p className="font-semibold text-header-primary">No commands yet</p>
                <p className="mt-1 text-[14px] text-text-muted">Register them from your bot&apos;s code. This replaces the whole list:</p>
                <pre className="mt-3 overflow-x-auto rounded bg-bg-tertiary p-3 text-[13px]">{`curl -X PUT https://www.disband.dev/api/v1/commands \\
  -H "Authorization: Bot $DISBAND_BOT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '[{ "name": "ping", "description": "Check the bot is alive" }]'`}</pre>
                <p className="mt-3 text-[13px] text-text-muted">See <a className="text-text-link hover:underline" href="/developers/docs#commands">Slash Commands in the docs</a> for options, replies and buttons.</p>
              </div>
            ) : (
              <ul className="divide-y divide-divider overflow-hidden rounded-lg bg-bg-secondary">
                {commands.map((c) => (
                  <li key={c.id} className="flex items-start gap-4 p-4">
                    <span aria-hidden className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-tertiary text-[16px] font-bold text-text-muted">/</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-header-primary">/{c.name}</p>
                      <p className="text-[14px] text-text-muted">{c.description}</p>
                      {c.options.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {c.options.map((o) => (
                            <span key={o.name} className="rounded bg-bg-tertiary px-2 py-0.5 text-[12px] text-text-normal" title={o.description}>
                              {o.name}
                              <span className="text-text-muted"> · {o.type}{o.required ? "" : " · optional"}{o.choices?.length ? ` · ${o.choices.length} choices` : ""}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={() => void deleteCommand(c.name)} className="shrink-0 text-[13px] text-text-muted hover:text-status-dnd">Delete</button>
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
            <ScopePicker value={installScopes} onChange={(v) => { setInstallScopes(v); setInstallUrl(null); }} allowed={selected.scopes} />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={installScopes.length === 0} onClick={() => void makeLink()} className={PRIMARY}>Generate Install Link</button>
              {installUrl && (
                <>
                  <code className="max-w-full truncate rounded bg-bg-tertiary px-3 py-2 text-[13px]">{installUrl}</code>
                  <CopyButton text={installUrl} />
                </>
              )}
            </div>
          </div>
        )}

        {page === "danger" && (
          <div className="max-w-2xl space-y-6">
            <PageHeader title="Danger zone" />
            <div className="rounded-lg border border-status-dnd/40 p-5">
              <h3 className="font-semibold text-header-primary">Delete this application</h3>
              <p className="mt-1 text-[14px] text-text-muted">Its token stops working at once, its commands disappear and the bot leaves every space. This can&apos;t be undone.</p>
              <button type="button" onClick={() => void revoke(selected)} className="mt-3 rounded bg-button-danger px-4 py-2 text-[14px] font-semibold text-white hover:bg-button-danger-hover">Delete Application</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
