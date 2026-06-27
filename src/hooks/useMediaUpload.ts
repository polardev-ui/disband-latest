"use client";

import { useCallback, useRef, useState } from "react";
import {
  MediaUploadError,
  uploadMedia,
  type MediaUploadResult,
  type UploadProgress,
} from "@/lib/media/uploadMedia";

export type UploadStatus = "queued" | "uploading" | "success" | "error";

export interface UploadEntry {
  id: string;
  file: File;
  localUrl: string;
  status: UploadStatus;
  progress: UploadProgress | null;
  result: MediaUploadResult | null;
  error: string | null;
}

export interface UseMediaUploadReturn {
  entries: UploadEntry[];
  isUploading: boolean;
  queuedCount: number;
  add: (file: File) => string;
  upload: (file: File) => Promise<MediaUploadResult | null>;
  remove: (id: string) => void;
  clear: () => void;
  uploadAll: () => Promise<Map<string, MediaUploadResult>>;
  cancelAll: () => void;
}

let nextId = 0;

export function useMediaUpload(): UseMediaUploadReturn {
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const abortsRef = useRef<Map<string, AbortController>>(new Map());

  const add = useCallback((file: File): string => {
    const id = `up-${++nextId}`;
    const localUrl = URL.createObjectURL(file);

    setEntries((prev) => [
      ...prev,
      { id, file, localUrl, status: "queued", progress: null, result: null, error: null },
    ]);

    return id;
  }, []);

  const remove = useCallback((id: string) => {
    setEntries((prev) => {
      const entry = prev.find((e) => e.id === id);
      if (entry) URL.revokeObjectURL(entry.localUrl);
      return prev.filter((e) => e.id !== id);
    });
    abortsRef.current.get(id)?.abort();
    abortsRef.current.delete(id);
  }, []);

  const clear = useCallback(() => {
    for (const e of entries) {
      URL.revokeObjectURL(e.localUrl);
    }
    for (const [id, ctrl] of abortsRef.current) {
      ctrl.abort();
    }
    abortsRef.current.clear();
    setEntries([]);
  }, [entries]);

  const uploadAll = useCallback(async (): Promise<Map<string, MediaUploadResult>> => {
    const results = new Map<string, MediaUploadResult>();

    const pending = entries.filter((e) => e.status === "queued");
    if (pending.length === 0) return results;

    setEntries((prev) =>
      prev.map((e) =>
        e.status === "queued" ? { ...e, status: "uploading" as const } : e,
      ),
    );

    const uploads = pending.map((entry) => {
      const ctrl = new AbortController();
      abortsRef.current.set(entry.id, ctrl);

      return uploadMedia(entry.file, {
        signal: ctrl.signal,
        onProgress: (progress) => {
          setEntries((prev) =>
            prev.map((e) => (e.id === entry.id ? { ...e, progress } : e)),
          );
        },
      })
        .then((result) => {
          abortsRef.current.delete(entry.id);
          results.set(entry.id, result);
          setEntries((prev) =>
            prev.map((e) =>
              e.id === entry.id ? { ...e, status: "success" as const, result, progress: null } : e,
            ),
          );
        })
        .catch((err) => {
          abortsRef.current.delete(entry.id);
          if (err instanceof DOMException && err.name === "AbortError") {
            setEntries((prev) => prev.filter((e) => e.id !== entry.id));
            return;
          }
          const message =
            err instanceof MediaUploadError
              ? err.message
              : "Unexpected error during upload.";
          setEntries((prev) =>
            prev.map((e) =>
              e.id === entry.id ? { ...e, status: "error" as const, error: message, progress: null } : e,
            ),
          );
        });
    });

    await Promise.allSettled(uploads);
    return results;
  }, [entries]);

  const cancelAll = useCallback(() => {
    for (const [id, ctrl] of abortsRef.current) {
      ctrl.abort();
    }
    abortsRef.current.clear();
    for (const e of entries) {
      URL.revokeObjectURL(e.localUrl);
    }
    setEntries([]);
  }, [entries]);

  const isUploading = entries.some((e) => e.status === "uploading");
  const queuedCount = entries.filter((e) => e.status === "queued").length;

  const upload = useCallback(async (file: File): Promise<MediaUploadResult | null> => {
    const id = `up-${++nextId}`;
    const localUrl = URL.createObjectURL(file);

    setEntries((prev) => [
      ...prev,
      { id, file, localUrl, status: "uploading", progress: null, result: null, error: null },
    ]);

    try {
      const ctrl = new AbortController();
      abortsRef.current.set(id, ctrl);

      const result = await uploadMedia(file, {
        signal: ctrl.signal,
        onProgress: (progress) => {
          setEntries((prev) =>
            prev.map((e) => (e.id === id ? { ...e, progress } : e)),
          );
        },
      });

      abortsRef.current.delete(id);
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, status: "success", result, progress: null } : e,
        ),
      );
      return result;
    } catch (err) {
      abortsRef.current.delete(id);
      if (err instanceof DOMException && err.name === "AbortError") {
        setEntries((prev) => prev.filter((e) => e.id !== id));
        return null;
      }
      const message =
        err instanceof MediaUploadError
          ? err.message
          : "Unexpected error during upload.";
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, status: "error", error: message, progress: null } : e,
        ),
      );
      return null;
    }
  }, []);

  return { entries, isUploading, queuedCount, add, upload, remove, clear, uploadAll, cancelAll };
}
