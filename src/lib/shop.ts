/**
 * The Disband Shop catalogue.
 *
 * Presentation and stable ownership IDs. Checkout prices come from the
 * server-side shop_items table; keep the catalogue migration in sync.
 */

export type ShopCategory = "name" | "ring" | "overlay";

export interface CosmeticArt {
  still: string;
  animated: string;
  /** Canvas size relative to the avatar diameter, calibrated to its opening. */
  scale?: number;
  /** Vertical correction in avatar diameters. */
  offsetY?: number;
}

export type FlightDesign = "aurelian" | "nightflight" | "roseling";
export type SketchDesign = "graphite" | "blue-note" | "margins" | "red-thread";

export interface ShopItem {
  /** Stable slug. Stored on the profile when equipped; never renumber these. */
  id: string;
  name: string;
  description: string;
  category: ShopCategory;
  /** Minimum $2, per product decision. */
  priceCents: number;
  /**
   * Live sale price from the database (`shop_items.sale_price_cents`), merged
   * in by the storefront. Never set by hand: the server is the only writer,
   * and checkout charges it only after revalidating it against the row.
   */
  salePriceCents?: number | null;
  /** The CSS class that renders it, when there is no artwork. */
  className: string;
  /**
   * Authored artwork, as a path under /public — the preferred renderer.
   *
   * Drop a .lottie or .json export at this path and the effect switches from
   * the generated fallback to the real thing with no other change. Everything
   * that renders a cosmetic checks here first.
   */
  lottie?: string;
  /** Decorations mount over the avatar rather than behind it. */
  overAvatar?: boolean;
  art?: CosmeticArt;
  collection?: string;
  /** Illustrated atlas with separately hinged wings, jewelry, and accents. */
  flight?: FlightDesign;
  sketch?: SketchDesign;
}

/** Where shop artwork lives. Keep exports named after the item id. */
export const LOTTIE_DIR = "/shop/lottie";

/** The artwork path for an item, if it has one. */
export function lottieSrc(id: string | null | undefined): string | null {
  return shopItem(id)?.lottie ?? null;
}

export const SHOP_CATEGORIES: { id: ShopCategory; label: string; blurb: string }[] = [
  {
    id: "name",
    label: "Name effects",
    blurb: "Animate your display name wherever it appears.",
  },
  {
    id: "ring",
    label: "Avatar decorations",
    blurb: "Illustrated, animated frames that travel with your avatar.",
  },
  {
    id: "overlay",
    label: "Profile skins",
    blurb: "Animated artwork around your profile, with room for your story.",
  },
];

/* ------------------------------------------------------------------ name */

const NAME_EFFECTS: ShopItem[] = [
  { id: "name-shimmer", name: "Shimmer", description: "A slow band of light travelling across the letters.", priceCents: 200, className: "fx-name-shimmer", category: "name" },
  { id: "name-rainbow", name: "Rainbow", description: "The full spectrum, cycling gently.", priceCents: 250, className: "fx-name-rainbow", category: "name" },
  { id: "name-aurora", name: "Aurora", description: "Green and violet drifting like northern lights.", priceCents: 300, className: "fx-name-aurora", category: "name" },
  { id: "name-ember", name: "Ember", description: "Warm coals fading from amber to red.", priceCents: 250, className: "fx-name-ember", category: "name" },
  { id: "name-frost", name: "Frost", description: "Pale blue with a cold glint.", priceCents: 250, className: "fx-name-frost", category: "name" },
  { id: "name-neon", name: "Neon", description: "A tube sign with an honest flicker.", priceCents: 300, className: "fx-name-neon", category: "name" },
  { id: "name-glitch", name: "Glitch", description: "Channel-split judder, once every few seconds.", priceCents: 350, className: "fx-name-glitch", category: "name" },
  { id: "name-chrome", name: "Chrome", description: "Polished metal with a moving highlight.", priceCents: 300, className: "fx-name-chrome", category: "name" },
  { id: "name-wave", name: "Wave", description: "Letters rising and falling in sequence.", priceCents: 300, className: "fx-name-wave", category: "name" },
  { id: "name-pulse", name: "Pulse", description: "A steady breath of brightness.", priceCents: 200, className: "fx-name-pulse", category: "name" },
  { id: "name-gold", name: "Gold leaf", description: "Struck gold with a slow sheen.", priceCents: 350, className: "fx-name-gold", category: "name" },
  { id: "name-toxic", name: "Toxic", description: "Acid green with a faint radioactive glow.", priceCents: 250, className: "fx-name-toxic", category: "name" },
  { id: "name-sunset", name: "Sunset", description: "Orange into pink into deep blue.", priceCents: 250, className: "fx-name-sunset", category: "name" },
  { id: "name-vhs", name: "VHS", description: "Tracking lines and a red/blue fringe.", priceCents: 350, className: "fx-name-vhs", category: "name" },
  { id: "name-starlight", name: "Starlight", description: "Cool white with points of light passing through.", priceCents: 300, className: "fx-name-starlight", category: "name" },
];

