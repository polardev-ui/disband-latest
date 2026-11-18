/**
 * Unit conversions and maths: Bruce's calculator shelf.
 * Every command takes plain numbers typed after it ("!km2mi 5", "!gcd 12 18").
 */
import type { Command, Ctx } from "../../kit";
import { embed, fail, fmt, o, str } from "../../kit";

const show = (n: number, dp = 4) =>
  Number.isFinite(n) ? (Math.abs(n) >= 1e15 || (n !== 0 && Math.abs(n) < 1e-6) ? n.toExponential(4) : fmt(Number(n.toFixed(dp)))) : "∞";

/** All the numbers typed after the command. */
function nums(ctx: Ctx): number[] {
  return str(ctx.opt.numbers)
    .replace(/,(?=\d{3}\b)/g, "")
    .split(/[\s,;]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

const numbersOpt = (what = "Numbers, separated by spaces") => [o.str("numbers", what)];

// --- Conversions -----------------------------------------------------------------

type Conv = [name: string, from: string, to: string, f: (x: number) => number];

const CONVERSIONS: Conv[] = [
  ["c2f", "°C", "°F", (x) => (x * 9) / 5 + 32],
  ["f2c", "°F", "°C", (x) => ((x - 32) * 5) / 9],
  ["c2k", "°C", "K", (x) => x + 273.15],
  ["k2c", "K", "°C", (x) => x - 273.15],
  ["f2k", "°F", "K", (x) => ((x - 32) * 5) / 9 + 273.15],
  ["k2f", "K", "°F", (x) => ((x - 273.15) * 9) / 5 + 32],
  ["km2mi", "km", "miles", (x) => x / 1.609344],
  ["mi2km", "miles", "km", (x) => x * 1.609344],
  ["m2ft", "m", "ft", (x) => x / 0.3048],
  ["ft2m", "ft", "m", (x) => x * 0.3048],
  ["cm2in", "cm", "in", (x) => x / 2.54],
  ["in2cm", "in", "cm", (x) => x * 2.54],
  ["m2yd", "m", "yd", (x) => x / 0.9144],
  ["yd2m", "yd", "m", (x) => x * 0.9144],
  ["mm2in", "mm", "in", (x) => x / 25.4],
  ["in2mm", "in", "mm", (x) => x * 25.4],
  ["km2nmi", "km", "nautical miles", (x) => x / 1.852],
  ["nmi2km", "nautical miles", "km", (x) => x * 1.852],
  ["kg2lb", "kg", "lb", (x) => x / 0.45359237],
  ["lb2kg", "lb", "kg", (x) => x * 0.45359237],
  ["g2oz", "g", "oz", (x) => x / 28.349523125],
  ["oz2g", "oz", "g", (x) => x * 28.349523125],
  ["kg2st", "kg", "stone", (x) => x / 6.35029318],
  ["st2kg", "stone", "kg", (x) => x * 6.35029318],
  ["l2gal", "litres", "US gallons", (x) => x / 3.785411784],
  ["gal2l", "US gallons", "litres", (x) => x * 3.785411784],
  ["ml2floz", "ml", "US fl oz", (x) => x / 29.5735295625],
  ["floz2ml", "US fl oz", "ml", (x) => x * 29.5735295625],
  ["l2pt", "litres", "UK pints", (x) => x / 0.56826125],
  ["pt2l", "UK pints", "litres", (x) => x * 0.56826125],
  ["cup2ml", "US cups", "ml", (x) => x * 236.5882365],
  ["ml2cup", "ml", "US cups", (x) => x / 236.5882365],
  ["kmh2mph", "km/h", "mph", (x) => x / 1.609344],
  ["mph2kmh", "mph", "km/h", (x) => x * 1.609344],
  ["ms2kmh", "m/s", "km/h", (x) => x * 3.6],
  ["kmh2ms", "km/h", "m/s", (x) => x / 3.6],
  ["kn2kmh", "knots", "km/h", (x) => x * 1.852],
  ["kmh2kn", "km/h", "knots", (x) => x / 1.852],
  ["sqm2sqft", "m²", "ft²", (x) => x / 0.09290304],
  ["sqft2sqm", "ft²", "m²", (x) => x * 0.09290304],
  ["ha2ac", "hectares", "acres", (x) => x / 0.40468564224],
  ["ac2ha", "acres", "hectares", (x) => x * 0.40468564224],
  ["mb2gb", "MB", "GB", (x) => x / 1000],
  ["gb2mb", "GB", "MB", (x) => x * 1000],
  ["gb2tb", "GB", "TB", (x) => x / 1000],
  ["tb2gb", "TB", "GB", (x) => x * 1000],
  ["mb2mib", "MB", "MiB", (x) => (x * 1e6) / 1048576],
  ["mib2mb", "MiB", "MB", (x) => (x * 1048576) / 1e6],
  ["kcal2kj", "kcal", "kJ", (x) => x * 4.184],
  ["kj2kcal", "kJ", "kcal", (x) => x / 4.184],
  ["h2min", "hours", "minutes", (x) => x * 60],
  ["min2s", "minutes", "seconds", (x) => x * 60],
  ["d2h", "days", "hours", (x) => x * 24],
  ["wk2d", "weeks", "days", (x) => x * 7],
  ["yr2d", "years", "days", (x) => x * 365.2425],
  ["psi2bar", "psi", "bar", (x) => x / 14.5037738],
  ["bar2psi", "bar", "psi", (x) => x * 14.5037738],
];

const convertCommands: Command[] = CONVERSIONS.map(([name, from, to, f]) => ({
  name,
  category: "Convert",
  description: `Convert ${from} to ${to}`,
  options: [o.num("value", `How many ${from}`)],
  run: (ctx) => {
    const x = Number(ctx.opt.value);
    if (!Number.isFinite(x)) return fail(`Give me a number of ${from}.`);
    return embed({ description: `🔁 **${show(x)} ${from}** = **${show(f(x))} ${to}**` });
  },
}));

// --- Maths --------------------------------------------------------------------------

const isPrime = (n: number) => {
  if (!Number.isInteger(n) || n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
};
const gcd2 = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd2(b, a % b));
const deg = (x: number) => (x * Math.PI) / 180;
const ROMAN: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];

/** One-number maths: "!sqrt 2". */
function unary(name: string, description: string, f: (x: number) => number | string, check?: (x: number) => string | null): Command {
  return {
    name,
    category: "Maths",
    description,
    options: [o.num("number", "A number")],
    run: (ctx) => {
      const x = Number(ctx.opt.number);
      if (!Number.isFinite(x)) return fail("Give me a number.");
      const problem = check?.(x);
      if (problem) return fail(problem);
      const r = f(x);
      return embed({ description: `🧮 \`${name}(${show(x)})\` = **${typeof r === "number" ? show(r) : r}**` });
    },
  };
}

/** Maths over a list: "!avg 3 5 9". */
function listOp(name: string, description: string, f: (xs: number[]) => number | string, min = 1): Command {
  return {
    name,
    category: "Maths",
    description,
    options: numbersOpt(),
    run: (ctx) => {
      const xs = nums(ctx);
      if (xs.length < min) return fail(`Give me at least ${min} number${min === 1 ? "" : "s"}.`);
      const r = f(xs);
      return embed({ description: `🧮 ${name} of ${xs.length} number${xs.length === 1 ? "" : "s"}: **${typeof r === "number" ? show(r) : r}**` });
    },
  };
}

/** Two numbers: "!pow 2 10". */
function binary(name: string, description: string, f: (a: number, b: number) => number | string, labels: [string, string] = ["a", "b"]): Command {
  return {
    name,
    category: "Maths",
    description,
    options: numbersOpt(`${labels[0]} and ${labels[1]}`),
    run: (ctx) => {
      const [a, b] = nums(ctx);
      if (a === undefined || b === undefined) return fail(`Give me two numbers: ${labels[0]} and ${labels[1]}.`);
      const r = f(a, b);
      return embed({ description: `🧮 **${typeof r === "number" ? show(r) : r}**` });
    },
  };
}

const intOnly = (x: number) => (Number.isInteger(x) ? null : "That needs a whole number.");
const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);

