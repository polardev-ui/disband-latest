#!/usr/bin/env node
/**
 * Git error: "dst refspec main matches more than one"
 *
 * Cause: both refs/heads/main (branch) and refs/tags/main (tag) exist.
 * Pushing `origin main` is ambiguous — Git doesn't know which ref you mean.
 *
 * Usage:
 *   node scripts/fix-main-ref-conflict.mjs              # diagnose
 *   node scripts/fix-main-ref-conflict.mjs --push       # push branch unambiguously
 *   node scripts/fix-main-ref-conflict.mjs --delete-tag # remove the bad tag (local + remote)
 */
import { execSync } from "node:child_process";

const REMOTE = process.env.GIT_REMOTE || "origin";
const REPO = process.env.GITHUB_REPOSITORY || "polardev-ui/disband-latest";
const REMOTE_URL = process.env.GIT_REMOTE_URL || `https://github.com/${REPO}.git`;

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf8", stdio: opts.silent ? "pipe" : "inherit", ...opts });
}

function runCapture(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: "pipe" }).trim();
}

function lsRemote(ref) {
  try {
    return runCapture(`git ls-remote "${REMOTE_URL}" ${ref}`).split("\t")[0] || "";
  } catch {
    return "";
  }
}

function hasLocalTagMain() {
  try {
    runCapture("git rev-parse -q --verify refs/tags/main");
    return true;
  } catch {
    return false;
  }
}

function printFixSteps() {
  console.log("Problem: a tag named `main` conflicts with the `main` branch.");
  console.log("That makes `git push origin main` fail.\n");
  console.log("Fix (pick one):\n");
  console.log("  1. Push without ambiguity (works immediately):");
  console.log(`     git push ${REMOTE} refs/heads/main`);
  console.log("     — or —");
  console.log("     pnpm run git:push-main\n");
  console.log("  2. Remove the bad tag permanently (recommended once):");
  console.log(`     git push ${REMOTE} :refs/tags/main`);
  console.log("     — or —");
  console.log("     pnpm run git:fix-main-ref\n");
  console.log("  After deleting the tag, `git push origin main` works normally again.");
}

const args = new Set(process.argv.slice(2));

if (args.has("--push")) {
  run(`git push ${REMOTE} refs/heads/main`);
  process.exit(0);
}

if (args.has("--delete-tag")) {
  if (hasLocalTagMain()) {
    console.log("Deleting local tag refs/tags/main …");
    run("git tag -d main");
  }
  console.log(`Deleting remote tag refs/tags/main on ${REMOTE} …`);
  run(`git push ${REMOTE} :refs/tags/main`);
  console.log("Done. You can use `git push origin main` again.");
  process.exit(0);
}

console.log("Checking for the main branch / main tag conflict …\n");

const remoteBranch = lsRemote("refs/heads/main");
const remoteTag = lsRemote("refs/tags/main");

console.log(`Repository: ${REPO}`);
console.log(`  refs/heads/main : ${remoteBranch || "(missing)"}`);
console.log(`  refs/tags/main  : ${remoteTag || "(missing)"}`);
console.log(`  local tag main  : ${hasLocalTagMain() ? "yes" : "no"}\n`);

if (remoteTag) {
  printFixSteps();
} else {
  console.log("No refs/tags/main on the remote — the ambiguous ref conflict is not present.");
  console.log("If push still fails, run: pnpm run git:push-main");
}
