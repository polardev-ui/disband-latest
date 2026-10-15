import { useId } from "react";

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="st-row">
      <div className="st-row-text">
        <span className="st-label" id={`${id}-l`}>{label}</span>
        {hint && <span className="st-hint" id={`${id}-h`}>{hint}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={hint ? `${id}-h` : undefined}
        className="sw"
        onClick={() => onChange(!checked)}
      >
        <span className="sw-thumb" />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  hint,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="st-row st-row--stack">
      <div className="st-row-text">
        <span className="st-label" id={`${id}-l`}>{label}</span>
        {hint && <span className="st-hint">{hint}</span>}
      </div>
      <div className="seg" role="radiogroup" aria-labelledby={`${id}-l`}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className="seg-opt"
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
