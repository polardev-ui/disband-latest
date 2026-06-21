/**
 * Custom media API client.
 *
 * Image/video uploads use POST {MEDIA_API_URL}/images
 * Generic files use POST {MEDIA_API_URL}/files
 */

import type { AttachmentType } from "@/lib/messages";

const MEDIA_API_URL =
  process.env.NEXT_PUBLIC_MEDIA_API_URL ?? "https://api.wsgpolar.me/v1";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export interface MediaUploadResult {
  url: string;
  key: string;
}

interface MediaApiResponse {
  success: boolean;
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
  endpoint?: "images" | "files";
}

export function inferAttachmentType(file: File): AttachmentType {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "image";
  return "file";
}

function endpointForFile(file: File, override?: "images" | "files"): "images" | "files" {
  if (override) return override;
  return inferAttachmentType(file) === "file" ? "files" : "images";
}

export async function uploadMedia(
  file: File,
  options: UploadMediaOptions = {},
): Promise<MediaUploadResult> {
  const { signal, endpoint: endpointOverride } = options;

  if (!file) {
    throw new MediaUploadError("No file provided to uploadMedia().");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new MediaUploadError(`File is too large (max ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB).`);
  }

  const endpoint = endpointForFile(file, endpointOverride);
  const formData = new FormData();
  formData.append("file", file);

  let response: Response;
  try {
    response = await fetch(`${MEDIA_API_URL}/${endpoint}`, {
      method: "POST",
      body: formData,
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    throw new MediaUploadError(
      `Network error while uploading: ${(err as Error).message}`,
    );
  }

  let data: MediaApiResponse | null = null;
  try {
    data = (await response.json()) as MediaApiResponse;
  } catch {
    // Non-JSON body
  }

  if (!response.ok || !data?.success || !data.url) {
    const detail =
      data?.message || data?.error || `Upload failed (HTTP ${response.status})`;
    throw new MediaUploadError(detail, response.status);
  }

  return { url: data.url, key: data.key ?? "" };
}

/** @deprecated use inferAttachmentType */
export function inferMediaType(file: File): "image" | "video" {
  return file.type.startsWith("video/") ? "video" : "image";
}
