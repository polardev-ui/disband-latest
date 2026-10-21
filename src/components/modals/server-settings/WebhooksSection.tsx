"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { apiFetch, apiJson } from "@/lib/api";
import { safeImageUrl } from "@/lib/safe-url";
import { displayName } from "@/lib/utils";
import { IconChevron, IconCopy, IconLink, IconPlus, IconTrash, IconUpload } from "@/components/icons";
import { ConfirmDialog, EmptyState, FilePickButton, InlineError, SettingsSection, btn, iconBtnDanger } from "./ui";
import type { SectionProps } from "./types";

const IMAGE_TYPES = "image/png,image/jpeg,image/webp,image/gif";

interface Creator {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface Webhook {
  id: string;
  name: string;
  avatar_url: string | null;
  channel_id: string;
  created_at: string;
  last_used_at: string | null;
  created_by: Creator | null;
  url: string;
}

interface Draft {
  name: string;
  channelId: string;
}

type ApiError = { error: string };
const isError = (value: unknown): value is ApiError =>
  !!value && typeof value === "object" && "error" in value && typeof (value as ApiError).error === "string";

function initialDraft(hook: Webhook): Draft {
  return { name: hook.name, channelId: hook.channel_id };
}

function createdOn(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "an unknown date"
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function WebhooksSection({ server }: SectionProps) {
  const { channels } = useApp();
  const { upload } = useMediaUpload();
  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Webhook | null>(null);
  const [resetting, setResetting] = useState<Webhook | null>(null);

  const textChannels = useMemo(
    () => channels.filter((c) => c.type === "text").sort((a, b) => a.position - b.position),
    [channels],
  );

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    void apiJson<{ webhooks: Webhook[] }>(`/api/server-webhooks?serverId=${encodeURIComponent(server.id)}`).then((data) => {
      if (!live) return;
      if (isError(data)) setError(data.error);
      else {
        setHooks(data.webhooks);
        setDrafts({});
      }
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [server.id]);

  function updateHook(next: Webhook) {
    setHooks((prev) => prev.map((h) => (h.id === next.id ? next : h)));
    setDrafts((prev) => {
      const copy = { ...prev };
      delete copy[next.id];
      return copy;
    });
  }

  async function create() {
    setBusy("create");
    setError(null);
    const data = await apiJson<{ webhook: Webhook }>("/api/server-webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serverId: server.id, channelId: textChannels[0]?.id }),
    });
    if (isError(data)) setError(data.error);
    else {
      setHooks((prev) => [data.webhook, ...prev]);
      setExpanded(data.webhook.id);
    }
    setBusy(null);
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const data = await apiJson<{ webhook: Webhook }>(`/api/server-webhooks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (isError(data)) {
      setError(data.error);
      return false;
    }
    updateHook(data.webhook);
    return true;
  }

  async function save(hook: Webhook) {
    const draft = drafts[hook.id] ?? initialDraft(hook);
    const name = draft.name.trim();
    if (!name) {
      setError("Give the webhook a name.");
      return;
    }
    setBusy(`save:${hook.id}`);
    setError(null);
    await patch(hook.id, { name, channel_id: draft.channelId });
    setBusy(null);
  }

  async function setAvatar(hook: Webhook, file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That file isn't an image.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Images can be up to 8 MB.");
      return;
    }
    setBusy(`avatar:${hook.id}`);
    setError(null);
    const result = await upload(file);
    if (!result) setError("The upload didn't go through. Try again.");
    else await patch(hook.id, { avatar_url: result.url });
    setBusy(null);
  }

  async function remove(hook: Webhook) {
    setError(null);
    let res: Response;
    try {
      res = await apiFetch(`/api/server-webhooks/${hook.id}`, { method: "DELETE" });
    } catch {
      setError("Couldn't reach the space. Check your connection and try again.");
      return;
    }
    if (!res.ok) {
      let message = `Could not delete the webhook (${res.status}).`;
      try {
        const body = (await res.json()) as ApiError;
        if (body.error) message = body.error;
      } catch {
        // Keep the status-based message.
      }
      setError(message);
      return;
    }
    setHooks((prev) => prev.filter((h) => h.id !== hook.id));
    if (expanded === hook.id) setExpanded(null);
  }

  async function copy(hook: Webhook) {
    try {
      await navigator.clipboard.writeText(hook.url);
      setCopied(hook.id);
      window.setTimeout(() => setCopied((current) => (current === hook.id ? null : current)), 1600);
    } catch {
      setError("Couldn't copy the URL. Select it and copy it manually.");
    }
  }

  return (
    <div className="pb-10">
      <p className="mb-5 text-[14px] leading-5 text-text-normal">
        Webhooks post messages into a channel from outside Disband. Give the URL to a service such as
        GitHub, or use it from a script. Treat a webhook URL like a password — anyone with it can post.
      </p>

      <SettingsSection
        title="Webhooks"
        description={hooks.length > 0 ? `${hooks.length} in this space` : "None yet"}
        action={
          <button type="button" onClick={() => void create()} disabled={busy === "create" || textChannels.length === 0} className={btn.primary}>
            <IconPlus size={15} /> {busy === "create" ? "Creating…" : "New Webhook"}
          </button>
        }
      >
        {loading ? (
          <div className="space-y-3 p-5">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-10 w-10 animate-pulse rounded-full bg-bg-accent" />
                <div className="h-3 w-40 animate-pulse rounded bg-bg-accent" />
              </div>
            ))}
          </div>
        ) : hooks.length === 0 ? (
          <EmptyState
            icon={<IconLink size={20} />}
            title="No webhooks yet"
            body={textChannels.length === 0 ? "Create a text channel before adding a webhook." : "Create one to post messages from another service."}
          />
        ) : (
          <ul>
            {hooks.map((hook) => {
              const open = expanded === hook.id;
              const draft = drafts[hook.id] ?? initialDraft(hook);
              const dirty = draft.name.trim() !== hook.name || draft.channelId !== hook.channel_id;
              const avatar = safeImageUrl(hook.avatar_url);
              return (
                <li key={hook.id} className="border-b border-divider last:border-b-0">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => {
                      setExpanded(open ? null : hook.id);
                      setError(null);
                    }}
                    className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-interactive-hover"
                  >
                    {avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatar} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-tertiary text-text-muted">
                        <IconLink size={18} />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-header-primary">{hook.name}</p>
                      <p className="mt-0.5 truncate text-[13px] text-text-muted">
                        Created on {createdOn(hook.created_at)}
                        {hook.created_by ? ` by ${displayName(hook.created_by)}` : ""}
                      </p>
                    </div>
                    <IconChevron size={18} className={`shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>

                  {open && (
                    <div className="border-t border-divider px-5 py-5">
                      <div className="flex flex-col gap-5 sm:flex-row">
                        <div className="flex shrink-0 flex-col items-center gap-2">
                          {avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={avatar} alt="" className={`h-20 w-20 rounded-full object-cover ${busy === `avatar:${hook.id}` ? "animate-pulse" : ""}`} />
                          ) : (
                            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-bg-tertiary text-text-muted">
                              <IconLink size={28} />
                            </span>
                          )}
                          <FilePickButton
                            accept={IMAGE_TYPES}
                            disabled={busy !== null}
                            onPick={(file) => void setAvatar(hook, file)}
                            className="text-[13px] font-medium text-[#00a8fc] hover:underline disabled:opacity-50"
                          >
                            <IconUpload size={13} /> Change avatar
                          </FilePickButton>
                          {hook.avatar_url && (
                            <button
                              type="button"
                              onClick={() => void patch(hook.id, { avatar_url: null })}
                              disabled={busy !== null}
                              className={iconBtnDanger}
                              title="Remove avatar"
                              aria-label="Remove avatar"
                            >
                              <IconTrash size={14} />
                            </button>
                          )}
                        </div>

                        <div className="min-w-0 flex-1 space-y-4">
                          <label className="block">
                            <span className="mb-1.5 block text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-header-secondary">
                              Name
                            </span>
                            <input
                              value={draft.name}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [hook.id]: { ...draft, name: e.target.value },
                                }))
                              }
                              maxLength={80}
                              className="h-10 w-full rounded-[3px] border border-transparent bg-bg-tertiary px-3 text-[14px] text-text-normal outline-none focus:border-[#00a8fc]"
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1.5 block text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-header-secondary">
                              Channel
                            </span>
                            <select
                              value={draft.channelId}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [hook.id]: { ...draft, channelId: e.target.value },
                                }))
                              }
                              className="h-10 w-full rounded-[3px] border border-transparent bg-bg-tertiary px-2 text-[14px] text-text-normal outline-none focus:border-[#00a8fc]"
                            >
                              {textChannels.map((channel) => (
                                <option key={channel.id} value={channel.id}>
                                  # {channel.name}
                                </option>
                              ))}
                            </select>
                          </label>

                          <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => void copy(hook)} className={btn.secondary}>
                              <IconCopy size={15} /> {copied === hook.id ? "Copied" : "Copy Webhook URL"}
                            </button>
                            <button type="button" onClick={() => setResetting(hook)} className={btn.secondary}>
                              Reset URL
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleting(hook)}
                              className="ml-auto text-[14px] font-medium text-status-dnd hover:underline"
                            >
                              Delete Webhook
                            </button>
                          </div>

                          <p className="break-all rounded-[3px] bg-bg-tertiary px-3 py-2 font-mono text-[12px] leading-5 text-text-muted">
                            {hook.url}
                          </p>
                          {hook.last_used_at && (
                            <p className="text-[12px] text-text-muted">
                              Last used {new Date(hook.last_used_at).toLocaleString()}.
                            </p>
                          )}
                        </div>
                      </div>

                      {dirty && (
                        <div className="view-enter mt-5 flex items-center justify-between gap-3 border-t border-divider pt-4">
                          <p className="text-[14px] text-text-muted">Careful — you have unsaved changes!</p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setDrafts((prev) => {
                                  const copy = { ...prev };
                                  delete copy[hook.id];
                                  return copy;
                                })
                              }
                              className={btn.ghost}
                            >
                              Reset
                            </button>
                            <button
                              type="button"
                              onClick={() => void save(hook)}
                              disabled={busy === `save:${hook.id}`}
                              className={btn.primary}
                            >
                              {busy === `save:${hook.id}` ? "Saving…" : "Save changes"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SettingsSection>

      <InlineError>{error}</InlineError>

      <ConfirmDialog
        open={!!deleting}
        title="Delete webhook?"
        body={
          <>
            <strong className="font-semibold text-header-primary">{deleting?.name}</strong> will stop working
            immediately. Messages it already posted stay in the channel.
          </>
        }
        confirmLabel="Delete webhook"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await remove(deleting);
          setDeleting(null);
        }}
      />
      <ConfirmDialog
        open={!!resetting}
        title="Reset webhook URL?"
        body="The old URL stops working immediately. Any service using it will need the new one."
        confirmLabel="Reset URL"
        tone="primary"
        onCancel={() => setResetting(null)}
        onConfirm={async () => {
          if (resetting) await patch(resetting.id, { reset_token: true });
          setResetting(null);
        }}
      />
    </div>
  );
}
