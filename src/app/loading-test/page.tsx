"use client";

import { useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowLeft, Check, ClipboardPaste, Copy, Download, Pause, Play, RotateCcw } from "lucide-react";
import { DEFAULT_SPLIT_LOGO_TIMING, SplitLogoLoader, splitLogoTimeline, type SplitLogoTiming } from "@/components/ui/SplitLogoLoader";
import "./preview.css";

const controls: { key: keyof SplitLogoTiming; label: string; min: number; max: number; help: string }[] = [
  { key: "exit", label: "Slide out", min: 200, max: 1000, help: "Seven horizontal strips →" },
  { key: "enter", label: "Drop in", min: 250, max: 1200, help: "Five vertical strips ↓" },
  { key: "stagger", label: "Delay between pairs", min: 10, max: 150, help: "Center, then the neighboring pairs" },
  { key: "gap", label: "Empty beat", min: 0, max: 400, help: "After the last strip has left" },
  { key: "hold", label: "Logo hold", min: 150, max: 1500, help: "Before the exit and after the entrance" },
];

export default function LoadingTestPage() {
  const [timing, setTiming] = useState<SplitLogoTiming>({ ...DEFAULT_SPLIT_LOGO_TIMING });
  const [size, setSize] = useState(112);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [seek, setSeek] = useState<number>();
  const [replay, setReplay] = useState(0);
  const [light, setLight] = useState(false);
  const [copied, setCopied] = useState(false);
  const [settingsText, setSettingsText] = useState("");
  const settingsInput = useRef<HTMLTextAreaElement>(null);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [showLabel, setShowLabel] = useState(true);
  const [exporting, setExporting] = useState<"gif" | "mp4" | null>(null);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState("");
  const timeline = splitLogoTimeline(timing);
  const elapsed = progress * timeline.duration;
  const phase = elapsed < timeline.exitStart ? "Logo hold" : elapsed < timeline.exitEnd ? "Seven strips · right" : elapsed < timeline.enterStart ? "Empty beat" : elapsed < timeline.enterEnd ? "Five strips · down" : "Settled";

  function restart() { setReplay((value) => value + 1); setProgress(0); setSeek(undefined); setPaused(false); }
  function scrub(value: number) { setPaused(true); setProgress(value); setSeek(value); }
  function reset() { setTiming({ ...DEFAULT_SPLIT_LOGO_TIMING }); setSize(112); setShowLabel(true); restart(); }
  const sharedSettings = JSON.stringify({ size, timing, background: light ? "light" : "dark", showLabel }, null, 2);
  async function copy() {
    setSettingsText(sharedSettings);
    window.requestAnimationFrame(() => settingsInput.current?.select());
    try {
      await navigator.clipboard.writeText(sharedSettings);
      setCopied(true);
      setSettingsMessage("Settings copied.");
    } catch { setCopied(false); setSettingsMessage("Clipboard unavailable. The settings text is selected; use ⌘C or Ctrl+C to copy it."); }
  }

  function applySettings(raw: string) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") throw new Error("Paste a settings object.");
      const incoming = parsed as Record<string, unknown>;
      if (!incoming.timing || typeof incoming.timing !== "object") throw new Error("Timing values are missing.");
      const nextTiming = incoming.timing as Record<string, unknown>;
      const bounded = (value: unknown, min: number, max: number, label: string) => {
        if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
          throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
        }
        return value;
      };
      const nextSize = bounded(incoming.size, 48, 160, "Logo size");
      const validated = {} as SplitLogoTiming;
      for (const control of controls) validated[control.key] = bounded(nextTiming[control.key], control.min, control.max, control.label);
      if (incoming.background !== undefined && incoming.background !== "dark" && incoming.background !== "light") throw new Error("Background must be dark or light.");
      if (incoming.showLabel !== undefined && typeof incoming.showLabel !== "boolean") throw new Error("Show label must be true or false.");
      setTiming(validated);
      setSize(nextSize);
      if (incoming.background) setLight(incoming.background === "light");
      if (incoming.showLabel !== undefined) setShowLabel(incoming.showLabel);
      restart();
      setSettingsMessage("Settings applied. Preview restarted.");
      setCopied(false);
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : "Could not read those settings.");
    }
  }

  async function pasteFromClipboard() {
    settingsInput.current?.focus();
    try {
      const contents = await Promise.race([
        navigator.clipboard.readText(),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("Clipboard permission unavailable")), 900)),
      ]);
      setSettingsText(contents);
      applySettings(contents);
    } catch { setSettingsMessage("Clipboard access unavailable. Paste into the box with ⌘V or Ctrl+V, then select Apply."); }
  }

  async function download(format: "gif" | "mp4") {
    setExporting(format);
    setExportProgress(0);
    setExportMessage("");
    try {
      const options = { size, timing, light, showLabel,
        onProgress: (done: number, total: number) => setExportProgress(Math.round(done / total * 100)) };
      const blob = format === "mp4"
        ? await (await import("@/lib/export-split-logo-mp4")).exportSplitLogoMp4(options)
        : await (await import("@/lib/export-split-logo-gif")).exportSplitLogoGif(options);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `disband-split-logo.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      const fps = format === "mp4" ? 60 : 50;
      const fileSize = blob.size < 1024 * 1024
        ? `${Math.round(blob.size / 1024)} KB`
        : `${(blob.size / 1024 / 1024).toFixed(1)} MB`;
      setExportMessage(`${format.toUpperCase()} ready · ${fileSize} · ${Math.round(timeline.duration * fps / 1000)} frames at ${fps} fps`);
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "Export failed.");
    } finally { setExporting(null); }
  }

  return <main className="loader-lab">
    <div className="loader-lab-shell">
      <header className="loader-lab-header"><Link href="/app"><ArrowLeft size={15} /> Back to Disband</Link><span>MOTION STUDY / 01</span></header>
      <div className="loader-lab-intro"><p>DISBAND · LOADING ANIMATION</p><h1>Split. Slide. Settle.</h1><span>Seven strips out. Five strips in. Always from the center.</span></div>
      <div className="loader-lab-layout">
        <section className="loader-lab-player" aria-label="Animation preview">
          <div className="loader-lab-player-bar"><span>Live preview</span><button type="button" onClick={() => setLight(!light)}>{light ? "Dark background" : "Light background"}</button></div>
          <div className={`loader-lab-stage ${light ? "is-light" : ""}`}>
            <span className="loader-lab-registration loader-lab-registration-top" />
            <SplitLogoLoader size={size} timing={timing} paused={paused} progress={seek} replayKey={replay} onProgress={setProgress} />
            <span className="loader-lab-registration loader-lab-registration-bottom" />
            {showLabel && <p className="loader-lab-stage-label">Loading Disband</p>}
          </div>
          <div className="loader-lab-transport">
            <button type="button" onClick={() => { setSeek(undefined); setPaused(!paused); }} aria-label={paused ? "Play animation" : "Pause animation"}>{paused ? <Play size={18} /> : <Pause size={18} />}</button>
            <button type="button" onClick={restart} aria-label="Replay animation"><RotateCcw size={17} /></button>
            <div><strong>{phase}</strong><span>{(elapsed / 1000).toFixed(2)} / {(timeline.duration / 1000).toFixed(2)}s</span></div>
          </div>
          <label className="loader-lab-scrubber"><span>Scrub the animation</span><input aria-label="Animation position" type="range" min={0} max={1000} value={Math.round(progress * 1000)} onChange={(event) => scrub(Number(event.target.value) / 1000)} /></label>
          <div className="loader-lab-phases">
            {[
              { label: "Hold", at: 0, width: timing.hold },
              { label: "7 →", at: (timeline.exitStart + timing.exit * .55 + timing.stagger) / timeline.duration, width: timeline.exitEnd - timeline.exitStart },
              { label: "Beat", at: (timeline.exitEnd + timing.gap / 2) / timeline.duration, width: Math.max(100, timing.gap) },
              { label: "5 ↓", at: (timeline.enterStart + timing.enter * .4) / timeline.duration, width: timeline.enterEnd - timeline.enterStart },
              { label: "Settle", at: (timeline.enterEnd + timing.hold / 2) / timeline.duration, width: timing.hold },
            ].map((segment) => <button key={segment.label} type="button" onClick={() => scrub(segment.at)} style={{ flexGrow: segment.width } as CSSProperties}>{segment.label}</button>)}
          </div>
          <p className="loader-lab-note">Pause and drag to inspect any frame. Reduced-motion settings show a still logo.</p>
        </section>

        <aside className="loader-lab-controls" aria-label="Animation settings">
          <div className="loader-lab-controls-heading"><h2>Fine-tune the rhythm</h2><button type="button" onClick={reset}>Reset</button></div>
          {controls.map((control) => <label className="loader-lab-control" key={control.key}>
            <span>{control.label}<output>{timing[control.key]} ms</output></span>
            <input aria-label={control.label} type="range" min={control.min} max={control.max} step={5} value={timing[control.key]} onChange={(event) => { setTiming({ ...timing, [control.key]: Number(event.target.value) }); setCopied(false); restart(); }} />
            <small>{control.help}</small>
          </label>)}
          <label className="loader-lab-control"><span>Logo size<output>{size} px</output></span><input aria-label="Logo size" type="range" min={48} max={160} step={4} value={size} onChange={(event) => { setSize(Number(event.target.value)); setCopied(false); }} /><small>Size of the mark itself, without its runway</small></label>
          <div className="loader-lab-sequence"><span>Exit order</span><code>4 → 3 + 5 → 2 + 6 → 1 + 7</code><span>Entrance order</span><code>3 → 2 + 4 → 1 + 5</code></div>
          <label className="loader-lab-check"><input type="checkbox" checked={showLabel} onChange={(event) => setShowLabel(event.target.checked)} /> Include loading label in exports</label>
          <div className="loader-lab-import">
            <h3>Share settings</h3>
            <p>Copy these settings, or paste someone else’s here.</p>
            <textarea ref={settingsInput} aria-label="Settings JSON" value={settingsText} onChange={(event) => setSettingsText(event.target.value)} placeholder={sharedSettings} spellCheck={false} rows={6} />
            <div className="loader-lab-import-actions">
              <button type="button" onClick={() => void copy()}><Copy size={14} />{copied ? "Copied" : "Copy settings"}</button>
              <button type="button" onClick={() => void pasteFromClipboard()}><ClipboardPaste size={14} /> Paste</button>
              <button type="button" onClick={() => applySettings(settingsText)}><Check size={14} /> Apply</button>
            </div>
            {settingsMessage && <p role="status" className="loader-lab-feedback">{settingsMessage}</p>}
          </div>
          <button type="button" className="loader-lab-download" disabled={exporting !== null} onClick={() => void download("mp4")}><Download size={16} />{exporting === "mp4" ? `Rendering MP4 · ${exportProgress}%` : "Download MP4 · 60 fps"}</button>
          <button type="button" className="loader-lab-download loader-lab-download-secondary" disabled={exporting !== null} onClick={() => void download("gif")}><Download size={16} />{exporting === "gif" ? `Rendering GIF · ${exportProgress}%` : "Download GIF · 50 fps"}</button>
          <p className="loader-lab-gif-note">MP4 preserves 60 fps timing. GIF uses steady 20 ms frames for more reliable playback.</p>
          {exportMessage && <p role="status" className="loader-lab-feedback">{exportMessage}</p>}
        </aside>
      </div>
    </div>
  </main>;
}
