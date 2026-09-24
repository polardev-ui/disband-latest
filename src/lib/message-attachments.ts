import { uploadMedia } from "@/lib/media/uploadMedia";

/** One attachment as it is stored in the `attachments` jsonb column. */
export interface StoredAttachment {
  url: string;
  key?: string | null;
  type: "image" | "video" | "audio" | "file" | "gif";
  name?: string | null;
  size?: number | null;
}

/** The ceiling the composer enforces, matching the database constraint. */
export const MAX_ATTACHMENTS = 10;

export function attachmentKind(file: File): StoredAttachment["type"] {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
}

/**
 * Upload every staged file and return them in order.
 *
 * Sequential rather than parallel: ten concurrent uploads of phone-sized
 * photos saturate an ordinary connection and make every one of them slow,
 * and the progress number becomes meaningless. `onProgress` reports across
 * the whole set so the composer can show one bar rather than ten.
 *
 * Throws on the first failure, with the files uploaded so far attached, so
 * the caller can decide between rolling back and keeping what landed.
 */
export async function uploadAttachments(
  files: File[],
  opts: {
    maxUploadBytes?: number;
    onProgress?: (percent: number) => void;
  } = {},
): Promise<StoredAttachment[]> {
  const out: StoredAttachment[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const result = await uploadMedia(file, {
        maxUploadBytes: opts.maxUploadBytes,
        onProgress: (p) => {
          const overall = ((i + p.percent / 100) / files.length) * 100;
          opts.onProgress?.(Math.round(overall));
        },
      });
      out.push({
        url: result.url,
        key: result.key,
        type: attachmentKind(file),
        name: file.name,
        size: file.size,
      });
    } catch (err) {
      const failure = err instanceof Error ? err : new Error("Upload failed");
      (failure as Error & { uploaded?: StoredAttachment[] }).uploaded = out;
      throw failure;
    }
  }
  return out;
}

/**
 * The legacy single-attachment columns for a set.
 *
 * The iOS and Android clients read `attachment_url` and know nothing about
 * the `attachments` array, so the first attachment is mirrored into the old
 * columns and they keep showing something rather than an empty message.
 */
export function legacyColumns(attachments: StoredAttachment[]) {
  const first = attachments[0];
  return {
    attachment_url: first?.url ?? null,
    attachment_type: first?.type ?? null,
    attachment_key: first?.key ?? null,
    attachment_name: first?.name ?? null,
    attachment_size: first?.size ?? null,
  };
}

/** What a message carries, whichever column it came from. */
export function readAttachments(message: {
  attachments?: unknown;
  attachment_url?: string | null;
  attachment_type?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
}): StoredAttachment[] {
  if (Array.isArray(message.attachments) && message.attachments.length > 0) {
    return message.attachments as StoredAttachment[];
  }
  if (message.attachment_url) {
    return [
      {
        url: message.attachment_url,
        type: (message.attachment_type as StoredAttachment["type"]) ?? "file",
        name: message.attachment_name ?? null,
        size: message.attachment_size ?? null,
      },
    ];
  }
  return [];
}
