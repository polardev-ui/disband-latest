import { NextResponse } from "next/server";
import { GITHUB_REPO_SLUG, pickLatestSemverRelease } from "@/lib/github-releases";

export async function GET() {
  const repo = GITHUB_REPO_SLUG;
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Disband-Release-Fetcher",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=30`, {
    headers,
    next: { revalidate: 300 },
  });

  if (res.status === 404) {
    return NextResponse.json({ release: null, assets: [] });
  }

  if (!res.ok) {
    return NextResponse.json({ error: "Could not load releases." }, { status: 502 });
  }

  const rows = await res.json();
  const release = pickLatestSemverRelease(Array.isArray(rows) ? rows : []);
  return NextResponse.json({ release, assets: release?.assets ?? [] });
}
