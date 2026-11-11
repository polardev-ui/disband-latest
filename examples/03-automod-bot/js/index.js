// =====================================================================
// 03 — AUTO-MOD BOT  (Disband bot template, JavaScript)
// =====================================================================
// Deletes messages that match a configurable ban list (words + regex),
// posts a mod-log entry, tracks per-user warning counts, and supports a
// dry-run mode so you can tune rules without deleting anything.
//
// TUTORIAL
// --------
// 1. Create the bot: Disband → Settings → Bots → New bot.
//    Scopes: messages.read, messages.write, messages.delete, members.read
//    The bot also needs a role with "Manage Messages" in the space to delete
//    other people's messages (its own messages can always be deleted).
//    Copy the token (shown once).
//
// 2. Invite it to a space (Settings → Bots → Invite → copy link → owner approves).
//
// 3. Install: npm install @disband/bot
//
// 4. Paste the token below (or set DISBAND_BOT_TOKEN).
//
// 5. Run: node index.js
//
// 6. Configure in the space:
//    !automod status
//    !automod addword scam
//    !automod addregex \\bfree\\s+nitro\\b
//    !automod whitelist #general
//    !automod immune @Moderator
//    !automod log #mod-log
//    !automod dryrun on        (test without deleting)
//    !warnings @someone
//
// WHY EACH PIECE EXISTS
// - Dry-run first: tuning a ban list on real traffic without deleting lets you
//   measure false positives. Five real users were nearly banned in production
//   for *discussing* abuse — see the false-positive lesson in HANDOFF.md.
// - Never auto-ban from text: text alone is never enough to suspend an account.
//   This bot only deletes messages; humans decide bans.
// - Immune roles: moderators and the bot itself must not be filtered.
// - Cached member lookup: listMembers on every message would hammer the API.
// - Normalisation: zero-width chars and casing tricks evade naive matching.
// =====================================================================

import process from "node:process";
import fs from "node:fs/promises";
import path from "node:path";
import { Client } from "@disband/bot";

// ===================== BOT TOKEN (paste here) =====================
const BOT_TOKEN = process.env.DISBAND_BOT_TOKEN || "PASTE_YOUR_BOT_TOKEN_HERE";
// ================================================================

const CONFIG = {
  prefix: "!",
  dataDir: process.env.AUTOMOD_DATA_DIR || ".data",
  memberCacheTtlMs: 60_000,   // how long to cache member/role lookups
  maxWarnings: 5,             // warnings before a (logged) escalation note
  logLevel: process.env.LOG_LEVEL || "info",
};

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
function log(level, ...args) {
  if (LEVELS[level] < LEVELS[CONFIG.logLevel]) return;
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
  if (level === "error") console.error(line, ...args);
  else if (level === "warn") console.warn(line, ...args);
  else console.log(line, ...args);
}

if (!BOT_TOKEN || BOT_TOKEN === "PASTE_YOUR_BOT_TOKEN_HERE") {
  log("error", "No bot token. Paste one into BOT_TOKEN or set DISBAND_BOT_TOKEN.");
  process.exit(1);
}

const client = new Client({ token: BOT_TOKEN });

// ---------------------------------------------------------------- storage
// Per-space config + warning counts, persisted to JSON.
//   { "spaceId": { bannedWords: [], bannedRegex: [], whitelist: [], immuneRoles: [],
//                  modLogChannel: null, dryRun: false, warnings: { userId: n } } }

const storePath = path.join(CONFIG.dataDir, "automod.json");
let writeChain = Promise.resolve();

async function ensureDataDir() {
  await fs.mkdir(CONFIG.dataDir, { recursive: true });
}

async function readStore() {
  try {
    const raw = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    if (err.code !== "ENOENT") log("warn", "could not read store:", err.message);
    return {};
  }
}

async function writeStore(store) {
  await ensureDataDir();
  const tmp = storePath + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(tmp, storePath);
}

function mutateStore(mutate) {
  writeChain = writeChain.then(async () => {
    const store = await readStore();
    const result = await mutate(store);
    await writeStore(store);
    return result;
  });
  return writeChain;
}

function spaceConfig(store, serverId) {
  const key = serverId || "dm";
  if (!store[key]) {
    store[key] = {
      bannedWords: [],
      bannedRegex: [],
      whitelist: [],
      immuneRoles: [],
      modLogChannel: null,
      dryRun: false,
      warnings: {},
    };
  }
  return store[key];
}

// ---------------------------------------------------------------- matching
// Normalise text so evasion tricks (zero-width chars, weird casing) still match.

function normalise(text) {
  return String(text)
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")   // zero-width
    .replace(/\s+/g, " ")
    .trim();
}

