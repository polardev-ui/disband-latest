"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getSupabaseClient } from "@/lib/supabase/client";
import { isSupportStaff } from "@/lib/support/staff";

interface TeamTicket {
  id: string;
  user_id: string;
  email: string;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface TeamMessage {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

type Filter = "all" | "awaiting" | "resolved";

function formatTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "pending"
      ? "bg-amber-400/12 text-amber-300 "
      : status === "human_reply"
        ? "bg-brand/12 text-brand "
        : status === "closed"
          ? "bg-status-online/12 text-status-online "
          : "bg-bg-tertiary text-text-muted ";

  return (
    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${tone}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function threadLabel(role: string) {
  if (role === "staff") return "Human support";
  if (role === "tether") return "Tether";
  return "User";
}

export default function TeamSupportPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"checking" | "denied" | "ready">("checking");
  const [tickets, setTickets] = useState<TeamTicket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<TeamTicket | null>(null);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyStatus, setReplyStatus] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const messagesRef = useRef<HTMLDivElement | null>(null);

  const canAccess = useCallback(async () => {
    const supabase = getSupabaseClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.replace("/login?next=%2Fapp%2Fteam-support");
      return false;
    }
    if (!isSupportStaff(data.session.user.id)) {
      setPhase("denied");
      return false;
    }
    setPhase("ready");
    return true;
  }, [router]);

  useEffect(() => {
    void canAccess();
  }, [canAccess]);

