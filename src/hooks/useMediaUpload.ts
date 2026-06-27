"use client";

import { useCallback, useRef, useState } from "react";
import {
  MediaUploadError,
  uploadMedia,
  type MediaUploadResult,
  type UploadProgress,
} from "@/lib/media/uploadMedia";

export type UploadStatus = "idle" | "uploading" | "success" | "error";

export interface UploadEntry {
  id: string;
  file: File;
  localUrl: string;
  status: UploadStatus;
  progress: UploadProgress | null;
  result: MediaUploadResult | null;
  error: string | null;
}

export interface MediaUploadPromise {
  id: string;
  result: Promise<MediaUploadResult | null>;
}

export interface UseMediaUploadReturn {
  entries: UploadEntry[];
  isUploading: boolean;
  add: (file: File) => string;
  upload: (file: File) => Promise<MediaUploadResult | null>;
  remove: (id: string) => void;
  clearCompleted: () => void;
  cancelAll: () => void;
}

let nextId = 0;

export function useMediaUpload(): UseMediaUploadReturn {
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const pendingRef = useRef<Map<string, boolean>>(new Map());
  const resolversRef = useRef<Map<string, { resolve: (r: MediaUploadResult | null) => void }>>(new Map());

  const add = useCallback((file: File): string => {
    const id = `up-${++nextId}`;
    const localUrl = URL.createObjectURL(file);

    setEntries((prev) => [
      ...prev,
      { id, file, localUrl, status: "uploading", progress: null, result: null, error: null },
    ]);

    pendingRef.current.set(id, true);

    uploadMedia(file, {
      onProgress: (progress) => {
        setEntries((prev) =>
          prev.map((e) => (e.id === id ? { ...e, progress } : e)),
        );
      },
    })
      .then((result) => {
        pendingRef.current.delete(id);
        setEntries((prev) =>
          prev.map((e) =>
            e.id === id ? { ...e, status: "success", result, progress: null } : e,
          ),
        );
        resolversRef.current.get(id)?.resolve(result);
        resolversRef.current.delete(id);
      })
      .catch((err) => {
        pendingRef.current.delete(id);
        if (err instanceof DOMException && err.name === "AbortError") {
          setEntries((prev) => prev.filter((e) => e.id !== id));
          resolversRef.current.get(id)?.resolve(null);
          resolversRef.current.delete(id);
          return;
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
        resolversRef.current.get(id)?.resolve(null);
        resolversRef.current.delete(id);
      });

    return id;
  }, []);

  const upload = useCallback((file: File): Promise<MediaUploadResult | null> => {
    return new Promise((resolve) => {
      const id = add(file);
      resolversRef.current.set(id, { resolve });
    });
  }, [add]);

  const remove = useCallback((id: string) => {
    const entry = entries.find((e) => e.id === id);
    if (entry) URL.revokeObjectURL(entry.localUrl);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, [entries]);

  const clearCompleted = useCallback(() => {
    for (const e of entries) {
      if (e.status !== "uploading") URL.revokeObjectURL(e.localUrl);
    }
    setEntries((prev) => prev.filter((e) => e.status === "uploading"));
  }, [entries]);

  const cancelAll = useCallback(() => {
    for (const e of entries) {
      URL.revokeObjectURL(e.localUrl);
    }
    setEntries([]);
  }, [entries]);

  const isUploading = entries.some((e) => e.status === "uploading");

  return { entries, isUploading, add, upload, remove, clearCompleted, cancelAll };
}
