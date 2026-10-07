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
    <section className="mb-6">
      <div className="mb-2.5 flex items-start justify-between gap-4 px-1">
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold text-text-normal">{title}</h3>
          {description && (
            <p className="mt-0.5 text-[13px] leading-relaxed text-text-muted">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="overflow-hidden rounded-2xl border border-divider bg-bg-secondary shadow-[0_2px_12px_-6px_rgba(0,0,0,0.5)]">
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
    <div className="border-b border-divider px-4 py-3.5 last:border-b-0">
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
            <span className="mt-0.5 block text-[12.5px] leading-relaxed text-text-muted">
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
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-status-online" : "bg-text-muted/40"
      }`}
    >
      <span
        className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[22px]" : "translate-x-1"
        }`}
        style={{ height: 18, width: 18 }}
      />
    </button>
  );
}

export const settingsInputClass =
  "w-full rounded-xl border border-divider bg-bg-tertiary px-3.5 py-2.5 text-[14px] text-text-normal " +
  "outline-none transition-all placeholder:text-text-muted focus:border-brand/60 focus:ring-2 focus:ring-brand/20";

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
