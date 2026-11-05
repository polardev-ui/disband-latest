"use client";

import { useEffect, useRef, useState } from "react";
import { IconChevron, IconLock, IconScreenShare, IconScreenShareOff } from "@/components/icons";
import { Tooltip } from "./Tooltip";
import { useApp } from "@/contexts/AppContext";
import { useI18n } from "@/contexts/I18nContext";
import { pushEscapeHandler } from "@/lib/overlay";
import {
  allowedFrameRates,
  allowedResolutions,
  applyStreamQuality,
  FRAME_RATES,
  getStreamQuality,
  resolutionLabel,
  RESOLUTIONS,
  subscribeScreenShare,
  type FrameRate,
  type StreamResolution,
} from "@/lib/stream-quality";

const ALL_RESOLUTIONS: StreamResolution[] = [...RESOLUTIONS, "source"];

/**
 * The caret beside the screen-share button, as in Discord: stop or change the
 * stream, and pick its frame rate and resolution. Changes apply to a share in
 * progress straight away. Options above your plan show which plan has them.
 */
export function StreamShareButton({ sharing, onToggle }: { sharing: boolean; onToggle: () => void | Promise<void> }) {
  const { t } = useI18n();
  const { subscriptionPlan: plan } = useApp();
  const [open, setOpen] = useState(false);
  const [quality, setQuality] = useState(() => getStreamQuality(plan));
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refresh = () => setQuality(getStreamQuality(plan));
    refresh();
    return subscribeScreenShare(refresh);
  }, [plan]);

  useEffect(() => {
    if (!open) return;
    const releaseEscape = pushEscapeHandler(() => setOpen(false));
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      releaseEscape();
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [open]);

  const fpsAllowed = allowedFrameRates(plan);
  const resAllowed = allowedResolutions(plan);
  const needs = (ok: boolean, fps: number, res: StreamResolution) =>
    ok ? null : res === "source" || res === 2160 || res === 1440 || fps > 60 ? "Aero" : "Lite";

  const choose = (next: { fps?: FrameRate; resolution?: StreamResolution }) => {
    const q = { ...quality, ...next };
    setQuality(q);
    void applyStreamQuality(q);
  };

  const action = async (fn: () => Promise<void> | void) => {
    setOpen(false);
    await fn();
  };

  return (
    <div ref={wrapRef} className="relative">
      {/* One pill, like Discord's: share on the left, options on the right. */}
      <div
        className={`flex h-14 items-stretch overflow-hidden rounded-full transition-colors ${
          sharing ? "bg-white text-[#313338]" : "bg-[#2b2d31] text-white"
        }`}
      >
        {/* Stretched to the pill's full height: the tooltip's wrapper centres
            its child, which left the hover fill a short square in the middle. */}
        <Tooltip label={sharing ? t("Stop Streaming") : t("Share Your Screen")} side="top" className="self-stretch !items-stretch">
          <button
            type="button"
            onClick={() => void onToggle()}
            aria-label={sharing ? t("Stop Streaming") : t("Share Your Screen")}
            aria-pressed={sharing || undefined}
            className={`flex w-14 items-center justify-center rounded-l-full pl-1 transition-colors active:scale-95 ${
              sharing ? "hover:bg-[#e3e5e8]" : "hover:bg-[#404249]"
            }`}
          >
            {sharing ? <IconScreenShareOff size={24} /> : <IconScreenShare size={24} />}
          </button>
        </Tooltip>
        <span className={`my-3 w-px ${sharing ? "bg-black/15" : "bg-white/15"}`} aria-hidden />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={t("Stream options")}
          aria-expanded={open}
          aria-haspopup="menu"
          className={`flex w-9 items-center justify-center pr-1 transition-colors ${
            sharing ? "hover:bg-[#e3e5e8]" : "hover:bg-[#404249]"
          } ${open ? (sharing ? "bg-[#e3e5e8]" : "bg-[#404249]") : ""}`}
        >
          <IconChevron size={16} className={`transition-transform ${open ? "" : "rotate-180"}`} />
        </button>
      </div>
      {open && (
        <div
          role="menu"
          className="menu-pop absolute bottom-full left-1/2 z-30 mb-3 max-h-[70vh] w-[240px] -translate-x-1/2 overflow-y-auto rounded-lg bg-bg-floating p-1.5 text-[14px] shadow-[var(--elevation-high)]"
        >
          {sharing ? (
            <>
              <MenuAction danger onClick={() => void action(onToggle)}>{t("Stop Streaming")}</MenuAction>
              <MenuAction
                onClick={() => void action(async () => {
                  await onToggle();
                  await onToggle();
                })}
              >
                {t("Change Stream")}
              </MenuAction>
            </>
          ) : (
            <MenuAction onClick={() => void action(onToggle)}>{t("Share Your Screen")}</MenuAction>
          )}
          <div className="mx-1.5 my-1.5 h-px bg-divider" />
          <p className="px-2 pb-1 pt-1 text-[12px] font-semibold uppercase text-header-secondary">{t("Frame Rate")}</p>
          {FRAME_RATES.map((fps) => {
            const ok = fpsAllowed.includes(fps);
            return (
              <MenuRadio
                key={fps}
                label={`${fps} FPS`}
                checked={quality.fps === fps}
                locked={needs(ok, fps, 480)}
                onSelect={() => choose({ fps })}
              />
            );
          })}
          <div className="mx-1.5 my-1.5 h-px bg-divider" />
          <p className="px-2 pb-1 pt-1 text-[12px] font-semibold uppercase text-header-secondary">{t("Resolution")}</p>
          {ALL_RESOLUTIONS.map((res) => {
            const ok = resAllowed.includes(res);
            return (
              <MenuRadio
                key={res}
                label={res === "source" ? t("Source") : resolutionLabel(res)}
                checked={quality.resolution === res}
                locked={needs(ok, 30, res)}
                onSelect={() => choose({ resolution: res })}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function MenuAction({ danger, onClick, children }: { danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center rounded-[4px] px-2 py-1.5 text-left font-medium ${
        danger ? "text-status-dnd hover:bg-status-dnd hover:text-white" : "text-text-normal hover:bg-brand hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function MenuRadio({ label, checked, locked, onSelect }: {
  label: string;
  checked: boolean;
  /** The plan that unlocks this option, when yours doesn't. */
  locked: string | null;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      disabled={!!locked}
      onClick={onSelect}
      title={locked ? `${locked}` : undefined}
      className="group flex w-full items-center justify-between rounded-[4px] px-2 py-1.5 text-left text-text-normal enabled:hover:bg-brand enabled:hover:text-white disabled:cursor-not-allowed disabled:text-text-muted"
    >
      <span>{label}</span>
      {locked ? (
        <span className="flex items-center gap-1 text-[11px] font-semibold text-text-muted">
          <IconLock size={12} />
          {locked}
        </span>
      ) : (
        <span
          className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 ${
            checked ? "border-brand bg-brand group-enabled:group-hover:border-white" : "border-interactive-normal group-enabled:group-hover:border-white"
          }`}
        >
          {checked && <span className="h-2 w-2 rounded-full bg-white" />}
        </span>
      )}
    </button>
  );
}
