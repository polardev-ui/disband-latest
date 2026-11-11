// =====================================================================
// 02 — NOTES BOT  (Disband bot template, JavaScript)
// =====================================================================
// A bot that stores per-space notes: add, list, show, search, delete, export.
// Teaches JSON persistence, atomic writes, CRUD, argument parsing, pagination,
// and defensive handling of concurrent gateway events.
//
// TUTORIAL
// --------
// 1. Create the bot: Disband → Settings → Bots → New bot.
//    Scopes: messages.read, messages.write
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
//    !note add Meeting :: Discuss Q4 roadmap
//    !note add TODO :: Buy milk
//    !note list
//    !note show Meeting
//    !note search milk
//    !note delete TODO
//    !note export
//
// NOTES FORMAT
//   !note add <title> :: <body>     (title and body separated by " :: ")
//   !note list [page]               (5 per page)
//   !note show <title>
//   !note search <query>
//   !note delete <title>
//   !note export                    (dumps every note in this space)
//
// WHY EACH PIECE EXISTS
// - Per-space store: notes from space A must never leak into space B.
// - Atomic writes (temp file + rename): a crash mid-write cannot corrupt the
//   whole store.
// - Title normalisation (trim + lowercase key): "Meeting" and "meeting" are
//   the same note; display keeps original casing.
// - Lock around read-modify-write: the gateway can fire two messageCreate
//   events close together; serialising prevents lost updates.
// - Pagination: a space with hundreds of notes must not flood the channel.
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
  pageSize: 5,
  maxTitleLength: 60,
  maxBodyLength: 1_500,
  maxNotesPerSpace: 200,
  dataDir: process.env.NOTES_DATA_DIR || ".data",
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
// Notes are stored as JSON on disk:
//   { "spaceId": { "titleKey": { title, body, author, createdAt, updatedAt } } }
//
// Why a file and not memory? Memory is lost on restart. A JSON file is the
// simplest durable store that needs no database driver. For production, swap
// this module for SQLite/Postgres; the rest of the bot does not change.

const storePath = path.join(CONFIG.dataDir, "notes.json");
// A simple promise chain serialises read-modify-write so two near-simultaneous
// events cannot clobber each other.
let writeChain = Promise.resolve();

async function ensureDataDir() {
  await fs.mkdir(CONFIG.dataDir, { recursive: true });
}

async function readStore() {
  try {
    const raw = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object") ? parsed : {};
  } catch (err) {
    if (err.code !== "ENOENT") log("warn", "could not read store:", err.message);
    return {};
  }
}

// Atomic write: write to a temp file in the same directory, then rename.
// rename() is atomic on the same filesystem, so a crash cannot leave a
// half-written notes.json.
async function writeStore(store) {
  await ensureDataDir();
  const tmp = storePath + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(tmp, storePath);
}

// Serialised read-modify-write helper. `mutate(store)` may return a value.
function mutateStore(mutate) {
  writeChain = writeChain.then(async () => {
    const store = await readStore();
    const result = await mutate(store);
    await writeStore(store);
    return result;
  });
  return writeChain;
}

function spaceKey(serverId) {
  return serverId || "dm";
}

function normaliseTitle(title) {
  return String(title).trim().toLowerCase();
}

// ---------------------------------------------------------------- commands

const commands = new Map();
function defineCommand({ name, description, usage, run }) {
  commands.set(name, { name, description, usage, run });
}

defineCommand({
  name: "note",
  description: "Manage per-space notes. Subcommands: add, list, show, search, delete, export.",
  usage: "!note <add|list|show|search|delete|export> ...",
  async run(message, args) {
    const sub = (args[0] || "").toLowerCase();
    const rest = args.slice(1);
    switch (sub) {
      case "add":
        return addNote(message, rest);
      case "list":
        return listNotes(message, rest);
      case "show":
        return showNote(message, rest);
      case "search":
        return searchNotes(message, rest);
      case "delete":
      case "rm":
        return deleteNote(message, rest);
      case "export":
        return exportNotes(message);
      default:
        await message.reply(
          "Usage:\n" +
            "`!note add <title> :: <body>`\n" +
            "`!note list [page]`\n" +
            "`!note show <title>`\n" +
            "`!note search <query>`\n" +
            "`!note delete <title>`\n" +
            "`!note export`",
        );
    }
  },
});

