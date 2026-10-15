import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from "react";

// A tiny history router: four routes don't need a dependency. Vite's dev
// server falls back to index.html, so refreshing /quiet etc. works.

export function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const on = () => setPath(window.location.pathname);
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  return path.replace(/\/+$/, "") || "/";
}

export function navigate(to: string) {
  if (to === window.location.pathname + window.location.search) return;
  window.history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return (
    <a
      href={to}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    />
  );
}

export const DESIGNS = [
  { key: "quiet", path: "/quiet", letter: "A", name: "Quiet Confidence" },
  { key: "social", path: "/social", letter: "B", name: "Open & Social" },
  { key: "space", path: "/space", letter: "C", name: "Modern Digital Space" },
] as const;
