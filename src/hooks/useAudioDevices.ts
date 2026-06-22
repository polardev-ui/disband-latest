"use client";

import { useCallback, useEffect, useState } from "react";
import { warmUpMediaDevices } from "@/lib/media";

export interface MediaDeviceOption {
  deviceId: string;
  label: string;
}

export function useAudioDevices() {
  const [inputs, setInputs] = useState<MediaDeviceOption[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceOption[]>([]);
  const [cameras, setCameras] = useState<MediaDeviceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await warmUpMediaDevices();
      if (!navigator.mediaDevices?.enumerateDevices) {
        setInputs([]);
        setOutputs([]);
        setCameras([]);
        return;
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputs(
        devices
          .filter((d) => d.kind === "audioinput")
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || `Microphone ${i + 1}`,
          })),
      );
      setOutputs(
        devices
          .filter((d) => d.kind === "audiooutput")
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || `Speaker ${i + 1}`,
          })),
      );
      setCameras(
        devices
          .filter((d) => d.kind === "videoinput")
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || `Camera ${i + 1}`,
          })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not list media devices.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    navigator.mediaDevices?.addEventListener("devicechange", refresh);
    return () => navigator.mediaDevices?.removeEventListener("devicechange", refresh);
  }, [refresh]);

  return { inputs, outputs, cameras, loading, error, refresh };
}
