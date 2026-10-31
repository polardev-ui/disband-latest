import { getAutoGainControl, getInputVolume, getNoiseSuppressionMode, type NoiseSuppressionMode } from "@/lib/audio-settings";
import { AI_NOISE_SAMPLE_RATE, createAiDenoiser, type AiDenoiser } from "@/lib/noise-suppression";

export interface VoiceMixerOptions {
  micMuted?: boolean;
  /** Defaults to the saved setting. */
  noiseMode?: NoiseSuppressionMode;
}

let audioContextConstructor: typeof AudioContext | null = null;
if (typeof window !== "undefined") {
  audioContextConstructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null;
}

/**
 * Opus and the AI filter both run at 48 kHz, so the mixer asks for that and
 * skips a resample. Firefox can't feed a mic at another rate into it, so fall
 * back to the device rate there (the AI filter then defers to the browser's).
 */
function openContext(rawMicTrack: MediaStreamTrack | null): { context: AudioContext; source: MediaStreamAudioSourceNode | null } {
  if (!audioContextConstructor) throw new Error("Web Audio is not available in this environment.");
  const connect = (context: AudioContext) => ({
    context,
    source: rawMicTrack ? context.createMediaStreamSource(new MediaStream([rawMicTrack])) : null,
  });
  let preferred: AudioContext | null = null;
  try {
    preferred = new audioContextConstructor({ latencyHint: "interactive", sampleRate: AI_NOISE_SAMPLE_RATE });
    return connect(preferred);
  } catch {
    void preferred?.close().catch(() => {});
    return connect(new audioContextConstructor({ latencyHint: "interactive" }));
  }
}

/**
 * Mixes a microphone track with independent soundboard tracks into one stable
 * outbound MediaStreamTrack. WebRTC senders can keep the same track while
 * soundboard clips connect and disconnect underneath.
 *
 * Mic path: source → [AI denoiser] → rumble high-pass → input volume →
 * limiter → destination.
 */
export class VoiceMixer {
  readonly context: AudioContext;
  readonly destination: MediaStreamAudioDestinationNode;
  readonly stream: MediaStream;
  readonly audioTrack: MediaStreamTrack;

  private micSource: MediaStreamAudioSourceNode | null = null;
  private micGain: GainNode;
  private limiter: DynamicsCompressorNode;
  private rumbleFilter: BiquadFilterNode;
  private inputVolume = getInputVolume();
  private micEnabled: boolean;
  private rawMicTrack: MediaStreamTrack | null = null;
  private soundNodes = new Set<AudioNode>();
  private noiseMode: NoiseSuppressionMode;
  private denoiser: AiDenoiser | null = null;
  private denoiserLoading: Promise<AiDenoiser | null> | null = null;
  private closed = false;

  constructor(rawMicTrack: MediaStreamTrack | null, options: VoiceMixerOptions = {}) {
    const { context, source } = openContext(rawMicTrack);
    this.context = context;
    this.micSource = source;
    this.rawMicTrack = rawMicTrack;
    // Some browsers start the context suspended until a gesture; the join
    // click usually counts, but never leave the mic stuck silent.
    if (this.context.state === "suspended") void this.context.resume().catch(() => {});
    this.destination = this.context.createMediaStreamDestination();
    this.stream = this.destination.stream;
    this.audioTrack = this.stream.getAudioTracks()[0];
    this.micEnabled = !(options.micMuted ?? false);
    this.audioTrack.enabled = this.micEnabled;
    // Tell the encoder this is speech, not music.
    try { this.audioTrack.contentHint = "speech"; } catch { }

    this.micGain = this.context.createGain();
    this.micGain.gain.value = this.micEnabled ? this.inputVolume / 100 : 0;

    // Catches peaks only, so a mic boosted past 100% doesn't clip on loud
    // words. Speech below the threshold passes through untouched.
    this.limiter = this.context.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 3;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.15;

    // Only trims desk thumps and hum below the voice band.
    this.rumbleFilter = this.context.createBiquadFilter();
    this.rumbleFilter.type = "highpass";
    this.rumbleFilter.Q.value = 0.5;
    this.rumbleFilter.connect(this.micGain);
    this.micGain.connect(this.limiter);
    this.limiter.connect(this.destination);

    this.noiseMode = options.noiseMode ?? getNoiseSuppressionMode();

    this.route();
    if (this.noiseMode === "ai") void this.enableAi();
  }

