/**
 * Random picks, "how X are you" meters and friendly actions.
 */
import type { Command, Ctx } from "../../kit";
import { embed, fail, mention, nameOf, o, pick, rand, str } from "../../kit";

// --- Random --------------------------------------------------------------------------

const DICE = [4, 6, 8, 10, 12, 20, 100];
const listOf = (ctx: Ctx) => str(ctx.opt.items).split(/\s*[,|]\s*|\s+/).map((s) => s.trim()).filter(Boolean);

const EMOJI = ["😀", "😂", "🥹", "😎", "🤩", "🥳", "😴", "🤔", "🫠", "🤯", "🐶", "🐱", "🦊", "🐼", "🐸", "🦄", "🐙", "🦋", "🌵", "🌈", "🔥", "⭐", "🍕", "🍩", "🍓", "🎸", "🎮", "🚀", "🏆", "💎"];
const ANIMALS = ["axolotl", "capybara", "red panda", "otter", "quokka", "fennec fox", "penguin", "hedgehog", "sloth", "koala", "narwhal", "manatee", "pangolin", "snow leopard", "tapir", "okapi", "platypus", "meerkat", "chinchilla", "puffin"];
const COUNTRIES = ["Japan", "Brazil", "Canada", "Iceland", "Kenya", "New Zealand", "Portugal", "Mexico", "Norway", "Vietnam", "Morocco", "Peru", "Greece", "South Korea", "Finland", "Chile", "Egypt", "Ireland", "Thailand", "Australia"];
const FOODS = ["ramen", "tacos", "sushi", "pizza", "pad thai", "burritos", "pho", "lasagne", "curry", "dumplings", "falafel", "paella", "pancakes", "a burger", "fish and chips", "bibimbap", "poke bowl", "mac and cheese", "a toastie", "shakshuka"];
const FIRST = ["Alex", "Sam", "Jordan", "Riley", "Casey", "Morgan", "Jamie", "Quinn", "Avery", "Rowan", "Skyler", "Emerson", "Harper", "Finley", "Reese", "Sage", "River", "Robin", "Charlie", "Dakota"];
const SUITS = ["♠️", "♥️", "♦️", "♣️"], RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const randomCommands: Command[] = [
  ...DICE.map((n): Command => ({
    name: `d${n}`,
    category: "Random",
    description: `Roll a ${n}-sided die`,
    options: [o.int("count", "How many dice (1–20)", false)],
    run: (ctx) => {
      const count = Math.min(20, Math.max(1, Number(ctx.opt.count) || 1));
      const rolls = Array.from({ length: count }, () => rand(1, n));
      return embed({ description: `🎲 d${n}: **${rolls.join(", ")}**${count > 1 ? ` (total ${rolls.reduce((a, b) => a + b, 0)})` : ""}` });
    },
  })),
  { name: "randcolor", category: "Random", description: "A random colour", run: () => { const c = rand(0, 0xffffff); const hex = `#${c.toString(16).padStart(6, "0").toUpperCase()}`; return embed({ description: `🎨 **${hex}**`, color: c }); } },
  { name: "randemoji", category: "Random", description: "A random emoji", run: () => pick(EMOJI) },
  { name: "randanimal", category: "Random", description: "A random animal", run: () => embed({ description: `🐾 Today's animal: **${pick(ANIMALS)}**` }) },
  { name: "randletter", category: "Random", description: "A random letter", run: () => embed({ description: `🔤 **${String.fromCharCode(rand(65, 90))}**` }) },
  { name: "randcountry", category: "Random", description: "A random country to dream about", run: () => embed({ description: `🌍 **${pick(COUNTRIES)}**` }) },
  { name: "randfood", aliases: ["whattoeat"], category: "Random", description: "Can't decide what to eat?", run: () => embed({ description: `🍽️ Have **${pick(FOODS)}**.` }) },
  { name: "randname", category: "Random", description: "A random first name", run: () => embed({ description: `🪪 **${pick(FIRST)}**` }) },
  { name: "randhex", category: "Random", description: "A random hex string", options: [o.int("length", "How many characters (1–64)", false)], run: (ctx) => { const n = Math.min(64, Math.max(1, Number(ctx.opt.length) || 16)); return `\`${Array.from({ length: n }, () => rand(0, 15).toString(16)).join("")}\``; } },
  { name: "yesno", category: "Random", description: "A plain yes or no", run: () => embed({ description: pick(["✅ **Yes.**", "❌ **No.**"]) }) },
  { name: "randcard", aliases: ["drawcard"], category: "Random", description: "Draw a playing card", run: () => embed({ description: `🃏 **${pick(RANKS)}${pick(SUITS)}**` }) },
  { name: "randdate", category: "Random", description: "A random date this year", run: () => { const y = new Date().getUTCFullYear(); const d = new Date(Date.UTC(y, 0, 1) + rand(0, 364) * 86400000); return embed({ description: `📅 **${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}**` }); } },
  { name: "randtime", category: "Random", description: "A random time of day", run: () => embed({ description: `🕰️ **${String(rand(0, 23)).padStart(2, "0")}:${String(rand(0, 59)).padStart(2, "0")}**` }) },
  { name: "lottery", category: "Random", description: "Six lucky numbers from 1–59", run: () => { const s = new Set<number>(); while (s.size < 6) s.add(rand(1, 59)); return embed({ description: `🎟️ **${[...s].sort((a, b) => a - b).join(" · ")}**` }); } },
  { name: "bingo", category: "Random", description: "Call a bingo number", run: () => { const n = rand(1, 75); return embed({ description: `🔵 **${"BINGO"[Math.floor((n - 1) / 15)]}-${n}**` }); } },
  { name: "shufflelist", aliases: ["order"], category: "Random", description: "Shuffle a list (comma or space separated)", options: [o.str("items", "The items")], run: (ctx) => { const xs = listOf(ctx); if (xs.length < 2) return fail("Give me at least two things."); return embed({ description: xs.sort(() => Math.random() - 0.5).map((x, i) => `**${i + 1}.** ${x}`).join("\n") }); } },
  { name: "teams", category: "Random", description: "Split names into two teams", options: [o.str("items", "The names")], run: (ctx) => { const xs = listOf(ctx).sort(() => Math.random() - 0.5); if (xs.length < 2) return fail("Give me at least two names."); const h = Math.ceil(xs.length / 2); return embed({ fields: [{ name: "🔴 Team 1", value: xs.slice(0, h).join("\n"), inline: true }, { name: "🔵 Team 2", value: xs.slice(h).join("\n") || "—", inline: true }] }); } },
  { name: "draw", category: "Random", description: "Draw some winners: count, then the names", options: [o.int("count", "How many to draw"), o.str("items", "The names")], run: (ctx) => { const n = Number(ctx.opt.count); const xs = listOf(ctx).sort(() => Math.random() - 0.5); if (!Number.isInteger(n) || n < 1 || xs.length < n) return fail("Use it like `draw 2 amy ben cat dan`."); return embed({ description: `🏆 ${xs.slice(0, n).join(", ")}` }); } },
  { name: "dice2", aliases: ["2d6"], category: "Random", description: "Roll two six-sided dice", run: () => { const a = rand(1, 6), b = rand(1, 6); return embed({ description: `🎲🎲 **${a}** + **${b}** = **${a + b}**${a === b ? " (doubles!)" : ""}` }); } },
  { name: "spinner", category: "Random", description: "Spin a bottle and see where it points", run: () => embed({ description: `🍾 It points **${pick(["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"])}**.` }) },
];

