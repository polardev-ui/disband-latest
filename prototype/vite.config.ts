import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The prototype is its own Vite app, isolated from the Next.js production
// build. `css.postcss` is set inline so Vite does not walk up and pick the
// repository's Tailwind PostCSS config.
export default defineConfig({
  plugins: [react()],
  css: { postcss: {} },
  server: { port: 5173, host: "localhost" },
  preview: { port: 4173, host: "localhost" },
});
