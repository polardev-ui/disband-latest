/*
 Slash commands and buttons for bots, in Discord's shape where it makes sense
 so bot libraries map across with little change.

   command   name 1–32 (a-z 0-9 _ -) · description 1–100 · 25 options · 100 per bot
   option    name 1–32 · description 1–100 · 25 choices
   buttons   5 rows of up to 5 · label 80 · custom_id 100

 normalizeCommands() and normalizeComponents() are the only way these reach
 the database. Each returns the first problem in plain words.
*/

export type CommandOptionType = "string" | "integer" | "number" | "boolean" | "user" | "channel";

export const COMMAND_OPTION_TYPES: CommandOptionType[] = ["string", "integer", "number", "boolean", "user", "channel"];

export interface CommandChoice {
  name: string;
  value: string | number;
}

export interface CommandOption {
  name: string;
  description: string;
  type: CommandOptionType;
  required: boolean;
  choices?: CommandChoice[];
}

export interface BotCommandDef {
  name: string;
  description: string;
  options: CommandOption[];
}

/** A command as the composer gets it from space_bot_commands(). */
export interface SpaceBotCommand extends BotCommandDef {
  bot_id: string;
  bot_user_id: string;
  bot_name: string;
  bot_avatar_url: string | null;
}

export type ButtonStyle = "primary" | "secondary" | "success" | "danger" | "link";

export interface MessageButton {
  type: "button";
  style: ButtonStyle;
  label: string;
  custom_id?: string;
  url?: string;
  emoji?: string;
  disabled?: boolean;
}

export interface ActionRow {
  type: "action_row";
  components: MessageButton[];
}

/** Who ran the command a bot's message answers. */
export interface MessageInteractionInfo {
  id: string;
  type: "command" | "component";
  name: string | null;
  user_id: string;
  username: string | null;
  display_name: string | null;
}

export const COMMAND_LIMITS = { commands: 100, options: 25, choices: 25, rows: 5, buttons: 5 } as const;

const NAME = /^[a-z0-9_-]{1,32}$/;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length >= 1 && t.length <= max ? t : null;
}

function normalizeOption(raw: unknown, where: string): Result<CommandOption> {
  const o = (raw ?? {}) as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim().toLowerCase() : "";
  if (!NAME.test(name)) return { ok: false, error: `${where}: option names are 1–32 lowercase letters, digits, _ or -.` };
  const description = text(o.description, 100);
  if (!description) return { ok: false, error: `${where}.${name}: description must be 1–100 characters.` };
  const type = o.type as CommandOptionType;
  if (!COMMAND_OPTION_TYPES.includes(type)) {
    return { ok: false, error: `${where}.${name}: type must be one of ${COMMAND_OPTION_TYPES.join(", ")}.` };
  }
  const option: CommandOption = { name, description, type, required: o.required === true };
  if (o.choices !== undefined) {
    if (!Array.isArray(o.choices) || o.choices.length > COMMAND_LIMITS.choices) {
      return { ok: false, error: `${where}.${name}: choices must be a list of up to ${COMMAND_LIMITS.choices}.` };
    }
    if (!["string", "integer", "number"].includes(type)) {
      return { ok: false, error: `${where}.${name}: only string, integer and number options can have choices.` };
    }
    const choices: CommandChoice[] = [];
    for (const c of o.choices as Record<string, unknown>[]) {
      const label = text(c?.name, 100);
      const value = c?.value;
      const fits = type === "string" ? typeof value === "string" && value.length <= 100 : typeof value === "number" && Number.isFinite(value) && (type === "number" || Number.isInteger(value));
      if (!label || !fits) return { ok: false, error: `${where}.${name}: each choice needs a name and a ${type} value.` };
      choices.push({ name: label, value: value as string | number });
    }
    if (choices.length) option.choices = choices;
  }
  return { ok: true, value: option };
}

