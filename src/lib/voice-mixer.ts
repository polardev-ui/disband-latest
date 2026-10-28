export interface VoiceMixerOptions {
  micMuted?: boolean;
  noiseCancellation?: boolean;
  noiseStrength?: number;
}

let audioContextConstructor: typeof AudioContext | null = null;
if (typeof window !== "undefined") {
  audioContextConstructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null;
}


/**
 * Mixes a microphone track with independent soundboard tracks into one stable
 * outbound MediaStreamTrack. WebRTC senders can keep the same track while
 * soundboard clips connect and disconnect underneath.
 */
export class VoiceMixer {
  readonly context: AudioContext;
  readonly destination: MediaStreamAudioDestinationNode;
  readonly stream: MediaStream;
  readonly audioTrack: MediaStreamTrack;

  private micSource: MediaStreamAudioSourceNode | null = null;
  private micGain: GainNode;
  private noiseHighpass: BiquadFilterNode;
  private noiseLowpass: BiquadFilterNode;
  private rawMicTrack: MediaStreamTrack | null = null;
  private soundNodes = new Set<AudioNode>();

  constructor(rawMicTrack: MediaStreamTrack | null, options: VoiceMixerOptions = {}) {
    if (!audioContextConstructor) throw new Error("Web Audio is not available in this environment.");
    this.context = new audioContextConstructor();
    this.destination = this.context.createMediaStreamDestination();
    this.stream = this.destination.stream;
    this.audioTrack = this.stream.getAudioTracks()[0];
    this.audioTrack.enabled = !(options.micMuted ?? false);

    this.micGain = this.context.createGain();
    this.micGain.gain.value = 1;

    this.noiseHighpass = this.context.createBiquadFilter();
    this.noiseHighpass.type = "highpass";
    this.noiseHighpass.frequency.value = 0;

    this.noiseLowpass = this.context.createBiquadFilter();
    this.noiseLowpass.type = "lowpass";
    this.noiseLowpass.frequency.value = 20000;

    const cancellation = options.noiseCancellation ?? true;
    const strength = Math.min(100, Math.max(0, options.noiseStrength ?? 50));
    if (cancellation) {
      // Keep the frequency shaping very gentle. Heavy high/low-pass cutoffs
      // were hollowing out the voice and making it sound stuttery/laggy.
      // Even gentler now: only trim rumble and extreme highs, never the
      // speech band, so voices stay natural and aren't chopped.
      this.noiseHighpass.frequency.value = Math.round(40 + strength * 1.2);
      this.noiseLowpass.frequency.value = Math.round(18000 - strength * 25);
      this.noiseHighpass.Q.value = 0.5;
      this.noiseLowpass.Q.value = 0.5;
    } else {
      this.noiseHighpass.frequency.value = 0;
      this.noiseLowpass.frequency.value = 22000;
    }

    if (rawMicTrack) {
      this.rawMicTrack = rawMicTrack;
      const micStream = new MediaStream([rawMicTrack]);
      this.micSource = this.context.createMediaStreamSource(micStream);
      this.micSource.connect(this.noiseHighpass);
      this.noiseHighpass.connect(this.noiseLowpass);
      this.noiseLowpass.connect(this.micGain);
      this.micGain.connect(this.destination);
    }
  }

  setMicrophoneEnabled(enabled: boolean) {
    this.audioTrack.enabled = enabled;
    this.micGain.gain.value = enabled ? 1 : 0;
  }

  playSound(url: string, volume = 1): HTMLAudioElement | null {
    if (typeof window === "undefined") return null;
    const audio = new Audio(url);
    audio.crossOrigin = "anonymous";
    audio.volume = Math.min(1, Math.max(0, volume));

    let source: MediaElementAudioSourceNode;
    try {
      source = this.context.createMediaElementSource(audio);
    } catch {
      void audio.play().catch(() => {});
      return audio;
    }
    const gain = this.context.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this.destination);
    this.soundNodes.add(source);
    this.soundNodes.add(gain);

    const cleanup = () => {
      try { source.disconnect(); } catch { }
      try { gain.disconnect(); } catch { }
      this.soundNodes.delete(source);
      this.soundNodes.delete(gain);
    };
    audio.addEventListener("ended", cleanup);
    audio.addEventListener("error", cleanup);
    audio.play().catch(() => {});
    return audio;
  }

  async close() {
    this.soundNodes.forEach((node) => {
      try { node.disconnect(); } catch { }
    });
    this.soundNodes.clear();
    this.micSource?.disconnect();
    this.micGain.disconnect();
    this.noiseHighpass.disconnect();
    this.noiseLowpass.disconnect();
    this.destination.disconnect();
    try { this.rawMicTrack?.stop(); } catch {} 
    await this.context.close().catch(() => {});
    if (activeVoiceMixer === this) activeVoiceMixer = null;
  }
}

let activeVoiceMixer: VoiceMixer | null = null;

export function setActiveVoiceMixer(mixer: VoiceMixer | null) {
  if (activeVoiceMixer && activeVoiceMixer !== mixer) {
    void activeVoiceMixer.close().catch(() => {});
  }
  activeVoiceMixer = mixer;
}

export function getActiveVoiceMixer(): VoiceMixer | null {
  return activeVoiceMixer;
}

export function playVoiceSoundboardSound(url: string, volume = 1): HTMLAudioElement | null {
  if (!activeVoiceMixer) {
    const audio = new Audio(url);
    audio.volume = volume;
    void audio.play().catch(() => {});
    return audio;
  }
  return activeVoiceMixer.playSound(url, volume);
}

export function setVoiceMixerMicrophoneEnabled(enabled: boolean) {
  activeVoiceMixer?.setMicrophoneEnabled(enabled);
}
