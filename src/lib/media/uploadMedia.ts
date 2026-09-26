import { PUBLIC_ENV } from "@/lib/public-env";
import { getSupabaseClient } from "@/lib/supabase/client";

const CDN_URL = PUBLIC_ENV.cdnUrl;

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

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

export async function uploadMedia(
  file: File,
  options: UploadMediaOptions = {},
): Promise<MediaUploadResult> {
  const { signal, onProgress, maxUploadBytes = MAX_UPLOAD_BYTES } = options;

  if (!file) {
    throw new MediaUploadError("No file provided to uploadMedia().");
  }
  if (file.size > maxUploadBytes) {
    throw new MediaUploadError(`File is too large (max ${maxUploadBytes / (1024 * 1024)} MB).`);
  }

  const { data } = await getSupabaseClient().auth.getSession();
  const token = data.session?.access_token ?? null;

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
