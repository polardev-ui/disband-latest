"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getSupabaseClient } from "@/lib/supabase/client";
import { isSupportStaffFromProfile } from "@/lib/support/staff";
import { AccountViewerModal } from "@/components/modals/AccountViewerModal";
import { ClassicModal } from "@/components/ui/ClassicModal";
import { confirmDialog } from "@/lib/dialogs";
import {
  IconAlert,
  IconBot,
  IconCheck,
  IconCheckAll,
  IconChevronLeft,
  IconClose,
  IconGroup,
  IconInbox,
  IconLeave,
  IconLock,
  IconMessage,
  IconSearch,
  IconSend,
  IconShield,
  IconSparkle,
  IconStaff,
} from "@/components/icons";

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
  // Open on what needs a person; "All" is a click away.
  const [filter, setFilter] = useState<Filter>("awaiting");
  const [ticketQuery, setTicketQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("tickets");
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
    reporter_id: string | null;
    reported_user_id?: string | null;
    target_type: string;
    target_surface: string;
    reason: string;
    status: string;
    details?: string | null;
    decision?: string | null;
    action?: string | null;
    last_error?: string | null;
    created_at: string;
    reviewed_at?: string | null;
    snapshot?: any;
    reporter?: { username: string | null; display_name: string | null } | null;
    reported?: { username: string | null; display_name: string | null } | null;
  }
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [flagsLoading, setFlagsLoading] = useState(false);
  // Sentinel's rule matches, each with Tether's verdict in `resolution`.
  interface ContentFlagRow {
    id: string;
    src_table: string;
    src_column: string;
    src_id: string;
    category: string;
    rule_id: string;
    state: string;
    resolution: string | null;
    created_at: string;
    resolved_at: string | null;
  }
  const [contentFlags, setContentFlags] = useState<ContentFlagRow[]>([]);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);

  // Servers (staff search)
  interface ServerRow {
    id: string;
    name: string;
    owner_id: string;
    icon_url: string | null;
    created_at: string;
    member_count: number;
  }
  interface ServerMemberRow {
    user_id: string;
    role: string;
    joined_at: string;
    profile?: { username: string | null; display_name: string | null; avatar_url: string | null; is_support_staff?: boolean; show_staff_badge?: boolean } | null;
  }
  interface AuditEntry {
    id: number;
    server_id: string;
    actor_id: string | null;
    action: string;
    target_type: string | null;
    target_id: string | null;
    details: any;
    created_at: string;
    actor?: { username: string | null; display_name: string | null } | null;
  }
  // Users
  interface UserRow { id: string; username: string | null; display_name: string | null; avatar_url: string | null; created_at: string }
  const [userQuery, setUserQuery] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersSearched, setUsersSearched] = useState(false);
  const searchUsers = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setUsersLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/moderation/users/search?q=${encodeURIComponent(q.trim())}`);
      const json = await res.json() as { users?: UserRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not search users.");
      setUsers(json.users ?? []);
      setUsersSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not search users.");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const [serverQuery, setServerQuery] = useState("");
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [serversLoading, setServersLoading] = useState(false);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [serverMembers, setServerMembers] = useState<ServerMemberRow[]>([]);
  const [serverAudit, setServerAudit] = useState<AuditEntry[]>([]);
  const [serverDetailLoading, setServerDetailLoading] = useState(false);
  const [serverUserCheck, setServerUserCheck] = useState("");
  const [serverUserResult, setServerUserResult] = useState<any>(null);

  // Flag action modal
  const [actioningFlag, setActioningFlag] = useState<FlagRow | null>(null);
  const [actionType, setActionType] = useState<"actioned" | "dismissed">("actioned");
  const [actionDecision, setActionDecision] = useState("");
  const [actioning, setActioning] = useState(false);

  const canAccess = useCallback(async () => {
    const supabase = getSupabaseClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.replace("/login?next=%2Fapp%2Fteam-support");
      return false;
    }
    // The support flag on the profile, or any staff/moderator/manager badge.
    const [{ data: profile }, { data: badged }] = await Promise.all([
      supabase.from("profiles").select("is_support_staff").eq("id", data.session.user.id).maybeSingle(),
      supabase.rpc("is_platform_staff", { p_user: data.session.user.id }),
    ]);
    if (!isSupportStaffFromProfile(profile) && badged !== true) {
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
      // Tether decides every report and flag, so show his finished work, not
      // just what's still open.
      const [reportsRes, flagsRes] = await Promise.all([
        apiFetch("/api/moderation/message-reports?status=all"),
        apiFetch("/api/moderation/content-flags"),
      ]);
      const json = await reportsRes.json() as { reports?: FlagRow[]; error?: string };
      if (!reportsRes.ok) throw new Error(json.error ?? "Could not load flags.");
      setFlags(json.reports ?? []);
      const flagJson = await flagsRes.json() as { flags?: ContentFlagRow[]; error?: string };
      if (!flagsRes.ok) throw new Error(flagJson.error ?? "Could not load Sentinel flags.");
      setContentFlags(flagJson.flags ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load flags.");
    } finally {
      setFlagsLoading(false);
    }
  }, []);

  const loadServers = useCallback(async (q: string) => {
    setServersLoading(true);
    try {
      const res = await apiFetch(`/api/moderation/servers/search?q=${encodeURIComponent(q)}`);
      const json = await res.json() as { servers?: ServerRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load servers.");
      setServers(json.servers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load servers.");
    } finally {
      setServersLoading(false);
    }
  }, []);

  const loadServerDetail = useCallback(async (id: string) => {
    setSelectedServerId(id);
    setServerDetailLoading(true);
    setServerMembers([]);
    setServerAudit([]);
    setServerUserResult(null);
    // Loaded independently: a failing audit log used to blank the members too.
    const [membersRes, auditRes] = await Promise.all([
      apiFetch(`/api/moderation/servers/${id}/members`).catch(() => null),
      apiFetch(`/api/moderation/servers/${id}/audit`).catch(() => null),
    ]);
    const membersJson = (await membersRes?.json().catch(() => null)) as { members?: ServerMemberRow[]; error?: string } | null;
    const auditJson = (await auditRes?.json().catch(() => null)) as { entries?: AuditEntry[]; error?: string } | null;
    setServerMembers(membersJson?.members ?? []);
    setServerAudit(auditJson?.entries ?? []);
    if (!membersRes?.ok) setError(membersJson?.error ?? "Could not load members.");
    else if (!auditRes?.ok) setError(auditJson?.error ?? "Could not load the audit log.");
    setServerDetailLoading(false);
  }, []);

  const checkServerUser = useCallback(async () => {
    if (!selectedServerId || !serverUserCheck.trim()) return;
    setServerUserResult(null);
    try {
      // A user ID, or a username matched against this server's members.
      const userId = serverUserCheck.trim();
      const member = serverMembers.find((m) => m.user_id === userId || m.profile?.username?.toLowerCase() === userId.toLowerCase());
      const auditRes = await apiFetch(`/api/moderation/servers/${selectedServerId}/audit?userId=${encodeURIComponent(member?.user_id ?? userId)}`);
      const auditJson = await auditRes.json() as { entries?: AuditEntry[] };
      setServerUserResult({ member: member ?? null, audit: auditJson.entries ?? [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check user.");
    }
  }, [selectedServerId, serverUserCheck, serverMembers]);

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

  // Bans and open reports feed the sidebar counts and the account card, so
  // load them once up front rather than only when their tab opens.
  useEffect(() => {
    if (phase !== "ready") return;
    void loadBans();
    void loadAppeals();
    void loadFlags();
  }, [phase, loadBans, loadAppeals, loadFlags]);

  useEffect(() => {
    if (phase !== "ready") return;
    if (activeTab === "bans") void loadBans();
    if (activeTab === "appeals") void loadAppeals();
    if (activeTab === "flags") void loadFlags();
    if (activeTab === "servers") void loadServers(serverQuery);
  }, [phase, activeTab, loadBans, loadAppeals, loadFlags, loadServers, serverQuery]);

  useEffect(() => {
    if (selectedId) void loadTicket(selectedId);
  }, [selectedId, loadTicket]);

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages, selectedId]);

  const visibleTickets = useMemo(() => {
    const q = ticketQuery.trim().toLowerCase();
    return tickets.filter((item) => {
      if (q && !`${item.subject} ${item.email}`.toLowerCase().includes(q)) return false;
      if (filter === "all") return true;
      if (filter === "resolved") return item.status === "closed";
      return item.status !== "closed";
    });
  }, [tickets, filter, ticketQuery]);

  // j / k step through the list, like a mail client, when not typing.
  useEffect(() => {
    if (activeTab !== "tickets") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key !== "j" && e.key !== "k") return;
      if (visibleTickets.length === 0) return;
      const i = visibleTickets.findIndex((x) => x.id === selectedId);
      const next = e.key === "j" ? Math.min(visibleTickets.length - 1, i + 1) : Math.max(0, i === -1 ? 0 : i - 1);
      setSelectedId(visibleTickets[next].id);
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTab, visibleTickets, selectedId]);

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
    const answer = await confirmDialog({
      title: "Resolve this request?",
      body: "The thread is marked resolved and closed.",
      confirmLabel: "Resolve",
      tone: "primary",
    });
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

  const unban = async (userId: string) => {
    const ok = await confirmDialog({
      title: "Lift this platform ban?",
      body: "They can sign in and use Disband again straight away.",
      confirmLabel: "Unban",
      tone: "danger",
    });
    if (!ok) return;
    const res = await apiFetch("/api/moderation/platform-ban", {
      method: "POST",
      body: JSON.stringify({ action: "unban", userId }),
    });
    if (res.ok) {
      void loadBans();
      return;
    }
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    setError(json?.error ?? "Could not lift the ban.");
  };

  const decideAppeal = async (id: string, approve: boolean) => {
    const res = await apiFetch(`/api/moderation/ban-appeals/${id}/decide`, {
      method: "POST",
      body: JSON.stringify({ approve, decision: selectedAppealId === id ? appealDecision : "" }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(json?.error ?? "Could not save the decision.");
      return;
    }
    setAppealDecision("");
    setSelectedAppealId(null);
    void loadAppeals();
    if (approve) void loadBans();
  };

  const dismissFlag = async (id: string) => {
    const res = await apiFetch(`/api/moderation/message-reports/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ action: "dismiss", decision: "Dismissed by staff." }),
    });
    if (res.ok) void loadFlags();
  };

  if (phase === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-tertiary text-[14px] text-text-muted">
        Checking staff access…
      </div>
    );
  }

  if (phase === "denied") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-tertiary px-4">
        <div className="classic-modal w-full max-w-[440px] overflow-hidden rounded-lg bg-bg-primary text-center shadow-[var(--elevation-high)]">
          <div className="px-6 pb-6 pt-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-status-dnd/15 text-status-dnd">
              <IconLock size={26} />
            </div>
            <h1 className="mt-4 text-[24px] font-bold leading-[30px] text-header-primary">Staff only</h1>
            <p className="mt-2 text-[15px] leading-5 text-header-secondary">
              You&apos;re signed in, but this account isn&apos;t on the Disband support team.
            </p>
          </div>
          <div className="flex justify-center gap-2 bg-bg-secondary p-4">
            <button type="button" onClick={() => router.replace("/app")} className={`${ui.btnSecondary} h-[38px]`}>
              Back to Disband
            </button>
            <button type="button" onClick={() => void logout()} className={`${ui.btnGhost} h-[38px]`}>
              Log out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pendingAppeals = appeals.filter((a) => a.status === "pending").length;
  const openFlags = flags.filter((f) => f.status !== "actioned" && f.status !== "dismissed").length;
  const nav: { id: TabId; label: string; icon: React.ReactNode; count: number; urgent: boolean; blurb: string }[] = [
    { id: "tickets", label: "Tickets", icon: <IconInbox size={20} />, count: counts.awaiting, urgent: counts.awaiting > 0, blurb: "Support requests that need a person" },
    { id: "users", label: "Users", icon: <IconSearch size={20} />, count: 0, urgent: false, blurb: "Find an account by username, display name or user ID" },
    { id: "flags", label: "Reports", icon: <IconAlert size={20} />, count: openFlags, urgent: openFlags > 0, blurb: "Member reports and Sentinel matches" },
    { id: "appeals", label: "Appeals", icon: <IconMessage size={20} />, count: pendingAppeals, urgent: pendingAppeals > 0, blurb: "Requests to lift a platform ban" },
    { id: "bans", label: "Platform bans", icon: <IconShield size={20} />, count: bans.length, urgent: false, blurb: "Accounts banned from Disband" },
    { id: "servers", label: "Spaces", icon: <IconGroup size={20} />, count: 0, urgent: false, blurb: "Look up a space, its members and audit log" },
  ];
  const current = nav.find((n) => n.id === activeTab)!;
  const refresh = () => {
    if (activeTab === "tickets") void loadTickets();
    if (activeTab === "bans") void loadBans();
    if (activeTab === "appeals") void loadAppeals();
    if (activeTab === "flags") void loadFlags();
    if (activeTab === "servers") void loadServers(serverQuery);
  };
  const selectedServer = servers.find((sv) => sv.id === selectedServerId) ?? null;

  return (
    <>
      <div className="flex h-dvh overflow-hidden bg-bg-primary text-text-normal">
        {/* Sidebar: Discord's settings rail, icons only on narrow screens. */}
        <nav aria-label="Staff tools" className="flex w-[72px] shrink-0 flex-col bg-bg-secondary md:w-[240px]">
          <div className="flex h-12 shrink-0 items-center gap-2.5 px-4 shadow-[0_1px_0_rgb(0_0_0/0.2)]">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-white">
              <IconStaff size={16} />
            </span>
            <span className="hidden truncate text-[15px] font-semibold text-header-primary md:block">Disband Staff</span>
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
            <p className={`${ui.eyebrow} hidden px-2.5 pb-1.5 md:block`}>Moderation</p>
            {nav.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  aria-current={active ? "page" : undefined}
                  title={item.label}
                  className={`flex h-[38px] w-full items-center justify-center gap-3 rounded-[4px] px-2.5 text-[15px] font-medium transition-colors md:justify-start ${
                    active
                      ? "bg-interactive-hover text-header-primary"
                      : "text-text-muted hover:bg-interactive-hover/60 hover:text-text-normal"
                  }`}
                >
                  <span className="shrink-0">{item.icon}</span>
                  <span className="hidden min-w-0 flex-1 truncate text-left md:block">{item.label}</span>
                  {item.count > 0 && (
                    <span
                      className={`hidden h-4 min-w-4 items-center justify-center rounded-full px-1 text-[11px] font-bold tabular-nums md:flex ${
                        item.urgent ? "bg-status-dnd text-white" : "bg-bg-tertiary text-text-muted"
                      }`}
                    >
                      {item.count > 99 ? "99+" : item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex shrink-0 flex-col gap-1 border-t border-divider/60 p-2 md:flex-row">
            <button type="button" onClick={() => router.push("/app")} title="Back to Disband" className={`${ui.btnGhost} h-9 flex-1 justify-center md:justify-start`}>
              <IconChevronLeft size={18} />
              <span className="hidden md:inline">Back to Disband</span>
            </button>
            <button type="button" onClick={() => void logout()} title="Log out" className={`${ui.btnGhost} h-9 w-full justify-center px-2 hover:text-status-dnd md:w-9`}>
              <IconLeave size={18} />
            </button>
          </div>
        </nav>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="z-10 flex h-12 shrink-0 items-center gap-3 px-4 shadow-[0_1px_0_rgb(0_0_0/0.2),0_1.5px_0_rgb(0_0_0/0.05),0_2px_0_rgb(0_0_0/0.05)]">
            <span className="text-text-muted">{current.icon}</span>
            <h1 className="truncate text-[16px] font-semibold text-header-primary">{current.label}</h1>
            <span className="hidden h-6 w-px bg-divider sm:block" />
            <p className="hidden truncate text-[14px] text-text-muted sm:block">{current.blurb}</p>
            <button type="button" onClick={refresh} className={`${ui.btnGhost} ml-auto h-8`}>
              Refresh
            </button>
          </header>

          {error && (
            <div role="alert" className="mx-4 mt-3 flex items-start gap-3 rounded-lg border border-status-dnd/30 bg-status-dnd/10 px-3.5 py-2.5 text-[14px] text-text-normal">
              <IconAlert size={18} className="mt-0.5 shrink-0 text-status-dnd" />
              <p className="min-w-0 flex-1">{error}</p>
              <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="shrink-0 text-text-muted hover:text-text-normal">
                <IconClose size={16} />
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1">
            {activeTab === "tickets" && (
              <div className="flex h-full min-h-0">
                <aside className="flex w-full min-w-0 shrink-0 flex-col border-r border-divider/60 lg:w-[340px]">
                  <div className="space-y-2.5 p-3">
                    <div className="relative">
                      <IconSearch size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input
                        value={ticketQuery}
                        onChange={(e) => setTicketQuery(e.target.value)}
                        placeholder="Search subject or email"
                        aria-label="Search requests"
                        className={`${ui.input} pl-8`}
                      />
                    </div>
                    <div role="tablist" className="flex rounded-[6px] bg-bg-tertiary p-0.5">
                      {([
                        ["awaiting", "Open", counts.awaiting],
                        ["resolved", "Resolved", counts.resolved],
                        ["all", "All", counts.all],
                      ] as const).map(([id, label, count]) => (
                        <button
                          key={id}
                          type="button"
                          role="tab"
                          aria-selected={filter === id}
                          onClick={() => setFilter(id)}
                          className={`flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[4px] text-[13px] font-medium transition-colors ${
                            filter === id ? "bg-bg-primary text-header-primary shadow-sm" : "text-text-muted hover:text-text-normal"
                          }`}
                        >
                          {label}
                          <span className="tabular-nums text-text-muted">{count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                    {loading && tickets.length === 0 && <ListSkeleton />}
                    {!loading && visibleTickets.length === 0 && (
                      <EmptyState
                        icon={<IconCheckAll size={28} />}
                        title={filter === "resolved" ? "Nothing resolved yet" : "All caught up"}
                        body={filter === "resolved" ? "Resolved requests show up here." : "No requests are waiting on a person."}
                      />
                    )}
                    <div className="space-y-0.5">
                      {visibleTickets.map((item) => {
                        const selected = selectedId === item.id;
                        const status = ticketStatus(item.status);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedId(item.id)}
                            aria-current={selected ? "true" : undefined}
                            className={`group flex w-full items-start gap-3 rounded-[4px] px-2.5 py-2 text-left transition-colors ${
                              selected ? "bg-interactive-hover" : "hover:bg-interactive-hover/50"
                            }`}
                          >
                            <Initial name={item.email} />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline gap-2">
                                <span className={`min-w-0 flex-1 truncate text-[15px] ${selected || item.status === "pending" ? "font-semibold text-header-primary" : "font-medium text-text-normal"}`}>
                                  {item.subject || "(no subject)"}
                                </span>
                                <span className="shrink-0 text-[11px] text-text-muted">{formatTime(item.updated_at)}</span>
                              </span>
                              <span className="mt-0.5 flex items-center gap-2">
                                <span className="min-w-0 flex-1 truncate text-[13px] text-text-muted">{item.email}</span>
                                <Pill tone={status.tone}>{status.label}</Pill>
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <p className="hidden border-t border-divider/60 px-4 py-2 text-[12px] text-text-muted lg:block">
                    <kbd className={ui.kbd}>J</kbd> <kbd className={ui.kbd}>K</kbd> to move between requests
                  </p>
                </aside>

                <main className="hidden min-w-0 flex-1 flex-col lg:flex">
                  {ticket ? (
                    <>
                      <div className="flex shrink-0 items-start gap-3 border-b border-divider/60 px-5 py-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h2 className="truncate text-[20px] font-semibold leading-6 text-header-primary">{ticket.subject || "(no subject)"}</h2>
                            <Pill tone={ticketStatus(ticket.status).tone}>{ticketStatus(ticket.status).label}</Pill>
                          </div>
                          <p className="mt-1 truncate text-[13px] text-text-muted">
                            {ticket.email} · opened {formatTime(ticket.created_at)} · updated {formatTime(ticket.updated_at)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void resolveTicket()}
                          disabled={ticket.status === "closed" || replying}
                          className={`${ui.btnSuccess} h-8 shrink-0`}
                        >
                          <IconCheck size={16} />
                          {ticket.status === "closed" ? "Resolved" : "Mark resolved"}
                        </button>
                      </div>

                      <div ref={messagesRef} className="min-h-0 flex-1 overflow-y-auto py-4">
                        {detailLoading && messages.length === 0 && <p className="px-5 text-[14px] text-text-muted">Loading messages…</p>}
                        {messages.length === 0 && !detailLoading && (
                          <EmptyState icon={<IconMessage size={28} />} title="No messages yet" body="This request has no conversation." />
                        )}
                        {messages.map((message, i) => {
                          const prev = messages[i - 1];
                          const grouped = !!prev && prev.role === message.role && new Date(message.created_at).getTime() - new Date(prev.created_at).getTime() < 7 * 60_000;
                          return (
                            <article key={message.id} className={`group flex gap-4 px-5 py-0.5 hover:bg-black/[0.06] ${grouped ? "" : "mt-[17px] first:mt-0"}`}>
                              <div className="w-10 shrink-0">
                                {!grouped && <RoleAvatar role={message.role} name={ticket.email} />}
                              </div>
                              <div className="min-w-0 flex-1">
                                {!grouped && (
                                  <p className="flex items-baseline gap-2">
                                    <span className={`text-[16px] font-medium ${message.role === "staff" ? "text-brand" : message.role === "tether" ? "text-[#c79dff]" : "text-header-primary"}`}>
                                      {threadLabel(message.role)}
                                    </span>
                                    <time className="text-[12px] text-text-muted">{formatTime(message.created_at)}</time>
                                  </p>
                                )}
                                <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.375rem] text-text-normal">{message.content}</p>
                              </div>
                            </article>
                          );
                        })}
                      </div>

                      <div className="shrink-0 px-4 pb-4">
                        {replyStatus && <p className="mb-2 px-1 text-[13px] text-text-muted">{replyStatus}</p>}
                        {ticket.status === "closed" ? (
                          <div className="flex items-center gap-3 rounded-lg bg-bg-secondary px-4 py-3 text-[14px] text-text-muted">
                            <IconLock size={18} className="shrink-0" />
                            This request is resolved, so the thread is read-only.
                          </div>
                        ) : (
                          <div className="rounded-lg bg-bg-tertiary focus-within:ring-1 focus-within:ring-[#00a8fc]/60">
                            <textarea
                              value={reply}
                              onChange={(e) => setReply(e.target.value)}
                              rows={3}
                              maxLength={4000}
                              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submitReply(); } }}
                              placeholder={`Reply to ${ticket.email}`}
                              aria-label="Reply"
                              className="block max-h-60 min-h-[76px] w-full resize-y bg-transparent px-4 pt-3 text-[15px] leading-[1.375rem] text-text-normal outline-none placeholder:text-text-muted"
                            />
                            <div className="flex items-center gap-3 px-3 pb-2.5">
                              <p className="min-w-0 flex-1 truncate text-[12px] text-text-muted">
                                Added to their thread and emailed to the account address · <kbd className={ui.kbd}>Ctrl</kbd>/<kbd className={ui.kbd}>⌘</kbd> <kbd className={ui.kbd}>Enter</kbd> to send
                              </p>
                              <button
                                type="button"
                                onClick={() => void submitReply()}
                                disabled={replying || !reply.trim()}
                                className={`${ui.btnPrimary} h-8 shrink-0`}
                              >
                                <IconSend size={16} />
                                {replying ? "Sending…" : "Send"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <EmptyState icon={<IconInbox size={32} />} title="Pick a request" body="The conversation and reply box open here." />
                  )}
                </main>
              </div>
            )}

            {activeTab === "bans" && (
              <Page>
                <SectionTitle title="Banned accounts" count={bans.length} />
                {bansLoading && bans.length === 0 && <ListSkeleton />}
                {!bansLoading && bans.length === 0 && (
                  <EmptyState icon={<IconShield size={28} />} title="No platform bans" body="Banned accounts appear here." />
                )}
                {bans.length > 0 && (
                  <div className={`${ui.card} divide-y divide-divider/60`}>
                    {bans.map((ban) => {
                      const name = ban.profile?.display_name || ban.profile?.username || ban.user_id;
                      return (
                        <div key={ban.user_id} className="flex items-center gap-3 px-4 py-3">
                          <Initial name={name} tone="danger" />
                          <div className="min-w-0 flex-1">
                            <p className="flex items-baseline gap-2">
                              <span className="truncate text-[15px] font-semibold text-header-primary">{name}</span>
                              {ban.profile?.username && <span className="truncate text-[13px] text-text-muted">@{ban.profile.username}</span>}
                            </p>
                            <p className="truncate text-[13px] text-text-normal">{ban.reason || "No reason given"}</p>
                            <p className="text-[12px] text-text-muted">Banned {formatTime(ban.created_at)}</p>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button type="button" onClick={() => setViewingUserId(ban.user_id)} className={`${ui.btnSecondary} h-8`}>
                              View
                            </button>
                            <button type="button" onClick={() => void unban(ban.user_id)} className={`${ui.btnDangerOutline} h-8`}>
                              Unban
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Page>
            )}

            {activeTab === "appeals" && (
              <Page>
                <SectionTitle title="Ban appeals" count={appeals.length} hint={pendingAppeals ? `${pendingAppeals} waiting` : undefined} />
                {appealsLoading && appeals.length === 0 && <ListSkeleton />}
                {!appealsLoading && appeals.length === 0 && (
                  <EmptyState icon={<IconMessage size={28} />} title="No appeals" body="Appeals from banned accounts appear here." />
                )}
                <div className="space-y-3">
                  {appeals.map((appeal) => {
                    const name = appeal.profile?.display_name || appeal.profile?.username || appeal.user_id;
                    const pending = appeal.status === "pending";
                    return (
                      <div key={appeal.id} className={`${ui.card} p-4`}>
                        <div className="flex items-start gap-3">
                          <Initial name={name} />
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-2">
                              <span className="truncate text-[15px] font-semibold text-header-primary">{name}</span>
                              <Pill tone={pending ? "warn" : appeal.status === "approved" ? "good" : "neutral"}>{appeal.status}</Pill>
                            </p>
                            <p className="text-[12px] text-text-muted">Submitted {formatTime(appeal.created_at)}</p>
                          </div>
                          <button type="button" onClick={() => setViewingUserId(appeal.user_id)} className={`${ui.btnSecondary} h-8 shrink-0`}>
                            View account
                          </button>
                        </div>
                        <blockquote className="mt-3 whitespace-pre-wrap break-words border-l-4 border-divider pl-3 text-[15px] leading-[1.375rem] text-text-normal">
                          {appeal.reason}
                        </blockquote>
                        {pending && (
                          <div className="mt-4 space-y-2">
                            <textarea
                              value={selectedAppealId === appeal.id ? appealDecision : ""}
                              onChange={(e) => { setSelectedAppealId(appeal.id); setAppealDecision(e.target.value); }}
                              rows={2}
                              placeholder="Note to include with the decision (optional)"
                              aria-label="Decision note"
                              className={`${ui.input} h-auto resize-y py-2`}
                            />
                            <div className="flex justify-end gap-2">
                              <button type="button" onClick={() => void decideAppeal(appeal.id, false)} className={`${ui.btnDanger} h-8`}>
                                Deny
                              </button>
                              <button type="button" onClick={() => void decideAppeal(appeal.id, true)} className={`${ui.btnSuccess} h-8`}>
                                Approve and unban
                              </button>
                            </div>
                          </div>
                        )}
                        {appeal.decision && (
                          <p className="mt-3 rounded-[4px] bg-bg-tertiary px-3 py-2 text-[13px] text-text-muted">
                            <span className="font-semibold text-text-normal">Decision:</span> {appeal.decision}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Page>
            )}

            {activeTab === "flags" && (
              <Page>
                <SectionTitle title="Member reports" count={flags.length} hint={openFlags ? `${openFlags} open` : undefined} />
                {flagsLoading && flags.length === 0 && <ListSkeleton />}
                {!flagsLoading && flags.length === 0 && (
                  <EmptyState icon={<IconAlert size={28} />} title="No reports" body="Reports from members appear here." />
                )}
                <div className="space-y-3">
                  {flags.map((flag) => {
                    const open = flag.status !== "actioned" && flag.status !== "dismissed";
                    return (
                      <div key={flag.id} className={`${ui.card} p-4`}>
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2">
                              <span className="text-[15px] font-semibold capitalize text-header-primary">{flag.reason.replace(/_/g, " ")}</span>
                              <Pill tone="neutral">{flag.target_type}</Pill>
                              <Pill tone="neutral">{flag.target_surface}</Pill>
                            </p>
                            <p className="mt-0.5 text-[13px] text-text-muted">
                              {flag.reporter_id ? <>Reported by <span className="text-text-normal">{flag.reporter?.display_name || flag.reporter?.username || flag.reporter_id}</span></> : "Found by Sentinel"}
                              {flag.reported && <> · about <span className="text-text-normal">{flag.reported.display_name || flag.reported.username || flag.reported_user_id}</span></>}
                              {" · "}{formatTime(flag.created_at)}
                            </p>
                          </div>
                          <Pill tone={open ? "warn" : flag.status === "actioned" ? "danger" : "neutral"}>{flag.status.replace(/_/g, " ")}</Pill>
                        </div>
                        {flag.details && (
                          <blockquote className="mt-3 whitespace-pre-wrap break-words border-l-4 border-divider pl-3 text-[14px] text-text-normal">{flag.details}</blockquote>
                        )}
                        {flag.action && (
                          <p className="mt-3 text-[13px] text-text-muted">
                            <span className="font-semibold text-text-normal">{flag.action}</span>
                            {flag.reviewed_at ? ` · ${formatTime(flag.reviewed_at)}` : ""}
                          </p>
                        )}
                        {flag.last_error && <p className="mt-2 rounded-[4px] bg-status-dnd/10 px-3 py-2 text-[13px] text-status-dnd">{flag.last_error}</p>}
                        {flag.snapshot && (
                          <details className="mt-3">
                            <summary className="cursor-pointer text-[13px] font-medium text-text-link hover:underline">Show snapshot</summary>
                            <pre className="mt-2 max-h-48 overflow-auto rounded-[4px] bg-bg-tertiary p-3 font-mono text-[12px] text-text-muted">{JSON.stringify(flag.snapshot, null, 2)}</pre>
                          </details>
                        )}
                        {open && (
                          <div className="mt-4 flex flex-wrap justify-end gap-2">
                            {flag.reported_user_id && (
                              <button type="button" onClick={() => setViewingUserId(flag.reported_user_id!)} className={`${ui.btnSecondary} h-8`}>
                                View account
                              </button>
                            )}
                            <button type="button" onClick={() => void dismissFlag(flag.id)} className={`${ui.btnSecondary} h-8`}>
                              Dismiss
                            </button>
                            <button
                              type="button"
                              onClick={() => { setActioningFlag(flag); setActionType("actioned"); setActionDecision(""); }}
                              className={`${ui.btnDanger} h-8`}
                            >
                              Take action
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <SectionTitle title="Sentinel matches" count={contentFlags.length} className="mt-8" />
                {!flagsLoading && contentFlags.length === 0 && (
                  <EmptyState icon={<IconSparkle size={28} />} title="No Sentinel matches" body="Automatic content matches appear here with Tether's verdict." />
                )}
                {contentFlags.length > 0 && (
                  <div className={`${ui.card} divide-y divide-divider/60`}>
                    {contentFlags.map((cf) => (
                      <div key={cf.id} className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold capitalize text-header-primary">
                            {cf.category.replace(/_/g, " ")} <span className="font-normal text-text-muted">· {cf.rule_id}</span>
                          </span>
                          <Pill tone={cf.state === "resolved" ? "good" : "neutral"}>{cf.state}</Pill>
                        </div>
                        <p className="mt-0.5 truncate font-mono text-[12px] text-text-muted">
                          {cf.src_table}.{cf.src_column} · {formatTime(cf.created_at)}
                        </p>
                        <p className="mt-1.5 text-[13px] text-text-normal">{cf.resolution ?? "Waiting for Tether's next pass."}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Page>
            )}

            {activeTab === "users" && (
              <Page>
                <form
                  className="mb-4 flex gap-2"
                  onSubmit={(e) => { e.preventDefault(); void searchUsers(userQuery); }}
                >
                  <div className="relative flex-1">
                    <IconSearch size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                      value={userQuery}
                      onChange={(e) => setUserQuery(e.target.value)}
                      placeholder="Username, display name or user ID"
                      aria-label="Search users"
                      autoFocus
                      className={`${ui.input} pl-8`}
                    />
                  </div>
                  <button type="submit" disabled={!userQuery.trim() || usersLoading} className={`${ui.btnPrimary} h-9`}>Search</button>
                </form>
                {usersLoading && <ListSkeleton />}
                {!usersLoading && !usersSearched && (
                  <EmptyState icon={<IconSearch size={28} />} title="Find an account" body="Search by name, or paste a user ID to open it directly." />
                )}
                {!usersLoading && usersSearched && users.length === 0 && (
                  <EmptyState icon={<IconSearch size={28} />} title="No accounts found" body="Check the spelling, or paste the full user ID." />
                )}
                {!usersLoading && users.length > 0 && (
                  <div className={ui.card}>
                    {users.map((u, i) => {
                      const banned = bans.some((b) => b.user_id === u.id);
                      const name = u.display_name || u.username || "Unknown";
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setViewingUserId(u.id)}
                          className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-interactive-hover/50 ${i > 0 ? "border-t border-divider/60" : ""}`}
                        >
                          <Initial name={name} url={u.avatar_url} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-[15px] font-medium text-header-primary">{name}</span>
                              {banned && <Pill tone="danger">Banned</Pill>}
                            </span>
                            <span className="block truncate text-[12px] text-text-muted">
                              {u.username ? `@${u.username} · ` : ""}<span className="font-mono">{u.id}</span>
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </Page>
            )}

            {activeTab === "servers" && (
              <div className="flex h-full min-h-0">
                <aside className="flex w-full shrink-0 flex-col border-r border-divider/60 lg:w-[340px]">
                  <form
                    className="p-3"
                    onSubmit={(e) => { e.preventDefault(); void loadServers(serverQuery); }}
                  >
                    <div className="relative">
                      <IconSearch size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input
                        value={serverQuery}
                        onChange={(e) => setServerQuery(e.target.value)}
                        placeholder="Space name or ID"
                        aria-label="Search spaces"
                        className={`${ui.input} pl-8`}
                      />
                    </div>
                  </form>
                  <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
                    {serversLoading && servers.length === 0 && <ListSkeleton />}
                    {!serversLoading && servers.length === 0 && (
                      <EmptyState icon={<IconGroup size={28} />} title="No spaces found" body="Try another name, or paste a space ID." />
                    )}
                    {servers.map((sv) => (
                      <button
                        key={sv.id}
                        type="button"
                        onClick={() => void loadServerDetail(sv.id)}
                        className={`flex w-full items-center gap-3 rounded-[4px] px-2.5 py-2 text-left transition-colors ${
                          selectedServerId === sv.id ? "bg-interactive-hover" : "hover:bg-interactive-hover/50"
                        }`}
                      >
                        <ServerIcon name={sv.name} url={sv.icon_url} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium text-header-primary">{sv.name}</span>
                          <span className="block truncate text-[12px] text-text-muted">
                            {sv.member_count.toLocaleString()} {sv.member_count === 1 ? "member" : "members"} · since {new Date(sv.created_at).toLocaleDateString()}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </aside>

                <main className="hidden min-w-0 flex-1 overflow-y-auto lg:block">
                  {!selectedServerId ? (
                    <EmptyState icon={<IconGroup size={32} />} title="Pick a space" body="Its members, a user check and the audit log open here." />
                  ) : serverDetailLoading ? (
                    <div className="p-6"><ListSkeleton /></div>
                  ) : (
                    <div className="mx-auto max-w-[860px] space-y-8 p-6">
                      {selectedServer && (
                        <div className="flex items-center gap-4">
                          <ServerIcon name={selectedServer.name} url={selectedServer.icon_url} size={64} />
                          <div className="min-w-0">
                            <h2 className="truncate text-[20px] font-semibold text-header-primary">{selectedServer.name}</h2>
                            <p className="text-[13px] text-text-muted">
                              {selectedServer.member_count.toLocaleString()} {selectedServer.member_count === 1 ? "member" : "members"} · created {new Date(selectedServer.created_at).toLocaleDateString()}
                            </p>
                            <p className="truncate font-mono text-[12px] text-text-muted">{selectedServer.id}</p>
                          </div>
                        </div>
                      )}

                      <div>
                        <SectionTitle title="Check a user" />
                        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void checkServerUser(); }}>
                          <input
                            value={serverUserCheck}
                            onChange={(e) => setServerUserCheck(e.target.value)}
                            placeholder="Username or user ID"
                            aria-label="Username or user ID"
                            className={ui.input}
                          />
                          <button type="submit" className={`${ui.btnPrimary} h-9 shrink-0`}>Check</button>
                        </form>
                        {serverUserResult && (
                          <div className={`${ui.card} mt-3 p-4 text-[14px]`}>
                            {serverUserResult.member ? (
                              <p className="text-text-normal">
                                <strong className="text-header-primary">{serverUserResult.member.profile?.display_name || serverUserResult.member.profile?.username || serverUserResult.member.user_id}</strong>
                                {" "}is a <RolePill role={serverUserResult.member.role} /> here, since {new Date(serverUserResult.member.joined_at).toLocaleDateString()}.
                              </p>
                            ) : (
                              <p className="text-text-muted">They aren&apos;t a member of this space.</p>
                            )}
                            <p className="mt-2 text-[12px] font-bold uppercase tracking-[0.02em] text-header-secondary">
                              Audit entries · {serverUserResult.audit.length}
                            </p>
                            {serverUserResult.audit.length > 0 && (
                              <ul className="mt-1.5 space-y-1 text-[13px] text-text-muted">
                                {serverUserResult.audit.slice(0, 10).map((a: AuditEntry) => (
                                  <li key={a.id}><span className="text-text-normal">{a.action.replace(/_/g, " ")}</span> · {formatTime(a.created_at)}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>

                      <div>
                        <SectionTitle title="Members" count={serverMembers.length} />
                        {serverMembers.length === 0 ? (
                          <p className="text-[14px] text-text-muted">No members found.</p>
                        ) : (
                          <div className={`${ui.card} max-h-[420px] divide-y divide-divider/60 overflow-y-auto`}>
                            {serverMembers.map((m) => {
                              const name = m.profile?.display_name || m.profile?.username || m.user_id;
                              return (
                                <div key={m.user_id} className="flex items-center gap-3 px-4 py-2.5">
                                  <Initial name={name} url={m.profile?.avatar_url} size={32} />
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-[14px] font-medium text-header-primary">{name}</p>
                                    <p className="truncate text-[12px] text-text-muted">@{m.profile?.username || "—"} · joined {new Date(m.joined_at).toLocaleDateString()}</p>
                                  </div>
                                  <RolePill role={m.role} />
                                  <button type="button" onClick={() => setViewingUserId(m.user_id)} className={`${ui.btnSecondary} h-7 px-2.5 text-[12px]`}>
                                    View
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div>
                        <SectionTitle title="Audit log" count={serverAudit.length} />
                        {serverAudit.length === 0 ? (
                          <p className="text-[14px] text-text-muted">No audit entries.</p>
                        ) : (
                          <div className={`${ui.card} max-h-[420px] divide-y divide-divider/60 overflow-y-auto`}>
                            {serverAudit.map((entry) => (
                              <div key={entry.id} className="px-4 py-2.5">
                                <p className="flex items-baseline gap-2 text-[14px]">
                                  <span className="font-semibold text-header-primary">{entry.actor?.display_name || entry.actor?.username || entry.actor_id || "System"}</span>
                                  <span className="min-w-0 flex-1 truncate text-text-normal">{entry.action.replace(/_/g, " ")}</span>
                                  <span className="shrink-0 text-[12px] text-text-muted">{formatTime(entry.created_at)}</span>
                                </p>
                                {(entry.target_type || entry.target_id) && (
                                  <p className="truncate text-[12px] text-text-muted">
                                    {entry.target_type}{entry.target_id ? ` · ${entry.target_id}` : ""}
                                  </p>
                                )}
                                {entry.details && (
                                  <pre className="mt-1 max-h-20 overflow-auto font-mono text-[11px] text-text-muted">{JSON.stringify(entry.details)}</pre>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </main>
              </div>
            )}
          </div>
        </section>
      </div>

      {actioningFlag && (
        <ClassicModal
          open
          centered={false}
          title="Take action on this report"
          subtitle={`${actioningFlag.reason.replace(/_/g, " ")} · ${actioningFlag.target_type}`}
          onClose={() => { if (!actioning) setActioningFlag(null); }}
          footer={
            <>
              <button type="button" disabled={actioning} onClick={() => setActioningFlag(null)} className={`${ui.btnGhost} h-[38px]`}>
                Cancel
              </button>
              <button
                type="button"
                disabled={actioning}
                onClick={async () => {
                  setActioning(true);
                  const res = await apiFetch(`/api/moderation/message-reports/${actioningFlag.id}/resolve`, {
                    method: "POST",
                    body: JSON.stringify({ action: actionType, decision: actionDecision.trim() || (actionType === "actioned" ? "Actioned by staff." : "Dismissed by staff.") }),
                  });
                  setActioning(false);
                  if (res.ok) {
                    setActioningFlag(null);
                    setActionDecision("");
                    void loadFlags();
                  }
                }}
                className={`${actionType === "actioned" ? ui.btnDanger : ui.btnPrimary} h-[38px] min-w-[96px]`}
              >
                {actioning ? "Saving…" : actionType === "actioned" ? "Take action" : "Dismiss"}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <p className={`${ui.eyebrow} mb-2`}>Outcome</p>
              <div className="space-y-2">
                {([
                  ["actioned", "Take action", "Remove or restrict the reported content."],
                  ["dismissed", "Dismiss", "Nothing breaks the rules here."],
                ] as const).map(([id, label, body]) => (
                  <label
                    key={id}
                    className={`flex cursor-pointer items-start gap-3 rounded-[4px] px-3 py-2.5 transition-colors ${
                      actionType === id ? "bg-interactive-hover" : "bg-bg-secondary hover:bg-interactive-hover/60"
                    }`}
                  >
                    <input
                      type="radio"
                      name="flag-outcome"
                      checked={actionType === id}
                      onChange={() => setActionType(id)}
                      className="mt-1 accent-[var(--brand,#5865f2)]"
                    />
                    <span>
                      <span className="block text-[15px] font-medium text-header-primary">{label}</span>
                      <span className="block text-[13px] text-text-muted">{body}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <label className="block">
              <span className={`${ui.eyebrow} mb-2 block`}>Decision note</span>
              <textarea
                value={actionDecision}
                onChange={(e) => setActionDecision(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="What was done and why"
                className={`${ui.input} h-auto resize-y py-2`}
              />
            </label>
          </div>
        </ClassicModal>
      )}

      {viewingUserId && (
        <AccountViewerModal
          userId={viewingUserId}
          onClose={() => setViewingUserId(null)}
          ban={(() => {
            const b = bans.find((x) => x.user_id === viewingUserId);
            return b ? { reason: b.reason, created_at: b.created_at } : null;
          })()}
          onBanChange={() => {
            setViewingUserId(null);
            void loadBans();
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------------- */

type TabId = "tickets" | "users" | "bans" | "appeals" | "flags" | "servers";
type Tone = "neutral" | "brand" | "warn" | "good" | "danger" | "purple";

const btnBase =
  "inline-flex items-center justify-center gap-1.5 rounded-[4px] px-3.5 text-[14px] font-medium leading-4 transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const ui = {
  btnPrimary: `${btnBase} bg-brand text-white hover:bg-brand-hover`,
  btnSecondary: `${btnBase} bg-button-secondary text-white hover:bg-button-secondary-hover`,
  btnDanger: `${btnBase} bg-button-danger text-white hover:bg-button-danger-hover`,
  btnDangerOutline: `${btnBase} border border-button-danger text-text-normal hover:bg-button-danger hover:text-white`,
  btnSuccess: `${btnBase} bg-[#248046] text-white hover:bg-[#1a6334]`,
  btnGhost: `${btnBase} text-text-muted hover:bg-interactive-hover hover:text-text-normal`,
  input:
    "h-9 w-full rounded-[4px] border border-transparent bg-bg-tertiary px-3 text-[14px] text-text-normal outline-none transition-colors placeholder:text-text-muted focus:border-[#00a8fc]",
  card: "overflow-hidden rounded-lg border border-divider/60 bg-bg-secondary",
  eyebrow: "text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-header-secondary",
  kbd: "rounded-[3px] border border-divider bg-bg-tertiary px-1 font-sans text-[11px] text-text-normal",
};

const toneClass: Record<Tone, string> = {
  neutral: "bg-bg-tertiary text-text-muted",
  brand: "bg-brand/15 text-brand",
  warn: "bg-[#f0b232]/15 text-[#f0b232]",
  good: "bg-status-online/15 text-status-online",
  danger: "bg-status-dnd/15 text-status-dnd",
  purple: "bg-[#c79dff]/15 text-[#c79dff]",
};

function Pill({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex h-[18px] shrink-0 items-center rounded-[4px] px-1.5 text-[11px] font-semibold capitalize leading-none ${toneClass[tone]}`}>
      {children}
    </span>
  );
}

function ticketStatus(status: string): { label: string; tone: Tone } {
  if (status === "pending") return { label: "Needs reply", tone: "warn" };
  if (status === "human_reply") return { label: "Waiting on user", tone: "brand" };
  if (status === "closed") return { label: "Resolved", tone: "good" };
  return { label: status.replace(/_/g, " "), tone: "neutral" };
}

function RolePill({ role }: { role: string }) {
  const tone: Tone = role === "owner" ? "warn" : role === "admin" ? "brand" : role === "moderator" ? "purple" : "neutral";
  return <Pill tone={tone}>{role}</Pill>;
}

const AVATAR_COLOURS = ["#5865f2", "#3ba55c", "#faa61a", "#ed4245", "#eb459e", "#747f8d"];

function colourFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLOURS[Math.abs(h) % AVATAR_COLOURS.length];
}

function Initial({ name, url, size = 40, tone }: { name: string; url?: string | null; size?: number; tone?: "danger" }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={style} className="shrink-0 rounded-full object-cover" />;
  }
  return (
    <span
      aria-hidden
      style={{ ...style, background: tone === "danger" ? "var(--status-dnd, #ed4245)" : colourFor(name) }}
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
    >
      {(name.replace(/^@/, "").charAt(0) || "?").toUpperCase()}
    </span>
  );
}

function RoleAvatar({ role, name }: { role: string; name: string }) {
  if (role === "staff") {
    return (
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white">
        <IconStaff size={20} />
      </span>
    );
  }
  if (role === "tether") {
    return (
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7b5bd6] text-white">
        <IconBot size={20} />
      </span>
    );
  }
  return <Initial name={name} />;
}

function ServerIcon({ name, url, size = 40 }: { name: string; url: string | null; size?: number }) {
  const style = { width: size, height: size };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={style} className="shrink-0 rounded-[30%] object-cover" />;
  }
  const initials = name.split(/\s+/).map((w) => w.charAt(0)).join("").slice(0, 3) || "?";
  return (
    <span
      aria-hidden
      style={{ ...style, fontSize: Math.round(size * 0.32) }}
      className="flex shrink-0 items-center justify-center rounded-[30%] bg-bg-tertiary font-semibold text-header-primary"
    >
      {initials}
    </span>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-8">{children}</div>
    </div>
  );
}

function SectionTitle({ title, count, hint, className = "" }: { title: string; count?: number; hint?: string; className?: string }) {
  return (
    <div className={`mb-3 flex items-baseline gap-2 ${className}`}>
      <h2 className={ui.eyebrow}>
        {title}
        {count !== undefined && <span className="ml-1.5 tabular-nums">— {count}</span>}
      </h2>
      {hint && <span className="text-[12px] font-semibold text-[#f0b232]">{hint}</span>}
    </div>
  );
}

function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex h-full min-h-[200px] flex-col items-center justify-center px-6 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-bg-secondary text-text-muted">{icon}</span>
      <p className="mt-3 text-[16px] font-semibold text-header-primary">{title}</p>
      <p className="mt-1 max-w-[280px] text-[14px] text-text-muted">{body}</p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-1 p-1" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-[4px] px-2.5 py-2">
          <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-bg-tertiary" />
          <span className="flex-1 space-y-2">
            <span className="block h-3 w-2/3 animate-pulse rounded bg-bg-tertiary" />
            <span className="block h-2.5 w-1/3 animate-pulse rounded bg-bg-tertiary" />
          </span>
        </div>
      ))}
    </div>
  );
}
