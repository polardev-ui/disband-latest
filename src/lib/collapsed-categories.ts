const STORAGE_KEY = "disband:collapsed-categories";

function readSet(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? new Set(parsed.filter((x): x is string => typeof x === "string")) : new Set();
  } catch {

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

  }
}

export const UNCATEGORIZED_KEY = "uncategorized";
