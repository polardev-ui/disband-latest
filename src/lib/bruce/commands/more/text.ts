/**
 * Text tools: restyle, encode, decode and count what you type after the command.
 * "!mock hello there", "!morse sos", "!snake Hello World".
 */
import type { Command } from "../../kit";
import { clip, embed, fail, fmt, o, str } from "../../kit";

const MAX = 1800;

/** Map letters through a styled Unicode alphabet. */
function alphabet(upper: string, lower: string, digits?: string) {
  const U = [...upper], L = [...lower], D = digits ? [...digits] : null;
  return (s: string) =>
    [...s].map((ch) => {
      const c = ch.charCodeAt(0);
      if (c >= 65 && c <= 90) return U[c - 65] ?? ch;
      if (c >= 97 && c <= 122) return L[c - 97] ?? ch;
      if (D && c >= 48 && c <= 57) return D[c - 48] ?? ch;
      return ch;
    }).join("");
}

const ABC = "abcdefghijklmnopqrstuvwxyz";
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const caseWords = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w.toLowerCase());

const MORSE: Record<string, string> = {
  a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.", g: "--.", h: "....", i: "..", j: ".---", k: "-.-", l: ".-..", m: "--",
  n: "-.", o: "---", p: ".--.", q: "--.-", r: ".-.", s: "...", t: "-", u: "..-", v: "...-", w: ".--", x: "-..-", y: "-.--", z: "--..",
  "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
  ".": ".-.-.-", ",": "--..--", "?": "..--..", "!": "-.-.--", "/": "-..-.", "@": ".--.-.", "'": ".----.",
};
const UNMORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
const NATO = ["Alfa", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliett", "Kilo", "Lima", "Mike", "November", "Oscar", "Papa", "Quebec", "Romeo", "Sierra", "Tango", "Uniform", "Victor", "Whiskey", "X-ray", "Yankee", "Zulu"];
const LEET: Record<string, string> = { a: "4", e: "3", i: "1", o: "0", s: "5", t: "7", g: "9", b: "8", l: "1" };
const FLIP: Record<string, string> = { a: "ɐ", b: "q", c: "ɔ", d: "p", e: "ǝ", f: "ɟ", g: "ƃ", h: "ɥ", i: "ᴉ", j: "ɾ", k: "ʞ", l: "l", m: "ɯ", n: "u", o: "o", p: "d", q: "b", r: "ɹ", s: "s", t: "ʇ", u: "n", v: "ʌ", w: "ʍ", x: "x", y: "ʎ", z: "z", ".": "˙", ",": "'", "?": "¿", "!": "¡", "'": ",", "(": ")", ")": "(" };
const SUP = "ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖᵠʳˢᵗᵘᵛʷˣʸᶻ", SUPD = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const SUB = "ₐbcdₑfgₕᵢⱼₖₗₘₙₒₚqᵣₛₜᵤᵥwₓyz", SUBD = "₀₁₂₃₄₅₆₇₈₉";

/** A command that turns the text after it into something else. */
function tx(name: string, description: string, f: (s: string) => string, aliases?: string[]): Command {
  return {
    name,
    ...(aliases ? { aliases } : {}),
    category: "Text",
    description,
    options: [o.str("text", "The text")],
    run: (ctx) => {
      const s = str(ctx.opt.text);
      if (!s.trim()) return fail("Give me some text after the command.");
      const out = f(s.slice(0, MAX));
      return out.trim() ? clip(out, 1990) : fail("Nothing came out of that.");
    },
  };
}

/** A command that reports on the text instead of rewriting it. */
function stat(name: string, description: string, f: (s: string) => string): Command {
  return {
    name,
    category: "Text",
    description,
    options: [o.str("text", "The text")],
    run: (ctx) => {
      const s = str(ctx.opt.text);
      if (!s.trim()) return fail("Give me some text after the command.");
      return embed({ description: `🔤 ${f(s)}` });
    },
  };
}

export const textCommands: Command[] = [
  tx("reverse", "Text backwards", (s) => [...s].reverse().join("")),
  tx("upper", "UPPER CASE", (s) => s.toUpperCase()),
  tx("lower", "lower case", (s) => s.toLowerCase()),
  tx("titlecase", "Title Case Every Word", (s) => s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase())),
  tx("sentence", "Sentence case", (s) => s.toLowerCase().replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (_, a, c) => a + c.toUpperCase())),
  tx("mock", "sPoNgE cAsE", (s) => [...s].map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase())).join("")),
  tx("clap", "Put 👏 between 👏 words", (s) => words(s).join(" 👏 ")),
  tx("spaced", "S p a c e   i t   o u t", (s) => [...s].join(" ")),
  tx("leet", "1337 5p34k", (s) => s.replace(/[aeiostgbl]/gi, (c) => LEET[c.toLowerCase()] ?? c)),
  tx("owo", "OwO-ify text", (s) => s.replace(/[rl]/g, "w").replace(/[RL]/g, "W").replace(/n([aeiou])/g, "ny$1") + " owo"),
  tx("vapor", "Ｆｕｌｌ ｗｉｄｔｈ", (s) => s.replace(/[!-~]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).replace(/ /g, "　")),
  tx("smallcaps", "sᴍᴀʟʟ ᴄᴀᴘs", alphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ")),
  tx("bubble", "Ⓑⓤⓑⓑⓛⓔ letters", alphabet("ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏ", "ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ", "⓪①②③④⑤⑥⑦⑧⑨")),
  tx("upsidedown", "uʍop ǝpᴉsdn", (s) => [...s.toLowerCase()].map((c) => FLIP[c] ?? c).reverse().join(""), ["flip"]),
  tx("bold", "𝐁𝐨𝐥𝐝 letters", alphabet("𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙", "𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳", "𝟎𝟏𝟐𝟑𝟒𝟓𝟔𝟕𝟖𝟗")),
  tx("italic", "𝘐𝘵𝘢𝘭𝘪𝘤 letters", alphabet("𝘈𝘉𝘊𝘋𝘌𝘍𝘎𝘏𝘐𝘑𝘒𝘓𝘔𝘕𝘖𝘗𝘘𝘙𝘚𝘛𝘜𝘝𝘞𝘟𝘠𝘡", "𝘢𝘣𝘤𝘥𝘦𝘧𝘨𝘩𝘪𝘫𝘬𝘭𝘮𝘯𝘰𝘱𝘲𝘳𝘴𝘵𝘶𝘷𝘸𝘹𝘺𝘻")),
  tx("bolditalic", "𝘽𝙤𝙡𝙙 𝙞𝙩𝙖𝙡𝙞𝙘", alphabet("𝘼𝘽𝘾𝘿𝙀𝙁𝙂𝙃𝙄𝙅𝙆𝙇𝙈𝙉𝙊𝙋𝙌𝙍𝙎𝙏𝙐𝙑𝙒𝙓𝙔𝙕", "𝙖𝙗𝙘𝙙𝙚𝙛𝙜𝙝𝙞𝙟𝙠𝙡𝙢𝙣𝙤𝙥𝙦𝙧𝙨𝙩𝙪𝙫𝙬𝙭𝙮𝙯")),
  tx("mono", "𝚖𝚘𝚗𝚘𝚜𝚙𝚊𝚌𝚎 letters", alphabet("𝙰𝙱𝙲𝙳𝙴𝙵𝙶𝙷𝙸𝙹𝙺𝙻𝙼𝙽𝙾𝙿𝚀𝚁𝚂𝚃𝚄𝚅𝚆𝚇𝚈𝚉", "𝚊𝚋𝚌𝚍𝚎𝚏𝚐𝚑𝚒𝚓𝚔𝚕𝚖𝚗𝚘𝚙𝚚𝚛𝚜𝚝𝚞𝚟𝚠𝚡𝚢𝚣", "𝟶𝟷𝟸𝟹𝟺𝟻𝟼𝟽𝟾𝟿")),
  tx("cursive", "𝓒𝓾𝓻𝓼𝓲𝓿𝓮 letters", alphabet("𝓐𝓑𝓒𝓓𝓔𝓕𝓖𝓗𝓘𝓙𝓚𝓛𝓜𝓝𝓞𝓟𝓠𝓡𝓢𝓣𝓤𝓥𝓦𝓧𝓨𝓩", "𝓪𝓫𝓬𝓭𝓮𝓯𝓰𝓱𝓲𝓳𝓴𝓵𝓶𝓷𝓸𝓹𝓺𝓻𝓼𝓽𝓾𝓿𝔀𝔁𝔂𝔃")),
  tx("fraktur", "𝔉𝔯𝔞𝔨𝔱𝔲𝔯 letters", alphabet("𝔄𝔅ℭ𝔇𝔈𝔉𝔊ℌℑ𝔍𝔎𝔏𝔐𝔑𝔒𝔓𝔔ℜ𝔖𝔗𝔘𝔙𝔚𝔛𝔜ℨ", "𝔞𝔟𝔠𝔡𝔢𝔣𝔤𝔥𝔦𝔧𝔨𝔩𝔪𝔫𝔬𝔭𝔮𝔯𝔰𝔱𝔲𝔳𝔴𝔵𝔶𝔷")),
  tx("doublestruck", "𝔻𝕠𝕦𝕓𝕝𝕖-𝕤𝕥𝕣𝕦𝕔𝕜 letters", alphabet("𝔸𝔹ℂ𝔻𝔼𝔽𝔾ℍ𝕀𝕁𝕂𝕃𝕄ℕ𝕆ℙℚℝ𝕊𝕋𝕌𝕍𝕎𝕏𝕐ℤ", "𝕒𝕓𝕔𝕕𝕖𝕗𝕘𝕙𝕚𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫", "𝟘𝟙𝟚𝟛𝟜𝟝𝟞𝟟𝟠𝟡")),
  tx("strike", "S̶t̶r̶i̶k̶e̶ through", (s) => [...s].map((c) => c + "̶").join("")),
  tx("underline", "U̲n̲d̲e̲r̲l̲i̲n̲e̲ letters", (s) => [...s].map((c) => c + "̲").join("")),
  tx("superscript", "ˢᵘᵖᵉʳˢᶜʳⁱᵖᵗ", (s) => alphabet(SUP.toUpperCase(), SUP, SUPD)(s.toLowerCase())),
  tx("subscript", "ₛᵤbₛcᵣᵢₚₜ", (s) => alphabet(SUB, SUB, SUBD)(s.toLowerCase())),
  tx("regional", "🇪🇲🇴🇯🇮 letters", (s) => [...s.toLowerCase()].map((c) => (ABC.includes(c) ? `:regional_indicator_${c}: ` : c === " " ? "   " : c)).join("")),
  tx("binary", "Text to binary", (s) => [...new TextEncoder().encode(s)].map((b) => b.toString(2).padStart(8, "0")).join(" ")),
  tx("unbinary", "Binary back to text", (s) => { const bytes = s.trim().split(/\s+/).map((b) => parseInt(b, 2)); return bytes.some(Number.isNaN) ? "" : new TextDecoder().decode(new Uint8Array(bytes)); }),
  tx("texthex", "Text to hex bytes", (s) => [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, "0")).join(" ")),
  tx("unhex", "Hex bytes back to text", (s) => { const h = s.replace(/[^0-9a-f]/gi, ""); if (h.length % 2) return ""; return new TextDecoder().decode(new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)))); }),
  tx("base64", "Text to Base64", (s) => Buffer.from(s, "utf8").toString("base64"), ["b64"]),
  tx("unbase64", "Base64 back to text", (s) => Buffer.from(s.trim(), "base64").toString("utf8"), ["unb64"]),
  tx("morse", "Text to Morse code", (s) => [...s.toLowerCase()].map((c) => (c === " " ? "/" : MORSE[c] ?? "")).filter(Boolean).join(" ")),
  tx("unmorse", "Morse code back to text", (s) => s.trim().split(/\s+/).map((c) => (c === "/" ? " " : UNMORSE[c] ?? "?")).join("")),
  tx("rot13", "ROT13 (do it twice to undo)", (s) => s.replace(/[a-z]/gi, (c) => { const b = c <= "Z" ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + 13) % 26) + b); })),
  tx("atbash", "Atbash cipher (A↔Z)", (s) => s.replace(/[a-z]/gi, (c) => { const b = c <= "Z" ? 65 : 97; return String.fromCharCode(25 - (c.charCodeAt(0) - b) + b); })),
  {
    name: "caesar",
    category: "Text",
    description: "Caesar cipher: shift, then text",
    options: [o.int("shift", "How far to shift (negative to decode)"), o.str("text", "The text")],
    run: (ctx) => {
      const k = Number(ctx.opt.shift), s = str(ctx.opt.text);
      if (!Number.isInteger(k) || !s) return fail("Use it like `caesar 3 hello`.");
      return s.slice(0, MAX).replace(/[a-z]/gi, (c) => { const b = c <= "Z" ? 65 : 97; return String.fromCharCode((((c.charCodeAt(0) - b + k) % 26) + 26) % 26 + b); });
    },
  },
  tx("nato", "Spell it the NATO way", (s) => [...s.toLowerCase()].map((c) => (ABC.includes(c) ? NATO[ABC.indexOf(c)] : c === " " ? "/" : c)).join(" ")),
  tx("piglatin", "Igpay atinlay", (s) => s.replace(/\b([^\W\d_aeiou]*)([a-z]+)\b/gi, (_, c, rest) => (c ? `${rest}${c}ay` : `${rest}way`))),
  tx("slug", "turn-text-into-a-slug", (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")),
  tx("snake", "snake_case", (s) => caseWords(s).join("_")),
  tx("kebab", "kebab-case", (s) => caseWords(s).join("-")),
  tx("camel", "camelCase", (s) => caseWords(s).map((w, i) => (i ? w[0]!.toUpperCase() + w.slice(1) : w)).join("")),
  tx("pascal", "PascalCase", (s) => caseWords(s).map((w) => w[0]!.toUpperCase() + w.slice(1)).join("")),
  tx("constant", "CONSTANT_CASE", (s) => caseWords(s).join("_").toUpperCase()),
  tx("wordrev", "Words in reverse order", (s) => words(s).reverse().join(" ")),
  tx("scramble", "Shuffle the letters of each word", (s) => words(s).map((w) => [...w].sort(() => Math.random() - 0.5).join("")).join(" ")),
  tx("sortwords", "Sort words A to Z", (s) => words(s).sort((a, b) => a.localeCompare(b)).join(" ")),
  tx("dedupe", "Remove repeated words", (s) => [...new Set(words(s))].join(" ")),
  tx("acronym", "Make an acronym", (s) => words(s).map((w) => w[0]!.toUpperCase()).join("")),
  tx("zalgo", "Z̷a̸l̵g̶o̷ text (mild)", (s) => [...s].map((c) => c + (c.trim() ? String.fromCharCode(0x300 + Math.floor(Math.random() * 0x30)) + String.fromCharCode(0x316 + Math.floor(Math.random() * 0x20)) : "")).join("")),
  tx("censor", "C*****r every word", (s) => words(s).map((w) => (w.length <= 2 ? w : w[0] + "*".repeat(w.length - 2) + w.slice(-1))).join(" ")),
  tx("spoiler", "Hide each word behind a spoiler", (s) => words(s).map((w) => `||${w}||`).join(" ")),
  tx("urlencode", "Make text safe for a URL", (s) => encodeURIComponent(s)),
  tx("urldecode", "Decode URL text", (s) => { try { return decodeURIComponent(s); } catch { return ""; } }),
  tx("htmlescape", "Escape &, <, > and quotes", (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")),
  {
    name: "repeat",
    category: "Text",
    description: "Repeat text a few times",
    options: [o.int("times", "How many times (2–10)"), o.str("text", "The text")],
    run: (ctx) => {
      const n = Number(ctx.opt.times), s = str(ctx.opt.text);
      if (!Number.isInteger(n) || n < 2 || n > 10 || !s) return fail("Use it like `repeat 3 hello` (2–10 times).");
      return clip(Array(n).fill(s.slice(0, 180)).join(" "), 1990);
    },
  },
  stat("vowels", "Count vowels", (s) => `${fmt((s.match(/[aeiou]/gi) ?? []).length)} vowels`),
  stat("consonants", "Count consonants", (s) => `${fmt((s.match(/[b-df-hj-np-tv-z]/gi) ?? []).length)} consonants`),
  stat("letters", "Count letters", (s) => `${fmt((s.match(/\p{L}/gu) ?? []).length)} letters`),
  stat("longestword", "Find the longest word", (s) => { const w = words(s).sort((a, b) => b.length - a.length)[0]!; return `**${w}** (${w.length} letters)`; }),
  stat("charinfo", "Unicode details for each character", (s) => [...s].slice(0, 12).map((c) => `\`${c}\` U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`).join("\n")),
  stat("isanagram", "Are two words anagrams? (word1 word2)", (s) => { const [a, b] = words(s.toLowerCase()); if (!a || !b) return "give me two words"; const k = (w: string) => [...w].sort().join(""); return k(a) === k(b) ? `yes, **${a}** and **${b}** are anagrams` : `no, **${a}** and **${b}** aren't anagrams`; }),
];
