"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PUBLIC_ENV } from "@/lib/public-env";
import { confirmDialog } from "@/lib/dialogs";
import { SettingsSection, settingsInputClass } from "./SettingsPrimitives";
import { btn } from "@/components/modals/server-settings/ui";

interface Link {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  icon_url: string | null;
  redirect_uris: string[];
  secret_prefix: string | null;
  created_at: string;
}

interface Grant {
  link_id: string;
  scopes: string[];
  updated_at: string;
  link: { name: string; website: string | null; icon_url: string | null } | null;
}

const SCOPE_LABEL: Record<string, string> = {
  identify: "Your name and avatar",
  email: "Your email address",
  "activities.write": "Your game activity",
};

const BASE = PUBLIC_ENV.webAppUrl.replace(/\/$/, "");

function host(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).host; } catch { return null; }
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  };
  return { copied, copy };
}

function buttonSnippet(link: Link): string {
  const redirect = link.redirect_uris[0] ?? "https://example.com/callback";
  const href = `${BASE}/oauth2/authorize?response_type=code&client_id=${link.id}&redirect_uri=${encodeURIComponent(redirect)}&scope=identify`;
  return `<a href="${href}&state=YOUR_RANDOM_STATE"
   style="display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:8px;background:#5865f2;color:#fff;font:600 15px system-ui,sans-serif;text-decoration:none">
  <img src="${BASE}/logo-white.png" alt="" width="20" height="20">
  Sign in with Disband
</a>`;
}

