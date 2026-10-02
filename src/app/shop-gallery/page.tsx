"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Check, Moon, Pause, Play, Sun } from "lucide-react";
import { CosmeticAvatar, CosmeticProfile } from "@/components/shop/CosmeticPreview";
import { ShopModal } from "@/components/shop/ShopModal";
import { CosmeticMotionContext } from "@/components/shop/AnimatedCosmetic";
import { ART_COLLECTIONS, formatPrice, shopItem } from "@/lib/shop";
import "./gallery.css";

export default function ShopGalleryPage() {
  const [selected, setSelected] = useState(0);
  const [category, setCategory] = useState<"ring" | "overlay">("ring");
  const [playing, setPlaying] = useState(true);
  const [light, setLight] = useState(false);
  const [name, setName] = useState("polar");
  const [shopOpen, setShopOpen] = useState(false);
  const collections = ART_COLLECTIONS.filter((set) => category === "ring" || set.profileId);
  const collection = collections[selected] ?? collections[0];
  const item = shopItem(category === "ring" ? collection.ringId : collection.profileId)!;
  const self = { name };

  return <CosmeticMotionContext.Provider value={playing}><main className="shop-studio" data-playing={playing} style={{ "--collection-color": collection.color, "--collection-surface": collection.surface } as CSSProperties}>
    <div className="shop-studio-shell">
      <nav className="studio-nav" aria-label="Shop navigation">
        <Link href="/app" className="studio-wordmark">disband<span>/</span><span>shop</span></Link>
        <div className="studio-nav-actions">
          <button className="studio-motion" type="button" onClick={() => setPlaying(!playing)} aria-pressed={!playing}>
            {playing ? <Pause size={14} /> : <Play size={14} />}<span>{playing ? "Pause motion" : "Play motion"}</span>
          </button>
          <Link href="/app" className="studio-back"><ArrowLeft size={15} /> Back to app</Link>
        </div>
      </nav>

      <header className="studio-intro">
        <p className="studio-eyebrow">NEW IN THE SHOP / SKETCHBOOK & FLIGHT</p>
        <h1>A profile with personality<span>.</span></h1>
        <p>Little details. A whole different feeling. Find a frame and a world to go with it.</p>
      </header>

      <div className="studio-layout">
        <section className="studio-catalogue" aria-label="Cosmetic collections">
          <div className="studio-catalogue-header">
            <div className="studio-tabs" role="group" aria-label="Cosmetic type">
              <button type="button" aria-pressed={category === "ring"} onClick={() => { setCategory("ring"); setSelected(0); }}>Avatar decorations <span>{String(ART_COLLECTIONS.length).padStart(2, "0")}</span></button>
              <button type="button" aria-pressed={category === "overlay"} onClick={() => { setCategory("overlay"); setSelected(0); }}>Profile skins <span>{String(ART_COLLECTIONS.filter((set) => set.profileId).length).padStart(2, "0")}</span></button>
            </div>
          </div>
          <div className={`studio-products ${category === "overlay" ? "studio-products-profiles" : ""}`}>
            {collections.map((set, index) => {
              const product = shopItem(category === "ring" ? set.ringId : set.profileId)!;
              return <button className={`studio-product ${selected === index ? "is-selected" : ""}`} type="button" key={set.id}
                onClick={() => setSelected(index)} aria-pressed={selected === index}
                aria-label={`Preview ${set.name} ${category === "ring" ? "avatar decoration" : "profile skin"}, ${formatPrice(product.priceCents)}`}
                style={{ "--tile-surface": set.surface, "--tile-color": set.color } as CSSProperties}>
                <div className="studio-product-art">
                  {category === "ring" ? <CosmeticAvatar ringId={set.ringId} self={self} size={88} playing={playing} />
                    : <CosmeticProfile overlayId={set.profileId} self={self} compact playing={playing} />}
                  <span className="studio-selection" aria-hidden>{selected === index && <Check size={12} strokeWidth={3} />}</span>
                </div>
                <div className="studio-product-caption"><span>{set.name}</span><span>{formatPrice(product.priceCents)}</span></div>
              </button>;
            })}
          </div>

          <div className="studio-detail" aria-live="polite">
            <div className="studio-detail-heading"><p className="studio-eyebrow">{category === "ring" ? "AVATAR DECORATION" : "PROFILE SKIN"}</p><span className="studio-loop-label"><span /> Animated</span></div>
            <h2>{collection.name}</h2>
            <p className="studio-tagline">{collection.line}</p>
            <p className="studio-description">{collection.description}</p>
            <div className="studio-purchase"><button type="button" className="studio-primary" onClick={() => setShopOpen(true)}>Open shop <ArrowUpRight size={17} /></button><span>{formatPrice(item.priceCents)}<small>One-time purchase</small></span></div>
          </div>

          <div className="studio-in-context">
            <div><h3>Small detail. Everywhere.</h3><p>Your decoration follows you into conversations.</p></div>
            <div className="studio-message"><CosmeticAvatar self={self} ringId={collection.ringId} size={36} playing={playing} /><div><p><strong>{name.trim() || "Your name"}</strong><span>Today at 9:41 PM</span></p><p>Okay, this one feels like me.</p></div></div>
          </div>
          <p className="studio-footnote">Permanent cosmetics · Profile skins sold separately where available · Respects reduced motion</p>
        </section>

        <aside className="studio-fitting-room" aria-label="Live profile preview">
          <div className="studio-preview-heading"><span>Your profile, dressed up</span><div role="group" aria-label="Preview appearance"><button type="button" aria-label="Dark preview" aria-pressed={!light} onClick={() => setLight(false)}><Moon size={14} /></button><button type="button" aria-label="Light preview" aria-pressed={light} onClick={() => setLight(true)}><Sun size={14} /></button></div></div>
          <div className="studio-profile-stage"><CosmeticProfile ringId={collection.ringId} overlayId={collection.profileId} self={self} playing={playing} light={light} /></div>
          <div className="studio-preview-bottom"><span>{collection.profileId ? "Matching set preview" : "Avatar decoration preview"}</span><span>{collection.name}</span></div>
          <label className="studio-name-input">Try your name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} placeholder="Your name" /></label>
        </aside>
      </div>
      <footer className="studio-footer"><span>Make yourself at home.</span><span>DISBAND SHOP</span></footer>
    </div>
    <ShopModal open={shopOpen} onClose={() => setShopOpen(false)} self={self} initialCategory={category} />
  </main></CosmeticMotionContext.Provider>;
}
