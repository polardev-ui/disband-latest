import { isTauri } from "@/lib/platform";

function isMacDesktop(): boolean {
  if (!isTauri() || typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}

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

    // The plugin's request only shows the macOS prompt; it returns before
    // anyone answers it. Opening the mic straight after raced the prompt:
    // WebKit got "not determined" and handed back a silent or failed track,
    // so the first call after install (or after a reset) had no mic. Wait
    // for the answer instead.
    if (wantsAudio && !(await checkMicrophonePermission())) {
      await requestMicrophonePermission();
      await waitForGrant(checkMicrophonePermission);
    }

    if (wantsVideo && !(await checkCameraPermission())) {
      await requestCameraPermission();
      await waitForGrant(checkCameraPermission);
    }
  } catch {
    // The plugin isn't there (an older build): WebKit asks by itself.
  }
}

/**
 * Polls until access is granted, the prompt is answered "Don't Allow", or a
 * minute passes. The prompt takes the app's focus while it is up, so once the
 * window has focus back for a moment without a grant, it was declined (or
 * was declined before and macOS didn't ask): stop waiting and let
 * getUserMedia report it.
 */
async function waitForGrant(check: () => Promise<boolean>): Promise<void> {
  const started = Date.now();
  let focusedSince: number | null = null;
  while (Date.now() - started < 60_000) {
    if (await check()) return;
    const focused = typeof document !== "undefined" && document.hasFocus();
    if (focused) {
      focusedSince ??= Date.now();
      if (Date.now() - focusedSince > 1_200) return;
    } else {
      focusedSince = null;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
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
