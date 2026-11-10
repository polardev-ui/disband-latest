"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useMemberSearch } from "@/hooks/useMemberSearch";
import { getSupabaseClient } from "@/lib/supabase/client";
import { presenceStatusFor } from "@/lib/presence";
import { channelLinkName, displayName } from "@/lib/utils";
import { resolveMember } from "@/lib/slash-commands";
import type { CommandOption, SpaceBotCommand } from "@/lib/bot-commands";
import type { ChannelLite } from "@/lib/markdown";
import { Avatar } from "@/components/ui/Avatar";
import { StatusDot } from "@/components/ui/StatusDot";
import { IconClose } from "@/components/icons";
import type { Profile } from "@/lib/supabase/types";
import { useI18n } from "@/contexts/I18nContext";

/*
 The composer while a bot's slash command is being filled in. It looks and
 moves like SlashCommandComposer (chips, a description bar, a picker above),
 but the options come from the bot: text, numbers, true/false, a member, a
 channel, or a fixed list of choices. Enter sends the command to the bot,
 which answers in the channel.
*/

interface Props {
  command: SpaceBotCommand;
  members: Profile[];
  channels: ChannelLite[];
  serverId: string | null | undefined;
  channelId: string;
  initial?: Record<string, string>;
  onExit: (restore: string) => void;
  /** `thinking` is set when a bot was asked: it is now working on an answer. */
  onDone: (message: string, thinking?: { botUserId: string; name: string; avatarUrl: string | null }) => void;
}

interface PickItem {
  key: string;
  label: string;
  hint?: string;
  profile?: Profile;
  /** A role's colour, shown as a dot. */
  color?: string;
}

