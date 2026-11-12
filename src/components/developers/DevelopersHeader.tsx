import { BookOpen, ExternalLink } from "lucide-react";
import { Logo } from "@/components/ui/Logo";

export const DOCS_URL = "https://docs.disband.dev/docs/bots";

/** The bar across the top of the developer pages. */
export function DevelopersHeader({ current }: { current: "applications" | "docs" }) {
  const link = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-[14px] font-medium transition-colors ${
      active ? "bg-interactive-hover text-header-primary" : "text-text-muted hover:bg-interactive-hover hover:text-text-normal"
    }`;
  return (
    <header className="sticky top-0 z-30 border-b border-divider bg-bg-primary/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <a href="/developers/applications" className="flex min-w-0 items-center gap-2.5">
          <Logo adaptive size={26} className="h-[26px] w-[26px]" />
          <span className="truncate text-[15px] font-bold text-header-primary">Disband</span>
          <span className="rounded-md bg-bg-secondary px-2 py-0.5 text-[12px] font-semibold text-text-muted">Developers</span>
        </a>
        <nav className="flex items-center gap-1">
          <a href="/developers/applications" className={`hidden sm:block ${link(current === "applications")}`}>Applications</a>
          <a href="/developers/docs" className={`hidden sm:block ${link(current === "docs")}`}>Overview</a>
          <a href={`${DOCS_URL}/`} target="_blank" rel="noreferrer" className={`flex items-center gap-1.5 ${link(false)}`}>
            <BookOpen size={15} /> Docs <ExternalLink size={12} />
          </a>
          <a href="/app"
            className="ml-1 rounded-lg bg-button-secondary px-3 py-1.5 text-[14px] font-semibold text-header-primary transition-colors hover:bg-button-secondary-hover">
            Open Disband
          </a>
        </nav>
      </div>
    </header>
  );
}
