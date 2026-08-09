"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDisbandUserMedia } from "@/lib/media";

/**
 * Live input meter for the selected microphone.
 *
 * Picking a device from a dropdown tells you nothing about whether it actually
 * hears you — this lets someone confirm their mic works before joining a call
 * rather than discovering it mid-conversation.
 */
export function MicTest({ deviceId }: { deviceId: string }) {
  const [running, setRunning] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    setRunning(false);
    setLevel(0);
  }, []);

  // Never leave the mic hot after the panel goes away.
  useEffect(() => stop, [stop]);

  // Switching devices mid-test would otherwise keep metering the old mic.
  useEffect(() => {
    if (running) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await getDisbandUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      streamRef.current = stream;

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(buffer);
        // RMS around the 128 midpoint, scaled so normal speech fills the bar.
        let sum = 0;
        for (const sample of buffer) {
          const centered = (sample - 128) / 128;
          sum += centered * centered;
        }
        const rms = Math.sqrt(sum / buffer.length);
        setLevel(Math.min(1, rms * 2.5));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      setRunning(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the microphone.");
      stop();
    }
  }, [deviceId, stop]);

  return (
    <div className="w-full">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => (running ? stop() : void start())}
          className="shrink-0 rounded-md border border-divider px-3 py-1.5 text-[13px] font-semibold text-text-normal transition-colors hover:bg-interactive-hover"
        >
          {running ? "Stop test" : "Test mic"}
        </button>
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-bg-tertiary"
          role="meter"
          aria-label="Microphone input level"
          aria-valuenow={Math.round(level * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full transition-[width] duration-75"
            style={{
              width: `${level * 100}%`,
              backgroundColor: level > 0.85 ? "#f23f43" : "#3ba55d",
            }}
          />
        </div>
      </div>
      {running && (
        <p className="mt-1.5 text-[12px] text-text-muted">Say something — the bar should move.</p>
      )}
      {error && <p className="mt-1.5 text-[12px] text-status-dnd">{error}</p>}
    </div>
  );
}
