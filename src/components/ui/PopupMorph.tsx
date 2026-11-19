"use client";

import { useEffect } from "react";

/*
 Popups change size smoothly instead of jumping.

 When a popup's content changes (Create Your Space → Customise, → Join a
 Space, an error appearing, a list loading), its height morphs from the old
 size to the new one, the way Discord's do.

 It covers every popup at once rather than each one opting in: any element
 with the shared `modal-pop` class (or `data-morph`) is watched. A
 MutationObserver runs after React has changed the DOM but before the browser
 paints, so the popup can be put back at its old height for that first frame
 and then eased to the new one; nothing flashes at the new size first.
 `data-morph="off"` opts a popup out.
*/

const SELECTOR = '.modal-pop, [data-morph]:not([data-morph="off"])';
const DURATION = 260;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

function reducedMotion(): boolean {
  if (document.documentElement.dataset.motion === "reduced") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function PopupMorph() {
  useEffect(() => {
    const last = new WeakMap<HTMLElement, number>();
    const animating = new WeakSet<HTMLElement>();
    const timers = new WeakMap<HTMLElement, number>();

    const resize = new ResizeObserver((entries) => {
      for (const e of entries) {
        const el = e.target as HTMLElement;
        if (!animating.has(el)) last.set(el, el.offsetHeight);
      }
    });
    const watched = new Set<HTMLElement>();
    const watch = (el: HTMLElement) => {
      if (watched.has(el) || el.dataset.morph === "off") return;
      watched.add(el);
      resize.observe(el);
      last.set(el, el.offsetHeight);
    };

    const finish = (el: HTMLElement) => {
      animating.delete(el);
      el.style.height = "";
      el.style.transition = "";
      el.style.overflow = "";
      last.set(el, el.offsetHeight);
    };

    const morph = (el: HTMLElement) => {
      const from = last.get(el);
      if (from === undefined || el.dataset.morph === "off") return;
      // Where it is right now (mid-morph, if one is running), and where it's going.
      const current = animating.has(el) ? el.offsetHeight : from;
      const prevHeight = el.style.height;
      const prevTransition = el.style.transition;
      el.style.transition = "none";
      el.style.height = "";
      const to = el.offsetHeight;
      if (Math.abs(to - current) < 2 || reducedMotion()) {
        if (animating.has(el)) finish(el);
        else {
          el.style.height = prevHeight;
          el.style.transition = prevTransition;
          last.set(el, to);
        }
        return;
      }
      animating.add(el);
      el.style.overflow = "hidden";
      el.style.height = `${current}px`;
      void el.offsetHeight; // commit the old height before easing
      el.style.transition = `height ${DURATION}ms ${EASE}`;
      el.style.height = `${to}px`;
      last.set(el, to);
      window.clearTimeout(timers.get(el));
      timers.set(el, window.setTimeout(() => finish(el), DURATION + 40));
    };

    const scan = (root: ParentNode) => {
      if (root instanceof HTMLElement && root.matches(SELECTOR)) watch(root);
      root.querySelectorAll?.<HTMLElement>(SELECTOR).forEach(watch);
    };

    const mutations = new MutationObserver((records) => {
      const changed = new Set<HTMLElement>();
      for (const r of records) {
        r.addedNodes.forEach((n) => {
          if (n instanceof HTMLElement) scan(n);
        });
        const target = r.target instanceof HTMLElement ? r.target : r.target.parentElement;
        const popup = target?.closest<HTMLElement>(SELECTOR);
        // A change inside a popup that was already open (not the popup arriving).
        if (popup && watched.has(popup) && popup !== r.addedNodes[0]) changed.add(popup);
      }
      for (const el of watched) {
        if (!el.isConnected) {
          watched.delete(el);
          resize.unobserve(el);
        }
      }
      changed.forEach(morph);
    });

    scan(document.body);
    mutations.observe(document.body, { childList: true, subtree: true });
    return () => {
      mutations.disconnect();
      resize.disconnect();
    };
  }, []);

  return null;
}
