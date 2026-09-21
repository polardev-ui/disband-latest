import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const isProd = process.env.NODE_ENV === "production";
/** Set for Tauri desktop packaging only — static `out/` bundle. Web (Vercel) omits this. */
const isTauriStaticExport = process.env.TAURI_BUILD === "1";

// Dev only, as the name says. It wires `next dev` up to the Cloudflare
// bindings in wrangler.jsonc, and because the cache bucket there is marked
// `remote: true` it opens a live session against the account — which needs
// credentials.
//
// It used to run on import, so a *build* opened that session too. On a
// developer's machine that is invisible (wrangler is logged in via OAuth), but
// CI has no login: the desktop build died on a missing CLOUDFLARE_API_TOKEN,
// for a binding a filesystem-loaded Tauri bundle never touches. Adding the
// token to CI would paper over it — the connection has no business being in a
// build at all.
if (!isProd && !isTauriStaticExport) {
  initOpenNextCloudflareForDev();
}

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
  distDir: isProd ? ".next" : ".next-dev",
  poweredByHeader: false,
  agentRules: false,
  // The repository is nested under a larger Projects directory. Pinning the
  // Turbopack root prevents workspace inference from looking above the app
  // and producing a blank dev server after dependency upgrades.
  turbopack: { root: process.cwd() },
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
