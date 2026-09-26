"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";

/**
 * Compose and send a message from the official @disband account.
 *
 * Owner only. Two audiences: everyone on Disband, or one named account. The
 * password is required to send, not to look, so a stolen session can read the
 * history but cannot address the userbase.
 *
 * Email is a separate opt-in checkbox on purpose. A whole-userbase send is
 * roughly 9.5k emails and it should never be something an extra click does not
 * ask you to confirm.
 */

interface Template {
  id: string;
  label: string;
  description: string;
  kind: string;
  title: string;
  body: string;
}

interface HistoryEntry {
  id: string;
  audience: string;
  targetUsername: string | null;
  kind: string;
  title: string;
  body: string;
  sendEmail: boolean;
  origin: string;
  recipientCount: number;
  emailSent: number;
  emailFailed: number;
  createdAt: string;
}

interface DeliverySummary {
  notified: number;
  pushPending: number;
  pushDispatched: number;
  pushFailed: number;
  emails: Record<string, number>;
}

interface ResolvedRecipient {
  id: string;
  username: string | null;
  displayName: string | null;
}

export function OfficialBroadcastPanel() {
  const { profile } = useApp();
  const isOwner = !!profile?.show_owner_badge;

  const [templates, setTemplates] = useState<Template[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [audienceCount, setAudienceCount] = useState(0);
  const [delivery, setDelivery] = useState<Record<string, DeliverySummary>>({});

  const [audience, setAudience] = useState<"everyone" | "user">("user");
  const [query, setQuery] = useState("");
  const [recipient, setRecipient] = useState<ResolvedRecipient | null>(null);
  const [resolving, setResolving] = useState(false);
  const [kind, setKind] = useState("announcement");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const authHeaders = useCallback(async () => {
    const { data } = await getSupabaseClient().auth.getSession();
    return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : null;
  }, []);

  const load = useCallback(async () => {
    if (!isOwner) return;
    const headers = await authHeaders();
    if (!headers) return;
    try {
      const res = await apiFetch("/api/admin/broadcast", { headers });
      if (!res.ok) return;
      const json = (await res.json()) as {
        history?: HistoryEntry[];
        audience?: number;
        templates?: Template[];
      };
      setHistory(json.history ?? []);
      setAudienceCount(json.audience ?? 0);
      setTemplates(json.templates ?? []);
    } catch {
      // The panel is owner-only; if it cannot load, the owner simply does not
      // see it. Nothing to recover from inside the component.
    }
  }, [isOwner, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setKind(t.kind);
    setTitle(t.title);
    setBody(t.body);
    setError(null);
  }

  async function resolve() {
    const term = query.trim();
    if (!term) return;
    setResolving(true);
    setError(null);
    setRecipient(null);
    try {
      const headers = await authHeaders();
      if (!headers) { setError("Not authenticated"); return; }
      const res = await apiFetch("/api/admin/broadcast", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", query: term }),
      });
      const json = (await res.json()) as { recipient?: ResolvedRecipient; error?: string };
      if (json.error || !json.recipient) { setError(json.error ?? "Could not find that account."); return; }
      setRecipient(json.recipient);
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setResolving(false);
    }
  }

  async function send() {
    setError(null);
    setSuccess(null);

    if (audience === "user" && !recipient) {
      setError("Find the account you want to write to first.");
      return;
    }
    if (audience === "everyone" && !window.confirm(
      `Send this to every one of the ${audienceCount.toLocaleString()} accounts on Disband?` +
      (sendEmail ? "\n\nIt will also send an email to every one of them." : ""),
    )) {
      return;
    }

    setBusy(true);
    try {
      const headers = await authHeaders();
      if (!headers) { setError("Not authenticated"); return; }
      const res = await apiFetch("/api/admin/broadcast", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          password,
          audience,
          targetUserId: audience === "user" ? recipient?.id : undefined,
          kind,
          title: title.trim(),
          body: body.trim(),
          link: link.trim() || undefined,
          sendEmail,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        recipientCount?: number;
        emailSent?: number;
        emailFailed?: number;
        emailFailures?: Array<{ username: string | null; reason: string }>;
      };
      if (json.error) { setError(json.error); return; }

      const emailed =
        sendEmail && (json.emailSent ?? 0) > 0
          ? ` ${json.emailSent} emailed${json.emailFailed ? `, ${json.emailFailed} failed (first: ${json.emailFailures?.[0]?.reason ?? "unknown"})` : ""}.`
          : "";
      setSuccess(
        `Sent to ${json.recipientCount ?? 0} ${json.recipientCount === 1 ? "account" : "accounts"}.${emailed} Push goes out over the next couple of minutes.`,
      );
      setPassword("");
      setBody("");
      setLink("");
      setSendEmail(false);
      setRecipient(null);
      setQuery("");
      await load();
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshDelivery(entry: HistoryEntry) {
    setBusy(true);
    setError(null);
    try {
      const headers = await authHeaders();
      if (!headers) { setError("Not authenticated"); return; }
      const res = await apiFetch("/api/admin/broadcast", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delivery", password, broadcastId: entry.id }),
      });
      const json = (await res.json()) as { error?: string; delivery?: DeliverySummary };
      if (json.error || !json.delivery) { setError(json.error ?? "Could not read delivery."); return; }
      setDelivery((prev) => ({ ...prev, [entry.id]: json.delivery as DeliverySummary }));
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setBusy(false);
    }
  }

  if (!isOwner) return null;

  return (
    <div className="mt-8 space-y-4 border-t border-divider pt-6">
      <div>
        <h3 className="text-sm font-bold uppercase text-brand">Official @disband account</h3>
        <p className="mt-1 text-xs text-text-muted">
          Send a message to everyone on Disband, or to one account, as the official account.
          Notices about suspensions and restrictions go out the same way, automatically.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-divider bg-bg-secondary p-4">
        <div>
          <span className="text-xs font-bold uppercase text-text-muted">Who is this for</span>
          <div className="mt-1 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAudience("user")}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                audience === "user" ? "bg-brand text-white" : "bg-bg-accent text-text-normal hover:bg-interactive-hover"
              }`}
            >
              One account
            </button>
            <button
              type="button"
              onClick={() => setAudience("everyone")}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                audience === "everyone" ? "bg-brand text-white" : "bg-bg-accent text-text-normal hover:bg-interactive-hover"
              }`}
            >
              Everyone ({audienceCount.toLocaleString()})
            </button>
          </div>
        </div>

        {audience === "user" && (
          <div>
            <span className="text-xs font-bold uppercase text-text-muted">Account</span>
            {recipient ? (
              <div className="mt-1 flex items-center gap-2 rounded bg-bg-accent px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{recipient.displayName ?? recipient.username}</p>
                  {recipient.username && <p className="truncate text-xs text-text-muted">@{recipient.username}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => { setRecipient(null); setQuery(""); }}
                  className="shrink-0 rounded border border-divider px-2 py-1 text-xs hover:bg-interactive-hover"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="mt-1 flex gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void resolve(); } }}
                  placeholder="Username or user id..."
                  className="flex-1 rounded bg-bg-accent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
                />
                <button
                  type="button"
                  disabled={resolving || query.trim().length === 0}
                  onClick={() => void resolve()}
                  className="rounded bg-bg-accent px-3 py-2 text-sm hover:bg-interactive-hover disabled:opacity-50"
                >
                  {resolving ? "Looking..." : "Find"}
                </button>
              </div>
            )}
          </div>
        )}

        {templates.length > 0 && (
          <div>
            <span className="text-xs font-bold uppercase text-text-muted">Start from a template</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplate(t.id)}
                  title={t.description}
                  className="rounded bg-bg-accent px-3 py-1.5 text-xs font-medium text-text-normal hover:bg-interactive-hover"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <span className="text-xs font-bold uppercase text-text-muted">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="What is this about?"
            className="mt-1 w-full rounded bg-bg-accent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        <div>
          <span className="text-xs font-bold uppercase text-text-muted">Message</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={1000}
            rows={4}
            placeholder="Say what happened and what to do next. Do not quote the content that triggered a moderation action."
            className="mt-1 w-full resize-y rounded bg-bg-accent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
          />
          <p className="mt-1 text-xs text-text-muted">{body.length}/1000</p>
        </div>

        <div>
          <span className="text-xs font-bold uppercase text-text-muted">Link (optional)</span>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="/settings or https://disband.dev/..."
            className="mt-1 w-full rounded bg-bg-accent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
          />
          <p className="mt-1 text-xs text-text-muted">
            In-app routes and disband.dev links only.
          </p>
        </div>

        <label className="flex items-start gap-2 text-xs text-text-normal">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Also send this by email.
            {audience === "everyone" && (
              <span className="block text-status-dnd">
                That is about {audienceCount.toLocaleString()} emails. Off by default on purpose.
              </span>
            )}
          </span>
        </label>

        <div>
          <span className="text-xs font-bold uppercase text-text-muted">Owner password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            placeholder="Required to send"
            className="mt-1 w-full rounded bg-bg-accent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        {error && <p className="text-sm text-status-danger">{error}</p>}
        {success && <p className="text-sm text-status-online">{success}</p>}

        <button
          type="button"
          disabled={busy || !title.trim() || !body.trim() || (audience === "user" && !recipient)}
          onClick={() => void send()}
          className="w-full rounded bg-brand px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Sending..." : audience === "everyone" ? `Send to everyone` : "Send"}
        </button>
      </div>

      {history.length > 0 && (
        <div className="rounded-lg border border-divider bg-bg-secondary">
          <p className="border-b border-divider px-4 py-2 text-xs font-bold uppercase text-text-muted">
            What has been sent
          </p>
          <ul className="divide-y divide-divider">
            {history.map((entry) => {
              const d = delivery[entry.id];
              return (
                <li key={entry.id} className="px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{entry.title}</p>
                      <p className="text-xs text-text-muted">
                        {entry.audience === "everyone"
                          ? `Everyone · ${entry.recipientCount.toLocaleString()} accounts`
                          : `@${entry.targetUsername ?? "unknown"}`}
                        {entry.origin !== "admin" && ` · automatic (${entry.origin})`}
                        {` · ${new Date(entry.createdAt).toLocaleString()}`}
                      </p>
                      {entry.sendEmail && (
                        <p className="text-xs text-text-muted">
                          {entry.emailSent} emailed{entry.emailFailed ? `, ${entry.emailFailed} failed` : ""}
                        </p>
                      )}
                      {d && (
                        <p className="text-xs text-text-muted">
                          {d.notified} notified · push {d.pushDispatched} sent
                          {d.pushPending ? `, ${d.pushPending} queued` : ""}
                          {d.pushFailed ? `, ${d.pushFailed} failed` : ""}
                          {Object.entries(d.emails).map(([status, n]) => ` · email ${status}: ${n}`).join("")}
                        </p>
                      )}
                    </div>
                    {entry.sendEmail && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void refreshDelivery(entry)}
                        className="shrink-0 rounded border border-divider px-2 py-1 text-xs hover:bg-interactive-hover disabled:opacity-50"
                      >
                        Check email
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
