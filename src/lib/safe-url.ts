const HTTPS_RE = /^https:\/\//i;

export function isSafeUrl(url: string): boolean {
  return HTTPS_RE.test(url);
}

export function assertSafeUrlScheme(url: string): void {
  if (!isSafeUrl(url)) {
    throw new Error("Blocked: only https:// URLs are allowed");
  }
}

export function safeDownload(url: string, fileName: string): void {
  if (!isSafeUrl(url)) return;
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener noreferrer";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function safeWindowOpen(url: string): void {
  if (!isSafeUrl(url)) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function safeImageUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  if (!isSafeUrl(url)) return null;
  return url;
}