  const logout = async () => {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/support/team/tickets");
      const json = await res.json() as { tickets?: TeamTicket[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load tickets.");
      const next = json.tickets ?? [];
      setTickets(next);
      if (!selectedId && next.length > 0) setSelectedId(next[0].id);
      if (selectedId && !next.some((item) => item.id === selectedId)) {
        setSelectedId(next[0]?.id ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tickets.");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  const loadTicket = useCallback(async (id: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/support/team/tickets/${id}/messages`);
      const json = await res.json() as { ticket?: TeamTicket; messages?: TeamMessage[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load ticket.");
      setTicket(json.ticket ?? null);
      setMessages(json.messages ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load ticket.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (phase === "ready") void loadTickets();
  }, [phase, loadTickets]);

  useEffect(() => {
    if (selectedId) void loadTicket(selectedId);
  }, [selectedId, loadTicket]);

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages, selectedId]);

  const visibleTickets = useMemo(() => {
    return tickets.filter((item) => {
      if (filter === "all") return true;
      if (filter === "resolved") return item.status === "closed";
      return item.status !== "closed";
    });
  }, [tickets, filter]);

  const counts = useMemo(() => {
    return {
      all: tickets.length,
      awaiting: tickets.filter((item) => item.status !== "closed").length,
      resolved: tickets.filter((item) => item.status === "closed").length,
    };
  }, [tickets]);

  const submitReply = async () => {
    if (!selectedId || !reply.trim() || replying) return;
    setReplying(true);
    setReplyStatus(null);
    try {
      const res = await apiFetch(`/api/support/team/tickets/${selectedId}/reply`, {
        method: "POST",
        body: JSON.stringify({ content: reply.trim() }),
      });
      const json = await res.json() as { emailSent?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not send reply.");
      setReply("");
      setReplyStatus(json.emailSent ? "Reply sent and emailed to the user." : "Reply saved, but the account email could not be sent.");
      await loadTicket(selectedId);
      await loadTickets();
    } catch (err) {
      setReplyStatus(err instanceof Error ? err.message : "Could not send reply.");
    } finally {
      setReplying(false);
    }
  };

  const resolveTicket = async () => {
    if (!selectedId || replying) return;
    const answer = window.confirm("Mark this request as resolved and close the thread?");
    if (!answer) return;
    setReplying(true);
    setReplyStatus(null);
    try {
      const res = await apiFetch(`/api/support/team/tickets/${selectedId}/resolve`, { method: "POST" });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not resolve.");
      setReplyStatus("Ticket marked resolved.");
      await loadTicket(selectedId);
      await loadTickets();
    } catch (err) {
      setReplyStatus(err instanceof Error ? err.message : "Could not resolve.");
    } finally {
      setReplying(false);
    }
  };

  if (phase === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary text-text-muted">
        Checking staff access…
      </div>
    );
  }

  if (phase === "denied") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary px-6 text-center">
        <div className="max-w-md rounded-md border border-divider bg-bg-secondary p-8 shadow-none">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-text-muted">Access denied</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-text-normal">Support staff only</h1>
          <p className="mt-3 text-sm leading-6 text-text-muted">
            This account is signed in, but it is not on the Disband support staff list.
          </p>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-6 rounded-md border border-divider bg-bg-tertiary px-4 py-2.5 text-sm font-medium text-text-normal transition-colors hover:bg-interactive-hover"
          >
            Log out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-bg-primary text-text-normal">
      <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-bg-primary">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6">
          <div>
            <p className="text-xs text-text-muted">Staff tools</p>
            <h1 className="text-[22px] font-extrabold tracking-tight">Team Support</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadTickets()}
              className="rounded-lg border border-divider bg-bg-secondary px-3 py-2 text-xs font-medium text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-lg border border-divider bg-bg-secondary px-3 py-2 text-xs font-medium text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
            >
              Log out
            </button>
          </div>
        </div>
        <div className="border-t border-divider bg-bg-secondary/70">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
            {([
              ["all", "All", counts.all],
              ["awaiting", "Awaiting human", counts.awaiting],
              ["resolved", "Resolved", counts.resolved],
            ] as const).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors ${
                  filter === id
                    ? "bg-brand px-4 text-white"
                    : "bg-bg-tertiary text-text-muted hover:bg-interactive-hover hover:text-text-normal"
                }`}
              >
                {label} <span className="ml-1 tabular-nums">{count}</span>
              </button>
            ))}
            <p className="ml-auto text-xs text-text-muted">Open requests sort above closed tickets automatically.</p>
          </div>
        </div>
      </header>

      <div className="mx-auto grid h-[calc(100vh-10.5rem)] max-w-7xl gap-4 p-4 sm:p-6 lg:grid-cols-[390px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-md border border-divider bg-bg-secondary shadow-none">
          <div className="border-b border-divider px-5 py-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">Requests</h2>
              <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-xs text-text-muted">{visibleTickets.length}</span>
            </div>
            <p className="mt-1 text-xs text-text-muted">Select a request to review, reply, and resolve.</p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {loading && <p className="px-2 py-4 text-sm text-text-muted">Loading tickets…</p>}
            {!loading && visibleTickets.length === 0 && (
              <p className="px-2 py-4 text-sm text-text-muted">
                {filter === "resolved" ? "No resolved requests." : "No open human-review requests."}
              </p>
            )}
            <div className="space-y-2">
              {visibleTickets.map((item) => {
                const selected = selectedId === item.id;
                const pending = item.status === "pending";
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`group w-full rounded-md border p-4 text-left transition-all ${
                      selected
                        ? "border-brand/45 bg-brand/10 shadow-none"
                        : "border-transparent bg-bg-tertiary hover:border-divider hover:bg-bg-tertiary"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-semibold text-text-normal">{item.subject || "(no subject)"}</p>
                      <StatusBadge status={item.status} />
                    </div>
                    <p className="mt-1 truncate text-xs text-text-muted">{item.email}</p>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-text-muted">
                      <span>{formatTime(item.updated_at)}</span>
                      {pending && <span className="text-amber-300">Needs review</span>}
                      {item.status === "human_reply" && <span className="text-brand">Waiting on user</span>}
                      {item.status === "closed" && <span className="text-status-online">Closed</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <main className="flex min-h-0 flex-col overflow-hidden rounded-md border border-divider bg-bg-secondary shadow-none">
          {ticket ? (
            <>
              <header className="border-b border-divider px-5 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-semibold tracking-tight">{ticket.subject}</h2>
                    <p className="mt-1 text-xs text-text-muted">
                      {ticket.email} · opened {formatTime(ticket.created_at)} · updated {formatTime(ticket.updated_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void resolveTicket()}
                    disabled={ticket.status === "closed" || replying}
                    className="shrink-0 rounded-md border border-divider bg-bg-tertiary px-4 py-2 text-sm font-medium transition-colors hover:bg-interactive-hover disabled:opacity-50"
                  >
                    Mark resolved
                  </button>
                </div>
              </header>

              <div ref={messagesRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                <div className="space-y-3">
                  {messages.map((message) => {
                    const human = message.role === "staff";
                    return (
                      <article
                        key={message.id}
                        className={`rounded-md border p-4 ${
                          human ? "border-brand/25 bg-brand/[0.09] ml-6 sm:ml-12" : "border-divider bg-bg-tertiary mr-6 sm:mr-12"
                        }`}
                      >
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-text-muted">
                          <strong className={human ? "text-brand" : "text-text-normal"}>
                            {human ? "Human support" : message.role === "tether" ? "Tether" : "User"}
                          </strong>
                          <span>·</span>
                          <time>{new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-normal">{message.content}</p>
                      </article>
                    );
                  })}
                  {detailLoading && <p className="text-sm text-text-muted">Loading messages…</p>}
                  {messages.length === 0 && !detailLoading && (
                    <p className="text-sm text-text-muted">No messages yet for this ticket.</p>
                  )}
                </div>
              </div>

              <footer className="border-t border-divider bg-bg-secondary p-4">
                {replyStatus && (
                  <p className="mb-3 rounded-lg border border-divider bg-bg-tertiary px-3 py-2 text-xs text-text-muted">
                    {replyStatus}
                  </p>
                )}
                {ticket.status === "closed" ? (
                  <div className="rounded-md border border-status-online/20 bg-status-online/8 p-4 text-sm text-text-muted">
                    This request is resolved and read-only. Use the conversation history above for follow-up context.
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      rows={3}
                      maxLength={4000}
                      placeholder="Reply as human support…"
                      className="min-h-[84px] flex-1 resize-y rounded-md border border-divider bg-bg-tertiary p-4 text-sm outline-none transition-colors placeholder:text-text-muted focus:border-brand/50 focus:ring-2 focus:ring-brand/15"
                    />
                    <button
                      type="button"
                      onClick={() => void submitReply()}
                      disabled={replying || !reply.trim()}
                      className="self-end rounded-md bg-brand px-5 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
                    >
                      {replying ? "Sending…" : "Reply"}
                    </button>
                  </div>
                )}
                <p className="mt-2 text-xs text-text-muted">
                  Replies are added to the user&apos;s thread and attempt delivery to their account email.
                </p>
              </footer>
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center">
              <div>
                <p className="text-sm font-medium text-text-muted">Select a request to review</p>
                <p className="mt-1 text-xs text-text-muted/70">The full conversation and reply controls will appear here.</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
