import {
  VOICE_SETTINGS_EVENT,
  buildAudioConstraints,
  getInputMode,
  getInputVolume,
  getPreferredAudioInputId,
  getPushToTalkKey,
  getPushToTalkReleaseDelay,
  getSoundboardVolume,
  getVoiceProcessing,
  type NoiseSuppressionMode,
  type VoiceProcessing,
  type VoiceSettingsEventDetail,
} from "@/lib/audio-settings";
import { getDisbandUserMedia } from "@/lib/media";
import { isSoundboardUrl, playSoundboardLocally, soundboardSender } from "@/lib/soundboard";
import { AI_NOISE_SAMPLE_RATE, createAiDenoiser, type AiDenoiser } from "@/lib/noise-suppression";

export interface VoiceMixerOptions {
  micMuted?: boolean;
  /** @deprecated The mixer always follows the saved settings now. */
  noiseMode?: NoiseSuppressionMode;
}

/** The mic as the gate sees it: after input volume, before the gate. */
export interface VoiceLevel {
  levelDb: number;
  thresholdDb: number;
  open: boolean;
}

const GATE_WORKLET_URL = "/audio/voice-gate-worklet.js";

let audioContextConstructor: typeof AudioContext | null = null;
if (typeof window !== "undefined") {
  audioContextConstructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null;
}

/**
 * Opus and the AI filter both run at 48 kHz, so the mixer asks for that and
 * skips a resample. Firefox can't feed a mic at another rate into it, so fall
 * back to the device rate there (the AI filter then defers to the browser's).
 */
function openContext(): AudioContext {
  if (!audioContextConstructor) throw new Error("Web Audio is not available in this environment.");
  try {
    return new audioContextConstructor({ latencyHint: "interactive", sampleRate: AI_NOISE_SAMPLE_RATE });
  } catch {
    return new audioContextConstructor({ latencyHint: "interactive" });
  }
}

function connectSource(context: AudioContext, track: MediaStreamTrack | null): MediaStreamAudioSourceNode | null {
  if (!track) return null;
  try {
    return context.createMediaStreamSource(new MediaStream([track]));
  } catch {
    return null;
  }
}

const liveMixers = new Set<VoiceMixer>();

/**
 * Mixes a microphone track with soundboard clips into one stable outbound
 * MediaStreamTrack. WebRTC senders keep the same track while the mic
 * underneath is swapped (a new device, a headset unplugged) and while clips
 * connect and disconnect.
 *
 * Mic path: source → [AI denoiser] → rumble high-pass → input volume →
 * gate (sensitivity / push to talk) → limiter → destination.
 */
export class VoiceMixer {
  readonly context: AudioContext;
  readonly destination: MediaStreamAudioDestinationNode;
  readonly stream: MediaStream;
  readonly audioTrack: MediaStreamTrack;

  private micSource: MediaStreamAudioSourceNode | null = null;
  private micGain: GainNode;
  private gate: AudioWorkletNode | null = null;
  private limiter: DynamicsCompressorNode;
  private rumbleFilter: BiquadFilterNode;
  private inputVolume = getInputVolume();
  private micEnabled: boolean;
  private rawMicTrack: MediaStreamTrack | null = null;
  private soundNodes = new Set<AudioNode>();
  private processing: VoiceProcessing = getVoiceProcessing();
  private denoiser: AiDenoiser | null = null;
  private denoiserLoading: Promise<AiDenoiser | null> | null = null;
  private closed = false;
  private pttActive = false;
  private levelListeners = new Set<(level: VoiceLevel) => void>();
  private lastLevel: VoiceLevel | null = null;
  private reacquiring: Promise<void> | null = null;
  private defaultGroupId: string | null = null;
  private cleanups: Array<() => void> = [];

  constructor(rawMicTrack: MediaStreamTrack | null, options: VoiceMixerOptions = {}) {
    this.context = openContext();
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

    liveMixers.add(this);
    this.keepContextRunning();
    this.attachMicrophone(rawMicTrack);
    this.watchDevices();
    this.watchSettings();
    void this.loadGate();
  }

  // -------------------------------------------------------------------------
  // The audio context

