
const APP_ID = "6783881800";
const LOOKUP = `https://itunes.apple.com/lookup?id=${APP_ID}`;
const PAGE = `https://apps.apple.com/app/id${APP_ID}`;
const EVERY_MS = 60_000;

const stamp = () => new Date().toLocaleTimeString(undefined, { hour12: false });

async function check() {
  let live = false;
  let detail = "";

  try {
    const res = await fetch(LOOKUP, { cache: "no-store" });
    const json = await res.json();
    if (json.resultCount > 0) {
      const app = json.results[0];
      live = true;
      detail = `${app.trackName} ${app.version}`;
    }
  } catch (err) {
    detail = `lookup failed: ${err.message}`;
  }

  let pageOk = false;
  try {
    const res = await fetch(PAGE, { redirect: "follow" });
    pageOk = res.ok;
  } catch { /* treated as not-yet-live */ }

  return { live: live && pageOk, detail, pageOk };
}

console.log(`Watching ${PAGE}\nChecking every ${EVERY_MS / 1000}s. Ctrl-C to stop.\n`);

for (;;) {
  const { live, detail, pageOk } = await check();
  if (live) {
    console.log(`\n[${stamp()}]  LIVE — ${detail}`);
    console.log(`\n${PAGE}\n`);
    console.log("Safe to send the launch broadcast. Load the URL once yourself first.");
    process.exit(0);
  }
  console.log(`[${stamp()}]  not yet — lookup ${detail || "empty"}, page ${pageOk ? "200" : "404"}`);
  await new Promise((r) => setTimeout(r, EVERY_MS));
}
