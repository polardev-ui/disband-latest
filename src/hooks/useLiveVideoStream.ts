"use client";

import { useEffect, useState } from "react";
import { streamHasLiveVideo } from "@/lib/webrtc";

export function useLiveVideoStream(stream: MediaStream | null | undefined) {
  const [hasVideo, setHasVideo] = useState(() => streamHasLiveVideo(stream));

  useEffect(() => {
    if (!stream) {
      setHasVideo(false);
      return;
    }

    const refresh = () => setHasVideo(streamHasLiveVideo(stream));
    refresh();

    stream.addEventListener("addtrack", refresh);
    stream.addEventListener("removetrack", refresh);
    const trackListeners: Array<{ track: MediaStreamTrack; events: Array<keyof MediaStreamTrackEventMap> }> = [];
    for (const track of stream.getTracks()) {
      const events: Array<keyof MediaStreamTrackEventMap> = ["ended", "mute", "unmute"];
      for (const event of events) track.addEventListener(event, refresh);
      trackListeners.push({ track, events });
    }

    return () => {
      stream.removeEventListener("addtrack", refresh);
      stream.removeEventListener("removetrack", refresh);
      for (const { track, events } of trackListeners) {
        for (const event of events) track.removeEventListener(event, refresh);
      }
    };
  }, [stream]);

  return hasVideo;
}