/* ------------------------------------------------------------------ ring */

const AVATAR_RINGS: ShopItem[] = [
  { id: "ring-orbit", name: "Orbit", description: "A single point circling your avatar.", priceCents: 400, className: "fx-ring-orbit", category: "ring" },
  { id: "ring-conic", name: "Prism", description: "A conic sweep of colour, turning faster on hover.", priceCents: 450, className: "fx-ring-conic", category: "ring" },
  { id: "ring-pulse", name: "Sonar", description: "Rings that expand outward and fade.", priceCents: 400, className: "fx-ring-pulse", category: "ring" },
  { id: "ring-flame", name: "Flame", description: "A flickering edge of fire.", priceCents: 500, className: "fx-ring-flame", category: "ring" },
  { id: "ring-frost", name: "Glacier", description: "Cold blue with a crystalline shimmer.", priceCents: 450, className: "fx-ring-frost", category: "ring" },
  { id: "ring-dashed", name: "Rotary", description: "A dashed ring that spins up when hovered.", priceCents: 300, className: "fx-ring-dashed", category: "ring" },
  { id: "ring-glow", name: "Halo", description: "A soft bloom in your accent colour.", priceCents: 300, className: "fx-ring-glow", category: "ring" },
  { id: "ring-aurora", name: "Aurora ring", description: "Slow green and violet curtains.", priceCents: 500, className: "fx-ring-aurora", category: "ring" },
  { id: "ring-sparkle", name: "Sparkle", description: "Small lights that catch at the edge.", priceCents: 450, className: "fx-ring-sparkle", category: "ring" },
  { id: "ring-gold", name: "Laurel", description: "A heavy gold band with a travelling sheen.", priceCents: 550, className: "fx-ring-gold", category: "ring" },
  { id: "ring-void", name: "Void", description: "Deep purple that drinks the light around it.", priceCents: 500, className: "fx-ring-void", category: "ring" },
  { id: "ring-circuit", name: "Circuit", description: "Traces of current running the circumference.", priceCents: 550, className: "fx-ring-circuit", category: "ring" },
  { id: "ring-bubble", name: "Soap", description: "An iridescent film, like a bubble's surface.", priceCents: 450, className: "fx-ring-bubble", category: "ring" },
  { id: "ring-static", name: "Static", description: "A restless, noisy border.", priceCents: 350, className: "fx-ring-static", category: "ring" },
];

/* --------------------------------------------------------------- overlay */

/**
 * Overlays. The ones with an authored scene in
 * components/shop/effects/ProfileEffect.tsx are drawn SVG with their own
 * choreography; the rest are still the older CSS-gradient pass and are due the
 * same treatment. `hasScene` is what the renderer keys off.
 */
