

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
/**
 * The screen share's own sound (a video, a game). A separate lane, never mixed
 * into the mic, so every listener can mute it without muting the person.
 * Appended last: a peer that only knows three lanes negotiates the fourth as
 * an unused m-line and ignores it.
 */
export const LANE_SCREEN_AUDIO = 3;

export type Lane =
  | typeof LANE_AUDIO
  | typeof LANE_CAMERA
  | typeof LANE_SCREEN
  | typeof LANE_SCREEN_AUDIO;

const ALL_LANES = [LANE_AUDIO, LANE_CAMERA, LANE_SCREEN, LANE_SCREEN_AUDIO] as const;
const isLane = (i: number): i is Lane => (ALL_LANES as readonly number[]).includes(i);

export function ensureLanes(pc: RTCPeerConnection): void {
  if (pc.getTransceivers().length > 0) return;
  pc.addTransceiver("audio", { direction: "sendrecv" });
  pc.addTransceiver("video", { direction: "sendrecv" });
  pc.addTransceiver("video", { direction: "sendrecv" });
  pc.addTransceiver("audio", { direction: "sendrecv" });
}

/*
 Lanes are resolved by negotiated MID, never by array position.

 Both sides call ensureLanes() before negotiating, so the callee adds three
 transceivers of its own *before* the caller's offer arrives. The offer does
 not reuse them: applying it creates three more, so the callee holds six —
 its own three with `mid: null`, never negotiated and never sent, followed by
 the three the offer actually describes. Measured in Chromium:

   i:0 audio mid:null   i:3 audio mid:"0"
   i:1 video mid:null   i:4 video mid:"1"
   i:2 video mid:null   i:5 video mid:"2"

 Lane lookups used `getTransceivers()[lane]`, so on the receiving side of
 every call:

   - its mic, camera and screen were handed to i:0–2 — dead transceivers that
     are not in the SDP — and the screen share never left the machine;
   - the caller's screen arrived on i:5, which `laneOfTransceiver` did not
     recognise as the screen lane, so it fell through to the camera handler
     and either replaced the caller's video or vanished.

 That is "screen sharing doesn't work" and much of "video is buggy".

 The m-line order of the offer is the only thing both peers agree on, and each
 negotiated transceiver carries the mid of its m-line. So a lane is the
 transceiver whose mid sits at that position in the session description; the
 index is only a fallback for the moment before any description exists, which
 is the caller about to make its offer — where its own three transceivers are
 the ones that will be negotiated, and the index is correct.
*/

/** The `a=mid:` values in m-line order, from whichever description exists. */
function negotiatedMids(pc: RTCPeerConnection): string[] {
  const sdp =
    pc.currentLocalDescription?.sdp ??
    pc.localDescription?.sdp ??
    pc.currentRemoteDescription?.sdp ??
    pc.remoteDescription?.sdp ??
    "";
  const mids: string[] = [];
  for (const match of sdp.matchAll(/^a=mid:(\S+)\s*$/gm)) mids.push(match[1]);
  return mids;
}

/** The transceiver that carries a lane, or null if it does not exist yet. */
export function transceiverForLane(
  pc: RTCPeerConnection,
  lane: Lane,
): RTCRtpTransceiver | null {
  const transceivers = pc.getTransceivers();
  const mids = negotiatedMids(pc);
  if (mids.length > lane) {
    const byMid = transceivers.find((t) => t.mid === mids[lane]);
    if (byMid) return byMid;
  }
  return transceivers[lane] ?? null;
}

export function openLanesForSending(pc: RTCPeerConnection): void {
  for (const lane of ALL_LANES) {
    const t = transceiverForLane(pc, lane);
    if (t && t.direction !== "sendrecv") t.direction = "sendrecv";
  }
}

export function laneOfTransceiver(
  pc: RTCPeerConnection,
  transceiver: RTCRtpTransceiver,
): Lane | null {
  if (transceiver.mid !== null) {
    const i = negotiatedMids(pc).indexOf(transceiver.mid);
    if (isLane(i)) return i;
  }
  const i = pc.getTransceivers().indexOf(transceiver);
  return isLane(i) ? i : null;
}

export async function setLaneTrack(
  pc: RTCPeerConnection,
  lane: Lane,
  track: MediaStreamTrack | null,
): Promise<void> {
  const transceiver = transceiverForLane(pc, lane);
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
