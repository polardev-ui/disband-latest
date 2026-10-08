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
    <section className="mb-8 last:mb-0">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[14.5px] font-semibold text-text-normal">{title}</h3>
          {description && (
            <p className="mt-0.5 text-[13px] leading-relaxed text-text-muted">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {/* Depth from a hairline, not a shadow: a shadowed card inside a
          shadowed dialog reads as clutter. */}
      <div className="overflow-hidden rounded-2xl border border-divider bg-bg-secondary">
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
    <div className="border-b border-divider px-5 py-4 last:border-b-0">
      <div
        className={
          stacked ? "block" : "flex items-center justify-between gap-4"
        }
      >
        <Label
          {...(htmlFor ? { htmlFor } : {})}
          className={`min-w-0 ${htmlFor ? "cursor-pointer" : ""}`}
        >
          <span className="block text-[14px] font-medium text-text-normal">{label}</span>
          {description && (
            <span className="mt-0.5 block text-[13px] leading-relaxed text-text-muted">
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
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-brand" : "bg-text-muted/30"
      }`}
    >
      <span
        className={`inline-block rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.35)] transition-transform duration-150 ${
          checked ? "translate-x-[18px]" : "translate-x-[2px]"
        }`}
        style={{ height: 18, width: 18 }}
      />
    </button>
  );
}

export const settingsInputClass =
  "w-full rounded-[10px] border border-divider bg-bg-accent px-3.5 py-2.5 text-[14px] text-text-normal " +
  "outline-none transition-[border-color,box-shadow] placeholder:text-text-muted/80 " +
  "focus:border-brand";

export function Hint({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "super" | "online" }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${
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
