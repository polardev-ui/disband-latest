import { createHash, randomBytes, randomUUID } from "node:crypto";
import { type Command, type Ctx, o, ok, fail, embed, info, pick, rand, fmt, nameOf, mention, str, clip, parseDuration, humanMinutes } from "../kit";

// --- Word lists ------------------------------------------------------------------

const EIGHT_BALL = [
  "It is certain.", "Without a doubt.", "Yes, definitely.", "You may rely on it.", "Most likely.", "Outlook good.",
  "Signs point to yes.", "Reply hazy, try again.", "Ask again later.", "Better not tell you now.", "Cannot predict now.",
  "Don't count on it.", "My reply is no.", "My sources say no.", "Outlook not so good.", "Very doubtful.",
];
const JOKES = [
  "Why don't skeletons fight each other? They don't have the guts.",
  "I told my computer I needed a break, and it said: no problem, I'll go to sleep.",
  "Why did the scarecrow win an award? He was outstanding in his field.",
  "What do you call a fake noodle? An impasta.",
  "Why can't a bicycle stand on its own? It's two tired.",
  "I would tell you a UDP joke, but you might not get it.",
  "Why did the developer go broke? Because he used up all his cache.",
  "What's a dog's favourite instrument? The trom-bone.",
  "Why do bees have sticky hair? Because they use honeycombs.",
  "I'm reading a book on anti-gravity. It's impossible to put down.",
];
const DAD_JOKES = [
  "I used to hate facial hair, but then it grew on me.",
  "I only know 25 letters of the alphabet. I don't know y.",
  "What do you call a factory that makes okay products? A satisfactory.",
  "Did you hear about the restaurant on the moon? Great food, no atmosphere.",
  "Why couldn't the leopard play hide and seek? He was always spotted.",
  "I'm afraid for the calendar. Its days are numbered.",
];
const FACTS = [
  "Octopuses have three hearts.", "Bananas are berries, but strawberries aren't.", "Honey never spoils.",
  "A group of flamingos is called a flamboyance.", "Wombat poo is cube-shaped.", "Sharks are older than trees.",
  "Dogs can smell your feelings (well, the chemicals behind them).", "A day on Venus is longer than its year.",
  "The Eiffel Tower grows about 15 cm in summer.", "Sea otters hold hands while they sleep.",
  "There are more possible chess games than atoms in the observable universe.", "Golden retrievers were first bred in Scotland.",
];
const QUOTES = [
  "“The best way out is always through.” — Robert Frost",
  "“Be yourself; everyone else is already taken.” — Oscar Wilde",
  "“It always seems impossible until it's done.” — Nelson Mandela",
  "“Simplicity is the ultimate sophistication.” — Leonardo da Vinci",
  "“Whether you think you can or you think you can't, you're right.” — Henry Ford",
  "“Act as if what you do makes a difference. It does.” — William James",
];
const COMPLIMENTS = [
  "has the best taste in music here.", "makes this space better just by being in it.", "is cooler than a polar bear's toenails.",
  "gives the best advice.", "has impeccable vibes.", "is a certified legend.", "lights up every channel they post in.",
];
const ROASTS = [
  "types with their elbows, I think.", "is the reason the instructions say 'do not eat'.",
  "has the energy of a phone on 1%.", "brings a spoon to a knife fight.", "thinks Wi-Fi stands for 'Wireless Fidelity' and won't stop telling people.",
];
const FORTUNES = [
  "A pleasant surprise is waiting for you.", "Your hard work is about to pay off.", "Now is a good time to try something new.",
  "Someone is thinking of you right now.", "Good news will come to you by message.", "Today, you'll find what you lost.",
];
const TRUTHS = [
  "What's the most embarrassing thing in your search history?", "Who here would you trust with a secret?",
  "What's a habit you're trying to break?", "What's the last lie you told?", "What's your guilty-pleasure song?",
];
const DARES = [
  "Change your status to something a friend picks for an hour.", "Send the third emoji in your recents with no context.",
  "Type your next message with your eyes closed.", "Talk only in questions for the next five minutes.", "Compliment the last person who messaged here.",
];
const WYR = [
  "be able to fly, or be invisible?", "always be 10 minutes late, or 20 minutes early?", "have no internet for a month, or no music?",
  "talk to animals, or speak every language?", "live in the past, or the future?", "fight one horse-sized duck, or 100 duck-sized horses?",
];
const NHIE = [
  "fallen asleep in a call.", "sent a message to the wrong chat.", "pretended to know a song I'd never heard.",
  "rage-quit a game.", "stayed up all night for no reason.", "laughed at a joke I didn't get.",
];
const RIDDLES = [
  ["What has keys but can't open locks?", "A piano."],
  ["What gets wetter the more it dries?", "A towel."],
  ["I speak without a mouth and hear without ears. What am I?", "An echo."],
  ["What can you catch but not throw?", "A cold."],
  ["What has a head and a tail but no body?", "A coin."],
] as const;
const TRIVIA = [
  ["What's the largest planet in our solar system?", "Jupiter"],
  ["How many continents are there?", "Seven"],
  ["What's the chemical symbol for gold?", "Au"],
  ["Which ocean is the largest?", "The Pacific"],
  ["What year did the first person walk on the Moon?", "1969"],
  ["How many legs does a spider have?", "Eight"],
] as const;
const TOPICS = [
  "What's a game you could play forever?", "What's the best thing you ate this week?", "If you could live anywhere, where?",
  "What's a skill you'd love to learn?", "What was your favourite show as a kid?", "What's the most useful app on your phone?",
];

