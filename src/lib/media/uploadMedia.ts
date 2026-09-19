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
    return result.protocol === "https:"
      && result.origin === cdn.origin
      && !result.username && !result.password
      && !result.search && !result.hash
      && !!key && !key.includes("..") && /^[a-zA-Z0-9._-]+$/.test(key);
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