export function BotCommandComposer({ command, members, channels, serverId, channelId, initial = {}, onExit, onDone }: Props) {
  const { t } = useI18n();
  const { presenceMap, serverRoles } = useApp();
  const opts = command.options;
  const [shown, setShown] = useState<string[]>(() =>
    opts.filter((o) => o.required || initial[o.name]).map((o) => o.name),
  );
  const [values, setValues] = useState<Record<string, string>>(initial);
  // Members and channels picked from a list, by option name.
  const [picked, setPicked] = useState<Record<string, { id: string; label: string }>>({});
  const [active, setActive] = useState(() => {
    const i = shown.findIndex((n) => !initial[n]);
    return i === -1 ? Math.max(0, shown.length - 1) : i;
  });
  const [pickIdx, setPickIdx] = useState(0);
  const [error, setError] = useState<{ option: string | null; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const option: CommandOption | undefined = opts.find((o) => o.name === shown[active]);
  const hidden = opts.filter((o) => !shown.includes(o.name));
  const value = option ? values[option.name] ?? "" : "";

  useEffect(() => {
    const el = option ? inputs.current[option.name] : null;
    if (el && document.activeElement !== el) el.focus();
  }, [option]);

  const memberQuery = option?.type === "user" && !picked[option.name] ? value : null;
  const memberResults = useMemberSearch(serverId, memberQuery, members, 8);

  const items = useMemo((): PickItem[] => {
    if (!option) return [];
    const q = value.trim().toLowerCase();
    if (option.choices?.length) {
      return option.choices
        .filter((c) => !q || c.name.toLowerCase().includes(q) || String(c.value).toLowerCase().startsWith(q))
        .map((c) => ({ key: String(c.value), label: c.name }));
    }
    if (option.type === "boolean") {
      return [
        { key: "true", label: t("True") },
        { key: "false", label: t("False") },
      ].filter((b) => !q || b.key.startsWith(q));
    }
    if (option.type === "user" && !picked[option.name]) {
      return memberResults.map((p) => ({ key: p.id, label: displayName(p), hint: p.username ?? undefined, profile: p }));
    }
    if (option.type === "role" && !picked[option.name]) {
      const rq = q.replace(/^@&?/, "");
      return serverRoles
        .filter((r) => !r.is_default && (!rq || r.name.toLowerCase().includes(rq)))
        .sort((a, b) => b.position - a.position)
        .slice(0, 8)
        .map((r) => ({ key: r.id, label: `@${r.name}`, color: r.color }));
    }
    if (option.type === "channel" && !picked[option.name]) {
      return channels
        .filter((c) => !q || c.name.toLowerCase().includes(q.replace(/^#/, "")))
        .slice(0, 8)
        .map((c) => ({ key: c.id, label: `#${c.name}` }));
    }
    return [];
  }, [option, value, memberResults, channels, picked, serverRoles]);

  useEffect(() => setPickIdx(0), [active, value]);

  function focusOption(i: number) {
    setActive(Math.max(0, Math.min(i, shown.length - 1)));
  }

  function setValue(name: string, v: string) {
    setValues((prev) => ({ ...prev, [name]: v }));
    setPicked((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
    if (error?.option === name || error?.option === null) setError(null);
  }

  function advance() {
    if (active < shown.length - 1) {
      focusOption(active + 1);
      return;
    }
    if (hidden.length > 0) {
      setShown((s) => [...s, hidden[0].name]);
      setActive(shown.length);
    }
  }

  function choose(item: PickItem) {
    if (!option) return;
    const name = option.name;
    if (option.type === "user" || option.type === "channel" || option.type === "role") {
      const label = option.type === "user" ? `@${item.profile?.username ?? item.label}` : item.label;
      setValues((prev) => ({ ...prev, [name]: label }));
      setPicked((prev) => ({ ...prev, [name]: { id: item.key, label } }));
    } else {
      setValues((prev) => ({ ...prev, [name]: option.choices?.length ? item.label : item.key }));
    }
    setError(null);
  }

  /** Turn the typed chips into the values the bot gets. */
  function collect(): Record<string, unknown> | null {
    const out: Record<string, unknown> = {};
    for (const o of opts) {
      const raw = (values[o.name] ?? "").trim();
      if (!raw) {
        if (o.required) {
          setError({ option: o.name, text: `Fill in ${o.name}.` });
          if (!shown.includes(o.name)) setShown((s) => [...s, o.name]);
          focusOption(shown.indexOf(o.name));
          return null;
        }
        continue;
      }
      const fail = (text: string) => {
        setError({ option: o.name, text });
        focusOption(shown.indexOf(o.name));
        return null;
      };
      if (o.choices?.length) {
        const c = o.choices.find((c) => c.name.toLowerCase() === raw.toLowerCase() || String(c.value).toLowerCase() === raw.toLowerCase());
        if (!c) return fail(`Pick one of the choices for ${o.name}.`);
        out[o.name] = c.value;
      } else if (o.type === "integer" || o.type === "number") {
        const n = Number(raw);
        if (!Number.isFinite(n) || (o.type === "integer" && !Number.isInteger(n))) {
          return fail(`${o.name} must be a ${o.type === "integer" ? "whole number" : "number"}.`);
        }
        out[o.name] = n;
      } else if (o.type === "boolean") {
        if (!/^(true|false)$/i.test(raw)) return fail(`${o.name} must be True or False.`);
        out[o.name] = raw.toLowerCase() === "true";
      } else if (o.type === "user") {
        const id = picked[o.name]?.id ?? resolveMember(members, raw)?.id ?? (o.name === option?.name && memberResults.length === 1 ? memberResults[0].id : undefined);
        if (!id) return fail(`No member called ${raw}.`);
        out[o.name] = id;
      } else if (o.type === "role") {
        const name = raw.replace(/^@&?/, "").toLowerCase();
        const id = picked[o.name]?.id ?? serverRoles.find((r) => !r.is_default && r.name.toLowerCase() === name)?.id;
        if (!id) return fail(`No role called ${raw}. Pick one from the list.`);
        out[o.name] = id;
      } else if (o.type === "channel") {
        const id = picked[o.name]?.id ?? channels.find((c) => c.name.toLowerCase() === raw.replace(/^#/, "").toLowerCase() || channelLinkName(c.name) === channelLinkName(raw.replace(/^#/, "")))?.id;
        if (!id) return fail(`No channel called ${raw}.`);
        out[o.name] = id;
      } else {
        out[o.name] = raw;
      }
    }
    return out;
  }

  async function run() {
    if (busy) return;
    const options = collect();
    if (!options) return;
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabaseClient().rpc("invoke_bot_command", {
      p_bot_id: command.bot_id,
      p_channel_id: channelId,
      p_name: command.name,
      p_options: options,
    });
    setBusy(false);
    if (err) {
      setError({ option: null, text: err.message });
      return;
    }
    onDone(`Sent /${command.name} to ${command.bot_name}.`, { botUserId: command.bot_user_id, name: command.bot_name, avatarUrl: command.bot_avatar_url });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>, opt: CommandOption, index: number) {
    const el = e.currentTarget;
    const v = values[opt.name] ?? "";
    if (e.key === "Escape") {
      e.preventDefault();
      onExit("");
      return;
    }
    if (items.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setPickIdx((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length);
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      if (e.key === "Tab" && e.shiftKey) {
        focusOption(index - 1);
        return;
      }
      // Enter fills from the list first; the next Enter sends the command.
      const settled = (opt.type === "user" || opt.type === "channel" || opt.type === "role") ? !!picked[opt.name] : !opt.choices?.length && opt.type !== "boolean";
      if (items[pickIdx] && !settled && !(opt.choices?.length && opt.choices.some((c) => c.name === v))) {
        choose(items[pickIdx]);
        if (index < shown.length - 1) focusOption(index + 1);
        return;
      }
      if (e.key === "Tab") advance();
      else void run();
      return;
    }
    if (e.key === "Backspace" && v === "") {
      e.preventDefault();
      if (index === 0) {
        onExit(`/${command.name}`);
        return;
      }
      if (!opt.required) setShown((s) => s.filter((n) => n !== opt.name));
      focusOption(index - 1);
      return;
    }
    if (e.key === "ArrowLeft" && el.selectionStart === 0 && el.selectionEnd === 0 && index > 0) {
      e.preventDefault();
      focusOption(index - 1);
      return;
    }
    if (e.key === "ArrowRight" && el.selectionStart === v.length && index < shown.length - 1) {
      e.preventDefault();
      focusOption(index + 1);
    }
  }

  const pickerTitle = option?.type === "user" ? "Members" : option?.type === "channel" ? "Channels" : option?.type === "role" ? "Roles" : "Options";

  return (
    <>
      {items.length > 0 && !busy && option && (
        <div
          role="listbox"
          aria-label={pickerTitle}
          className="menu-pop absolute bottom-full left-4 right-4 z-20 mb-2 max-h-[340px] overflow-y-auto rounded-lg bg-bg-secondary pb-2 shadow-[var(--elevation-high)]"
        >
          <p className="px-3 pb-1 pt-3 text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-header-secondary">{pickerTitle}</p>
          {items.map((item, i) => (
            <button
              key={item.key}
              type="button"
              role="option"
              aria-selected={i === pickIdx}
              onMouseEnter={() => setPickIdx(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(item);
                advance();
              }}
              className={`mx-2 flex h-[34px] w-[calc(100%-16px)] items-center gap-3 rounded-lg px-2 text-left ${i === pickIdx ? "bg-interactive-hover" : ""}`}
            >
              {item.profile && (
                <span className="relative shrink-0">
                  <Avatar profile={item.profile} size="sm" className="!h-6 !w-6 !text-[10px]" />
                  <StatusDot status={presenceStatusFor(item.profile, presenceMap)} size={8} ring="var(--bg-secondary)" />
                </span>
              )}
              {item.color && <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />}
              <span className="min-w-0 truncate text-[16px] font-medium text-header-primary">{item.label}</span>
              {item.hint && <span className="ml-auto shrink-0 truncate text-[14px] text-header-secondary">{item.hint}</span>}
            </button>
          ))}
        </div>
      )}

      <div className="flex min-h-[40px] items-center gap-2 rounded-t-lg border-b border-bg-tertiary bg-bg-secondary pl-4 pr-2 text-[14px]">
        <p className="min-w-0 flex-1 truncate">
          {busy ? (
            <span className="text-header-secondary">{t("Sending /")}{command.name}…</span>
          ) : error ? (
            <span className="text-status-dnd">{error.text}</span>
          ) : option ? (
            <>
              <span className="mr-2 font-semibold text-header-primary">{option.name}</span>
              <span className="text-header-secondary">{option.description}</span>
            </>
          ) : (
            <span className="text-header-secondary">{command.description} · Press Enter to send.</span>
          )}
        </p>
        <button type="button" onClick={() => onExit("")} aria-label={t("Cancel command")} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-interactive-normal text-bg-secondary hover:bg-interactive-active">
            <IconClose size={11} strokeWidth={3} />
          </span>
        </button>
      </div>

      <div className="flex min-h-[44px] flex-wrap items-center gap-x-1.5 gap-y-1 rounded-b-lg bg-bg-composer py-[7px] pl-4 pr-3">
        <Avatar
          profile={{ display_name: command.bot_name, avatar_url: command.bot_avatar_url }}
          size="sm"
          className="mr-1 !h-6 !w-6 shrink-0 !text-[10px]"
        />
        <span
          tabIndex={opts.length === 0 ? 0 : -1}
          onKeyDown={(e) => {
            if (opts.length > 0) return;
            if (e.key === "Enter") {
              e.preventDefault();
              void run();
            } else if (e.key === "Escape" || e.key === "Backspace") {
              e.preventDefault();
              onExit(e.key === "Backspace" ? `/${command.name}` : "");
            }
          }}
          ref={(el) => {
            if (el && opts.length === 0 && document.activeElement !== el) el.focus();
          }}
          className="rounded text-[16px] font-semibold leading-[22px] text-header-primary outline-none"
        >
          /{command.name}
        </span>
        {shown.map((name, i) => {
          const opt = opts.find((o) => o.name === name) as CommandOption;
          const v = values[name] ?? "";
          const focused = i === active;
          const bad = error?.option === name;
          const free = opt.type === "string" && !opt.choices?.length;
          return (
            <label
              key={name}
              onMouseDown={() => focusOption(i)}
              className={`flex h-[26px] cursor-text items-stretch overflow-hidden rounded-lg bg-bg-tertiary text-[16px] leading-[24px] ring-1 transition-shadow ${
                bad ? "ring-status-dnd" : focused ? "ring-[#00a8fc]" : "ring-transparent"
              } ${free ? "min-w-[160px] flex-1" : ""}`}
            >
              <span className="flex items-center px-2 font-medium text-header-secondary">{name}</span>
              <span className={`relative flex items-center bg-bg-secondary-alt px-1.5 ${free ? "flex-1" : ""}`}>
                <span className={`inline-grid ${free ? "w-full" : ""}`}>
                  <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-pre">{v || " "}</span>
                  <input
                    ref={(el) => {
                      inputs.current[name] = el;
                    }}
                    value={v}
                    size={1}
                    disabled={busy}
                    aria-label={`${name}: ${opt.description}`}
                    inputMode={opt.type === "integer" || opt.type === "number" ? "decimal" : undefined}
                    onFocus={() => setActive(i)}
                    onChange={(e) => setValue(name, e.target.value)}
                    onKeyDown={(e) => onKeyDown(e, opt, i)}
                    spellCheck={free}
                    autoComplete="off"
                    className={`col-start-1 row-start-1 w-full min-w-[2px] bg-transparent outline-none ${
                      picked[name] ? "font-medium text-[#c9cdfb]" : "text-text-normal"
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
