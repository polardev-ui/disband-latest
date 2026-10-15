import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useEscape } from "../lib/hooks";

interface Ask {
  title: string;
  body: string;
  confirm: string;
  danger?: boolean;
}

/** Promise-based confirmation for destructive actions only. */
export function useConfirm(): [ReactNode, (a: Ask) => Promise<boolean>] {
  const [ask, setAsk] = useState<(Ask & { resolve: (v: boolean) => void }) | null>(null);
  const open = useCallback((a: Ask) => new Promise<boolean>((resolve) => setAsk({ ...a, resolve })), []);
  const close = (v: boolean) => {
    ask?.resolve(v);
    setAsk(null);
  };
  const el = ask ? <ConfirmDialog {...ask} onDone={close} /> : null;
  return [el, open];
}

function ConfirmDialog({ title, body, confirm, danger, onDone }: Ask & { onDone: (v: boolean) => void }) {
  const id = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<Element | null>(null);
  useEffect(() => {
    returnTo.current = document.activeElement;
    cancelRef.current?.focus();
    return () => (returnTo.current as HTMLElement | null)?.focus?.();
  }, []);
  useEscape(() => onDone(false));
  return (
    <div className="dlg-scrim" onPointerDown={(e) => e.target === e.currentTarget && onDone(false)}>
      <div className="dlg" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={`${id}-b`}>
        <h2 id={`${id}-t`} className="dlg-title">{title}</h2>
        <p id={`${id}-b`} className="dlg-body">{body}</p>
        <div className="dlg-actions">
          <button ref={cancelRef} type="button" className="btn btn--ghost" onClick={() => onDone(false)}>Cancel</button>
          <button type="button" className={`btn ${danger ? "btn--danger" : "btn--primary"}`} onClick={() => onDone(true)}>{confirm}</button>
        </div>
      </div>
    </div>
  );
}
