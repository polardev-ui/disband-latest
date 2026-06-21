"use client";

import { useCallback, useRef, useState } from "react";
import {
  inferMediaType,
  MediaUploadError,
  uploadMedia,
  type MediaUploadResult,
} from "@/lib/media/uploadMedia";

export type UploadStatus = "idle" | "uploading" | "success" | "error";

export interface UseMediaUploadState {
  status: UploadStatus;
  isUploading: boolean;
  error: string | null;
  result: MediaUploadResult | null;
}

export interface UseMediaUploadReturn extends UseMediaUploadState {
  /** Upload a file; resolves with the result or `null` if it failed/aborted. */
  upload: (file: File) => Promise<MediaUploadResult | null>;
  /** Cancel an in-flight upload. */
  cancel: () => void;
  /** Reset state back to idle. */
  reset: () => void;
}

/**
 * React hook wrapping {@link uploadMedia} with loading + error state.
 *
 * Example:
 *   const { upload, isUploading, error, result } = useMediaUpload();
 *   const res = await upload(file);
 *   if (res) await saveToSupabase(res.url, res.key);
 */
export function useMediaUpload(): UseMediaUploadReturn {
  const [state, setState] = useState<UseMediaUploadState>({
    status: "idle",
    isUploading: false,
    error: null,
    result: null,
  });

  const controllerRef = useRef<AbortController | null>(null);

  const upload = useCallback(async (file: File) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setState({
      status: "uploading",
      isUploading: true,
      error: null,
      result: null,
    });

    try {
      const result = await uploadMedia(file, { signal: controller.signal });
      // Tag the result with the inferred media type for convenience.
      void inferMediaType(file);
      setState({
        status: "success",
        isUploading: false,
        error: null,
        result,
      });
      return result;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setState({
          status: "idle",
          isUploading: false,
          error: null,
          result: null,
        });
        return null;
      }
      const message =
        err instanceof MediaUploadError
          ? err.message
          : "Unexpected error during upload.";
      setState({
        status: "error",
        isUploading: false,
        error: message,
        result: null,
      });
      return null;
    } finally {
      controllerRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setState({
      status: "idle",
      isUploading: false,
      error: null,
      result: null,
    });
  }, []);

  return { ...state, upload, cancel, reset };
}
