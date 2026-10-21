"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { handleTopmostEscape, pushEscapeHandler, OVERLAY_Z } from "@/lib/overlay";
import { IconPlus } from "@/components/icons";
import { RoleIcon } from "@/components/ui/RoleIcon";
import type { ServerRole } from "@/lib/supabase/types";

interface RolePickerProps {
  roles: ServerRole[];
  selected: string[];
  onToggle: (roleId: string) => void;
  disabled?: boolean;
  align?: "left" | "right";
  /** The small "+" square used inside profile cards. */
  compact?: boolean;
}

const PANEL_W = 250;
const PANEL_MAX_H = 320;

/*
 Discord's role picker: a floating panel with a search box and one row per
 role (colour dot, name, check). It is portalled and positioned against the
 window, flipping above the button when there's no room below, so a
 scrolling container (a profile card, a settings page) can never clip it.
*/
export function RolePicker({ roles, selected, onToggle, disabled, align = "left", compact = false }: RolePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; maxH: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Join the overlay Escape stack so closing the picker doesn't also close
    // the popout or settings page behind it.
    const release = pushEscapeHandler(() => setOpen(false));
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => handleTopmostEscape(e);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      release();
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom - 12;
      const above = r.top - 12;
      const flip = below < 200 && above > below;
      const maxH = Math.min(PANEL_MAX_H, Math.max(140, flip ? above : below));
      const h = Math.min(panelRef.current?.offsetHeight ?? maxH, maxH);
      const rawLeft = align === "right" ? r.right - PANEL_W : r.left;
      const left = Math.max(8, Math.min(rawLeft, window.innerWidth - PANEL_W - 8));
      const top = flip ? Math.max(8, r.top - 6 - h) : r.bottom + 6;
      setPos({ left, top, maxH });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, align, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const selectedSet = new Set(selected);
  const needle = query.trim().toLowerCase();
  const visible = needle ? roles.filter((role) => role.name.toLowerCase().includes(needle)) : roles;

  const panel =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Roles"
            className="menu-pop fixed flex flex-col overflow-hidden rounded-[4px] bg-bg-floating shadow-[var(--elevation-high)]"
            style={{
              zIndex: OVERLAY_Z.contextMenu,
              width: PANEL_W,
              left: pos?.left ?? -9999,
              top: pos?.top ?? -9999,
              maxHeight: pos?.maxH ?? PANEL_MAX_H,
              visibility: pos ? "visible" : "hidden",
            }}
          >
            <div className="shrink-0 p-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    const n = visible.length || 1;
                    setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + n) % n);
                  } else if (e.key === "Enter" && visible[active]) {
                    e.preventDefault();
                    onToggle(visible[active].id);
                  }
                }}
                placeholder="Role"
                aria-label="Search roles"
                className="h-[30px] w-full rounded-[4px] bg-bg-tertiary px-2 text-[14px] text-text-normal outline-none placeholder:text-text-muted"
              />
            </div>
            <div role="listbox" aria-multiselectable className="channel-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {roles.length === 0 ? (
                <p className="px-2 py-3 text-center text-[14px] text-header-secondary">No roles to give yet. Create some in Server Settings › Roles.</p>
              ) : visible.length === 0 ? (
                <p className="px-2 py-3 text-center text-[14px] text-header-secondary">No roles match “{query.trim()}”.</p>
              ) : (
                visible.map((role, i) => {
                  const checked = selectedSet.has(role.id);
                  return (
                    <button
                      key={role.id}
                      type="button"
                      role="option"
                      aria-selected={checked}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => onToggle(role.id)}
                      className={`flex h-8 w-full items-center gap-2 rounded-[2px] px-2 text-left ${i === active ? "bg-interactive-hover" : ""}`}
                    >
                      {role.icon ? (
                        <RoleIcon icon={role.icon} name={role.name} size={16} />
                      ) : (
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: role.color || "#99aab5" }} />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-interactive-active">{role.name}</span>
                      <span
                        aria-hidden
                        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] border ${
                          checked ? "border-brand bg-brand text-white" : "border-interactive-normal/60 text-transparent"
                        }`}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                          <path d="M5 12.5 10 17.5 19 7" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Add role"
        title={compact ? "Add role" : undefined}
        className={
          compact
            ? `flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-bg-secondary text-interactive-normal transition-colors hover:text-interactive-active disabled:cursor-not-allowed disabled:opacity-50 ${open ? "text-interactive-active" : ""}`
            : "flex h-8 shrink-0 items-center gap-1.5 rounded-[3px] bg-button-secondary px-3 text-[14px] font-medium text-white transition-colors hover:bg-button-secondary-hover disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        <IconPlus size={compact ? 14 : 16} />
        {!compact && "Add Role"}
      </button>
      {panel}
    </>
  );
}
