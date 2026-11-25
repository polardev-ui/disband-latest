/*
 Disband voice gate: input sensitivity and push to talk.

 Runs on the audio thread, so a tab in the background (where timers are
 throttled) can never leave the gate stuck shut. Starting state comes in
 processorOptions; changes after that as messages, both shaped:
   { mode: "off" | "auto" | "manual" | "ptt", thresholdDb, pttActive }
 Messages out, about 20 times a second:
   { levelDb, thresholdDb, open }
*/
const HOLD_SECONDS = 0.3;
const ATTACK_SECONDS = 0.004;
const RELEASE_SECONDS = 0.06;
const REPORT_SECONDS = 0.05;
const AUTO_MARGIN_DB = 12;
const AUTO_MIN_DB = -70;
const AUTO_MAX_DB = -28;
const SILENCE_DB = -100;

class DisbandVoiceGate extends AudioWorkletProcessor {
  constructor(options) {
    super();
    // The starting state comes with the node, so the very first block is
    // already gated right; later changes arrive as messages.
    const initial = (options && options.processorOptions) || {};
    this.mode = typeof initial.mode === "string" ? initial.mode : "off";
    this.manualThresholdDb = typeof initial.thresholdDb === "number" ? initial.thresholdDb : -55;
    this.pttActive = initial.pttActive === true;
    // Push to talk starts shut; everything else starts open and decides on
    // the first block, so the first syllable is never clipped.
    this.gain = this.mode === "ptt" && !this.pttActive ? 0 : 1;
    this.holdFrames = 0;
    this.levelDb = SILENCE_DB;
    this.noiseFloorDb = -60;
    this.reportFrames = 0;
    this.lastOpen = true;
    this.attackCoef = 1 - Math.exp(-1 / (ATTACK_SECONDS * sampleRate));
    this.releaseCoef = 1 - Math.exp(-1 / (RELEASE_SECONDS * sampleRate));
    this.port.onmessage = (event) => {
      const data = event.data || {};
      if (typeof data.mode === "string") this.mode = data.mode;
      if (typeof data.thresholdDb === "number") this.manualThresholdDb = data.thresholdDb;
      if (typeof data.pttActive === "boolean") this.pttActive = data.pttActive;
    };
  }

  threshold() {
    if (this.mode !== "auto") return this.manualThresholdDb;
    const auto = this.noiseFloorDb + AUTO_MARGIN_DB;
    return Math.min(AUTO_MAX_DB, Math.max(AUTO_MIN_DB, auto));
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    const channel = input && input[0];
    const frames = output[0] ? output[0].length : 128;

    let blockDb = SILENCE_DB;
    if (channel) {
      let sum = 0;
      for (let i = 0; i < channel.length; i++) sum += channel[i] * channel[i];
      const rms = Math.sqrt(sum / channel.length);
      blockDb = rms > 0 ? Math.max(SILENCE_DB, 20 * Math.log10(rms)) : SILENCE_DB;
    }

    // Meter: rises at once, falls smoothly.
    this.levelDb = blockDb > this.levelDb ? blockDb : this.levelDb * 0.85 + blockDb * 0.15;

    // Noise floor for automatic sensitivity: drops quickly to quiet moments,
    // creeps up slowly, so speech never raises it much.
    if (blockDb > SILENCE_DB) {
      if (blockDb < this.noiseFloorDb) this.noiseFloorDb += (blockDb - this.noiseFloorDb) * 0.05;
      else this.noiseFloorDb += (blockDb - this.noiseFloorDb) * 0.0005;
    }

    const thresholdDb = this.threshold();
    let open;
    if (this.mode === "off") {
      open = true;
    } else if (this.mode === "ptt") {
      open = this.pttActive;
    } else if (blockDb >= thresholdDb) {
      open = true;
      this.holdFrames = HOLD_SECONDS * sampleRate;
    } else if (this.holdFrames > 0) {
      this.holdFrames -= frames;
      open = true;
    } else {
      open = false;
    }

    const target = open ? 1 : 0;
    const coef = target > this.gain ? this.attackCoef : this.releaseCoef;
    for (let c = 0; c < output.length; c++) {
      const out = output[c];
      const src = (input && (input[c] || input[0])) || null;
      let g = this.gain;
      for (let i = 0; i < out.length; i++) {
        g += (target - g) * coef;
        out[i] = src ? src[i] * g : 0;
      }
      if (c === output.length - 1) this.gain = g;
    }

    this.reportFrames += frames;
    if (this.reportFrames >= REPORT_SECONDS * sampleRate || open !== this.lastOpen) {
      this.reportFrames = 0;
      this.lastOpen = open;
      this.port.postMessage({ levelDb: this.levelDb, thresholdDb, open });
    }
    return true;
  }
}

registerProcessor("disband-voice-gate", DisbandVoiceGate);
