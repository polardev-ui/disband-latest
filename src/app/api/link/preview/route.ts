import { NextRequest, NextResponse } from "next/server";

const MEDIA_API =
  process.env.NEXT_PUBLIC_MEDIA_API_URL ?? "https://api.wsgpolar.me/v1";

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function metaContent(html: string, key: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']|` +
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
    "i",
  );
  const match = html.match(re);
  return decodeHtml((match?.[1] ?? match?.[2] ?? "").trim()) || undefined;
}

async function scrapeOpenGraph(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "DisbandLinkPreview/1.0 (+https://disband.wsgpolar.me)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;

  const html = await res.text();
  const title =
    metaContent(html, "og:title")
    ?? metaContent(html, "twitter:title")
    ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  const description =
    metaContent(html, "og:description")
    ?? metaContent(html, "description")
    ?? metaContent(html, "twitter:description");
  const image =
    metaContent(html, "og:image")
    ?? metaContent(html, "twitter:image");

  if (!title && !description && !image) return null;

  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch {
    // keep raw url
  }

  return {
    title: decodeHtml(title ?? hostname),
    description: description ? decodeHtml(description) : undefined,
    image: image ? decodeHtml(image) : undefined,
    site: hostname,
  };
}

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "Missing url parameter." }, { status: 400 });
  }

  try {
    new URL(target);
  } catch {
    return NextResponse.json({ error: "Invalid url." }, { status: 400 });
  }

  try {
    const proxy = await fetch(
      `${MEDIA_API}/link/preview?url=${encodeURIComponent(target)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (proxy.ok) {
      const data = await proxy.json();
      return NextResponse.json(data, {
        headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
      });
    }
  } catch {
    // fall through to direct scrape
  }

  try {
    const scraped = await scrapeOpenGraph(target);
    if (!scraped) {
      return NextResponse.json({ error: "Preview unavailable." }, { status: 502 });
    }
    return NextResponse.json(scraped, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch {
    return NextResponse.json({ error: "Preview unavailable." }, { status: 502 });
  }
}
