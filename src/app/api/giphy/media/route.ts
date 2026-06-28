import { NextResponse } from "next/server";

const GIPHY_DOMAIN_RE = /^(?:[a-z0-9-]+\.)*giphy\.com$/;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (!GIPHY_DOMAIN_RE.test(parsed.hostname)) {
    return NextResponse.json({ error: "Only giphy.com URLs are allowed" }, { status: 403 });
  }

  const response = await fetch(url, {
    headers: { "Accept": "video/mp4,image/webp,image/gif,*/*" },
  });

  if (!response.ok) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: response.status });
  }

  const headers = new Headers({
    "Content-Type": response.headers.get("Content-Type") ?? "application/octet-stream",
    "Cache-Control": "public, max-age=86400, s-maxage=86400",
  });

  return new NextResponse(response.body, { status: 200, headers });
}
