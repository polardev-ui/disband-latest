const STORAGE_KEY = "disband:collapsed-categories";

/**
 * Which channel categories are collapsed.
 *
 * Collapsing was already in the sidebar but lived only in component state, so
 * it was undone by every reload and by switching servers and back — which made
 * it useless for its actual purpose, permanently hiding sections of a server
 * you don't follow. Keyed by category id, which is unique across servers.
 */
function readSet(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? new Set(parsed.filter((x): x is string => typeof x === "string")) : new Set();
  } catch {
    // Corrupt or unavailable storage: start expanded rather than throwing.
    return new Set();
  }
}

export function getCollapsedCategories(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const id of readSet()) out[id] = true;
  return out;
}

export function setCategoryCollapsed(categoryId: string, collapsed: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    const set = readSet();
    if (collapsed) set.add(categoryId);
    else set.delete(categoryId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // Private browsing with storage blocked: the toggle still works for this
    // session, it just will not be remembered.
  }
}

/** Key used for the implicit "Uncategorized" group, which has no row of its own. */
export const UNCATEGORIZED_KEY = "uncategorized";