function matches(cfg, content) {
  const haystack = normalise(content);
  const reasons = [];
  for (const word of cfg.bannedWords) {
    if (word && haystack.includes(normalise(word))) reasons.push(`word "${word}"`);
  }
  for (const pattern of cfg.bannedRegex) {
    try {
      if (new RegExp(pattern, "i").test(content)) reasons.push(`regex /${pattern}/`);
    } catch (err) {
      log("warn", "bad regex in config:", pattern, err.message);
    }
  }
  return reasons;
}

// ---------------------------------------------------------------- member cache
// listMembers on every message would burn the rate limit. Cache per space.

const memberCache = new Map(); // serverId -> { at, members }

async function getMembers(serverId) {
  const cached = memberCache.get(serverId);
  if (cached && Date.now() - cached.at < CONFIG.memberCacheTtlMs) return cached.members;
  const members = await client.listMembers(serverId);
  memberCache.set(serverId, { at: Date.now(), members });
  return members;
}

function memberRoles(member) {
  return Array.isArray(member?.roles) ? member.roles : [];
}

async function isImmune(message, cfg) {
  if (!message.serverId) return false;
  // The bot never filters itself.
  if (message.author?.id && client.user?.id && message.author.id === client.user.id) return true;
  try {
    const members = await getMembers(message.serverId);
    const me = members.find((m) => m.id === message.author?.id || m.user_id === message.author?.id);
    if (!me) return false;
    const roles = memberRoles(me);
    return cfg.immuneRoles.some((r) => roles.includes(r));
  } catch (err) {
    log("warn", "member lookup failed:", err.message);
    return false; // fail open: do not delete if we cannot verify immunity
  }
}

// ---------------------------------------------------------------- mod log

async function postModLog(cfg, text) {
  if (!cfg.modLogChannel) return;
  try {
    await client.sendMessage(cfg.modLogChannel, text);
  } catch (err) {
    log("warn", "could not post to mod-log:", err.message);
  }
}

// ---------------------------------------------------------------- commands

const commands = new Map();
function defineCommand({ name, description, usage, run }) {
  commands.set(name, { name, description, usage, run });
}

defineCommand({
  name: "automod",
  description: "Configure auto-moderation for this space.",
  usage: "!automod <status|addword|removeword|addregex|removeregex|list|whitelist|unwhitelist|immune|unimmune|log|dryrun>",
  async run(message, args) {
    const sub = (args[0] || "").toLowerCase();
    const rest = args.slice(1);
    switch (sub) {
      case "status":
        return status(message);
      case "addword":
        return addWord(message, rest);
      case "removeword":
        return removeWord(message, rest);
      case "addregex":
        return addRegex(message, rest);
      case "removeregex":
        return removeRegex(message, rest);
      case "list":
        return listRules(message);
      case "whitelist":
        return setWhitelist(message, rest, true);
      case "unwhitelist":
        return setWhitelist(message, rest, false);
      case "immune":
        return setImmune(message, rest, true);
      case "unimmune":
        return setImmune(message, rest, false);
      case "log":
        return setLog(message, rest);
      case "dryrun":
        return setDryRun(message, rest);
      default:
        await message.reply(
          "Usage:\n" +
            "`!automod status`\n" +
            "`!automod addword <word>` / `removeword <word>`\n" +
            "`!automod addregex <pattern>` / `removeregex <pattern>`\n" +
            "`!automod list`\n" +
            "`!automod whitelist #channel` / `unwhitelist #channel`\n" +
            "`!automod immune @role` / `unimmune @role`\n" +
            "`!automod log #mod-log`\n" +
            "`!automod dryrun on|off`",
        );
    }
  },
});

async function loadCfg(message) {
  const store = await readStore();
  return spaceConfig(store, message.serverId);
}

async function saveCfg(message, mutator) {
  return mutateStore(async (store) => {
    const cfg = spaceConfig(store, message.serverId);
    return mutator(cfg);
  });
}

async function status(message) {
  if (!message.serverId) return message.reply("Run this in a space channel.");
  const cfg = await loadCfg(message);
  await message.reply(
    [
      "**Auto-mod status**",
      `Dry run: **${cfg.dryRun ? "on (nothing is deleted)" : "off"}**`,
      `Banned words: ${cfg.bannedWords.length}`,
      `Banned regex: ${cfg.bannedRegex.length}`,
      `Whitelisted channels: ${cfg.whitelist.length}`,
      `Immune roles: ${cfg.immuneRoles.length}`,
      `Mod-log channel: ${cfg.modLogChannel || "(none)"}`,
      `Tracked users: ${Object.keys(cfg.warnings).length}`,
    ].join("\n"),
  );
}

