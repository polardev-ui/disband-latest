"use client";

/*
 Building blocks for Space settings.

 Same visual language as the user Settings window (see
 discord/settings/SettingsPrimitives): hairline cards on bg-secondary, 10px
 radii, matte fills, no glows. Everything here is shared by the section files
 so the sections read as one product instead of ten forms.
*/

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconLock, IconSearch, IconUpload } from "@/components/icons";
import { pushEscapeHandler, handleTopmostEscape } from "@/lib/overlay";

export { SettingsSection, SettingRow, Toggle, settingsInputClass, Hint } from "@/components/discord/settings/SettingsPrimitives";

// Classic buttons: 38px, 3px radius, solid fills; "ghost" is the underlined
// text link used for Cancel/Back in modal footers.
const BTN_BASE =
  "inline-flex h-[38px] min-w-[60px] shrink-0 items-center justify-center gap-2 rounded-[3px] px-4 text-[14px] font-medium leading-4 transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a8fc]";

export const btn = {
  primary: `${BTN_BASE} bg-brand text-white hover:bg-brand-hover`,
  secondary: `${BTN_BASE} bg-button-secondary text-white hover:bg-button-secondary-hover`,
  danger: `${BTN_BASE} bg-button-danger text-white hover:bg-button-danger-hover`,
  dangerGhost: `${BTN_BASE} border border-button-danger text-white hover:bg-button-danger`,
  ghost: `${BTN_BASE} bg-transparent text-white hover:underline`,
};

export const iconBtn =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] text-interactive-normal transition-colors duration-150 hover:bg-interactive-hover hover:text-interactive-active disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60";

export const iconBtnDanger =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] text-interactive-normal transition-colors duration-150 hover:bg-status-dnd/12 hover:text-status-dnd disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-dnd/50";

/** Stagger list rows in by index, capped so long lists don't crawl. */
export function enterStyle(index: number): React.CSSProperties {
  return { animationDelay: `${Math.min(index, 12) * 22}ms` };
}

