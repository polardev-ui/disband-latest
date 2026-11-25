"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { useAudioDevices } from "@/hooks/useAudioDevices";
import { getDisbandUserMedia } from "@/lib/media";
import { isTauri } from "@/lib/platform";
import { confirmDialog } from "@/lib/dialogs";
import { aiNoiseSuppressionSupported } from "@/lib/noise-suppression";
import { playCallConnected, playCallEnd, playCallJoin, playCallLeave, playUpdateReady } from "@/lib/call-sounds";
import { getActiveVoiceMixer, setPushToTalkRecording } from "@/lib/voice-mixer";
import type { SubscriptionPlan } from "@/lib/subscription";
import {
  allowedFrameRates,
  allowedResolutions,
  getStreamQuality,
  resolutionLabel,
  setStreamQuality,
  type FrameRate,
  type StreamResolution,
} from "@/lib/stream-quality";
import {
  MAX_INPUT_VOLUME,
  MAX_PTT_RELEASE_MS,
  SENSITIVITY_MAX_DB,
  SENSITIVITY_MIN_DB,
  VOICE_SETTINGS_EVENT,
  buildVideoConstraints,
  getAutoGainControl,
  getAutoSensitivity,
  getEchoCancellation,
  getInputMode,
  getInputProfile,
  getInputSensitivity,
  getInputVolume,
  getMirrorOwnVideo,
  getNoiseSuppressionMode,
  getOutputVolume,
  getPreferredAudioInputId,
  getPreferredAudioOutputId,
  getPreferredVideoInputId,
  getPushToTalkKey,
  getPushToTalkReleaseDelay,
  getSoundboardVolume,
  isAppSoundEnabled,
  isAppleWebKit,
  resetVoiceSettings,
  setAppSoundEnabled,
  setAutoGainControl,
  setAutoSensitivity,
  setEchoCancellation,
  setInputMode,
  setInputProfile,
  setInputSensitivity,
  setInputVolume,
  setMirrorOwnVideo,
  setNoiseSuppressionMode,
  setOutputVolume,
  setPreferredAudioInputId,
  setPreferredAudioOutputId,
  setPreferredVideoInputId,
  setPushToTalkKey,
  setPushToTalkReleaseDelay,
  setSoundboardVolume,
  type AppSound,
  type InputProfile,
  type NoiseSuppressionMode,
} from "@/lib/audio-settings";
import { Toggle, settingsInputClass } from "./SettingsPrimitives";
import { useMicMonitor } from "./useMicMonitor";

/*
 Voice & Video: one scrolling page, in the order you'd set things up. The
 sidebar's sub-links (VoiceVideoSubNav) jump to each part.

 Every control writes its setting straight away. A call in progress picks
 the change up by itself (VoiceMixer listens for VOICE_SETTINGS_EVENT), and
 the portable ones follow the account to the other app.
*/

export const VOICE_VIDEO_SECTIONS = [
  { id: "voice", label: "Voice" },
  { id: "camera", label: "Camera" },
  { id: "streaming", label: "Streaming" },
  { id: "sounds", label: "Sounds" },
  { id: "soundboard", label: "Soundboard" },
  { id: "advanced", label: "Advanced" },
] as const;

type SectionId = (typeof VOICE_VIDEO_SECTIONS)[number]["id"];

const sectionDomId = (id: SectionId) => `vv-${id}`;

/** Re-reads settings whenever any of them changes (here, in a call, or from the other app). */
function useVoiceSettings() {
  const read = () => ({
    inputId: getPreferredAudioInputId() ?? "",
    outputId: getPreferredAudioOutputId() ?? "",
    videoId: getPreferredVideoInputId() ?? "",
    inputVolume: getInputVolume(),
    outputVolume: getOutputVolume(),
    profile: getInputProfile(),
    noiseMode: getNoiseSuppressionMode(),
    echo: getEchoCancellation(),
    agc: getAutoGainControl(),
    autoSensitivity: getAutoSensitivity(),
    sensitivity: getInputSensitivity(),
    inputMode: getInputMode(),
    pttKey: getPushToTalkKey(),
    pttRelease: getPushToTalkReleaseDelay(),
    mirror: getMirrorOwnVideo(),
    soundboardVolume: getSoundboardVolume(),
  });
  const [state, setState] = useState(read);
  useEffect(() => {
    const onChange = () => setState(read());
    window.addEventListener(VOICE_SETTINGS_EVENT, onChange);
    return () => window.removeEventListener(VOICE_SETTINGS_EVENT, onChange);
  }, []);
  return state;
}

