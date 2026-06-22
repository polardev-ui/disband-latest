import type { UserStatus, ViewMode } from "@/lib/supabase/types";

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
      if (focus.viewMode === "server" && focus.activeChannelId === target.channelId) {
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

/** True when the tab/window is not actively focused (background tab, minimized, another app on top). */
export function isAppInBackground(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "hidden" || !document.hasFocus();
}

export function isRecipientDoNotDisturb(
  profile: { status?: UserStatus; preferred_status?: UserStatus | null } | null | undefined,
): boolean {
  if (!profile) return false;
  return profile.status === "dnd" || profile.preferred_status === "dnd";
}

/** Discord-style mention ping via Web Audio API. */
export function playMentionPing() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
    setTimeout(() => void ctx.close(), 500);
  } catch {
    // Audio not available
  }
}

/** Two-tone bing for incoming DMs. */
export function playDmPing() {
  try {
    const ctx = new AudioContext();
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.12, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.start(start);
      osc.stop(start + duration);
    };
    const t = ctx.currentTime;
    playTone(880, t, 0.1);
    playTone(1174.66, t + 0.08, 0.22);
    setTimeout(() => void ctx.close(), 500);
  } catch {
    // Audio not available
  }
}

/**
 * DM alert when the app is in the background — plays even if that DM is already open.
 * Skipped when the recipient is on DND or the app/window is focused.
 */
export function alertIncomingDm(
  title: string,
  body: string | undefined,
  recipient: { status?: UserStatus; preferred_status?: UserStatus | null } | null | undefined,
) {
  if (isRecipientDoNotDisturb(recipient)) return;
  if (!isAppInBackground()) return;
  playDmPing();
  showSystemNotification(title, body);
}

/** Only call from a click/tap handler — browsers reject permission prompts otherwise. */
export async function requestNotificationPermissionFromGesture(): Promise<boolean> {
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

export function showSystemNotification(title: string, body?: string, onClick?: () => void) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const n = new Notification(title, {
    body,
    icon: "/favicon.ico",
    tag: `${title}:${body ?? ""}`,
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
  if (target && !shouldShowNotification(focusState, target)) return;
  showSystemNotification(title, body);
}
