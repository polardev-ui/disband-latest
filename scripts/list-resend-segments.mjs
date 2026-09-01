/**
 * Prints the Resend segment (formerly audience) IDs for this account, so the
 * newsletter env var can be filled in without guessing.
 *
 * Reads RESEND_API_KEY from the environment — the key is never written
 * anywhere, and only ids and names are printed.
 *
 *   RESEND_API_KEY=re_... node scripts/list-resend-segments.mjs
 */
const key = process.env.RESEND_API_KEY;
if (!key) {
  console.error("RESEND_API_KEY is not set.\n");
  console.error("  RESEND_API_KEY=re_... node scripts/list-resend-segments.mjs");
  process.exit(1);
}

async function fetchList(path) {
  const res = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    return { ok: false, status: res.status, body: await res.text().catch(() => "") };
  }
  return { ok: true, json: await res.json() };
}

// Segments is current; audiences is the deprecated name and still works on
// older accounts, so fall back rather than reporting an empty list.
let result = await fetchList("/segments");
let label = "segment";

if (!result.ok) {
  const fallback = await fetchList("/audiences");
  if (fallback.ok) {
    result = fallback;
    label = "audience";
  } else {
    console.error(`Resend request failed (${result.status}).`);
    console.error(result.body || "(no body)");
    if (result.status === 401) console.error("\nThat usually means the API key is wrong or revoked.");
    process.exit(1);
  }
}

const items = result.json?.data ?? [];
if (items.length === 0) {
  console.log(`No ${label}s found. Create one in the Resend dashboard first.`);
  process.exit(0);
}

console.log(`Found ${items.length} ${label}${items.length === 1 ? "" : "s"}:\n`);
for (const item of items) {
  console.log(`  ${item.name}`);
  console.log(`    RESEND_NEWSLETTER_SEGMENT_ID=${item.id}\n`);
}
console.log("Copy the line for your newsletter list into Vercel (Production), then redeploy.");