const PROFILE_EFFECTS: ShopItem[] = [
  { id: "fx-hydro", name: "Hydro Bloom", description: "Water gathers below and rises in heavy blobs that stretch and burst.", priceCents: 800, className: "fx-overlay-plain", category: "overlay" },
  { id: "fx-starfall", name: "Starfall", description: "A turning field of stars, with meteors that streak across on their own time.", priceCents: 750, className: "fx-overlay-plain", category: "overlay" },
  { id: "fx-tempest", name: "Tempest", description: "Rain on a hard slant, lit every so often by a forked bolt.", priceCents: 900, className: "fx-overlay-plain", category: "overlay" },
  { id: "fx-rune", name: "Arcane Circle", description: "Two rune rings turning against each other around a breathing sigil.", priceCents: 900, className: "fx-overlay-plain", category: "overlay" },
  { id: "fx-snow", name: "Snowfall", description: "Flakes drifting down the card.", priceCents: 500, className: "fx-overlay-snow", category: "overlay" },
  { id: "fx-embers", name: "Embers", description: "Sparks rising from the bottom edge.", priceCents: 550, className: "fx-overlay-embers", category: "overlay" },
  { id: "fx-stars", name: "Stardust", description: "A slow field of turning stars.", priceCents: 500, className: "fx-overlay-stars", category: "overlay" },
  { id: "fx-rain", name: "Rain", description: "Fine rain across the whole card.", priceCents: 500, className: "fx-overlay-rain", category: "overlay" },
  { id: "fx-petals", name: "Petals", description: "Blossom falling and turning.", priceCents: 600, className: "fx-overlay-petals", category: "overlay" },
  { id: "fx-matrix", name: "Cascade", description: "Green characters running down.", priceCents: 650, className: "fx-overlay-matrix", category: "overlay" },
  { id: "fx-bubbles", name: "Bubbles", description: "Bubbles rising and wobbling.", priceCents: 500, className: "fx-overlay-bubbles", category: "overlay" },
  { id: "fx-fireflies", name: "Fireflies", description: "Lights wandering and blinking out.", priceCents: 600, className: "fx-overlay-fireflies", category: "overlay" },
  { id: "fx-aurora", name: "Aurora veil", description: "Curtains of light across the top.", priceCents: 700, className: "fx-overlay-aurora", category: "overlay" },
  { id: "fx-confetti", name: "Confetti", description: "Paper falling and tumbling.", priceCents: 550, className: "fx-overlay-confetti", category: "overlay" },
  { id: "fx-scanline", name: "Scanlines", description: "A CRT roll passing down the card.", priceCents: 450, className: "fx-overlay-scanline", category: "overlay" },
  { id: "fx-sakura-night", name: "Night bloom", description: "Petals and fireflies together, after dark.", priceCents: 800, className: "fx-overlay-sakura-night", category: "overlay" },
];

export const FLIGHT_COLLECTIONS = [
  { id: "aurelian", name: "Aurelian", line: "A little room to spread your wings.", description: "Ivory feathers open in a slow wingbeat. An opal pendant swings beneath a gold frame.", ringId: "ring-aurelian", profileId: "fx-aurelian", color: "#ecd6a1", surface: "#302c26", ringPrice: 499, profilePrice: 649 },
  { id: "nightflight", name: "Nightflight", line: "Made for your midnight hours.", description: "Violet bat wings fold and unfurl, with a swinging crescent and scattered starlight.", ringId: "ring-nightflight", profileId: "fx-nightflight", color: "#bea5eb", surface: "#262032", ringPrice: 449, profilePrice: 599 },
  { id: "roseling", name: "Roseling", line: "Something soft. Something alive.", description: "Rose butterfly wings flutter in pairs. A little heart charm sways among drifting petals.", ringId: "ring-roseling", profileId: "fx-roseling", color: "#efb2bf", surface: "#35252b", ringPrice: 399, profilePrice: 549 },
] as const;

const ILLUSTRATED_COLLECTIONS = [
  { id: "tideglass", name: "Tideglass", line: "A little ocean. All yours.", description: "Pearlescent waves, sea-glass blues, and a shell tucked into the tide.", ringId: "ring-bubble", profileId: "fx-hydro", color: "#8adeec", surface: "#142d37" },
  { id: "moonmoth", name: "Moonmoth", line: "For the after-hours crowd.", description: "Violet wings, tiny moon charms, and a garden that wakes up after dark.", ringId: "ring-gold", profileId: "fx-sakura-night", color: "#c9b1f2", surface: "#2a213d" },
  { id: "emberwing", name: "Emberwing", line: "Leave a warm impression.", description: "Copper feathers and sunstone details, with a quiet flicker of fire.", ringId: "ring-flame", profileId: "fx-embers", color: "#f6b184", surface: "#3a2421" },
] as const;

