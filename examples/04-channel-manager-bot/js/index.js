// =====================================================================
// 04 — CHANNEL MANAGER BOT  (Disband bot template, JavaScript)
// =====================================================================
// Creates, lists, renames, and deletes channels from chat, with name-or-id
// resolution, protected-channel safeguards, and expiring confirmation tokens
// for destructive deletes.
//
// TUTORIAL
// --------
// 1. Create the bot: Disband → Settings → Bots → New bot.
//    Scopes: messages.read, messages.write, channels.read, channels.manage
//    The bot also needs a role with "Manage Channels" in the space.
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
// 6. Try it:
//    !channel list
//    !channel list voice
//    !channel info general
//    !channel create meeting-room
//    !channel create voice-lounge --voice
//    !channel create secret --category 1234567890
//    !channel rename meeting-room standup
//    !channel delete standup          (prints a confirmation code)
//    !channel confirm a1b2c3          (actually deletes)
//    !channel bulk-create sprint 3
//
// WHY EACH PIECE EXISTS
// - Confirmation tokens: a typo or a malicious user must not delete a channel
//   with a single command. The code expires in 60 seconds.
// - Name-or-id resolution: humans type names; scripts type ids. Accept both.
// - Protected channels: never let the bot delete channels the owner marked
//   off-limits (e.g. #general, #announcements).
// - Audit log: every destructive action is recorded so owners can review.
// - Defensive role check: channels.manage scope + Manage Channels role are
//   both required; surface 403s as readable messages, not crashes.
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
  protectedChannels: (process.env.PROTECTED_CHANNELS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  confirmTtlMs: 60_000,
  bulkMax: 10,
  dataDir: process.env.CHANNELBOT_DATA_DIR || ".data",
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
// Pending delete confirmations + audit log, persisted to JSON.

const storePath = path.join(CONFIG.dataDir, "channelbot.json");
let writeChain = Promise.resolve();

async function ensureDataDir() {
  await fs.mkdir(CONFIG.dataDir, { recursive: true });
}

async function readStore() {
  try {
    const raw = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : { pending: {}, audit: [] };
  } catch (err) {
    if (err.code !== "ENOENT") log("warn", "could not read store:", err.message);
    return { pending: {}, audit: [] };
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

// ---------------------------------------------------------------- helpers

function generateCode() {
  return Math.random().toString(36).slice(2, 8);
}

// Resolve a channel by id or by name (case-insensitive). Returns the channel
// object or null. Throws on API errors so callers can surface them.
async function resolveChannel(serverId, ref) {
  const channels = await client.listChannels(serverId);
  const trimmed = String(ref).trim();
  // Try id first (exact).
  let found = channels.find((c) => String(c.id) === trimmed || String(c.display_id) === trimmed);
  if (found) return found;
  // Then name (case-insensitive).
  const lower = trimmed.toLowerCase();
  found = channels.find((c) => String(c.name || "").toLowerCase() === lower);
  if (found) return found;
  // Partial name match as a last resort.
  found = channels.find((c) => String(c.name || "").toLowerCase().includes(lower));
  return found || null;
}

function isProtected(channel) {
  const id = String(channel.id);
  const name = String(channel.name || "").toLowerCase();
  if (CONFIG.protectedChannels.includes(id)) return true;
  if (CONFIG.protectedChannels.includes(name)) return true;
  // Always protect the classic defaults even if not configured.
  return ["general", "announcements", "rules"].includes(name);
}

async function audit(action, message, detail) {
  await mutateStore(async (store) => {
    store.audit = store.audit || [];
    store.audit.unshift({
      at: new Date().toISOString(),
      action,
      user: message.author?.username || message.author?.id || "unknown",
      channel: message.channelId,
      server: message.serverId,
      detail,
    });
    // Keep the audit log bounded.
    store.audit = store.audit.slice(0, 200);
  });
}

// ---------------------------------------------------------------- commands

const commands = new Map();
function defineCommand({ name, description, usage, run }) {
  commands.set(name, { name, description, usage, run });
}

defineCommand({
  name: "channel",
  description: "Manage channels: list, info, create, rename, delete, bulk-create, confirm.",
  usage: "!channel <list|info|create|rename|delete|confirm|bulk-create> ...",
  async run(message, args) {
    const sub = (args[0] || "").toLowerCase();
    const rest = args.slice(1);
    switch (sub) {
      case "list":
      case "ls":
        return listChannels(message, rest);
      case "info":
        return channelInfo(message, rest);
      case "create":
      case "new":
        return createChannel(message, rest);
      case "rename":
        return renameChannel(message, rest);
      case "delete":
      case "rm":
        return requestDelete(message, rest);
      case "confirm":
        return confirmDelete(message, rest);
      case "bulk-create":
      case "bulk":
        return bulkCreate(message, rest);
      default:
        await message.reply(
          "Usage:\n" +
            "`!channel list [text|voice]`\n" +
            "`!channel info <name|id>`\n" +
            "`!channel create <name> [--voice] [--category <id>]`\n" +
            "`!channel rename <name|id> <new name>`\n" +
            "`!channel delete <name|id>` (prints a confirmation code)\n" +
            "`!channel confirm <code>`\n" +
            "`!channel bulk-create <prefix> <count>`",
        );
    }
  },
});

async function listChannels(message, args) {
  if (!message.serverId) return message.reply("Run this in a space channel.");
  const filter = args[0]?.toLowerCase();
  const channels = await client.listChannels(message.serverId);
  const shown = filter ? channels.filter((c) => (c.type ?? "text") === filter) : channels;
  if (!shown.length) {
    await message.reply(`No ${filter || ""} channels found.`);
    return;
  }
  const lines = shown
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
    .map((c) => {
      const kind = c.type && c.type !== "text" ? ` (${c.type})` : "";
      return `• **${c.name ?? c.id}** — \`${c.id}\`${kind}`;
    });
  await message.reply(`**Channels (${shown.length})**\n${lines.join("\n")}`);
}

async function channelInfo(message, args) {
  if (!message.serverId) return message.reply("Run this in a space channel.");
  const ref = args.join(" ").trim();
  if (!ref) return message.reply("Usage: `!channel info <name|id>`");
  const channel = await resolveChannel(message.serverId, ref);
  if (!channel) {
    await message.reply(`No channel matching **${ref}**.`);
    return;
  }
  await message.reply(
    [
      `**${channel.name ?? channel.id}**`,
      `ID: \`${channel.id}\``,
      `Type: ${channel.type || "text"}`,
      `Category: ${channel.category_id || "(none)"}`,
      `Protected: ${isProtected(channel) ? "yes" : "no"}`,
    ].join("\n"),
  );
}

async function createChannel(message, args) {
  if (!message.serverId) return message.reply("Run this in a space channel.");
  // Parse: name [--voice] [--category <id>]
  const positional = [];
  let type = "text";
  let categoryId = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--voice") {
      type = "voice";
    } else if (args[i] === "--category" && args[i + 1]) {
      categoryId = args[++i];
    } else {
      positional.push(args[i]);
    }
  }
  const name = positional.join("-").trim();
  if (!name) return message.reply("Usage: `!channel create <name> [--voice] [--category <id>]`");

  try {
    const channelId = await client.createChannel(message.serverId, name, {
      type,
      categoryId,
    });
    await audit("create", message, `${name} (${type}) -> ${channelId}`);
    await message.reply(`Created channel **${name}** (\`${channelId}\`).`);
  } catch (err) {
    log("warn", "createChannel failed:", err.message);
    await message.reply(`Could not create channel: ${err.message}`);
  }
}

async function renameChannel(message, args) {
  if (!message.serverId) return message.reply("Run this in a space channel.");
  // First token is the ref, the rest is the new name.
  if (args.length < 2) return message.reply("Usage: `!channel rename <name|id> <new name>`");
  const ref = args[0];
  const newName = args.slice(1).join(" ").trim();
  const channel = await resolveChannel(message.serverId, ref);
  if (!channel) {
    await message.reply(`No channel matching **${ref}**.`);
    return;
  }
  if (isProtected(channel)) {
    await message.reply(`**${channel.name}** is protected and cannot be renamed.`);
    return;
  }
  try {
    await client.renameChannel(channel.id, newName);
    await audit("rename", message, `${channel.name} -> ${newName}`);
    await message.reply(`Renamed **${channel.name}** to **${newName}**.`);
  } catch (err) {
    log("warn", "renameChannel failed:", err.message);
    await message.reply(`Could not rename channel: ${err.message}`);
  }
}

async function requestDelete(message, args) {
  if (!message.serverId) return message.reply("Run this in a space channel.");
  const ref = args.join(" ").trim();
  if (!ref) return message.reply("Usage: `!channel delete <name|id>`");
  const channel = await resolveChannel(message.serverId, ref);
  if (!channel) {
    await message.reply(`No channel matching **${ref}**.`);
    return;
  }
  if (isProtected(channel)) {
    await message.reply(`**${channel.name}** is protected and cannot be deleted.`);
    return;
  }

  // Issue a short-lived confirmation code.
  const code = generateCode();
  await mutateStore(async (store) => {
    store.pending = store.pending || {};
    store.pending[code] = {
      channelId: channel.id,
      channelName: channel.name,
      serverId: message.serverId,
      requester: message.author?.id || message.author?.user_id,
      expiresAt: Date.now() + CONFIG.confirmTtlMs,
    };
  });

  await message.reply(
    `⚠️ About to delete **${channel.name}** (\`${channel.id}\`).\n` +
      `This cannot be undone. Confirm within 60s with:\n` +
      `\`!channel confirm ${code}\``,
  );
}

async function confirmDelete(message, args) {
  if (!message.serverId) return message.reply("Run this in a space channel.");
  const code = (args[0] || "").trim().toLowerCase();
  if (!code) return message.reply("Usage: `!channel confirm <code>`");

  const pending = await mutateStore(async (store) => {
    store.pending = store.pending || {};
    const entry = store.pending[code];
    if (!entry) return null;
    if (entry.serverId !== message.serverId) return null;
    if (Date.now() > entry.expiresAt) {
      delete store.pending[code];
      return { expired: true };
    }
    // Consume the token immediately so it cannot be replayed.
    delete store.pending[code];
    return entry;
  });

  if (!pending) {
    await message.reply("Unknown or already-used confirmation code.");
    return;
  }
  if (pending.expired) {
    await message.reply("That confirmation code has expired. Run delete again.");
    return;
  }

  try {
    await client.deleteChannel(pending.channelId);
    await audit("delete", message, `${pending.channelName} (${pending.channelId})`);
    await message.reply(`Deleted channel **${pending.channelName}**.`);
  } catch (err) {
    log("warn", "deleteChannel failed:", err.message);
    await message.reply(`Could not delete channel: ${err.message}`);
  }
}

async function bulkCreate(message, args) {
  if (!message.serverId) return message.reply("Run this in a space channel.");
  const prefix = args[0];
  const count = parseInt(args[1], 10);
  if (!prefix || !Number.isFinite(count) || count < 1) {
    return message.reply("Usage: `!channel bulk-create <prefix> <count>`");
  }
  if (count > CONFIG.bulkMax) {
    return message.reply(`Refusing to create more than ${CONFIG.bulkMax} channels at once.`);
  }

  const created = [];
  for (let i = 1; i <= count; i++) {
    const name = `${prefix}-${i}`;
    try {
      const id = await client.createChannel(message.serverId, name);
      created.push(`${name} (\`${id}\`)`);
      await audit("create", message, `${name} -> ${id}`);
    } catch (err) {
      log("warn", "bulk create failed on", name, err.message);
      created.push(`${name} — FAILED: ${err.message}`);
    }
  }
  await message.reply(`**Bulk create (${created.length})**\n${created.join("\n")}`);
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
    if (!content.startsWith(CONFIG.prefix)) return;
    const withoutPrefix = content.slice(CONFIG.prefix.length).trim();
    if (!withoutPrefix) return;
    const [rawName, ...args] = withoutPrefix.split(/\s+/);
    const name = rawName.toLowerCase();
    if (name !== "channel") return;

    log("info", `${message.author?.username || "someone"} ran !channel ${args.join(" ")} in ${message.channelId}`);
    const cmd = commands.get("channel");
    await cmd.run(message, args);
  } catch (err) {
    log("error", "messageCreate handler failed:", err);
    try {
      await message.reply("Something went wrong. Check the bot logs.");
    } catch (replyErr) {
      log("error", "could not send error reply:", replyErr.message);
    }
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
log("info", "Channel manager bot is running. Press Ctrl+C to stop.");
