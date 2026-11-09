"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowUp, Check, Copy, LoaderCircle, LockKeyhole, MessageCircle, X } from "lucide-react";
import { renderMarkdown } from "@/lib/markdown";
import { apiFetch } from "@/lib/api";
import { getSupabaseClient } from "@/lib/supabase/client";
import { hasEmailFixForm, stripSupportMarkers } from "@/lib/support/markers";
import { lockBodyScroll } from "@/lib/overlay";
import styles from "./support.module.css";

export interface SupportMessage {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

interface SupportConversationProps {
  subject: string;
  messages: SupportMessage[];
  draft: string;
  sending: boolean;
  loading: boolean;
  error: string | null;
  onDraftChange: (text: string) => void;
  onSend: () => void;
  onRetry: () => void;
  onBack: () => void;
  readOnly?: boolean;
}

function TetherPortrait({ thinking = false }: { thinking?: boolean }) {
  return <Image src={thinking ? "/tether-thinking.png" : "/tether.png"}
    alt="" width={80} height={80} className={styles.tetherPortrait} draggable={false} />;
}

function CopyReply({ content }: { content: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (status === "idle") return;
    const timer = window.setTimeout(() => setStatus("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [status]);
  return <button className={styles.copyReply} type="button" aria-label={status === "copied" ? "Reply copied" : "Copy reply"} onClick={async () => {
    try { await navigator.clipboard.writeText(content); setStatus("copied"); }
    catch { setStatus("failed"); }
  }}>{status === "copied" ? <Check size={13} /> : <Copy size={13} />}<span aria-live="polite">{status === "copied" ? "Copied" : status === "failed" ? "Couldn’t copy" : "Copy reply"}</span></button>;
}

/**
 * The wrong-email fix, shown when Tether offers it. The password goes straight
 * to our server, never into the chat or to Tether.
 */
function EmailFixForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneEmail, setDoneEmail] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/account/email/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; email?: string; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Couldn't change the email. Try again.");
      setPassword("");
      setDoneEmail(json.email ?? "");
      // This chat's sign-in was only for support; the real account is next.
      await getSupabaseClient().auth.signOut().catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change the email. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const box = "mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-[14px]";
  const input = "mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-[14px] outline-none focus:border-brand/60";

  if (doneEmail !== null) {
    return (
      <div className={box} role="status">
        <p className="font-semibold">Email changed</p>
        <p className="mt-1 opacity-80">
          Your account&apos;s email is now {doneEmail}. Log in with it and your usual password.
        </p>
        <a href="/login" className="mt-2 inline-block font-semibold text-text-link hover:underline">Log in</a>
      </div>
    );
  }

  return (
    <form className={box} onSubmit={(e) => void submit(e)}>
      <p className="flex items-center gap-1.5 font-semibold"><LockKeyhole size={14} aria-hidden="true" />Fix your account&apos;s email</p>
      <p className="mt-1 opacity-80">
        Enter your Disband username and password. Your account&apos;s email will change to the one you
        verified for this chat. Your password goes straight to Disband, not to Tether.
      </p>
      <label className="mt-2 block">
        <span className="text-[12px] font-semibold opacity-80">Username</span>
        <input className={input} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={64} required />
      </label>
      <label className="mt-2 block">
        <span className="text-[12px] font-semibold opacity-80">Password</span>
        <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" maxLength={200} required />
      </label>
      {error && <p role="alert" className="mt-2 text-[#f23f43]">{error}</p>}
      <button type="submit" disabled={busy || !username.trim() || !password} className="mt-3 rounded-md bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-hover disabled:opacity-50">
        {busy ? "Changing…" : "Change email"}
      </button>
    </form>
  );
}

export function SupportConversation({ subject, messages, draft, sending, loading, error, onDraftChange, onSend, onRetry, onBack, readOnly = false }: SupportConversationProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nearBottom = useRef(true);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const unlock = lockBodyScroll();
    dialog?.showModal();
    inputRef.current?.focus({ preventScroll: true });
    return () => {
      dialog?.close();
      unlock();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (scroll && nearBottom.current) scroll.scrollTop = scroll.scrollHeight;
  }, [messages, sending, loading]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }, [draft]);

  const submit = () => {
    if (sending || loading || !draft.trim()) return;
    nearBottom.current = true;
    onSend();
  };

