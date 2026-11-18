/**
 * World clocks ("!tokyo") and date tools ("!weekday 2026-12-25").
 */
import type { Command, Ctx } from "../../kit";
import { embed, fail, fmt, o, str } from "../../kit";

const CITIES: [name: string, label: string, zone: string][] = [
  ["tokyo", "Tokyo", "Asia/Tokyo"], ["london", "London", "Europe/London"], ["newyork", "New York", "America/New_York"],
  ["paris", "Paris", "Europe/Paris"], ["sydney", "Sydney", "Australia/Sydney"], ["losangeles", "Los Angeles", "America/Los_Angeles"],
  ["dubai", "Dubai", "Asia/Dubai"], ["delhi", "Delhi", "Asia/Kolkata"], ["berlin", "Berlin", "Europe/Berlin"],
  ["moscow", "Moscow", "Europe/Moscow"], ["beijing", "Beijing", "Asia/Shanghai"], ["seoul", "Seoul", "Asia/Seoul"],
  ["singapore", "Singapore", "Asia/Singapore"], ["saopaulo", "São Paulo", "America/Sao_Paulo"], ["mexicocity", "Mexico City", "America/Mexico_City"],
  ["toronto", "Toronto", "America/Toronto"], ["chicago", "Chicago", "America/Chicago"], ["honolulu", "Honolulu", "Pacific/Honolulu"],
  ["auckland", "Auckland", "Pacific/Auckland"], ["cairo", "Cairo", "Africa/Cairo"], ["lagos", "Lagos", "Africa/Lagos"],
  ["nairobi", "Nairobi", "Africa/Nairobi"], ["istanbul", "Istanbul", "Europe/Istanbul"], ["bangkok", "Bangkok", "Asia/Bangkok"],
  ["jakarta", "Jakarta", "Asia/Jakarta"], ["manila", "Manila", "Asia/Manila"], ["madrid", "Madrid", "Europe/Madrid"],
  ["rome", "Rome", "Europe/Rome"], ["amsterdam", "Amsterdam", "Europe/Amsterdam"], ["stockholm", "Stockholm", "Europe/Stockholm"],
  ["dublin", "Dublin", "Europe/Dublin"], ["lisbon", "Lisbon", "Europe/Lisbon"], ["athens", "Athens", "Europe/Athens"],
  ["johannesburg", "Johannesburg", "Africa/Johannesburg"], ["buenosaires", "Buenos Aires", "America/Argentina/Buenos_Aires"],
  ["lima", "Lima", "America/Lima"], ["bogota", "Bogotá", "America/Bogota"], ["anchorage", "Anchorage", "America/Anchorage"],
  ["denver", "Denver", "America/Denver"], ["vancouver", "Vancouver", "America/Vancouver"],
];

const clockCommands: Command[] = CITIES.map(([name, label, zone]): Command => ({
  name,
  category: "Time",
  description: `The time in ${label}`,
  run: () => {
    const now = new Date();
    const time = now.toLocaleTimeString("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit" });
    const day = now.toLocaleDateString("en-GB", { timeZone: zone, weekday: "long", day: "numeric", month: "long" });
    return embed({ description: `🕰️ It's **${time}** in ${label} (${day}).` });
  },
}));

// --- Dates ------------------------------------------------------------------------------

/** "2026-12-25", "25/12/2026", "dec 25 2026"… or today when empty. */
function dateFrom(ctx: Ctx, key = "date"): Date | null {
  const raw = str(ctx.opt[key]).trim();
  if (!raw) return new Date();
  const dmy = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  const d = dmy ? new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]))) : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

const long = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const dayMs = 86_400_000;
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

function dateCmd(name: string, description: string, f: (d: Date) => string, optional = true): Command {
  return {
    name,
    category: "Time",
    description,
    options: [o.str("date", "A date, like 2026-12-25 or 25/12/2026", !optional)],
    run: (ctx) => {
      const d = dateFrom(ctx);
      if (!d) return fail("I couldn't read that date. Try 2026-12-25 or 25/12/2026.");
      return embed({ description: f(d) });
    },
  };
}

