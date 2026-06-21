/**
 * Custom media API client.
 *
 * ALL image/video uploads in Disband go through this utility — never through
 * Supabase Storage. The returned `url` is what you persist in the
 * `media_posts.asset_url` column.
 *
 *   Endpoint: POST {MEDIA_API_URL}/images
 *   Payload:  FormData with a "file" field
 *   Response: { success: true, url: "...", key: "..." }
 */

const MEDIA_API_URL =
  process.env.NEXT_PUBLIC_MEDIA_API_URL ?? "https://api.wsgpolar.me/v1";

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
  /** Abort the request (e.g. on unmount or user cancel). */
  signal?: AbortSignal;
  /** Override the endpoint path; defaults to "images". */
  endpoint?: "images";
}

/**
 * Upload a single file to the custom media API and return its hosted URL + key.
 * Throws {@link MediaUploadError} on any non-success response.
 */
export async function uploadMedia(
  file: File,
  options: UploadMediaOptions = {},
): Promise<MediaUploadResult> {
  const { signal, endpoint = "images" } = options;

  if (!file) {
    throw new MediaUploadError("No file provided to uploadMedia().");
  }

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
      throw err; // let callers detect cancellation
    }
    throw new MediaUploadError(
      `Network error while uploading media: ${(err as Error).message}`,
    );
  }

  let data: MediaApiResponse | null = null;
  try {
    data = (await response.json()) as MediaApiResponse;
  } catch {
    // Non-JSON body — fall through to status-based error below.
  }

  if (!response.ok || !data?.success || !data.url) {
    const detail =
      data?.message || data?.error || `Upload failed (HTTP ${response.status})`;
    throw new MediaUploadError(detail, response.status);
  }

  return { url: data.url, key: data.key ?? "" };
}

/** Best-effort classification used to fill `media_posts.media_type`. */
export function inferMediaType(file: File): "image" | "video" {
  return file.type.startsWith("video/") ? "video" : "image";
}
