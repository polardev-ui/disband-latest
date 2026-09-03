"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Hint, SettingRow, SettingsSection, settingsInputClass } from "./SettingsPrimitives";
import { BotTag } from "@/components/ui/BotTag";
import { IconClose, IconCopy } from "@/components/icons";
import { BOT_SCOPE_LABELS, BOT_SCOPE_ORDER } from "@/lib/bot-scopes";
import type { BotScope } from "@/lib/bot-auth";
import { apiFetch } from "@/lib/api";

interface ManagedBot {
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

const ALL_SCOPES = BOT_SCOPE_ORDER;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// Every /api/bot/* route authenticates by bearer token only, and on desktop a
// relative /api/ path resolves to the static shell rather than a route at all.
// `apiFetch` handles both, so bot create/revoke/invite must go through it —
// with a plain `fetch` they answered 401 on web and an empty error on desktop.
async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data: any }> {
  const res = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // An HTML error page, not JSON. Give the caller something to show.
    data = { error: `Request failed (${res.status}).` };
  }
  return { ok: res.ok, data };
}

export function BotsPanel() {
  const { servers, profile } = useApp();
  const [bots, setBots] = useState<ManagedBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newScopes, setNewScopes] = useState<BotScope[]>(["messages.read", "messages.write"]);
  const [createdToken, setCreatedToken] = useState<{ name: string; token: string } | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  const [invitingBot, setInvitingBot] = useState<ManagedBot | null>(null);
  const [inviteServerId, setInviteServerId] = useState("");
  const [inviteScopes, setInviteScopes] = useState<BotScope[]>([]);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  const loadBots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/bot/list");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not load bots.");
      setBots(data.bots ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load bots.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBots();
  }, [loadBots]);

  const activeBots = useMemo(() => bots.filter((b) => !b.revoked_at), [bots]);
  const revokedBots = useMemo(() => bots.filter((b) => b.revoked_at), [bots]);

  function toggleNewScope(scope: BotScope) {
    setNewScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  async function createBot() {
    setError(null);
    const name = newName.trim();
    if (!name) {
      setError("Give your bot a name.");
      return;
    }
    if (newScopes.length === 0) {
      setError("Pick at least one scope.");
      return;
    }
    setCreating(true);
    try {
      const { ok, data } = await postJson("/api/bot/register", { name, scopes: newScopes });
      if (!ok) throw new Error(data.error ?? "Could not create the bot.");
      setCreatedToken({ name: data.bot.name, token: data.token });
      setNewName("");
      await loadBots();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the bot.");
    } finally {
      setCreating(false);
    }
  }

  async function revokeBot(bot: ManagedBot) {
    if (!confirm(`Revoke "${bot.name}"? Its token stops working immediately and can't be recovered.`)) return;
    setError(null);
    try {
      const { ok, data } = await postJson("/api/bot/revoke", { botId: bot.id });
      if (!ok) throw new Error(data.error ?? "Could not revoke the bot.");
      await loadBots();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke the bot.");
    }
  }

  function openInvite(bot: ManagedBot) {
    setInvitingBot(bot);
    setInviteServerId(servers[0]?.id ?? "");
    setInviteScopes([...bot.scopes]);
    setInviteUrl(null);
    setInviteError(null);
    setInviteCopied(false);
  }

  async function generateInvite() {
    if (!invitingBot) return;
    if (!inviteServerId) {
      setInviteError("Pick a server for the bot to join.");
      return;
    }
    if (inviteScopes.length === 0) {
      setInviteError("Pick at least one scope to grant.");
      return;
    }
    setInviteLoading(true);
    setInviteError(null);
    try {
      const { ok, data } = await postJson("/api/bot/invites", {
        botId: invitingBot.id,
        serverId: inviteServerId,
        scopes: inviteScopes,
      });
      if (!ok) throw new Error(data.error ?? "Could not create the invite.");
      setInviteUrl(data.invite_url);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Could not create the invite.");
    } finally {
      setInviteLoading(false);
    }
  }

  async function copyText(text: string, setCopied: (v: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy to the clipboard.");
    }
  }

  return (
    <div className="pb-20">
      <SettingsSection
        title="Your bots"
        description={
          activeBots.length >= 5
            ? "You've reached the 5-bot limit. Revoke one to make room."
            : "Bots are self-hosted: you run the client code, and Disband relays messages to and from it. Create one and grab its token."
        }
        action={
          <button
            type="button"
            onClick={() => setCreatedToken(null)}
            className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            New bot
          </button>
        }
      >
        {createdToken && (
          <div className="border-b border-divider bg-bg-accent/60 px-4 py-4">
            <p className="text-[14px] font-medium text-text-normal">
              {createdToken.name} created — this is your token:
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-status-dnd">
              Copy it now. It's only shown once and can't be retrieved later.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border border-divider bg-bg-tertiary px-3 py-2 text-[12.5px] text-text-normal">
                {createdToken.token}
              </code>
              <button
                type="button"
                onClick={() => void copyText(createdToken.token, setTokenCopied)}
                className="shrink-0 rounded-md border border-divider px-3 py-2 text-[13px] font-semibold text-text-normal transition-colors hover:bg-interactive-hover"
              >
                {tokenCopied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-text-muted">
              Use it to connect the client:{" "}
              <code className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[11.5px]">new Client(&#123; token: "…" &#125;)</code>.
              See the{" "}
              <a href="/docs/bots" className="text-brand hover:underline">
                bot docs
              </a>{" "}
              for setup.
            </p>
          </div>
        )}

        {!createdToken && (
          <div className="border-b border-divider px-4 py-4">
            <SettingRow label="Name" stacked htmlFor="bot-new-name">
              <div className="flex items-start gap-2">
                <input
                  id="bot-new-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value.slice(0, 25))}
                  maxLength={25}
                  placeholder="Deploy Bot"
                  className={settingsInputClass}
                />
                <button
                  type="button"
                  onClick={() => void createBot()}
                  disabled={creating}
                  className="shrink-0 rounded-md bg-brand px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
                >
                  {creating ? "Creating…" : "Create"}
                </button>
              </div>
            </SettingRow>
            <div className="mt-1">
              <div className="mb-1.5 text-[12.5px] text-text-muted">Scopes</div>
              <div className="flex flex-wrap gap-2">
                {ALL_SCOPES.map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    aria-pressed={newScopes.includes(scope)}
                    onClick={() => toggleNewScope(scope)}
                    className="rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors"
                    style={
                      newScopes.includes(scope)
                        ? { borderColor: "var(--brand, #5865f2)", color: "var(--brand, #5865f2)" }
                        : undefined
                    }
                  >
                    {BOT_SCOPE_LABELS[scope].label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-text-muted">
                A bot's reach in a server is the intersection of these scopes and what the server
                owner approves when they accept the invite.
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="px-4 py-6 text-center text-[13px] text-text-muted">Loading…</div>
        ) : bots.length === 0 ? (
          <div className="px-4 py-6 text-center text-[13px] text-text-muted">
            No bots yet. Create your first one above.
          </div>
        ) : (
          <>
            {activeBots.map((bot) => (
              <div key={bot.id} className="border-b border-divider px-4 py-3.5 last:border-b-0">
                <div className="flex items-center gap-2">
                  <BotTag profile={{ is_bot: true }} size="sm" />
                  <span className="truncate text-[14px] font-semibold text-text-normal">{bot.name}</span>
                  <Hint>Token {bot.token_prefix}</Hint>
                  {bot.last_seen_at && <Hint>Last seen {fmtDate(bot.last_seen_at)}</Hint>}
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openInvite(bot)}
                      className="rounded-md border border-divider px-2.5 py-1 text-[12.5px] font-semibold text-text-normal transition-colors hover:bg-interactive-hover"
                    >
                      Invite
                    </button>
                    <button
                      type="button"
                      onClick={() => void revokeBot(bot)}
                      className="rounded-md border border-status-dnd/40 px-2.5 py-1 text-[12.5px] font-semibold text-status-dnd transition-colors hover:bg-status-dnd/10"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-[12.5px] text-text-muted">
                  {bot.scopes.length > 0 ? bot.scopes.join(" · ") : "No scopes"} · created {fmtDate(bot.created_at)}
                </p>
              </div>
            ))}
            {revokedBots.length > 0 && (
              <div className="px-4 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  Revoked
                </p>
                {revokedBots.map((bot) => (
                  <div key={bot.id} className="flex items-center gap-2 py-1.5">
                    <BotTag profile={{ is_bot: true }} size="sm" className="opacity-50" />
                    <span className="truncate text-[13px] text-text-muted line-through">{bot.name}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {error && <p className="px-4 py-2 text-[13px] text-status-dnd">{error}</p>}
      </SettingsSection>

      {profile?.is_bot && (
        <p className="text-[12.5px] text-text-muted">
          You're signed in as a bot account, so bot management is disabled here.
        </p>
      )}

      {invitingBot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/70"
            onClick={() => setInvitingBot(null)}
          />
          <div className="relative w-full max-w-md rounded-xl bg-bg-primary p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[16px] font-semibold text-text-normal">
                  Invite {invitingBot.name}
                </h3>
                <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
                  Generate a link and send it to the server's owner. They decide whether the bot
                  joins.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInvitingBot(null)}
                className="text-text-muted hover:text-text-normal"
                aria-label="Close"
              >
                <IconClose size={20} />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-[12.5px] font-medium text-text-normal" htmlFor="bot-invite-server">
                  Server
                </label>
                <select
                  id="bot-invite-server"
                  value={inviteServerId}
                  onChange={(e) => setInviteServerId(e.target.value)}
                  className={settingsInputClass}
                >
                  {servers.length === 0 && <option value="">No servers — join one first</option>}
                  {servers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-[12.5px] font-medium text-text-normal">
                  Scopes the owner will be asked to grant
                </label>
                <div className="flex flex-wrap gap-2">
                  {invitingBot.scopes.map((scope) => (
                    <button
                      key={scope}
                      type="button"
                      aria-pressed={inviteScopes.includes(scope)}
                      onClick={() =>
                        setInviteScopes((prev) =>
                          prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
                        )
                      }
                      className="rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors"
                      style={
                        inviteScopes.includes(scope)
                          ? { borderColor: "var(--brand, #5865f2)", color: "var(--brand, #5865f2)" }
                          : undefined
                      }
                    >
                      {BOT_SCOPE_LABELS[scope].label}
                    </button>
                  ))}
                </div>
                {inviteScopes.length > 0 && (
                  <p className="mt-1.5 text-[11.5px] text-text-muted">
                    {inviteScopes.map((s) => BOT_SCOPE_LABELS[s].description).join(" ")}
                  </p>
                )}
              </div>

              {inviteUrl && (
                <div>
                  <label className="mb-1.5 block text-[12.5px] font-medium text-text-normal">
                    Invite link
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-md border border-divider bg-bg-tertiary px-3 py-2 text-[12px] text-text-normal">
                      {inviteUrl}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copyText(inviteUrl, setInviteCopied)}
                      className="flex shrink-0 items-center gap-1.5 rounded-md border border-divider px-3 py-2 text-[12.5px] font-semibold text-text-normal transition-colors hover:bg-interactive-hover"
                    >
                      <IconCopy size={14} />
                      {inviteCopied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-text-muted">
                    Expires in 7 days or once approved/declined.
                  </p>
                </div>
              )}

              {inviteError && <p className="text-[12.5px] text-status-dnd">{inviteError}</p>}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setInvitingBot(null)}
                  className="rounded-md border border-divider px-3 py-1.5 text-[13px] font-semibold text-text-normal transition-colors hover:bg-interactive-hover"
                >
                  Close
                </button>
                {!inviteUrl && (
                  <button
                    type="button"
                    onClick={() => void generateInvite()}
                    disabled={inviteLoading}
                    className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
                  >
                    {inviteLoading ? "Generating…" : "Generate invite link"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
