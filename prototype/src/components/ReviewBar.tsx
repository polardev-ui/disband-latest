import { useEffect, useState } from "react";
import type { DesignKey, Scenario } from "../data/types";
import { DESIGNS, Link } from "../router";
import { useChat } from "../state/store";

// Development-only review chrome. Deliberately plain and monospaced so it
// never reads as part of Disband.

const SCENARIOS: { value: Scenario; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "new", label: "New account (empty)" },
  { value: "loading", label: "Loading" },
  { value: "offline", label: "Offline (sends fail)" },
];

function readCollapsed() {
  try {
    return sessionStorage.getItem("rb-collapsed") === "1";
  } catch {
    return false;
  }
}

export function ReviewBar({ design }: { design: DesignKey }) {
  const { state, actions } = useChat();
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    document.documentElement.style.setProperty("--rb-h", collapsed ? "0px" : "34px");
    try {
      sessionStorage.setItem("rb-collapsed", collapsed ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, [collapsed]);

  if (collapsed) {
    return (
      <button type="button" className="rb-tab" onClick={() => setCollapsed(false)} aria-label="Show prototype review bar">
        Review
      </button>
    );
  }

  return (
    <div className="rb" role="region" aria-label="Prototype review controls">
      <Link to="/" className="rb-home">← Directions</Link>
      <nav className="rb-designs" aria-label="Switch design">
        {DESIGNS.map((d) => (
          <Link key={d.key} to={d.path} className="rb-design" aria-current={d.key === design ? "page" : undefined}>
            <span className="rb-letter">{d.letter}</span>
            <span className="rb-name">{d.name}</span>
          </Link>
        ))}
      </nav>
      <label className="rb-state">
        <span>State</span>
        <select value={state.scenario} onChange={(e) => actions.setScenario(e.target.value as Scenario)}>
          {SCENARIOS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </label>
      <span className="rb-note">Prototype · sample data · nothing leaves this tab</span>
      <button type="button" className="rb-hide" onClick={() => setCollapsed(true)} aria-label="Hide review bar">Hide</button>
    </div>
  );
}
