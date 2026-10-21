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

Deno.test("a direct hard-R slur is detected for report review", () => {
  const hits = scanText("you are a nigger");
  const hit = hits.find((h) => h.rule.id === "hate.nword");
  if (!hit) throw new Error("missed hard-R slur");
  if (hit.rule.severity !== "review") throw new Error("slur must not auto-block globally");
  if (hit.demoted) throw new Error("a direct slur must not be treated as a quote");
});

Deno.test("slur variants are covered", () => {
  for (const sample of ["n1gger", "n!gga", "NIGGA", "nigguh"]) {
    if (!scanText(sample).some((h) => h.rule.id === "hate.nword")) {
      throw new Error(`missed variant ${sample}`);
    }
  }
});

Deno.test("harmless lookalikes do not trip the slur rule", () => {
  for (const sample of ["the Niger river", "niger seed", "sniggering"]) {
    if (scanText(sample).some((h) => h.rule.id === "hate.nword")) {
      throw new Error(`false positive: ${sample}`);
    }
  }
});

Deno.test("quoting or reporting a slur is demoted", () => {
  const hits = scanText("someone called me a nigger, reporting it");
  const hit = hits.find((h) => h.rule.id === "hate.nword");
  if (!hit?.demoted) throw new Error("reported slur should be demoted, not actioned");
});

Deno.test("a direct threat is detected for report review", () => {
  const hit = scanText("i will kill you").find((h) => h.rule.id === "threat.direct_violence");
  if (!hit) throw new Error("missed direct threat");
  if (hit.demoted) throw new Error("direct threat should not be demoted");
});