async function addNote(message, args) {
  // Title and body are separated by " :: " so titles can contain spaces.
  const joined = args.join(" ");
  const sep = " :: ";
  const idx = joined.indexOf(sep);
  if (idx === -1) {
    await message.reply("Format: `!note add <title> :: <body>`");
    return;
  }
  const title = joined.slice(0, idx).trim();
  const body = joined.slice(idx + sep.length).trim();
  if (!title || !body) {
    await message.reply("Both title and body are required.");
    return;
  }
  if (title.length > CONFIG.maxTitleLength) {
    await message.reply(`Title is too long (max ${CONFIG.maxTitleLength} chars).`);
    return;
  }
  if (body.length > CONFIG.maxBodyLength) {
    await message.reply(`Body is too long (max ${CONFIG.maxBodyLength} chars).`);
    return;
  }

  const key = normaliseTitle(title);
  const author = message.author?.username || message.author?.name || "unknown";
  const result = await mutateStore(async (store) => {
    const space = (store[spaceKey(message.serverId)] ||= {});
    if (Object.keys(space).length >= CONFIG.maxNotesPerSpace) {
      return { ok: false, reason: `This space already has ${CONFIG.maxNotesPerSpace} notes. Delete some first.` };
    }
    const existing = space[key];
    space[key] = {
      title,
      body,
      author,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return { ok: true, updated: Boolean(existing) };
  });

  if (!result.ok) {
    await message.reply(result.reason);
    return;
  }
  await message.reply(result.updated ? `Updated note **${title}**.` : `Saved note **${title}**.`);
}

async function listNotes(message, args) {
  const page = Math.max(1, parseInt(args[0], 10) || 1);
  const store = await readStore();
  const space = store[spaceKey(message.serverId)] || {};
  const entries = Object.values(space).sort((a, b) => a.title.localeCompare(b.title));
  if (!entries.length) {
    await message.reply("No notes yet. Add one with `!note add <title> :: <body>`.");
    return;
  }
  const totalPages = Math.ceil(entries.length / CONFIG.pageSize);
  const pageSafe = Math.min(page, totalPages);
  const slice = entries.slice((pageSafe - 1) * CONFIG.pageSize, pageSafe * CONFIG.pageSize);
  const lines = slice.map((n, i) => {
    const preview = n.body.length > 60 ? n.body.slice(0, 57) + "…" : n.body;
    return `${(pageSafe - 1) * CONFIG.pageSize + i + 1}. **${n.title}** — ${preview}`;
  });
  await message.reply(
    `**Notes (${entries.length}) — page ${pageSafe}/${totalPages}**\n${lines.join("\n")}` +
      (pageSafe < totalPages ? `\n\nNext: \`!note list ${pageSafe + 1}\`` : ""),
  );
}

async function showNote(message, args) {
  const title = args.join(" ").trim();
  if (!title) {
    await message.reply("Usage: `!note show <title>`");
    return;
  }
  const store = await readStore();
  const space = store[spaceKey(message.serverId)] || {};
  const note = space[normaliseTitle(title)];
  if (!note) {
    await message.reply(`No note titled **${title}**. Try \`!note search ${title}\`.`);
    return;
  }
  await message.reply(
    [
      `**${note.title}**`,
      `by ${note.author} · updated ${note.updatedAt}`,
      "",
      note.body,
    ].join("\n"),
  );
}

async function searchNotes(message, args) {
  const query = args.join(" ").trim().toLowerCase();
  if (!query) {
    await message.reply("Usage: `!note search <query>`");
    return;
  }
  const store = await readStore();
  const space = store[spaceKey(message.serverId)] || {};
  const hits = Object.values(space).filter(
    (n) => n.title.toLowerCase().includes(query) || n.body.toLowerCase().includes(query),
  );
  if (!hits.length) {
    await message.reply(`No notes matching **${query}**.`);
    return;
  }
  const lines = hits.map((n) => `• **${n.title}** — ${n.body.slice(0, 60)}${n.body.length > 60 ? "…" : ""}`);
  await message.reply(`**${hits.length} match(es) for "${query}"**\n${lines.join("\n")}`);
}

async function deleteNote(message, args) {
  const title = args.join(" ").trim();
  if (!title) {
    await message.reply("Usage: `!note delete <title>`");
    return;
  }
  const key = normaliseTitle(title);
  const removed = await mutateStore(async (store) => {
    const space = store[spaceKey(message.serverId)];
    if (!space || !space[key]) return false;
    delete space[key];
    return true;
  });
  await message.reply(removed ? `Deleted note **${title}**.` : `No note titled **${title}**.`);
}

async function exportNotes(message) {
  const store = await readStore();
  const space = store[spaceKey(message.serverId)] || {};
  const entries = Object.values(space);
  if (!entries.length) {
    await message.reply("No notes to export.");
    return;
  }
  const lines = entries.map((n) => `## ${n.title}\n${n.body}\n`);
  await message.reply(`**Export (${entries.length} notes)**\n\`\`\`\n${lines.join("\n")}\n\`\`\``);
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
    if (name !== "note") return; // this bot only handles !note

    log("info", `${message.author?.username || "someone"} ran !note ${args.join(" ")} in ${message.channelId}`);
    // Dispatch to the note command's own sub-router.
    const cmd = commands.get("note");
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
log("info", "Notes bot is running. Press Ctrl+C to stop.");
