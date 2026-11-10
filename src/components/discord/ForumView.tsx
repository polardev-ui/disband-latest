"use client";

import { LoadingDots } from "@/components/ui/LoadingDots";

/*
 A forum channel: its posts as cards, newest activity first with pinned
 posts on top, filtered by search and tags, and a dialog to start a post.

 Each post is a child text channel (migration 0240), so opening one is just
 selecting that channel; the conversation then renders as any other chat,
 with a way back here. Posts are listed through get_forum_posts(), which
 only returns posts the viewer can see.
*/

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useI18n } from "@/contexts/I18nContext";
import { useContextMenu } from "@/components/ui/ContextMenu";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchProfilesByIds } from "@/lib/fetch-profiles";
import { isMissingFeatureError, friendlyError } from "@/lib/feature-store";
import { displayName, formatMessageTime } from "@/lib/utils";
import { confirmDialog, alertDialog } from "@/lib/dialogs";
import { Avatar } from "@/components/ui/Avatar";
import { ClassicModal, ClassicLabel, classicBtn, classicInput } from "@/components/ui/ClassicModal";
import { IconForum, IconPin, IconPlus, IconSearch, IconMore, IconEdit, IconTrash, IconMessage } from "@/components/icons";
import type { Channel, Profile } from "@/lib/supabase/types";

export interface ForumPost {
  id: string;
  title: string;
  author_id: string | null;
  tags: string[];
  pinned: boolean;
  message_count: number;
  last_message_at: string;
  created_at: string;
  opening: string | null;
  opening_attachment: string | null;
}

type SortMode = "activity" | "newest";

const TITLE_MAX = 100;
const BODY_MAX = 4000;

