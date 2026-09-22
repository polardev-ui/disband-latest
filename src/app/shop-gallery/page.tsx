"use client";

import { useState } from "react";
import { ProfileOverlay } from "@/components/shop/ProfileOverlay";
import { PROFILE_SCENES } from "@/components/shop/effects/ProfileEffect";
import { DECORATIONS } from "@/components/shop/effects/Decorations";
import { LottieEffect } from "@/components/shop/effects/LottieEffect";
import { SHOP_CATEGORIES, formatPrice, itemsIn, type ShopItem } from "@/lib/shop";

/**
 * Every cosmetic in the shop, on one page.
 *
 * Not a mock: each tile renders the same component the app renders, so this
 * doubles as the place to check a new effect before it ships. Rings and
 * overlays change on hover, so the page says so rather than leaving you to
 * find out.
 */
export default function ShopGalleryPage() {
  const [name, setName] = useState("polar");

  return (
    <main className="min-h-screen bg-bg-primary px-6 py-8 text-text-normal">
      <header className="mx-auto mb-8 max-w-6xl">
        <h1 className="text-2xl font-bold">Disband Shop — every cosmetic</h1>
        <p className="mt-1 text-sm text-text-muted">
          {itemsIn("name").length} name effects · {itemsIn("ring").length} avatar rings ·{" "}
          {itemsIn("overlay").length} profile effects. Hover a ring or a profile card to see
          what it does — that is where each one changes.
        </p>
        <label className="mt-4 flex w-fit items-center gap-2 text-sm text-text-muted">
          Preview name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md bg-bg-secondary px-3 py-1.5 text-sm text-text-normal outline-none focus:ring-2 focus:ring-brand"
          />
        </label>
      </header>

      {/* Proves the Lottie path renders before any real artwork exists. */}
      <section className="mx-auto mb-12 max-w-6xl">
        <h2 className="text-lg font-bold">Lottie pipeline</h2>
        <p className="mb-4 text-sm text-text-muted">
          A wiring test, not artwork. Drop a real .lottie or .json export into
          public/shop/lottie and name it on the catalogue entry, and it renders here and
          on profiles with no other change.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <article className="rounded-xl border border-divider bg-bg-secondary p-3">
            <div className="relative h-44 overflow-hidden rounded-lg bg-[#16181d]">
              <LottieEffect src="/shop/lottie/wiring-test.json" />
            </div>
            <p className="mt-2 text-sm font-semibold">wiring-test.json</p>
          </article>
          <article className="rounded-xl border border-divider bg-bg-secondary p-3">
            <div className="flex h-44 items-center justify-center rounded-lg bg-bg-primary">
              <span className="relative flex h-24 w-24 items-center justify-center rounded-full bg-bg-accent text-xl font-bold">
                {name.charAt(0).toUpperCase() || "?"}
                <span className="pointer-events-none absolute" style={{ width: "150%", height: "150%", left: "-25%", top: "-25%" }}>
                  <LottieEffect src="/shop/lottie/wiring-test.json" />
                </span>
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold">…as an avatar decoration</p>
          </article>
        </div>
      </section>

      {/* Drawn, for comparison against the generated ones below. */}
      <section className="mx-auto mb-12 max-w-6xl">
        <h2 className="text-lg font-bold">Illustrated decorations</h2>
        <p className="mb-4 text-sm text-text-muted">
          Hand-drawn paths with shading and a chosen palette, rather than shapes a formula
          produced. Hover one.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Object.entries(DECORATIONS).map(([id, Dec]) => (
            <article key={id} className="rounded-xl border border-divider bg-bg-secondary p-3">
              <div className="flex h-44 items-center justify-center rounded-lg bg-bg-primary">
                <span className="fx-ring relative">
                  <span className="relative flex h-24 w-24 items-center justify-center rounded-full bg-bg-accent text-xl font-bold">
                    {name.charAt(0).toUpperCase() || "?"}
                    <Dec />
                  </span>
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold">{id}</p>
            </article>
          ))}
        </div>
      </section>

      {SHOP_CATEGORIES.map((category) => (
        <section key={category.id} className="mx-auto mb-12 max-w-6xl">
          <h2 className="text-lg font-bold">{category.label}</h2>
          <p className="mb-4 text-sm text-text-muted">{category.blurb}</p>

          <div
            className={
              category.id === "overlay"
                ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
                : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
            }
          >
            {itemsIn(category.id).map((item) => (
              <Tile key={item.id} item={item} name={name} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

function Tile({ item, name }: { item: ShopItem; name: string }) {
  const authored = item.id in PROFILE_SCENES;
  return (
    <article className="rounded-xl border border-divider bg-bg-secondary p-3">
      {item.category === "name" && (
        <div className="flex h-20 items-center justify-center rounded-lg bg-bg-primary px-3">
          <span className={`fx-name ${item.className} text-lg font-semibold text-text-normal`}>
            {item.id === "name-wave"
              ? Array.from(name).map((c, i) => (
                  <span key={i} style={{ ["--fx-i" as string]: i }}>
                    {c === " " ? " " : c}
                  </span>
                ))
              : name}
          </span>
        </div>
      )}

      {item.category === "ring" && (
        <div className="flex h-24 items-center justify-center rounded-lg bg-bg-primary">
          <span className={`fx-ring ${item.className}`}>
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-bg-accent text-base font-bold text-text-normal">
              {name.charAt(0).toUpperCase() || "?"}
            </span>
          </span>
        </div>
      )}

      {item.category === "overlay" && (
        // Same proportions as the real profile card, so the scene is judged at
        // the size it actually plays at.
        <div className="fx-overlay-host relative h-56 overflow-hidden rounded-lg bg-[#16181d]">
          <ProfileOverlay itemId={item.id} />
          <div className="relative z-10 flex h-full flex-col justify-end p-3">
            <div className="h-12 w-12 rounded-full bg-bg-accent" />
            <p className="mt-2 text-sm font-bold">{name}</p>
            <p className="text-xs text-text-muted">@{name.toLowerCase()}</p>
          </div>
        </div>
      )}

      <div className="mt-2 flex items-baseline gap-2">
        <h3 className="text-sm font-semibold">{item.name}</h3>
        <span className="ml-auto text-sm font-bold">{formatPrice(item.priceCents)}</span>
      </div>
      <p className="mt-0.5 text-[12px] leading-4 text-text-muted">{item.description}</p>
      {item.category === "overlay" && (
        <p className="mt-1 text-[11px] text-text-muted">
          {authored ? "Authored scene" : "Awaiting the SVG pass"}
        </p>
      )}
    </article>
  );
}