// --- Social actions (hug, pat…) --------------------------------------------------------

const ACTIONS: [string, string, string][] = [
  ["hug", "🤗", "hugs"], ["pat", "🫳", "pats"], ["highfive", "🙌", "high-fives"], ["wave", "👋", "waves at"],
  ["poke", "👉", "pokes"], ["bonk", "🔨", "bonks"], ["boop", "👆", "boops"], ["cuddle", "🫂", "cuddles"],
  ["slap", "🖐️", "slaps"], ["tickle", "🤭", "tickles"], ["salute", "🫡", "salutes"], ["cheer", "📣", "cheers for"],
  ["feed", "🍪", "feeds a cookie to"], ["handshake", "🤝", "shakes hands with"], ["fistbump", "👊", "fist-bumps"],
];
const MOODS: [string, string, string][] = [
  ["dance", "💃", "is dancing"], ["cry", "😭", "is crying"], ["laugh", "😂", "is laughing"], ["clap", "👏", "is clapping"],
  ["shrug", "🤷", "shrugs"], ["sleep", "😴", "is sleeping"], ["think", "🤔", "is thinking"], ["facepalm", "🤦", "facepalms"],
];

const social: Command[] = [
  ...ACTIONS.map(([name, emoji, verb]): Command => ({
    name,
    category: "Social",
    description: `${emoji} ${verb.charAt(0).toUpperCase() + verb.slice(1)} someone`,
    options: [o.user("user", "Who")],
    run: async (ctx) => {
      const p = await ctx.member(ctx.opt.user);
      if (!p) return fail("I can't find that member here.");
      return embed({ description: `${emoji} **${nameOf(ctx.user)}** ${verb} **${p.id === ctx.user.id ? "themselves" : nameOf(p)}**!` });
    },
  })),
  ...MOODS.map(([name, emoji, verb]): Command => ({
    name,
    category: "Social",
    description: `${emoji} ${verb.charAt(0).toUpperCase() + verb.slice(1)}`,
    run: (ctx) => embed({ description: `${emoji} **${nameOf(ctx.user)}** ${verb}.` }),
  })),
];

// --- Text tools --------------------------------------------------------------------------

const MORSE: Record<string, string> = {
  a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.", g: "--.", h: "....", i: "..", j: ".---", k: "-.-", l: ".-..", m: "--",
  n: "-.", o: "---", p: ".--.", q: "--.-", r: ".-.", s: "...", t: "-", u: "..-", v: "...-", w: ".--", x: "-..-", y: "-.--", z: "--..",
  "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
};
const UNMORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
const LEET: Record<string, string> = { a: "4", e: "3", i: "1", o: "0", s: "5", t: "7", g: "9", b: "8" };
const FLIP = "abcdefghijklmnopqrstuvwxyz";
const FLIPPED = "ɐqɔpǝɟƃɥᴉɾʞlɯuodbɹsʇnʌʍxʎz";
const SMALL = "ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖqʳˢᵗᵘᵛʷˣʸᶻ";

function textCmd(name: string, description: string, fn: (s: string) => string, aliases?: string[]): Command {
  return {
    name,
    aliases,
    category: "Text",
    description,
    options: [o.str("text", "The text")],
    run: (ctx) => {
      const out = fn(str(ctx.opt.text)).slice(0, 1900);
      return out.trim() ? out : fail("That came out empty.");
    },
  };
}

