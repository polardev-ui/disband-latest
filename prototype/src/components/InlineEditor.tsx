import { useInlineEdit } from "./useConversation";

export function InlineEditor({ initial, onSave, onCancel }: { initial: string; onSave: (t: string) => void; onCancel: () => void }) {
  const ed = useInlineEdit(initial, onSave, onCancel);
  return (
    <div className="ie">
      <label className="vh" htmlFor="inline-edit">Edit message</label>
      <textarea id="inline-edit" ref={ed.ref} className="ie-input" rows={1} value={ed.value} onChange={(e) => ed.setValue(e.target.value)} onKeyDown={ed.onKeyDown} />
      <div className="ie-hint">
        <span>Enter to save · Esc to cancel</span>
        <span className="ie-actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => onSave(ed.value)}>Save</button>
        </span>
      </div>
    </div>
  );
}
