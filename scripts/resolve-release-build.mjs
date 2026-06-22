/**
 * Resolve checkout ref and release tag for Release Desktop CI.
 *
 * Pre-checkout (--phase=pre): validate inputs, no repo required.
 * Post-checkout (--phase=post): derive vX.Y.Z from package.json for branch builds.
 */
import { readFileSync, appendFileSync } from "node:fs";

const phase = process.argv.find((arg) => arg.startsWith("--phase="))?.split("=")[1] ?? "pre";

function out(key, value) {
  appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

const semverTag = /^v\d+\.\d+\.\d+$/;

if (phase === "pre") {
  const event = process.env.EVENT;
  const inputTag = (process.env.INPUT_TAG ?? "").trim();
  const inputRef = (process.env.INPUT_REF ?? "main").trim();
  const refName = process.env.REF_NAME ?? "";

  if (event === "push") {
    if (!semverTag.test(refName)) {
      console.error(`Invalid tag push ref "${refName}". Expected vMAJOR.MINOR.PATCH.`);
      process.exit(1);
    }
    out("mode", "tag");
    out("checkout_ref", refName);
    out("release_tag", refName);
    process.exit(0);
  }

  if (event === "workflow_dispatch") {
    if (inputTag) {
      if (!semverTag.test(inputTag)) {
        console.error(`Invalid release tag "${inputTag}". Expected vMAJOR.MINOR.PATCH (e.g. v0.4.2).`);
        process.exit(1);
      }
      out("mode", "tag");
      out("checkout_ref", inputTag);
      out("release_tag", inputTag);
      process.exit(0);
    }

    out("mode", "branch");
    out("checkout_ref", inputRef);
    console.log(`Manual build from ref "${inputRef}" (tag will come from package.json).`);
    process.exit(0);
  }

  console.error(`Unsupported event "${event}".`);
  process.exit(1);
}

if (phase === "post") {
  if (process.env.BUILD_MODE !== "branch") {
    process.exit(0);
  }

  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const tag = `v${pkg.version}`;
  if (!semverTag.test(tag)) {
    console.error(`package.json version "${pkg.version}" is not valid semver.`);
    process.exit(1);
  }

  out("name", tag);
  console.log(`Release tag: ${tag}`);
  process.exit(0);
}

console.error(`Unknown phase "${phase}".`);
process.exit(1);
