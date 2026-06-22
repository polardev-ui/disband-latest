import { isTauri } from "@/lib/platform";
import { buildAudioConstraints, buildVideoConstraints } from "@/lib/audio-settings";
import { formatMediaPermissionError, requestNativeMediaPermissions } from "@/lib/media-permissions";

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

  await requestNativeMediaPermissions({
    audio: merged.audio != null && merged.audio !== false,
    video: merged.video != null && merged.video !== false,
  });

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
      const pinnedVideo =
        merged.video &&
        typeof merged.video === "object" &&
        "deviceId" in merged.video &&
        merged.video.deviceId;
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
      if (
        pinnedVideo &&
        domErr &&
        (domErr.name === "OverconstrainedError" ||
          domErr.name === "NotFoundError" ||
          domErr.name === "NotReadableError")
      ) {
        return await navigator.mediaDevices.getUserMedia({
          ...merged,
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        });
      }
      throw formatMediaAccessError(err, merged);
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
    throw formatMediaAccessError(err, merged);
  }
}

function formatMediaAccessError(err: unknown, constraints: MediaStreamConstraints): Error {
  const domErr = err instanceof DOMException ? err : null;
  const raw = err instanceof Error ? err.message : String(err);
  const notAllowed =
    domErr?.name === "NotAllowedError" ||
    /not allowed|permission denied|denied/i.test(raw);

  if (notAllowed) {
    const wantsVideo = constraints.video != null && constraints.video !== false;
    const wantsAudio = constraints.audio != null && constraints.audio !== false;
    const kind = wantsVideo && wantsAudio ? "media" : wantsVideo ? "camera" : "microphone";
    return new Error(formatMediaPermissionError(err, kind));
  }

  return err instanceof Error ? err : new Error(raw || "Could not access media devices.");
}