  /**
   * A suspended context sends silence: the mic looks live but nobody hears
   * you. Browsers suspend it when it was made without a click (the join
   * click often expires while the mic permission prompt is up), and WebKit
   * (Safari, the macOS desktop app) interrupts it when the window is hidden
   * or another app takes the audio device. Resume it whenever it stops, and
   * on the next click or key press if the browser wants a gesture.
   */
  private keepContextRunning() {
    const resume = () => {
      if (this.closed || this.context.state === "running") return;
      void this.context.resume().catch(() => {});
    };
    resume();
    const onState = () => resume();
    this.context.addEventListener("statechange", onState);
    const gestureEvents = ["pointerdown", "keydown", "touchend"] as const;
    for (const type of gestureEvents) window.addEventListener(type, resume, { capture: true, passive: true });
    const onVisible = () => { if (document.visibilityState === "visible") resume(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", resume);
    this.cleanups.push(() => {
      this.context.removeEventListener("statechange", onState);
      for (const type of gestureEvents) window.removeEventListener(type, resume, { capture: true });
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", resume);
    });
  }

  // -------------------------------------------------------------------------
  // The microphone

  private attachMicrophone(track: MediaStreamTrack | null) {
    const previous = this.rawMicTrack;
    if (this.micSource) {
      try { this.micSource.disconnect(); } catch { }
    }
    this.rawMicTrack = track;
    this.micSource = connectSource(this.context, track);
    if (previous && previous !== track) {
      try { previous.stop(); } catch { }
    }
    if (track) {
      // The device was unplugged, or the OS took it away: get a mic back
      // without the call noticing.
      track.addEventListener("ended", () => {
        if (this.rawMicTrack === track && !this.closed) void this.reacquireMicrophone();
      }, { once: true });
    }
    this.route();
    if (this.processing.noiseMode === "ai" && !this.denoiser && this.micSource) void this.enableAi();
    else void this.applyTrackConstraints();
    void this.rememberDefaultDevice();
  }

  /**
   * Opens the mic again with the current settings and swaps it in under the
   * outbound track. Used when the chosen device changes, a device comes or
   * goes, or the mic track ends on its own.
   */
  reacquireMicrophone(): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.reacquiring ??= (async () => {
      for (let attempt = 0; attempt < 3 && !this.closed; attempt++) {
        try {
          const stream = await getDisbandUserMedia({ audio: buildAudioConstraints() });
          const track = stream.getAudioTracks()[0] ?? null;
          if (this.closed) {
            track?.stop();
            return;
          }
          if (track) {
            this.attachMicrophone(track);
            return;
          }
        } catch {
          // The device may still be settling after a plug or unplug.
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    })().finally(() => {
      this.reacquiring = null;
    });
    return this.reacquiring;
  }

  /** The device the "default" entry points at, to notice the OS switching it. */
  private async rememberDefaultDevice() {
    try {
      const devices = await navigator.mediaDevices?.enumerateDevices?.();
      const entry = devices?.find((d) => d.kind === "audioinput" && d.deviceId === "default");
      this.defaultGroupId = entry?.groupId ?? null;
    } catch {
      this.defaultGroupId = null;
    }
  }

  private watchDevices() {
    const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!media?.addEventListener) return;
    const onChange = async () => {
      if (this.closed) return;
      let devices: MediaDeviceInfo[] = [];
      try {
        devices = await media.enumerateDevices();
      } catch {
        return;
      }
      const inputs = devices.filter((d) => d.kind === "audioinput");
      const track = this.rawMicTrack;
      const current = track?.getSettings().deviceId;
      const preferred = getPreferredAudioInputId();
      const currentGone = !track || track.readyState === "ended" || (current && !inputs.some((d) => d.deviceId === current));
      // The chosen device came back (a headset plugged in again).
      const preferredBack = preferred && current !== preferred && inputs.some((d) => d.deviceId === preferred);
      // No device chosen and the OS default changed: follow it, like the
      // rest of the system does.
      const defaultEntry = inputs.find((d) => d.deviceId === "default");
      const defaultMoved = !preferred && defaultEntry && this.defaultGroupId !== null && defaultEntry.groupId !== this.defaultGroupId;
      if (currentGone || preferredBack || defaultMoved) void this.reacquireMicrophone();
    };
    media.addEventListener("devicechange", onChange);
    this.cleanups.push(() => media.removeEventListener("devicechange", onChange));
  }

  // -------------------------------------------------------------------------
  // Settings

  private watchSettings() {
    const onChange = (event: Event) => {
      const key = (event as CustomEvent<VoiceSettingsEventDetail>).detail?.key;
      if (key === "disband:audio-input") {
        void this.reacquireMicrophone();
        return;
      }
      this.applySettings();
    };
    window.addEventListener(VOICE_SETTINGS_EVENT, onChange);
    this.cleanups.push(() => window.removeEventListener(VOICE_SETTINGS_EVENT, onChange));
  }

  /** Re-reads the saved settings and applies them to the live mic. */
  applySettings() {
    if (this.closed) return;
    const next = getVoiceProcessing();
    const prev = this.processing;
    this.processing = next;
    this.setInputVolume(getInputVolume());
    this.postGate();
    if (next.noiseMode !== prev.noiseMode) void this.setNoiseMode(next.noiseMode);
    else if (next.echoCancellation !== prev.echoCancellation || next.autoGainControl !== prev.autoGainControl) {
      void this.applyTrackConstraints();
    }
  }

  private async applyTrackConstraints() {
    const track = this.rawMicTrack;
    if (!track || track.readyState !== "live") return;
    const { noiseMode, echoCancellation, autoGainControl } = this.processing;
    const browserSuppression = noiseMode === "standard" || (noiseMode === "ai" && !this.denoiser);
    try {
      await track.applyConstraints({
        ...track.getConstraints(),
        noiseSuppression: browserSuppression,
        echoCancellation,
        autoGainControl,
      });
    } catch {
      // Some devices refuse live constraint changes; the next call picks it up.
    }
  }

  /** Switch noise suppression mid-call; no renegotiation needed. */
  async setNoiseMode(mode: NoiseSuppressionMode) {
    this.processing = { ...this.processing, noiseMode: mode };
    this.route();
    if (mode === "ai") await this.enableAi();
    else await this.applyTrackConstraints();
  }

  private route() {
    if (!this.micSource) return;
    try { this.micSource.disconnect(); } catch { }
    try { this.denoiser?.node.disconnect(); } catch { }
    this.rumbleFilter.frequency.value = this.processing.noiseMode === "off" ? 20 : 80;
    if (this.processing.noiseMode === "ai" && this.denoiser) {
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
    if (this.processing.noiseMode !== "ai") return;
    // Without AudioWorklet/WASM the browser's suppressor is the next best,
    // which applyTrackConstraints picks when there's no denoiser.
    this.route();
    await this.applyTrackConstraints();
  }

  // -------------------------------------------------------------------------
  // Gate: input sensitivity and push to talk

  private async loadGate() {
    try {
      if (!this.context.audioWorklet) return;
      await this.context.audioWorklet.addModule(GATE_WORKLET_URL);
      if (this.closed) return;
      const gate = new AudioWorkletNode(this.context, "disband-voice-gate", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { mode: this.processing.gate, thresholdDb: this.processing.thresholdDb, pttActive: this.pttActive },
      });
      gate.port.onmessage = (event: MessageEvent<VoiceLevel>) => {
        this.lastLevel = event.data;
        for (const listener of this.levelListeners) listener(event.data);
      };
      // Splice it in: micGain → gate → limiter.
      this.micGain.disconnect();
      this.micGain.connect(gate);
      gate.connect(this.limiter);
      this.gate = gate;
      this.postGate();
    } catch {
      // No AudioWorklet (or the file didn't load): the mic stays open, which
      // is how it always worked. Never fail a call over the gate.
      this.gate = null;
    }
  }

  private postGate() {
    this.gate?.port.postMessage({
      mode: this.processing.gate,
      thresholdDb: this.processing.thresholdDb,
      pttActive: this.pttActive,
    });
  }

  /** Whether the gate could be loaded: sensitivity and push to talk work. */
  get gateAvailable(): boolean {
    return this.gate !== null;
  }

  setPushToTalkActive(active: boolean) {
    if (this.pttActive === active) return;
    this.pttActive = active;
    this.postGate();
  }

  /** Live mic level, about 20 times a second. Returns an unsubscribe. */
  onLevel(listener: (level: VoiceLevel) => void): () => void {
    this.levelListeners.add(listener);
    if (this.lastLevel) listener(this.lastLevel);
    return () => { this.levelListeners.delete(listener); };
  }

  // -------------------------------------------------------------------------
  // Volume and mute

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

  /** @deprecated Settings apply themselves; kept for older callers. */
  async setAutoGainControl(_enabled: boolean) {
    this.applySettings();
  }

  /** @deprecated Settings apply themselves; kept for older callers. */
  async setEchoCancellation(_enabled: boolean) {
    this.applySettings();
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
    if (this.closed) return;
    this.closed = true;
    liveMixers.delete(this);
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    this.levelListeners.clear();
    this.soundNodes.forEach((node) => {
      try { node.disconnect(); } catch { }
    });
    this.soundNodes.clear();
    try { this.micSource?.disconnect(); } catch { }
    this.denoiser?.destroy();
    this.denoiser = null;
    try { this.gate?.disconnect(); } catch { }
    this.gate = null;
    this.micGain.disconnect();
    this.limiter.disconnect();
    this.rumbleFilter.disconnect();
    this.destination.disconnect();
    try { this.rawMicTrack?.stop(); } catch { }
    await this.context.close().catch(() => {});
    if (activeVoiceMixer === this) activeVoiceMixer = null;
  }
}

// ---------------------------------------------------------------------------
// Push to talk

/*
 Held while the app has focus. Browsers don't see keys pressed in other
 apps, so the key only works while Disband is the front window; releasing
 focus (alt-tab, clicking away) counts as letting go, or the mic would stay
 open.
*/
let pttHeld = false;
let pttReleaseTimer: ReturnType<typeof setTimeout> | null = null;

function setPtt(active: boolean) {
  for (const mixer of liveMixers) mixer.setPushToTalkActive(active);
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
}

/** True for keys that type a character, which a text box needs. */
function isPrintable(event: KeyboardEvent): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

/** Set while the settings page records a new key, so pressing it doesn't talk. */
let pttRecording = false;
export function setPushToTalkRecording(recording: boolean) {
  pttRecording = recording;
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (event) => {
    if (pttRecording || getInputMode() !== "ptt" || event.code !== getPushToTalkKey()) return;
    // A letter key mustn't swallow typing in the message box.
    if (isTypingTarget(event.target) && isPrintable(event)) return;
    if (pttReleaseTimer) {
      clearTimeout(pttReleaseTimer);
      pttReleaseTimer = null;
    }
    if (pttHeld) return;
    pttHeld = true;
    setPtt(true);
  }, true);
  const release = (delay: number) => {
    if (!pttHeld) return;
    pttHeld = false;
    if (pttReleaseTimer) clearTimeout(pttReleaseTimer);
    pttReleaseTimer = setTimeout(() => {
      pttReleaseTimer = null;
      if (!pttHeld) setPtt(false);
    }, delay);
  };
  window.addEventListener("keyup", (event) => {
    if (event.code === getPushToTalkKey()) release(getPushToTalkReleaseDelay());
  }, true);
  window.addEventListener("blur", () => release(0));
}

// ---------------------------------------------------------------------------
// The call's mixer

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
  // In a call that carries soundboard events, everyone (me included) plays
  // the clip themselves, so each listener can mute it. See soundboard.ts.
  const send = soundboardSender();
  if (send && isSoundboardUrl(url)) {
    send(url);
    return playSoundboardLocally(url, volume);
  }
  if (!activeVoiceMixer) {
    const audio = new Audio(url);
    audio.volume = Math.min(1, Math.max(0, volume * (getSoundboardVolume() / 100)));
    void audio.play().catch(() => {});
    return audio;
  }
  return activeVoiceMixer.playSound(url, volume);
}

export function setVoiceMixerMicrophoneEnabled(enabled: boolean) {
  activeVoiceMixer?.setMicrophoneEnabled(enabled);
}

/** @deprecated Settings apply themselves through VOICE_SETTINGS_EVENT. */
export function setVoiceMixerInputVolume(volume: number) {
  activeVoiceMixer?.setInputVolume(volume);
}

/** @deprecated Settings apply themselves through VOICE_SETTINGS_EVENT. */
export function setVoiceMixerAutoGainControl(_enabled: boolean) {
  activeVoiceMixer?.applySettings();
}

/** @deprecated Settings apply themselves through VOICE_SETTINGS_EVENT. */
export function setVoiceMixerEchoCancellation(_enabled: boolean) {
  activeVoiceMixer?.applySettings();
}

/** @deprecated Settings apply themselves through VOICE_SETTINGS_EVENT. */
export function setVoiceMixerNoiseMode(mode: NoiseSuppressionMode) {
  void activeVoiceMixer?.setNoiseMode(mode);
}
