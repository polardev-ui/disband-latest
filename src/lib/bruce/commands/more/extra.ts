/**
 * The last pack: more text checks, maths, conversions, random picks,
 * holiday countdowns and name generators.
 */
import type { Command, Ctx } from "../../kit";
import { embed, fail, fmt, o, pick, rand, str } from "../../kit";

const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
const nums = (ctx: Ctx) => str(ctx.opt.numbers).split(/[\s,;]+/).map(Number).filter((n) => Number.isFinite(n));
const show = (n: number) => (Number.isFinite(n) ? fmt(Number(n.toFixed(4))) : "∞");

function textInfo(name: string, description: string, f: (s: string) => string): Command {
  return {
    name, category: "Text", description, options: [o.str("text", "The text")],
    run: (ctx) => {
      const s = str(ctx.opt.text);
      return s.trim() ? embed({ description: `🔤 ${f(s)}` }) : fail("Give me some text after the command.");
    },
  };
}

function textMap(name: string, description: string, f: (s: string) => string): Command {
  return {
    name, category: "Text", description, options: [o.str("text", "The text")],
    run: (ctx) => {
      const s = str(ctx.opt.text).slice(0, 1800);
      return s.trim() ? f(s) : fail("Give me some text after the command.");
    },
  };
}

/** Letters through an enclosed Unicode alphabet (A–Z only). */
const enclosed = (start: number, lowerToo = true) => (s: string) =>
  [...(lowerToo ? s.toUpperCase() : s)].map((c) => (c >= "A" && c <= "Z" ? String.fromCodePoint(start + c.charCodeAt(0) - 65) : c)).join("");

const syllables = (w: string) => {
  const x = w.toLowerCase().replace(/[^a-z]/g, "");
  if (x.length <= 3) return x ? 1 : 0;
  return Math.max(1, (x.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g) ?? []).length);
};

const textCommands: Command[] = [
  textInfo("wordfreq", "The most used words", (s) => {
    const c = new Map<string, number>();
    words(s).forEach((w) => c.set(w, (c.get(w) ?? 0) + 1));
    return [...c].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w, n]) => `**${w}** ×${n}`).join(", ") || "no words";
  }),
  textInfo("readtime", "How long it takes to read", (s) => { const n = words(s).length; const sec = Math.ceil((n / 238) * 60); return `${fmt(n)} words: about **${sec < 60 ? `${sec} seconds` : `${Math.ceil(sec / 60)} min`}** to read.`; }),
  textInfo("syllables", "Count syllables (roughly)", (s) => `about **${words(s).reduce((t, w) => t + syllables(w), 0)}** syllables`),
  textInfo("countchar", "How often a letter appears: letter, then text", (s) => { const [ch, ...rest] = s.trim().split(/\s+/); const text = rest.join(" "); if (!ch || !text) return "use it like `countchar e hello there`"; return `**${ch[0]}** appears **${[...text.toLowerCase()].filter((c) => c === ch[0]!.toLowerCase()).length}** times`; }),
  textInfo("linecount", "Count lines", (s) => `**${s.split(/\r?\n/).length}** lines`),
  textInfo("uniqueletters", "Which letters are used", (s) => { const set = [...new Set([...s.toLowerCase()].filter((c) => /\p{L}/u.test(c)))].sort(); return `${set.length} different letters: ${set.join(" ")}`; }),
  textInfo("isogram", "Does any letter repeat?", (s) => { const l = [...s.toLowerCase()].filter((c) => /\p{L}/u.test(c)); return new Set(l).size === l.length ? "yes, it's an isogram: no letter repeats" : "no, some letters repeat"; }),
  textInfo("pangram", "Does it use every letter A–Z?", (s) => { const missing = [..."abcdefghijklmnopqrstuvwxyz"].filter((c) => !s.toLowerCase().includes(c)); return missing.length ? `not a pangram: missing **${missing.join(" ")}**` : "yes, it's a pangram"; }),
  textMap("randomcase", "rAnDOm CaPS", (s) => [...s].map((c) => (Math.random() < 0.5 ? c.toLowerCase() : c.toUpperCase())).join("")),
  textMap("squared", "🄰🄱🄲 squared letters", enclosed(0x1f130)),
  textMap("negsquared", "🅰🅱🅲 filled squared letters", enclosed(0x1f170)),
  textMap("parenthesized", "⒜⒝⒞ letters in brackets", (s) => [...s.toLowerCase()].map((c) => (c >= "a" && c <= "z" ? String.fromCodePoint(0x249c + c.charCodeAt(0) - 97) : c)).join("")),
  textMap("mirrorwords", "Each word backwards, same order", (s) => s.split(/(\s+)/).map((w) => (w.trim() ? [...w].reverse().join("") : w)).join("")),
  textMap("nospace", "Remove all spaces", (s) => s.replace(/\s+/g, "")),
];

// --- Maths ------------------------------------------------------------------------------

