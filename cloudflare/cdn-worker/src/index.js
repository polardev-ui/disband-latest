/**
 * cdn.disband.dev — image and attachment storage on Cloudflare R2.
 *
 * Deliberately API-compatible with the old api.wsgpolar.me service: uploads go
 * to POST /v1/images and come back as { url, key }, and objects are served
 * from GET /v1/images/<key>. Keeping the path identical means the only thing
 * that differs between an old URL and a new one is the hostname, so migrating
 * the database is a hostname swap and rolling back is the same swap reversed.
 */

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // Workers cap the request body here.

const ALLOWED_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/svg+xml",
  "video/mp4", "video/webm", "video/quicktime",
  "audio/mpeg", "audio/ogg", "audio/wav",
  "application/pdf", "text/plain",
]);

const EXT = {
  "image/png": "png", "image/jpeg": "jpeg", "image/gif": "gif", "image/webp": "webp",
  "image/avif": "avif", "image/svg+xml": "svg", "video/mp4": "mp4", "video/webm": "webm",
  "video/quicktime": "mov", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav",
  "application/pdf": "pdf", "text/plain": "txt",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "OPTIONS") return preflight(env);

    if (request.method === "POST" && pathname === "/v1/images") {
      return upload(request, env);
    }

    if ((request.method === "GET" || request.method === "HEAD")
        && pathname.startsWith("/v1/images/")) {
      return serve(request, env, decodeURIComponent(pathname.slice("/v1/images/".length)));
    }

    // Migration endpoint: pulls an object from the old host straight into R2
    // so the images never have to travel via a laptop. Guarded by a secret
    // that only the migration script knows.
    if (request.method === "POST" && pathname === "/v1/admin/ingest") {
      return ingest(request, env);
    }

    // Link previews and GIF search moved here from the old media host, so the
    // app talks to one origin it controls instead of two. Both are reads with
    // no side effects, which is why they are GET and cacheable.
    if ((request.method === "GET" || request.method === "HEAD")
        && pathname === "/v1/link/preview") {
      return linkPreview(request, env, url.searchParams.get("url"));
    }

    if ((request.method === "GET" || request.method === "HEAD")
        && pathname === "/v1/giphy/search") {
      return gifSearch(request, env, url.searchParams);
    }

    if (pathname === "/health") return json({ ok: true }, 200, env);

    return json({ error: "Not found" }, 404, env);
  },
};

/* ------------------------------------------------------------------ upload */

async function upload(request, env) {
  const auth = await requireUser(request, env);
  if (auth.error) return json({ error: auth.error }, auth.status, env);

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES) {
    return json({ error: "File is too large (max 100 MB)." }, 413, env);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Expected a multipart form." }, 400, env);
  }

  const file = form.get("file");
  if (!file || typeof file === "string") {
    return json({ error: "No file field in the form." }, 400, env);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return json({ error: "File is too large (max 100 MB)." }, 413, env);
  }

  const type = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.has(type)) {
    return json({ error: `Unsupported file type: ${type}` }, 415, env);
  }

  // SVG can carry script, and these are served from a domain that shares
  // cookies with nothing but is still worth not turning into an XSS host.
  const contentType = type === "image/svg+xml" ? "image/svg+xml" : type;
  const key = `${crypto.randomUUID()}.${EXT[type] ?? "bin"}`;

  await env.MEDIA.put(key, file.stream(), {
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
    },
    customMetadata: {
      uploadedBy: auth.userId ?? "anonymous",
      uploadedAt: new Date().toISOString(),
      originalName: (file.name ?? "").slice(0, 200),
    },
  });

  return json({ url: `${env.PUBLIC_BASE}/v1/images/${key}`, key }, 200, env);
}

/* ------------------------------------------------------------------- serve */

