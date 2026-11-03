import { PUBLIC_ENV } from "@/lib/public-env";
import { getSupabaseClient } from "@/lib/supabase/client";

const CDN_URL = PUBLIC_ENV.cdnUrl;

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
// Cloudflare caps one request body at 100 MB, so anything bigger than this
// goes up in parts (the CDN's /v1/uploads). Aero's 500 MB depends on it.
const SINGLE_REQUEST_BYTES = 90 * 1024 * 1024;

export function isTrustedUploadUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const result = new URL(value);
    const cdn = new URL(CDN_URL);
    const imagePath = `${cdn.pathname.replace(/\/$/, "")}/images/`;
    const key = result.pathname.startsWith(imagePath)
      ? result.pathname.slice(imagePath.length)
      : "";
    const validKey = /^[0-9a-f-]{36}\.[a-z0-9]+$/i.test(key)
      || /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]+$/i.test(key);
    return result.protocol === "https:"
      && result.origin === cdn.origin
      && !result.username && !result.password
      && !result.search && !result.hash
      && validKey;
  } catch {
    return false;
  }
}

export interface MediaUploadResult {
  url: string;
  key: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

interface MediaApiResponse {
  url?: string;
  key?: string;
  message?: string;
  error?: string;
}

export class MediaUploadError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "MediaUploadError";
  }
}

export interface UploadMediaOptions {
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
  maxUploadBytes?: number;
}

/**
 * HEIC/HEIF (iPhone photos) only display on Apple devices. Where this browser
 * can decode one (Safari, and the macOS desktop app), it's re-encoded as JPEG
 * before upload. Where it can't (Chrome), it goes up as it is and the CDN
 * serves it as JPEG instead.
 */
export async function toWebSafeImage(file: File): Promise<File> {
  const isHeic = /^image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
  if (!isHeic || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) return file;
    const name = `${file.name.replace(/\.[^.]+$/, "") || "image"}.jpg`;
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}

export async function uploadMedia(
  input: File,
  options: UploadMediaOptions = {},
): Promise<MediaUploadResult> {
  const { signal, onProgress, maxUploadBytes = MAX_UPLOAD_BYTES } = options;

  if (!input) {
    throw new MediaUploadError("No file provided to uploadMedia().");
  }
  const file = await toWebSafeImage(input);
  if (file.size > maxUploadBytes) {
    throw new MediaUploadError(`File is too large (max ${maxUploadBytes / (1024 * 1024)} MB).`);
  }

  const { data } = await getSupabaseClient().auth.getSession();
  const token = data.session?.access_token ?? null;

  if (file.size > SINGLE_REQUEST_BYTES) {
    return uploadInParts(file, token, { signal, onProgress });
  }

  return new Promise<MediaUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress({
          loaded: event.loaded,
          total: event.total,
          percent: Math.round((event.loaded / event.total) * 100),
        });
      }
    };

    xhr.onload = () => {
      let data: MediaApiResponse | null = null;
      try {
        data = JSON.parse(xhr.responseText) as MediaApiResponse;
      } catch {

      }

      if (xhr.status >= 200 && xhr.status < 300 && data?.url) {
        if (!isTrustedUploadUrl(data.url)) {
          reject(new MediaUploadError("Upload returned an invalid CDN URL."));
          return;
        }
        resolve({ url: data.url, key: typeof data.key === "string" ? data.key : "" });
      } else {
        const detail =
          data?.message || data?.error || `Upload failed (HTTP ${xhr.status})`;
        reject(new MediaUploadError(detail, xhr.status));
      }
    };

    xhr.onerror = () => {
      reject(new MediaUploadError("Network error while uploading."));
    };

    xhr.onabort = () => {
      reject(new DOMException("Upload aborted", "AbortError"));
    };

    if (signal) {
      signal.addEventListener("abort", () => xhr.abort());
    }

    xhr.open("POST", `${CDN_URL}/images`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(formData);
  });
}

async function cdnJson<T>(path: string, token: string | null, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${CDN_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new MediaUploadError("Network error while uploading.");
  }
  const data = (await res.json().catch(() => null)) as (T & MediaApiResponse) | null;
  if (!res.ok || !data) {
    throw new MediaUploadError(data?.error ?? `Upload failed (HTTP ${res.status})`, res.status);
  }
  return data;
}