async function addWord(message, args) {
  const word = args.join(" ").trim().toLowerCase();
  if (!word) return message.reply("Usage: `!automod addword <word>`");
  await saveCfg(message, (cfg) => {
    if (!cfg.bannedWords.includes(word)) cfg.bannedWords.push(word);
  });
  await message.reply(`Added banned word: \`${word}\`.`);
}

async function removeWord(message, args) {
  const word = args.join(" ").trim().toLowerCase();
  await saveCfg(message, (cfg) => {
    cfg.bannedWords = cfg.bannedWords.filter((w) => w !== word);
  });
  await message.reply(`Removed banned word: \`${word}\`.`);
}

async function addRegex(message, args) {
  const pattern = args.join(" ").trim();
  if (!pattern) return message.reply("Usage: `!automod addregex <pattern>`");
  try {
    new RegExp(pattern, "i"); // validate
  } catch (err) {
    await message.reply(`Invalid regex: ${err.message}`);
    return;
  }
  await saveCfg(message, (cfg) => {
    if (!cfg.bannedRegex.includes(pattern)) cfg.bannedRegex.push(pattern);
  });
  await message.reply(`Added banned regex: \`/${pattern}/\`.`);
}

async function removeRegex(message, args) {
  const pattern = args.join(" ").trim();
  await saveCfg(message, (cfg) => {
    cfg.bannedRegex = cfg.bannedRegex.filter((p) => p !== pattern);
  });
  await message.reply(`Removed banned regex: \`/${pattern}/\`.`);
}

async function listRules(message) {
  const cfg = await loadCfg(message);
  const words = cfg.bannedWords.length ? cfg.bannedWords.map((w) => `\`${w}\``).join(", ") : "(none)";
  const regexes = cfg.bannedRegex.length ? cfg.bannedRegex.map((p) => `\`/${p}/\``).join(", ") : "(none)";
  await message.reply(`**Banned words:** ${words}\n**Banned regex:** ${regexes}`);
}

async function setWhitelist(message, args, add) {
  // Accept a channel id or a #mention-like token; strip non-digits.
  const raw = args.join(" ").trim();
  const channelId = raw.replace(/[^\d]/g, "");
  if (!channelId) return message.reply("Usage: `!automod whitelist #channel`");
  await saveCfg(message, (cfg) => {
    if (add) {
      if (!cfg.whitelist.includes(channelId)) cfg.whitelist.push(channelId);
    } else {
      cfg.whitelist = cfg.whitelist.filter((c) => c !== channelId);
    }
  });
  await message.reply(`${add ? "Whitelisted" : "Removed whitelist for"} channel \`${channelId}\`.`);
}

async function setImmune(message, args, add) {
  const roleId = args.join(" ").trim().replace(/[^\d]/g, "");
  if (!roleId) return message.reply("Usage: `!automod immune <roleId>`");
  await saveCfg(message, (cfg) => {
    if (add) {
      if (!cfg.immuneRoles.includes(roleId)) cfg.immuneRoles.push(roleId);
    } else {
      cfg.immuneRoles = cfg.immuneRoles.filter((r) => r !== roleId);
    }
  });
  await message.reply(`${add ? "Added" : "Removed"} immune role \`${roleId}\`.`);
}

async function setLog(message, args) {
  const channelId = args.join(" ").trim().replace(/[^\d]/g, "");
  if (!channelId) return message.reply("Usage: `!automod log #mod-log`");
  await saveCfg(message, (cfg) => {
    cfg.modLogChannel = channelId;
  });
  await message.reply(`Mod-log channel set to \`${channelId}\`.`);
}

async function setDryRun(message, args) {
  const value = (args[0] || "").toLowerCase();
  if (!["on", "off", "true", "false"].includes(value)) {
    return message.reply("Usage: `!automod dryrun on|off`");
  }
  const on = value === "on" || value === "true";
  await saveCfg(message, (cfg) => {
    cfg.dryRun = on;
  });
  await message.reply(`Dry run ${on ? "enabled (nothing will be deleted)" : "disabled"}.`);
}

defineCommand({
  name: "warnings",
  description: "Show warning counts, optionally for one user.",
  usage: "!warnings [@user]",
  async run(message, args) {
    if (!message.serverId) return message.reply("Run this in a space channel.");
    const cfg = await loadCfg(message);
    const target = args.join(" ").trim();
    if (target) {
      const n = cfg.warnings[target] || 0;
      await message.reply(`Warnings for \`${target}\`: **${n}**.`);
      return;
    }
    const entries = Object.entries(cfg.warnings);
    if (!entries.length) {
      await message.reply("No warnings recorded.");
      return;
    }
    const lines = entries
      .sort((a, b) => b[1] - a[1])
      .map(([u, n]) => `• \`${u}\` — ${n}`);
    await message.reply(`**Warning counts**\n${lines.join("\n")}`);
  },
});