async function serve(request, env, key) {
  if (!key || key.includes("..") || key.includes("/")) {
    return json({ error: "Bad key" }, 400, env);
  }

  // Range requests matter for video scrubbing, so the request's own headers
  // are handed to R2 — but only when a range was actually asked for. Passing
  // them unconditionally made R2 report a range on every request, and the
  // response came back 206 to clients that had not asked for one, which is
  // not a valid answer to a plain GET.
  const wantsRange = request.headers.has("range");
  const object = await env.MEDIA.get(key, {
    ...(wantsRange ? { range: request.headers } : {}),
    onlyIf: request.headers,
  });

  if (object === null) return json({ error: "Not found" }, 404, env);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("access-control-allow-origin", "*");
  headers.set("x-content-type-options", "nosniff");
  // Never let a stored file execute as a document on this origin.
  headers.set("content-security-policy", "default-src 'none'; sandbox");

  if (!("body" in object)) {
    // A conditional request that matched: nothing to send.
    return new Response(null, { status: 304, headers });
  }
  if (wantsRange && object.range) {
    headers.set("content-range",
      `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
  }
  headers.set("accept-ranges", "bytes");

  const status = wantsRange && object.range ? 206 : 200;
  return new Response(request.method === "HEAD" ? null : object.body, { status, headers });
}

/* ----------------------------------------------------------- link preview */

/**
 * Only public http(s) targets are fetched.
 *
 * A preview endpoint fetches whatever URL it is handed, which is a request
 * forgery primitive if the target can be an internal address. Workers cannot
 * reach a private network from the edge, but a hostname is still refused when
 * it obviously names one — the check costs nothing and does not rely on that
 * staying true.
 */
function isFetchableUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return false;
  if (/^(?:0|127|10)\./.test(host)) return false;
  if (/^169\.254\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^172\.(?:1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (host === "[::1]" || host === "::1") return false;
  return true;
}

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'");
}

function metaContent(html, key) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']|`
      + `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
    "i",
  );
  const match = html.match(re);
  return decodeHtml((match?.[1] ?? match?.[2] ?? "").trim()) || undefined;
}

async function linkPreview(request, env, target) {
  if (!target) return json({ error: "Missing url parameter." }, 400, env);
  if (!isFetchableUrl(target)) return json({ error: "Invalid or disallowed url." }, 400, env);

  // Previews of the same link are identical for everyone, so one scrape per
  // hour serves every client rather than every client scraping for itself.
  const cache = caches.default;
  const cacheKey = new Request(`https://cdn.disband.dev/v1/link/preview?url=${encodeURIComponent(target)}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let upstream;
  try {
    upstream = await fetch(target, {
      headers: {
        "user-agent": "DisbandLinkPreview/1.0 (+https://www.disband.dev)",
        accept: "text/html,application/xhtml+xml",
      },
      // A redirect could land on an address the check above rejected, so the
      // hop is followed manually and re-checked rather than automatically.
      redirect: "manual",
      cf: { cacheTtl: 3600 },
    });

    const location = upstream.headers.get("location");
    if (upstream.status >= 300 && upstream.status < 400 && location) {
      const next = new URL(location, target).toString();
      if (!isFetchableUrl(next)) return json({ error: "Preview unavailable." }, 502, env);
      upstream = await fetch(next, {
        headers: { "user-agent": "DisbandLinkPreview/1.0 (+https://www.disband.dev)" },
        redirect: "manual",
      });
    }
  } catch {
    return json({ error: "Preview unavailable." }, 502, env);
  }

  if (!upstream.ok) return json({ error: "Preview unavailable." }, 502, env);
  if (!(upstream.headers.get("content-type") ?? "").includes("html")) {
    return json({ error: "Preview unavailable." }, 502, env);
  }

  // Open Graph tags live in <head>; reading the whole of a large page to find
  // them wastes the Worker's memory and time budget.
  const html = (await upstream.text()).slice(0, 512 * 1024);

  const title = metaContent(html, "og:title")
    ?? metaContent(html, "twitter:title")
    ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  const description = metaContent(html, "og:description")
    ?? metaContent(html, "description")
    ?? metaContent(html, "twitter:description");
  const image = metaContent(html, "og:image") ?? metaContent(html, "twitter:image");

  if (!title && !description && !image) {
    return json({ error: "Preview unavailable." }, 502, env);
  }

  let site = target;
  try {
    site = new URL(target).hostname;
  } catch {
    // keep the raw url
  }

  const body = {
    title: decodeHtml(title ?? site),
    description: description ? decodeHtml(description) : undefined,
    image: image && /^https:\/\//i.test(image) ? decodeHtml(image) : undefined,
    site,
  };

  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600",
      ...corsHeaders(env),
    },
  });
  await cache.put(cacheKey, response.clone());
  return response;
}

/* -------------------------------------------------------------------- gifs */

