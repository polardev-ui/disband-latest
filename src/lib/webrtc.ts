/** Shared WebRTC helpers for voice/video calls */

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

/**
 * Whether a stream is actually showing video.
 *
 * `enabled` is a local flag and is always true on a track you are receiving,
 * so it says nothing about whether frames are arriving. `muted` is the one
 * that does. Reserving lanes up front means an idle camera lane delivers a
 * live, enabled, muted track — which passed this test and rendered a black
 * video element where the avatar should have been, in calls where nobody had
 * turned a camera on.
 */
export function streamHasLiveVideo(stream: MediaStream | null | undefined): boolean {
  return !!stream?.getVideoTracks().some(
    (t) => t.readyState === "live" && t.enabled && !t.muted,
  );
}

/* ------------------------------------------------------------------ */
/*  Media lanes                                                        */
/* ------------------------------------------------------------------ */

/**
 * Every peer connection carries three fixed slots, always in this order.
 *
 * A call used to have one video slot, so sharing your screen had to stop your
 * camera and take its place — the share and the person could never be seen at
 * the same time, and the receiver had no way to tell which one it was looking
 * at. Reserving a lane per purpose fixes both: the two streams coexist, and
 * their position identifies them.
 *
 * The order is the identifier. Both ends build the same layout — the caller by
 * creating the transceivers, the answerer by having them created from the
 * offer — so the index says what a track is without a single extra signalling
 * message to keep in sync.
 */
export const LANE_AUDIO = 0;
export const LANE_CAMERA = 1;
export const LANE_SCREEN = 2;

export type Lane = typeof LANE_AUDIO | typeof LANE_CAMERA | typeof LANE_SCREEN;

/**
 * Reserve the three lanes on a fresh connection, before the first offer.
 *
 * Only the side that creates the offer calls this; the answering side gets the
 * same three transceivers, in the same order, from the offer itself.
 */
export function ensureLanes(pc: RTCPeerConnection): void {
  if (pc.getTransceivers().length > 0) return;
  pc.addTransceiver("audio", { direction: "sendrecv" });
  pc.addTransceiver("video", { direction: "sendrecv" });
  pc.addTransceiver("video", { direction: "sendrecv" });
}

/**
 * Declare every lane two-way before answering.
 *
 * A transceiver created from an offer is answered `recvonly` when this side
 * has no track for it yet — which is always true for a screen lane, because
 * nobody is sharing at the moment a call connects. `replaceTrack` on a
 * `recvonly` transceiver succeeds and sends nothing, so the sharer saw their
 * own tile while the other side saw no share at all.
 *
 * Forcing `sendrecv` before the answer is written means every lane is
 * negotiated as two-way up front, and a track can be dropped into one later
 * without renegotiating.
 */
export function openLanesForSending(pc: RTCPeerConnection): void {
  for (const lane of [LANE_AUDIO, LANE_CAMERA, LANE_SCREEN]) {
    const t = pc.getTransceivers()[lane];
    if (t && t.direction !== "sendrecv") t.direction = "sendrecv";
  }
}

/** Which lane an arriving track belongs to, or null if it is off-layout. */
export function laneOfTransceiver(
  pc: RTCPeerConnection,
  transceiver: RTCRtpTransceiver,
): Lane | null {
  const i = pc.getTransceivers().indexOf(transceiver);
  return i === LANE_AUDIO || i === LANE_CAMERA || i === LANE_SCREEN ? (i as Lane) : null;
}

/**
 * Put a track in a lane, or clear it.
 *
 * `replaceTrack` on an existing transceiver needs no renegotiation, so turning
 * a camera or a screen on and off no longer triggers an offer/answer round
 * for every peer in the call.
 */
export async function setLaneTrack(
  pc: RTCPeerConnection,
  lane: Lane,
  track: MediaStreamTrack | null,
): Promise<void> {
  const transceiver = pc.getTransceivers()[lane];
  if (!transceiver) return;
  await transceiver.sender.replaceTrack(track);
}

/**
 * Expose a lane's stream only while it is actually carrying media.
 *
 * Reserving lanes up front means the far side receives a track for every lane
 * the moment the connection opens, whether or not anything is being sent. Such
 * a track is `live` — it is simply `muted` until media arrives — so a check
 * for `ended` alone treats an empty lane as content, which is what put a
 * phantom "screen" tile on screen in a call where nobody was sharing.
 *
 * Muting is also how a lane goes quiet when someone stops sharing, so the same
 * test removes the tile again.
 */
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
