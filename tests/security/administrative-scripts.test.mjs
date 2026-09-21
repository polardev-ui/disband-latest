import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("administrative scripts parse without executing production operations", () => {
  for (const name of readdirSync("scripts").filter((name) => name.endsWith(".mjs"))) {
    const result = spawnSync(process.execPath, ["--check", join("scripts", name)], { encoding: "utf8" });
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
  }
});