  /** Switch noise suppression mid-call; no renegotiation needed. */
  async setNoiseMode(mode: NoiseSuppressionMode) {
    this.noiseMode = mode;
    this.route();
    if (mode === "ai") await this.enableAi();
    else await this.applyBrowserSuppression(mode === "standard");
  }

  private route() {
    if (!this.micSource) return;
    try { this.micSource.disconnect(); } catch { }
    try { this.denoiser?.node.disconnect(); } catch { }
    this.rumbleFilter.frequency.value = this.noiseMode === "off" ? 20 : 80;
    if (this.noiseMode === "ai" && this.denoiser) {
      this.micSource.connect(this.denoiser.node);
      this.denoiser.node.connect(this.rumbleFilter);
    } else {
      this.micSource.connect(this.rumbleFilter);
    }
  }

  private async enableAi() {
    if (!this.micSource) return;
    if (!this.denoiser) {
      this.denoiserLoading ??= createAiDenoiser(this.context);
      this.denoiser = await this.denoiserLoading;
      this.denoiserLoading = null;
    }
    if (this.closed) {
      this.denoiser?.destroy();
      return;
    }
    if (this.noiseMode !== "ai") return;
    if (this.denoiser) {
      this.route();
      await this.applyBrowserSuppression(false);
    } else {
      // No AudioWorklet/WASM here: the browser's suppressor is the next best.
      await this.applyBrowserSuppression(true);
    }
  }

  private async applyBrowserSuppression(enabled: boolean) {
    const track = this.rawMicTrack;
    if (!track || track.readyState !== "live") return;
    try {
      await track.applyConstraints({
        ...track.getConstraints(),
        noiseSuppression: enabled,
        echoCancellation: true,
        autoGainControl: getAutoGainControl(),
      });
    } catch {
      // Some devices refuse live constraint changes; the next call picks it up.
    }
  }

  setMicrophoneEnabled(enabled: boolean) {
    this.micEnabled = enabled;
    this.audioTrack.enabled = enabled;
    this.micGain.gain.value = enabled ? this.inputVolume / 100 : 0;
  }

  /** 0–200 (%). Applies straight away, even mid-call. */
  setInputVolume(volume: number) {
    this.inputVolume = volume;
    if (this.micEnabled) this.micGain.gain.setTargetAtTime(volume / 100, this.context.currentTime, 0.02);
  }

  /** Turns the browser's gain control on or off for the live mic. */
  async setAutoGainControl(enabled: boolean) {
    const track = this.rawMicTrack;
    if (!track || track.readyState !== "live") return;
    try {
      await track.applyConstraints({ ...track.getConstraints(), autoGainControl: enabled });
    } catch {
      // Some devices refuse live constraint changes; the next call picks it up.
    }
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
    this.closed = true;
    this.micSource?.disconnect();
    this.denoiser?.destroy();
    this.denoiser = null;
    this.micGain.disconnect();
    this.limiter.disconnect();
    this.rumbleFilter.disconnect();
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

export function setVoiceMixerInputVolume(volume: number) {
  activeVoiceMixer?.setInputVolume(volume);
}

export function setVoiceMixerAutoGainControl(enabled: boolean) {
  void activeVoiceMixer?.setAutoGainControl(enabled);
}

/** Applies a new noise suppression choice to the call in progress, if any. */
export function setVoiceMixerNoiseMode(mode: NoiseSuppressionMode) {
  void activeVoiceMixer?.setNoiseMode(mode);
}
