import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "../../packages/bot/src/client.js";

test("bot token requests reject redirects and have a bounded timeout", async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const client = new Client({ token: "test-token", requestTimeout: 5000 });
    await client._rest.get("/api/bot/me");
    assert.equal(captured.init.redirect, "error");
    assert.equal(captured.init.headers.Authorization, "Bot test-token");
    assert.ok(captured.init.signal instanceof AbortSignal);
    assert.equal(captured.url, "https://www.disband.dev/api/bot/me");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
