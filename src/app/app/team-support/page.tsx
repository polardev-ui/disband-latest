"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getSupabaseClient } from "@/lib/supabase/client";
import { isSupportStaffFromProfile } from "@/lib/support/staff";
import { AccountViewerModal } from "@/components/modals/AccountViewerModal";

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
    <span className={`shrink-0 rounded-[3px] px-2.5 py-0.5 text-[11px] font-medium ${tone}`}>
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
  const [activeTab, setActiveTab] = useState<"tickets" | "bans" | "appeals" | "flags">("tickets");
  const messagesRef = useRef<HTMLDivElement | null>(null);

  // Bans
  interface BanRow {
    user_id: string;
    reason: string | null;
    email: string | null;
    created_at: string;
    banned_by: string | null;
    profile?: { username: string | null; display_name: string | null } | null;
  }
  const [bans, setBans] = useState<BanRow[]>([]);
  const [bansLoading, setBansLoading] = useState(false);

  // Appeals
  interface AppealRow {
    id: string;
    user_id: string;
    reason: string;
    status: string;
    decision: string | null;
    created_at: string;
    profile?: { username: string | null; display_name: string | null; avatar_url: string | null } | null;
  }
  const [appeals, setAppeals] = useState<AppealRow[]>([]);
  const [appealsLoading, setAppealsLoading] = useState(false);
  const [selectedAppealId, setSelectedAppealId] = useState<string | null>(null);
  const [appealDecision, setAppealDecision] = useState("");

  // Flags (message reports)
  interface FlagRow {
    id: string;
    reporter_id: string;
    reported_user_id?: string | null;
    target_type: string;
    target_surface: string;
    reason: string;
    status: string;
    details?: string | null;
    created_at: string;
    snapshot?: any;
    reporter?: { username: string | null; display_name: string | null } | null;
    reported?: { username: string | null; display_name: string | null } | null;
  }
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [flagsLoading, setFlagsLoading] = useState(false);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);

  const canAccess = useCallback(async () => {
    const supabase = getSupabaseClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.replace("/login?next=%2Fapp%2Fteam-support");
      return false;
    }
    // Check support staff status from the database (profiles.is_support_staff)
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_support_staff")
      .eq("id", data.session.user.id)
      .maybeSingle();
    if (!isSupportStaffFromProfile(profile)) {
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

  const loadBans = useCallback(async () => {
    setBansLoading(true);
    try {
      const res = await apiFetch("/api/moderation/platform-ban");
      const json = await res.json() as { bans?: BanRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load bans.");
      setBans(json.bans ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load bans.");
    } finally {
      setBansLoading(false);
    }
  }, []);

  const loadAppeals = useCallback(async () => {
    setAppealsLoading(true);
    try {
      const res = await apiFetch("/api/moderation/ban-appeals");
      const json = await res.json() as { appeals?: AppealRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load appeals.");
      setAppeals(json.appeals ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load appeals.");
    } finally {
      setAppealsLoading(false);
    }
  }, []);

  const loadFlags = useCallback(async () => {
    setFlagsLoading(true);
    try {
      const res = await apiFetch("/api/moderation/message-reports");
      const json = await res.json() as { reports?: FlagRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load flags.");
      setFlags(json.reports ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load flags.");
    } finally {
      setFlagsLoading(false);
    }
  }, []);

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
    if (phase !== "ready") return;
    if (activeTab === "bans") void loadBans();
    if (activeTab === "appeals") void loadAppeals();
    if (activeTab === "flags") void loadFlags();
  }, [phase, activeTab, loadBans, loadAppeals, loadFlags]);

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
        <div className="max-w-md rounded-[3px] border border-divider bg-bg-secondary p-8 shadow-none">
          <p className="font-mono text-[11px] uppercase tracking-[0.02em] text-text-muted">Access denied</p>
          <h1 className="mt-3 text-2xl font-bold  text-text-normal">Support staff only</h1>
          <p className="mt-3 text-sm leading-6 text-text-muted">
            This account is signed in, but it is not on the Disband support staff list.
          </p>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-6 rounded-[3px] border border-divider bg-bg-tertiary px-4 py-2.5 text-sm font-medium text-text-normal transition-colors hover:bg-interactive-hover"
          >
            Log out
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="h-screen overflow-hidden bg-bg-primary text-text-normal">
      <header className="sticky top-0 z-20 border-b border-divider bg-bg-primary">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6">
          <div>
            <p className="text-xs text-text-muted">Staff tools</p>
            <h1 className="text-[22px] font-bold ">Team Support</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadTickets()}
              className="rounded-[4px] border border-divider bg-bg-secondary px-3 py-2 text-xs font-medium text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-[4px] border border-divider bg-bg-secondary px-3 py-2 text-xs font-medium text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
            >
              Log out
            </button>
          </div>
        </div>
        <div className="border-t border-divider bg-bg-secondary">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
            {([
              ["tickets", "Tickets", tickets.length],
              ["bans", "Bans", bans.length],
              ["appeals", "Appeals", appeals.filter((a) => a.status === "pending").length],
              ["flags", "Flags", flags.filter((f) => f.status === "pending").length],
            ] as const).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`rounded-lg px-4 py-2 text-[13px] font-semibold transition-all duration-150 ${
                  activeTab === id
                    ? "bg-brand text-white shadow-md shadow-brand/20"
                    : "bg-bg-tertiary text-text-muted hover:bg-interactive-hover hover:text-text-normal"
                }`}
              >
                {label}
                <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] tabular-nums ${activeTab === id ? "bg-white/20" : "bg-bg-secondary"}`}>
                  {count}
                </span>
              </button>
            ))}
          </div>
          {activeTab === "tickets" && (
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 pb-3 sm:px-6">
              {([
                ["all", "All", counts.all],
                ["awaiting", "Awaiting human", counts.awaiting],
                ["resolved", "Resolved", counts.resolved],
              ] as const).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`rounded-[3px] px-3.5 py-1.5 text-[12px] font-medium transition-colors ${
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
          )}
        </div>
      </header>

      {activeTab === "tickets" && (
      <div className="mx-auto grid h-[calc(100vh-10.5rem)] max-w-7xl gap-4 p-4 sm:p-6 lg:grid-cols-[390px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-[3px] border border-divider bg-bg-secondary shadow-none">
          <div className="border-b border-divider px-5 py-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.02em] text-text-muted">Requests</h2>
              <span className="rounded-[3px] bg-bg-tertiary px-2.5 py-1 text-xs text-text-muted">{visibleTickets.length}</span>
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
                    className={`group w-full rounded-[3px] border p-4 text-left transition-colors ${
                      selected
                        ? "border-brand/60 bg-brand/10 shadow-none"
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

        <main className="flex min-h-0 flex-col overflow-hidden rounded-[3px] border border-divider bg-bg-secondary shadow-none">
          {ticket ? (
            <>
              <header className="border-b border-divider px-5 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-semibold ">{ticket.subject}</h2>
                    <p className="mt-1 text-xs text-text-muted">
                      {ticket.email} · opened {formatTime(ticket.created_at)} · updated {formatTime(ticket.updated_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void resolveTicket()}
                    disabled={ticket.status === "closed" || replying}
                    className="shrink-0 rounded-[3px] border border-divider bg-bg-tertiary px-4 py-2 text-sm font-medium transition-colors hover:bg-interactive-hover disabled:opacity-50"
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
                        className={`rounded-[3px] border p-4 ${
                          human ? "border-brand/25 bg-brand/[0.09] ml-6 sm:ml-12" : "border-divider bg-bg-tertiary mr-6 sm:mr-12"
                        }`}
                      >
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.02em] text-text-muted">
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
                  <p className="mb-3 rounded-[4px] border border-divider bg-bg-tertiary px-3 py-2 text-xs text-text-muted">
                    {replyStatus}
                  </p>
                )}
                {ticket.status === "closed" ? (
                  <div className="rounded-[3px] border border-status-online/20 bg-status-online/8 p-4 text-sm text-text-muted">
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
                      className="min-h-[84px] flex-1 resize-y rounded-[3px] border border-divider bg-bg-tertiary p-4 text-sm outline-none transition-colors placeholder:text-text-muted focus:border-[#00a8fc] "
                    />
                    <button
                      type="button"
                      onClick={() => void submitReply()}
                      disabled={replying || !reply.trim()}
                      className="self-end rounded-[3px] bg-brand px-5 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
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
      )}

      {activeTab === "bans" && (
        <div className="mx-auto max-w-7xl p-4 sm:p-6">
          <div className="rounded-[3px] border border-divider bg-bg-secondary p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.02em] text-text-muted">Platform bans</h2>
            {error && <p className="mt-3 rounded-[3px] border border-status-dnd/30 bg-status-dnd/10 px-3 py-2 text-sm text-status-dnd">{error}</p>}
            {bansLoading && <p className="mt-4 text-sm text-text-muted">Loading bans…</p>}
            {!bansLoading && bans.length === 0 && !error && <p className="mt-4 text-sm text-text-muted">No bans found.</p>}
            <div className="mt-4 space-y-3">
              {bans.map((ban) => (
                <div key={ban.user_id} className="flex items-center justify-between rounded-lg border border-divider bg-bg-tertiary p-4 transition-colors hover:bg-interactive-hover">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-status-dnd/20 text-sm font-bold text-status-dnd">
                      {(ban.profile?.display_name || ban.profile?.username || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-normal">{ban.profile?.display_name || ban.profile?.username || ban.user_id}</p>
                      <p className="mt-0.5 text-xs text-text-muted">{ban.reason || "No reason provided"}</p>
                      <p className="mt-0.5 text-[11px] text-text-muted/70">{new Date(ban.created_at).toLocaleString()}{ban.email ? ` · ${ban.email}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => setViewingUserId(ban.user_id)}
                      className="rounded-md border border-divider bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
                    >
                      View account
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await apiFetch("/api/moderation/platform-ban", {
                          method: "POST",
                          body: JSON.stringify({ action: "unban", userId: ban.user_id }),
                        });
                        if (res.ok) void loadBans();
                      }}
                      className="rounded-md border border-status-dnd/40 bg-status-dnd/10 px-3 py-1.5 text-xs font-semibold text-status-dnd transition-colors hover:bg-status-dnd/20"
                    >
                      Unban
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "appeals" && (
        <div className="mx-auto max-w-7xl p-4 sm:p-6">
          <div className="rounded-[3px] border border-divider bg-bg-secondary p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.02em] text-text-muted">Ban appeals</h2>
            {appealsLoading && <p className="mt-4 text-sm text-text-muted">Loading appeals…</p>}
            {!appealsLoading && appeals.length === 0 && <p className="mt-4 text-sm text-text-muted">No appeals found.</p>}
            <div className="mt-4 space-y-3">
              {appeals.map((appeal) => (
                <div key={appeal.id} className="rounded-[3px] border border-divider bg-bg-tertiary p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-normal">{appeal.profile?.display_name || appeal.profile?.username || appeal.user_id}</p>
                      <p className="mt-1 text-xs text-text-muted">Submitted {new Date(appeal.created_at).toLocaleString()} · {appeal.status}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => setViewingUserId(appeal.user_id)}
                        className="rounded-md border border-divider bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
                      >
                        View account
                      </button>
                      <span className="shrink-0 rounded-[3px] bg-bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-text-muted">{appeal.status}</span>
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-normal">{appeal.reason}</p>
                  {appeal.status === "pending" && (
                    <div className="mt-4 space-y-2">
                      <textarea
                        value={selectedAppealId === appeal.id ? appealDecision : ""}
                        onChange={(e) => { setSelectedAppealId(appeal.id); setAppealDecision(e.target.value); }}
                        rows={3}
                        placeholder="Decision note (optional)…"
                        className="w-full resize-y rounded-[3px] border border-divider bg-bg-primary p-3 text-sm outline-none transition-colors placeholder:text-text-muted focus:border-[#00a8fc]"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await apiFetch(`/api/moderation/ban-appeals/${appeal.id}/decide`, {
                              method: "POST",
                              body: JSON.stringify({ approve: true, decision: appealDecision }),
                            });
                            if (res.ok) { setAppealDecision(""); setSelectedAppealId(null); void loadAppeals(); void loadBans(); }
                          }}
                          className="rounded-[3px] bg-status-online px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-status-online/80"
                        >
                          Approve (unban)
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await apiFetch(`/api/moderation/ban-appeals/${appeal.id}/decide`, {
                              method: "POST",
                              body: JSON.stringify({ approve: false, decision: appealDecision }),
                            });
                            if (res.ok) { setAppealDecision(""); setSelectedAppealId(null); void loadAppeals(); }
                          }}
                          className="rounded-[3px] bg-status-dnd px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-status-dnd/80"
                        >
                          Deny
                        </button>
                      </div>
                    </div>
                  )}
                  {appeal.decision && (
                    <p className="mt-3 text-xs text-text-muted">Decision: {appeal.decision}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "flags" && (
        <div className="mx-auto max-w-7xl p-4 sm:p-6">
          <div className="rounded-[3px] border border-divider bg-bg-secondary p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.02em] text-text-muted">Message / profile flags</h2>
            {error && <p className="mt-3 rounded-[3px] border border-status-dnd/30 bg-status-dnd/10 px-3 py-2 text-sm text-status-dnd">{error}</p>}
            {flagsLoading && <p className="mt-4 text-sm text-text-muted">Loading flags…</p>}
            {!flagsLoading && flags.length === 0 && <p className="mt-4 text-sm text-text-muted">No flags found.</p>}
            <div className="mt-4 space-y-3">
              {flags.map((flag) => (
                <div key={flag.id} className="rounded-[3px] border border-divider bg-bg-tertiary p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-normal">
                        {flag.target_type} · {flag.target_surface} · {flag.reason}
                      </p>
                      <p className="mt-1 text-xs text-text-muted">
                        Reported by {flag.reporter?.display_name || flag.reporter?.username || flag.reporter_id} · {new Date(flag.created_at).toLocaleString()}
                      </p>
                      {flag.reported && (
                        <p className="mt-1 text-xs text-text-muted">
                          Reported user: {flag.reported.display_name || flag.reported.username || flag.reported_user_id}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-[3px] bg-bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-text-muted">{flag.status}</span>
                  </div>
                  {flag.details && <p className="mt-2 text-sm text-text-muted">{flag.details}</p>}
                  {flag.snapshot && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs text-text-muted hover:text-text-normal">View snapshot</summary>
                      <pre className="mt-2 max-h-40 overflow-auto rounded-[3px] bg-bg-primary p-3 text-xs text-text-muted">{JSON.stringify(flag.snapshot, null, 2)}</pre>
                    </details>
                  )}
                  {flag.status === "pending" && (
                    <div className="mt-3 flex gap-2">
                      {flag.reported_user_id && (
                        <button
                          type="button"
                          onClick={() => setViewingUserId(flag.reported_user_id!)}
                          className="rounded-[3px] border border-divider bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-interactive-hover"
                        >
                          View account
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await apiFetch(`/api/moderation/message-reports/${flag.id}/resolve`, {
                            method: "POST",
                            body: JSON.stringify({ action: "dismiss", decision: "Dismissed by staff." }),
                          });
                          if (res.ok) void loadFlags();
                        }}
                        className="rounded-[3px] border border-divider bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-interactive-hover"
                      >
                        Dismiss
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await apiFetch(`/api/moderation/message-reports/${flag.id}/resolve`, {
                            method: "POST",
                            body: JSON.stringify({ action: "actioned", decision: "Actioned by staff." }),
                          });
                          if (res.ok) void loadFlags();
                        }}
                        className="rounded-[3px] bg-status-dnd px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-status-dnd/80"
                      >
                        Action
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
      {viewingUserId && <AccountViewerModal userId={viewingUserId} onClose={() => setViewingUserId(null)} />}
    </>
  );
}