/**
 * GIF search, proxied so the API key stays on the server.
 *
 * The provider changed twice, once for a rate limit and once for a shutdown.
 * Giphy's free key allowed 100 calls an hour and 1,000 a day — a few hundred
 * people opening the picker past that before lunch broke it for everyone —
 * and Tenor, which had the headroom, was decommissioned by Google in June
 * 2026.
 *
 * Klipy is the current provider: a Tenor-style API (key in the path, fully
 * stated renditions) whose public allowance does not force a redesign. The
 * rate limit is still shaped around rather than trusted, though, because the
 * traffic makes caching nearly free: what costs a call is a *distinct cold
 * query*, not a user. Searches cluster hard — a hundred people type "cat",
 * "lol", "ok" — and the picker's opening screen is one query shared by
 * everybody. Two caches sit in front of Klipy:
 *
 *   1. The colo's edge cache. Free, instant, per-datacentre.
 *   2. R2, which every colo shares and which survives evictions.
 *
 * R2 also keeps answers well past the point where they are served as fresh,
 * so if Klipy does refuse, the picker shows a slightly old result rather than
 * an error. A day-old list of cat GIFs is not wrong; it is only unfashionable.
 */
async function gifSearch(request, env, params) {
  // Normalised so "Cat", "cat " and "CAT" are one cache entry rather than
  // three calls against the same allowance.
  const q = (params.get("q") ?? "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 100);
  const limit = Math.min(Math.max(Number(params.get("limit")) || 20, 1), 50);

  const edge = caches.default;
  const edgeKey = new Request(
    `https://cdn.disband.dev/v1/giphy/search?q=${encodeURIComponent(q)}&limit=${limit}`,
  );
  const edgeHit = await edge.match(edgeKey);
  if (edgeHit) return edgeHit;

  const stored = await readGifCache(env, q, limit);
  if (stored && stored.age < GIF_FRESH_SECONDS) {
    const response = gifResponse(env, stored.results);
    await edge.put(edgeKey, response.clone());
    return response;
  }

  let results;
  try {
    results = env.KLIPY_APP_KEY
      ? await searchKlipy(env, q, limit)
      : env.GIPHY_API_KEY
        ? await searchGiphy(env, q, limit)
        : await legacyGifSearch(env, q, limit);
  } catch (err) {
    // Rate-limited or down. A stale answer beats an empty picker, and this is
    // exactly the moment the allowance has run out.
    if (stored) return gifResponse(env, stored.results, { stale: true });
    return json({ error: err.message ?? "Could not reach GIF search." }, 502, env);
  }

  await writeGifCache(env, q, limit, results);
  const response = gifResponse(env, results);
  await edge.put(edgeKey, response.clone());
  return response;
}

/** How long a cached answer is served without asking Klipy again. */
const GIF_FRESH_SECONDS = 6 * 60 * 60;
/** How long it stays usable as a fallback once Klipy refuses. */
const GIF_STALE_SECONDS = 30 * 24 * 60 * 60;

function gifResponse(env, results, { stale = false } = {}) {
  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": `public, max-age=${GIF_FRESH_SECONDS}`,
      // Visible in devtools, so "why is this GIF list old" has an answer.
      ...(stale ? { "x-disband-gif-cache": "stale" } : {}),
      ...corsHeaders(env),
    },
  });
}

/**
 * Where a cached search lives in the bucket.
 *
 * The prefix contains a slash, and `serve()` refuses any key that does, so
 * these are not reachable through /v1/images/ — the cache cannot be read or
 * enumerated from outside.
 */
function gifCacheKey(q, limit) {
  return `gif-cache/${limit}/${encodeURIComponent(q || "__trending__")}.json`;
}

async function readGifCache(env, q, limit) {
  try {
    const object = await env.MEDIA.get(gifCacheKey(q, limit));
    if (!object) return null;
    const body = await object.json();
    const age = (Date.now() - (body.storedAt ?? 0)) / 1000;
    if (age > GIF_STALE_SECONDS) return null;
    return { results: body.results ?? [], age };
  } catch {
    // A cache that cannot be read is a cache miss, never an error.
    return null;
  }
}

async function writeGifCache(env, q, limit, results) {
  if (!results?.length) return;
  try {
    await env.MEDIA.put(
      gifCacheKey(q, limit),
      JSON.stringify({ storedAt: Date.now(), results }),
      { httpMetadata: { contentType: "application/json" } },
    );
  } catch {
    // Failing to cache is not worth failing the request over.
  }
}