  return <dialog ref={dialogRef} className={styles.conversation} aria-labelledby="tether-chat-title" onCancel={e => { e.preventDefault(); onBack(); }}>
    <header className={styles.chatHeader}>
      <button type="button" className={styles.iconButton} onClick={onBack} aria-label="Back to support"><ArrowLeft size={20} /></button>
      <span className={styles.tetherAvatar} aria-hidden="true"><TetherPortrait /></span>
      <div className={styles.chatIdentity}><h1 id="tether-chat-title">Tether<span>Support assistant</span></h1><p><span />Here to help you work it out</p></div>
      <span className={styles.privateLabel}><LockKeyhole size={13} />Your account. Your conversation.</span>
      <button type="button" className={styles.iconButton} onClick={onBack} aria-label="Close chat"><X size={20} /></button>
    </header>

    <div className={styles.subjectBar}><MessageCircle size={14} /><span>{subject}</span><span className={styles.savedLabel}>Saved to your requests</span></div>

    <div ref={scrollRef} className={styles.messageScroller} onScroll={e => {
      const el = e.currentTarget;
      nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    }}>
      <div className={styles.messageColumn}>
        <div className={styles.conversationIntro}><span className={styles.introMark}><TetherPortrait /></span><h2>Let’s figure it out.</h2><p>You’re in the right place. Tell me what’s happening,<br className={styles.desktopBreak} /> and we’ll take it one step at a time.</p></div>
        <div className={styles.conversationDivider}><span>Your conversation with Tether</span></div>
        {loading && <div role="status" className={styles.loadingMessages}><LoaderCircle size={17} className={styles.spinner} />Loading your conversation…</div>}
        <div role="log" aria-label="Support conversation" aria-live="polite" aria-relevant="additions text">
          {messages.map((m, i) => {
            const mine = m.role === "user";
            const text = mine ? m.content : stripSupportMarkers(m.content);
            // Only the newest offer gets a live form; older ones are history.
            const showFixForm = !mine && !readOnly && hasEmailFixForm(m.content)
              && !messages.slice(i + 1).some((later) => later.role !== "user" && hasEmailFixForm(later.content));
            return <article key={m.id} className={`${styles.message} ${mine ? styles.userMessage : styles.tetherMessage}`}>
              {!mine && <span className={styles.messageAvatar} aria-hidden="true"><TetherPortrait /></span>}
              <div className={styles.messageBody}>
                <div className={styles.messageMeta}><strong>{mine ? "You" : m.role === "staff" ? "Disband support" : "Tether"}</strong><time dateTime={m.created_at}>{new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div>
                <div data-selectable className={styles.messageContent}>{mine ? text : renderMarkdown(text)}</div>
                {showFixForm && <EmailFixForm />}
                {!mine && <CopyReply content={text} />}
              </div>
            </article>;
          })}
          {sending && <div role="status" className={styles.thinking}><span className={styles.thinkingAvatar} aria-hidden="true"><TetherPortrait thinking /></span><span className={styles.thinkingDots} aria-hidden="true"><i /><i /><i /></span><span>Tether is looking into it…</span></div>}
        </div>
      </div>
    </div>

    <footer className={styles.composerDock}>
      <div className={styles.composerColumn}>
        {error && <div role="alert" className={styles.chatError}><span>{error}</span><button type="button" onClick={onRetry}>Reload conversation</button></div>}
        {readOnly ? (
          <div className={styles.chatError} role="status">
            <span>This request has been resolved by the support team. The chat is now read-only.</span>
          </div>
        ) : (
          <>
            <form className={styles.chatComposer} onSubmit={e => { e.preventDefault(); submit(); }}>
              <textarea ref={inputRef} value={draft} onChange={e => onDraftChange(e.target.value)} onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
              }} aria-label="Message Tether" placeholder="Tell Tether a little more…" maxLength={4000} rows={1} />
              <button type="submit" className={styles.sendButton} disabled={sending || loading || !draft.trim()} aria-label={sending ? "Waiting for Tether" : "Send message"}>{sending ? <LoaderCircle size={20} className={styles.spinner} /> : <ArrowUp size={21} />}</button>
            </form>
            <div className={styles.composerHint}><span><LockKeyhole size={11} />Only your signed-in account</span><span>Enter to send<span className={styles.desktopHint}> · Shift + Enter for a new line</span></span></div>
          </>
        )}
      </div>
    </footer>
  </dialog>;
}
