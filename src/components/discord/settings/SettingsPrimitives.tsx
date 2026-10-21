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
      <div className="mb-2 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-header-secondary">{title}</h3>
          {description && (
            <p className="mt-1 text-[14px] leading-5 text-text-muted">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {/* Flat grey panel, the classic settings card. */}
      <div className="overflow-hidden rounded-lg bg-bg-secondary">
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
    <div className="border-b border-divider/60 px-4 py-4 last:border-b-0">
      <div
        className={
          stacked ? "block" : "flex items-center justify-between gap-4"
        }
      >
        <Label
          {...(htmlFor ? { htmlFor } : {})}
          className={`min-w-0 ${htmlFor ? "cursor-pointer" : ""}`}
        >
          <span className="block text-[16px] font-medium leading-6 text-header-primary">{label}</span>
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
  // The classic switch: green when on, grey when off, with a tick or a cross
  // riding in the knob.
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a8fc] disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-status-online" : "bg-[#80848e]"
      }`}
    >
      <span
        className={`flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform duration-200 ease-out ${
          checked ? "translate-x-[19px]" : "translate-x-[3px]"
        }`}
      >
        {checked ? (
          <svg width="12" height="12" viewBox="0 0 20 20" aria-hidden>
            <path fill="var(--status-online)" d="M7.89561 14.8538L6.30462 13.2629L14.3099 5.25755L15.9009 6.84854L7.89561 14.8538Z" />
            <path fill="var(--status-online)" d="M4.08643 11.0903L5.67742 9.49929L9.4485 13.2704L7.85751 14.8614L4.08643 11.0903Z" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 20 20" aria-hidden>
            <path fill="#80848e" d="M5.13231 6.72963L6.7233 5.13864L14.855 13.2704L13.264 14.8614L5.13231 6.72963Z" />
            <path fill="#80848e" d="M13.2704 5.13864L14.8614 6.72963L6.72963 14.8614L5.13864 13.2704L13.2704 5.13864Z" />
          </svg>
        )}
      </span>
    </button>
  );
}

export const settingsInputClass =
  "w-full rounded-[3px] border border-transparent bg-bg-tertiary px-2.5 py-2.5 text-[16px] text-text-normal " +
  "outline-none transition-[border-color] placeholder:text-text-muted " +
  "focus:border-[#00a8fc]";

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
