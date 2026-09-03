"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { hasAllowedMobileWeb } from "@/lib/mobile-detect";
import { chooseContinueOnWeb, hasChosenContinueOnWeb } from "@/lib/mobile-session";

/**
 * Site-wide iOS launch announcement.
 *
 * Two phases sharing one dialog: a countdown before release, then a released
 * state with a confetti burst and an App Store link. Each phase has its own
 * dismissal key, so someone who dismissed the countdown is still told when the
 * app actually ships — dismissing "launching soon" is not the same as having
 * seen "it's out".
 */

/**
 * Release moment, stored as an absolute instant so it does not drift with the
 * visitor's timezone.
 *
 * 2 September 2026, 1:00 PM Eastern. Eastern is on daylight time (UTC-4) in
 * September, so that is 17:00 UTC.
 */
const RELEASE_AT = Date.parse("2026-09-02T17:00:00Z");

const APP_STORE_URL = "https://apps.apple.com/app/id6783881800";

const DISMISS_COUNTDOWN = "disband:launch-countdown-dismissed";
const DISMISS_RELEASED = "disband:launch-released-dismissed";

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    // Private mode or blocked storage: show the popup rather than crash.
    return false;
  }
}

function writeFlag(key: string) {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Nothing to do — it will show again next visit, which is the safe failure.
  }
}

interface Remaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function remainingFrom(ms: number): Remaining {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

export function LaunchAnnouncement() {
  const router = useRouter();
  // Never render on the server: the decision depends on localStorage and the
  // current time, both of which would cause a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  const [released, setReleased] = useState(false);
  const [visible, setVisible] = useState(false);
  const [left, setLeft] = useState<Remaining>({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [email, setEmail] = useState("");
  const [subscribeState, setSubscribeState] =
    useState<"idle" | "sending" | "done">("idle");
  const [subscribeError, setSubscribeError] = useState<string | null>(null);

  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);

    // /mobile is now itself an App Store pitch, and /verification is a step in
    // a flow the user is in the middle of. Neither wants this dialog on top.
    const path = window.location.pathname;
    if (path.startsWith("/mobile") || path.startsWith("/verification")) return;

    // Someone who just chose "Continue on the web" over the App Store has
    // already answered this question. Do not ask it again on the next page.
    // This holds for the current session (in-memory) or a past, persisted
    // choice (localStorage).
    if (hasChosenContinueOnWeb() || hasAllowedMobileWeb()) return;

    const isReleased = Date.now() >= RELEASE_AT;
    setReleased(isReleased);
    setLeft(remainingFrom(RELEASE_AT - Date.now()));
    setVisible(!readFlag(isReleased ? DISMISS_RELEASED : DISMISS_COUNTDOWN));
  }, []);

  // Tick the countdown, and flip to the released state the moment it lands so a
  // visitor sitting on the page sees it happen.
  useEffect(() => {
    if (!visible || released) return;
    const id = window.setInterval(() => {
      const delta = RELEASE_AT - Date.now();
      if (delta <= 0) {
        setReleased(true);
        setLeft(remainingFrom(0));
        setVisible(!readFlag(DISMISS_RELEASED));
        return;
      }
      setLeft(remainingFrom(delta));
    }, 1000);
    return () => window.clearInterval(id);
  }, [visible, released]);

  const subscribe = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (subscribeState === "sending") return;
    setSubscribeState("sending");
    setSubscribeError(null);
    try {
      const res = await apiFetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setSubscribeError(json.error ?? "Could not subscribe. Try again.");
        setSubscribeState("idle");
        return;
      }
      setSubscribeState("done");
    } catch {
      setSubscribeError("Network error. Try again.");
      setSubscribeState("idle");
    }
  }, [email, subscribeState]);

  const dismiss = useCallback(() => {
    writeFlag(released ? DISMISS_RELEASED : DISMISS_COUNTDOWN);
    setVisible(false);
  }, [released]);

  // "Continue on the web" lets the visitor straight in: it records the choice
  // for this session (so navigating around won't nag again) and navigates to
  // the app. It is deliberately session-scoped — a reload re-asks.
  const continueOnWeb = useCallback(() => {
    chooseContinueOnWeb();
    writeFlag(released ? DISMISS_RELEASED : DISMISS_COUNTDOWN);
    setVisible(false);
    router.push("/app");
  }, [released, router]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, dismiss]);

  if (!mounted || !visible) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="launch-title"
    >
      <button
        type="button"
        aria-label="Dismiss announcement"
        onClick={dismiss}
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
      />

      {released && <ConfettiBurst />}

      <div className="relative z-[2] w-full max-w-md overflow-hidden rounded-2xl border border-divider bg-bg-secondary shadow-2xl">
        <div className="px-7 pb-7 pt-8 text-center">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">
            {released ? "Out now" : "Approved by Apple"}
          </p>

          <h2 id="launch-title" className="text-[26px] font-bold leading-tight text-text-normal">
            {released ? "Disband for iOS has launched" : "Disband is coming to iPhone"}
          </h2>

          <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
            {released ? (
              <>Download it from the App Store and pick up right where you left off.</>
            ) : (
              <>
                Our iOS app is approved and arrives{" "}
                <span className="font-semibold text-text-normal">
                  September 2 at 1:00 PM Eastern
                </span>
                .
              </>
            )}
          </p>

          {!released && (
            <div className="mt-6 grid grid-cols-4 gap-2" aria-live="off">
              <CountdownCell value={left.days} label="Days" />
              <CountdownCell value={left.hours} label="Hours" />
              <CountdownCell value={left.minutes} label="Minutes" />
              <CountdownCell value={left.seconds} label="Seconds" />
            </div>
          )}

          {/* One live region rather than announcing every tick to a screen reader. */}
          <p className="sr-only" aria-live="polite">
            {released
              ? "Disband for iOS is now available on the App Store."
              : `Launching in ${left.days} days, ${left.hours} hours, ${left.minutes} minutes.`}
          </p>

          {released ? (
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-7 block w-full rounded-xl bg-brand py-3.5 text-[15px] font-bold text-white transition-opacity hover:opacity-90"
            >
              Get it on the App Store
            </a>
          ) : (
            <div className="mt-7">
              {subscribeState === "done" ? (
                <p className="rounded-xl border border-status-online/30 bg-status-online/10 px-4 py-3.5 text-[14px] font-medium text-status-online">
                  You’re subscribed — we’ll email you at launch.
                </p>
              ) : (
                <form onSubmit={subscribe} className="space-y-2.5">
                  <label htmlFor="launch-email" className="sr-only">
                    Email address
                  </label>
                  <input
                    id="launch-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-divider bg-bg-tertiary px-4 py-3 text-[15px] text-text-normal outline-none transition-colors placeholder:text-text-muted focus:border-brand"
                  />
                  <button
                    type="submit"
                    disabled={subscribeState === "sending"}
                    className="block w-full rounded-xl bg-brand py-3.5 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {subscribeState === "sending" ? "Subscribing…" : "Subscribe for updates"}
                  </button>
                  {subscribeError && (
                    <p className="text-[13px] text-status-dnd" role="alert">
                      {subscribeError}
                    </p>
                  )}
                </form>
              )}
            </div>
          )}

          <button
            ref={closeRef}
            type="button"
            onClick={dismiss}
            className="mt-3 text-[13px] text-text-muted underline-offset-2 hover:text-text-normal hover:underline"
          >
            {released ? "Maybe later" : "Dismiss"}
          </button>

          <p className="mt-5 border-t border-divider pt-4">
            <button
              type="button"
              onClick={continueOnWeb}
              className="text-[13px] font-semibold text-brand underline-offset-2 hover:underline"
            >
              Continue on the web
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

