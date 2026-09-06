import type { AttachmentType } from "@/lib/messages";
import { PUBLIC_ENV } from "@/lib/public-env";
import { getSupabaseClient } from "@/lib/supabase/client";

// Uploads go to the CDN, which is a different service from the media API that
// still answers Giphy and link-preview requests.
const CDN_URL = PUBLIC_ENV.cdnUrl;

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

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

export function inferAttachmentType(file: File): AttachmentType {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "image";
  return "file";
}

export async function uploadMedia(
  file: File,
  options: UploadMediaOptions = {},
): Promise<MediaUploadResult> {
  const { signal, onProgress, maxUploadBytes = 50 * 1024 * 1024 } = options;

  if (!file) {
    throw new MediaUploadError("No file provided to uploadMedia().");
  }
  if (file.size > maxUploadBytes) {
    throw new MediaUploadError(`File is too large (max ${maxUploadBytes / (1024 * 1024)} MB).`);
  }

  // The CDN only accepts uploads from a signed-in user, so the bucket cannot
  // be used as free storage by anyone who finds the endpoint.
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
        // Non-JSON response
      }

      if (xhr.status >= 200 && xhr.status < 300 && data?.url) {
        if (!data.url.startsWith("https://")) {
          reject(new MediaUploadError("Upload returned an invalid URL (only https:// is allowed)."));
          return;
        }
        resolve({ url: data.url, key: data.key ?? "" });
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

export function inferMediaType(file: File): "image" | "video" {
  return file.type.startsWith("video/") ? "video" : "image";
}
