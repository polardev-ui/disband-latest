"use client";

import { useEffect, useRef, useState } from "react";
import { handleTopmostEscape, pushEscapeHandler } from "@/lib/overlay";
import { IconPlus, IconSearch } from "@/components/icons";
import { RoleIcon } from "@/components/ui/RoleIcon";
import type { ServerRole } from "@/lib/supabase/types";

interface RolePickerProps {

  roles: ServerRole[];

  selected: string[];

  onToggle: (roleId: string) => void;
  disabled?: boolean;
  align?: "left" | "right";
  compact?: boolean;
}

export function RolePicker({ roles, selected, onToggle, disabled, align = "left", compact = false }: RolePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Join the overlay Escape stack so closing the picker doesn't also close
    // the settings modal behind it. No scroll lock: this is a dropdown.
    const release = pushEscapeHandler(() => setOpen(false));
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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

  const selectedSet = new Set(selected);
  const needle = query.trim().toLowerCase();
  const visible = needle ? roles.filter((role) => role.name.toLowerCase().includes(needle)) : roles;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-[3px] border border-divider bg-bg-secondary font-medium transition-colors hover:bg-interactive-hover disabled:cursor-not-allowed disabled:opacity-50 ${
          compact ? "h-7 px-2 text-[12px]" : "h-8 px-2.5 text-[13px]"
        }`}
      >
        <IconPlus size={13} />
        Add role
        {selected.length > 0 && (
          <span className="rounded-[2px] bg-bg-accent px-1 text-[11px] tabular-nums text-text-muted">{selected.length}</span>
        )}
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable
          className={`absolute z-50 mt-1 w-64 overflow-hidden rounded-[4px] bg-bg-floating shadow-[var(--elevation-high)] ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {roles.length > 7 && (
            <div className="relative border-b border-divider p-1.5">
              <IconSearch size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search roles"
                aria-label="Search roles"
                className="h-8 w-full rounded-[3px] border border-transparent bg-bg-tertiary pl-8 pr-2 text-[13px] text-text-normal outline-none placeholder:text-text-muted focus:border-[#00a8fc]"
              />
            </div>
          )}
          <div role="group" aria-label="Roles" className="max-h-64 overflow-y-auto p-1">
            {roles.length === 0 ? (
              <p className="px-2 py-2 text-[13px] text-text-muted">No roles to assign.</p>
            ) : visible.length === 0 ? (
              <p className="px-2 py-2 text-[13px] text-text-muted">No roles match “{query.trim()}”.</p>
            ) : (
              visible.map((role) => {
                const checked = selectedSet.has(role.id);
                return (
                  <label
                    key={role.id}
                    className="flex cursor-pointer items-center gap-2 rounded-[2px] px-2 py-1.5 transition-colors hover:bg-interactive-hover"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(role.id)}
                      className="h-3.5 w-3.5 shrink-0 accent-brand"
                    />
                    {role.icon ? (
                      <RoleIcon icon={role.icon} name={role.name} size={14} />
                    ) : (
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: role.color }} />
                    )}
                    <span className="truncate text-[13px]" style={{ color: role.color }}>
                      {role.name}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
