import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
/** Set for Tauri desktop packaging only — static `out/` bundle. Web (Vercel) omits this. */
const isTauriStaticExport = process.env.TAURI_BUILD === "1";

/**
 * Disband ships as both a hosted web app and a desktop binary (via Tauri).
 *
 * Tauri loads the statically exported `out/` directory from the filesystem.
 * Vercel runs a normal Next.js server so middleware, API routes, and SSR work.
 */
/**
 * Content Security Policy for the hosted web app. Kept pragmatic so the SPA,
 * Supabase realtime (wss), user-supplied media, and third-party APIs keep
 * working, while locking down framing, plugins, base-uri, and form targets.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "frame-src 'self' https://challenges.cloudflare.com https:",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=(), browsing-topics=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  ...(isTauriStaticExport
    ? {
        output: "export" as const,
        trailingSlash: true,
      }
    : {
        async headers() {
          return [
            {
              source: "/:path*",
              headers: securityHeaders,
            },
          ];
        },
      }),
  images: {
    unoptimized: true,
  },
  ...(isProd ? {} : {}),
};

export default nextConfig;
