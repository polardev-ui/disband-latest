"use client";

/*
 In-app replacements for window.alert, window.confirm and window.prompt.

 The desktop app's macOS WebView (WKWebView via wry) has no handlers for the
 native dialogs: alert() shows nothing, confirm() returns false and prompt()
 returns null, without ever asking. Every "Delete…?", "Kick…?" and "Rename…"
 behind them silently did nothing on desktop. These return promises and are
 drawn by <DialogHost />; with no host mounted they fall back to the native
 dialogs, which work in browsers.
*/

export type DialogTone = "danger" | "primary";

export type DialogRequest =
  | {
      id: number;
      kind: "confirm";
      title: string;
      body?: string;
      confirmLabel: string;
      tone: DialogTone;
      resolve: (ok: boolean) => void;
    }
  | {
      id: number;
      kind: "prompt";
      title: string;
      body?: string;
      label: string;
      defaultValue: string;
      placeholder?: string;
      maxLength: number;
      confirmLabel: string;
      resolve: (value: string | null) => void;
    }
  | {
      id: number;
      kind: "alert";
      title: string;
      body?: string;
      resolve: () => void;
    };

let nextId = 1;
let queue: DialogRequest[] = [];
const listeners = new Set<() => void>();
let hosts = 0;

function emit() {
  for (const fn of listeners) fn();
}

function enqueue(request: DialogRequest) {
  queue = [...queue, request];
  emit();
}

/** The dialog to show now: the oldest one still open. */
export function currentDialog(): DialogRequest | null {
  return queue[0] ?? null;
}

export function subscribeDialogs(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Called by <DialogHost /> while it is mounted. */
export function registerDialogHost(): () => void {
  hosts += 1;
  return () => {
    hosts -= 1;
  };
}

/** Close the front dialog; `settle` passes its answer to the caller. */
export function settleDialog(id: number, settle: (request: DialogRequest) => void) {
  const request = queue.find((r) => r.id === id);
  if (!request) return;
  queue = queue.filter((r) => r.id !== id);
  emit();
  settle(request);
}

export function confirmDialog(opts: {
  title: string;
  body?: string;
  confirmLabel?: string;
  tone?: DialogTone;
}): Promise<boolean> {
  if (hosts === 0) {
    return Promise.resolve(window.confirm(opts.body ? `${opts.title}\n\n${opts.body}` : opts.title));
  }
  return new Promise((resolve) => {
    enqueue({
      id: nextId++,
      kind: "confirm",
      title: opts.title,
      body: opts.body,
      confirmLabel: opts.confirmLabel ?? "Confirm",
      tone: opts.tone ?? "danger",
      resolve,
    });
  });
}

export function promptDialog(opts: {
  title: string;
  body?: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  maxLength?: number;
  confirmLabel?: string;
}): Promise<string | null> {
  if (hosts === 0) return Promise.resolve(window.prompt(opts.title, opts.defaultValue ?? ""));
  return new Promise((resolve) => {
    enqueue({
      id: nextId++,
      kind: "prompt",
      title: opts.title,
      body: opts.body,
      label: opts.label ?? "Name",
      defaultValue: opts.defaultValue ?? "",
      placeholder: opts.placeholder,
      maxLength: opts.maxLength ?? 100,
      confirmLabel: opts.confirmLabel ?? "Save",
      resolve,
    });
  });
}

export function alertDialog(body: string, title = "Something went wrong"): Promise<void> {
  if (hosts === 0) {
    window.alert(body);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    enqueue({ id: nextId++, kind: "alert", title, body, resolve });
  });
}