function CountdownCell({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-divider bg-bg-tertiary py-3">
      <p className="text-[24px] font-bold leading-none tabular-nums text-text-normal">
        {String(value).padStart(2, "0")}
      </p>
      <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </p>
    </div>
  );
}

/**
 * One-shot confetti launched from the bottom edge.
 *
 * Canvas rather than DOM nodes: a few hundred animated elements would thrash
 * layout. It runs exactly once, stops itself when every piece has fallen back
 * off-screen, and is skipped entirely under prefers-reduced-motion.
 */
function ConfettiBurst() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    const viewport = () => [
      window.innerWidth || document.documentElement.clientWidth || 0,
      window.innerHeight || document.documentElement.clientHeight || 0,
    ] as const;

    const resize = () => {
      const [w, h] = viewport();
      if (w === 0 || h === 0) return false;
      width = w;
      height = h;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    };
    window.addEventListener("resize", resize);

    let raf = 0;
    let cancelled = false;

    const COLORS = ["#5865f2", "#eb459e", "#57f287", "#fee75c", "#f0913f", "#ffffff"];

    interface Piece {
      x: number; y: number;
      vx: number; vy: number;
      size: number;
      color: string;
      spin: number;
      angle: number;
    }

    // Two launch points near the bottom corners, angled inwards — a single
    // centre jet reads as a fountain rather than a celebration.
    const pieces: Piece[] = [];

    const buildPieces = () => {
      const origins = [width * 0.2, width * 0.8];
      for (const originX of origins) {
        for (let i = 0; i < 90; i++) {
          const towardCentre = originX < width / 2 ? 1 : -1;
          const spread = (Math.random() - 0.5) * 5;
          pieces.push({
            x: originX + (Math.random() - 0.5) * 40,
            y: height + 10,
            vx: towardCentre * (2 + Math.random() * 4) + spread,
            vy: -(13 + Math.random() * 9),
            size: 5 + Math.random() * 6,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            spin: (Math.random() - 0.5) * 0.3,
            angle: Math.random() * Math.PI,
          });
        }
      }
    };

    const GRAVITY = 0.28;
    const DRAG = 0.995;

    const frame = () => {
      ctx.clearRect(0, 0, width, height);
      let alive = 0;

      for (const p of pieces) {
        p.vy += GRAVITY;
        p.vx *= DRAG;
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;

        // Still on screen, or still climbing back into view.
        if (p.y < height + 60) alive++;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        // Scaling height by the spin phase fakes a paper flutter cheaply.
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * Math.abs(Math.cos(p.angle)));
        ctx.restore();
      }

      if (alive > 0) {
        raf = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
    };
    // Wait for a real viewport before firing. A background tab reports 0x0, and
    // starting there would burn the one-shot animation on an invisible canvas.
    let attempts = 0;
    const launch = () => {
      if (cancelled) return;
      if (!resize()) {
        if (attempts++ < 120) raf = requestAnimationFrame(launch);
        return;
      }
      buildPieces();
      raf = requestAnimationFrame(frame);
    };
    launch();

    // A background tab reports a zero viewport and never lays out. Since this
    // is a one-shot celebration, wait and fire when the page is actually
    // looked at rather than burning it while hidden.
    const onVisible = () => {
      if (!cancelled && document.visibilityState === "visible" && pieces.length === 0) {
        attempts = 0;
        launch();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[1]"
    />
  );
}
