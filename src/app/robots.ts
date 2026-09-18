import type { MetadataRoute } from "next";
import { PUBLIC_ENV } from "@/lib/public-env";

export const dynamic = "force-static";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/app",
          "/login",
          "/reset-password",
          "/verification",
          "/bot-invite",
          "/bug-report",
        ],
      },
    ],
    sitemap: `${PUBLIC_ENV.webAppUrl}/sitemap.xml`,
  };
}