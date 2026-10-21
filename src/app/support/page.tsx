"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
import { SupportConversation, type SupportMessage } from "@/components/support/SupportConversation";
import styles from "@/components/support/support.module.css";
import { AppProvider, useApp } from "@/contexts/AppContext";
import { ThemeProvider, useTheme } from "@/components/theme/ThemeProvider";
import { Logo } from "@/components/ui/Logo";
import { Avatar } from "@/components/ui/Avatar";
import { apiFetch } from "@/lib/api";
import { getSupabaseClient } from "@/lib/supabase/client";

interface Ticket {
  id: string;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
  replyError?: string;
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

function ThemeSwitcher() {
  const { theme, themes, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Change theme"
        title="Change theme"
        className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 0 0 0 18c1.5 0 2-1 1.3-2.2-.8-1.3 0-2.8 1.7-2.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" />
          <circle cx="7.5" cy="10.5" r="1" fill="currentColor" />
          <circle cx="12" cy="7.5" r="1" fill="currentColor" />
          <circle cx="16" cy="10.5" r="1" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 max-h-72 w-52 overflow-y-auto rounded-[4px] border border-divider bg-bg-secondary p-1.5 shadow-[var(--elevation-high)]">
            {themes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTheme(t.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-[3px] px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-interactive-hover ${
                  theme === t.id ? "font-semibold" : ""
                }`}
              >
                <span className="flex shrink-0 overflow-hidden rounded-full" aria-hidden>
                  {t.swatch.slice(0, 3).map((c, i) => (
                    <span key={i} className="h-4 w-2.5 first:rounded-l-full last:rounded-r-full" style={{ background: c }} />
                  ))}
                </span>
                <span className="min-w-0 flex-1 truncate text-text-normal">{t.label}</span>
                {theme === t.id && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-brand">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Logged-out: prove the inbox with a one-time code. Support-only sign-in —
 *  never touches the Disband password; the code only goes to the typed inbox. */
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
    <div className="w-full rounded-[28px] border border-divider bg-bg-secondary p-6 text-left shadow-[0_24px_70px_-30px_rgba(0,0,0,0.5)] sm:p-8">
      <h2 className="text-[20px] font-extrabold tracking-tight text-text-normal">Verify it&apos;s you</h2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-text-muted">
        Support needs your Disband account email — not your password. We send
        a one-time code to that inbox; entering it proves the account is
        yours, and Tether will only ever discuss that account.
      </p>
      {!sent ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="min-w-0 flex-1 rounded-[4px] border border-divider bg-bg-tertiary px-4 py-3 text-[15px] outline-none placeholder:text-text-muted focus:border-brand/60 "
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void send()}
            className="shrink-0 rounded-[4px] bg-brand px-6 py-3 text-[15px] font-bold text-white transition-all hover:bg-brand-hover disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send code"}
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-[14px] text-text-muted">
            Code sent to <span className="font-semibold text-text-normal">{email.trim()}</span>
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
              placeholder="6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="min-w-0 flex-1 rounded-[4px] border border-divider bg-bg-tertiary px-4 py-3 text-[15px] tracking-[0.02em] outline-none placeholder:text-text-muted focus:border-brand/60 "
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void verify()}
              className="shrink-0 rounded-[4px] bg-brand px-6 py-3 text-[15px] font-bold text-white transition-all hover:bg-brand-hover disabled:opacity-50"
            >
              {busy ? "Checking…" : "Verify & continue"}
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
        Have the app?{" "}
        <Link href="/login?next=/support" className="font-semibold text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

function Thread({ ticketId, subject, initialDraft = "", initialError, onBack }: { ticketId: string; subject: string; initialDraft?: string; initialError?: string; onBack: () => void }) {
  const authedFetch = useAuthedFetch();
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [draft, setDraft] = useState(initialDraft);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [resolved, setResolved] = useState(false);
  const sendingRef = useRef(false);
  const mounted = useRef(false);

  const load = useCallback(async () => {
    try {
      const json = await authedFetch(`/api/support/tickets/${ticketId}/messages`);
      if (!mounted.current) return;
      const latestTicket = (json.ticket as { status?: string } | undefined) ?? null;
      setResolved(latestTicket?.status === "closed");
      setMessages((json.messages as SupportMessage[]) ?? []);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "Could not load messages.");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [authedFetch, ticketId]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load]);

  async function send() {
    const text = draft.trim();
    if (!text || sendingRef.current || resolved) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    setDraft("");
    const pendingId = `pending-${Date.now()}`;
    setMessages(current => [...current, { id: pendingId, role: "user", content: text, created_at: new Date().toISOString() }]);
    try {
      // This endpoint waits for Tether's reply. Keep the thinking state active
      // during the request rather than starting uncancelled polling afterward.
      const json = await authedFetch(`/api/support/tickets/${ticketId}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });
      if (!mounted.current) return;
      if (typeof json.reply === "string") {
        const reply = json.reply;
        setMessages(current => [...current, { id: `reply-${pendingId}`, role: "tether", content: reply, created_at: new Date().toISOString() }]);
      }
      await load();
    } catch (e) {
      if (!mounted.current) return;
      setMessages(current => current.filter(message => message.id !== pendingId));
      setError(e instanceof Error ? e.message : "Could not send.");
      setDraft(current => current || text);
    } finally {
      sendingRef.current = false;
      if (mounted.current) setSending(false);
    }
  }

