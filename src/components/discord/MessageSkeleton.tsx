"use client";

export function MessageSkeleton() {

  const widths = [72, 45, 88, 55, 94, 38, 68, 82, 48, 91, 58, 76, 42, 85, 62, 96];

  return (
    <div className="flex flex-col gap-4 px-4 py-4" aria-busy="true" aria-label="Loading messages">
      {widths.map((w, i) => (
        <div key={i} className="flex items-start gap-3">
          {}
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-white/5" />
          <div className="flex min-w-0 flex-col gap-2 pt-1">
            {}
            <div
              className="h-3 animate-pulse rounded bg-white/10"
              style={{ width: `${Math.min(w, 28)}%` }}
            />
            {}
            <div
              className="h-3 animate-pulse rounded bg-white/5"
              style={{ width: `${w}%` }}
            />
            {w > 80 && (
              <div
                className="h-3 animate-pulse rounded bg-white/5"
                style={{ width: `${Math.max(w - 30, 30)}%` }}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
