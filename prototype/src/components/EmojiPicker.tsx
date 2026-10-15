import { useMemo, useState } from "react";
import { EMOJI } from "../data/seed";

export function EmojiPicker({ onPick, title = "Pick an emoji" }: { onPick: (e: string) => void; title?: string }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? EMOJI.filter((x) => x.k.includes(s)) : EMOJI;
  }, [q]);
  return (
    <div className="ep">
      <label className="ep-search">
        <span className="vh">{title}</span>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search emoji" />
      </label>
      {list.length ? (
        <div className="ep-grid">
          {list.map((x) => (
            <button key={x.e} type="button" className="ep-item" onClick={() => onPick(x.e)} aria-label={x.k.split(" ")[0]}>
              {x.e}
            </button>
          ))}
        </div>
      ) : (
        <p className="ep-empty">No emoji match “{q}”.</p>
      )}
    </div>
  );
}
