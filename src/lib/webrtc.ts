/** Shared WebRTC helpers for voice/video calls */

export function mergeTrackIntoStream(prev: MediaStream | null, track: MediaStreamTrack): MediaStream {
  const others = (prev?.getTracks() ?? []).filter((t) => t.kind !== track.kind);
  return new MediaStream([...others, track]);
}

export async function setPeerVideoTrack(
  pc: RTCPeerConnection,
  stream: MediaStream,
  track: MediaStreamTrack | null,
): Promise<void> {
  const sender = pc.getSenders().find((s) => s.track?.kind === "video");
  if (track) {
    if (sender) {
      await sender.replaceTrack(track);
    } else {
      pc.addTrack(track, stream);
    }
  } else if (sender) {
    await sender.replaceTrack(null);
  }
}

export async function createOfferForPeer(pc: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
  if (pc.signalingState !== "stable") {
    await new Promise<void>((resolve) => {
      if (pc.signalingState === "stable") {
        resolve();
        return;
      }
      const done = () => {
        if (pc.signalingState === "stable") {
          pc.removeEventListener("signalingstatechange", done);
          resolve();
        }
      };
      pc.addEventListener("signalingstatechange", done);
    });
  }
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  return offer;
}

export function attachRemoteTrack(
  prev: Map<string, MediaStream>,
  remoteId: string,
  track: MediaStreamTrack,
  fallbackStream?: MediaStream,
): Map<string, MediaStream> {
  const next = new Map(prev);
  const existing = next.get(remoteId);
  const base = existing ?? fallbackStream ?? new MediaStream();
  next.set(remoteId, mergeTrackIntoStream(base, track));
  return next;
}

export function streamHasLiveVideo(stream: MediaStream | null | undefined): boolean {
  return !!stream?.getVideoTracks().some((t) => t.readyState === "live" && t.enabled);
}
