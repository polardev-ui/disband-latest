"use client";

import { useEffect, useRef, useState } from "react";
import { IconPlus } from "@/components/icons";
import type { ServerRole } from "@/lib/supabase/types";

interface RolePickerProps {
  /** Roles the caller may assign (already filtered to non-default roles). */
  roles: ServerRole[];
  /** Currently selected role ids. */
  selected: string[];
  /** Called with the toggled role id; the caller decides the new list. */
  onToggle: (roleId: string) => void;
  disabled?: boolean;
  align?: "left" | "right";
  compact?: boolean;
}

/**
 * Discord-style multi-role picker: a button showing the count, expanding to a
 * checkbox list. Used from the profile popup and the server members list.
 */
export function RolePicker({ roles, selected, onToggle, disabled, align = "left", compact = false }: RolePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selectedSet = new Set(selected);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-1 rounded-md border border-divider font-semibold transition-colors hover:bg-interactive-hover disabled:cursor-not-allowed disabled:opacity-50 ${
          compact ? "px-2 py-1 text-[12px]" : "px-2.5 py-1.5 text-[13px]"
        }`}
      >
        <IconPlus size={14} />
        Roles{selected.length > 0 && ` (${selected.length})`}
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable
          className={`absolute z-50 mt-1 max-h-64 w-52 overflow-y-auto rounded-lg border border-divider bg-bg-secondary p-1 shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {roles.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-text-muted">No roles to assign.</p>
          ) : (
            roles.map((role) => {
              const checked = selectedSet.has(role.id);
              return (
                <label
                  key={role.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 transition-colors hover:bg-interactive-hover"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(role.id)}
                    className="accent-brand"
                  />
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: role.color }} />
                  <span className="truncate text-[13px]" style={{ color: role.color }}>
                    {role.name}
                  </span>
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
