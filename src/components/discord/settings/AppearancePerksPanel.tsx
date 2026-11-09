"use client";

/*
 Settings › Appearance: the Disband Lite and Aero perks — a custom accent
 colour for the whole app and a wallpaper behind conversations. Free
 accounts see them, locked, with a way to upgrade.
*/

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useI18n } from "@/contexts/I18nContext";
import {
  ACCENT_PRESETS,
  WALLPAPERS,
  appearanceEntitled,
  isValidAccent,
  setAccentColor,
  setChatWallpaper,
  useAppearance,
} from "@/lib/appearance";
import { SettingsSection } from "./SettingsPrimitives";
import { IconCheck, IconLock } from "@/components/icons";

function PerkBadge() {
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-[linear-gradient(135deg,#7c74ff,#e055ff)] px-2 py-px align-middle text-[10px] font-bold uppercase tracking-[0.06em] text-white">
      Lite + Aero
    </span>
  );
}

export function AppearancePerksPanel({ onUpgrade }: { onUpgrade: () => void }) {
  const { user, subscriptionPlan } = useApp();
  const { t } = useI18n();
  const appearance = useAppearance(user?.id);
  const entitled = appearanceEntitled(subscriptionPlan);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (appearance.unavailable) return null;

  const run = async (fn: () => Promise<string | null>) => {
    if (!user?.id || busy) return;
    setBusy(true);
    setError(null);
    try {
      const err = await fn();
      if (err) setError(err);
    } finally {
      setBusy(false);
    }
  };

  const pickAccent = (color: string | null) => {
    if (!entitled) {
      onUpgrade();
      return;
    }
    void run(() => setAccentColor(user!.id, color));
  };
  const pickWallpaper = (id: string | null) => {
    if (!entitled) {
      onUpgrade();
      return;
    }
    void run(() => setChatWallpaper(user!.id, id));
  };

  const customValue = custom.startsWith("#") ? custom : `#${custom}`;

  const locked = !entitled && (
    <div className="flex items-center gap-3 border-b border-border-subtle bg-brand-soft px-5 py-3">
      <IconLock size={16} className="shrink-0 text-brand" />
      <p className="min-w-0 flex-1 text-[13px] text-text-normal">{t("Part of Disband Lite and Aero.")}</p>
      <button
        type="button"
        onClick={onUpgrade}
        className="h-8 shrink-0 rounded-lg bg-brand px-3 text-[13px] font-semibold text-brand-foreground transition-colors hover:bg-brand-hover"
      >
        {t("Upgrade")}
      </button>
    </div>
  );

  return (
    <>
      <SettingsSection
        title={t("Accent colour")}
        description={t("Recolour buttons, highlights and selections across the app.")}
        action={<PerkBadge />}
      >
        {locked}
        <div className="px-5 py-4">
          <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label={t("Accent colour")}>
            <button
              type="button"
              role="radio"
              aria-checked={entitled && !appearance.accent}
              onClick={() => pickAccent(null)}
              className={`flex h-9 items-center rounded-full border px-3 text-[13px] font-semibold transition-colors ${
                entitled && !appearance.accent ? "border-brand text-header-primary" : "border-border-subtle text-text-muted hover:border-border-strong"
              }`}
            >
              {t("Theme default")}
            </button>
            {ACCENT_PRESETS.map((color) => {
              const on = entitled && appearance.accent === color;
              return (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={color}
                  title={color}
                  onClick={() => pickAccent(color)}
                  className={`relative h-9 w-9 rounded-full transition-transform hover:scale-105 ${on ? "ring-2 ring-header-primary ring-offset-2 ring-offset-[var(--surface-raised)]" : ""}`}
                  style={{ backgroundColor: color }}
                >
                  {on && <IconCheck size={16} className="absolute inset-0 m-auto text-white drop-shadow" />}
                </button>
              );
            })}
          </div>
          <form
            className="mt-4 flex max-w-sm items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!isValidAccent(customValue)) {
                setError(t("Use a hex colour such as #4641d9."));
                return;
              }
              pickAccent(customValue.toLowerCase());
            }}
          >
            <span
              aria-hidden
              className="h-9 w-9 shrink-0 rounded-lg border border-border-subtle"
              style={{ backgroundColor: isValidAccent(customValue) ? customValue : "transparent" }}
            />
            <input
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value.trim().slice(0, 7));
                setError(null);
              }}
              placeholder="#4641d9"
              aria-label={t("Custom accent colour")}
              className="h-9 min-w-0 flex-1 rounded-lg border border-border-subtle bg-bg-tertiary px-3 font-mono text-[14px] text-text-normal outline-none focus:border-brand"
            />
            <button
              type="submit"
              disabled={busy || !custom}
              className="h-9 shrink-0 rounded-lg bg-button-secondary px-3 text-[13px] font-semibold text-header-primary transition-colors hover:bg-button-secondary-hover disabled:opacity-50"
            >
              {t("Apply")}
            </button>
          </form>
        </div>
      </SettingsSection>

      <SettingsSection
        title={t("Chat wallpaper")}
        description={t("A soft backdrop behind every conversation. Only you see it.")}
        action={<PerkBadge />}
      >
        {locked}
        <div className="grid grid-cols-2 gap-3 px-5 py-4 sm:grid-cols-4">
          {[{ id: null as string | null, label: t("None"), css: "" }, ...WALLPAPERS].map((wp) => {
            const on = entitled && (appearance.wallpaper ?? null) === wp.id;
            return (
              <button
                key={wp.id ?? "none"}
                type="button"
                aria-pressed={on}
                onClick={() => pickWallpaper(wp.id)}
                className={`group overflow-hidden rounded-xl border text-left transition-colors ${
                  on ? "border-brand" : "border-border-subtle hover:border-border-strong"
                }`}
              >
                <span
                  aria-hidden
                  className="relative block h-16 w-full"
                  style={{ background: wp.css ? `${wp.css}, var(--bg-primary)` : "var(--bg-primary)" }}
                >
                  {on && (
                    <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-brand-foreground">
                      <IconCheck size={12} />
                    </span>
                  )}
                </span>
                <span className="block border-t border-border-subtle px-2.5 py-1.5 text-[13px] font-medium text-header-primary">
                  {wp.label}
                </span>
              </button>
            );
          })}
        </div>
      </SettingsSection>

      {error && (
        <p role="alert" className="-mt-6 mb-8 text-[13px] text-status-dnd">
          {error}
        </p>
      )}
    </>
  );
}