/** Markdown and mention tokens read badly in a two-line preview. */
function previewText(raw: string | null): string {
  if (!raw) return "";
  return raw
    .replace(/```[\s\S]*?```/g, " [code] ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~>|#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function relativeTime(iso: string, now: number): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function ForumView({
  forum,
  headerLeading,
  headerTrailing,
  canManage,
}: {
  forum: Channel;
  headerLeading?: React.ReactNode;
  headerTrailing?: React.ReactNode;
  /** manage_channels / owner: can pin and remove any post. */
  canManage: boolean;
}) {
  const app = useApp();
  const { t } = useI18n();
  const { openMenu } = useContextMenu();
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [authors, setAuthors] = useState<Map<string, Profile>>(new Map());
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [sort, setSort] = useState<SortMode>("activity");
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<ForumPost | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const forumId = forum.id;
  const loadSeq = useRef(0);

  const effect = app.channelEffects[forumId];
  const canPost = canManage || (effect?.can_post ?? true);
  const canModerate = canManage || app.hasServerPermission("manage_messages");
  const available = forum.available_tags ?? [];

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const { data, error } = await getSupabaseClient().rpc("get_forum_posts", { p_forum_id: forumId, p_limit: 200 });
      if (seq !== loadSeq.current) return;
      if (error) {
        if (isMissingFeatureError(error)) setUnavailable(true);
        else setLoadError(t("Couldn't load posts. Check your connection and try again."));
        return;
      }
      setLoadError(null);
      setPosts((data as ForumPost[] | null) ?? []);
    } catch {
      if (seq === loadSeq.current) setLoadError(t("Couldn't load posts. Check your connection and try again."));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [forumId, t]);

  // Load on open, again when the window comes back into focus, and every
  // 30 seconds while the forum is showing.
  useEffect(() => {
    setLoading(true);
    setPosts([]);
    setTagFilter([]);
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === "visible") void load();
    }, 30_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [load]);

  // Authors: members already loaded, the rest fetched once.
  useEffect(() => {
    const known = new Map<string, Profile>();
    for (const m of app.members) if (m.profile) known.set(m.user_id, m.profile);
    const missing = [...new Set(posts.map((p) => p.author_id).filter((id): id is string => !!id && !known.has(id) && !authors.has(id)))];
    if (missing.length === 0) {
      setAuthors((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [id, profile] of known) {
          if (next.get(id) !== profile) {
            next.set(id, profile);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      return;
    }
    let alive = true;
    void fetchProfilesByIds(getSupabaseClient(), missing).then((fetched) => {
      if (!alive) return;
      setAuthors((prev) => {
        const next = new Map(prev);
        for (const [id, profile] of known) next.set(id, profile);
        for (const [id, profile] of fetched) next.set(id, profile);
        return next;
      });
    });
    return () => {
      alive = false;
    };
    // `authors` is read to skip known ids, not to re-run on every fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, app.members]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = posts.filter((p) => {
      if (tagFilter.length && !tagFilter.every((tag) => p.tags.includes(tag))) return false;
      if (!q) return true;
      return p.title.toLowerCase().includes(q) || (p.opening ?? "").toLowerCase().includes(q);
    });
    if (sort === "newest") {
      list = [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at));
    }
    return list;
  }, [posts, query, tagFilter, sort]);

  const openPost = useCallback((postId: string) => {
    if (app.channels.some((c) => c.id === postId)) app.selectChannel(postId);
    // A post started since the space loaded: load it, then open it.
    else void app.routeToNotification(`channel:${postId}`);
  }, [app]);

  const removePost = useCallback(async (post: ForumPost) => {
    const ok = await confirmDialog({
      title: t("Delete this post?"),
      body: t("“{title}” and every reply in it will be deleted. This can't be undone.", { title: post.title }),
      confirmLabel: t("Delete post"),
      tone: "danger",
      action: async () => {
        const { error } = await getSupabaseClient().rpc("delete_forum_post", { p_post_id: post.id });
        if (error) {
          void alertDialog(friendlyError(error, t("Couldn't delete that post.")));
          return;
        }
        setPosts((list) => list.filter((p) => p.id !== post.id));
      },
    });
    if (!ok) return;
  }, [t]);

  const togglePin = useCallback(async (post: ForumPost) => {
    const { error } = await getSupabaseClient().rpc("update_forum_post", { p_post_id: post.id, p_pinned: !post.pinned });
    if (error) {
      void alertDialog(friendlyError(error, t("Couldn't change that post.")));
      return;
    }
    void load();
  }, [load, t]);

  const postMenu = (post: ForumPost, x: number, y: number) => {
    const mine = !!post.author_id && post.author_id === app.user?.id;
    openMenu(x, y, [
      { id: "open", label: t("Open post"), icon: <IconMessage size={16} />, onClick: () => openPost(post.id) },
      ...(mine || canModerate
        ? [{ id: "edit", label: t("Edit title and tags"), icon: <IconEdit size={16} />, onClick: () => setEditing(post) }]
        : []),
      ...(canModerate
        ? [{ id: "pin", label: post.pinned ? t("Unpin post") : t("Pin post"), icon: <IconPin size={16} />, onClick: () => void togglePin(post) }]
        : []),
      ...(mine || canModerate
        ? [{ id: "delete", label: t("Delete post"), icon: <IconTrash size={16} />, danger: true, onClick: () => void removePost(post) }]
        : []),
    ]);
  };

  return (
    <main className="chat-wallpaper-host view-enter relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg-primary">
      <header className="relative z-30 flex h-14 shrink-0 items-center gap-2 border-b border-column-border px-4">
        {headerLeading}
        <IconForum size={22} className="shrink-0 text-channels-default" />
        <h1 className="min-w-0 shrink truncate text-[16px] font-semibold leading-5 text-header-primary">{forum.name}</h1>
        {forum.topic && (
          <>
            <span aria-hidden className="mx-1 hidden h-5 w-px shrink-0 bg-divider md:block" />
            <p className="hidden min-w-0 flex-1 truncate text-[14px] text-text-muted md:block" title={forum.topic}>{forum.topic}</p>
          </>
        )}
        <span className="flex-1" />
        {headerTrailing}
      </header>

      <div className="settings-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[920px] px-4 pb-16 pt-6 md:px-6">
          {unavailable ? (
            <div className="flex flex-col items-center py-24 text-center">
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-tertiary text-interactive-normal">
                <IconForum size={28} />
              </span>
              <h2 className="text-[18px] font-semibold text-header-primary">{t("Forums aren't switched on yet")}</h2>
              <p className="mt-1 max-w-sm text-[14px] text-text-muted">{t("This space's forum will appear here as soon as forums are enabled on the server.")}</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative min-w-[200px] flex-1">
                  <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("Search posts")}
                    aria-label={t("Search posts")}
                    className="h-10 w-full rounded-xl border border-border-subtle bg-bg-secondary-alt pl-9 pr-3 text-[14px] text-text-normal outline-none transition-colors placeholder:text-text-muted focus:border-border-strong"
                  />
                </label>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortMode)}
                  aria-label={t("Sort posts")}
                  className="h-10 rounded-xl border border-border-subtle bg-bg-secondary-alt px-3 text-[14px] font-medium text-text-normal outline-none focus:border-border-strong"
                >
                  <option value="activity">{t("Latest activity")}</option>
                  <option value="newest">{t("Newest")}</option>
                </select>
                {canPost && (
                  <button
                    type="button"
                    onClick={() => setComposerOpen(true)}
                    className="flex h-10 items-center gap-1.5 rounded-xl bg-brand px-4 text-[14px] font-semibold text-brand-foreground transition-colors hover:bg-brand-hover"
                  >
                    <IconPlus size={16} strokeWidth={2.4} />
                    {t("New post")}
                  </button>
                )}
              </div>

              {available.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label={t("Filter by tag")}>
                  {available.map((tag) => {
                    const on = tagFilter.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setTagFilter((list) => (on ? list.filter((x) => x !== tag) : [...list, tag]))}
                        className={`h-7 rounded-full border px-3 text-[12px] font-semibold transition-colors ${
                          on ? "border-brand bg-brand-soft text-header-primary" : "border-border-subtle text-text-muted hover:border-border-strong hover:text-text-normal"
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                  {tagFilter.length > 0 && (
                    <button type="button" onClick={() => setTagFilter([])} className="ml-1 text-[12px] font-semibold text-text-link hover:underline">
                      {t("Clear")}
                    </button>
                  )}
                </div>
              )}

              {loadError && (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-status-dnd/30 bg-status-dnd/10 px-4 py-3 text-[14px] text-status-dnd">
                  <span>{loadError}</span>
                  <button type="button" onClick={() => void load()} className="shrink-0 font-semibold underline">
                    {t("Retry")}
                  </button>
                </div>
              )}

              <ul className="mt-5 space-y-2.5">
                {loading && posts.length === 0
                  ? Array.from({ length: 4 }, (_, i) => (
                      <li key={i} aria-hidden className="h-[104px] rounded-2xl border border-border-subtle bg-bg-secondary-alt skeleton-glimmer" />
                    ))
                  : visible.map((post) => {
                      const author = post.author_id ? authors.get(post.author_id) : undefined;
                      const replies = Math.max(0, post.message_count - 1);
                      const unread = (app.getChannelUnreadCount(post.id) ?? 0) > 0;
                      const preview = previewText(post.opening);
                      return (
                        <li key={post.id}>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => openPost(post.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openPost(post.id);
                              }
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              postMenu(post, e.clientX, e.clientY);
                            }}
                            className="group relative cursor-pointer rounded-2xl border border-border-subtle bg-bg-secondary-alt px-4 py-3.5 transition-colors hover:border-border-strong hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                          >
                            <div className="flex items-start gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  {post.pinned && (
                                    <span className="flex items-center gap-1 rounded-full bg-brand-soft px-2 py-px text-[11px] font-bold text-brand">
                                      <IconPin size={12} /> {t("Pinned")}
                                    </span>
                                  )}
                                  {unread && <span aria-label={t("Unread")} className="h-2 w-2 shrink-0 rounded-full bg-header-primary" />}
                                  <h3 className={`min-w-0 truncate text-[16px] leading-6 ${unread ? "font-bold text-header-primary" : "font-semibold text-header-primary"}`}>
                                    {post.title}
                                  </h3>
                                  {post.tags.map((tag) => (
                                    <span key={tag} className="rounded-full border border-border-subtle bg-bg-tertiary px-2 py-px text-[11px] font-semibold text-text-muted">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                                {(preview || post.opening_attachment) && (
                                  <p className="mt-1 line-clamp-2 break-words text-[14px] leading-5 text-text-muted">
                                    {preview || t("Attachment")}
                                  </p>
                                )}
                                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-muted">
                                  <span className="flex min-w-0 items-center gap-1.5">
                                    <Avatar profile={author ?? { display_name: "?" }} size="sm" className="!h-5 !w-5 !text-[9px]" />
                                    <span className="truncate font-medium text-text-normal">{author ? displayName(author) : t("Unknown")}</span>
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <IconMessage size={13} />
                                    {replies === 1 ? t("1 reply") : t("{count} replies", { count: replies })}
                                  </span>
                                  <span title={formatMessageTime(post.last_message_at)}>{relativeTime(post.last_message_at, now)}</span>
                                </div>
                              </div>
                              <button
                                type="button"
                                aria-label={t("Post options")}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const r = e.currentTarget.getBoundingClientRect();
                                  postMenu(post, r.left, r.bottom + 4);
                                }}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-interactive-normal opacity-0 transition hover:bg-interactive-selected hover:text-interactive-active focus-visible:opacity-100 group-hover:opacity-100 [@media(any-hover:none)]:opacity-100"
                              >
                                <IconMore size={18} />
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
              </ul>

              {!loading && visible.length === 0 && !loadError && (
                <div className="flex flex-col items-center py-20 text-center">
                  <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-tertiary text-interactive-normal">
                    <IconForum size={28} />
                  </span>
                  <h2 className="text-[18px] font-semibold text-header-primary">
                    {posts.length === 0 ? t("No posts yet") : t("Nothing matches that")}
                  </h2>
                  <p className="mt-1 max-w-sm text-[14px] text-text-muted">
                    {posts.length === 0
                      ? canPost
                        ? t("Start the first conversation in #{name}.", { name: forum.name })
                        : t("Posts will show up here when people start them.")
                      : t("Try a different search or clear the tag filter.")}
                  </p>
                  {posts.length === 0 && canPost && (
                    <button
                      type="button"
                      onClick={() => setComposerOpen(true)}
                      className="mt-5 rounded-xl bg-brand px-4 py-2 text-[14px] font-semibold text-brand-foreground transition-colors hover:bg-brand-hover"
                    >
                      {t("New post")}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <NewPostDialog
        open={composerOpen}
        forum={forum}
        onClose={() => setComposerOpen(false)}
        onCreated={(postId) => {
          setComposerOpen(false);
          void load();
          openPost(postId);
        }}
      />
      <EditPostDialog
        post={editing}
        forum={forum}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />
    </main>
  );
}

function TagPicker({ available, selected, onChange }: { available: string[]; selected: string[]; onChange: (tags: string[]) => void }) {
  const { t } = useI18n();
  if (available.length === 0) return null;
  return (
    <div className="mt-4">
      <ClassicLabel>{t("Tags")}</ClassicLabel>
      <div className="flex flex-wrap gap-1.5">
        {available.map((tag) => {
          const on = selected.includes(tag);
          const full = !on && selected.length >= 5;
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={on}
              disabled={full}
              onClick={() => onChange(on ? selected.filter((x) => x !== tag) : [...selected, tag])}
              className={`h-7 rounded-full border px-3 text-[12px] font-semibold transition-colors disabled:opacity-40 ${
                on ? "border-brand bg-brand-soft text-header-primary" : "border-border-subtle text-text-muted hover:border-border-strong hover:text-text-normal"
              }`}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NewPostDialog({
  open,
  forum,
  onClose,
  onCreated,
}: {
  open: boolean;
  forum: Channel;
  onClose: () => void;
  onCreated: (postId: string) => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setBody("");
    setTags([]);
    setError(null);
  }, [open]);

  const submit = async () => {
    if (busy) return;
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    if (!cleanTitle) return setError(t("Give your post a title."));
    if (!cleanBody) return setError(t("Write something to start the post."));
    setBusy(true);
    setError(null);
    try {
      const { data, error: rpcError } = await getSupabaseClient().rpc("create_forum_post", {
        p_forum_id: forum.id,
        p_title: cleanTitle,
        p_content: cleanBody,
        p_tags: tags,
      });
      if (rpcError || typeof data !== "string") {
        setError(friendlyError(rpcError, t("Couldn't start the post. Try again.")));
        return;
      }
      onCreated(data);
    } catch {
      setError(t("Couldn't start the post. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ClassicModal
      open={open}
      onClose={onClose}
      title={t("New post in #{name}", { name: forum.name })}
      centered={false}
      width={560}
      footer={
        <>
          <button type="button" onClick={onClose} className={`${classicBtn.grey} ${classicBtn.md}`}>
            {t("Cancel")}
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy || !title.trim() || !body.trim()} className={`${classicBtn.brand} ${classicBtn.md}`}>
            {busy ? <LoadingDots size={6} className="mx-auto" /> : t("Post")}
          </button>
        </>
      }
    >
      <ClassicLabel htmlFor="forum-post-title">{t("Title")}</ClassicLabel>
      <input
        id="forum-post-title"
        autoFocus
        value={title}
        maxLength={TITLE_MAX}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("What's this post about?")}
        className={classicInput}
      />
      <TagPicker available={forum.available_tags ?? []} selected={tags} onChange={setTags} />
      <div className="mt-4">
        <ClassicLabel htmlFor="forum-post-body">{t("Message")}</ClassicLabel>
        <textarea
          id="forum-post-body"
          value={body}
          maxLength={BODY_MAX}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={6}
          placeholder={t("Share the details. Markdown works here.")}
          className="w-full resize-y rounded-lg border border-border-subtle bg-bg-tertiary px-3 py-2.5 text-[15px] leading-[22px] text-text-normal outline-none transition-colors placeholder:text-text-muted/80 focus:border-brand"
        />
        <p className="mt-1 text-right text-[12px] tabular-nums text-text-muted">{body.length}/{BODY_MAX}</p>
      </div>
      {error && <p role="alert" className="mt-2 text-[13px] text-status-dnd">{error}</p>}
    </ClassicModal>
  );
}

function EditPostDialog({
  post,
  forum,
  onClose,
  onSaved,
}: {
  post: ForumPost | null;
  forum: Channel;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!post) return;
    setTitle(post.title);
    setTags(post.tags);
    setError(null);
  }, [post]);

  const save = async () => {
    if (!post || busy) return;
    const clean = title.trim();
    if (!clean) return setError(t("Give your post a title."));
    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await getSupabaseClient().rpc("update_forum_post", {
        p_post_id: post.id,
        p_title: clean,
        p_tags: tags,
      });
      if (rpcError) {
        setError(friendlyError(rpcError, t("Couldn't save the post. Try again.")));
        return;
      }
      onSaved();
    } catch {
      setError(t("Couldn't save the post. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ClassicModal
      open={!!post}
      onClose={onClose}
      title={t("Edit post")}
      centered={false}
      width={520}
      footer={
        <>
          <button type="button" onClick={onClose} className={`${classicBtn.grey} ${classicBtn.md}`}>
            {t("Cancel")}
          </button>
          <button type="button" onClick={() => void save()} disabled={busy || !title.trim()} className={`${classicBtn.brand} ${classicBtn.md}`}>
            {busy ? <LoadingDots size={6} className="mx-auto" /> : t("Save")}
          </button>
        </>
      }
    >
      <ClassicLabel htmlFor="forum-edit-title">{t("Title")}</ClassicLabel>
      <input id="forum-edit-title" value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} className={classicInput} />
      <TagPicker available={forum.available_tags ?? []} selected={tags} onChange={setTags} />
      {error && <p role="alert" className="mt-2 text-[13px] text-status-dnd">{error}</p>}
    </ClassicModal>
  );
}
