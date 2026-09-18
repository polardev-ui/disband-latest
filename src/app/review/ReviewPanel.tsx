"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchProfilesByIds } from "@/lib/fetch-profiles";
import { displayName } from "@/lib/utils";
import type { Profile } from "@/lib/supabase/types";

interface Review {
  id: string;
  user_id: string;
  stars: number;
  body: string;
  alias: string | null;
  anonymous: boolean;
  created_at: string;
}

function Stars({ value, onPick, size = "md" }: { value: number; onPick?: (n: number) => void; size?: "md" | "sm" }) {
  const cls = size === "md" ? "text-3xl" : "text-base";
  return (
    <div className="flex gap-1" role={onPick ? "radiogroup" : undefined} aria-label={onPick ? "Your rating" : undefined}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onPick}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          onClick={() => onPick?.(n)}
          className={`${cls} leading-none transition-transform ${onPick ? "cursor-pointer hover:scale-110" : "cursor-default"} ${
            n <= value ? "text-[#fee75c]" : "text-white/15"
          }`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function ReviewForm({
  userId,
  initial,
  onDone,
}: {
  userId: string;
  initial: Review | undefined;
  onDone: () => void;
}) {
  const [stars, setStars] = useState(initial?.stars ?? 5);
  const [alias, setAlias] = useState(initial?.alias ?? "");
  const [anonymous, setAnonymous] = useState(initial?.anonymous ?? false);
  const [body, setBody] = useState(initial?.body ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (stars < 1 || stars > 5) {
      setError("Pick a star rating first.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error } = await getSupabaseClient()
      .from("app_reviews")
      .upsert(
        {
          user_id: userId,
          stars,
          body: body.trim().slice(0, 2000),
          alias: anonymous ? null : alias.trim().slice(0, 32) || null,
          anonymous,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (error) {
      setError(error.message);
      setSaving(false);
    } else {
      onDone();
    }
  };

  const remove = async () => {
    if (!confirm("Delete your review?")) return;
    setSaving(true);
    const { error } = await getSupabaseClient().from("app_reviews").delete().eq("user_id", userId);
    setSaving(false);
    if (!error) onDone();
    else setError(error.message);
  };

  return (
    <div className="space-y-4">
      <Stars value={stars} onPick={setStars} />
      <label className="flex cursor-pointer items-center gap-2 text-sm text-[#9aa0a8]">
        <input
          type="checkbox"
          checked={anonymous}
          onChange={(e) => setAnonymous(e.target.checked)}
          className="h-4 w-4 accent-brand"
        />
        Post anonymously
      </label>
      {!anonymous && (
        <input
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          maxLength={32}
          placeholder="Alias (optional — shown with your review)"
          className="w-full rounded-md border border-white/10 bg-[#1e1f22] px-3 py-2 text-sm text-white outline-none placeholder:text-[#6e727a] focus:border-brand"
        />
      )}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={2000}
        rows={4}
        placeholder="What do you like? What should we fix? (optional)"
        className="w-full resize-y rounded-md border border-white/10 bg-[#1e1f22] px-3 py-2 text-sm text-white outline-none placeholder:text-[#6e727a] focus:border-brand"
      />
      {error && <p className="text-[13px] text-status-dnd">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void submit()}
          className="flex-1 rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : initial ? "Update review" : "Post review"}
        </button>
        {initial && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void remove()}
            className="rounded-md border border-white/10 px-4 py-2.5 text-sm text-[#9aa0a8] transition-colors hover:text-white disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

export function ReviewPanel() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [names, setNames] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);
    const { data } = await supabase
      .from("app_reviews")
      .select("id, user_id, stars, body, alias, anonymous, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    const rows = (data as Review[] | null) ?? [];
    setReviews(rows);
    const namedIds = rows.filter((r) => !r.anonymous).map((r) => r.user_id);
    if (namedIds.length) setNames(await fetchProfilesByIds(supabase, namedIds));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!popupOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopupOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popupOpen]);

  const count = reviews.length;
  const avg = count ? reviews.reduce((s, r) => s + r.stars, 0) / count : 0;
  const dist = [5, 4, 3, 2, 1].map((n) => ({
    stars: n,
    count: reviews.filter((r) => r.stars === n).length,
  }));
  const mine = userId ? reviews.find((r) => r.user_id === userId) : undefined;

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl">
            Reviews
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[#9aa0a8]">
            The real rating of Disband — straight from the people using it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPopupOpen(true)}
          className="shrink-0 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand/25 transition-all hover:scale-[1.03] hover:opacity-90 active:scale-[0.98]"
        >
          {mine ? "Edit your review" : "Write a review"}
        </button>
      </div>

      <div className="mt-8 flex flex-col gap-6 rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-transparent p-6 sm:flex-row sm:items-center">
        {count === 0 ? (
          <p className="text-sm text-[#9aa0a8]">No reviews yet — yours could be the first.</p>
        ) : (
          <>
            <div className="text-center sm:min-w-[120px]">
              <p className="bg-gradient-to-b from-white to-white/60 bg-clip-text text-6xl font-bold tabular-nums text-transparent">
                {avg.toFixed(1)}
              </p>
              <div className="mt-2 flex justify-center">
                <Stars value={Math.round(avg)} size="sm" />
              </div>
              <p className="mt-1.5 text-[13px] text-[#9aa0a8]">
                {count} review{count === 1 ? "" : "s"}
              </p>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              {dist.map((d) => (
                <div key={d.stars} className="flex items-center gap-2.5">
                  <span className="w-3 shrink-0 text-right text-xs tabular-nums text-[#9aa0a8]">{d.stars}</span>
                  <span className="text-xs text-[#fee75c]">★</span>
                  <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand to-[#fee75c] transition-[width]"
                      style={{ width: count ? `${Math.round((d.count / count) * 100)}%` : "0%" }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-xs tabular-nums text-[#6e727a]">{d.count}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-10 space-y-3">
        {loading ? (
          <p className="text-sm text-[#6e727a]">Loading reviews…</p>
        ) : reviews.length === 0 ? (
          <p className="text-sm text-[#6e727a]">Nothing here yet.</p>
        ) : (
          reviews.map((r) => {
            const label = r.anonymous
              ? "Anonymous"
              : r.alias || (names.get(r.user_id) ? displayName(names.get(r.user_id)!) : "Disband user");
            const isMine = userId === r.user_id;
            return (
              <article
                key={r.id}
                className={`rounded-xl border p-4 transition-colors ${
                  isMine ? "border-brand/40 bg-brand/[0.05]" : "border-white/[0.06] bg-white/[0.015]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-white">
                    {label}
                    {isMine && (
                      <span className="ml-2 rounded bg-brand/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand">
                        You
                      </span>
                    )}
                  </p>
                  <Stars value={r.stars} size="sm" />
                </div>
                {r.body && (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#c4c9ce]">{r.body}</p>
                )}
                <p className="mt-2 text-xs text-[#6e727a]">
                  {new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </article>
            );
          })
        )}
      </div>

      {popupOpen && (
        <div
          className="overlay-fade fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setPopupOpen(false)}
        >
          <div
            className="modal-pop w-full max-w-md rounded-2xl border border-white/10 bg-[#1e1f22] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">
                {mine ? "Edit your review" : "Write a review"}
              </h2>
              <button
                type="button"
                onClick={() => setPopupOpen(false)}
                aria-label="Close"
                className="rounded-md p-1.5 text-[#9aa0a8] transition-colors hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>
            {!userId ? (
              <p className="text-sm leading-relaxed text-[#9aa0a8]">
                You need an account to leave a review (keeps the spam out).{" "}
                <Link href="/login" className="font-medium text-brand hover:underline">
                  Log in
                </Link>{" "}
                — you can still post anonymously.
              </p>
            ) : (
              <ReviewForm
                userId={userId}
                initial={mine}
                onDone={() => {
                  setPopupOpen(false);
                  void load();
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
