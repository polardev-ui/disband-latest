import { lazy, Suspense, useEffect } from "react";
import { ReviewBar } from "./components/ReviewBar";
import { ToastProvider } from "./components/Toast";
import type { DesignKey } from "./data/types";
import { usePath } from "./router";
import { Selector } from "./selector/Selector";
import { ChatProvider } from "./state/store";

const Quiet = lazy(() => import("./designs/quiet/QuietApp"));
const Social = lazy(() => import("./designs/social/SocialApp"));
const Space = lazy(() => import("./designs/space/SpaceApp"));

const ROUTES: Record<string, DesignKey> = { "/quiet": "quiet", "/social": "social", "/space": "space" };
const TITLES: Record<DesignKey, string> = { quiet: "A · Quiet Confidence", social: "B · Open & Social", space: "C · Modern Digital Space" };

export function App() {
  const path = usePath();
  const design = ROUTES[path];
  const embed = new URLSearchParams(window.location.search).has("embed");

  useEffect(() => {
    document.title = design ? `${TITLES[design]} — Disband prototype` : "Disband — redesign prototypes";
    if (!design || embed) document.documentElement.style.setProperty("--rb-h", "0px");
  }, [design, embed]);

  // One store for the whole session, so a message sent in one design is
  // still there when you switch to another.
  return (
    <ChatProvider>
      <ToastProvider>
        {!design ? (
          <Selector />
        ) : (
          <>
            {!embed && <ReviewBar design={design} />}
            <Suspense fallback={<div className="boot" />}>
              {design === "quiet" && <Quiet />}
              {design === "social" && <Social />}
              {design === "space" && <Space />}
            </Suspense>
          </>
        )}
      </ToastProvider>
    </ChatProvider>
  );
}
