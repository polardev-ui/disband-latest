"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";

interface TurnstileProps {
  siteKey: string;
  onToken: (token: string) => void;
  onExpire?: () => void;
  /** Cloudflare's error code (e.g. 300030), when it gives one. */
  onError?: (code?: string) => void;
  /** Bound into the token; the server checks it, so a token solved for one form can't be reused on another. */
  action?: string;
  className?: string;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          theme?: "light" | "dark" | "auto";
          action?: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: (code?: string) => void;
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export function Turnstile({ siteKey, onToken, onExpire, onError, action, className }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const onTokenRef = useRef(onToken);
  const onExpireRef = useRef(onExpire);
  const onErrorRef = useRef(onError);
  onTokenRef.current = onToken;
  onExpireRef.current = onExpire;
  onErrorRef.current = onError;

  const render = () => {
    if (!containerRef.current || !window.turnstile || widgetIdRef.current !== null) return;
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      theme: "dark",
      ...(action ? { action } : {}),
      callback: (token) => onTokenRef.current(token),
      "expired-callback": () => onExpireRef.current?.(),
      "error-callback": (code) => { onExpireRef.current?.(); onErrorRef.current?.(code); },
    });
  };

  useEffect(() => {

    render();

    // A widget that never draws (frame blocked, script stalled) fires no
    // error callback, leaving a silent gap. If nothing has been drawn after a
    // while, report it as an error so the page can say so.
    const stalled = window.setTimeout(() => {
      const host = containerRef.current?.firstElementChild as HTMLElement | null;
      if (!host || host.offsetHeight === 0) onErrorRef.current?.("timeout");
    }, 12_000);

    return () => {
      window.clearTimeout(stalled);
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={render}
      />
      <div ref={containerRef} className={className} />
    </>
  );
}