/**
 * One GIF, in the shape every client already reads.
 *
 * `mp4` is the addition: an animated GIF is several times the bytes of the
 * same clip as video, and the URL used to have to be invented by swapping a
 * file extension — which 403s for the renditions that have no mp4. Both Giphy
 * and Klipy state it for the ones that do, so it is passed through rather
 * than guessed.
 */
function gifResult({ id, title, gif, preview, mp4, width, height }) {
  return {
    id,
    title,
    url: gif,
    preview: preview ?? gif,
    mp4,
    width: Number(width) || undefined,
    height: Number(height) || undefined,
    // The old nested Giphy shape, kept so an older client build still works.
    images: { fixed_width: { url: preview ?? gif }, original: { url: gif } },
  };
}

/**
 * The first URL of a format, walking renditions largest-first.
 *
 * Klipy publishes each rendition as a full object ({ url, width, height,
 * size }) in several sizes; callers pick which size they want by ordering the
 * list, and the format by name.
 */
function firstUrl(file, format, sizes) {
  for (const size of sizes) {
    const rendition = file?.[size]?.[format];
    if (rendition?.url) return rendition;
  }
  return null;
}

/**
 * Klipy search, or trending when the query is empty.
 *
 * Klipy's API is Tenor-shaped — app key in the path, never in query or header
 * — so the key cannot leak into a log or a referrer. Its v1 response nests
 * the array twice ({ data: { data: [...] }}) and each item carries a numeric
 * id plus a `file` tree keyed by size (hd/md/sm/xs) then format
 * (gif/webp/jpg/mp4/webm). That is flattened down to the one gifResult shape
 * every client already reads, with the small mp4 kept for the picker grid and
 * the full-size gif kept for what actually gets sent in chat.
 */
async function searchKlipy(env, q, limit) {
  const base = (env.KLIPY_BASE_URL ?? "https://api.klipy.com/api/v1/").replace(/\/+$/, "");
  const content = env.KLIPY_CONTENT_FILTER ?? "medium";

  // Klipy's per_page floor is 8 and cap is 50, so ask for the clamped size
  // and slice to the requested limit to keep the response contract exact.
  const perPage = Math.min(50, Math.max(8, limit));

  // Only the formats this client can show (gif, webp, mp4); Klipy says that
  // roughly halves the payload, and this response is cached for hours.
  const params = new URLSearchParams({
    per_page: String(perPage),
    content_filter: content,
    format_filter: "gif,webp,mp4",
  });
  if (q) params.set("q", q);

  const endpoint = `${base}/${env.KLIPY_APP_KEY}/gifs/${q ? "search" : "trending"}?${params}`;

  const res = await fetch(endpoint, { cf: { cacheTtl: GIF_FRESH_SECONDS } });
  if (!res.ok) {
    throw new Error(
      res.status === 429
        ? "GIF search is rate limited right now."
        : `GIF search failed (${res.status}).`,
    );
  }
  const payload = await res.json();
  const items = payload?.data?.data ?? [];

  return items
    .map((item) => {
      const gif = firstUrl(item.file, "gif", ["hd", "md", "sm"]);
      return gifResult({
        id: String(item.id ?? item.slug ?? ""),
        title: item.title,
        gif: gif?.url,
        preview: firstUrl(item.file, "gif", ["sm", "md", "xs", "hd"])?.url ?? gif?.url,
        mp4: firstUrl(item.file, "mp4", ["sm", "md"])?.url,
        width: gif?.width,
        height: gif?.height,
      });
    })
    .slice(0, limit)
    .filter((gif) => gif.url);
}

