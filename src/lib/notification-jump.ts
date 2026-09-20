// Post-navigation unread seek for notification clicks (web UI revamp).
//
// Notification links carry only the conversation id (channel:/dm:/group:),
// never the message id, so we can't jump to the exact ping. The standard
// approximation — what Discord does — is landing on the first unread
// message, which is where the ping almost always sits.
//
// Flow: routeToNotification calls requestUnreadJump(kind, id) after a
// successful navigation; the ChatCanvas instance whose readCursorScope
// matches pages back until the divider message is in the DOM, jumps to it
// (with highlight), and clears the seek. Module-scoped (not React state)
// so it survives the remounts that navigation itself causes.

export interface UnreadSeek {
  kind: string;
  id: string;
  // Notification timestamp (server clock, same clock as message
  // created_at): land on the ping itself, not just the first unread.
  // Absent for old call sites → falls back to the unread divider.
  at?: string | null;
}

let seek: UnreadSeek | null = null;

export function requestUnreadJump(kind: string, id: string, at?: string | null) {
  seek = { kind, id, at: at ?? null };
}

export function isSeekingUnreadJump(kind: string, id: string): boolean {
  return seek !== null && seek.kind === kind && seek.id === id;
}

export function seekingTimestamp(): string | null {
  return seek?.at ?? null;
}

export function clearUnreadJump() {
  seek = null;
}
