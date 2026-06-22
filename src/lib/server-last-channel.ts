const STORAGE_KEY = "disband:last-channel";

function readMap(): Record<string, string> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, string>) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getLastChannelId(serverId: string): string | null {
  return readMap()[serverId] ?? null;
}

export function setLastChannelId(serverId: string, channelId: string) {
  const map = readMap();
  map[serverId] = channelId;
  writeMap(map);
}
