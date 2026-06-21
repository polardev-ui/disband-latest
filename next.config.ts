import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Disband ships as both a hosted web app and a desktop binary (via Tauri).
 *
 * For the desktop build, Tauri loads the statically exported `out/` directory
 * from the local filesystem, so we use `output: "export"`. This produces a
 * fully static bundle that works identically whether served from a web host
 * or loaded inside a Tauri window — no server runtime required.
 */
const nextConfig: NextConfig = {
  output: "export",
  // Tauri serves files from the filesystem; relative asset paths keep links
  // from breaking when the app is loaded via the `tauri://` / `asset://` protocol.
  images: {
    // The Next.js image optimizer requires a server, which static export omits.
    unoptimized: true,
  },
  // Emit `out/<route>/index.html` so deep links resolve as static files.
  trailingSlash: true,
  // Silence the dev-only warning when running `tauri dev` against `next dev`.
  ...(isProd ? {} : {}),
};

export default nextConfig;