export function VoiceVideoPanel({ plan }: { plan: SubscriptionPlan }) {
  const { t } = useI18n();
  const s = useVoiceSettings();
  const { inputs, outputs, cameras, loading: devicesLoading, refresh: refreshDevices } = useAudioDevices();
  const mic = useMicMonitor();
  const [showMoreVoice, setShowMoreVoice] = useState(false);

  // Device names only appear once the browser has been allowed the mic.
  useEffect(() => {
    if (mic.testing) void refreshDevices();
  }, [mic.testing, refreshDevices]);

  const custom = s.profile === "custom";

  return (
    <div className="vv-page pb-10">
      {/* ---------------------------------------------------------------- Voice */}
      <Section id="voice" title={t("Voice")}>
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          <Field label={t("Microphone")}>
            <DeviceSelect
              value={s.inputId}
              disabled={devicesLoading}
              devices={inputs}
              defaultLabel={t("System default")}
              onChange={setPreferredAudioInputId}
            />
          </Field>
          <Field label={t("Speaker")}>
            <DeviceSelect
              value={s.outputId}
              disabled={devicesLoading || outputs.length === 0}
              devices={outputs}
              defaultLabel={t("System default")}
              onChange={setPreferredAudioOutputId}
            />
          </Field>
          <Field label={t("Microphone volume")} trailing={`${s.inputVolume}%`}>
            <RangeSlider
              label={t("Microphone volume")}
              min={0}
              max={MAX_INPUT_VOLUME}
              value={s.inputVolume}
              marks={[100]}
              onChange={setInputVolume}
            />
          </Field>
          <Field label={t("Speaker volume")} trailing={`${s.outputVolume}%`}>
            <RangeSlider label={t("Speaker volume")} min={0} max={100} value={s.outputVolume} onChange={setOutputVolume} />
          </Field>
        </div>
        {inputs.length === 0 && !devicesLoading && (
          <p className="mt-3 text-[13px] leading-[18px] text-text-muted">
            {t("Device names show up once Disband can use your microphone. Run a mic test to allow it.")}
          </p>
        )}

        <div className="mt-6 flex items-center gap-4">
          <button
            type="button"
            onClick={() => (mic.testing ? mic.stop() : void mic.start())}
            className={`h-9 shrink-0 rounded-lg px-4 text-[14px] font-semibold transition-colors ${
              mic.testing ? "bg-bg-accent text-header-primary hover:bg-interactive-hover" : "bg-brand text-white hover:bg-brand-hover"
            }`}
          >
            {mic.testing ? t("Stop testing") : t("Mic test")}
          </button>
          <LevelBars level={mic.level} active={mic.testing || mic.live} />
        </div>
        <p className="mt-2 min-h-[18px] text-[13px] leading-[18px] text-text-muted">
          {mic.error ? (
            <span className="text-status-dnd">{mic.error}</span>
          ) : mic.testing ? (
            t("Talk and you'll hear yourself as others will. Use headphones to avoid an echo.")
          ) : (
            t("Mic not picking up? Check it isn't muted in your system settings, then pick it above rather than using the default.")
          )}
        </p>

        <Divider />

        <SubHeading>{t("Input profile")}</SubHeading>
        <div role="radiogroup" aria-label={t("Input profile")} className="space-y-1">
          <ProfileOption
            value="isolation"
            current={s.profile}
            title={t("Voice isolation")}
            description={
              aiNoiseSuppressionSupported()
                ? t("Only your voice gets through. Background noise and echo are removed on your device. Needs a reasonably fast computer.")
                : t("Only your voice gets through. Your browser can't run the voice model, so its own filter is used instead.")
            }
          />
          <ProfileOption
            value="studio"
            current={s.profile}
            title={t("Studio")}
            description={t("Your mic exactly as it sounds, always on. For good mics in quiet rooms, and music.")}
          />
          <ProfileOption
            value="custom"
            current={s.profile}
            title={t("Custom")}
            description={t("Set each part of the processing yourself.")}
          />
        </div>

        {s.inputMode === "voice" && s.profile !== "studio" && (
          <SensitivityControl
            auto={s.profile === "isolation" ? true : s.autoSensitivity}
            autoLocked={s.profile === "isolation"}
            thresholdDb={s.sensitivity}
            level={mic.level}
            live={mic.testing || mic.live}
            gateAvailable={mic.gateAvailable}
          />
        )}

        {custom && (
          <>
            <Row
              label={t("Noise suppression")}
              description={
                s.noiseMode === "ai"
                  ? t("A speech model on your device keeps only your voice. If people say you sound crackly, use Standard.")
                  : s.noiseMode === "standard"
                    ? t("Your browser's built-in filter. Steady on any computer; very loud noise can still get through.")
                    : t("No filtering.")
              }
            >
              <select
                value={s.noiseMode}
                onChange={(e) => setNoiseSuppressionMode(e.target.value as NoiseSuppressionMode)}
                className={`${settingsInputClass} !w-44 !py-2 !text-[14px]`}
                aria-label={t("Noise suppression")}
              >
                <option value="standard">{t("Standard")}</option>
                <option value="ai" disabled={!aiNoiseSuppressionSupported()}>{t("Voice model")}</option>
                <option value="off">{t("Off")}</option>
              </select>
            </Row>
            <Row
              label={t("Echo cancellation")}
              description={isAppleWebKit()
                ? t("Stops your speakers echoing back into the call. On a Mac it can also cut you out when you talk quietly or over someone; with headphones, turn it off.")
                : t("Stops your speakers echoing back into the call. Only turn it off if you wear headphones.")}
            >
              <Toggle label={t("Echo cancellation")} checked={s.echo} onChange={setEchoCancellation} />
            </Row>
          </>
        )}

        <Row
          label={t("Push to talk")}
          description={s.inputMode === "ptt"
            ? t("You're only heard while you hold the key.")
            : t("Only send your voice while you hold a key, instead of whenever you talk.")}
        >
          <Toggle label={t("Push to talk")} checked={s.inputMode === "ptt"} onChange={(on) => setInputMode(on ? "ptt" : "voice")} />
        </Row>
        {s.inputMode === "ptt" && (
          <div className="grid gap-x-6 gap-y-5 pb-2 pt-1 sm:grid-cols-2">
            <Field label={t("Shortcut")}>
              <KeyRecorder code={s.pttKey} onChange={setPushToTalkKey} />
            </Field>
            <Field label={t("Release delay")} trailing={`${s.pttRelease} ms`}>
              <RangeSlider label={t("Release delay")} min={0} max={MAX_PTT_RELEASE_MS} step={10} value={s.pttRelease} onChange={setPushToTalkReleaseDelay} />
            </Field>
            <p className="text-[13px] leading-[18px] text-text-muted sm:col-span-2">
              {isTauri()
                ? t("Works while the Disband window is in front. Holding the key in another app doesn't open your mic yet.")
                : t("Works while this tab is in front. Browsers can't see keys pressed in other apps; the desktop app is the same for now.")}
            </p>
          </div>
        )}

        <Disclosure
          open={showMoreVoice}
          onToggle={() => setShowMoreVoice((v) => !v)}
          title={t("More voice settings")}
          summary={custom ? t("Automatic gain control") : t("Available with the Custom profile")}
        >
          {custom ? (
            <Row
              label={t("Automatic gain control")}
              description={t("Evens out how loud you are. If you still sound quiet, turn it off and raise your mic volume instead: on Windows it can lower your mic in system settings.")}
            >
              <Toggle label={t("Automatic gain control")} checked={s.agc} onChange={setAutoGainControl} />
            </Row>
          ) : (
            <p className="py-3 text-[14px] leading-5 text-text-muted">
              {t("Voice isolation and Studio set these for you. Pick Custom to change them one by one.")}
            </p>
          )}
        </Disclosure>
      </Section>

      {/* --------------------------------------------------------------- Camera */}
      <Section id="camera" title={t("Camera")}>
        <CameraPreview plan={plan} cameraId={s.videoId} mirror={s.mirror} />
        <div className="mt-5">
          <Field label={t("Camera")}>
            <DeviceSelect
              value={s.videoId}
              disabled={devicesLoading}
              devices={cameras}
              defaultLabel={t("System default")}
              onChange={setPreferredVideoInputId}
            />
          </Field>
        </div>
        <Row label={t("Mirror my camera")} description={t("Show your own video flipped, like a mirror. Everyone else always sees it the right way round.")}>
          <Toggle label={t("Mirror my camera")} checked={s.mirror} onChange={setMirrorOwnVideo} />
        </Row>
      </Section>

      {/* ------------------------------------------------------------ Streaming */}
      <Section id="streaming" title={t("Streaming")}>
        <StreamQualityPicker plan={plan} />
      </Section>

      {/* --------------------------------------------------------------- Sounds */}
      <Section id="sounds" title={t("Sounds")}>
        <p className="-mt-1 mb-2 text-[14px] leading-5 text-text-muted">
          {t("Turn off any of these one by one. All sounds can be turned off under Notifications.")}
        </p>
        <SoundToggles />
      </Section>

      {/* ----------------------------------------------------------- Soundboard */}
      <Section id="soundboard" title={t("Soundboard")}>
        <Field label={t("Soundboard volume")} trailing={`${s.soundboardVolume}%`} description={t("How loud soundboard clips are for you. Others hear them at their own volume.")}>
          <RangeSlider label={t("Soundboard volume")} min={0} max={100} value={s.soundboardVolume} onChange={setSoundboardVolume} />
        </Field>
      </Section>

      {/* ------------------------------------------------------------- Advanced */}
      <Section id="advanced" title={t("Advanced")}>
        <Diagnostics />
        <Row label={t("Reset Voice & Video settings")} description={t("Put every setting on this page back to its default, on all your devices. Your chosen devices stay.")}>
          <button
            type="button"
            onClick={() =>
              void confirmDialog({
                title: t("Reset Voice & Video settings?"),
                body: t("Every setting on this page goes back to its default, here and in your other Disband apps."),
                confirmLabel: t("Reset"),
                tone: "danger",
                action: () => resetVoiceSettings(),
              })
            }
            className="h-9 shrink-0 rounded-lg border border-status-dnd/40 px-4 text-[14px] font-semibold text-status-dnd transition-colors hover:bg-status-dnd/10"
          >
            {t("Reset")}
          </button>
        </Row>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-navigation shown under "Voice & Video" in the settings sidebar

export function VoiceVideoSubNav() {
  const { t } = useI18n();
  const [active, setActive] = useState<SectionId>("voice");

  useEffect(() => {
    const scroller = document.querySelector<HTMLElement>(".settings-scroll");
    if (!scroller) return;
    const onScroll = () => {
      const top = scroller.getBoundingClientRect().top + 96;
      let current: SectionId = "voice";
      for (const section of VOICE_VIDEO_SECTIONS) {
        const el = document.getElementById(sectionDomId(section.id));
        if (el && el.getBoundingClientRect().top <= top) current = section.id;
      }
      // The last sections are short: at the very bottom, the last one is it.
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) current = "advanced";
      setActive(current);
    };
    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="mb-1 ml-[22px] border-l border-border-subtle pl-2">
      {VOICE_VIDEO_SECTIONS.map((section) => (
        <button
          key={section.id}
          type="button"
          onClick={() => {
            document.getElementById(sectionDomId(section.id))?.scrollIntoView({ behavior: "smooth", block: "start" });
            setActive(section.id);
          }}
          className={`relative flex h-8 w-full items-center rounded-md px-2.5 text-left text-[14px] transition-colors duration-75 ${
            active === section.id
              ? "font-semibold text-interactive-active before:absolute before:-left-[9px] before:top-1.5 before:h-5 before:w-0.5 before:rounded-full before:bg-interactive-active"
              : "font-medium text-interactive-normal hover:bg-interactive-hover hover:text-text-normal"
          }`}
        >
          {t(section.label)}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout pieces

function Section({ id, title, children }: { id: SectionId; title: string; children: ReactNode }) {
  return (
    <section id={sectionDomId(id)} className="scroll-mt-6 border-b border-border-subtle pb-10 pt-2 [&:not(:first-child)]:pt-10 last:border-b-0">
      <h3 className="mb-5 text-[20px] font-semibold leading-6 tracking-[-0.01em] text-header-primary">{title}</h3>
      {children}
    </section>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return <h4 className="mb-2 text-[15px] font-semibold leading-5 text-header-primary">{children}</h4>;
}

function Divider() {
  return <div aria-hidden className="my-7 h-px bg-border-subtle" />;
}

function Field({ label, trailing, description, children }: { label: string; trailing?: string; description?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-semibold leading-5 text-header-primary">{label}</span>
        {trailing && <span className="text-[13px] tabular-nums text-text-muted">{trailing}</span>}
      </div>
      {description && <p className="-mt-1 mb-3 text-[13px] leading-[18px] text-text-muted">{description}</p>}
      {children}
    </div>
  );
}

function Row({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-4">
      <div className="min-w-0">
        <div className="text-[15px] font-semibold leading-5 text-header-primary">{label}</div>
        {description && <p className="mt-1 text-[13px] leading-[18px] text-text-muted">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Disclosure({ open, onToggle, title, summary, children }: { open: boolean; onToggle: () => void; title: string; summary: string; children: ReactNode }) {
  return (
    <div className="pt-2">
      <button type="button" onClick={onToggle} aria-expanded={open} className="group flex w-full items-center justify-between gap-6 py-3 text-left">
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold leading-5 text-header-primary">{title}</span>
          <span className="mt-1 block text-[13px] leading-[18px] text-text-muted">{summary}</span>
        </span>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-accent text-interactive-normal transition-colors group-hover:bg-interactive-hover group-hover:text-interactive-active">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open && <div className="vv-reveal">{children}</div>}
    </div>
  );
}

function DeviceSelect({
  value,
  devices,
  disabled,
  defaultLabel,
  onChange,
}: {
  value: string;
  devices: { deviceId: string; label: string }[];
  disabled?: boolean;
  defaultLabel: string;
  onChange: (id: string) => void;
}) {
  // A saved device that isn't plugged in still shows, so the choice isn't
  // silently lost; calls use the default until it's back.
  const missing = value && !devices.some((d) => d.deviceId === value) && devices.length > 0;
  const { t } = useI18n();
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`${settingsInputClass} !py-2 !text-[14px]`}
    >
      <option value="">{defaultLabel}</option>
      {devices
        .filter((d) => d.deviceId !== "default" && d.deviceId !== "")
        .map((d) => (
          <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
        ))}
      {missing && <option value={value}>{t("Not connected")}</option>}
    </select>
  );
}

function RangeSlider({
  label,
  min,
  max,
  step = 1,
  value,
  marks,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  marks?: number[];
  onChange: (value: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="relative">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="disband-range"
        style={{ "--fill": `${pct}%` } as React.CSSProperties}
      />
      {marks?.map((mark) => (
        <span
          key={mark}
          aria-hidden
          className="pointer-events-none absolute top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-muted/50"
          style={{ left: `${((mark - min) / (max - min)) * 100}%` }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mic level and sensitivity

const dbToPct = (db: number) => Math.min(100, Math.max(0, ((db - SENSITIVITY_MIN_DB) / (SENSITIVITY_MAX_DB - SENSITIVITY_MIN_DB)) * 100));

const BAR_COUNT = 48;

function LevelBars({ level, active }: { level: { levelDb: number; open: boolean } | null; active: boolean }) {
  const { t } = useI18n();
  const lit = level ? Math.round((dbToPct(level.levelDb) / 100) * BAR_COUNT) : 0;
  return (
    <div
      role="meter"
      aria-label={t("Microphone level")}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={level ? Math.round(dbToPct(level.levelDb)) : 0}
      className={`flex h-7 min-w-0 flex-1 items-stretch gap-[3px] ${active ? "" : "opacity-60"}`}
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <span
          key={i}
          className="flex-1 rounded-[2px] transition-colors duration-75"
          style={{
            backgroundColor:
              i < lit
                ? i > BAR_COUNT * 0.9
                  ? "var(--status-dnd, #f23f43)"
                  : level?.open === false
                    ? "var(--text-muted)"
                    : "var(--status-online, #23a55a)"
                : "var(--bg-accent, rgba(255,255,255,0.08))",
          }}
        />
      ))}
    </div>
  );
}

function SensitivityControl({
  auto,
  autoLocked,
  thresholdDb,
  level,
  live,
  gateAvailable,
}: {
  auto: boolean;
  autoLocked: boolean;
  thresholdDb: number;
  level: { levelDb: number; thresholdDb: number; open: boolean } | null;
  live: boolean;
  gateAvailable: boolean;
}) {
  const { t } = useI18n();
  // In auto the gate sets its own threshold; show where it is.
  const shownThreshold = auto ? level?.thresholdDb ?? null : thresholdDb;
  const thresholdPct = shownThreshold === null ? null : dbToPct(shownThreshold);
  const levelPct = level ? dbToPct(level.levelDb) : 0;
  const open = level?.open ?? false;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-5 text-header-primary">{t("Adjust input sensitivity automatically")}</div>
          <p className="mt-1 text-[13px] leading-[18px] text-text-muted">
            {autoLocked
              ? t("Voice isolation always does this. Pick Custom to set it by hand.")
              : auto
                ? t("Disband listens to the room and only sends sound louder than its background noise.")
                : t("Drag the marker: sound to the right of it is sent, sound to the left isn't.")}
          </p>
        </div>
        <Toggle label={t("Adjust input sensitivity automatically")} checked={auto} disabled={autoLocked} onChange={setAutoSensitivity} />
      </div>

      <div className={`relative mt-4 h-8 ${auto ? "" : "cursor-pointer"}`}>
        {/* The track: quiet side and loud side of the threshold. */}
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-bg-accent">
          {thresholdPct !== null && (
            <>
              <div className="absolute inset-y-0 left-0 bg-[#f0b232]/30" style={{ width: `${thresholdPct}%` }} />
              <div className="absolute inset-y-0 right-0 bg-status-online/30" style={{ left: `${thresholdPct}%` }} />
            </>
          )}
          {/* Live level. */}
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-75"
            style={{ width: `${levelPct}%`, backgroundColor: open ? "var(--status-online, #23a55a)" : "#f0b232" }}
          />
        </div>
        {auto ? (
          thresholdPct !== null && (
            <span
              aria-hidden
              className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80 transition-[left] duration-300"
              style={{ left: `${thresholdPct}%` }}
            />
          )
        ) : (
          <input
            type="range"
            min={SENSITIVITY_MIN_DB}
            max={SENSITIVITY_MAX_DB}
            step={1}
            value={thresholdDb}
            onChange={(e) => setInputSensitivity(Number(e.target.value))}
            aria-label={t("Input sensitivity")}
            aria-valuetext={`${thresholdDb} dB`}
            className="disband-range disband-range-bare absolute inset-0 h-full w-full"
          />
        )}
      </div>
      <p className="mt-1 flex justify-between text-[12px] tabular-nums text-text-muted">
        <span>
          {!gateAvailable
            ? t("Sensitivity isn't supported in this browser; your mic is always on.")
            : !live
              ? t("Run a mic test to see your level.")
              : open
                ? t("You're being heard")
                : t("Too quiet to send")}
        </span>
        {!auto && <span>{thresholdDb} dB</span>}
      </p>
    </div>
  );
}

function ProfileOption({ value, current, title, description }: { value: InputProfile; current: InputProfile; title: string; description: string }) {
  const checked = value === current;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={() => setInputProfile(value)}
      className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-interactive-hover/60"
    >
      <span
        aria-hidden
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          checked ? "border-brand" : "border-interactive-normal"
        }`}
      >
        {checked && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-medium leading-5 text-header-primary">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-[18px] text-text-muted">{description}</span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Push to talk key

function keyName(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  const named: Record<string, string> = {
    Backquote: "`",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Space: "Space",
    CapsLock: "Caps Lock",
    ShiftLeft: "Left Shift",
    ShiftRight: "Right Shift",
    ControlLeft: "Left Ctrl",
    ControlRight: "Right Ctrl",
    AltLeft: "Left Alt",
    AltRight: "Right Alt",
    MetaLeft: "Left ⌘",
    MetaRight: "Right ⌘",
  };
  return named[code] ?? code;
}

function KeyRecorder({ code, onChange }: { code: string; onChange: (code: string) => void }) {
  const { t } = useI18n();
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;
    setPushToTalkRecording(true);
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code !== "Escape") onChange(event.code);
      setRecording(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      setPushToTalkRecording(false);
    };
  }, [recording, onChange]);

  return (
    <button
      type="button"
      onClick={() => setRecording((r) => !r)}
      className={`flex h-10 w-full items-center justify-between rounded-lg border px-3 text-[14px] transition-colors ${
        recording ? "border-status-dnd/60 bg-status-dnd/10 text-status-dnd" : "border-border-subtle bg-bg-tertiary text-text-normal hover:border-border-strong"
      }`}
    >
      <span className="font-semibold">{recording ? t("Press a key…") : keyName(code)}</span>
      <span className="text-[12px] text-text-muted">{recording ? t("Esc to cancel") : t("Change")}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Camera

function CameraPreview({ plan, cameraId, mirror }: { plan: SubscriptionPlan; cameraId: string; mirror: boolean }) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setOn(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await getDisbandUserMedia({ audio: false, video: buildVideoConstraints(plan) }, plan);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => {});
      }
      setOn(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Couldn't open the camera."));
      stop();
    }
  }, [plan, stop, t]);

  useEffect(() => stop, [stop]);
  // A new camera picked while previewing: switch to it.
  useEffect(() => {
    if (streamRef.current) void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId]);

  return (
    <div>
      <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-bg-tertiary">
        <video
          ref={videoRef}
          muted
          playsInline
          className={`absolute inset-0 h-full w-full object-cover ${on ? "" : "invisible"} ${mirror ? "scale-x-[-1]" : ""}`}
        />
        {!on && (
          <button type="button" onClick={() => void start()} className="relative h-9 rounded-lg bg-brand px-4 text-[14px] font-semibold text-white transition-colors hover:bg-brand-hover">
            {t("Test video")}
          </button>
        )}
        {on && (
          <button
            type="button"
            onClick={stop}
            className="absolute bottom-3 right-3 h-8 rounded-lg bg-black/60 px-3 text-[13px] font-semibold text-white backdrop-blur transition-colors hover:bg-black/75"
          >
            {t("Stop video")}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-[13px] text-status-dnd">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Streaming

function StreamQualityPicker({ plan }: { plan: SubscriptionPlan }) {
  const { t } = useI18n();
  const [quality, setQuality] = useState(() => getStreamQuality(plan));
  useEffect(() => setQuality(getStreamQuality(plan)), [plan]);
  const update = (next: typeof quality) => {
    setQuality(next);
    setStreamQuality(next);
  };
  const resolutions = allowedResolutions(plan);
  const rates = allowedFrameRates(plan);
  return (
    <>
      <p className="-mt-1 mb-4 text-[14px] leading-5 text-text-muted">
        {t("The quality your screen shares start at. You can still change it while sharing.")}
      </p>
      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        <Field label={t("Resolution")}>
          <Segmented
            value={String(quality.resolution)}
            options={resolutions.map((r) => ({ value: String(r), label: resolutionLabel(r) }))}
            onChange={(v) => update({ ...quality, resolution: (v === "source" ? "source" : Number(v)) as StreamResolution })}
          />
        </Field>
        <Field label={t("Frame rate")}>
          <Segmented
            value={String(quality.fps)}
            options={rates.map((f) => ({ value: String(f), label: `${f} fps` }))}
            onChange={(v) => update({ ...quality, fps: Number(v) as FrameRate })}
          />
        </Field>
      </div>
      {plan !== "aero" && (
        <p className="mt-3 text-[13px] leading-[18px] text-text-muted">{t("Higher resolutions and frame rates come with Disband Lite and Aero.")}</p>
      )}
    </>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    <div role="radiogroup" className="flex flex-wrap gap-1 rounded-lg bg-bg-tertiary p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={`h-8 min-w-[56px] flex-1 rounded-md px-2.5 text-[13px] font-semibold transition-colors ${
            option.value === value ? "bg-bg-primary text-header-primary shadow-[var(--elevation-low)]" : "text-interactive-normal hover:text-interactive-active"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sounds

const SOUNDS: { id: AppSound; label: string; play: () => void }[] = [
  { id: "callJoin", label: "Someone joins your voice channel", play: () => playCallJoin(true) },
  { id: "callLeave", label: "Someone leaves your voice channel", play: () => playCallLeave(true) },
  { id: "callConnected", label: "You connect to voice", play: () => playCallConnected(true) },
  { id: "callEnd", label: "A call ends", play: () => playCallEnd(true) },
  { id: "updateReady", label: "An update is ready", play: () => playUpdateReady(true) },
];

function SoundToggles() {
  const { t } = useI18n();
  const [, force] = useState(0);
  useEffect(() => {
    const onChange = () => force((n) => n + 1);
    window.addEventListener(VOICE_SETTINGS_EVENT, onChange);
    return () => window.removeEventListener(VOICE_SETTINGS_EVENT, onChange);
  }, []);
  return (
    <div className="divide-y divide-border-subtle">
      {SOUNDS.map((sound) => {
        const enabled = isAppSoundEnabled(sound.id);
        return (
          <div key={sound.id} className="flex items-center justify-between gap-6 py-3">
            <div className="min-w-0">
              <div className="text-[15px] font-medium leading-5 text-header-primary">{t(sound.label)}</div>
              <button
                type="button"
                // Plays even when it's off, so you know what you're turning on.
                onClick={() => sound.play()}
                className="mt-0.5 text-[13px] font-medium text-text-link hover:underline"
              >
                {t("Play")}
              </button>
            </div>
            <Toggle label={t(sound.label)} checked={enabled} onChange={(on) => setAppSoundEnabled(sound.id, on)} />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diagnostics

function Diagnostics() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const collect = useCallback(async () => {
    const out: string[] = [];
    out.push(`App: ${isTauri() ? "Disband desktop" : "Disband web"} ${process.env.NEXT_PUBLIC_APP_VERSION ?? ""}`.trim());
    out.push(`Browser: ${navigator.userAgent}`);
    try {
      const status = await navigator.permissions?.query({ name: "microphone" as PermissionName });
      if (status) out.push(`Microphone permission: ${status.state}`);
    } catch {
      out.push("Microphone permission: unknown");
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((d) => d.kind === "audioinput");
      out.push(`Microphones: ${inputs.length}${inputs.some((d) => d.label) ? "" : " (names hidden until allowed)"}`);
    } catch {
      out.push("Microphones: couldn't list");
    }
    const saved = getPreferredAudioInputId();
    out.push(`Chosen microphone: ${saved ? "a specific device" : "system default"}`);
    out.push(`Profile: ${getInputProfile()}, mode: ${getInputMode() === "ptt" ? "push to talk" : "voice activity"}`);
    out.push(`Voice model available: ${aiNoiseSuppressionSupported() ? "yes" : "no"}`);
    const mixer = getActiveVoiceMixer();
    if (mixer) {
      out.push(`In a call: yes (audio ${mixer.context.state}, ${mixer.context.sampleRate} Hz, sensitivity ${mixer.gateAvailable ? "on" : "unavailable"})`);
    } else {
      out.push("In a call: no");
    }
    setLines(out);
  }, []);

  useEffect(() => {
    if (open) void collect();
  }, [open, collect]);

  return (
    <Disclosure
      open={open}
      onToggle={() => setOpen((v) => !v)}
      title={t("Diagnostics")}
      summary={t("What Disband can see of your devices, to share with support if your mic or camera won't work.")}
    >
      <div className="mb-2 rounded-lg border border-border-subtle bg-bg-tertiary p-3">
        <pre className="selectable whitespace-pre-wrap break-words font-mono text-[12px] leading-[18px] text-text-normal">{lines.join("\n")}</pre>
      </div>
      <div className="flex gap-2 pb-2">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(lines.join("\n")).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="h-8 rounded-lg bg-bg-accent px-3 text-[13px] font-semibold text-header-primary transition-colors hover:bg-interactive-hover"
        >
          {copied ? t("Copied") : t("Copy")}
        </button>
        <button type="button" onClick={() => void collect()} className="h-8 rounded-lg px-3 text-[13px] font-semibold text-interactive-normal transition-colors hover:bg-interactive-hover hover:text-interactive-active">
          {t("Refresh")}
        </button>
      </div>
    </Disclosure>
  );
}
