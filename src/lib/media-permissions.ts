import { isTauri } from "@/lib/platform";

function isMacDesktop(): boolean {
  if (!isTauri() || typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}

/** Prompt macOS for mic/camera before WebView getUserMedia (required for Tauri/WKWebView). */
export async function requestNativeMediaPermissions(constraints: {
  audio?: boolean;
  video?: boolean;
}): Promise<void> {
  if (!isMacDesktop()) return;

  const wantsAudio = constraints.audio !== false && constraints.audio != null;
  const wantsVideo = !!constraints.video;
  if (!wantsAudio && !wantsVideo) return;

  try {
    const {
      checkMicrophonePermission,
      requestMicrophonePermission,
      checkCameraPermission,
      requestCameraPermission,
    } = await import("tauri-plugin-macos-permissions-api");

    if (wantsAudio) {
      const granted = await checkMicrophonePermission();
      if (!granted) await requestMicrophonePermission();
    }

    if (wantsVideo) {
      const granted = await checkCameraPermission();
      if (!granted) await requestCameraPermission();
    }
  } catch {
    // Plugin unavailable during web dev or non-mac builds — WebView may still prompt.
  }
}

export function formatMediaPermissionError(err: unknown, kind: "microphone" | "camera" | "media"): string {
  const domErr = err instanceof DOMException ? err : null;
  const raw = err instanceof Error ? err.message : String(err);
  const notAllowed =
    domErr?.name === "NotAllowedError" ||
    /not allowed|permission denied|denied/i.test(raw);

  if (!notAllowed) {
    return err instanceof Error ? err.message : "Could not access media devices.";
  }

  if (isMacDesktop()) {
    const device =
      kind === "camera" ? "Camera" : kind === "microphone" ? "Microphone" : "Microphone and Camera";
    return `${device} access denied. Allow Disband in System Settings → Privacy & Security → ${device}, then try again.`;
  }

  if (isTauri()) {
    return "Media access denied. Check Windows Settings → Privacy → Microphone/Camera and enable access for desktop apps.";
  }

  return "Media access denied.";
}