const text: Command[] = [
  textCmd("reverse", "Write text backwards", (s) => [...s].reverse().join("")),
  textCmd("mock", "wRiTe LiKe ThIs", (s) => [...s].map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase())).join(""), ["spongebob"]),
  textCmd("clapify", "Put 👏 between 👏 words", (s) => s.split(/\s+/).join(" 👏 ")),
  textCmd("owo", "OwO-ify text", (s) => s.replace(/[rl]/g, "w").replace(/[RL]/g, "W").replace(/n([aeiou])/g, "ny$1") + " owo", ["uwu"]),
  textCmd("leet", "1337 5p34k", (s) => [...s.toLowerCase()].map((c) => LEET[c] ?? c).join("")),
  textCmd("upper", "UPPERCASE", (s) => s.toUpperCase()),
  textCmd("lower", "lowercase", (s) => s.toLowerCase()),
  textCmd("titlecase", "Title Case Text", (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())),
  textCmd("emojify", "Turn letters into 🇪🇲🇴🇯🇮", (s) => [...s.toLowerCase()].map((c) => (/[a-z]/.test(c) ? `:regional_indicator_${c}:` : c === " " ? "  " : c)).join(" ")),
  textCmd("flip", "ʇxǝʇ uʍop ǝpᴉsdn", (s) => [...s.toLowerCase()].reverse().map((c) => { const i = FLIP.indexOf(c); return i >= 0 ? FLIPPED[i] : c; }).join("")),
  textCmd("tiny", "ˢᵐᵃˡˡ ᵗᵉˣᵗ", (s) => [...s.toLowerCase()].map((c) => { const i = FLIP.indexOf(c); return i >= 0 ? SMALL[i] : c; }).join("")),
  textCmd("spoiler", "Hide each letter in a spoiler", (s) => [...s].map((c) => (c === " " ? " " : `||${c}||`)).join("")),
  textCmd("binary", "Text to binary", (s) => [...Buffer.from(s)].map((b) => b.toString(2).padStart(8, "0")).join(" ")),
  textCmd("unbinary", "Binary to text", (s) => Buffer.from((s.match(/[01]{8}/g) ?? []).map((b) => parseInt(b, 2))).toString("utf8")),
  textCmd("morse", "Text to Morse code", (s) => [...s.toLowerCase()].map((c) => (c === " " ? "/" : MORSE[c] ?? "")).filter(Boolean).join(" ")),
  textCmd("unmorse", "Morse code to text", (s) => s.split(" ").map((w) => (w === "/" ? " " : UNMORSE[w] ?? "")).join("")),
  textCmd("base64", "Encode as Base64", (s) => Buffer.from(s).toString("base64"), ["b64"]),
  textCmd("unbase64", "Decode Base64", (s) => Buffer.from(s, "base64").toString("utf8")),
  textCmd("hex", "Text to hex", (s) => Buffer.from(s).toString("hex")),
  textCmd("sha256", "SHA-256 hash of text", (s) => "`" + createHash("sha256").update(s).digest("hex") + "`", ["hash"]),
  textCmd("md5", "MD5 hash of text", (s) => "`" + createHash("md5").update(s).digest("hex") + "`"),
  textCmd("rot13", "ROT13 a message", (s) => s.replace(/[a-z]/gi, (c) => { const base = c <= "Z" ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base); })),
  textCmd("shuffle", "Shuffle the words", (s) => s.split(/\s+/).sort(() => Math.random() - 0.5).join(" ")),
  textCmd("vaporwave", "ａｅｓｔｈｅｔｉｃ", (s) => [...s].map((c) => (c === " " ? "　" : c.charCodeAt(0) >= 33 && c.charCodeAt(0) <= 126 ? String.fromCharCode(c.charCodeAt(0) + 0xfee0) : c)).join(""), ["aesthetic"]),
  {
    name: "count",
    aliases: ["wordcount", "chars"],
    category: "Text",
    description: "Count characters and words",
    options: [o.str("text", "The text")],
    run: (ctx) => {
      const s = str(ctx.opt.text);
      return info("Count", `**${fmt([...s].length)}** characters · **${fmt(s.trim() ? s.trim().split(/\s+/).length : 0)}** words`);
    },
  },
  {
    name: "palindrome",
    category: "Text",
    description: "Is it the same backwards?",
    options: [o.str("text", "The text")],
    run: (ctx) => {
      const clean = str(ctx.opt.text).toLowerCase().replace(/[^a-z0-9]/g, "");
      const yes = clean.length > 0 && clean === [...clean].reverse().join("");
      return embed({ description: yes ? "✅ Yes, that's a palindrome." : "❌ Not a palindrome." });
    },
  },
];

// --- Maths ---------------------------------------------------------------------------------

/** A small, safe calculator: + - * / % ^, brackets, and a few functions. */
function calculate(expr: string): number {
  const tokens = expr.toLowerCase().replace(/\s+/g, "").replace(/×/g, "*").replace(/÷/g, "/").match(/\d*\.?\d+(e[+-]?\d+)?|pi|e|sqrt|sin|cos|tan|log|ln|abs|round|floor|ceil|[+\-*/%^()]/g);
  if (!tokens || tokens.join("") !== expr.toLowerCase().replace(/\s+/g, "").replace(/×/g, "*").replace(/÷/g, "/")) throw new Error("bad");
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  const FN: Record<string, (x: number) => number> = { sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, log: Math.log10, ln: Math.log, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil };
  const atom = (): number => {
    const t = next();
    if (t === "(") { const v = expr0(); if (next() !== ")") throw new Error("bad"); return v; }
    if (t === "-") return -atom();
    if (t === "+") return atom();
    if (t === "pi") return Math.PI;
    if (t === "e") return Math.E;
    if (t && FN[t]) { if (next() !== "(") throw new Error("bad"); const v = expr0(); if (next() !== ")") throw new Error("bad"); return FN[t](v); }
    const n = Number(t);
    if (!Number.isFinite(n)) throw new Error("bad");
    return n;
  };
  const power = (): number => { const b = atom(); if (peek() === "^") { next(); return Math.pow(b, power()); } return b; };
  const term = (): number => {
    let v = power();
    while (peek() === "*" || peek() === "/" || peek() === "%") { const op = next(); const r = power(); v = op === "*" ? v * r : op === "/" ? v / r : v % r; }
    return v;
  };
  const expr0 = (): number => {
    let v = term();
    while (peek() === "+" || peek() === "-") { const op = next(); const r = term(); v = op === "+" ? v + r : v - r; }
    return v;
  };
  const v = expr0();
  if (i !== tokens.length || !Number.isFinite(v)) throw new Error("bad");
  return v;
}

