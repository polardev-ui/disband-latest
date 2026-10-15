// Loading placeholders. Widths are fixed per row so they never jitter.

const LIST_W = [62, 48, 70, 55, 40, 66, 52, 58];
const MSG_W = [[72, 40], [54], [80, 66, 30], [46], [64, 52], [38]];

export function SkeletonList({ rows = 7, label = "Loading conversations" }: { rows?: number; label?: string }) {
  return (
    <div className="sk-list" aria-busy="true" aria-label={label} role="status">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="sk-row">
          <span className="sk sk-av" />
          <span className="sk-lines">
            <span className="sk sk-line" style={{ width: `${LIST_W[i % LIST_W.length]}%` }} />
            <span className="sk sk-line sk-line--sub" style={{ width: `${LIST_W[(i + 3) % LIST_W.length] + 15}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

export function SkeletonMessages() {
  return (
    <div className="sk-msgs" aria-busy="true" aria-label="Loading messages" role="status">
      {MSG_W.map((lines, i) => (
        <div key={i} className={`sk-msg${i % 3 === 1 ? " sk-msg--alt" : ""}`}>
          <span className="sk sk-av" />
          <span className="sk-lines">
            <span className="sk sk-line sk-line--name" />
            {lines.map((w, j) => (
              <span key={j} className="sk sk-line" style={{ width: `${w}%` }} />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
