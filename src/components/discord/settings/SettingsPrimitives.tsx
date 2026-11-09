"use client";

export function SettingsSection({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="mb-10 last:mb-0">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[18px] font-bold leading-6 text-header-primary">{title}</h3>
          {description && (
            <p className="mt-1 text-[14px] leading-5 text-text-muted">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {/* A bordered card; rows inside are split by hairlines. */}
      <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-raised">
        {children}
      </div>
    </section>
  );
}

export function SettingRow({
  label,
  description,
  htmlFor,
  children,
  stacked = false,
}: {
  label: string;
  description?: string;
  htmlFor?: string;
  children?: React.ReactNode;
  stacked?: boolean;
}) {
  const Label = htmlFor ? "label" : "div";
  return (
    <div className="border-b border-border-subtle px-5 py-4 last:border-b-0">
      <div
        className={
          stacked ? "block" : "flex items-center justify-between gap-4"
        }
      >
        <Label
          {...(htmlFor ? { htmlFor } : {})}
          className={`min-w-0 ${htmlFor ? "cursor-pointer" : ""}`}
        >
          <span className="block text-[15px] font-semibold leading-6 text-header-primary">{label}</span>
          {description && (
            <span className="mt-1 block text-[14px] leading-5 text-text-muted">
              {description}
            </span>
          )}
        </Label>
        {children && (
          <div className={stacked ? "mt-3" : "shrink-0"}>{children}</div>
        )}
      </div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  id,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  id?: string;
  label: string;
  disabled?: boolean;
}) {
  // The switch: accent when on, grey when off, with a tick riding in the knob
  // when it is on.
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "border-transparent bg-brand" : "border-border-strong bg-bg-tertiary"
      }`}
    >
      <span
        className={`flex h-[22px] w-[22px] items-center justify-center rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-[transform,background-color] duration-200 ease-out ${
          checked ? "translate-x-[22px] bg-white" : "translate-x-[2px] bg-interactive-normal"
        }`}
      >
        {checked && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    </button>
  );
}

export const settingsInputClass =
  "w-full rounded-lg border border-border-subtle bg-bg-tertiary px-3 py-2.5 text-[15px] text-text-normal " +
  "outline-none transition-[border-color] placeholder:text-text-muted " +
  "focus:border-brand";

export function Hint({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "super" | "online" }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
        tone === "super"
          ? "bg-super/20 text-super"
          : tone === "online"
            ? "bg-status-online/15 text-status-online"
            : "bg-bg-accent text-text-muted"
      }`}
    >
      {children}
    </span>
  );
}
