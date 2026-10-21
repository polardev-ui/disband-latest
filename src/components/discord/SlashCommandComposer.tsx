"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useMemberSearch } from "@/hooks/useMemberSearch";
import { getSupabaseClient } from "@/lib/supabase/client";
import { presenceStatusFor } from "@/lib/presence";
import { displayName } from "@/lib/utils";
import {
  DURATION_PRESETS,
  MAX_TIMEOUT_SECONDS,
  formatDuration,
  parseDuration,
  resolveMember,
  type SlashCommand,
  type SlashOption,
} from "@/lib/slash-commands";
import { Avatar } from "@/components/ui/Avatar";
import { StatusDot } from "@/components/ui/StatusDot";
import { IconClose } from "@/components/icons";
import type { Profile } from "@/lib/supabase/types";

/*
 The composer while a slash command is being filled in, after Discord:

   [/] /ban [user | @polar] [reason | being weird]  +1 more

 Each option is a chip with its name on the left and an input on the right.
 The focused option's description sits in a bar above the box (with an X to
 back out), and a member or duration list opens above that when the option
 takes one. Enter runs the command once every required option is filled.
*/

interface Props {
  command: SlashCommand;
  members: Profile[];
  serverId: string | null | undefined;
  /** Values to start with, from a command typed or pasted in one go. */
  initial?: Record<string, string>;
  /** Leave command mode, putting `restore` back in the plain composer. */
  onExit: (restore: string) => void;
  /** The command ran; `message` is the confirmation to show. */
  onDone: (message: string) => void;
}