defineCommand({
  name: "clearwarnings",
  description: "Reset warning counts (all or one user).",
  usage: "!clearwarnings [@user]",
  async run(message, args) {
    if (!message.serverId) return message.reply("Run this in a space channel.");
    const target = args.join(" ").trim();
    await saveCfg(message, (cfg) => {
      if (target) delete cfg.warnings[target];
      else cfg.warnings = {};
    });
    await message.reply(target ? `Cleared warnings for \`${target}\`.` : "Cleared all warnings.");
  },
});

// ---------------------------------------------------------------- moderation

async function moderate(message) {
  if (message.author?.is_bot) return;
  if (!message.serverId) return;
  if (!message.content) return;

  const cfg = await (async () => {
    const store = await readStore();
    return spaceConfig(store, message.serverId);
  })();

  // Whitelisted channels are never filtered.
  if (cfg.whitelist.includes(message.channelId)) return;

  // Immune roles (moderators, etc.) bypass filtering.
  if (await isImmune(message, cfg)) return;

  const reasons = matches(cfg, message.content);
  if (!reasons.length) return;

  const dryRun = cfg.dryRun;
  const authorId = message.author?.id || message.author?.user_id || "unknown";

  if (dryRun) {
    log("info", `[dry-run] would delete ${message.id}: ${reasons.join(", ")}`);
    await postModLog(
      cfg,
      `🧪 [dry-run] ${message.author?.username || "user"} in <#${message.channelId}>: ` +
        `${reasons.join(", ")}\n> ${message.content.slice(0, 200)}`,
    );
    return;
  }

  // Delete the offending message.
  try {
    await message.delete();
  } catch (err) {
    log("warn", "could not delete message:", err.message);
    await postModLog(cfg, `⚠️ Failed to delete ${message.id}: ${err.message}`);
    return;
  }

  // Track warnings.
  const warnings = await mutateStore(async (store) => {
    const c = spaceConfig(store, message.serverId);
    c.warnings[authorId] = (c.warnings[authorId] || 0) + 1;
    return c.warnings[authorId];
  });

  await postModLog(
    cfg,
    `🗑️ Deleted message from ${message.author?.username || "user"} in <#${message.channelId}>.\n` +
      `Reasons: ${reasons.join(", ")}\n` +
      `Warnings: ${warnings}/${CONFIG.maxWarnings}\n` +
      `> ${message.content.slice(0, 200)}`,
  );

  if (warnings >= CONFIG.maxWarnings) {
    await postModLog(
      cfg,
      `🚨 ${message.author?.username || "user"} has reached ${warnings} warnings. Human review recommended.`,
    );
  }

  // Optional: tell the user in-channel (ephemeral-ish; just a normal message).
  try {
    await client.sendMessage(
      message.channelId,
      `${message.author?.username || "User"}, your message was removed (${reasons.join(", ")}). ` +
        `Warning ${warnings}/${CONFIG.maxWarnings}.`,
    );
  } catch (err) {
    log("warn", "could not send notice:", err.message);
  }
}

// ---------------------------------------------------------------- events

client.on("ready", (me) => {
  log("info", `Connected as ${me.name} (${me.id})`);
  log("info", `Granted scopes: ${me.scopes.length ? me.scopes.join(", ") : "(none)"}`);
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author?.is_bot) return;
    const content = message.content ?? "";

    // Commands first.
    if (content.startsWith(CONFIG.prefix)) {
      const withoutPrefix = content.slice(CONFIG.prefix.length).trim();
      if (withoutPrefix) {
        const [rawName, ...args] = withoutPrefix.split(/\s+/);
        const name = rawName.toLowerCase();
        if (name === "automod" || name === "warnings" || name === "clearwarnings") {
          const cmd = commands.get(name) || commands.get("automod");
          if (name === "automod") await cmd.run(message, args);
          else if (name === "warnings") await commands.get("warnings").run(message, args);
          else await commands.get("clearwarnings").run(message, args);
          return;
        }
      }
    }

    // Then moderation.
    await moderate(message);
  } catch (err) {
    log("error", "messageCreate handler failed:", err);
  }
});

client.on("error", (err) => log("error", "gateway error:", err.message ?? err));

// ---------------------------------------------------------------- lifecycle

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("info", `received ${signal}; closing gateway…`);
  client.close();
  setTimeout(() => process.exit(0), 250);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await ensureDataDir();
await client.connect();
log("info", "Auto-mod bot is running. Press Ctrl+C to stop.");
