import { NextResponse } from "next/server";
import { parseGitHubRelease } from "@/lib/github-releases";

export async function GET() {
  const repo = process.env.NEXT_PUBLIC_GITHUB_REPO ?? "wsgpolar/disband";
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Disband-Release-Fetcher",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers,
    next: { revalidate: 300 },
  });

  if (res.status === 404) {
    return NextResponse.json({ release: null, assets: [] });
  }

  if (!res.ok) {
    return NextResponse.json({ error: "Could not load releases." }, { status: 502 });
  }

  const json = await res.json();
  const release = parseGitHubRelease(json);
  return NextResponse.json({ release, assets: release.assets });
}
