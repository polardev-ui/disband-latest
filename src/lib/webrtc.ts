

export function mergeTrackIntoStream(prev: MediaStream | null, track: MediaStreamTrack): MediaStream {
  if (track.readyState === "ended") {
    return stripVideoTracks(prev) ?? new MediaStream();
  }
  const others = (prev?.getTracks() ?? []).filter((t) => t.kind !== track.kind);
  return new MediaStream([...others, track]);
}

export function stripVideoTracks(stream: MediaStream | null): MediaStream | null {
  if (!stream) return null;
  const tracks = stream.getTracks().filter((t) => t.kind !== "video");
  return tracks.length ? new MediaStream(tracks) : null;
}

export function streamWithoutEndedTracks(stream: MediaStream | null): MediaStream | null {
  if (!stream) return null;
  const tracks = stream.getTracks().filter((t) => t.readyState === "live");
  return tracks.length ? new MediaStream(tracks) : null;
}

export function getVideoSender(pc: RTCPeerConnection): RTCRtpSender | undefined {
  const byTrack = pc.getSenders().find((s) => s.track?.kind === "video");
  if (byTrack) return byTrack;
  const transceiver = pc.getTransceivers().find(
    (t) => t.sender.track?.kind === "video" || t.receiver.track?.kind === "video",
  );
  return transceiver?.sender;
}

export async function setPeerVideoTrack(
  pc: RTCPeerConnection,
  stream: MediaStream,
  track: MediaStreamTrack | null,
): Promise<void> {
  const sender = getVideoSender(pc);
  if (track) {
    if (sender) {
      await sender.replaceTrack(track);
    } else {
      pc.addTrack(track, stream);
    }
    return;
  }
  if (sender) {
    await sender.replaceTrack(null);
  }
}

export function bindRemoteTrack(
  setStream: (updater: (prev: MediaStream | null) => MediaStream | null) => void,
  track: MediaStreamTrack,
) {
  const sync = () => {
    setStream((prev) => {
      if (track.readyState === "ended") {
        if (track.kind === "video") return stripVideoTracks(prev);
        const remaining = (prev?.getTracks() ?? []).filter((t) => t !== track && t.readyState === "live");
        return remaining.length ? new MediaStream(remaining) : null;
      }
      return mergeTrackIntoStream(prev, track);
    });
  };

  track.addEventListener("ended", sync);
  track.addEventListener("mute", sync);
  track.addEventListener("unmute", sync);
  sync();
  return () => {
    track.removeEventListener("ended", sync);
    track.removeEventListener("mute", sync);
    track.removeEventListener("unmute", sync);
  };
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
  if (track.readyState === "ended") {
    if (track.kind === "video") {
      const stripped = stripVideoTracks(existing ?? null);
      if (stripped) next.set(remoteId, stripped);
      else next.delete(remoteId);
      return next;
    }
    const remaining = (existing?.getTracks() ?? []).filter((t) => t !== track && t.readyState === "live");
    if (remaining.length) next.set(remoteId, new MediaStream(remaining));
    else next.delete(remoteId);
    return next;
  }
  const base = existing ?? fallbackStream ?? new MediaStream();
  next.set(remoteId, mergeTrackIntoStream(base, track));
  return next;
}

export function streamHasLiveVideo(stream: MediaStream | null | undefined): boolean {
  return !!stream?.getVideoTracks().some(
    (t) => t.readyState === "live" && t.enabled && !t.muted,
  );
}

export const LANE_AUDIO = 0;
export const LANE_CAMERA = 1;
export const LANE_SCREEN = 2;

export type Lane = typeof LANE_AUDIO | typeof LANE_CAMERA | typeof LANE_SCREEN;

export function ensureLanes(pc: RTCPeerConnection): void {
  if (pc.getTransceivers().length > 0) return;
  pc.addTransceiver("audio", { direction: "sendrecv" });
  pc.addTransceiver("video", { direction: "sendrecv" });
  pc.addTransceiver("video", { direction: "sendrecv" });
}

export function openLanesForSending(pc: RTCPeerConnection): void {
  for (const lane of [LANE_AUDIO, LANE_CAMERA, LANE_SCREEN]) {
    const t = pc.getTransceivers()[lane];
    if (t && t.direction !== "sendrecv") t.direction = "sendrecv";
  }
}

export function laneOfTransceiver(
  pc: RTCPeerConnection,
  transceiver: RTCRtpTransceiver,
): Lane | null {
  const i = pc.getTransceivers().indexOf(transceiver);
  return i === LANE_AUDIO || i === LANE_CAMERA || i === LANE_SCREEN ? (i as Lane) : null;
}

export async function setLaneTrack(
  pc: RTCPeerConnection,
  lane: Lane,
  track: MediaStreamTrack | null,
): Promise<void> {
  const transceiver = pc.getTransceivers()[lane];
  if (!transceiver) return;
  await transceiver.sender.replaceTrack(track);
}

export function bindLaneStream(
  setStream: (stream: MediaStream | null) => void,
  track: MediaStreamTrack,
): () => void {
  const sync = () => {
    const carrying = track.readyState === "live" && !track.muted;
    setStream(carrying ? new MediaStream([track]) : null);
  };

  track.addEventListener("ended", sync);
  track.addEventListener("mute", sync);
  track.addEventListener("unmute", sync);
  sync();
  return () => {
    track.removeEventListener("ended", sync);
    track.removeEventListener("mute", sync);
    track.removeEventListener("unmute", sync);
  };
}
