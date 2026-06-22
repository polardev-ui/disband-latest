export type ReadCursorScope =
  | { kind: "channel"; id: string }
  | { kind: "dm"; id: string }
  | { kind: "group"; id: string };

function storageKey(scope: ReadCursorScope): string {
  return `disband:read:${scope.kind}:${scope.id}`;
}

export function getReadCursorAt(scope: ReadCursorScope): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: string };
    return parsed.at ?? null;
  } catch {
    return null;
  }
}

export function setReadCursor(
  scope: ReadCursorScope,
  messages: { id: string; created_at: string }[],
) {
  if (typeof localStorage === "undefined") return;
  const last = messages[messages.length - 1];
  if (!last) return;
  localStorage.setItem(
    storageKey(scope),
    JSON.stringify({ at: last.created_at, messageId: last.id }),
  );
}

/** Mark a chat read up to now (e.g. after sending a message). */
export function markChatReadNow(scope: ReadCursorScope) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    storageKey(scope),
    JSON.stringify({ at: new Date().toISOString() }),
  );
}

export function findNewMessagesDividerId(
  messages: { id: string; created_at: string }[],
  scope: ReadCursorScope,
): string | null {
  const readAt = getReadCursorAt(scope);
  if (!readAt) return null;
  const firstNew = messages.find((m) => m.created_at > readAt);
  return firstNew?.id ?? null;
}
