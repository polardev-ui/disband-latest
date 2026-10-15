import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type Tone = "info" | "error";
interface ToastItem {
  id: number;
  text: string;
  tone: Tone;
  action?: { label: string; run: () => void };
}

const Ctx = createContext<{
  toasts: ToastItem[];
  toast: (text: string, opts?: { tone?: Tone; action?: ToastItem["action"] }) => void;
  dismiss: (id: number) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (text: string, opts: { tone?: Tone; action?: ToastItem["action"] } = {}) => {
      const id = next.current++;
      setToasts((t) => [...t.slice(-2), { id, text, tone: opts.tone ?? "info", action: opts.action }]);
      window.setTimeout(() => dismiss(id), opts.action ? 5000 : 3200);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ toasts, toast, dismiss }), [toasts, toast, dismiss]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useToast() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast outside ToastProvider");
  return v.toast;
}

/** Rendered by each design inside its own root so it picks up that design's styles. */
export function ToastRegion() {
  const v = useContext(Ctx)!;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {v.toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`}>
          <span>{t.text}</span>
          {t.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                t.action!.run();
                v.dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