export function FieldLabel({ children, htmlFor, aside }: { children: ReactNode; htmlFor?: string; aside?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <label htmlFor={htmlFor} className="text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-header-secondary">
        {children}
      </label>
      {aside && <span className="text-[12px] tabular-nums text-text-muted/80">{aside}</span>}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <label className="relative block">
      <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-9 w-full rounded-[3px] border border-transparent bg-bg-tertiary pl-9 pr-3 text-[13.5px] text-text-normal outline-none transition-[border-color] placeholder:text-text-muted/80 focus:border-[#00a8fc]"
      />
    </label>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="view-enter flex flex-col items-center px-6 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-bg-accent text-text-muted">{icon}</span>
      <p className="mt-3 text-[14px] font-medium text-text-normal">{title}</p>
      {body && <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function InlineError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="view-enter rounded-[10px] border border-status-dnd/25 bg-status-dnd/8 px-3.5 py-2.5 text-[13px] text-status-dnd">
      {children}
    </p>
  );
}

/** A usage bar: emoji slots, soundboard sounds. */
export function SlotMeter({ used, limit, label }: { used: number; limit: number | null; label: string }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  const full = limit !== null && used >= limit;
  return (
    <div className="px-5 py-4">
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="font-medium text-text-normal">{label}</span>
        <span className={`tabular-nums ${full ? "text-status-dnd" : "text-text-muted"}`}>
          {limit === null ? `${used} · Unlimited` : `${used} / ${limit}`}
        </span>
      </div>
      {limit !== null && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-bg-accent">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ease-out ${full ? "bg-status-dnd" : "bg-brand"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * A perk the space hasn't unlocked yet. Says exactly what it takes rather than
 * just greying the control out.
 */
export function LevelLock({
  level,
  count,
  perk,
  onBoost,
}: {
  level: 1 | 2 | 3;
  count: number;
  perk: string;
  onBoost?: () => void;
}) {
  const needed = level === 1 ? 1 : level === 2 ? 3 : 6;
  const remaining = Math.max(0, needed - count);
  return (
    <div className="flex items-center gap-3.5 px-5 py-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-brand/12 text-brand">
        <IconLock size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-text-normal">{perk} unlock at Level {level}</p>
        <p className="mt-0.5 text-[12.5px] text-text-muted">
          {remaining === 1 ? "1 more Catalyst" : `${remaining} more Catalysts`} to go · {count}/{needed}
        </p>
        <div className="mt-2 h-1 max-w-[220px] overflow-hidden rounded-full bg-bg-accent">
          <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${Math.min(100, (count / needed) * 100)}%` }} />
        </div>
      </div>
      {onBoost && (
        <button type="button" onClick={onBoost} className={btn.secondary}>
          Boost
        </button>
      )}
    </div>
  );
}

/** A real button that opens a file picker; the native input stays hidden. */
export function FilePickButton({
  accept,
  onPick,
  children,
  disabled,
  className = btn.secondary,
}: {
  accept: string;
  onPick: (file: File) => void;
  children?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = "";
        }}
      />
      <button type="button" disabled={disabled} onClick={() => ref.current?.click()} className={className}>
        {children ?? (
          <>
            <IconUpload size={15} /> Choose file
          </>
        )}
      </button>
    </>
  );
}

/** Drop-a-file target with a click-to-browse fallback. */
export function DropZone({
  accept,
  onPick,
  disabled,
  title,
  hint,
}: {
  accept: string;
  onPick: (file: File) => void;
  disabled?: boolean;
  title: string;
  hint?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && ref.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          ref.current?.click();
        }
      }}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file && !disabled) onPick(file);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-[12px] border border-dashed px-4 py-6 text-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
        over ? "border-brand bg-brand/8" : "border-divider hover:border-text-muted/50 hover:bg-interactive-hover/50"
      } ${disabled ? "pointer-events-none opacity-50" : ""}`}
    >
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = "";
        }}
      />
      <IconUpload size={18} className={over ? "text-brand" : "text-text-muted"} />
      <p className="mt-2 text-[13.5px] font-medium text-text-normal">{title}</p>
      {hint && <p className="mt-0.5 text-[12px] text-text-muted">{hint}</p>}
    </div>
  );
}

/** A segmented control: channel type, role tabs. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[3px] border border-transparent bg-bg-tertiary p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium transition-colors duration-150 ${
              active ? "bg-bg-secondary text-text-normal shadow-[0_1px_2px_rgba(0,0,0,0.25)]" : "text-text-muted hover:text-text-normal"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The confirm step for destructive actions. Replaces window.confirm, which
 * looks like a browser error and can't say what is about to happen.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  tone = "danger",
  requireText,
  input,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  /** Type this exactly to enable the confirm button. */
  requireText?: string;
  /** An optional free-text field (e.g. a ban reason). */
  input?: { label: string; placeholder?: string };
  onConfirm: (inputValue: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTyped("");
    setValue("");
    setBusy(false);
    const release = pushEscapeHandler(onCancel);
    const onKey = (e: KeyboardEvent) => handleTopmostEscape(e);
    document.addEventListener("keydown", onKey);
    return () => {
      release();
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onCancel]);

  if (!open || typeof document === "undefined") return null;
  const blocked = !!requireText && typed.trim() !== requireText;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button type="button" aria-label="Cancel" className="overlay-fade absolute inset-0 bg-overlay-scrim-strong" onClick={onCancel} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="classic-modal relative w-full max-w-[440px] overflow-hidden rounded-lg bg-bg-primary shadow-[var(--elevation-high)]"
      >
        <div className="px-6 pb-5 pt-6">
          <h2 className="text-[20px] font-semibold leading-6 text-header-primary">{title}</h2>
          {body && <div className="mt-2 text-[16px] leading-5 text-text-normal">{body}</div>}
          {input && (
            <div className="mt-4">
              <FieldLabel htmlFor="confirm-input">{input.label}</FieldLabel>
              <input
                id="confirm-input"
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={input.placeholder}
                maxLength={200}
                className="w-full rounded-[3px] border border-transparent bg-bg-tertiary px-3.5 py-2.5 text-[14px] text-text-normal outline-none placeholder:text-text-muted/80 focus:border-[#00a8fc]"
              />
            </div>
          )}
          {requireText && (
            <div className="mt-4">
              <FieldLabel htmlFor="confirm-type">
                Type <span className="font-semibold text-text-normal">{requireText}</span> to confirm
              </FieldLabel>
              <input
                id="confirm-type"
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="w-full rounded-[3px] border border-transparent bg-bg-tertiary px-3.5 py-2.5 text-[14px] text-text-normal outline-none focus:border-status-dnd"
              />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 bg-bg-secondary p-4">
          <button type="button" onClick={onCancel} className={btn.ghost}>
            Cancel
          </button>
          <button
            type="button"
            disabled={blocked || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(value.trim());
              } finally {
                setBusy(false);
              }
            }}
            className={tone === "danger" ? btn.danger : btn.primary}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