export const SKETCH_COLLECTIONS = [
  { id: "graphite", name: "Graphite", line: "Just a little pencil work.", description: "Loose pencil circles with a quiet, hand-drawn flicker. Simple enough to wear every day.", ringId: "ring-graphite", profileId: null, color: "#dbd8d0", surface: "#292b2d", price: 200 },
  { id: "blue-note", name: "Blue Note", line: "From the corner of your notebook.", description: "A fine blue-ink loop, a little star, and a short underline that draws itself back in.", ringId: "ring-blue-note", profileId: null, color: "#9fbff0", surface: "#222b36", price: 249 },
  { id: "margins", name: "Margins", line: "A small mark of your own.", description: "Four imperfect chalk brackets. Tiny registration marks appear one at a time around your picture.", ringId: "ring-margins", profileId: null, color: "#d9d5be", surface: "#2e2d28", price: 249 },
  { id: "red-thread", name: "Red Thread", line: "One line. A little connection.", description: "A thin red sketch loop with a hand-tied knot. A short highlight slowly follows the thread.", ringId: "ring-red-thread", profileId: null, color: "#eaa1a0", surface: "#342627", price: 299 },
] as const;

export const ART_COLLECTIONS = [...SKETCH_COLLECTIONS, ...FLIGHT_COLLECTIONS, ...ILLUSTRATED_COLLECTIONS];

const SKETCH_ITEMS: ShopItem[] = SKETCH_COLLECTIONS.map((collection) => ({
  id: collection.ringId, name: collection.name, description: collection.description,
  category: "ring", priceCents: collection.price, className: "fx-ring-art",
  overAvatar: true, sketch: collection.id, collection: collection.id,
}));

const FLIGHT_ITEMS: ShopItem[] = FLIGHT_COLLECTIONS.flatMap((collection) => [
  { id: collection.ringId, name: collection.name, description: collection.description, category: "ring", priceCents: collection.ringPrice, className: "fx-ring-art", overAvatar: true, flight: collection.id, collection: collection.id },
  { id: collection.profileId, name: `${collection.name} · Profile skin`, description: collection.description, category: "overlay", priceCents: collection.profilePrice, className: "fx-overlay-art", flight: collection.id, collection: collection.id },
]);

const ART_UPGRADES = new Map<string, Partial<ShopItem>>(
  ILLUSTRATED_COLLECTIONS.flatMap((collection) => {
    const art = (kind: "ring" | "profile"): CosmeticArt => ({
      still: `/shop/art/${collection.id}-${kind}.webp`,
      animated: `/shop/art/${collection.id}-${kind}.animated.webp`,
      ...(kind === "ring" ? {
        scale: collection.id === "tideglass" ? 1.50 : 1.58,
        offsetY: collection.id === "moonmoth" ? .07 : collection.id === "emberwing" ? .025 : -.015,
      } : {}),
    });
    return [
      [collection.ringId, { name: collection.name, description: collection.description, collection: collection.id, art: art("ring"), overAvatar: true, className: "fx-ring-art" }],
      [collection.profileId, { name: `${collection.name} · Profile skin`, description: collection.description, collection: collection.id, art: art("profile"), className: "fx-overlay-art" }],
    ] as [string, Partial<ShopItem>][];
  }),
);

// Stable IDs preserve previous purchases. Older effects remain wearable but
// are no longer offered to new buyers until they receive finished artwork.
export const SHOP_ITEMS: ShopItem[] = [...SKETCH_ITEMS, ...FLIGHT_ITEMS, ...NAME_EFFECTS, ...AVATAR_RINGS, ...PROFILE_EFFECTS]
  .map((item) => ({ ...item, ...ART_UPGRADES.get(item.id) }));

export function isShopItemAvailable(item: ShopItem): boolean {
  return item.category === "name" || !!item.art || !!item.flight || !!item.sketch;
}

const BY_ID = new Map(SHOP_ITEMS.map((i) => [i.id, i]));

export function shopItem(id: string | null | undefined): ShopItem | null {
  if (!id) return null;
  return BY_ID.get(id) ?? null;
}

export function itemsIn(category: ShopCategory): ShopItem[] {
  return SHOP_ITEMS.filter((i) => i.category === category);
}

/** The class to hang on an element for `id`, or "" when nothing is equipped. */
export function effectClass(id: string | null | undefined): string {
  return shopItem(id)?.className ?? "";
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * What an item actually costs. A sale price only counts when it is positive
 * and strictly below the regular price — anything else is treated as no
 * sale, so a bad database value can never raise a price or zero one out.
 * Checkout re-runs this same check server-side; the client copy is display.
 */
export function effectivePriceCents(priceCents: number, salePriceCents: number | null | undefined): number {
  if (
    typeof salePriceCents === "number" &&
    Number.isSafeInteger(salePriceCents) &&
    salePriceCents > 0 &&
    salePriceCents < priceCents
  ) {
    return salePriceCents;
  }
  return priceCents;
}
