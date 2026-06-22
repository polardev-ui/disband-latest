import { isTauri } from "@/lib/platform";
import { buildAudioConstraints, buildVideoConstraints } from "@/lib/audio-settings";

type LegacyGetUserMedia = (
  constraints: MediaStreamConstraints,
  success: (stream: MediaStream) => void,
  error: (err: Error) => void,
) => void;

function legacyGetUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
  const nav = navigator as Navigator & {
    getUserMedia?: LegacyGetUserMedia;
    webkitGetUserMedia?: LegacyGetUserMedia;
    mozGetUserMedia?: LegacyGetUserMedia;
  };
  const fn = nav.getUserMedia ?? nav.webkitGetUserMedia ?? nav.mozGetUserMedia;
  if (!fn) {
    throw new Error("Microphone access is not available in this environment.");
  }
  return new Promise((resolve, reject) => {
    fn.call(nav, constraints, resolve, reject);
  });
}

/** Warm up media device enumeration after a user gesture (helps some desktop webviews). */
export async function warmUpMediaDevices(): Promise<void> {
  if (typeof navigator === "undefined") return;
  try {
    if (navigator.mediaDevices?.enumerateDevices) {
      await navigator.mediaDevices.enumerateDevices();
    }
  } catch {
    // ignore
  }
}

export async function getDisbandUserMedia(
  constraints: MediaStreamConstraints,
): Promise<MediaStream> {
  if (typeof navigator === "undefined") {
    throw new Error("Media devices are not available.");
  }

  await warmUpMediaDevices();

  const merged: MediaStreamConstraints = {
    ...constraints,
    audio: constraints.audio === true ? buildAudioConstraints() : constraints.audio ?? buildAudioConstraints(),
    video: constraints.video === true ? buildVideoConstraints() : constraints.video,
  };

  if (navigator.mediaDevices?.getUserMedia) {
    try {
      return await navigator.mediaDevices.getUserMedia(merged);
    } catch (err) {
      const domErr = err instanceof DOMException ? err : null;
      const pinnedInput =
        merged.audio &&
        typeof merged.audio === "object" &&
        "deviceId" in merged.audio &&
        merged.audio.deviceId;
      if (
        pinnedInput &&
        domErr &&
        (domErr.name === "OverconstrainedError" ||
          domErr.name === "NotFoundError" ||
          domErr.name === "NotReadableError")
      ) {
        return await navigator.mediaDevices.getUserMedia({
          ...merged,
          audio: true,
        });
      }
      throw err instanceof Error ? err : new Error("Could not access microphone.");
    }
  }

  if (!window.isSecureContext) {
    throw new Error(
      isTauri()
        ? "Microphone requires a secure app context. Reinstall the latest Disband build."
        : "Microphone access requires HTTPS.",
    );
  }

  try {
    return await legacyGetUserMedia(merged);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not access microphone.";
    if (/denied|permission/i.test(message)) {
      throw new Error(
        isTauri()
          ? "Microphone permission denied. Open System Settings → Privacy & Security → Microphone and enable Disband."
          : "Microphone permission denied.",
      );
    }
    throw new Error(message);
  }
}
