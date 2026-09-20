#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const SOURCE =
  "https:(HTTP ${res.status}).`);
    process.exit(1);
  }

  const domains = [
    ...new Set(
      (await res.text())
        .split("\n")
        .map((line) => line.trim().toLowerCase())
        .filter((line) => line && !line.startsWith("#") && DOMAIN_RE.test(line)),
    ),
  ];
  console.log(`Upstream list: ${domains.length} domains`);

  for (let i = 0; i < domains.length; i += BATCH) {
    const rows = domains.slice(i, i + BATCH).map((domain) => ({ domain }));
    const post = await fetch(`${url}/rest/v1/blocked_email_domains?on_conflict=domain`, {
      method: "POST",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    });
    if (!post.ok) {
      console.error(`Batch failed (HTTP ${post.status}): ${(await post.text()).slice(0, 300)}`);
      process.exit(1);
    }
    process.stdout.write(`\r  synced ${Math.min(i + BATCH, domains.length)}/${domains.length}`);
  }

  console.log("\nDone.");
}

main();