  return <SupportConversation subject={subject} messages={messages} draft={draft}
    sending={sending} loading={loading} error={error} onDraftChange={setDraft}
    onSend={() => void send()} onRetry={() => { setError(null); void load(); }} onBack={onBack} readOnly={resolved} />;
}

function HeroChat({
  onStart,
  starting,
}: {
  onStart: (text: string) => void;
  starting: boolean;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const clean = text.trim();
    if (!clean || starting) return;
    onStart(clean);
  }

  return (
    <div className={styles.heroComposer}>
      {/* The artwork belongs only to the support homepage, resting on its bar. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/tether-resting.png" alt="" aria-hidden="true" width={176} height={176}
        className={styles.restingTether} draggable={false} />
      <form className={styles.heroBar} onSubmit={e => { e.preventDefault(); submit(); }}>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          aria-label="Ask Tether about your account"
          placeholder="Tell me what’s going on. We’ll figure it out together…"
          maxLength={4000}
          rows={2}
          className={styles.heroInput}
        />
        <div className={styles.heroBarFooter}>
          <p className="flex items-center gap-1.5"><LockKeyhole size={13} className="shrink-0" />Private help, just for your account</p>
          <button type="submit" disabled={starting || !text.trim()} className={styles.heroSubmit}>
            {starting ? "Starting…" : "Ask Tether"}<ArrowUpRight size={17} />
          </button>
        </div>
      </form>
    </div>
  );
}

function SupportHome() {
  const { ready, session, user, profile } = useApp();
  const authedFetch = useAuthedFetch();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [active, setActive] = useState<Ticket | null>(null);
  const [needsVerify, setNeedsVerify] = useState(false);
  const [pendingText, setPendingText] = useState("");
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const showNewChatRef = useRef(false);
  const [opening, setOpening] = useState<{ subject: string; message: SupportMessage } | null>(null);
  const [openingDraft, setOpeningDraft] = useState("");
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
    void getSupabaseClient()
      .from("profiles")
      .select("id")
      .eq("id", user?.id ?? "")
      .maybeSingle()
      .then(({ data }) => setNoAccount(!data));
  }, [ready, session, user?.id, load]);

  // White by default: only visitors who never chose a theme get light.
  // (ThemeProvider inits dark; stored choices are respected untouched.)
  const { setTheme } = useTheme();
  const defaultedRef = useRef(false);
  useEffect(() => {
    if (defaultedRef.current) return;
    defaultedRef.current = true;
    try {
      if (!window.localStorage.getItem("disband:theme")) setTheme("light");
    } catch {
      setTheme("light");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startFromText(text: string) {
    if (startingRef.current) return;
    if (!session) {
      // Hold the message across verification, then send it automatically.
      setPendingText(text);
      setNeedsVerify(true);
      return;
    }
    startingRef.current = true;
    showNewChatRef.current = true;
    setStarting(true);
    setError(null);
    setOpeningDraft("");
    const subject = text.length > 80 ? `${text.slice(0, 77)}…` : text;
    setOpening({ subject, message: { id: "opening-message", role: "user", content: text, created_at: new Date().toISOString() } });
    try {
      const json = await authedFetch("/api/support/tickets", {
        method: "POST",
        body: JSON.stringify({ subject, message: text }),
      });
      const ticket = json.ticket as Ticket;
      setOpening(null);
      if (showNewChatRef.current) {
        setActive({ ...ticket, replyError: typeof json.replyError === "string" ? json.replyError : undefined });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the chat.");
    } finally {
      setOpening(null);
      startingRef.current = false;
      setStarting(false);
    }
  }

  // After verification, the held message sends itself.
  useEffect(() => {
    if (session && pendingText && !starting && !active) {
      const text = pendingText;
      setPendingText("");
      setNeedsVerify(false);
      void startFromText(text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, pendingText]);

  function pickTopic(subject: string) {
    if (!session) {
      setPendingText(subject);
      setNeedsVerify(true);
      return;
    }
    void startFromText(subject);
  }

  async function signOut() {
    await getSupabaseClient().auth.signOut();
    setTickets([]);
    setActive(null);
    setNeedsVerify(false);
  }

  const displayName =
    profile?.display_name || profile?.username || user?.email?.split("@")[0] || "You";

  return (
    <div className="min-h-screen bg-bg-primary text-text-normal">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-divider/70 bg-bg-primary">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Link href="/app" className="flex items-center gap-2.5">
            <Logo adaptive size={30} className="h-[30px] w-[30px]" priority />
            <span className="text-[17px] font-extrabold tracking-tight">
              Disband <span className="font-medium text-text-muted">Support</span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeSwitcher />
            {ready && session ? (
              <div className="flex items-center gap-2 rounded-full py-1 pl-1 pr-1">
                <Avatar profile={profile ?? { display_name: displayName }} size="sm" />
                <button
                  type="button"
                  onClick={() => void signOut()}
                  title="Sign out"
                  className="rounded-full px-2 py-1 text-[12px] font-medium text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Link
                href="/login?next=/support"
                className="rounded-full bg-bg-tertiary px-4 py-2 text-[13px] font-bold text-text-normal transition-colors hover:bg-interactive-hover"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero + big chatbox */}
      <section className={`${styles.heroSection} mx-auto w-full px-4 pb-10 pt-12 text-center sm:px-6 sm:pt-16`}>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          How can we help?
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[16px] leading-relaxed text-text-muted">
          Ask Tether anything about your account — login trouble, billing,
          safety. It reads your account, never anyone else&apos;s.
        </p>
        <div className="mt-7 text-left">
          {!ready ? (
            <div aria-label="Loading" className="animate-pulse rounded-[28px] border border-divider bg-bg-secondary p-6">
              <div className="h-5 w-2/3 rounded bg-bg-accent" />
              <div className="mt-3 h-12 w-full rounded-[4px] bg-bg-accent" />
            </div>
          ) : needsVerify && !session ? (
            <VerifyEmail onVerified={() => undefined} />
          ) : (
            <HeroChat onStart={(t) => void startFromText(t)} starting={starting} />
          )}
        </div>
        {error && <p className="mt-3 text-[13px] text-status-dnd">{error}</p>}
        {noAccount && session && (
          <p className="mx-auto mt-3 max-w-md rounded-[4px] bg-bg-secondary px-4 py-2.5 text-[13px] leading-relaxed text-text-muted">
            This email isn&apos;t attached to a Disband account yet — Tether
            can still answer general questions here.
          </p>
        )}

        {/* Open immediately while the create request generates the first reply. */}
        {opening && session && (
          <SupportConversation subject={opening.subject} messages={[opening.message]}
            draft={openingDraft} onDraftChange={setOpeningDraft} sending loading={false}
            error={null} onSend={() => undefined} onRetry={() => undefined}
            onBack={() => { showNewChatRef.current = false; setOpening(null); }} />
        )}
        {/* Active thread takes over fullscreen. */}
        {active && session && (
          <Thread
            key={active.id}
            ticketId={active.id}
            subject={active.subject}
            initialDraft={openingDraft}
            initialError={active.replyError}
            onBack={() => {
              setActive(null);
              void load();
            }}
          />
        )}
      </section>

      {/* Topics */}
      <section className="mx-auto w-full max-w-5xl px-4 pb-4 sm:px-6">
        <h2 className="px-1 text-[15px] font-bold text-text-muted">Popular topics</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { subject: "I can't log in", hint: "Passwords, codes & locked accounts", icon: "🔑" },
            { subject: "Billing question", hint: "Aero, Lite, renewals & refunds", icon: "💳" },
            { subject: "Someone is harassing me", hint: "Blocks, reports & safety", icon: "🛡️" },
            { subject: "Something is broken", hint: "Bugs, loading & calls", icon: "🐞" },
          ].map((t) => (
            <button
              key={t.subject}
              type="button"
              onClick={() => pickTopic(t.subject)}
              className="group rounded-[24px] border border-divider bg-bg-secondary p-5 text-left shadow-[0_10px_36px_-24px_rgba(0,0,0,0.5)] transition-all hover:border-brand/40"
            >
              <span className="text-[26px]" aria-hidden>{t.icon}</span>
              <span className="mt-3 block text-[15px] font-bold text-text-normal">{t.subject}</span>
              <span className="mt-1 block text-[13px] text-text-muted">{t.hint}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Your requests */}
      {ready && session && tickets.length > 0 && !active && (
        <>
          {tickets.some((t) => t.status !== "closed") && (
            <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
              <h2 className="px-1 text-[15px] font-bold text-text-muted">Your requests</h2>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {tickets.filter((t) => t.status !== "closed").map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { setOpeningDraft(""); setActive(t); }}
                    className="flex items-center gap-3 rounded-[4px] border border-divider bg-bg-secondary px-4 py-3.5 text-left transition-all hover:border-brand/40"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold text-text-normal">
                        {t.subject}
                      </span>
                      <span className="block text-[12px] text-text-muted">
                        {new Date(t.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        t.status === "open"
                          ? "bg-brand/15 text-brand"
                          : t.status === "human_reply"
                            ? "bg-brand/15 text-brand"
                            : "bg-amber-400/15 text-amber-300"
                      }`}
                    >
                      {t.status === "human_reply" ? "human reply" : t.status}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {tickets.some((t) => t.status === "closed") && (
            <section className="mx-auto w-full max-w-5xl px-4 pb-8 sm:px-6">
              <h2 className="px-1 text-[15px] font-bold text-text-muted">Resolved</h2>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {tickets.filter((t) => t.status === "closed").map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { setOpeningDraft(""); setActive(t); }}
                    className="flex items-center gap-3 rounded-[4px] border border-divider bg-bg-secondary/60 px-4 py-3.5 text-left transition-all hover:border-brand/40"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold text-text-normal">
                        {t.subject}
                      </span>
                      <span className="block text-[12px] text-text-muted">
                        {new Date(t.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-status-online/15 px-2.5 py-1 text-[11px] font-bold text-status-online">
                      resolved
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* FAQ */}
      <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <h2 className="px-1 text-[15px] font-bold text-text-muted">Quick answers</h2>
        <div className="mt-3 flex flex-col gap-2.5">
          {[
            ["I forgot my password. What now?", "Open a request above and ask Tether for a reset link — it emails one to your inbox on the spot."],
            ["How do I get my subscription back?", "In the app: profile → Subscription → Restore purchases, with the same Apple ID."],
            ["Can Tether look at someone else's account for me?", "No — ever. Tether only sees the account you're signed in (or verified) as."],
            ["How do I delete my account?", "Ask Tether here and it will walk you through it, or email support from your account address."],
          ].map(([q, a]) => (
            <details
              key={q}
              className="group rounded-[4px] border border-divider bg-bg-secondary px-5 py-4 "
            >
              <summary className="cursor-pointer list-none text-[15px] font-bold text-text-normal">
                {q}
              </summary>
              <p className="mt-2 text-[14px] leading-relaxed text-text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="border-t border-divider/70 py-8">
        <p className="text-center text-[13px] text-text-muted">
          <Link href="/app" className="font-semibold text-text-normal hover:underline">
            Open Disband
          </Link>
          <span className="mx-2">·</span>
          Still stuck? Ask Tether above — a human reviews open requests daily.
        </p>
      </footer>
    </div>
  );
}

export default function SupportPage() {
  return (
    <ThemeProvider>
      <AppProvider>
        <SupportHome />
      </AppProvider>
    </ThemeProvider>
  );
}
