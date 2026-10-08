import { isSafeUrl, safeDownload } from "@/lib/safe-url";

/**
 * Right-click actions for media, done by hand because the desktop app's
 * webview ships with the native context menu turned off.
 */

async function toPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), "image/png"),
  );
}

/**
 * Puts the image on the clipboard as PNG (the one image type every clipboard
 * accepts). The ClipboardItem is built synchronously around a promise: Safari
 * and the macOS webview drop the user gesture across an `await`, so fetching
 * first and writing after would be refused there.
 */
export async function copyImageToClipboard(url: string): Promise<void> {
  if (!isSafeUrl(url)) throw new Error("Unsupported image address");
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    throw new Error("Copying images isn't supported here");
  }
  const png = fetch(url, { mode: "cors" })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.blob();
    })
    .then(toPng);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

/**
 * Saves with the right file name. A cross-origin `<a download>` is ignored by
 * browsers (it just opens the file), so the bytes are fetched into a local
 * object URL first; if that's blocked, fall back to the plain link.
 */
export async function saveMedia(url: string, fileName: string): Promise<void> {
  if (!isSafeUrl(url)) return;
  try {
    const r = await fetch(url, { mode: "cors" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const objectUrl = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  } catch {
    safeDownload(url, fileName);
  }
}
