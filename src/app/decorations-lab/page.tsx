"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { AvatarDecoration } from "@/components/shop/AvatarDecoration";
import { DESIGNS } from "@/components/shop/decorations/designs";
import { DecorationLabContext, type DecorationLabControls } from "@/components/shop/decorations/useDecorationMotion";
import { Avatar } from "@/components/ui/Avatar";
import { decorationItems, formatPrice, type ShopItem } from "@/lib/shop";
import "./lab.css";

/*
 The decoration lab: every drawn avatar decoration at the sizes the app
 uses, with the knobs needed to judge one properly. Slow motion stretches
 the CSS and the cycle timers together; the scrubber holds a performance at
 any moment; the filmstrip lays a whole performance out frame by frame.
 Nothing here is wired to purchases.
*/

/** Simple painted portraits, so it's obvious how much of a face is covered. */
function portrait(bg: [string, string], skin: string, hair: string, shirt: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='b' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${bg[0]}'/><stop offset='1' stop-color='${bg[1]}'/></linearGradient></defs><rect width='100' height='100' fill='url(#b)'/><path d='M14 100c3-21 17-31 36-31s33 10 36 31z' fill='${shirt}'/><rect x='43' y='56' width='14' height='16' rx='6' fill='${skin}'/><ellipse cx='50' cy='45' rx='17' ry='20' fill='${skin}'/><path d='M32 42c0-15 9-23 19-23s19 8 18 24c-3-7-9-11-18-11s-15 4-19 10z' fill='${hair}'/><circle cx='43.5' cy='47' r='1.9' fill='#2a2230'/><circle cx='56.5' cy='47' r='1.9' fill='#2a2230'/><path d='M44 56q6 5 12 0' stroke='#8a4b4b' stroke-width='1.6' fill='none' stroke-linecap='round'/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
const PHOTOS = [
  { name: "Blue", src: portrait(["#5c8dff", "#7a5cff"], "#f2c7a5", "#3b2a22", "#1f2a44") },
  { name: "Peach", src: portrait(["#ffb199", "#ff7e8a"], "#c98e6a", "#18120f", "#f5f0e6") },
  { name: "Mint", src: portrait(["#5fe0b7", "#2fa4c9"], "#ffdcc2", "#c9772f", "#6d3fa8") },
];

const BACKGROUNDS = {
  app: "#313338",
  dark: "#1e1f22",
  light: "#f2f3f5",
} as const;
type Background = keyof typeof BACKGROUNDS;

/** Same structure as the app's Avatar wrapper, but takes any image. */
function LabAvatar({ item, size, photo }: { item: ShopItem; size: number; photo: string }) {
  return (
    <span className={`fx-ring ${item.className}`} style={{ width: size, height: size }}>
      <span className="lab-face">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt="" draggable={false} />
      </span>
      <AvatarDecoration itemId={item.id} />
    </span>
  );
}

/** Pause every animation under `root` at `ms` of the performance. */
function freeze(root: HTMLElement | null, ms: number, slow: number) {
  if (!root) return;
  for (const anim of root.getAnimations({ subtree: true })) {
    anim.pause();
    anim.currentTime = ms * slow;
  }
}

function FilmFrame({ item, photo, ms, slow }: { item: ShopItem; photo: string; ms: number; slow: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const controls = useMemo<DecorationLabControls>(() => ({ slow, forceHover: true, hold: true }), [slow]);
  useEffect(() => {
    // Two frames: one for the cycle to start, one for its class to apply.
    let a = 0;
    let b = 0;
    a = requestAnimationFrame(() => { b = requestAnimationFrame(() => freeze(ref.current, ms, slow)); });
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); };
  }, [ms, slow]);
  return (
    <div className="lab-frame" ref={ref}>
      <DecorationLabContext.Provider value={controls}>
        <LabAvatar item={item} size={64} photo={photo} />
      </DecorationLabContext.Provider>
      <span>{Math.round(ms)}ms</span>
    </div>
  );
}

function DecorationCard({ item, photo, slow, forceAll }: { item: ShopItem; photo: string; slow: number; forceAll: boolean }) {
  const spec = DESIGNS[item.decoration!];
  const total = spec.cycleMs;
  const [scrub, setScrub] = useState<number | null>(null);
  const [film, setFilm] = useState(false);
  const [held, setHeld] = useState(false);
  const [mount, setMount] = useState(0);
  const stage = useRef<HTMLDivElement>(null);

  const controls = useMemo<DecorationLabControls>(
    () => ({ slow, forceHover: forceAll || held || scrub !== null, hold: scrub !== null }),
    [slow, forceAll, held, scrub],
  );

  useEffect(() => {
    if (scrub === null) return;
    let a = 0;
    let b = 0;
    a = requestAnimationFrame(() => { b = requestAnimationFrame(() => freeze(stage.current, scrub, slow)); });
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); };
  }, [scrub, slow]);

  const frames = Array.from({ length: 8 }, (_, i) => (total * i) / 7);

  return (
    <article className="lab-card">
      <header>
        <div>
          <h2>{item.name}</h2>
          <p>{item.description}</p>
        </div>
        <span className="lab-price">{formatPrice(item.priceCents)}{item.unreleased ? " · not on sale" : ""}</span>
      </header>

      <div className="lab-stage" data-deco-hover ref={stage} key={mount}>
        <DecorationLabContext.Provider value={controls}>
          <LabAvatar item={item} size={160} photo={photo} />
          <div className="lab-sizes">
            <figure><LabAvatar item={item} size={92} photo={photo} /><figcaption>Profile · 92</figcaption></figure>
            <figure><LabAvatar item={item} size={40} photo={photo} /><figcaption>Chat · 40</figcaption></figure>
            <figure><LabAvatar item={item} size={32} photo={photo} /><figcaption>Members · 32</figcaption></figure>
          </div>
        </DecorationLabContext.Provider>
      </div>

      <div className="lab-controls">
        <button type="button" aria-pressed={held} onClick={() => setHeld((v) => !v)}>
          {held ? "Release hover" : "Hold hover"}
        </button>
        <label className="lab-scrub">
          <input
            type="checkbox"
            checked={scrub !== null}
            onChange={(e) => {
              if (e.target.checked) setScrub(0);
              else { setScrub(null); setMount((m) => m + 1); }
            }}
          />
          Freeze at
          <input
            type="range"
            min={0}
            max={total}
            step={10}
            value={scrub ?? 0}
            disabled={scrub === null}
            onChange={(e) => setScrub(Number(e.target.value))}
            aria-label={`${item.name} timeline`}
          />
          <output>{scrub ?? 0} / {total}ms</output>
        </label>
        <button type="button" aria-pressed={film} onClick={() => setFilm((v) => !v)}>
          {film ? "Hide frames" : "Show frames"}
        </button>
      </div>

      {film && (
        <div className="lab-film">
          {frames.map((ms) => <FilmFrame key={ms} item={item} photo={photo} ms={ms} slow={slow} />)}
        </div>
      )}
    </article>
  );
}

