/**
 * Jokes, facts, prompts and silly generators. All written for Bruce.
 */
import type { Command, Ctx } from "../../kit";
import { embed, fail, nameOf, o, pick, rand, str } from "../../kit";

/** A command that answers with one line from a list. */
function line(name: string, emoji: string, description: string, lines: string[], aliases?: string[]): Command {
  return { name, ...(aliases ? { aliases } : {}), category: "Fun", description, run: () => embed({ description: `${emoji} ${pick(lines)}` }) };
}

/** The same pick for the same person all day. */
function daily<T>(ctx: Ctx, salt: string, list: readonly T[]): T {
  let h = 2166136261;
  for (const c of `${salt}|${ctx.user.id}|${new Date().toISOString().slice(0, 10)}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return list[Math.abs(h) % list.length]!;
}

const LINES: [string, string, string, string[], string[]?][] = [
  ["dadjoke", "👨", "A dad joke", [
    "I only know 25 letters of the alphabet. I don't know y.", "Why don't eggs tell jokes? They'd crack each other up.",
    "I used to hate facial hair, but then it grew on me.", "What do you call a fake noodle? An impasta.",
    "I'm reading a book about anti-gravity. It's impossible to put down.", "Why did the scarecrow win an award? He was outstanding in his field.",
    "What do you call a bear with no teeth? A gummy bear.", "I would tell you a construction joke, but I'm still working on it.",
    "Why can't a bicycle stand up by itself? It's two tired.", "What did the ocean say to the beach? Nothing, it just waved.",
  ], ["dad"]],
  ["pun", "😏", "A terrible pun", [
    "I'm on a seafood diet. I see food and I eat it.", "Time flies like an arrow. Fruit flies like a banana.",
    "I was going to tell a time-travel joke, but you didn't like it.", "The math teacher called in sick with algebra.",
    "I lost my job at the bank. A woman asked me to check her balance, so I pushed her over.", "Dogs can't operate MRI machines, but catscan.",
    "I'm friends with all electricians. We have good current connections.", "Atheism is a non-prophet organisation.",
  ]],
  ["catfact", "🐱", "A cat fact", [
    "Cats sleep for around 12 to 16 hours a day.", "A group of cats is called a clowder.", "Cats can't taste sweetness.",
    "Most cats have five toes on their front paws and four on the back.", "A cat's purr vibrates at about 25 to 150 Hz.",
    "Cats have a third eyelid called the nictitating membrane.", "Cats walk like camels and giraffes: both right feet, then both left.",
  ]],
  ["dogfact", "🐶", "A dog fact (Bruce approved)", [
    "A dog's sense of smell is tens of thousands of times stronger than ours.", "Dogs sweat through the pads of their paws.",
    "Every dog's nose print is unique, like a fingerprint.", "Dogs can understand around 150 to 250 words.",
    "Dalmatian puppies are born completely white.", "Dogs dream, just like people do.", "A wagging tail to the right usually means a happy dog.",
  ]],
  ["spacefact", "🪐", "A space fact", [
    "A day on Venus is longer than its year.", "Neutron stars are so dense a teaspoon would weigh about a billion tonnes.",
    "There are more trees on Earth than stars in the Milky Way, by most estimates.", "Footprints on the Moon could last millions of years.",
    "Jupiter's Great Red Spot is a storm bigger than Earth.", "Light from the Sun takes about 8 minutes to reach us.", "Saturn would float in a big enough bathtub.",
  ]],
  ["oceanfact", "🌊", "An ocean fact", [
    "Over 80% of the ocean has never been mapped in detail.", "Octopuses have three hearts and blue blood.",
    "The Pacific is bigger than all the land on Earth put together.", "Some sea turtles can hold their breath for hours while resting.",
    "Blue whales are the largest animals known to have lived.", "Sea otters hold hands while they sleep so they don't drift apart.",
  ]],
  ["foodfact", "🍯", "A food fact", [
    "Honey never really goes off.", "Bananas are berries, but strawberries aren't.", "Peanuts aren't nuts; they're legumes.",
    "Carrots used to be mostly purple.", "Apples float because they're about a quarter air.", "Ketchup was sold as a medicine in the 1830s.",
  ]],
  ["bodyfact", "🫀", "A human body fact", [
    "Your nose can tell apart a huge number of different smells.", "You're slightly taller in the morning than at night.",
    "Your stomach gets a new lining every few days.", "Humans share about 60% of their DNA with bananas.",
    "Your heart beats about 100,000 times a day.", "The tongue's 'taste map' is a myth: every part can taste everything.",
  ]],
  ["fortune", "🥠", "Open a fortune cookie", [
    "A pleasant surprise is waiting for you.", "Your hard work is about to pay off.", "Say yes to the next small adventure.",
    "Someone is thinking of you right now.", "A good conversation will change your week.", "You will find what you lost. Check the couch.",
    "Today is a good day to start something.", "Your kindness will come back around.",
  ]],
  ["affirmation", "🌼", "A kind word for yourself", [
    "You're doing better than you think.", "You're allowed to take up space.", "Progress, not perfection.",
    "You've survived every hard day so far.", "Rest is productive too.", "You are enough, exactly as you are.", "Small steps still count.",
  ]],
  ["advice", "🦉", "Some (mostly) good advice", [
    "Drink some water. Seriously.", "If it takes less than two minutes, do it now.", "Sleep on big decisions.",
    "Write it down before you forget it.", "Be the friend you'd want to have.", "Back up your files.", "Go outside for ten minutes.",
  ]],
  ["excuse", "🙈", "An excuse for being late", [
    "My cat sat on my keyboard and wouldn't move.", "I was stuck behind a very slow duck.", "My alarm and I had creative differences.",
    "I got lost in a really good playlist.", "The Wi-Fi and I were not on speaking terms.", "I had to finish one more level.",
  ]],
  ["topic", "💬", "Something to talk about", [
    "What's a small thing that made you happy this week?", "If you could master one skill instantly, what would it be?",
    "What's the best thing you've eaten lately?", "Which fictional world would you live in?", "What song is stuck in your head?",
    "What's a hobby you'd love to try?", "What's the most useless talent you have?", "Mountains or beach?",
  ], ["conversation"]],
  ["truth", "🗣️", "A truth question", [
    "What's the last thing you searched for?", "What's your most embarrassing nickname?", "What's a food you secretly hate?",
    "Who was your first celebrity crush?", "What's the longest you've gone without showering?", "What's something you've never told this server?",
  ]],
  ["dare", "😈", "A (harmless) dare", [
    "Change your status to something silly for an hour.", "Send the last emoji you used, five times.", "Talk only in questions for the next three messages.",
    "Compliment the last person who spoke.", "Use a terrible pun in your next message.", "Share your current wallpaper.",
  ]],
  ["hottake", "🌶️", "A hot take to argue about", [
    "Cereal is a soup.", "Pineapple belongs on pizza.", "Socks with sandals are fine.", "Water is the best drink.",
    "Cold pizza beats hot pizza.", "Breakfast for dinner is the best dinner.", "The sequel was better.",
  ]],
  ["thisorthat", "⚖️", "Pick one", [
    "Cats or dogs?", "Sunrise or sunset?", "Books or films?", "Sweet or savoury?", "Summer or winter?", "Call or text?", "Tea or coffee?", "Early bird or night owl?",
  ]],
  ["tonguetwister", "👅", "A tongue twister", [
    "Red lorry, yellow lorry.", "Six slippery snails slid slowly seaward.", "Unique New York, you know you need unique New York.",
    "Fred fed Ted bread and Ted fed Fred bread.", "Toy boat. Toy boat. Toy boat.", "Irish wristwatch, Swiss wristwatch.",
  ]],
  ["superpower", "🦸", "Your random superpower", [
    "Your superpower: talking to animals.", "Your superpower: never losing your keys.", "Your superpower: perfect pitch.", "Your superpower: instant naps.", "Your superpower: always finding the shortest queue.",
    "Your superpower: knowing every song's lyrics.", "Your superpower: teleporting… but only one metre.", "Your superpower: making any plant thrive.",
  ]],
  ["showerthought", "🚿", "A shower thought", [
    "Your stomach thinks all potatoes are mashed.", "Nobody knows what you look like when you're not looking in a mirror.",
    "The word 'bed' looks like a bed.", "You've never seen your own face, only reflections and pictures.",
    "Clapping is just hitting yourself because you like something.", "Fridges are just cupboards that are always cold.",
  ]],
  ["brainteaser", "🧩", "A quick brain teaser (answer hidden)", [
    "What has keys but can't open locks? ||A piano||", "What gets wetter the more it dries? ||A towel||",
    "What has a neck but no head? ||A bottle||", "What can you catch but not throw? ||A cold||",
    "The more you take, the more you leave behind. What are they? ||Footsteps||", "What has one eye but can't see? ||A needle||",
  ]],
  ["motivation", "💪", "A push to keep going", [
    "Start where you are. Use what you have.", "One more try.", "Done is better than perfect.", "Future you will thank you.",
    "You don't have to see the whole staircase, just the next step.", "Tiny progress is still progress.",
  ], ["motivate"]],
  ["wisdom", "🐾", "Bruce's dog wisdom", [
    "If you can't eat it or play with it, sniff it and walk away.", "Naps fix most things.", "Greet everyone like they've been gone for years.",
    "Never pass up a walk.", "When in doubt, wag.", "Dig it up, then decide.", "The best toy is the one someone else has.",
  ], ["brucewisdom"]],
  ["icebreaker", "🧊", "An icebreaker question", [
    "What's your go-to karaoke song?", "What's the best advice you've ever got?", "What would your autobiography be called?",
    "What's a skill you're proud of?", "What's your comfort film?", "If you had a theme song, what would it be?",
  ]],
  ["bucketlist", "🗺️", "A bucket list idea", [
    "See the northern lights.", "Learn to cook one dish really well.", "Swim in the sea at night.", "Visit a country where you don't speak the language.",
    "Plant a tree.", "Watch a sunrise from a mountain.", "Write a letter to future you.",
  ]],
  ["hobby", "🎯", "A hobby to try", [
    "Try baking bread.", "Try bouldering.", "Try learning the ukulele.", "Try film photography.", "Try birdwatching.", "Try knitting.", "Try pixel art.", "Try chess.", "Try gardening.", "Try journaling.",
  ]],
  ["snackidea", "🍿", "What to snack on", [
    "Snack on apple slices and peanut butter.", "Snack on popcorn.", "Snack on a cheese toastie.", "Snack on hummus and crackers.", "Snack on frozen grapes.", "Snack on a handful of nuts.", "Snack on toast with honey.",
  ]],
  ["mood", "🎭", "Today's mood", [
    "Today's mood: main character energy.", "Today's mood: running on snacks.", "Today's mood: quietly thriving.", "Today's mood: chaotic but kind.", "Today's mood: cosy mode.", "Today's mood: one more episode.", "Today's mood: unbothered.",
  ]],
  ["dilemma", "🤹", "A tough choice", [
    "Always be 10 minutes late, or always be 20 minutes early?", "Have a rewind button or a pause button for life?",
    "Only whisper, or only shout?", "Never use social media again, or never watch films again?", "Fight one horse-sized duck, or 100 duck-sized horses?",
  ]],
  ["pickupline", "😚", "A wholesome pickup line", [
    "Are you a campfire? Because you're hot and I want s'more.", "Do you have a map? I keep getting lost in this conversation.",
    "Are you Wi-Fi? Because I'm feeling a connection.", "If you were a vegetable, you'd be a cute-cumber.",
    "Are you a bank loan? Because you've got my interest.", "Is your name Google? You have everything I've been searching for.",
  ]],
  ["encourage", "📣", "Some encouragement", [
    "You've got this.", "Proud of you for showing up today.", "Hard things are hard. You're doing them anyway.",
    "Keep going, you're closer than you think.", "Whatever happens, you tried, and that counts.", "Be gentle with yourself today.",
  ]],
  ["gratitude", "🙏", "A gratitude prompt", [
    "Name one person who made your week better.", "What's something small you're glad you have?", "What made you laugh recently?",
    "Which place makes you feel at home?", "What's a skill you're thankful you learned?", "What's something your body did for you today?",
  ]],
  ["funfact", "🤓", "A random fun fact", [
    "A bolt of lightning is about five times hotter than the surface of the Sun.", "The Eiffel Tower grows a little taller in summer heat.",
    "Wombat poo is cube-shaped.", "Butterflies taste with their feet.", "A cloud can weigh more than a million kilograms.",
    "Sloths can hold their breath longer than dolphins.", "Scotland's national animal is the unicorn.",
  ]],
  ["emojistory", "📖", "A tiny story in emojis", [
    "🐶🦴🏃‍♂️💨🌳😴", "👩‍🍳🍳🔥🚒😅", "🚀🌕👽🤝🍕", "🌧️☂️💨😱🏠☕", "🎸🎤🔥👏🏆", "📦🐱😺📦📦📦",
  ]],
];

/** "{word} {word}" style name generators. */
function generator(name: string, emoji: string, description: string, parts: string[][], join = " "): Command {
  return { name, category: "Fun", description, run: () => embed({ description: `${emoji} **${parts.map((p) => pick(p)).join(join)}**` }) };
}

const lineCommands: Command[] = LINES.map(([name, emoji, description, lines, aliases]) => line(name, emoji, description, lines, aliases));

const genCommands: Command[] = [
  generator("bandname", "🎸", "A name for your band", [["The", "Electric", "Midnight", "Velvet", "Neon", "Paper", "Cosmic", "Wild"], ["Pancakes", "Owls", "Static", "Teacups", "Comets", "Lanterns", "Foxes", "Echoes"]]),
  generator("villainname", "🦹", "Your supervillain name", [["Doctor", "Captain", "Baron", "Lady", "The Great", "Professor"], ["Chaos", "Spoon", "Thunder", "Mayhem", "Static", "Gloom", "Sprinkles"]]),
  generator("startupidea", "💡", "A startup idea", [["Uber", "Netflix", "Spotify", "Airbnb", "Tinder"], ["for houseplants", "for dogs", "for lost socks", "for naps", "for grandparents", "for leftovers"]]),
  generator("movieplot", "🎬", "A film pitch", [["A retired chef", "A shy robot", "Two rival bakers", "A lost penguin", "A teenage wizard"], ["must save", "accidentally steals", "falls in love with", "races to find"], ["the last pizza on Earth.", "a talking fridge.", "the Moon.", "their grandmother's recipe."]]),
  generator("quest", "⚔️", "A quest for today", [["Find", "Rescue", "Deliver", "Defeat", "Befriend"], ["a golden spoon", "the office plant", "a grumpy goose", "the last biscuit", "a lost sock"], ["before sunset.", "using only kindness.", "with a trusted friend.", "without being seen."]]),
  generator("recipeidea", "🍲", "Something to cook", [["Spicy", "Creamy", "Crispy", "Smoky", "Zesty"], ["chicken", "tofu", "mushroom", "chickpea", "salmon", "halloumi"], ["noodles", "tacos", "curry", "traybake", "wraps", "risotto"]]),
  generator("forecast", "🌦️", "A (completely made-up) forecast", [["Sunny", "Drizzly", "Windy", "Foggy", "Snowy"], ["with a chance of", "followed by", "and scattered"], ["pancakes.", "good news.", "naps.", "cats.", "plot twists."]]),
  {
    name: "shipname",
    category: "Fun",
    description: "Blend two names into a ship name",
    options: [o.str("first", "First name"), o.str("second", "Second name")],
    run: (ctx) => {
      const a = str(ctx.opt.first).trim(), b = str(ctx.opt.second).trim();
      if (!a || !b) return fail("Give me two names, like `shipname romeo juliet`.");
      const name = a.slice(0, Math.ceil(a.length / 2)) + b.slice(Math.floor(b.length / 2));
      return embed({ description: `💞 **${name[0]!.toUpperCase()}${name.slice(1).toLowerCase()}**` });
    },
  },
  {
    name: "nickname",
    category: "Fun",
    description: "A nickname for someone",
    options: [o.user("user", "Who (you, if empty)", false)],
    run: async (ctx) => {
      const p = ctx.opt.user ? await ctx.member(ctx.opt.user) : ctx.user;
      if (!p) return fail("I couldn't find them.");
      return embed({ description: `🏷️ **${nameOf(p)}** is now **${pick(["Big", "Lil", "Captain", "Sir", "Agent", "Professor", "DJ"])} ${pick(["Biscuit", "Noodle", "Sparkle", "Thunder", "Pickles", "Waffles", "Comet"])}**.` });
    },
  },
  {
    name: "haiku",
    category: "Fun",
    description: "A tiny (made-up) haiku",
    run: () => embed({ description: `🍃 *${pick(["Morning coffee steams", "Quiet server hum", "Bruce chases a leaf", "Rain on the window"])}*\n*${pick(["the cursor blinks, still waiting", "someone types and then stops typing", "a notification glows", "the dog dreams of endless walks"])}*\n*${pick(["soft light, then a ping", "and the moon says hi", "time for one more nap", "the kettle agrees"])}*` }),
  },
  { name: "spiritanimal", category: "Fun", description: "Your spirit animal (for today)", run: (ctx) => embed({ description: `🦊 ${nameOf(ctx.user)}'s spirit animal today is **${daily(ctx, "spirit", ["an otter", "a fox", "a sleepy cat", "a wise owl", "a golden retriever", "a capybara", "a hummingbird", "a turtle", "a raccoon", "a dolphin"])}**.` }) },
  { name: "luckynumber", category: "Fun", description: "Your lucky number today", run: (ctx) => embed({ description: `🍀 Your lucky number today is **${daily(ctx, "num", Array.from({ length: 99 }, (_, i) => i + 1))}**.` }) },
  { name: "luckycolor", aliases: ["luckycolour"], category: "Fun", description: "Your lucky colour today", run: (ctx) => embed({ description: `🎨 Your lucky colour today is **${daily(ctx, "col", ["teal", "sunflower yellow", "lavender", "coral", "forest green", "midnight blue", "peach", "crimson", "mint", "gold"])}**.` }) },
  {
    name: "dogyears",
    category: "Fun",
    description: "Your age in dog years (Bruce's maths)",
    options: [o.num("age", "Your age in years")],
    run: (ctx) => {
      const a = Number(ctx.opt.age);
      if (!Number.isFinite(a) || a < 0 || a > 150) return fail("Give me an age in years.");
      // The common rule of thumb: 15 for the first year, 9 for the second, then 5 a year.
      const dog = a <= 1 ? a * 15 : a <= 2 ? 15 + (a - 1) * 9 : 24 + (a - 2) * 5;
      return embed({ description: `🐶 **${a}** human years ≈ **${Math.round(dog)}** dog years.` });
    },
  },
  {
    name: "barkback",
    aliases: ["woofwoof"],
    category: "Fun",
    description: "Bruce barks back a few times",
    options: [o.int("times", "How many barks (1–10)", false)],
    run: (ctx) => {
      const n = Math.min(10, Math.max(1, Number(ctx.opt.times) || rand(1, 4)));
      return embed({ description: `🐶 ${Array(n).fill("Woof!").join(" ")}` });
    },
  },
];

export const funMoreCommands: Command[] = [...lineCommands, ...genCommands];
