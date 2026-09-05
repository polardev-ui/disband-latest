import type { MetadataRoute } from "next";
import { PUBLIC_ENV } from "@/lib/public-env";

// `output: export` (the desktop build) refuses a route that has not declared
// whether it is static. Nothing here depends on the request, so it is
// generated once at build time.
export const dynamic = "force-static";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/app", // Signed-in application shell — nothing to index.
          "/login",
          "/reset-password",
          "/verification",
          "/bot-invite", // One-time token URLs.
          "/bug-report",
        ],
      },
    ],
    sitemap: `${PUBLIC_ENV.webAppUrl}/sitemap.xml`,
  };
}