import type { MetadataRoute } from "next";
import { PUBLIC_ENV } from "@/lib/public-env";

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