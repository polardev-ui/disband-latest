"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppProvider, useApp } from "@/contexts/AppContext";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Logo } from "@/components/ui/Logo";
import { apiFetch } from "@/lib/api";
import { getSupabaseClient } from "@/lib/supabase/client";

interface Ticket {
  id: string;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface TicketMessage {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

function useAuthedFetch() {
  return useCallback(async (path: string, init?: RequestInit) => {
    const res = await apiFetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) throw new Error(json?.error ?? "Something went wrong.");
    return json as Record<string, unknown>;
  }, []);
}

/** Logged-out: prove the inbox with a one-time code. This is a support-only
 *  sign-in — it never touches the Disband password, and the code only ever
 *  goes to the email address typed below. */
function VerifyEmail({ onVerified }: { onVerified: () => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const clean = email.trim().toLowerCase();
    if (!clean.includes("@")) {
      setError("Enter the email address on your Disband account.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await getSupabaseClient().auth.signInWithOtp({
        email: clean,
        options: { shouldCreateUser: true },
      });
      if (err) throw err;
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the code.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (code.trim().length < 6) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await getSupabaseClient().auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: "email",
      });
      if (err) throw err;
      onVerified();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-[420px] rounded-2xl border border-divider bg-bg-secondary p-6 shadow-2xl">
      <h2 className="text-[19px] font-bold text-text-normal">Verify it&apos;s you</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
        Support needs your Disband account email — not your password. We send
        a one-time code to that inbox; entering it proves the account is
        yours, and Tether will only ever discuss that account.
      </p>
      {!sent ? (
        <div className="mt-4 flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="min-w-0 flex-1 rounded-xl border border-divider bg-bg-tertiary px-3.5 py-2.5 text-[15px] outline-none placeholder:text-text-muted focus:border-brand/60"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void send()}
            className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send code"}
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-[13px] text-text-muted">
            Code sent to <span className="font-semibold text-text-normal">{email.trim()}</span>
          </p>
          <div className="mt-2 flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
              placeholder="6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="min-w-0 flex-1 rounded-xl border border-divider bg-bg-tertiary px-3.5 py-2.5 text-[15px] tracking-[0.2em] outline-none placeholder:text-text-muted focus:border-brand/60"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void verify()}
              className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {busy ? "Checking…" : "Verify"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => { setSent(false); setCode(""); setError(null); }}
            className="mt-2 text-[13px] text-text-muted hover:text-text-normal hover:underline"
          >
            Wrong email? Start over
          </button>
        </div>
      )}
      {error && <p className="mt-3 text-[13px] text-status-dnd">{error}</p>}
      <p className="mt-4 text-center text-[13px] text-text-muted">
        Already have the app?{" "}
        <Link href="/login?next=/support" className="font-medium text-text-normal hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

function Thread({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const authedFetch = useAuthedFetch();
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const json = await authedFetch(`/api/support/tickets/${ticketId}/messages`);
      setMessages((json.messages as TicketMessage[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load messages.");
    }
  }, [authedFetch, ticketId]);

  useEffect(() => {
    setMessages([]);
    void load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, answering]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    setDraft("");
    try {
      await authedFetch(`/api/support/tickets/${ticketId}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });
      await load();
      setAnswering(true);
      const poll = async (tries: number): Promise<void> => {
        await load();
        if (tries <= 0) return;
        setTimeout(() => void poll(tries - 1), 2500);
      };
      // The reply is written by the POST; poll a few times in case the
      // model was still finishing when the response returned.
      await poll(5);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send.");
      setDraft(text);
    } finally {
      setSending(false);
      setAnswering(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 self-start text-[13px] font-medium text-text-muted hover:text-text-normal hover:underline"
      >
        ← All requests
      </button>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-2">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <p
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed ${
                m.role === "user" ? "bg-brand text-white" : "bg-bg-tertiary text-text-normal"
              }`}
            >
              {m.content}
            </p>
          </div>
        ))}
        {answering && (
          <div className="flex justify-start">
            <p className="rounded-2xl bg-bg-tertiary px-3.5 py-2.5 text-[14px] text-text-muted">
              Tether is looking into it…
            </p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {error && <p className="mt-2 text-[13px] text-status-dnd">{error}</p>}
      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void send();
          }}
          placeholder="Describe what's happening…"
          maxLength={4000}
          className="min-w-0 flex-1 rounded-xl border border-divider bg-bg-tertiary px-3.5 py-2.5 text-[14px] outline-none placeholder:text-text-muted focus:border-brand/60"
        />
        <button
          type="button"
          disabled={sending || !draft.trim()}
          onClick={() => void send()}
          className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
        >
          {sending ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}

function SupportHome() {
  const { ready, session, user } = useApp();
  const authedFetch = useAuthedFetch();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noAccount, setNoAccount] = useState(false);

  const load = useCallback(async () => {
    try {
      const json = await authedFetch("/api/support/tickets");
      setTickets((json.tickets as Ticket[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load tickets.");
    }
  }, [authedFetch]);

  useEffect(() => {
    if (!ready || !session) return;
    void load();
    // Stub sessions (verified email, never created a Disband profile) get
    // general help; account tools report "no account" on their own.
    void getSupabaseClient()
      .from("profiles")
      .select("id")
      .eq("id", user?.id ?? "")
      .maybeSingle()
      .then(({ data }) => setNoAccount(!data));
  }, [ready, session, user?.id, load]);

  async function create() {
    if (!subject.trim() || !firstMessage.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const json = await authedFetch("/api/support/tickets", {
        method: "POST",
        body: JSON.stringify({ subject: subject.trim(), message: firstMessage.trim() }),
      });
      const ticket = json.ticket as Ticket;
      setSubject("");
      setFirstMessage("");
      setActiveId(ticket.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the ticket.");
    } finally {
      setCreating(false);
    }
  }

  async function signOut() {
    await getSupabaseClient().auth.signOut();
    setTickets([]);
    setActiveId(null);
  }

  if (!ready) {
    return (
      <div aria-label="Loading" className="animate-pulse rounded-2xl bg-bg-secondary p-6">
        <div className="h-5 w-1/2 rounded bg-bg-accent" />
        <div className="mt-3 h-10 w-full rounded-xl bg-bg-accent" />
      </div>
    );
  }

  if (!session) {
    return <VerifyEmail onVerified={() => undefined} />;
  }

  if (activeId) {
    return (
      <div className="flex min-h-[480px] w-full max-w-[560px] flex-col rounded-2xl border border-divider bg-bg-secondary p-4 shadow-2xl sm:p-5">
        <Thread ticketId={activeId} onBack={() => { setActiveId(null); void load(); }} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-[560px] rounded-2xl border border-divider bg-bg-secondary p-5 shadow-2xl sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[19px] font-bold text-text-normal">Support requests</h2>
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-[13px] text-text-muted hover:text-text-normal hover:underline"
        >
          Sign out
        </button>
      </div>
      {noAccount && (
        <p className="mt-2 rounded-xl bg-bg-tertiary px-3.5 py-2.5 text-[13px] leading-relaxed text-text-muted">
          This email isn&apos;t attached to a Disband account yet — Tether can
          still answer general questions, and anything account-specific will
          work once you create one.
        </p>
      )}
      {error && <p className="mt-2 text-[13px] text-status-dnd">{error}</p>}

      <div className="mt-4 space-y-2">
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value.slice(0, 120))}
          placeholder="Subject — e.g. Can't log in"
          maxLength={120}
          className="w-full rounded-xl border border-divider bg-bg-tertiary px-3.5 py-2.5 text-[14px] outline-none placeholder:text-text-muted focus:border-brand/60"
        />
        <textarea
          value={firstMessage}
          onChange={(e) => setFirstMessage(e.target.value.slice(0, 4000))}
          placeholder="What happened? Include what you tapped and what you saw."
          rows={3}
          maxLength={4000}
          className="w-full resize-none rounded-xl border border-divider bg-bg-tertiary px-3.5 py-2.5 text-[14px] outline-none placeholder:text-text-muted focus:border-brand/60"
        />
        <button
          type="button"
          disabled={creating || !subject.trim() || !firstMessage.trim()}
          onClick={() => void create()}
          className="w-full rounded-xl bg-brand py-2.5 text-[15px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
        >
          {creating ? "Opening…" : "Open request — talk to Tether"}
        </button>
      </div>

      {tickets.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Your requests
          </p>
          <div className="space-y-1.5">
            {tickets.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveId(t.id)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-interactive-hover"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-text-normal">
                    {t.subject}
                  </span>
                  <span className="block text-[12px] text-text-muted">
                    {new Date(t.updated_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    t.status === "open"
                      ? "bg-brand/15 text-brand"
                      : "bg-bg-tertiary text-text-muted"
                  }`}
                >
                  {t.status}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SupportPage() {
  return (
    <ThemeProvider>
      <AppProvider>
        <div className="flex min-h-screen flex-col items-center bg-bg-tertiary px-4 py-10">
          <div className="mb-6 flex flex-col items-center text-center">
            <Logo adaptive size={40} className="h-10 w-10" priority />
            <h1 className="mt-4 text-[24px] font-semibold tracking-[-0.02em] text-text-normal">
              Disband Support
            </h1>
            <p className="mt-1 max-w-[380px] text-[14px] text-text-muted">
              Account trouble? Talk it through with Tether — it can check
              your account and email you reset links. It only ever sees
              your own account, never anyone else&apos;s.
            </p>
          </div>
          <SupportHome />
          <p className="mt-6 text-center text-[13px] text-text-muted">
            <Link href="/app" className="font-medium text-text-normal hover:underline">
              Open Disband
            </Link>
          </p>
        </div>
      </AppProvider>
    </ThemeProvider>
  );
}