/** Settings → Links: "Sign in with Disband" for developers, and the apps you have let in. */
export function LinksPanel() {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [redirects, setRedirects] = useState("");
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<{ linkId: string; value: string } | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const { copied, copy } = useCopy();

  const load = useCallback(async () => {
    const [l, g] = await Promise.all([apiFetch("/api/oauth2/links"), apiFetch("/api/oauth2/grants")]);
    const lj = (await l.json().catch(() => ({}))) as { links?: Link[]; error?: string };
    const gj = (await g.json().catch(() => ({}))) as { grants?: Grant[] };
    if (!l.ok) setNote({ tone: "error", text: lj.error ?? "Couldn't load your Links." });
    setLinks(lj.links ?? []);
    setGrants(gj.grants ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    setBusy(true);
    setNote(null);
    const res = await apiFetch("/api/oauth2/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, website: website || undefined, redirect_uris: redirects.split(/\s+/).filter(Boolean) }),
    });
    const json = (await res.json().catch(() => ({}))) as { link?: Link; client_secret?: string; error?: string };
    setBusy(false);
    if (!res.ok || !json.link) return setNote({ tone: "error", text: json.error ?? "Couldn't make the Link." });
    setSecret({ linkId: json.link.id, value: json.client_secret ?? "" });
    setCreating(false);
    setName(""); setWebsite(""); setRedirects("");
    void load();
  }

  async function saveRedirects(link: Link) {
    const list = (editing[link.id] ?? "").split(/\s+/).filter(Boolean);
    const res = await apiFetch(`/api/oauth2/links/${link.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirect_uris: list }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return setNote({ tone: "error", text: json.error ?? "Couldn't save." });
    setEditing((e) => { const next = { ...e }; delete next[link.id]; return next; });
    setNote({ tone: "ok", text: "Redirect URLs saved." });
    void load();
  }

  async function newSecret(link: Link) {
    if (!(await confirmDialog({ title: "Make a new secret?", body: "The current secret stops working straight away. Update your server before signing anyone in.", confirmLabel: "Make new secret" }))) return;
    const res = await apiFetch(`/api/oauth2/links/${link.id}/secret`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as { client_secret?: string; error?: string };
    if (!res.ok || !json.client_secret) return setNote({ tone: "error", text: json.error ?? "Couldn't make a new secret." });
    setSecret({ linkId: link.id, value: json.client_secret });
    void load();
  }

  async function remove(link: Link) {
    if (!(await confirmDialog({ title: `Delete ${link.name}?`, body: "Everyone signed in through it is signed out of your site's Disband access, and its button stops working.", confirmLabel: "Delete" }))) return;
    await apiFetch(`/api/oauth2/links/${link.id}`, { method: "DELETE" });
    void load();
  }

  async function revokeGrant(grant: Grant) {
    if (!(await confirmDialog({ title: `Remove ${grant.link?.name ?? "this app"}?`, body: "It loses access to your Disband account. You can sign in to it again later.", confirmLabel: "Remove access" }))) return;
    await apiFetch(`/api/oauth2/grants?link_id=${grant.link_id}`, { method: "DELETE" });
    void load();
  }

  return (
    <div className="space-y-6">
      {note && <p role="status" className={`rounded-md px-3 py-2 text-[14px] ${note.tone === "ok" ? "bg-status-online/15 text-status-online" : "bg-status-dnd/15 text-status-dnd"}`}>{note.text}</p>}

      <SettingsSection title="Apps you've signed in to" description="Sites and games you've used Sign in with Disband on. Removing one signs it out of your account.">
        {grants === null ? (
          <div className="m-5 h-12 animate-pulse rounded-md bg-bg-secondary" />
        ) : grants.length === 0 ? (
          <p className="px-5 py-4 text-[14px] text-text-muted">None yet.</p>
        ) : (
          <ul className="divide-y divide-divider">
            {grants.map((g) => (
              <li key={g.link_id} className="flex items-center gap-3 px-5 py-3">
                {g.link?.icon_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.link.icon_url} alt="" className="h-10 w-10 rounded-xl object-cover" />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand font-bold text-white">{(g.link?.name ?? "?").charAt(0).toUpperCase()}</span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-header-primary">{g.link?.name ?? "Removed app"}</span>
                  <span className="block truncate text-[13px] text-text-muted">
                    {[host(g.link?.website ?? null), g.scopes.map((s) => SCOPE_LABEL[s] ?? s).join(", ")].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <button type="button" onClick={() => void revokeGrant(g)} className={btn.secondary}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      <SettingsSection title="Your Links" description="Put a Sign in with Disband button on your website or game. Each Link gets a client ID and secret for the standard OAuth 2.0 flow.">
        <div className="space-y-4 px-5 py-4">
          {secret && (
            <div className="rounded-lg border border-status-idle/40 bg-status-idle/10 p-4">
              <p className="text-[14px] font-semibold text-header-primary">Client secret. Copy it now: it&apos;s only shown once.</p>
              <code className="mt-2 block break-all rounded bg-bg-tertiary px-3 py-2 text-[13px]">{secret.value}</code>
              <div className="mt-2 flex gap-2">
                <button type="button" className={btn.primary} onClick={() => copy("secret", secret.value)}>{copied === "secret" ? "Copied" : "Copy secret"}</button>
                <button type="button" className={btn.secondary} onClick={() => setSecret(null)}>I&apos;ve saved it</button>
              </div>
            </div>
          )}

          {links?.map((link) => {
            const editingValue = editing[link.id];
            return (
              <div key={link.id} className="rounded-lg bg-bg-secondary p-4">
                <div className="flex items-start gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold text-header-primary">{link.name}</span>
                    {link.website && <span className="block truncate text-[13px] text-text-muted">{host(link.website)}</span>}
                  </span>
                  <button type="button" onClick={() => void remove(link)} className="text-[13px] text-text-muted hover:text-status-dnd">Delete</button>
                </div>
                <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
                  <div>
                    <dt className="text-[12px] font-bold uppercase text-header-secondary">Client ID</dt>
                    <dd className="mt-1 flex items-center gap-2">
                      <code className="truncate rounded bg-bg-tertiary px-2 py-1">{link.id}</code>
                      <button type="button" className="text-text-link hover:underline" onClick={() => copy(`id-${link.id}`, link.id)}>{copied === `id-${link.id}` ? "Copied" : "Copy"}</button>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[12px] font-bold uppercase text-header-secondary">Client secret</dt>
                    <dd className="mt-1 flex items-center gap-2">
                      <code className="rounded bg-bg-tertiary px-2 py-1">{link.secret_prefix ? `${link.secret_prefix}…` : "None"}</code>
                      <button type="button" className="text-text-link hover:underline" onClick={() => void newSecret(link)}>New secret</button>
                    </dd>
                  </div>
                </dl>
                <div className="mt-3">
                  <p className="text-[12px] font-bold uppercase text-header-secondary">Redirect URLs</p>
                  {editingValue === undefined ? (
                    <div className="mt-1 flex items-start gap-2">
                      <ul className="min-w-0 flex-1 space-y-0.5 text-[13px] text-text-normal">
                        {link.redirect_uris.map((u) => <li key={u} className="truncate">{u}</li>)}
                      </ul>
                      <button type="button" className="text-[13px] text-text-link hover:underline" onClick={() => setEditing((e) => ({ ...e, [link.id]: link.redirect_uris.join("\n") }))}>Edit</button>
                    </div>
                  ) : (
                    <div className="mt-1 space-y-2">
                      <textarea value={editingValue} onChange={(e) => setEditing((s) => ({ ...s, [link.id]: e.target.value }))} rows={3} className={`${settingsInputClass} font-mono text-[13px]`} />
                      <div className="flex gap-2">
                        <button type="button" className={btn.primary} onClick={() => void saveRedirects(link)}>Save</button>
                        <button type="button" className={btn.secondary} onClick={() => setEditing((e) => { const next = { ...e }; delete next[link.id]; return next; })}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-[13px] font-semibold text-text-link">Button and setup</summary>
                  <div className="mt-2 space-y-2 text-[13px] text-text-muted">
                    <p>Put this on your sign-in page. Replace the state with a random value you check when the person comes back.</p>
                    <pre className="overflow-x-auto rounded bg-bg-tertiary p-3 text-[12px] text-text-normal">{buttonSnippet(link)}</pre>
                    <button type="button" className={btn.secondary} onClick={() => copy(`snippet-${link.id}`, buttonSnippet(link))}>{copied === `snippet-${link.id}` ? "Copied" : "Copy button"}</button>
                    <ol className="list-decimal space-y-1 pl-5">
                      <li>Disband sends the person back to your redirect URL with <code>?code=…&amp;state=…</code>.</li>
                      <li>From your server, POST <code>{BASE}/api/oauth2/token</code> with <code>grant_type=authorization_code</code>, the code, your client ID and secret.</li>
                      <li>Call <code>GET {BASE}/api/oauth2/userinfo</code> with <code>Authorization: Bearer &lt;access_token&gt;</code> to get their id, username and avatar.</li>
                    </ol>
                    <p>Apps that can&apos;t keep a secret (a single-page app or a game) use PKCE: send <code>code_challenge</code> with the button and <code>code_verifier</code> instead of the secret.</p>
                  </div>
                </details>
              </div>
            );
          })}

          {links?.length === 0 && !creating && <p className="text-[14px] text-text-muted">You haven&apos;t made a Link yet.</p>}

          {creating ? (
            <div className="space-y-3 rounded-lg bg-bg-secondary p-4">
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Name people will see, e.g. My Game" className={settingsInputClass} autoFocus />
              <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website (optional), https://…" className={settingsInputClass} />
              <textarea value={redirects} onChange={(e) => setRedirects(e.target.value)} rows={3} placeholder={"Redirect URLs, one per line\nhttps://example.com/auth/disband/callback"} className={`${settingsInputClass} font-mono text-[13px]`} />
              <div className="flex gap-2">
                <button type="button" className={btn.primary} disabled={busy || name.trim().length < 2 || !redirects.trim()} onClick={() => void create()}>{busy ? "Making…" : "Make Link"}</button>
                <button type="button" className={btn.secondary} onClick={() => setCreating(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" className={btn.primary} onClick={() => { setCreating(true); setNote(null); }}>New Link</button>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}
