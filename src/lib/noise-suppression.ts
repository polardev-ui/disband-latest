/**
 * AI noise suppression for the microphone, Krisp-style: a small neural
 * speech-enhancement model (GTCRN) running in an AudioWorklet, so it works
 * the same in the browser and the desktop app and never leaves the device.
 *
 * The worklet and model are copied from @sapphi-red/web-noise-suppressor
 * into public/noise/ by scripts/copy-noise-assets.mjs. The package's own
 * node classes extend AudioWorkletNode at import time, which breaks server
 * rendering, so this builds the node directly by processor name.
 */

const WORKLET_URL = "/noise/gtcrn-worklet.js";
const WASM_URL = "/noise/gtcrn.wasm";
const PROCESSOR = "@sapphi-red/web-noise-suppressor/gtcrn";

/** The model runs natively at 48 kHz; any other context rate is rejected. */
export const AI_NOISE_SAMPLE_RATE = 48_000;

let wasm: Promise<ArrayBuffer> | null = null;
const registered = new WeakMap<BaseAudioContext, Promise<void>>();

export function aiNoiseSuppressionSupported(): boolean {
  return typeof window !== "undefined" &&
    typeof AudioWorkletNode !== "undefined" &&
    typeof WebAssembly !== "undefined";
}

function loadModel(): Promise<ArrayBuffer> {
  if (!wasm) {
    wasm = fetch(WASM_URL).then((res) => {
      if (!res.ok) throw new Error(`Noise model failed to load (${res.status})`);
      return res.arrayBuffer();
    });
    // A failed fetch must not poison every later call.
    wasm.catch(() => { wasm = null; });
  }
  return wasm;
}

/** Start downloading the model before a call needs it. */
export function preloadAiNoiseSuppression() {
  if (aiNoiseSuppressionSupported()) void loadModel().catch(() => {});
}

export type AiDenoiser = {
  node: AudioWorkletNode;
  destroy: () => void;
};

/**
 * Builds a mono denoiser for `context`, or null when the browser can't run
 * it (no AudioWorklet, WASM blocked, or a context that isn't 48 kHz).
 */
export async function createAiDenoiser(context: AudioContext): Promise<AiDenoiser | null> {
  if (!aiNoiseSuppressionSupported() || context.sampleRate !== AI_NOISE_SAMPLE_RATE) return null;
  try {
    let ready = registered.get(context);
    if (!ready) {
      ready = context.audioWorklet.addModule(WORKLET_URL);
      registered.set(context, ready);
    }
    const [binary] = await Promise.all([loadModel(), ready]);
    if (context.state === "closed") return null;
    const node = new AudioWorkletNode(context, PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: "explicit",
      processorOptions: { maxChannels: 1, wasmBinary: binary },
    });
    return {
      node,
      destroy: () => {
        try { node.port.postMessage("destroy"); } catch { }
        try { node.disconnect(); } catch { }
      },
    };
  } catch (err) {
    console.warn("[noise] AI noise suppression unavailable", err);
    return null;
  }
}
