"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";

/*
 The message search box, with finished filters shown as chips inside it, as
 Discord does ("[from: aug] [in: general] cats").

 The whole query is still one string (shared with the search panel). A
 filter becomes a chip once it's finished: followed by a space, or picked
 from a suggestion. Whatever is still being typed (words, or a filter in
 progress) stays in the text field after the chips. Backspace in an empty
 field removes the last chip; each chip also has its own ×.
*/

export interface SearchChip {
  key: string;
  value: string;
  raw: string;
}

const FINISHED = /(^|\s)(from|in|has|mentions|before|after|during):("[^"]+"|[^\s"]+)(?=\s)/gi;

/** Finished filters, and the rest of the query (free text plus anything half-typed). */
export function splitSearchQuery(q: string): { chips: SearchChip[]; rest: string } {
  const chips: SearchChip[] = [];
  const rest = q.replace(FINISHED, (_m, lead: string, key: string, value: string) => {
    chips.push({ key: key.toLowerCase(), value: value.replace(/^"|"$/g, ""), raw: `${key.toLowerCase()}:${value}` });
    return lead;
  });
  return { chips, rest: rest.replace(/^\s+/, "").replace(/\s{2,}/g, " ") };
}

export function joinSearchQuery(chips: SearchChip[], rest: string): string {
  const head = chips.map((c) => c.raw).join(" ");
  return head ? `${head} ${rest.replace(/^\s+/, "")}` : rest;
}

const shown = (c: SearchChip) => (c.key === "in" ? `#${c.value.replace(/^#/, "")}` : c.value);

interface Props {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  inputClassName?: string;
}

export const SearchChipInput = forwardRef<HTMLInputElement, Props>(function SearchChipInput(
  { value, onChange, onFocus, onKeyDown, id, placeholder, ariaLabel, className = "", inputClassName = "" },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);
  const { chips, rest } = splitSearchQuery(value);

  return (
    <div
      className={`flex min-w-0 cursor-text items-center gap-1 overflow-hidden ${className}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }}
    >
      {chips.map((c, i) => (
        <span
          key={`${c.raw}-${i}`}
          className="inline-flex h-6 max-w-[160px] shrink-0 items-center gap-1 rounded-md bg-bg-tertiary pl-1.5 pr-0.5 text-[13px] text-text-normal"
        >
          <b className="font-semibold text-header-primary">{c.key}:</b>
          <span className="truncate">{shown(c)}</span>
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Remove ${c.key} filter`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange(joinSearchQuery(chips.filter((_, j) => j !== i), rest));
              inputRef.current?.focus();
            }}
            className="flex h-4 w-4 items-center justify-center rounded text-text-muted hover:text-header-primary"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={rest}
        onChange={(e) => onChange(joinSearchQuery(chips, e.target.value))}
        onFocus={onFocus}
        onKeyDown={(e) => {
          if (e.key === "Backspace" && !rest && chips.length && e.currentTarget.selectionStart === 0) {
            e.preventDefault();
            onChange(joinSearchQuery(chips.slice(0, -1), ""));
            return;
          }
          onKeyDown?.(e);
        }}
        placeholder={chips.length ? "" : placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        spellCheck={false}
        className={`min-w-[40px] flex-1 bg-transparent text-[14px] text-text-normal outline-none placeholder:text-text-muted ${inputClassName}`}
      />
    </div>
  );
});