export function SlashCommandComposer({ command, members, serverId, initial = {}, onExit, onDone }: Props) {
  const { banMember, kickMember, timeoutMember, presenceMap, user } = useApp();
  // Optional options start shown only when they arrive prefilled.
  const [shown, setShown] = useState<string[]>(() =>
    command.options.filter((o) => o.required || initial[o.name]).map((o) => o.name),
  );
  const [values, setValues] = useState<Record<string, string>>(initial);
  // Start on the first option still to fill in.
  const [active, setActive] = useState(() => {
    const i = shown.findIndex((n) => !initial[n]);
    return i === -1 ? Math.max(0, shown.length - 1) : i;
  });
  const [picked, setPicked] = useState<Profile | null>(null);
  const [pickIdx, setPickIdx] = useState(0);
  const [error, setError] = useState<{ option: string | null; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const option = command.options.find((o) => o.name === shown[active]) as SlashOption;
  const hidden = command.options.filter((o) => !shown.includes(o.name));

  useEffect(() => {
    const el = inputs.current[shown[active]];
    if (el && document.activeElement !== el) el.focus();
  }, [active, shown]);

  // Pickers for the focused option.
  // Searched whenever the user isn't settled, not only while its chip has
  // focus: a prefilled "/ban kai …" opens on a later chip.
  const userQuery = !picked && "user" in values ? values.user ?? "" : !picked && option.kind === "user" ? "" : null;
  const memberResults = useMemberSearch(serverId, userQuery, members, 8);
  const durationResults = useMemo(() => {
    if (option.kind !== "duration") return [];
    const v = (values.duration ?? "").trim().toLowerCase();
    return DURATION_PRESETS.filter((p) => !v || p.value.startsWith(v) || p.label.toLowerCase().startsWith(v));
  }, [option.kind, values.duration]);
  const pickerCount = option.kind === "user" && !picked ? memberResults.length : durationResults.length;

  useEffect(() => setPickIdx(0), [active, values.user, values.duration]);

  // A prefilled user ("/ban polar …" typed in one go) is picked as soon as it
  // matches exactly one member, so the chip shows @polar straight away.
  useEffect(() => {
    if (picked || !initial.user || values.user !== initial.user) return;
    const match = resolveMember(memberResults, initial.user) ?? (memberResults.length === 1 ? memberResults[0] : null);
    if (match) {
      setValues((prev) => ({ ...prev, user: `@${match.username}` }));
      setPicked(match);
    }
  }, [memberResults, picked, initial.user, values.user]);

  const setValue = (name: string, v: string) => {
    setValues((prev) => ({ ...prev, [name]: v }));
    if (name === "user") setPicked(null);
    if (error?.option === name || error?.option === null) setError(null);
  };

  function focusOption(i: number) {
    setActive(Math.max(0, Math.min(i, shown.length - 1)));
  }

  /** Move past the current chip, revealing the next optional one at the end. */
  function advance() {
    if (active < shown.length - 1) {
      focusOption(active + 1);
      return true;
    }
    if (hidden.length > 0) {
      setShown((s) => [...s, hidden[0].name]);
      setActive(shown.length);
      return true;
    }
    return false;
  }

  function pickMember(p: Profile) {
    setValues((prev) => ({ ...prev, user: `@${p.username}` }));
    setPicked(p);
    setError(null);
  }

  /** Commit whatever the focused picker is offering. Returns true if it did. */
  function commitPicker(): boolean {
    if (option.kind === "user" && !picked) {
      const typed = values.user ?? "";
      const exact = resolveMember(memberResults, typed);
      const choice = memberResults[pickIdx] ?? exact;
      if (choice && (typed.trim() || memberResults[pickIdx])) {
        pickMember(choice);
        return true;
      }
    }
    if (option.kind === "duration" && durationResults[pickIdx] && !parseDuration(values.duration ?? "")) {
      setValues((prev) => ({ ...prev, duration: durationResults[pickIdx].value }));
      return true;
    }
    return false;
  }

  async function run() {
    if (busy) return;
    // Resolve a typed-but-not-picked user the same way Enter would.
    let target = picked;
    if (!target) target = resolveMember(memberResults.length ? memberResults : members, values.user ?? "");
    // Only one member matches what was typed: that's who they meant.
    if (!target && userQuery?.trim() && memberResults.length === 1) target = memberResults[0];
    if (!target) {
      setError({ option: "user", text: values.user?.trim() ? `No member called ${values.user.trim()}.` : "Pick a member." });
      focusOption(shown.indexOf("user"));
      return;
    }
    if (target.id === user?.id) {
      setError({ option: "user", text: `You can't ${command.name} yourself.` });
      return;
    }
    let seconds = 0;
    if (command.name === "timeout") {
      seconds = parseDuration(values.duration ?? "");
      if (!seconds || seconds > MAX_TIMEOUT_SECONDS) {
        setError({ option: "duration", text: "Use a length like 10m, 1h or 1d1h1m, up to 28 days." });
        focusOption(shown.indexOf("duration"));
        return;
      }
    }
    const reason = (values.reason ?? "").trim() || undefined;

    setBusy(true);
    setError(null);
    const err =
      command.name === "ban"
        ? await banMember(target.id, reason)
        : command.name === "kick"
          ? await kickMember(target.id)
          : await timeoutMember(target.id, seconds, reason);
    if (err) {
      setBusy(false);
      setError({ option: null, text: err });
      return;
    }

    let notified = false;
    if (reason && serverId) {
      const { data } = await getSupabaseClient().rpc("send_moderation_notice", {
        p_server_id: serverId,
        p_user_id: target.id,
        p_action: command.name,
        p_reason: reason,
      });
      notified = data === true;
    }
    setBusy(false);
    const who = `@${target.username}`;
    const length = command.name === "timeout" ? ` for ${formatDuration(seconds)}` : "";
    onDone(`${who} ${command.done}${length}.${reason ? (notified ? " @disband sent them your reason." : " They couldn't be sent your reason.") : ""}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>, opt: SlashOption, index: number) {
    const el = e.currentTarget;
    const value = values[opt.name] ?? "";
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
    const atEnd = el.selectionStart === value.length;

    if (e.key === "Escape") {
      e.preventDefault();
      onExit("");
      return;
    }
    if (pickerCount > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setPickIdx((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + pickerCount) % pickerCount);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      // Enter fills from the list first; the next Enter runs the command.
      if (commitPicker()) {
        if (index < shown.length - 1) focusOption(index + 1);
        return;
      }
      void run();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        focusOption(index - 1);
        return;
      }
      commitPicker();
      advance();
      return;
    }
    // A space ends a user or duration value, the way it ends a word; reasons
    // are free text and keep their spaces.
    if (e.key === " " && opt.kind !== "text") {
      e.preventDefault();
      if (opt.kind === "user" && !picked) commitPicker();
      advance();
      return;
    }
    if (e.key === "Backspace" && value === "") {
      e.preventDefault();
      if (index === 0) {
        onExit(`/${command.name}`);
        return;
      }
      if (!opt.required) setShown((s) => s.filter((n) => n !== opt.name));
      focusOption(index - 1);
      return;
    }
    if (e.key === "ArrowLeft" && atStart && index > 0) {
      e.preventDefault();
      focusOption(index - 1);
      return;
    }
    if (e.key === "ArrowRight" && atEnd && index < shown.length - 1) {
      e.preventDefault();
      focusOption(index + 1);
    }
  }

  const bar = error ?? null;

  return (
    <>
      {/* Member or duration picker, above the option bar. */}
      {pickerCount > 0 && !busy && (
        <div
          role="listbox"
          aria-label={option.kind === "user" ? "Members" : "Durations"}
          className="menu-pop absolute bottom-full left-4 right-4 z-20 mb-2 max-h-[340px] overflow-y-auto rounded-lg bg-bg-secondary pb-2 shadow-[var(--elevation-high)]"
        >
          <p className="px-3 pb-1 pt-3 text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-header-secondary">
            {option.kind === "user" ? "Members" : "Durations"}
          </p>
          {option.kind === "user"
            ? memberResults.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={i === pickIdx}
                  onMouseEnter={() => setPickIdx(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickMember(p);
                    advance();
                  }}
                  className={`mx-2 flex h-[34px] w-[calc(100%-16px)] items-center gap-3 rounded-[4px] px-2 text-left ${
                    i === pickIdx ? "bg-interactive-hover" : ""
                  }`}
                >
                  <span className="relative shrink-0">
                    <Avatar profile={p} size="sm" className="!h-6 !w-6 !text-[10px]" />
                    <StatusDot status={presenceStatusFor(p, presenceMap)} size={8} ring="var(--bg-secondary)" />
                  </span>
                  <span className="min-w-0 truncate text-[16px] font-medium text-header-primary">{displayName(p)}</span>
                  <span className="ml-auto shrink-0 truncate text-[14px] text-header-secondary">{p.username}</span>
                </button>
              ))
            : durationResults.map((d, i) => (
                <button
                  key={d.value}
                  type="button"
                  role="option"
                  aria-selected={i === pickIdx}
                  onMouseEnter={() => setPickIdx(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setValues((prev) => ({ ...prev, duration: d.value }));
                    advance();
                  }}
                  className={`mx-2 flex h-[34px] w-[calc(100%-16px)] items-center gap-3 rounded-[4px] px-2 text-left ${
                    i === pickIdx ? "bg-interactive-hover" : ""
                  }`}
                >
                  <span className="text-[16px] font-medium text-header-primary">{d.label}</span>
                  <span className="ml-auto font-mono text-[14px] text-header-secondary">{d.value}</span>
                </button>
              ))}
        </div>
      )}

      {/* The focused option's description, or the error. */}
      <div className="flex min-h-[40px] items-center gap-2 rounded-t-lg border-b border-bg-tertiary bg-bg-secondary pl-4 pr-2 text-[14px]">
        <p className="min-w-0 flex-1 truncate">
          {busy ? (
            <span className="text-header-secondary">Running /{command.name}…</span>
          ) : bar ? (
            <span className="text-status-dnd">{bar.text}</span>
          ) : (
            <>
              <span className="mr-2 font-semibold text-header-primary">{option.name}</span>
              <span className="text-header-secondary">{option.description}</span>
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => onExit("")}
          aria-label="Cancel command"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-interactive-normal text-bg-secondary hover:bg-interactive-active">
            <IconClose size={11} strokeWidth={3} />
          </span>
        </button>
      </div>

      <div className="flex min-h-[44px] flex-wrap items-center gap-x-1.5 gap-y-1 rounded-b-lg bg-bg-composer py-[7px] pl-4 pr-3">
        <span aria-hidden className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-interactive-normal text-bg-composer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M15.5 3 8.5 21" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
          </svg>
        </span>
        <span className="text-[16px] font-semibold leading-[22px] text-header-primary">/{command.name}</span>
        {shown.map((name, i) => {
          const opt = command.options.find((o) => o.name === name) as SlashOption;
          const value = values[name] ?? "";
          const focused = i === active;
          const bad = error?.option === name;
          const mention = name === "user" && !!picked;
          return (
            <label
              key={name}
              onMouseDown={() => focusOption(i)}
              className={`flex h-[26px] cursor-text items-stretch overflow-hidden rounded-[4px] bg-bg-tertiary text-[16px] leading-[24px] ring-1 transition-shadow ${
                bad ? "ring-status-dnd" : focused ? "ring-[#00a8fc]" : "ring-transparent"
              } ${opt.kind === "text" ? "min-w-[160px] flex-1" : ""}`}
            >
              <span className="flex items-center px-2 font-medium text-header-secondary">{name}</span>
              <span className={`relative flex items-center bg-bg-secondary-alt px-1.5 ${opt.kind === "text" ? "flex-1" : ""}`}>
                <span className={`inline-grid ${opt.kind === "text" ? "w-full" : ""}`}>
                  <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-pre">{value || " "}</span>
                  <input
                    ref={(el) => {
                      inputs.current[name] = el;
                    }}
                    value={value}
                    size={1}
                    disabled={busy}
                    aria-label={`${name}: ${opt.description}`}
                    onFocus={() => setActive(i)}
                    onChange={(e) => setValue(name, e.target.value)}
                    onKeyDown={(e) => onKeyDown(e, opt, i)}
                    spellCheck={opt.kind === "text"}
                    autoComplete="off"
                    className={`col-start-1 row-start-1 w-full min-w-[2px] bg-transparent outline-none ${
                      mention ? "font-medium text-[#c9cdfb]" : "text-text-normal"
                    }`}
                  />
                </span>
              </span>
            </label>
          );
        })}
        {hidden.length > 0 && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              setShown((s) => [...s, hidden[0].name]);
              setActive(shown.length);
            }}
            className="ml-1 text-[16px] leading-[22px] text-text-muted hover:text-text-normal"
          >
            +{hidden.length} more
          </button>
        )}
      </div>
    </>
  );
}
