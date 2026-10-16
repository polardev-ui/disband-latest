import type { UserStatus, ViewMode } from "@/lib/supabase/types";
import { getUserSettings } from "@/lib/user-settings";
import { isTauri } from "@/lib/platform";

export type NotificationTarget =
  | { kind: "channel"; channelId: string }
  | { kind: "dm"; threadId: string }
  | { kind: "group"; groupId: string }
  | { kind: "call"; peerId: string };

export interface NotificationFocusState {
  viewMode: ViewMode;
  activeServerId: string | null;
  activeChannelId: string | null;
  activeDmThreadId: string | null;
  activeGroupChatId: string | null;
  voiceJoinedChannelId: string | null;
  callPhase: "idle" | "outgoing" | "incoming" | "active";
}

const defaultFocus: NotificationFocusState = {
  viewMode: "home",
  activeServerId: null,
  activeChannelId: null,
  activeDmThreadId: null,
  activeGroupChatId: null,
  voiceJoinedChannelId: null,
  callPhase: "idle",
};

let focusState: NotificationFocusState = defaultFocus;

export function setNotificationFocusState(state: NotificationFocusState) {
  focusState = state;
}

export function parseNotificationLink(link: string | null): NotificationTarget | null {
  if (!link) return null;
  if (link.startsWith("channel:")) return { kind: "channel", channelId: link.slice(8) };
  if (link.startsWith("dm:")) return { kind: "dm", threadId: link.slice(3) };
  if (link.startsWith("group:")) return { kind: "group", groupId: link.slice(6) };
  return null;
}

export function shouldShowNotification(
  focus: NotificationFocusState,
  target: NotificationTarget,
): boolean {
  switch (target.kind) {
    case "channel":
      if (focus.voiceJoinedChannelId === target.channelId) return false;
      if (focus.viewMode === "space" && focus.activeChannelId === target.channelId) {
        return false;
      }
      return true;
    case "dm":
      return !(focus.viewMode === "dm" && focus.activeDmThreadId === target.threadId);
    case "group":
      return !(focus.viewMode === "group" && focus.activeGroupChatId === target.groupId);
    case "call":
      return focus.callPhase === "idle";
  }
}

export function isAppInBackground(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "hidden" || !document.hasFocus();
}

function shouldDeliverOsNotification(target?: NotificationTarget): boolean {
  if (!target) return true;
  if (shouldShowNotification(focusState, target)) return true;
  return isAppInBackground();
}

export function isRecipientDoNotDisturb(
  profile: { status?: UserStatus; preferred_status?: UserStatus | null } | null | undefined,
): boolean {
  if (!profile) return false;
  return profile.status === "dnd" || profile.preferred_status === "dnd";
}

const NOTIFICATION_POP_URL = "/sounds/notificationpop.mp3";
const POP_VOLUME = 0.85;

/*
 The notification pop is the one sound every notification makes, on every
 platform. iOS and Android get it from the push itself (`notificationpop.caf`
 / the channel sound); here it covers desktop and web.

 Why it used to play only some of the time:
  - The AudioContext was created at import, before any user gesture, so it
    started suspended and was only ever unlocked by the *first* click — a
    context the browser suspended later (Safari does on hide) stayed silent.
  - On macOS the desktop webview throttles audio while the window is in the
    background, which is exactly when notifications arrive. The desktop app
    now plays the pop natively there (`play_notification_sound`).
*/

let popContext: AudioContext | null = null;
let popBuffer: AudioBuffer | null = null;
let popBufferLoad: Promise<AudioBuffer | null> | null = null;
let popElement: HTMLAudioElement | null = null;

function audioContextFor(): AudioContext | null {
  if (popContext) return popContext;
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    popContext = new Ctor({ latencyHint: "interactive" });
  } catch {
    return null;
  }
  return popContext;
}

function loadPopBuffer(ctx: AudioContext): Promise<AudioBuffer | null> {
  if (popBuffer) return Promise.resolve(popBuffer);
  popBufferLoad ??= (async () => {
    const response = await fetch(NOTIFICATION_POP_URL);
    if (!response.ok) throw new Error("notification sound missing");
    popBuffer = await ctx.decodeAudioData(await response.arrayBuffer());
    return popBuffer;
  })().catch(() => {
    popBufferLoad = null;
    return null;
  });
  return popBufferLoad;
}

/** Wake (or create) the pop's audio graph. Safe to call on every gesture. */
function primePop() {
  const ctx = audioContextFor();
  if (!ctx) return;
  if (ctx.state !== "running") void ctx.resume().catch(() => undefined);
  void loadPopBuffer(ctx);
}

// Every gesture re-arms the context, not just the first: browsers suspend it
// again later (Safari on hide, Chrome after long idle), and a context that is
// only unlocked once eventually goes quiet for good.
if (typeof window !== "undefined") {
  const arm = () => primePop();
  window.addEventListener("pointerdown", arm, { capture: true, passive: true });
  window.addEventListener("keydown", arm, { capture: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && popContext) arm();
  });
}

async function playNativePop(): Promise<boolean> {
  if (!isTauri() || !isMacOsDesktop()) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("play_notification_sound");
    return true;
  } catch {
    return false;
  }
}

