"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";
import { BOT_SCOPE_LABELS, BOT_SCOPE_ORDER } from "@/lib/bot-scopes";
import type { BotScope } from "@/lib/bot-auth";
import { confirmDialog } from "@/lib/dialogs";

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
}

type Pane = "overview" | "permissions" | "install" | "danger";

const GROUPS: { label: string; scopes: BotScope[] }[] = [
  { label: "Messages", scopes: ["messages.read", "messages.write", "messages.delete", "messages.react"] },
  { label: "Members", scopes: ["members.read", "members.kick", "members.ban", "members.timeout"] },
  { label: "Channels", scopes: ["channels.read", "channels.manage", "webhooks.manage"] },
];

async function post<T>(url: string, body: unknown): Promise<{ ok: boolean; data: T & { error?: string } }> {
  const res = await apiFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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

function ScopePicker({ value, onChange, allowed }: { value: BotScope[]; onChange: (v: BotScope[]) => void; allowed?: BotScope[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
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

/** The developer portal: your applications, their bots, permissions and install links. */
export function DeveloperPortal() {
  const { user } = useApp();
  const [bots, setBots] = useState<Bot[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pane, setPane] = useState<Pane>("overview");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftAvatar, setDraftAvatar] = useState("");
  const [draftScopes, setDraftScopes] = useState<BotScope[]>([]);
  const [installScopes, setInstallScopes] = useState<BotScope[]>([]);
  const [installUrl, setInstallUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/bot/list");
    const json = (await res.json().catch(() => ({}))) as { bots?: Bot[]; error?: string };
    if (!res.ok) setError(json.error ?? "Couldn't load your applications.");
    setBots(json.bots ?? []);
  }, []);
  useEffect(() => { if (user) void load(); }, [user, load]);

  const live = useMemo(() => (bots ?? []).filter((b) => !b.revoked_at), [bots]);
  const selected = live.find((b) => b.id === selectedId) ?? live[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    setDraftName(selected.name);
    setDraftAvatar(selected.avatar_url ?? "");
    setDraftScopes(selected.scopes);
    setInstallScopes(selected.scopes);
    setInstallUrl(null);
    setError(null);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create() {
    setSaving(true);
    setError(null);
    const { ok, data } = await post<{ bot?: { id: string }; token?: string }>("/api/bot/register", { name: newName.trim(), scopes: ["messages.read", "messages.write"] });
    setSaving(false);
    if (!ok || !data.bot) return setError(data.error ?? "Couldn't create the application.");
    setToken(data.token ?? null);
    setCreating(false);
    setNewName("");
    await load();
    setSelectedId(data.bot.id);
    setPane("overview");
  }

  async function save(patch: Record<string, unknown>) {
    if (!selected) return;
    setSaving(true);
    setError(null);
    const { ok, data } = await post("/api/bot/update", { botId: selected.id, ...patch });
    setSaving(false);
    if (!ok) setError(data.error ?? "Couldn't save.");
    else void load();
  }

  async function makeLink() {
    if (!selected) return;
    setError(null);
    const { ok, data } = await post<{ url?: string }>("/api/bot/install-link", { botId: selected.id, scopes: installScopes });
    if (!ok || !data.url) setError(data.error ?? "Couldn't make the link.");
    else setInstallUrl(data.url);
  }

  async function revoke() {
    if (!selected) return;
    const ok = await confirmDialog({ title: `Revoke ${selected.name}?`, body: "Its token stops working immediately and it leaves every space. This can't be undone.", confirmLabel: "Revoke" });
    if (!ok) return;
    const res = await post("/api/bot/revoke", { botId: selected.id });
    if (!res.ok) setError(res.data.error ?? "Couldn't revoke.");
    else { setSelectedId(null); void load(); }
  }

  if (!user) return <p className="py-20 text-center text-text-muted">Sign in to Disband to manage your applications.</p>;

  return (
    <div className="grid gap-6 md:grid-cols-[260px_1fr]">
      <aside className="space-y-2">
        <button type="button" onClick={() => { setCreating(true); setError(null); }}
          className="w-full rounded-lg bg-brand px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-brand-hover">
          New application
        </button>
        <nav aria-label="Your applications" className="space-y-1 pt-2">
          {bots === null && <div className="h-12 animate-pulse rounded-lg bg-bg-secondary" />}
          {bots !== null && live.length === 0 && <p className="px-2 text-[13px] text-text-muted">No applications yet.</p>}
          {live.map((b) => (
            <button key={b.id} type="button" onClick={() => { setSelectedId(b.id); setPane("overview"); }}
              className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${selected?.id === b.id ? "bg-bg-modifier-selected bg-interactive-hover" : "hover:bg-interactive-hover"}`}>
              <Initial bot={b} size={32} />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold text-header-primary">{b.name}</span>
                <span className="block text-[12px] text-text-muted">{b.last_seen_at ? `Online ${new Date(b.last_seen_at).toLocaleDateString()}` : "Never connected"}</span>
              </span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="min-w-0 rounded-xl bg-bg-secondary">
        {error && <p role="alert" className="m-5 mb-0 rounded-md bg-status-dnd/15 px-3 py-2 text-[14px] text-status-dnd">{error}</p>}
        {token && (
          <div className="m-5 mb-0 rounded-lg border border-status-idle/40 bg-status-idle/10 p-4">
            <p className="text-[14px] font-semibold text-header-primary">Your bot token. Copy it now: it&apos;s only shown once.</p>
            <code className="mt-2 block break-all rounded bg-bg-tertiary px-3 py-2 text-[13px]">{token}</code>
            <div className="mt-2 flex gap-2">
              <button type="button" className="rounded bg-brand px-3 py-1.5 text-[13px] font-semibold text-white" onClick={() => void navigator.clipboard.writeText(token)}>Copy token</button>
              <button type="button" className="rounded px-3 py-1.5 text-[13px] text-text-muted hover:underline" onClick={() => setToken(null)}>I&apos;ve saved it</button>
            </div>
          </div>
        )}

        {creating ? (
          <div className="space-y-4 p-6">
            <h2 className="text-xl font-bold text-header-primary">New application</h2>
            <p className="text-[14px] text-text-muted">An application comes with a bot account. You can change its name, picture and permissions later.</p>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={25} placeholder="Application name" autoFocus
              className="w-full max-w-sm rounded-[3px] bg-bg-tertiary px-3 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-[#00a8fc]" />
            <div className="flex gap-2">
              <button type="button" disabled={saving || !newName.trim()} onClick={() => void create()} className="rounded bg-brand px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-50">{saving ? "Creating…" : "Create"}</button>
              <button type="button" onClick={() => setCreating(false)} className="rounded px-4 py-2 text-[14px] text-text-normal hover:underline">Cancel</button>
            </div>
          </div>
        ) : selected ? (
          <>
            <header className="flex items-center gap-4 border-b border-divider p-6">
              <Initial bot={selected} size={56} />
              <div className="min-w-0">
                <h2 className="truncate text-xl font-bold text-header-primary">{selected.name}</h2>
                <p className="text-[13px] text-text-muted">Application ID <code>{selected.id}</code></p>
              </div>
            </header>
            <div role="tablist" className="flex gap-1 border-b border-divider px-4">
              {(["overview", "permissions", "install", "danger"] as Pane[]).map((p) => (
                <button key={p} role="tab" type="button" aria-selected={pane === p} onClick={() => setPane(p)}
                  className={`border-b-2 px-3 py-3 text-[14px] font-semibold capitalize transition-colors ${pane === p ? "border-brand text-header-primary" : "border-transparent text-text-muted hover:text-text-normal"}`}>
                  {p === "danger" ? "Danger zone" : p}
                </button>
              ))}
            </div>
            <div className="p-6">
              {pane === "overview" && (
                <div className="max-w-lg space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-bold uppercase text-text-muted">Name</span>
                    <input value={draftName} onChange={(e) => setDraftName(e.target.value)} maxLength={25} className="w-full rounded-[3px] bg-bg-tertiary px-3 py-2.5 outline-none focus:ring-2 focus:ring-[#00a8fc]" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-bold uppercase text-text-muted">Picture URL</span>
                    <input value={draftAvatar} onChange={(e) => setDraftAvatar(e.target.value)} placeholder="https://…" className="w-full rounded-[3px] bg-bg-tertiary px-3 py-2.5 outline-none focus:ring-2 focus:ring-[#00a8fc]" />
                  </label>
                  <dl className="grid grid-cols-2 gap-3 text-[13px]">
                    <div><dt className="text-text-muted">Token</dt><dd className="font-mono">{selected.token_prefix ? `${selected.token_prefix}…` : "—"}</dd></div>
                    <div><dt className="text-text-muted">Created</dt><dd>{new Date(selected.created_at).toLocaleDateString()}</dd></div>
                  </dl>
                  <button type="button" disabled={saving} onClick={() => void save({ name: draftName, avatarUrl: draftAvatar.trim() || null })} className="rounded bg-brand px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-50">
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                  <p className="text-[13px] text-text-muted">Building something? Read the <a className="text-text-link hover:underline" href="/developers/docs">bot docs</a>.</p>
                </div>
              )}
              {pane === "permissions" && (
                <div className="space-y-4">
                  <p className="text-[14px] text-text-muted">Everything this bot is allowed to ask for. Spaces grant some or all of these when they add it.</p>
                  <ScopePicker value={draftScopes} onChange={setDraftScopes} />
                  <button type="button" disabled={saving || draftScopes.length === 0} onClick={() => void save({ scopes: draftScopes })} className="rounded bg-brand px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-50">
                    {saving ? "Saving…" : "Save permissions"}
                  </button>
                </div>
              )}
              {pane === "install" && (
                <div className="space-y-4">
                  <p className="text-[14px] text-text-muted">One link for everyone. Anyone who manages a space can open it, pick their space and add the bot with these permissions.</p>
                  <ScopePicker value={installScopes} onChange={(v) => { setInstallScopes(v); setInstallUrl(null); }} allowed={selected.scopes} />
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" disabled={installScopes.length === 0} onClick={() => void makeLink()} className="rounded bg-brand px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-50">Get install link</button>
                    {installUrl && (
                      <>
                        <code className="max-w-full truncate rounded bg-bg-tertiary px-3 py-2 text-[13px]">{installUrl}</code>
                        <button type="button" className="rounded border border-divider px-3 py-2 text-[13px] hover:bg-interactive-hover"
                          onClick={() => { void navigator.clipboard.writeText(installUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                          {copied ? "Copied" : "Copy"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
              {pane === "danger" && (
                <div className="max-w-lg rounded-lg border border-status-dnd/40 p-5">
                  <h3 className="font-semibold text-header-primary">Revoke this application</h3>
                  <p className="mt-1 text-[14px] text-text-muted">Its token stops working at once and the bot leaves every space.</p>
                  <button type="button" onClick={() => void revoke()} className="mt-3 rounded bg-button-danger px-4 py-2 text-[14px] font-semibold text-white">Revoke</button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="p-10 text-center">
            <p className="text-lg font-semibold text-header-primary">Build something for Disband</p>
            <p className="mt-1 text-[14px] text-text-muted">Create an application to get a bot, its token and an install link anyone can use.</p>
          </div>
        )}
      </section>
    </div>
  );
}