export function normalizeCommand(raw: unknown, where = "command"): Result<BotCommandDef> {
  const c = (raw ?? {}) as Record<string, unknown>;
  const name = typeof c.name === "string" ? c.name.trim().toLowerCase() : "";
  if (!NAME.test(name)) return { ok: false, error: `${where}: names are 1–32 lowercase letters, digits, _ or -.` };
  const description = text(c.description, 100);
  if (!description) return { ok: false, error: `/${name}: description must be 1–100 characters.` };
  const rawOptions = c.options ?? [];
  if (!Array.isArray(rawOptions) || rawOptions.length > COMMAND_LIMITS.options) {
    return { ok: false, error: `/${name}: options must be a list of up to ${COMMAND_LIMITS.options}.` };
  }
  const options: CommandOption[] = [];
  for (const raw of rawOptions) {
    const r = normalizeOption(raw, `/${name}`);
    if (!r.ok) return r;
    if (options.some((o) => o.name === r.value.name)) return { ok: false, error: `/${name}: option ${r.value.name} appears twice.` };
    options.push(r.value);
  }
  // Discord's rule, which keeps the composer's chip order sensible.
  const firstOptional = options.findIndex((o) => !o.required);
  if (firstOptional !== -1 && options.slice(firstOptional).some((o) => o.required)) {
    return { ok: false, error: `/${name}: required options must come before optional ones.` };
  }
  return { ok: true, value: { name, description, options } };
}

export function normalizeCommands(raw: unknown): Result<BotCommandDef[]> {
  if (!Array.isArray(raw)) return { ok: false, error: "Send a list of commands." };
  if (raw.length > COMMAND_LIMITS.commands) return { ok: false, error: `A bot can have at most ${COMMAND_LIMITS.commands} commands.` };
  const out: BotCommandDef[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = normalizeCommand(raw[i], `commands[${i}]`);
    if (!r.ok) return r;
    if (out.some((c) => c.name === r.value.name)) return { ok: false, error: `/${r.value.name} appears twice.` };
    out.push(r.value);
  }
  return { ok: true, value: out };
}

const STYLES: ButtonStyle[] = ["primary", "secondary", "success", "danger", "link"];
// Discord's numeric styles, so discord.js-style payloads work as they are.
const STYLE_NUMBERS: Record<number, ButtonStyle> = { 1: "primary", 2: "secondary", 3: "success", 4: "danger", 5: "link" };

/** Buttons a bot attached to a message. `undefined` in, `null` out means "none". */
export function normalizeComponents(raw: unknown): Result<ActionRow[] | null> {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (!Array.isArray(raw) || raw.length > COMMAND_LIMITS.rows) {
    return { ok: false, error: `components must be a list of up to ${COMMAND_LIMITS.rows} action rows.` };
  }
  const rows: ActionRow[] = [];
  const ids = new Set<string>();
  for (const r of raw as Record<string, unknown>[]) {
    const list = r?.components;
    if (!Array.isArray(list) || list.length < 1 || list.length > COMMAND_LIMITS.buttons) {
      return { ok: false, error: `Each action row needs 1–${COMMAND_LIMITS.buttons} buttons.` };
    }
    const buttons: MessageButton[] = [];
    for (const b of list as Record<string, unknown>[]) {
      const style = typeof b?.style === "number" ? STYLE_NUMBERS[b.style] : (b?.style as ButtonStyle) ?? "secondary";
      if (!STYLES.includes(style)) return { ok: false, error: `Button style must be one of ${STYLES.join(", ")}.` };
      const label = text(b?.label, 80);
      const emoji = typeof b?.emoji === "string" && b.emoji.length <= 32 ? b.emoji : undefined;
      if (!label && !emoji) return { ok: false, error: "Each button needs a label (up to 80 characters) or an emoji." };
      const button: MessageButton = { type: "button", style, label: label ?? "" };
      if (emoji) button.emoji = emoji;
      if (b?.disabled === true) button.disabled = true;
      if (style === "link") {
        const url = typeof b?.url === "string" ? b.url : "";
        if (!/^https:\/\/[^\s]{1,500}$/.test(url)) return { ok: false, error: "Link buttons need an https url." };
        button.url = url;
      } else {
        const id = text(b?.custom_id, 100);
        if (!id) return { ok: false, error: "Buttons need a custom_id of 1–100 characters." };
        if (ids.has(id)) return { ok: false, error: `custom_id ${id} is used twice.` };
        ids.add(id);
        button.custom_id = id;
      }
      buttons.push(button);
    }
    rows.push({ type: "action_row", components: buttons });
  }
  return { ok: true, value: rows };
}
