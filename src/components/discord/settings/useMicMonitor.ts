"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDisbandUserMedia } from "@/lib/media";
import {
  applyAudioOutputToElement,
  buildAudioConstraints,
  getOutputVolume,
  getPreferredAudioOutputId,
  VOICE_SETTINGS_EVENT,
} from "@/lib/audio-settings";
import { getActiveVoiceMixer, VoiceMixer, type VoiceLevel } from "@/lib/voice-mixer";
import { useI18n } from "@/contexts/I18nContext";

/**
 * The settings page's view of the mic: a test you can hear (the same
 * pipeline a call uses, played to the chosen speaker), and the live level
 * from either that test or the call you're in.
 */
export function useMicMonitor() {
  const { t } = useI18n();
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState<VoiceLevel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mixer, setMixer] = useState<VoiceMixer | null>(null);
  const testMixerRef = useRef<VoiceMixer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.srcObject = null;
    }
    audioRef.current = null;
    void testMixerRef.current?.close();
    testMixerRef.current = null;
    setTesting(false);
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await getDisbandUserMedia({ audio: buildAudioConstraints(), video: false });
      const next = new VoiceMixer(stream.getAudioTracks()[0] ?? null);
      testMixerRef.current = next;
      // Played through an element, not the audio graph, so the speaker
      // chosen above is the one you hear it on.
      const audio = new Audio();
      audio.srcObject = next.stream;
      audio.volume = Math.min(1, 0.7 * (getOutputVolume() / 100));
      await applyAudioOutputToElement(audio, getPreferredAudioOutputId());
      void audio.play().catch(() => {});
      audioRef.current = audio;
      setTesting(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Couldn't open the microphone."));
      stop();
    }
  }, [stop, t]);

  // Keep the test's speaker and loudness in step with the page.
  useEffect(() => {
    if (!testing) return;
    const onChange = () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.volume = Math.min(1, 0.7 * (getOutputVolume() / 100));
      void applyAudioOutputToElement(audio, getPreferredAudioOutputId());
    };
    window.addEventListener(VOICE_SETTINGS_EVENT, onChange);
    return () => window.removeEventListener(VOICE_SETTINGS_EVENT, onChange);
  }, [testing]);

  // Whichever mic is live: the test, else the call in progress.
  useEffect(() => {
    const pick = () => setMixer(testMixerRef.current ?? getActiveVoiceMixer());
    pick();
    const id = window.setInterval(pick, 1000);
    return () => window.clearInterval(id);
  }, [testing]);

  useEffect(() => {
    setLevel(null);
    if (!mixer) return;
    return mixer.onLevel(setLevel);
  }, [mixer]);

  return {
    testing,
    start,
    stop,
    error,
    /** Null when no mic is live, or the gate couldn't load. */
    level,
    live: mixer !== null,
    gateAvailable: mixer?.gateAvailable ?? true,
  };
}
