import "@fontsource-variable/geist";
import "./selector.css";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link, navigate } from "../router";

const OPTIONS = [
  {
    letter: "A",
    path: "/quiet",
    name: "Quiet Confidence",
    line: "Minimal, warm and effortless.",
    philosophy:
      "Typography and spacing do the work. Warm neutrals, charcoal ink and a single indigo accent that only appears for state and action. A narrow rail, a calm conversation list, and details that open when you ask for them.",
    type: "Instrument Sans",
    swatches: ["#fbfaf8", "#f5f3ef", "#1f1d1a", "#4b50c4"],
    layout: "Rail · conversation list · chat · optional details",
  },
  {
    letter: "B",
    path: "/social",
    name: "Open & Social",
    line: "Friendly, expressive, people first.",
    philosophy:
      "Built around who's around. Friends' presence sits at the top, conversations read as natural bubbles with yours on the right, and spaces open by drilling in rather than through an icon rail. Warm coral accent, profile colours on avatars.",
    type: "Figtree",
    swatches: ["#f3f4f6", "#ffffff", "#1d2026", "#e0532a"],
    layout: "People-first sidebar with Chats / Spaces / Friends · bubbles",
  },
  {
    letter: "C",
    path: "/space",
    name: "Modern Digital Space",
    line: "Layered dark, precise and calm.",
    philosophy:
      "Depth instead of borders. The conversation sits on a raised stage, the active item visibly connects to it, and the details panel is a third plane. Deep blue-graphite with a soft periwinkle accent; motion follows the structure.",
    type: "Geist + Geist Mono",
    swatches: ["#0d0e12", "#16171d", "#e8e9ee", "#8f9bff"],
    layout: "Space rail · list · inset stage · details plane",
  },
];

const COMPARE: [string, string, string, string][] = [
  ["Navigation", "Icon rail for Chats, Friends and spaces; list beside it", "Tabs in one sidebar; spaces drill in and out", "Rail of spaces plus a Home tile; list connects to the stage"],
  ["Messages", "Flat rows, grouped by author, avatars in a gutter", "Bubbles; yours on the right; grouped tails", "Flat rows on a raised stage; role colours in spaces"],
  ["Density", "Compact but comfortable", "Roomier, more air around people", "Medium, with stronger separation of planes"],
  ["Colour", "Neutral first; one accent", "Light neutrals, coral, profile colours", "Dark layers, periwinkle, amber for mentions"],
  ["Default theme", "Light (dark included)", "Light (dark included)", "Dark (light included)"],
  ["Mobile", "Bottom tabs, full-screen chat", "Bottom tabs, sheets for details", "Space strip, full-screen stage"],
];

function Preview({ path, name }: { path: string; name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / 1440));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="sel-frame" ref={ref} aria-hidden="true">
      <iframe
        title={`${name} preview`}
        src={`${path}?embed=1`}
        loading="lazy"
        tabIndex={-1}
        style={{ transform: `scale(${scale})` }}
      />
    </div>
  );
}

export function Selector() {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
      const i = ["1", "2", "3"].indexOf(e.key);
      if (i >= 0) navigate(OPTIONS[i].path);
    };
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, []);

  return (
    <div className="sel">
      <header className="sel-head">
        <div className="sel-brand">
          <img src="/logo.png" alt="" width={20} height={20} />
          <span>Disband</span>
          <span className="sel-tag">Redesign review</span>
        </div>
        <h1>Three directions for Disband</h1>
        <p className="sel-lede">
          Each prototype is the same product with the same sample account — friends, DMs, a group chat and four spaces — so you're comparing
          design, not content. They're fully interactive: send, reply, react, edit, search with <kbd>⌘K</kbd>, open profiles and settings.
          Everything runs in this tab against mock data. Nothing is sent to Disband.
        </p>
      </header>

      <main className="sel-grid">
        {OPTIONS.map((o, i) => (
          <article key={o.path} className="sel-card">
            <Link to={o.path} className="sel-preview-link" aria-label={`Open ${o.name}`}>
              <Preview path={o.path} name={o.name} />
            </Link>
            <div className="sel-meta">
              <div className="sel-title">
                <span className="sel-letter">{o.letter}</span>
                <div>
                  <h2>{o.name}</h2>
                  <p className="sel-line">{o.line}</p>
                </div>
              </div>
              <p className="sel-phil">{o.philosophy}</p>
              <dl className="sel-facts">
                <div><dt>Type</dt><dd>{o.type}</dd></div>
                <div>
                  <dt>Colour</dt>
                  <dd className="sel-swatches">
                    {o.swatches.map((s) => <span key={s} style={{ background: s }} title={s} />)}
                  </dd>
                </div>
                <div><dt>Layout</dt><dd>{o.layout}</dd></div>
              </dl>
              <div className="sel-actions">
                <Link to={o.path} className="sel-open">
                  Open prototype <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <span className="sel-key">or press <kbd>{i + 1}</kbd></span>
              </div>
            </div>
          </article>
        ))}
      </main>

      <section className="sel-compare" aria-labelledby="cmp">
        <h2 id="cmp">How they differ</h2>
        <div className="sel-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col"><span className="vh">Aspect</span></th>
                {OPTIONS.map((o) => <th key={o.letter} scope="col">{o.letter} · {o.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {COMPARE.map(([k, a, b, c]) => (
                <tr key={k}>
                  <th scope="row">{k}</th>
                  <td>{a}</td>
                  <td>{b}</td>
                  <td>{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sel-foot">
          Inside a prototype, the dark bar at the top switches directions and previews other states: a brand-new empty account, loading, and
          offline (sends fail and can be retried). It's review tooling, not part of the Disband interface.
        </p>
      </section>
    </div>
  );
}
