// Regression tests for the detection rules. Run: deno test supabase/functions/content-sentinel/
//
// SAMPLES_SAFE holds real false positives from the first live sweep — people
// reporting abuse. If a change makes any of them "block" again, the sweep
// would punish reporters, so these must stay green.
import { scanText, SAMPLES_SAFE, SAMPLES_BLOCK } from "./rules.ts";

Deno.test("safe text never triggers automatic removal", () => {
  for (const sample of SAMPLES_SAFE) {
    const blocking = scanText(sample).filter((h) => h.rule.severity === "block");
    if (blocking.length) {
      throw new Error(`false positive: ${JSON.stringify(sample)} -> ${blocking.map((h) => h.rule.id)}`);
    }
  }
});

Deno.test("advertising illegal material is caught", () => {
  for (const sample of SAMPLES_BLOCK) {
    const blocking = scanText(sample).filter((h) => h.rule.severity === "block");
    if (!blocking.length) throw new Error(`missed: ${JSON.stringify(sample)}`);
  }
});

Deno.test("no rule auto-suspends on text alone", () => {
  for (const sample of SAMPLES_BLOCK) {
    for (const hit of scanText(sample)) {
      if (hit.rule.suspend) throw new Error(`${hit.rule.id} would suspend on text`);
    }
  }
});

Deno.test("very long input is bounded", () => {
  const huge = "a".repeat(500_000) + " selling cp dm me for the link";
  const started = Date.now();
  scanText(huge);
  const elapsed = Date.now() - started;
  if (elapsed > 500) throw new Error(`scan took ${elapsed}ms on a large input`);
});