function listMath(name: string, description: string, f: (xs: number[]) => string | number, min = 1): Command {
  return {
    name, category: "Maths", description, options: [o.str("numbers", "Numbers, separated by spaces")],
    run: (ctx) => {
      const xs = nums(ctx);
      if (xs.length < min) return fail(`Give me at least ${min} number${min === 1 ? "" : "s"}.`);
      const r = f(xs);
      return embed({ description: `🧮 **${typeof r === "number" ? show(r) : r}**` });
    },
  };
}

const isFib = (n: number) => { const sq = (x: number) => Number.isInteger(Math.sqrt(x)); return n >= 0 && (sq(5 * n * n + 4) || sq(5 * n * n - 4)); };

const mathCommands: Command[] = [
  listMath("variance", "Variance of some numbers", (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length; }, 2),
  listMath("geomean", "Geometric mean", (xs) => (xs.some((x) => x <= 0) ? "needs numbers above 0" : Math.exp(xs.reduce((s, x) => s + Math.log(x), 0) / xs.length))),
  listMath("harmmean", "Harmonic mean", (xs) => (xs.some((x) => x === 0) ? "can't include zero" : xs.length / xs.reduce((s, x) => s + 1 / x, 0))),
  listMath("isfib", "Is it a Fibonacci number?", ([n]) => (Number.isInteger(n) && isFib(n!) ? "yes, it's a Fibonacci number" : "no")),
  listMath("iseven", "Even or odd?", ([n]) => (!Number.isInteger(n) ? "not a whole number" : n! % 2 === 0 ? "even" : "odd")),
  listMath("factors", "Every whole number that divides it", ([n]) => { if (!Number.isInteger(n) || n! < 1 || n! > 1e9) return "pick a whole number from 1 to a billion"; const out: number[] = []; for (let i = 1; i * i <= n!; i++) if (n! % i === 0) { out.push(i); if (i * i !== n!) out.push(n! / i); } return out.sort((a, b) => a - b).slice(0, 120).join(", "); }),
  listMath("primefactors", "Break a number into primes", ([n]) => { if (!Number.isInteger(n) || n! < 2 || n! > 1e12) return "pick a whole number from 2 to a trillion"; let x = n!; const out: number[] = []; for (let p = 2; p * p <= x; p++) while (x % p === 0) { out.push(p); x /= p; } if (x > 1) out.push(x); return out.join(" × "); }),
  listMath("quadratic", "Solve ax² + bx + c = 0 (a b c)", ([a, b, c]) => {
    if (a === undefined || b === undefined || c === undefined || a === 0) return "give me a, b and c (a can't be 0)";
    const d = b * b - 4 * a * c;
    if (d < 0) return `no real roots (complex: ${show(-b / (2 * a))} ± ${show(Math.sqrt(-d) / (2 * a))}i)`;
    const r1 = (-b + Math.sqrt(d)) / (2 * a), r2 = (-b - Math.sqrt(d)) / (2 * a);
    return d === 0 ? `x = ${show(r1)}` : `x = ${show(r1)} or x = ${show(r2)}`;
  }, 3),
  listMath("circle", "Area and circumference from a radius", ([r]) => (r! < 0 ? "a radius can't be negative" : `area ${show(Math.PI * r! * r!)}, circumference ${show(2 * Math.PI * r!)}`)),
];

// --- Conversions --------------------------------------------------------------------------

const CONV: [string, string, string, (x: number) => number][] = [
  ["deg2rad", "degrees", "radians", (x) => (x * Math.PI) / 180],
  ["rad2deg", "radians", "degrees", (x) => (x * 180) / Math.PI],
  ["hp2kw", "horsepower", "kW", (x) => x * 0.745699872],
  ["kw2hp", "kW", "horsepower", (x) => x / 0.745699872],
  ["kpa2psi", "kPa", "psi", (x) => x / 6.894757293],
  ["psi2kpa", "psi", "kPa", (x) => x * 6.894757293],
  ["ly2km", "light years", "km", (x) => x * 9.4607304725808e12],
  ["au2km", "astronomical units", "km", (x) => x * 149597870.7],
];

const convCommands: Command[] = CONV.map(([name, from, to, f]) => ({
  name, category: "Convert", description: `Convert ${from} to ${to}`, options: [o.num("value", `How many ${from}`)],
  run: (ctx) => {
    const x = Number(ctx.opt.value);
    if (!Number.isFinite(x)) return fail(`Give me a number of ${from}.`);
    return embed({ description: `🔁 **${show(x)} ${from}** = **${show(f(x))} ${to}**` });
  },
}));

// --- Random ---------------------------------------------------------------------------------

