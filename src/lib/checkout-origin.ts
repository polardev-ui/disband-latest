import { PUBLIC_ENV } from "./public-env";

export function checkoutOrigin(req: Request): string {
  const canonical = new URL(PUBLIC_ENV.webAppUrl).origin;
  const origin = req.headers.get("origin");
  if (!origin) return canonical;
  try {
    const url = new URL(origin);
    if (url.origin === canonical || url.origin === "https://disband.dev" || url.origin === "https://www.disband.dev") return url.origin;
    if (process.env.NODE_ENV === "development" && url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return url.origin;
  } catch { /* Invalid and native-app origins return to the canonical website. */ }
  return canonical;
}
