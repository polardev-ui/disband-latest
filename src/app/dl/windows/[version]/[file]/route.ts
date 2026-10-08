import { GITHUB_REPO_SLUG } from "@/lib/github-releases";

/**
 * Stable, redirect-free download URLs for the Windows installers:
 *
 *   https://disband.dev/dl/windows/2.32.33/Disband_2.32.33_x64_en-US.msi
 *
 * The Microsoft Store wants a versioned https URL that serves the file
 * directly. GitHub release links redirect to short-lived signed storage
 * URLs, which the Store rejects. This route fetches the asset server-side
 * (following GitHub's redirect) and streams it back as a plain 200.
 *
 * Only exact Disband installer names for the version in the path are
 * accepted, so it can't be used to proxy anything else.
 */

const VERSION = /^\d+\.\d+\.\d+$/;

function allowedFile(version: string, file: string): string | null {
  const allowed: Record<string, string> = {
    [`Disband_${version}_x64_en-US.msi`]: "application/x-msi",
    [`Disband_${version}_x64-setup.exe`]: "application/vnd.microsoft.portable-executable",
  };
  return allowed[file] ?? null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ version: string; file: string }> },
) {
  const { version, file } = await params;
  if (!VERSION.test(version)) return new Response("Not found", { status: 404 });
  const contentType = allowedFile(version, file);
  if (!contentType) return new Response("Not found", { status: 404 });

  const upstream = await fetch(
    `https://github.com/${GITHUB_REPO_SLUG}/releases/download/v${version}/${encodeURIComponent(file)}`,
    { redirect: "follow" },
  );
  if (!upstream.ok || !upstream.body) {
    return new Response("Not found", { status: upstream.status === 404 ? 404 : 502 });
  }

  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${file}"`,
    // A versioned file never changes, so it can be cached for good.
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);

  return new Response(upstream.body, { status: 200, headers });
}