function ChatMock({ items, photo }: { items: ShopItem[]; photo: string }) {
  const lines = [
    "okay the skull one is unhinged",
    "hover my picture",
    "it bit me",
    "the halo is so clean though",
    "race you round the avatar",
    "en garde 🗡️",
    "this is going in my profile immediately",
  ];
  return (
    <section className="lab-chat" aria-label="Decorations in a chat">
      <h2>In a conversation</h2>
      {items.map((item, i) => (
        <div className="lab-message" key={item.id} data-deco-hover>
          <LabAvatar item={item} size={40} photo={i === 0 ? photo : PHOTOS[i % PHOTOS.length].src} />
          <div>
            <p><strong>{item.name}</strong><span>Today at {9 + i}:{(17 + i * 7) % 60 < 10 ? "0" : ""}{(17 + i * 7) % 60}</span></p>
            <p>{lines[i % lines.length]}</p>
          </div>
        </div>
      ))}
      <h2>In the member list</h2>
      <div className="lab-members">
        {items.map((item, i) => (
          <div className="lab-member" key={item.id} data-deco-hover>
            <LabAvatar item={item} size={32} photo={PHOTOS[(i + 1) % PHOTOS.length].src} />
            <span>{item.name}</span>
          </div>
        ))}
      </div>
      <h2>Through the app&apos;s own Avatar</h2>
      <div className="lab-members">
        {items.map((item) => (
          <div className="lab-member" key={item.id} data-deco-hover>
            <Avatar profile={{ display_name: item.name, username: item.id, equipped_ring_effect: item.id }} size="md" />
            <span>{item.name}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * `?focus=<item id>&size=<px>&t=<ms>&hover=1`: one decoration, large, for
 * judging detail. With `t` the hover performance is frozen at that moment.
 */
function FocusView({ item, size, t, hover, photo }: { item: ShopItem; size: number; t: number | null; hover: boolean; photo: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const controls = useMemo<DecorationLabControls>(() => ({ slow: 1, forceHover: hover || t !== null, hold: t !== null }), [hover, t]);
  useEffect(() => {
    if (t === null) return;
    let a = 0;
    let b = 0;
    a = requestAnimationFrame(() => { b = requestAnimationFrame(() => freeze(ref.current, t, 1)); });
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); };
  }, [t]);
  return (
    <div className="lab-focus" ref={ref} data-deco-hover>
      <DecorationLabContext.Provider value={controls}>
        <LabAvatar item={item} size={size} photo={photo} />
      </DecorationLabContext.Provider>
    </div>
  );
}

export default function DecorationLabPage() {
  const items = useMemo(() => decorationItems(), []);
  const [focus, setFocus] = useState<{ id: string; size: number; t: number | null; hover: boolean } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get("focus");
    if (!id) return;
    setFocus({ id, size: Number(q.get("size")) || 320, t: q.has("t") ? Number(q.get("t")) : null, hover: q.get("hover") === "1" });
  }, []);
  const [slow, setSlow] = useState(1);
  const [forceAll, setForceAll] = useState(false);
  const [bg, setBg] = useState<Background>("app");
  const [photoIndex, setPhotoIndex] = useState(0);
  const [reduced, setReduced] = useState(false);
  const photo = PHOTOS[photoIndex].src;
  const focusItem = focus ? items.find((i) => i.id === focus.id) : undefined;

  useEffect(() => {
    const root = document.documentElement;
    if (reduced) root.dataset.motion = "reduced";
    else if (root.dataset.motion === "reduced") delete root.dataset.motion;
  }, [reduced]);

  return (
    <main className={`lab ${bg === "light" ? "lab-light cosmetic-profile-light" : ""}`} style={{ "--lab-bg": BACKGROUNDS[bg] } as CSSProperties}>
      <nav className="lab-bar" hidden={!!focus}>
        <Link href="/app" className="lab-home">disband<span>/</span>decoration lab</Link>
        <div className="lab-knobs">
          <div role="group" aria-label="Speed">
            {[1, 2, 4].map((s) => (
              <button key={s} type="button" aria-pressed={slow === s} onClick={() => setSlow(s)}>
                {s === 1 ? "1×" : `1/${s}×`}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Background">
            {(Object.keys(BACKGROUNDS) as Background[]).map((key) => (
              <button key={key} type="button" aria-pressed={bg === key} onClick={() => setBg(key)}>{key}</button>
            ))}
          </div>
          <div role="group" aria-label="Photo">
            {PHOTOS.map((p, i) => (
              <button key={p.name} type="button" aria-pressed={photoIndex === i} onClick={() => setPhotoIndex(i)}>{p.name}</button>
            ))}
          </div>
          <button type="button" aria-pressed={forceAll} onClick={() => setForceAll((v) => !v)}>Hover everything</button>
          <button type="button" aria-pressed={reduced} onClick={() => setReduced((v) => !v)}>Reduced motion</button>
        </div>
      </nav>

      {focus && focusItem && <FocusView item={focusItem} size={focus.size} t={focus.t} hover={focus.hover} photo={photo} />}

      <header className="lab-intro" hidden={!!focus}>
        <h1>Avatar decorations</h1>
        <p>Hover a card (or anywhere on a chat line) to play its performance. Leaving lets it finish. Hold a hover and it repeats after its pause.</p>
      </header>

      <div className="lab-grid" hidden={!!focus}>
        {items.map((item) => (
          <DecorationCard key={item.id} item={item} photo={photo} slow={slow} forceAll={forceAll} />
        ))}
      </div>

      {!focus && <ChatMock items={items} photo={photo} />}
    </main>
  );
}
