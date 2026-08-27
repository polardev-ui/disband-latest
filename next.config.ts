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
const securityHeaders = [
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=(), browsing-topics=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

// Bots run self-hosted and call the API cross-origin (curl, Node, Python, …),
// so the bot-facing endpoints allow any origin. Bot tokens are bearer secrets
// in the Authorization header, not cookies, so `*` is safe here.
const botApiHeaders = [
  { key: "Access-Control-Allow-Origin", value: "*" },
  { key: "Access-Control-Allow-Methods", value: "GET, POST, DELETE, OPTIONS" },
  { key: "Access-Control-Allow-Headers", value: "Authorization, Content-Type" },
  { key: "Access-Control-Max-Age", value: "86400" },
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
            {
              source: "/api/bot/:path*",
              headers: botApiHeaders,
            },
            {
              source: "/api/v1/:path*",
              headers: botApiHeaders,
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
