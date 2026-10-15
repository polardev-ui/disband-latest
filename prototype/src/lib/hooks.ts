import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { MotionPref, ThemePref } from "../data/types";

export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== "undefined" ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

export function useResolvedTheme(pref: ThemePref): "light" | "dark" {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  if (pref === "system") return prefersDark ? "dark" : "light";
  return pref;
}

export function useResolvedMotion(pref: MotionPref): "full" | "reduced" {
  const prefersReduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  if (pref === "system") return prefersReduced ? "reduced" : "full";
  return pref;
}

/** Cmd/Ctrl + key. Works while typing, because it never inserts text. */
export function useModKey(key: string, handler: () => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === key) {
        e.preventDefault();
        ref.current();
      }
    };
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, [key]);
}

// Escape closes the most recently opened layer only (menu before panel
// before overlay), so handlers live on a stack with one document listener.
const escapeStack: { current: () => void }[] = [];
let escapeBound = false;
function bindEscape() {
  if (escapeBound) return;
  escapeBound = true;
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.defaultPrevented || !escapeStack.length) return;
    e.preventDefault();
    escapeStack[escapeStack.length - 1].current();
  });
}

/** A single-key shortcut (e.g. "/") that only fires when you aren't typing. */
export function usePlainKey(key: string, handler: () => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== key || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      ref.current();
    };
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, [key]);
}

export function useEscape(handler: () => void, active = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return;
    bindEscape();
    const entry = { current: () => ref.current() };
    escapeStack.push(entry);
    return () => {
      const i = escapeStack.indexOf(entry);
      if (i >= 0) escapeStack.splice(i, 1);
    };
  }, [active]);
}

export function useOutsideClick(refs: RefObject<HTMLElement | null>[], handler: () => void, active = true) {
  const cb = useRef(handler);
  cb.current = handler;
  useEffect(() => {
    if (!active) return;
    const on = (e: PointerEvent) => {
      const t = e.target as Node;
      if (refs.some((r) => r.current?.contains(t))) return;
      cb.current();
    };
    // Defer so the click that opened the element doesn't close it.
    const id = window.setTimeout(() => document.addEventListener("pointerdown", on), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("pointerdown", on);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

export function useAutosize(ref: RefObject<HTMLTextAreaElement | null>, value: string, maxPx = 200) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, maxPx);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxPx ? "auto" : "hidden";
  }, [ref, value, maxPx]);
}

/**
 * Keeps a message list pinned to the bottom: always on conversation change
 * and when you send, otherwise only if the reader is already near the end.
 */
export function useStickToBottom(ref: RefObject<HTMLElement | null>, convId: string, count: number, lastIsMine: boolean) {
  const near = useRef(true);
  const prevConv = useRef<string | null>(null);
  const prevCount = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => {
      near.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, [ref]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prevConv.current !== convId) {
      el.scrollTop = el.scrollHeight;
      near.current = true;
    } else if (count > prevCount.current && (lastIsMine || near.current)) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
    prevConv.current = convId;
    prevCount.current = count;
  }, [ref, convId, count, lastIsMine]);
}

/** Scrolls a message into view and flashes it, e.g. after a search jump. */
export function useHighlight(): [string | null, (id: string | null) => void] {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    const el = document.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(id)}"]`);
    el?.scrollIntoView({ block: "center" });
    const t = window.setTimeout(() => setId(null), 1800);
    return () => window.clearTimeout(t);
  }, [id]);
  return [id, setId];
}

export function useCopy() {
  return useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }
  }, []);
}