async function searchGiphy(env, q, limit) {
  const rating = env.GIPHY_RATING ?? "pg-13";
  const endpoint = q
    ? `https://api.giphy.com/v1/gifs/search?api_key=${env.GIPHY_API_KEY}&q=${encodeURIComponent(q)}&limit=${limit}&rating=${rating}&bundle=messaging_non_clips`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${env.GIPHY_API_KEY}&limit=${limit}&rating=${rating}&bundle=messaging_non_clips`;

  const res = await fetch(endpoint, { cf: { cacheTtl: GIF_FRESH_SECONDS } });
  if (!res.ok) {
    throw new Error(
      res.status === 429
        ? "GIF search is rate limited right now."
        : `GIF search failed (${res.status}).`,
    );
  }
  const payload = await res.json();

  return (payload.data ?? []).map((item) => gifResult({
    id: item.id,
    title: item.title,
    gif: item.images?.original?.url,
    preview: item.images?.fixed_width?.url ?? item.images?.preview_gif?.url,
    mp4: item.images?.original_mp4?.url ?? item.images?.looping?.mp4,
    width: item.images?.original?.width,
    height: item.images?.original?.height,
  })).filter((gif) => gif.url);
}

/**
 * The old media host, which still holds a Giphy key.
 *
 * Used while no GIPHY_API_KEY is set here, so the clients could be pointed at
 * this origin before the key moved rather than after. Returns the same
 * normalised results as the direct path so both feed the same cache.
 */
async function legacyGifSearch(env, q, limit) {
  const legacy = env.LEGACY_GIPHY_URL ?? "https://api.wsgpolar.me/v1/giphy/search";
  const res = await fetch(`${legacy}?q=${encodeURIComponent(q)}&limit=${limit}`, {
    cf: { cacheTtl: GIF_FRESH_SECONDS },
  });
  if (!res.ok) throw new Error(`GIF search failed (${res.status}).`);
  const payload = await res.json();
  const rows = payload.results ?? payload.data ?? [];

  return rows.map((item) => gifResult({
    id: item.id,
    title: item.title,
    gif: item.url ?? item.images?.original?.url,
    preview: item.preview ?? item.images?.fixed_width?.url,
    mp4: item.mp4,
    width: item.width,
    height: item.height,
  })).filter((gif) => gif.url);
}

/* ----------------------------------------------------------------- ingest */

async function ingest(request, env) {
  const secret = request.headers.get("x-migration-secret");
  if (!env.MIGRATION_SECRET || secret !== env.MIGRATION_SECRET) {
    return json({ error: "Forbidden" }, 403, env);
  }

  const { sourceUrl, key } = await request.json();
  if (!sourceUrl || !key || key.includes("/") || key.includes("..")) {
    return json({ error: "sourceUrl and a flat key are required" }, 400, env);
  }

  // Already copied: say so rather than fetching it again, so the script can
  // be re-run safely after a failure part way through.
  const existing = await env.MEDIA.head(key);
  if (existing) return json({ ok: true, key, skipped: true }, 200, env);

  const upstream = await fetch(sourceUrl);
  if (!upstream.ok || !upstream.body) {
    return json({ error: `Upstream ${upstream.status}`, key }, 502, env);
  }

  await env.MEDIA.put(key, upstream.body, {
    httpMetadata: {
      contentType: upstream.headers.get("content-type") ?? "application/octet-stream",
      cacheControl: "public, max-age=31536000, immutable",
    },
    customMetadata: { migratedFrom: sourceUrl, migratedAt: new Date().toISOString() },
  });

  return json({ ok: true, key }, 200, env);
}

/* -------------------------------------------------------------------- auth */

/**
 * Uploads require a signed-in Disband user.
 *
 * The old endpoint accepted anything from anyone, which makes the bucket free
 * storage for whoever finds the URL.
 *
 * The token is checked by asking Supabase who it belongs to, rather than by
 * verifying a signature here. That costs one request per upload — irrelevant
 * next to storing the file — and in exchange the Worker holds no secret at
 * all: the anon key is already public in every client. It also means a
 * session that has been revoked stops working immediately, which a local
 * signature check cannot know.
 */
async function requireUser(request, env) {
  if (env.REQUIRE_AUTH === "false") return { userId: null };

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return { error: "Sign in to upload.", status: 401 };

  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return { error: "Session expired — sign in again.", status: 401 };
    const user = await res.json();
    if (!user?.id) return { error: "Invalid session.", status: 401 };
    return { userId: user.id };
  } catch {
    return { error: "Could not verify your session.", status: 503 };
  }
}

/* ------------------------------------------------------------------- utils */

function corsHeaders(env) {
  return {
    "access-control-allow-origin": env.ALLOWED_ORIGIN ?? "*",
    "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type, x-migration-secret",
    "access-control-max-age": "86400",
  };
}

function preflight(env) {
  return new Response(null, { status: 204, headers: corsHeaders(env) });
}

function json(body, status, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders(env) },
  });
}