const ZODIAC: [string, number, number][] = [["♑ Capricorn", 1, 19], ["♒ Aquarius", 2, 18], ["♓ Pisces", 3, 20], ["♈ Aries", 4, 19], ["♉ Taurus", 5, 20], ["♊ Gemini", 6, 20], ["♋ Cancer", 7, 22], ["♌ Leo", 8, 22], ["♍ Virgo", 9, 22], ["♎ Libra", 10, 22], ["♏ Scorpio", 11, 21], ["♐ Sagittarius", 12, 21], ["♑ Capricorn", 12, 31]];
const CHINESE = ["🐀 Rat", "🐂 Ox", "🐅 Tiger", "🐇 Rabbit", "🐉 Dragon", "🐍 Snake", "🐎 Horse", "🐐 Goat", "🐒 Monkey", "🐓 Rooster", "🐕 Dog", "🐖 Pig"];
const STONES = ["Garnet", "Amethyst", "Aquamarine", "Diamond", "Emerald", "Pearl", "Ruby", "Peridot", "Sapphire", "Opal", "Topaz", "Turquoise"];

const dateCommands: Command[] = [
  { name: "today", category: "Time", description: "Today's date (UTC)", run: () => embed({ description: `📅 **${long(new Date())}**` }) },
  { name: "tomorrow", category: "Time", description: "Tomorrow's date (UTC)", run: () => embed({ description: `📅 **${long(new Date(Date.now() + dayMs))}**` }) },
  { name: "yesterday", category: "Time", description: "Yesterday's date (UTC)", run: () => embed({ description: `📅 **${long(new Date(Date.now() - dayMs))}**` }) },
  dateCmd("weekday", "What day of the week a date is", (d) => `📅 ${long(d)} is a **${d.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })}**.`, false),
  dateCmd("dayofyear", "Which day of the year it is", (d) => `📅 Day **${Math.floor((utcDay(d) - Date.UTC(d.getUTCFullYear(), 0, 1)) / dayMs) + 1}** of ${d.getUTCFullYear()}.`),
  dateCmd("weeknumber", "The ISO week number", (d) => { const t = new Date(utcDay(d)); const n = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - n + 3); const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return `📅 Week **${1 + Math.round(((t.getTime() - first.getTime()) / dayMs - 3 + ((first.getUTCDay() + 6) % 7)) / 7)}**.`; }),
  dateCmd("quarter", "Which quarter of the year", (d) => `📅 **Q${Math.floor(d.getUTCMonth() / 3) + 1}** ${d.getUTCFullYear()}.`),
  dateCmd("season", "The season (northern hemisphere)", (d) => `🍂 **${["Winter", "Winter", "Spring", "Spring", "Spring", "Summer", "Summer", "Summer", "Autumn", "Autumn", "Autumn", "Winter"][d.getUTCMonth()]}** in the north, **${["Summer", "Summer", "Autumn", "Autumn", "Autumn", "Winter", "Winter", "Winter", "Spring", "Spring", "Spring", "Summer"][d.getUTCMonth()]}** in the south.`),
  dateCmd("zodiac", "Star sign for a birthday", (d) => { const m = d.getUTCMonth() + 1, day = d.getUTCDate(); const z = ZODIAC.find(([, zm, zd]) => m < zm || (m === zm && day <= zd))!; return `✨ **${z[0]}**`; }, false),
  dateCmd("birthstone", "Birthstone for a month", (d) => `💎 **${STONES[d.getUTCMonth()]}**`, false),
  dateCmd("moonphase", "The moon's phase", (d) => { const age = (((utcDay(d) - Date.UTC(2000, 0, 6)) / dayMs) % 29.530588853 + 29.530588853) % 29.530588853; const phases = ["🌑 New moon", "🌒 Waxing crescent", "🌓 First quarter", "🌔 Waxing gibbous", "🌕 Full moon", "🌖 Waning gibbous", "🌗 Last quarter", "🌘 Waning crescent"]; return `${phases[Math.round(age / 3.69) % 8]} (day ${Math.floor(age)} of the cycle)`; }),
  dateCmd("since", "Days since a date", (d) => `⏳ **${fmt(Math.floor((utcDay(new Date()) - utcDay(d)) / dayMs))}** days since ${long(d)}.`, false),
  {
    name: "chinesezodiac",
    category: "Time",
    description: "Chinese zodiac animal for a year",
    options: [o.int("year", "A year, like 1999")],
    run: (ctx) => {
      const y = Number(ctx.opt.year);
      if (!Number.isInteger(y)) return fail("Give me a year, like 1999.");
      return embed({ description: `🧧 ${y} is the year of the **${CHINESE[(((y - 2020) % 12) + 12) % 12]}** (it changes at Lunar New Year).` });
    },
  },
  {
    name: "leapyear",
    category: "Time",
    description: "Is a year a leap year?",
    options: [o.int("year", "A year (this year, if empty)", false)],
    run: (ctx) => {
      const y = Number(ctx.opt.year) || new Date().getUTCFullYear();
      return embed({ description: `📅 ${y} **${isLeap(y) ? "is" : "isn't"}** a leap year.` });
    },
  },
  {
    name: "daysin",
    category: "Time",
    description: "How many days a month has: month, year",
    options: [o.int("month", "Month number (1–12)"), o.int("year", "Year (this year, if empty)", false)],
    run: (ctx) => {
      const m = Number(ctx.opt.month), y = Number(ctx.opt.year) || new Date().getUTCFullYear();
      if (!Number.isInteger(m) || m < 1 || m > 12) return fail("Give me a month number from 1 to 12.");
      const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return embed({ description: `📅 ${new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })} ${y} has **${days}** days.` });
    },
  },
  {
    name: "adddays",
    category: "Time",
    description: "A date some days from now: days, then a date (today, if empty)",
    options: [o.int("days", "How many days (negative for before)"), o.str("date", "A starting date", false)],
    run: (ctx) => {
      const n = Number(ctx.opt.days), d = dateFrom(ctx);
      if (!Number.isInteger(n) || !d) return fail("Use it like `adddays 30` or `adddays 30 2026-12-25`.");
      return embed({ description: `📅 ${n} days ${n < 0 ? "before" : "after"} ${long(d)}: **${long(new Date(utcDay(d) + n * dayMs))}**.` });
    },
  },
  {
    name: "between",
    category: "Time",
    description: "Days between two dates",
    options: [o.str("from", "First date"), o.str("to", "Second date")],
    run: (ctx) => {
      const a = dateFrom(ctx, "from"), b = dateFrom(ctx, "to");
      if (!a || !b || !str(ctx.opt.to)) return fail("Use it like `between 2026-01-01 2026-12-25`.");
      return embed({ description: `📅 **${fmt(Math.abs(Math.round((utcDay(b) - utcDay(a)) / dayMs)))}** days between ${long(a)} and ${long(b)}.` });
    },
  },
  {
    name: "yearprogress",
    category: "Time",
    description: "How much of the year has gone",
    run: () => {
      const now = new Date(), y = now.getUTCFullYear();
      const pct = ((now.getTime() - Date.UTC(y, 0, 1)) / (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1))) * 100;
      const filled = Math.round(pct / 5);
      return embed({ description: `⏳ ${y} is **${pct.toFixed(1)}%** done.\n${"▰".repeat(filled)}${"▱".repeat(20 - filled)}` });
    },
  },
];

export const timeCommands: Command[] = [...clockCommands, ...dateCommands];