const UNITS: Record<string, [string, number]> = {
  mm: ["length", 0.001], cm: ["length", 0.01], m: ["length", 1], km: ["length", 1000], in: ["length", 0.0254], ft: ["length", 0.3048], yd: ["length", 0.9144], mi: ["length", 1609.344],
  g: ["mass", 0.001], kg: ["mass", 1], lb: ["mass", 0.45359237], oz: ["mass", 0.0283495], st: ["mass", 6.35029],
  ml: ["volume", 0.001], l: ["volume", 1], gal: ["volume", 3.78541], pt: ["volume", 0.568261],
  s: ["time", 1], min: ["time", 60], h: ["time", 3600], day: ["time", 86400], week: ["time", 604800],
};

const maths: Command[] = [
  {
    name: "calc",
    aliases: ["math", "calculate"],
    category: "Utility",
    slash: true,
    description: "Work something out: 2^8, sqrt(81), (4+5)*3…",
    options: [o.str("expression", "What to work out")],
    run: (ctx) => {
      try {
        const v = calculate(str(ctx.opt.expression));
        return info("🧮 Calculator", `\`${clip(str(ctx.opt.expression), 200)}\` = **${Number(v.toPrecision(12)).toLocaleString("en-GB", { maximumFractionDigits: 10 })}**`);
      } catch {
        return fail("I couldn't work that out. Use numbers, + - * / % ^, brackets, and sqrt/sin/cos/tan/log/ln/abs/round.");
      }
    },
  },
  {
    name: "convert",
    aliases: ["unit"],
    category: "Utility",
    slash: true,
    description: "Convert units: 5 km mi, 100 f c, 2 lb kg",
    options: [o.num("value", "The number"), o.str("from", "From unit (km, lb, c, f…)"), o.str("to", "To unit")],
    run: (ctx) => {
      const v = Number(ctx.opt.value);
      const from = str(ctx.opt.from).toLowerCase();
      const to = str(ctx.opt.to).toLowerCase();
      const temps: Record<string, (x: number) => number> = { c: (x) => x, f: (x) => (x - 32) * (5 / 9), k: (x) => x - 273.15 };
      const fromC: Record<string, (x: number) => number> = { c: (x) => x, f: (x) => x * (9 / 5) + 32, k: (x) => x + 273.15 };
      let out: number | null = null;
      if (temps[from] && fromC[to]) out = fromC[to](temps[from](v));
      else if (UNITS[from] && UNITS[to] && UNITS[from][0] === UNITS[to][0]) out = (v * UNITS[from][1]) / UNITS[to][1];
      if (out === null || !Number.isFinite(v)) return fail(`I can convert ${Object.keys(UNITS).join(", ")}, and temperatures c, f, k (same kind only).`);
      return info("📏 Convert", `**${fmt(v)} ${from}** = **${Number(out.toPrecision(8)).toLocaleString("en-GB", { maximumFractionDigits: 6 })} ${to}**`);
    },
  },
  {
    name: "percent",
    category: "Utility",
    description: "What percent one number is of another",
    options: [o.num("part", "The part"), o.num("whole", "The whole")],
    run: (ctx) => {
      const whole = Number(ctx.opt.whole);
      if (!whole) return fail("The whole can't be zero.");
      return info("Percent", `${fmt(Number(ctx.opt.part))} is **${((Number(ctx.opt.part) / whole) * 100).toFixed(2)}%** of ${fmt(whole)}.`);
    },
  },
  {
    name: "random",
    aliases: ["rng", "number"],
    category: "Utility",
    slash: true,
    description: "A random number between two numbers",
    options: [o.int("min", "Lowest", false), o.int("max", "Highest", false)],
    run: (ctx) => {
      const a = ctx.opt.min === undefined ? 1 : Number(ctx.opt.min);
      const b = ctx.opt.max === undefined ? 100 : Number(ctx.opt.max);
      return embed({ description: `🎲 **${fmt(rand(Math.min(a, b), Math.max(a, b)))}** (between ${fmt(Math.min(a, b))} and ${fmt(Math.max(a, b))})` });
    },
  },
  {
    name: "password",
    aliases: ["genpass"],
    category: "Utility",
    description: "Make a strong random password",
    options: [o.int("length", "How long (8–64)", false)],
    run: (ctx) => {
      const n = Math.min(64, Math.max(8, Number(ctx.opt.length) || 20));
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*-_=+";
      const pw = [...randomBytes(n)].map((b) => chars[b % chars.length]).join("");
      return info("🔐 Password", `||\`${pw}\`||\nOnly you should use this. Don't reuse it anywhere.`);
    },
  },
  { name: "uuid", category: "Utility", description: "A fresh random UUID", run: () => `\`${randomUUID()}\`` },
  {
    name: "timestamp",
    aliases: ["unix", "epoch"],
    category: "Utility",
    description: "The current Unix time",
    run: () => info("⏱️ Unix time", `\`${Math.floor(Date.now() / 1000)}\` seconds · \`${Date.now()}\` ms`),
  },
  {
    name: "time",
    aliases: ["clock", "tz"],
    category: "Utility",
    slash: true,
    description: "The time in a time zone (e.g. Europe/London)",
    options: [o.str("zone", "Time zone, like America/New_York", false)],
    run: (ctx) => {
      const zone = str(ctx.opt.zone) || "UTC";
      try {
        const now = new Date().toLocaleString("en-GB", { timeZone: zone, dateStyle: "full", timeStyle: "short" });
        return info(`🕒 ${zone}`, now);
      } catch {
        return fail("I don't know that time zone. Try something like `Europe/London` or `Asia/Tokyo`.");
      }
    },
  },
  {
    name: "countdown",
    aliases: ["daysuntil"],
    category: "Utility",
    description: "Days until a date (YYYY-MM-DD)",
    options: [o.str("date", "The date, YYYY-MM-DD")],
    run: (ctx) => {
      const t = Date.parse(str(ctx.opt.date));
      if (!Number.isFinite(t)) return fail("Use a date like 2026-12-25.");
      const days = Math.ceil((t - Date.now()) / 86400_000);
      return info("📆 Countdown", days >= 0 ? `**${fmt(days)}** day${days === 1 ? "" : "s"} to go.` : `That was **${fmt(-days)}** days ago.`);
    },
  },
  {
    name: "age",
    category: "Utility",
    description: "How old someone born on a date is",
    options: [o.str("birthday", "YYYY-MM-DD")],
    run: (ctx) => {
      const b = new Date(str(ctx.opt.birthday));
      if (!Number.isFinite(b.getTime())) return fail("Use a date like 2001-04-17.");
      const n = new Date();
      let age = n.getFullYear() - b.getFullYear();
      if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) age -= 1;
      return info("🎂 Age", `**${age}** years old.`);
    },
  },
  {
    name: "color",
    aliases: ["colour", "hex2rgb"],
    category: "Utility",
    description: "About a hex colour",
    options: [o.str("hex", "Like #4641d9")],
    run: (ctx) => {
      const h = str(ctx.opt.hex).replace("#", "").trim();
      if (!/^[0-9a-f]{6}$/i.test(h)) return fail("Give a 6-digit hex colour, like `#4641d9`.");
      const n = parseInt(h, 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      return embed({ title: `#${h.toUpperCase()}`, color: n, fields: [{ name: "RGB", value: `${r}, ${g}, ${b}`, inline: true }, { name: "Decimal", value: String(n), inline: true }] });
    },
  },
  {
    name: "bmi",
    category: "Utility",
    description: "Body mass index from height (cm) and weight (kg)",
    options: [o.num("height", "Height in cm"), o.num("weight", "Weight in kg")],
    run: (ctx) => {
      const h = Number(ctx.opt.height) / 100;
      const w = Number(ctx.opt.weight);
      if (!h || !w) return fail("Give height in cm and weight in kg.");
      const v = w / (h * h);
      return info("BMI", `**${v.toFixed(1)}** · ${v < 18.5 ? "underweight" : v < 25 ? "healthy" : v < 30 ? "overweight" : "obese"} (a rough guide only)`);
    },
  },
];

