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

export const ART_COLLECTIONS = [
  { id: "tideglass", name: "Tideglass", line: "A little ocean. All yours.", description: "Pearlescent waves, sea-glass blues, and a shell tucked into the tide.", ringId: "ring-bubble", profileId: "fx-hydro", color: "#8adeec", surface: "#142d37" },
  { id: "moonmoth", name: "Moonmoth", line: "For the after-hours crowd.", description: "Violet wings, tiny moon charms, and a garden that wakes up after dark.", ringId: "ring-gold", profileId: "fx-sakura-night", color: "#c9b1f2", surface: "#2a213d" },
  { id: "emberwing", name: "Emberwing", line: "Leave a warm impression.", description: "Copper feathers and sunstone details, with a quiet flicker of fire.", ringId: "ring-flame", profileId: "fx-embers", color: "#f6b184", surface: "#3a2421" },
] as const;

const ART_UPGRADES = new Map<string, Partial<ShopItem>>(
  ART_COLLECTIONS.flatMap((collection) => {
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
export const SHOP_ITEMS: ShopItem[] = [...NAME_EFFECTS, ...AVATAR_RINGS, ...PROFILE_EFFECTS]
  .map((item) => ({ ...item, ...ART_UPGRADES.get(item.id) }));

export function isShopItemAvailable(item: ShopItem): boolean {
  return item.category === "name" || !!item.art;
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