const randomCommands: Command[] = [
  {
    name: "flipcoins", category: "Random", description: "Flip several coins at once", options: [o.int("count", "How many (2–50)")],
    run: (ctx) => {
      const n = Math.min(50, Math.max(2, Number(ctx.opt.count) || 5));
      const flips = Array.from({ length: n }, () => (Math.random() < 0.5 ? "H" : "T"));
      const heads = flips.filter((f) => f === "H").length;
      return embed({ description: `🪙 ${flips.join(" ")}\n**${heads}** heads, **${n - heads}** tails` });
    },
  },
  {
    name: "dndstats", category: "Random", description: "Roll six tabletop ability scores (4d6, drop the lowest)",
    run: () => {
      const scores = Array.from({ length: 6 }, () => Array.from({ length: 4 }, () => rand(1, 6)).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0));
      return embed({ description: `🐉 **${scores.join(", ")}** (total ${scores.reduce((a, b) => a + b, 0)})` });
    },
  },
  { name: "randplanet", category: "Random", description: "A random planet", run: () => embed({ description: `🪐 **${pick(["Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"])}**` }) },
  { name: "randinstrument", category: "Random", description: "An instrument to learn", run: () => embed({ description: `🎻 **${pick(["guitar", "piano", "drums", "violin", "ukulele", "cello", "trumpet", "saxophone", "flute", "harp", "bass guitar", "harmonica"])}**` }) },
  { name: "randsport", category: "Random", description: "A random sport", run: () => embed({ description: `🏅 **${pick(["football", "basketball", "tennis", "badminton", "climbing", "swimming", "volleyball", "table tennis", "cycling", "skateboarding", "archery", "fencing"])}**` }) },
];

// --- Time -----------------------------------------------------------------------------------

/** Days until the next time it's this month and day (UTC). */
function daysUntil(month: number, day: number): number {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let target = Date.UTC(now.getUTCFullYear(), month - 1, day);
  if (target < today) target = Date.UTC(now.getUTCFullYear() + 1, month - 1, day);
  return Math.round((target - today) / 86_400_000);
}

function countdown(name: string, label: string, emoji: string, month: number, day: number): Command {
  return {
    name, category: "Time", description: `Days until ${label}`,
    run: () => { const d = daysUntil(month, day); return embed({ description: d === 0 ? `${emoji} It's ${label} today!` : `${emoji} **${d}** day${d === 1 ? "" : "s"} until ${label}.` }); },
  };
}

const timeCommands: Command[] = [
  {
    name: "fromunix", category: "Time", description: "A Unix timestamp as a date", options: [o.num("timestamp", "Seconds (or milliseconds) since 1970")],
    run: (ctx) => {
      let t = Number(ctx.opt.timestamp);
      if (!Number.isFinite(t)) return fail("Give me a Unix timestamp.");
      if (t < 1e11) t *= 1000;
      const d = new Date(t);
      return Number.isNaN(d.getTime()) ? fail("That's out of range.") : embed({ description: `🕰️ **${d.toUTCString()}**` });
    },
  },
  countdown("newyear", "New Year", "🎆", 1, 1),
  countdown("christmas", "Christmas", "🎄", 12, 25),
  countdown("halloween", "Halloween", "🎃", 10, 31),
  {
    name: "weekend", category: "Time", description: "How long until the weekend",
    run: () => {
      const day = new Date().getUTCDay();
      if (day === 0 || day === 6) return embed({ description: "🎉 It's the weekend!" });
      const d = 6 - day;
      return embed({ description: `📆 **${d}** day${d === 1 ? "" : "s"} until the weekend.` });
    },
  },
];

// --- Generators -------------------------------------------------------------------------------

const gen = (name: string, emoji: string, description: string, parts: string[][], join = " "): Command => ({
  name, category: "Fun", description, run: () => embed({ description: `${emoji} **${parts.map((p) => pick(p)).join(join)}**` }),
});

const funCommands: Command[] = [
  gen("catname", "🐱", "A name for a cat", [["Sir", "Lady", "Captain", "Little", "Professor", "Baron"], ["Whiskers", "Mittens", "Biscuit", "Pumpkin", "Noodle", "Mochi", "Socks", "Pickle"]]),
  gen("dogname", "🐶", "A name for a dog (Bruce's picks)", [["Big", "Tiny", "Sir", "Duke", "Lil", "Captain"], ["Waffles", "Bruno", "Pepper", "Biscuit", "Buddy", "Maple", "Tank", "Scout"]]),
  gen("fantasyname", "🧝", "A fantasy character name", [["Ael", "Bran", "Cor", "Dra", "Eli", "Fen", "Gal", "Ith", "Kael", "Lyr"], ["wyn", "dor", "thas", "mir", "riel", "gorn", "lith", "vane", "dris", "ion"]], ""),
  gen("superheroname", "🦸", "A superhero name", [["Captain", "The Mighty", "Doctor", "Silver", "Night", "Iron", "Quantum"], ["Comet", "Falcon", "Spark", "Shadow", "Tide", "Blaze", "Echo", "Vortex"]]),
  gen("pizzaorder", "🍕", "A random pizza order", [["Large", "Medium", "Personal", "Deep-dish", "Thin-crust"], ["pepperoni and mushroom", "margherita", "BBQ chicken", "veggie supreme", "four cheese", "ham and pineapple", "spicy sausage"], ["pizza.", "pizza with garlic dip.", "pizza, extra crispy."]]),
  gen("slogan", "📢", "A slogan for anything", [["Simply", "Seriously", "Always", "Totally", "Unapologetically"], ["better.", "the best.", "different.", "yours.", "unstoppable.", "delicious."]]),
];

export const extraCommands: Command[] = [...textCommands, ...mathCommands, ...convCommands, ...randomCommands, ...timeCommands, ...funCommands];