/** One part, over XHR so the progress bar keeps moving within it. */
function sendPart(
  url: string,
  token: string | null,
  blob: Blob,
  onBytes: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<{ partNumber: number; etag: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (event) => onBytes(event.loaded);
    xhr.onload = () => {
      let data: { partNumber?: number; etag?: string; error?: string } | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {

      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.etag && data.partNumber) {
        resolve({ partNumber: data.partNumber, etag: data.etag });
      } else {
        reject(new MediaUploadError(data?.error ?? `Upload failed (HTTP ${xhr.status})`, xhr.status));
      }
    };
    xhr.onerror = () => reject(new MediaUploadError("Network error while uploading."));
    xhr.onabort = () => reject(new DOMException("Upload aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.open("PUT", url);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(blob);
  });
}

/**
 * Large files: start an upload, send it in the CDN's part size one piece at
 * a time, then finish. The CDN runs the same checks on the whole file at the
 * end as it does for a normal upload. A failed or cancelled upload is
 * abandoned on the CDN so it doesn't linger.
 */
async function uploadInParts(
  file: File,
  token: string | null,
  { signal, onProgress }: Pick<UploadMediaOptions, "signal" | "onProgress">,
): Promise<MediaUploadResult> {
  const { key, uploadId, partBytes } = await cdnJson<{ key: string; uploadId: string; partBytes: number }>(
    "/uploads",
    token,
    { name: file.name, type: file.type, size: file.size },
    signal,
  );

  const parts: { partNumber: number; etag: string }[] = [];
  try {
    for (let offset = 0, partNumber = 1; offset < file.size; offset += partBytes, partNumber++) {
      const blob = file.slice(offset, Math.min(offset + partBytes, file.size));
      const url = `${CDN_URL}/uploads/part?key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&part=${partNumber}`;
      const done = offset;
      parts.push(await sendPart(url, token, blob, (loaded) => {
        onProgress?.({
          loaded: done + loaded,
          total: file.size,
          percent: Math.min(99, Math.round(((done + loaded) / file.size) * 100)),
        });
      }, signal));
    }
    const result = await cdnJson<MediaApiResponse>("/uploads/complete", token, { key, uploadId, parts }, signal);
    if (!result.url || !isTrustedUploadUrl(result.url)) {
      throw new MediaUploadError("Upload returned an invalid CDN URL.");
    }
    onProgress?.({ loaded: file.size, total: file.size, percent: 100 });
    return { url: result.url, key: result.key ?? "" };
  } catch (err) {
    void cdnJson("/uploads/abort", token, { key, uploadId }).catch(() => undefined);
    throw err;
  }
}

/**
 * Import an image by URL: the CDN fetches it (a catbox.moe link, a direct
 * PNG off someone's site) and stores its own copy, returning the same
 * `{ url, key }` shape as an upload.
 *
 * The worker enforces the SSRF guard, so the client only checks that the
 * input is an https URL and that the answer is a trusted CDN URL. There are
 * no upload-progress events — the bytes travel server-to-server, and the
 * request simply takes as long as the remote host needs.
 */
export async function importMediaFromUrl(
  sourceUrl: string,
  options: { signal?: AbortSignal } = {},
): Promise<MediaUploadResult> {
  let parsed: URL;
  try {
    parsed = new URL(String(sourceUrl).trim());
  } catch {
    throw new MediaUploadError("That doesn't look like a link.");
  }
  if (parsed.protocol !== "https:") {
    throw new MediaUploadError("Import needs a direct https:// image link.");
  }

  const { data: sessionData } = await getSupabaseClient().auth.getSession();
  const token = sessionData.session?.access_token ?? null;
  if (!token) throw new MediaUploadError("Sign in to import images.", 401);

  let res: Response;
  try {
    res = await fetch(`${CDN_URL}/images/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url: parsed.toString() }),
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new MediaUploadError("Network error while importing.");
  }

  const body = (await res.json().catch(() => null)) as MediaApiResponse | null;
  if (!res.ok || !body?.url) {
    throw new MediaUploadError(body?.error ?? `Import failed (HTTP ${res.status}).`, res.status);
  }
  if (!isTrustedUploadUrl(body.url)) {
    throw new MediaUploadError("Import returned an invalid CDN URL.");
  }
  return { url: body.url, key: typeof body.key === "string" ? body.key : "" };
}