// --- Meters ----------------------------------------------------------------------------

/** Same answer for the same person all day: it's a "reading", not a reroll. */
function dailyScore(seed: string): number {
  const day = new Date().toISOString().slice(0, 10);
  let h = 2166136261;
  for (const c of `${seed}|${day}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Math.abs(h) % 101;
}

const METERS: [name: string, emoji: string, word: string][] = [
  ["howsmart", "🧠", "smart"], ["howcute", "🥰", "cute"], ["howfunny", "😂", "funny"], ["howlucky", "🍀", "lucky"],
  ["howbrave", "🦁", "brave"], ["howkind", "💖", "kind"], ["howlazy", "🦥", "lazy"], ["howhungry", "🍔", "hungry"],
  ["howsleepy", "😴", "sleepy"], ["howweird", "🌀", "weird"], ["howfancy", "🎩", "fancy"], ["howsus", "📮", "sus"],
  ["howchill", "🧊", "chill"], ["howdramatic", "🎭", "dramatic"], ["howgenius", "💡", "genius"], ["howsweet", "🍬", "sweet"],
  ["howspicy", "🌶️", "spicy"], ["howcursed", "🕸️", "cursed"], ["howblessed", "✨", "blessed"], ["howrich", "💰", "rich"],
  ["howfamous", "🌟", "famous"], ["howloud", "📢", "loud"], ["howquiet", "🤫", "quiet"], ["howspeedy", "⚡", "speedy"],
  ["howcreative", "🎨", "creative"], ["howsporty", "⚽", "sporty"], ["howgamer", "🎮", "gamer"], ["howpunctual", "⏰", "punctual"],
  ["howstylish", "👟", "stylish"], ["howchaotic", "🌪️", "chaotic"], ["howwholesome", "🌻", "wholesome"], ["howmysterious", "🕵️", "mysterious"],
  ["howlegendary", "🏆", "legendary"], ["howpatient", "🐢", "patient"], ["howcalm", "🌊", "calm"], ["howadventurous", "🧭", "adventurous"],
  ["howmusical", "🎵", "musical"], ["howhelpful", "🤝", "helpful"], ["howcozy", "☕", "cozy"], ["howsalty", "🧂", "salty"],
];

const meterCommands: Command[] = METERS.map(([name, emoji, word]): Command => ({
  name,
  category: "Meters",
  description: `How ${word} someone is today`,
  options: [o.user("user", "Who (you, if empty)", false)],
  run: async (ctx) => {
    const p = ctx.opt.user ? await ctx.member(ctx.opt.user) : ctx.user;
    if (!p) return fail("I couldn't find them.");
    const n = dailyScore(`${name}:${p.id}`);
    const bar = "▰".repeat(Math.round(n / 10)) + "▱".repeat(10 - Math.round(n / 10));
    return embed({ description: `${emoji} **${nameOf(p)}** is **${n}%** ${word} today.\n${bar}` });
  },
}));

// --- Actions ---------------------------------------------------------------------------

type Act = [name: string, emoji: string, withSomeone: string[], alone: string];

const ACTIONS: Act[] = [
  ["hug", "🤗", ["{a} gives {b} a big warm hug.", "{a} wraps {b} in a hug."], "{a} hugs themselves. Valid."],
  ["pat", "🫳", ["{a} pats {b} on the head.", "{a} gives {b} gentle head pats."], "{a} pats the air. Bruce wags anyway."],
  ["poke", "👉", ["{a} pokes {b}. Poke.", "{a} pokes {b} to get their attention."], "{a} pokes the void."],
  ["boop", "👃", ["{a} boops {b} on the nose.", "Boop! {a} got {b}."], "{a} boops Bruce. He sneezes."],
  ["highfive", "🙌", ["{a} high-fives {b}. Nailed it.", "{a} and {b} land a perfect high five."], "{a} high-fives nobody. Respect."],
  ["fistbump", "🤜", ["{a} fist-bumps {b}. 💥", "{a} and {b} bump fists."], "{a} fist-bumps the air."],
  ["bonk", "🔨", ["{a} bonks {b} with a rolled-up newspaper.", "{a} gives {b} a gentle bonk."], "{a} bonks themselves. Ow."],
  ["slap", "👋", ["{a} slaps {b} with a wet noodle.", "{a} gives {b} a dramatic (harmless) slap."], "{a} slaps the table."],
  ["cuddle", "🫂", ["{a} cuddles up to {b}.", "{a} and {b} cuddle under a blanket."], "{a} cuddles a pillow."],
  ["nom", "😋", ["{a} noms {b}. Tasty?", "{a} pretends to nibble {b}."], "{a} noms a snack."],
  ["yeet", "🚀", ["{a} yeets {b} into orbit.", "{a} YEETS {b}."], "{a} yeets their worries away."],
  ["salute", "🫡", ["{a} salutes {b}.", "{a} gives {b} a crisp salute."], "{a} salutes everyone."],
  ["bow", "🙇", ["{a} bows to {b}.", "{a} takes a deep bow before {b}."], "{a} takes a bow."],
  ["applaud", "👏", ["{a} applauds {b}.", "{a} gives {b} a standing ovation."], "{a} applauds the whole channel."],
  ["cheer", "📣", ["{a} cheers {b} on!", "{a} waves pom-poms for {b}."], "{a} cheers loudly."],
  ["dance", "💃", ["{a} dances with {b}.", "{a} pulls {b} onto the dance floor."], "{a} busts a move."],
  ["wink", "😉", ["{a} winks at {b}.", "{a} gives {b} a sly wink."], "{a} winks at nobody in particular."],
  ["blush", "😊", ["{a} blushes because of {b}.", "{b} made {a} go pink."], "{a} blushes."],
  ["cry", "😭", ["{a} cries on {b}'s shoulder.", "{a} sobs at {b}."], "{a} has a little cry. It's okay."],
  ["laugh", "🤣", ["{a} laughs at {b}'s joke.", "{a} can't stop laughing at {b}."], "{a} bursts out laughing."],
  ["facepalm", "🤦", ["{a} facepalms at {b}.", "{b} made {a} facepalm."], "{a} facepalms."],
  ["shrug", "🤷", ["{a} shrugs at {b}.", "{a} looks at {b} and shrugs."], "{a} shrugs. ¯\\_(ツ)_/¯"],
  ["snooze", "💤", ["{a} falls asleep on {b}.", "{a} naps next to {b}."], "{a} takes a nap."],
  ["think", "🤔", ["{a} thinks hard about what {b} said.", "{a} ponders {b}."], "{a} is thinking…"],
  ["stare", "👀", ["{a} stares at {b}.", "{a} won't stop staring at {b}."], "{a} stares into the distance."],
  ["smile", "😄", ["{a} smiles at {b}.", "{b} made {a} smile."], "{a} smiles."],
  ["pout", "😤", ["{a} pouts at {b}.", "{a} gives {b} the pouty face."], "{a} pouts."],
  ["handshake", "🤝", ["{a} shakes hands with {b}.", "{a} and {b} seal the deal."], "{a} offers a handshake to anyone."],
  ["tickle", "🪶", ["{a} tickles {b}!", "{a} attacks {b} with tickles."], "{a} is ticklish."],
  ["feed", "🍪", ["{a} feeds {b} a cookie.", "{a} shares a snack with {b}."], "{a} has a snack."],
  ["protect", "🛡️", ["{a} stands guard over {b}.", "{a} protects {b} at all costs."], "{a} stands guard."],
  ["carry", "🏋️", ["{a} carries {b} to safety.", "{a} piggybacks {b}."], "{a} carries the team."],
  ["glomp", "💥", ["{a} glomps {b}!", "{a} tackle-hugs {b}."], "{a} glomps a beanbag."],
  ["nuzzle", "🐱", ["{a} nuzzles {b}.", "{a} snuggles into {b}."], "{a} nuzzles a plushie."],
  ["peek", "🫣", ["{a} peeks at {b}.", "{a} peeks around the corner at {b}."], "{a} peeks in."],
  ["sing", "🎤", ["{a} serenades {b}.", "{a} sings to {b}, mostly in tune."], "{a} sings a song."],
  ["celebrate", "🎉", ["{a} celebrates with {b}!", "{a} throws a party for {b}."], "{a} celebrates!"],
  ["welcome", "👋", ["{a} welcomes {b}! Glad you're here.", "Everyone, say hi to {b}! — {a}"], "{a} welcomes everyone."],
  ["greet", "🙋", ["{a} says hi to {b}.", "{a} waves hello to {b}."], "{a} says hi!"],
  ["bye", "👋", ["{a} waves goodbye to {b}.", "{a} says see you later to {b}."], "{a} heads off. Bye!"],
  ["gm", "🌅", ["{a} says good morning to {b}.", "Rise and shine, {b}! — {a}"], "{a} says good morning!"],
  ["gn", "🌙", ["{a} says good night to {b}.", "Sweet dreams, {b}. — {a}"], "{a} says good night!"],
  ["cheers", "🥂", ["{a} raises a glass to {b}.", "{a} and {b} clink glasses."], "{a} raises a glass. Cheers!"],
  ["wave", "👋", ["{a} waves at {b}.", "{a} waves enthusiastically at {b}."], "{a} waves."],
  ["comfort", "🧸", ["{a} comforts {b}. It's going to be okay.", "{a} sits with {b} for a while."], "{a} takes a deep breath."],
];

const actionCommands: Command[] = ACTIONS.map(([name, emoji, withSomeone, alone]): Command => ({
  name,
  category: "Actions",
  description: `${name[0]!.toUpperCase()}${name.slice(1)} someone`,
  options: [o.user("user", "Who", false)],
  run: async (ctx) => {
    const target = ctx.opt.user ? await ctx.member(ctx.opt.user) : null;
    if (ctx.opt.user && !target) return fail("I couldn't find them.");
    const a = `**${nameOf(ctx.user)}**`;
    const line = target && target.id !== ctx.user.id
      ? pick(withSomeone).replace("{a}", a).replace("{b}", `**${mention(target)}**`)
      : alone.replace("{a}", a);
    return embed({ description: `${emoji} ${line}` });
  },
}));

export const socialCommands: Command[] = [...randomCommands, ...meterCommands, ...actionCommands];