// --- Fun --------------------------------------------------------------------------------------

function listCmd(name: string, emoji: string, description: string, list: readonly string[], aliases?: string[], slash?: boolean): Command {
  return { name, aliases, slash, category: "Fun", description, run: () => embed({ description: `${emoji} ${pick(list)}` }) };
}

const fun: Command[] = [
  {
    name: "8ball",
    aliases: ["eightball", "ask"],
    category: "Fun",
    slash: true,
    description: "Ask the magic 8-ball",
    options: [o.str("question", "Your question")],
    run: (ctx) => embed({ title: "🎱 Magic 8-ball", fields: [{ name: "You asked", value: clip(str(ctx.opt.question), 500) }, { name: "It says", value: pick(EIGHT_BALL) }] }),
  },
  { name: "coinflip", aliases: ["flip-coin", "cf"], category: "Fun", slash: true, description: "Heads or tails", run: () => embed({ description: `🪙 **${Math.random() < 0.5 ? "Heads" : "Tails"}!**` }) },
  {
    name: "roll",
    aliases: ["dice", "d"],
    category: "Fun",
    slash: true,
    description: "Roll dice, like 2d6 or d20",
    options: [o.str("dice", "Like 2d6 (default 1d6)", false)],
    run: (ctx) => {
      const m = (str(ctx.opt.dice) || "1d6").toLowerCase().match(/^(\d*)d(\d+)([+-]\d+)?$/);
      if (!m) return fail("Use dice like `d20`, `2d6` or `3d8+2`.");
      const n = Math.min(50, Math.max(1, parseInt(m[1] || "1", 10)));
      const sides = Math.min(1000, Math.max(2, parseInt(m[2], 10)));
      const mod = m[3] ? parseInt(m[3], 10) : 0;
      const rolls = Array.from({ length: n }, () => rand(1, sides));
      const total = rolls.reduce((a, b) => a + b, 0) + mod;
      return embed({ description: `🎲 ${n}d${sides}${mod ? (mod > 0 ? `+${mod}` : mod) : ""}: [${rolls.join(", ")}] → **${total}**` });
    },
  },
  {
    name: "choose",
    aliases: ["pick", "decide"],
    category: "Fun",
    slash: true,
    description: "Pick one of your options (separate with |)",
    options: [o.str("options", "Like pizza | tacos | sushi")],
    run: (ctx) => {
      const opts = str(ctx.opt.options).split(/\||,| or /i).map((s) => s.trim()).filter(Boolean);
      if (opts.length < 2) return fail("Give at least two options, separated with `|`.");
      return embed({ description: `🤔 I choose **${clip(pick(opts), 200)}**.` });
    },
  },
  {
    name: "rps",
    aliases: ["rockpaperscissors"],
    category: "Fun",
    slash: true,
    description: "Rock, paper, scissors against Bruce",
    options: [o.str("move", "rock, paper or scissors", true, ["rock", "paper", "scissors"])],
    run: (ctx) => {
      const me = str(ctx.opt.move).toLowerCase();
      if (!["rock", "paper", "scissors"].includes(me)) return fail("Pick rock, paper or scissors.");
      const bot = pick(["rock", "paper", "scissors"]);
      const icon: Record<string, string> = { rock: "🪨", paper: "📄", scissors: "✂️" };
      const win = (me === "rock" && bot === "scissors") || (me === "paper" && bot === "rock") || (me === "scissors" && bot === "paper");
      return embed({ description: `${icon[me]} vs ${icon[bot]}\n${me === bot ? "It's a draw!" : win ? "You win! 🎉" : "I win! 🐶"}` });
    },
  },
  listCmd("joke", "😂", "A random joke", JOKES, undefined, true),
  listCmd("dadjoke", "👨", "A dad joke", DAD_JOKES),
  listCmd("fact", "🧠", "A random fact", FACTS, ["funfact"], true),
  listCmd("quote", "💬", "An inspiring quote", QUOTES, ["inspire"]),
  listCmd("fortune", "🥠", "Open a fortune cookie", FORTUNES, ["cookie"]),
  listCmd("truth", "😳", "A truth question", TRUTHS),
  listCmd("dare", "😈", "A dare", DARES),
  listCmd("topic", "💡", "A conversation starter", TOPICS, ["icebreaker"], true),
  { name: "wyr", aliases: ["wouldyourather"], category: "Fun", slash: true, description: "Would you rather…", run: () => embed({ description: `🤷 Would you rather ${pick(WYR)}` }) },
  { name: "nhie", aliases: ["neverhaveiever"], category: "Fun", description: "Never have I ever…", run: () => embed({ description: `🙊 Never have I ever ${pick(NHIE)}` }) },
  {
    name: "riddle",
    category: "Fun",
    description: "A riddle (answer hidden)",
    run: () => { const [q, a] = pick(RIDDLES); return embed({ title: "🧩 Riddle", description: `${q}\n\nAnswer: ||${a}||` }); },
  },
  {
    name: "trivia",
    aliases: ["quiz"],
    category: "Fun",
    slash: true,
    description: "A trivia question (answer hidden)",
    run: () => { const [q, a] = pick(TRIVIA); return embed({ title: "❓ Trivia", description: `${q}\n\nAnswer: ||${a}||` }); },
  },
  {
    name: "compliment",
    aliases: ["praise"],
    category: "Fun",
    description: "Say something nice about someone",
    options: [o.user("user", "Who (you, if empty)", false)],
    run: async (ctx) => {
      const p = ctx.opt.user ? await ctx.member(ctx.opt.user) : ctx.user;
      return embed({ description: `💖 **${nameOf(p)}** ${pick(COMPLIMENTS)}` });
    },
  },
  {
    name: "roast",
    category: "Fun",
    description: "A gentle roast",
    options: [o.user("user", "Who (you, if empty)", false)],
    run: async (ctx) => {
      const p = ctx.opt.user ? await ctx.member(ctx.opt.user) : ctx.user;
      return embed({ description: `🔥 **${nameOf(p)}** ${pick(ROASTS)}` });
    },
  },
  {
    name: "ship",
    aliases: ["love", "match"],
    category: "Fun",
    slash: true,
    description: "How well two people match",
    options: [o.user("first", "First person"), o.user("second", "Second person (you, if empty)", false)],
    run: async (ctx) => {
      const a = await ctx.member(ctx.opt.first);
      const b = ctx.opt.second ? await ctx.member(ctx.opt.second) : ctx.user;
      if (!a || !b) return fail("I can't find one of them here.");
      const score = parseInt(createHash("md5").update([a.id, b.id].sort().join(":")).digest("hex").slice(0, 4), 16) % 101;
      const name = (nameOf(a).slice(0, Math.ceil(nameOf(a).length / 2)) + nameOf(b).slice(Math.floor(nameOf(b).length / 2))).trim();
      return embed({ title: `💘 ${name}`, description: `**${nameOf(a)}** + **${nameOf(b)}** = **${score}%**\n${"❤️".repeat(Math.round(score / 20)) || "💔"}`, color: 0xff5c8a });
    },
  },
  {
    name: "rate",
    category: "Fun",
    description: "Bruce rates anything out of 10",
    options: [o.str("thing", "What to rate")],
    run: (ctx) => {
      const s = parseInt(createHash("md5").update(str(ctx.opt.thing).toLowerCase()).digest("hex").slice(0, 2), 16) % 11;
      return embed({ description: `⭐ I give **${clip(str(ctx.opt.thing), 100)}** a **${s}/10**.` });
    },
  },
  {
    name: "howcool",
    aliases: ["coolrate"],
    category: "Fun",
    description: "How cool someone is",
    options: [o.user("user", "Who (you, if empty)", false)],
    run: async (ctx) => {
      const p = ctx.opt.user ? await ctx.member(ctx.opt.user) : ctx.user;
      return embed({ description: `😎 **${nameOf(p)}** is **${rand(0, 100)}%** cool.` });
    },
  },
  {
    name: "fetch",
    aliases: ["ball"],
    category: "Fun",
    description: "Throw Bruce a ball",
    run: () => embed({ description: pick(["🐶🎾 Bruce sprints off… and brings it right back! Good boy.", "🐶 Bruce chases it… and lies down in the sun instead.", "🐶🎾 Bruce caught it mid-air! Show-off."]) }),
  },
  { name: "treat", aliases: ["goodboy"], category: "Fun", description: "Give Bruce a treat", run: () => embed({ description: pick(["🦴 *happy tail wags*", "🐶 Bruce sits nicely and takes it gently. Good boy!", "🍖 Bruce does a little spin of joy."]) }) },
  { name: "bark", aliases: ["woof"], category: "Fun", description: "Woof!", run: () => pick(["Woof! 🐶", "Bark bark! 🐕", "Awoo! 🐺", "*wags tail* Woof."]) },
  {
    name: "say",
    aliases: ["echo"],
    category: "Fun",
    perm: "manage_messages",
    description: "Make Bruce say something",
    options: [o.str("text", "What to say")],
    run: (ctx) => clip(str(ctx.opt.text).replace(/@(everyone|here)/gi, "@​$1"), 1900),
  },
  {
    name: "embed",
    category: "Utility",
    perm: "manage_messages",
    description: "Post an embed: title | description",
    options: [o.str("content", "Title | description")],
    run: (ctx) => {
      const [title, ...rest] = str(ctx.opt.content).split("|");
      return embed({ title: clip(title.trim(), 250), description: clip(rest.join("|").trim(), 3900) || undefined });
    },
  },
  {
    name: "poll",
    aliases: ["vote"],
    category: "Utility",
    slash: true,
    description: "Start a quick poll: question | option | option",
    options: [o.str("poll", "Question | option 1 | option 2 …")],
    run: (ctx) => {
      const parts = str(ctx.opt.poll).split("|").map((s) => s.trim()).filter(Boolean);
      if (parts.length < 3) return fail("Use `question | option 1 | option 2`, up to 10 options.");
      const nums = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
      return embed({ title: `📊 ${clip(parts[0], 240)}`, description: parts.slice(1, 11).map((p, i) => `${nums[i]} ${clip(p, 200)}`).join("\n"), footer: { text: `Poll by ${nameOf(ctx.user)} · react to vote` } });
    },
  },
  {
    name: "announce",
    category: "Utility",
    perm: "manage_server",
    description: "Post an announcement in a channel",
    options: [o.channel("channel", "Which channel"), o.str("message", "What to announce")],
    run: async (ctx) => {
      const ref = str(ctx.opt.channel);
      let q = ctx.service.from("channels").select("id, name").eq("server_id", ctx.serverId);
      q = /^[0-9a-f-]{36}$/i.test(ref) ? q.eq("id", ref) : q.ilike("name", ref);
      const { data } = await q.limit(1).maybeSingle();
      if (!data) return fail("I can't find that channel.");
      await ctx.send((data as { id: string }).id, embed({ title: "📢 Announcement", description: clip(str(ctx.opt.message), 3900), footer: { text: `From ${nameOf(ctx.user)}` } }));
      return ok(`Posted in **#${(data as { name: string }).name}**.`);
    },
  },
  {
    name: "remind",
    aliases: ["remindme", "reminder"],
    category: "Utility",
    slash: true,
    description: "Remind you here after a while (10m, 2h, 1d)",
    options: [o.str("in", "When, like 30m or 2h"), o.str("what", "What to remind you about")],
    run: async (ctx) => {
      const minutes = parseDuration(ctx.opt.in);
      if (!minutes || minutes > 60 * 24 * 60) return fail("Give a time up to 60 days, like `30m`, `2h` or `3d`.");
      const { count } = await ctx.service.from("bruce_reminders").select("*", { count: "exact", head: true }).eq("user_id", ctx.user.id).eq("done", false);
      if ((count ?? 0) >= 25) return fail("You have 25 reminders waiting already.");
      await ctx.service.from("bruce_reminders").insert({
        server_id: ctx.serverId, channel_id: ctx.channelId, user_id: ctx.user.id,
        content: clip(str(ctx.opt.what), 500), due_at: new Date(Date.now() + minutes * 60_000).toISOString(),
      });
      return ok(`I'll remind you in ${humanMinutes(minutes)}.`);
    },
  },
  {
    name: "reminders",
    category: "Utility",
    slash: true,
    description: "Your waiting reminders",
    run: async (ctx) => {
      const { data } = await ctx.service.from("bruce_reminders").select("content, due_at").eq("user_id", ctx.user.id).eq("server_id", ctx.serverId).eq("done", false).order("due_at").limit(15);
      const list = (data ?? []) as { content: string; due_at: string }[];
      if (!list.length) return ok("You have no reminders waiting here.");
      return embed({ title: "⏰ Your reminders", description: list.map((r) => `• ${clip(r.content, 100)}, in ${humanMinutes(Math.max(1, Math.round((Date.parse(r.due_at) - Date.now()) / 60000)))}`).join("\n") });
    },
  },
];

