import { useCallback, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import type { Attachment, Message } from "../data/types";
import { ME } from "../data/seed";
import { useAutosize, useCopy } from "../lib/hooks";
import { messagesOf } from "../state/selectors";
import { useChat } from "../state/store";
import { useConfirm } from "./Confirm";
import type { MessageHandlers } from "./MessageActions";
import { useToast } from "./Toast";

/** Per-conversation UI state shared by all three designs. */
export function useConversation(convId: string) {
  const { state, actions } = useChat();
  const toast = useToast();
  const copy = useCopy();
  const [confirmEl, ask] = useConfirm();
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ id: string; x: number; y: number } | null>(null);
  const messages = messagesOf(state, convId);

  useEffect(() => {
    setReplyTo(null);
    setEditingId(null);
    setMenuFor(null);
    setCtx(null);
  }, [convId]);

  // Viewing a conversation reads it.
  const unread = state.unread[convId] ?? 0;
  const mention = !!state.mentions[convId];
  useEffect(() => {
    if (unread || mention) actions.read(convId);
  }, [convId, unread, mention, actions]);

  const h: MessageHandlers = {
    reply: (m) => {
      setEditingId(null);
      setReplyTo(m);
      requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>("[data-composer]")?.focus());
    },
    react: (m, e) => actions.react(convId, m.id, e),
    copy: async (m) => {
      const ok = await copy(m.text);
      toast(ok ? "Copied to clipboard" : "Couldn't copy — your browser blocked it", { tone: ok ? "info" : "error" });
    },
    edit: (m) => {
      setReplyTo(null);
      setEditingId(m.id);
    },
    remove: async (m) => {
      const yes = await ask({
        title: "Delete this message?",
        body: "It will be removed for everyone in this prototype conversation. This can't be undone.",
        confirm: "Delete",
        danger: true,
      });
      if (yes) {
        actions.remove(convId, m.id);
        toast("Message deleted");
      }
    },
    retry: (m) => {
      if (state.scenario === "offline") toast("Still offline. It'll stay here until you're connected.", { tone: "error" });
      else actions.retry(convId, m.id);
    },
  };

  const saveEdit = (m: Message, text: string) => {
    const t = text.trim();
    setEditingId(null);
    if (!t) return h.remove(m);
    actions.edit(convId, m.id, t);
  };

  const send = (text: string, attachments?: Attachment[]) => {
    actions.send(convId, text, { replyToId: replyTo?.id, attachments });
    setReplyTo(null);
  };

  const editLast = () => {
    const mine = [...messages].reverse().find((m) => m.authorId === ME);
    if (mine) setEditingId(mine.id);
  };

  const byId = (id?: string) => (id ? messages.find((m) => m.id === id) : undefined);

  return {
    state, actions, messages, h, replyTo, setReplyTo, editingId, setEditingId, saveEdit, send, editLast,
    menuFor, setMenuFor, ctx, setCtx, byId, confirmEl,
  };
}

const drafts = new Map<string, string>();

/** Composer behaviour: Enter sends, Shift+Enter breaks a line, ↑ edits your last message. */
export function useComposer({
  convId,
  onSend,
  onEditLast,
  onCancel,
  maxPx = 220,
}: {
  convId: string;
  onSend: (text: string, attachments?: Attachment[]) => void;
  onEditLast?: () => void;
  onCancel?: () => void;
  maxPx?: number;
}) {
  const [value, setValueRaw] = useState(() => drafts.get(convId) ?? "");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [pulse, setPulse] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useAutosize(ref, value, maxPx);

  useEffect(() => {
    setValueRaw(drafts.get(convId) ?? "");
    setFiles([]);
  }, [convId]);

  const setValue = useCallback(
    (v: string) => {
      drafts.set(convId, v);
      setValueRaw(v);
    },
    [convId],
  );

  const canSend = value.trim().length > 0 || files.length > 0;

  const submit = () => {
    if (!canSend) return;
    onSend(value.trim(), files.length ? files : undefined);
    setValue("");
    setFiles([]);
    setPulse((p) => p + 1);
    ref.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape" && onCancel) {
      e.preventDefault();
      onCancel();
    } else if (e.key === "ArrowUp" && !value && onEditLast) {
      e.preventDefault();
      onEditLast();
    }
  };

  const onFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []).slice(0, 10);
    setFiles((f) => [...f, ...list.map((x) => ({ kind: "file" as const, name: x.name, size: x.size }))]);
    e.target.value = "";
    ref.current?.focus();
  };

  const insert = (text: string) => {
    const el = ref.current;
    if (!el) return setValue(value + text);
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  };

  return {
    value, setValue, files, setFiles, ref, fileRef, onKeyDown, onFiles, submit, canSend, insert, pulse,
    removeFile: (i: number) => setFiles((f) => f.filter((_, j) => j !== i)),
  };
}

/** Inline editor for an existing message. */
export function useInlineEdit(initial: string, onSave: (t: string) => void, onCancel: () => void) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutosize(ref, value, 260);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, []);
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSave(value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };
  return { value, setValue, ref, onKeyDown };
}