async function playWebPop(): Promise<boolean> {
  const ctx = audioContextFor();
  if (ctx) {
    try {
      if (ctx.state !== "running") await ctx.resume();
      const buffer = await loadPopBuffer(ctx);
      if (buffer && ctx.state === "running") {
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        gain.gain.value = POP_VOLUME;
        source.buffer = buffer;
        source.connect(gain).connect(ctx.destination);
        source.start();
        return true;
      }
    } catch {
      // Fall through to the media element.
    }
  }
  try {
    popElement ??= Object.assign(new Audio(NOTIFICATION_POP_URL), { preload: "auto", volume: POP_VOLUME });
    popElement.currentTime = 0;
    await popElement.play();
    return true;
  } catch {
    return false;
  }
}

/**
 * The notification pop. Native on the macOS desktop app, Web Audio elsewhere.
 * Returns false only when nothing could play (sound off, or the browser has
 * not had a user gesture yet).
 */
export async function playNotificationPop(): Promise<boolean> {
  if (typeof window === "undefined" || !getUserSettings().soundEnabled) return false;
  if (await playNativePop()) return true;
  return playWebPop();
}

/** Mentions and DMs share the one pop, so every notification sounds the same. */
export async function playMentionPing() {
  await playNotificationPop();
}

export async function playDmPing() {
  await playNotificationPop();
}

function notificationTag(target?: NotificationTarget, prefix = "disband"): string | undefined {
  if (!target) return undefined;
  switch (target.kind) {
    case "channel":
      return `${prefix}-channel-${target.channelId}`;
    case "dm":
      return `${prefix}-dm-${target.threadId}`;
    case "group":
      return `${prefix}-group-${target.groupId}`;
    case "call":
      return `${prefix}-call-${target.peerId}`;
  }
}

export function alertIncomingDm(
  title: string,
  body: string | undefined,
  recipient: { status?: UserStatus; preferred_status?: UserStatus | null } | null | undefined,
  threadId: string,
) {
  if (isRecipientDoNotDisturb(recipient)) return;
  const target = { kind: "dm" as const, threadId };
  if (!shouldDeliverOsNotification(target)) return;
  if (getUserSettings().soundEnabled) void playDmPing();
  showSystemNotification(title, body, undefined, notificationTag(target));
}

export function alertMention(
  title: string,
  body: string | undefined,
  target: NotificationTarget,
) {
  if (!shouldDeliverOsNotification(target)) return;
  void playMentionPing();
  showSystemNotification(title, body, undefined, notificationTag(target, "mention"));
}

async function ensureNativeNotificationPermission(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const {
      isPermissionGranted,
      requestPermission,
    } = await import("@tauri-apps/plugin-notification");
    let granted = await isPermissionGranted();
    if (!granted) {
      const result = await requestPermission();
      granted = result === "granted";
    }
    return granted;
  } catch {
    return false;
  }
}

function isMacOsDesktop(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac/i.test(navigator.platform || navigator.userAgent);
}

async function sendMacOsNativeNotification(title: string, body?: string): Promise<boolean> {
  if (!isTauri() || !isMacOsDesktop()) return false;
  try {
    const granted = await ensureNativeNotificationPermission();
    if (!granted) return false;
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("show_macos_notification", { title, body: body ?? null });
    return true;
  } catch {
    return false;
  }
}

async function sendNativeNotification(title: string, body?: string): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const macSent = await sendMacOsNativeNotification(title, body);
    if (macSent) return true;

    const granted = await ensureNativeNotificationPermission();
    if (!granted) return false;
    const { sendNotification } = await import("@tauri-apps/plugin-notification");
    sendNotification({ title, body });
    return true;
  } catch {
    return false;
  }
}

export async function requestNotificationPermissionFromGesture(): Promise<boolean> {
  if (isTauri()) {
    return ensureNativeNotificationPermission();
  }
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

export async function primeNotificationPermission(): Promise<void> {
  if (typeof window === "undefined") return;
  if (Notification.permission === "denied") return;
  await requestNotificationPermissionFromGesture();
}

export function showSystemNotification(
  title: string,
  body?: string,
  onClick?: () => void,
  tag?: string,
) {
  if (typeof window === "undefined") return;
  if (!getUserSettings().desktopNotificationsEnabled) return;

  if (isTauri()) {
    void sendNativeNotification(title, body).then((sent) => {
      if (sent) return;
      showWebNotification(title, body, onClick, tag);
    });
    return;
  }

  showWebNotification(title, body, onClick, tag);
}

function showWebNotification(
  title: string,
  body?: string,
  onClick?: () => void,
  tag?: string,
) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const icon =
    window.location.origin.startsWith("http")
      ? `${window.location.origin}/favicon.png`
      : "/favicon.png";

  const n = new Notification(title, {
    body,
    icon,
    tag: tag ?? `disband:${title}:${body ?? ""}`,
    silent: true,
  });
  if (onClick) {
    n.onclick = () => {
      window.focus();
      onClick();
      n.close();
    };
  }
}

export function notifyUser(title: string, body?: string, target?: NotificationTarget) {
  if (target && !shouldDeliverOsNotification(target)) return;
  // Calls have their own ringtone; everything else gets the pop.
  if (target?.kind !== "call") void playNotificationPop();
  showSystemNotification(title, body, undefined, notificationTag(target));
}