const mathCommands: Command[] = [
  unary("sqrt", "Square root", Math.sqrt, (x) => (x < 0 ? "No real square root of a negative number." : null)),
  unary("cbrt", "Cube root", Math.cbrt),
  unary("abs", "Absolute value", Math.abs),
  unary("round", "Round to the nearest whole number", Math.round),
  unary("floor", "Round down", Math.floor),
  unary("ceil", "Round up", Math.ceil),
  unary("square", "A number squared", (x) => x * x),
  unary("cube", "A number cubed", (x) => x * x * x),
  unary("fact", "Factorial (n!)", (x) => { let r = 1; for (let i = 2; i <= x; i++) r *= i; return r; }, (x) => (!Number.isInteger(x) || x < 0 ? "Factorial needs a whole number, 0 or more." : x > 170 ? "That's too big to show." : null)),
  unary("isprime", "Is it a prime number?", (x) => (isPrime(x) ? "yes, it's prime" : "no, not prime"), intOnly),
  unary("nextprime", "The next prime after a number", (x) => { let n = Math.floor(x) + 1; while (!isPrime(n)) n++; return n; }, (x) => (x > 1e9 ? "Keep it under a billion." : null)),
  unary("primes", "Every prime up to a number", (x) => { const out: number[] = []; for (let n = 2; n <= x; n++) if (isPrime(n)) out.push(n); return out.length ? out.join(", ") : "none"; }, (x) => (x > 2000 ? "Keep it to 2,000 or less." : null)),
  unary("fib", "The nth Fibonacci number", (x) => { let a = 0, b = 1; for (let i = 0; i < x; i++) [a, b] = [b, a + b]; return a; }, (x) => (!Number.isInteger(x) || x < 0 || x > 1400 ? "Pick a whole number from 0 to 1,400." : null)),
  unary("log10", "Base-10 logarithm", Math.log10, (x) => (x <= 0 ? "Logarithms need a number above 0." : null)),
  unary("ln", "Natural logarithm", Math.log, (x) => (x <= 0 ? "Logarithms need a number above 0." : null)),
  unary("log2", "Base-2 logarithm", Math.log2, (x) => (x <= 0 ? "Logarithms need a number above 0." : null)),
  unary("exp", "e to the power of a number", Math.exp),
  unary("sin", "Sine (degrees)", (x) => Math.sin(deg(x))),
  unary("cos", "Cosine (degrees)", (x) => Math.cos(deg(x))),
  unary("tan", "Tangent (degrees)", (x) => Math.tan(deg(x))),
  unary("asin", "Inverse sine, in degrees", (x) => (Math.asin(x) * 180) / Math.PI, (x) => (x < -1 || x > 1 ? "That needs a number from -1 to 1." : null)),
  unary("acos", "Inverse cosine, in degrees", (x) => (Math.acos(x) * 180) / Math.PI, (x) => (x < -1 || x > 1 ? "That needs a number from -1 to 1." : null)),
  unary("atan", "Inverse tangent, in degrees", (x) => (Math.atan(x) * 180) / Math.PI),
  unary("reciprocal", "1 divided by a number", (x) => 1 / x, (x) => (x === 0 ? "Nothing divides by zero." : null)),
  unary("digitsum", "Add up a number's digits", (x) => String(Math.abs(Math.trunc(x))).split("").reduce((s, d) => s + Number(d), 0)),
  unary("isperfect", "Is it a perfect number?", (x) => { let s = 1; for (let i = 2; i * i <= x; i++) if (x % i === 0) s += i + (i * i === x ? 0 : x / i); return x > 1 && s === x ? "yes, it's perfect" : "no"; }, (x) => (!Number.isInteger(x) || x < 1 || x > 1e12 ? "Pick a whole number from 1 to a trillion." : null)),
  unary("triangular", "The nth triangular number", (x) => (x * (x + 1)) / 2, intOnly),
  unary("collatz", "Steps for a number to reach 1 in the Collatz game", (x) => { let n = x, s = 0; while (n !== 1 && s < 10000) { n = n % 2 ? 3 * n + 1 : n / 2; s++; } return `${s} steps`; }, (x) => (!Number.isInteger(x) || x < 1 ? "Pick a whole number above 0." : null)),
  unary("roman", "A number in Roman numerals", (x) => { let n = x, out = ""; for (const [v, r] of ROMAN) while (n >= v) { out += r; n -= v; } return out; }, (x) => (!Number.isInteger(x) || x < 1 || x > 3999 ? "Roman numerals go from 1 to 3,999." : null)),
  unary("tobin", "A number in binary", (x) => Math.trunc(x).toString(2), intOnly),
  unary("tohex", "A number in hexadecimal", (x) => Math.trunc(x).toString(16).toUpperCase(), intOnly),
  unary("tooct", "A number in octal", (x) => Math.trunc(x).toString(8), intOnly),
  listOp("avg", "The average of some numbers", (xs) => xs.reduce((a, b) => a + b, 0) / xs.length),
  listOp("median", "The middle number", (xs) => { const s = sorted(xs), m = Math.floor(s.length / 2); return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; }),
  listOp("mode", "The most common number", (xs) => { const c = new Map<number, number>(); xs.forEach((x) => c.set(x, (c.get(x) ?? 0) + 1)); const top = Math.max(...c.values()); return [...c].filter(([, n]) => n === top).map(([x]) => show(x)).join(", "); }),
  listOp("sum", "Add up some numbers", (xs) => xs.reduce((a, b) => a + b, 0)),
  listOp("product", "Multiply some numbers together", (xs) => xs.reduce((a, b) => a * b, 1)),
  listOp("min", "The smallest number", (xs) => Math.min(...xs)),
  listOp("max", "The largest number", (xs) => Math.max(...xs)),
  listOp("range", "Largest minus smallest", (xs) => Math.max(...xs) - Math.min(...xs)),
  listOp("stddev", "Standard deviation", (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length); }, 2),
  listOp("gcd", "Greatest common divisor", (xs) => xs.map(Math.trunc).reduce(gcd2), 2),
  listOp("lcm", "Lowest common multiple", (xs) => xs.map(Math.trunc).reduce((a, b) => Math.abs(a * b) / gcd2(a, b)), 2),
  listOp("hypot", "Length of the hypotenuse", (xs) => Math.hypot(...xs), 2),
  binary("pow", "One number to the power of another", (a, b) => a ** b, ["base", "power"]),
  binary("mod", "Remainder after dividing", (a, b) => (b === 0 ? "nothing divides by zero" : a % b), ["number", "divisor"]),
  binary("pctof", "What X% of a number is", (a, b) => `${show(a)}% of ${show(b)} is ${show((a / 100) * b)}`, ["percent", "number"]),
  binary("pctchange", "Percentage change from one number to another", (a, b) => (a === 0 ? "can't change from zero" : `${b >= a ? "+" : ""}${show(((b - a) / Math.abs(a)) * 100, 2)}%`), ["from", "to"]),
  binary("ratio", "Simplify a ratio", (a, b) => { const g = gcd2(Math.trunc(a), Math.trunc(b)) || 1; return `${Math.trunc(a) / g} : ${Math.trunc(b) / g}`; }, ["a", "b"]),
  binary("tip", "A tip on a bill", (bill, pct) => `tip ${show(bill * (pct / 100), 2)}, total ${show(bill * (1 + pct / 100), 2)}`, ["bill", "percent"]),
  binary("split", "Split a bill between people", (bill, people) => (people < 1 ? "need at least one person" : `${show(bill / people, 2)} each`), ["bill", "people"]),
  binary("discount", "A price after a discount", (price, pct) => `${show(price * (1 - pct / 100), 2)} (you save ${show(price * (pct / 100), 2)})`, ["price", "percent"]),
  binary("tax", "A price with tax added", (price, pct) => `${show(price * (1 + pct / 100), 2)} (tax ${show(price * (pct / 100), 2)})`, ["price", "percent"]),
  {
    name: "interest",
    category: "Maths",
    description: "Compound interest: amount, yearly rate %, years",
    options: numbersOpt("amount, yearly rate % and years"),
    run: (ctx) => {
      const [p, r, y] = nums(ctx);
      if (p === undefined || r === undefined || y === undefined) return fail("Give me three numbers: amount, yearly rate % and years.");
      const total = p * (1 + r / 100) ** y;
      return embed({ description: `📈 ${show(p, 2)} at ${show(r, 2)}% for ${show(y)} years grows to **${show(total, 2)}** (+${show(total - p, 2)}).` });
    },
  },
  {
    name: "unroman",
    category: "Maths",
    description: "Roman numerals back to a number",
    options: [o.str("numeral", "Roman numerals, like MMXXVI")],
    run: (ctx) => {
      const s = str(ctx.opt.numeral).toUpperCase().trim();
      if (!/^[MDCLXVI]+$/.test(s)) return fail("That isn't a Roman numeral.");
      const val: Record<string, number> = { M: 1000, D: 500, C: 100, L: 50, X: 10, V: 5, I: 1 };
      let n = 0;
      for (let i = 0; i < s.length; i++) n += val[s[i]!]! < (val[s[i + 1]!] ?? 0) ? -val[s[i]!]! : val[s[i]!]!;
      return embed({ description: `🏛️ **${s}** = **${fmt(n)}**` });
    },
  },
  ...([["frombin", 2, "binary"], ["fromhex", 16, "hexadecimal"], ["fromoct", 8, "octal"]] as const).map(([name, radix, label]): Command => ({
    name,
    category: "Maths",
    description: `A ${label} number back to decimal`,
    options: [o.str("value", `A ${label} number`)],
    run: (ctx) => {
      const s = str(ctx.opt.value).trim().replace(/^0[xbo]/i, "");
      const n = parseInt(s, radix);
      if (!s || Number.isNaN(n)) return fail(`That isn't a ${label} number.`);
      return embed({ description: `🔢 \`${s}\` = **${fmt(n)}**` });
    },
  })),
  {
    name: "base",
    category: "Maths",
    description: "Convert a number between bases: value, from, to",
    options: [o.str("value", "The number"), o.int("from", "Its base (2–36)"), o.int("to", "The base you want (2–36)")],
    run: (ctx) => {
      const from = Number(ctx.opt.from), to = Number(ctx.opt.to);
      if (![from, to].every((b) => Number.isInteger(b) && b >= 2 && b <= 36)) return fail("Bases go from 2 to 36.");
      const n = parseInt(str(ctx.opt.value), from);
      if (Number.isNaN(n)) return fail(`That isn't a base-${from} number.`);
      return embed({ description: `🔢 \`${str(ctx.opt.value)}\` (base ${from}) = **${n.toString(to).toUpperCase()}** (base ${to})` });
    },
  },
  { name: "pi", category: "Maths", description: "π to 15 decimal places", run: () => embed({ description: "🥧 π = **3.141592653589793**" }) },
  { name: "e", category: "Maths", description: "Euler's number", run: () => embed({ description: "📐 e = **2.718281828459045**" }) },
  { name: "phi", aliases: ["golden"], category: "Maths", description: "The golden ratio", run: () => embed({ description: "🐚 φ = **1.618033988749895**" }) },
];

export const numberCommands: Command[] = [...convertCommands, ...mathCommands];
