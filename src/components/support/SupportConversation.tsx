"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowUp, Check, Copy, LoaderCircle, LockKeyhole, MessageCircle, X } from "lucide-react";
import { renderMarkdown } from "@/lib/markdown";
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

export function SupportConversation({ subject, messages, draft, sending, loading, error, onDraftChange, onSend, onRetry, onBack }: SupportConversationProps) {
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
          {messages.map(m => {
            const mine = m.role === "user";
            return <article key={m.id} className={`${styles.message} ${mine ? styles.userMessage : styles.tetherMessage}`}>
              {!mine && <span className={styles.messageAvatar} aria-hidden="true"><TetherPortrait /></span>}
              <div className={styles.messageBody}>
                <div className={styles.messageMeta}><strong>{mine ? "You" : m.role === "staff" ? "Disband support" : "Tether"}</strong><time dateTime={m.created_at}>{new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div>
                <div className={styles.messageContent}>{mine ? m.content : renderMarkdown(m.content)}</div>
                {!mine && <CopyReply content={m.content} />}
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
        <form className={styles.chatComposer} onSubmit={e => { e.preventDefault(); submit(); }}>
          <textarea ref={inputRef} value={draft} onChange={e => onDraftChange(e.target.value)} onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
          }} aria-label="Message Tether" placeholder="Tell Tether a little more…" maxLength={4000} rows={1} />
          <button type="submit" className={styles.sendButton} disabled={sending || loading || !draft.trim()} aria-label={sending ? "Waiting for Tether" : "Send message"}>{sending ? <LoaderCircle size={20} className={styles.spinner} /> : <ArrowUp size={21} />}</button>
        </form>
        <div className={styles.composerHint}><span><LockKeyhole size={11} />Only your signed-in account</span><span>Enter to send<span className={styles.desktopHint}> · Shift + Enter for a new line</span></span></div>
      </div>
    </footer>
  </dialog>;
}