// --- Tags (saved replies) ---------------------------------------------------------------------------

async function tagRow(ctx: Ctx, name: string) {
  const { data } = await ctx.service.from("bruce_tags").select("*").eq("server_id", ctx.serverId).eq("name", name.toLowerCase()).maybeSingle();
  return data as { name: string; content: string; author_id: string | null; uses: number; created_at: string } | null;
}

const tags: Command[] = [
  {
    name: "tag",
    aliases: ["t"],
    category: "Tags",
    slash: true,
    description: "Post a saved tag",
    options: [o.str("name", "The tag's name")],
    run: async (ctx) => {
      const t = await tagRow(ctx, str(ctx.opt.name));
      if (!t) return fail("No tag with that name. See `tags`.");
      await ctx.service.from("bruce_tags").update({ uses: t.uses + 1 }).eq("server_id", ctx.serverId).eq("name", t.name);
      return t.content;
    },
  },
  {
    name: "tag-create",
    aliases: ["tagadd", "addtag"],
    category: "Tags",
    slash: true,
    perm: "manage_messages",
    description: "Save a tag anyone can post",
    options: [o.str("name", "Short name (a-z, 0-9, - _)"), o.str("content", "What it says")],
    run: async (ctx) => {
      const name = str(ctx.opt.name).toLowerCase();
      if (!/^[a-z0-9_-]{1,32}$/.test(name)) return fail("Names are 1–32 characters: a-z, 0-9, - and _.");
      const { count } = await ctx.service.from("bruce_tags").select("*", { count: "exact", head: true }).eq("server_id", ctx.serverId);
      if ((count ?? 0) >= 200) return fail("This space has 200 tags already.");
      const { error } = await ctx.service.from("bruce_tags").upsert({ server_id: ctx.serverId, name, content: clip(str(ctx.opt.content), 2000), author_id: ctx.user.id }, { onConflict: "server_id,name" });
      return error ? fail(error.message) : ok(`Saved tag **${name}**. Post it with \`${ctx.guild.prefix}tag ${name}\`.`);
    },
  },
  {
    name: "tag-delete",
    aliases: ["tagdel", "deltag"],
    category: "Tags",
    slash: true,
    perm: "manage_messages",
    description: "Delete a tag",
    options: [o.str("name", "The tag's name")],
    run: async (ctx) => {
      const t = await tagRow(ctx, str(ctx.opt.name));
      if (!t) return fail("No tag with that name.");
      await ctx.service.from("bruce_tags").delete().eq("server_id", ctx.serverId).eq("name", t.name);
      return ok(`Deleted tag **${t.name}**.`);
    },
  },
  {
    name: "tags",
    aliases: ["taglist"],
    category: "Tags",
    slash: true,
    description: "Every tag in this space",
    run: async (ctx) => {
      const { data } = await ctx.service.from("bruce_tags").select("name").eq("server_id", ctx.serverId).order("name").limit(200);
      const names = ((data ?? []) as { name: string }[]).map((t) => `\`${t.name}\``);
      return names.length ? embed({ title: `🏷️ Tags (${names.length})`, description: names.join(", ").slice(0, 3900) }) : ok("No tags yet. Make one with `tag-create`.");
    },
  },
  {
    name: "tag-info",
    category: "Tags",
    description: "Who made a tag and how often it's used",
    options: [o.str("name", "The tag's name")],
    run: async (ctx) => {
      const t = await tagRow(ctx, str(ctx.opt.name));
      if (!t) return fail("No tag with that name.");
      const author = t.author_id ? await ctx.member(t.author_id) : null;
      return embed({ title: `🏷️ ${t.name}`, fields: [{ name: "Made by", value: mention(author), inline: true }, { name: "Used", value: `${fmt(t.uses)} times`, inline: true }] });
    },
  },
];

export const funCommands: Command[] = [...fun, ...maths, ...text, ...social, ...tags];
