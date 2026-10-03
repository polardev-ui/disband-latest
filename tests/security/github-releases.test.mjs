/**
 * macOS asset picker: Apple Silicon machines must be offered the arm64
 * build, never Intel.
 *
 * Regression: a Silicon MacBook was shown the Intel .dmg. The picker
 * already prefers ARM, but arch detection can fail inside webviews (no
 * userAgentData, no WebGL, empty navigator.platform) — these tests lock
 * the Silicon-first behavior for the real asset names across every
 * detection outcome.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyAsset,
  detectMacArchSync,
  pickAssetForPlatform,
} from '../../src/lib/github-releases.ts';

const ARM_DMG = 'Disband_2.32.11_aarch64.dmg';
const INTEL_DMG = 'Disband_2.32.11_x64.dmg';

function asset(name) {
  return classifyAsset(name, `https://example.com/${name}`);
}

test('v2.32.11 dmg names classify to the right arch', () => {
  const arm = asset(ARM_DMG);
  const intel = asset(INTEL_DMG);
  assert.equal(arm?.platform, 'macos');
  assert.equal(arm?.macArch, 'aarch64');
  assert.equal(arm?.label, 'macOS (Apple Silicon)');
  assert.equal(intel?.platform, 'macos');
  assert.equal(intel?.macArch, 'x64');
  assert.equal(intel?.label, 'macOS (Intel)');
});

test('silicon is picked however detection lands', () => {
  const assets = [asset(INTEL_DMG), asset(ARM_DMG)];
  // Detected arm, detected intel, detection failed entirely, and the
  // assets in either upload order.
  assert.equal(pickAssetForPlatform(assets, 'macos', 'aarch64')?.name, ARM_DMG);
  assert.equal(pickAssetForPlatform(assets, 'macos', 'x64')?.name, INTEL_DMG);
  assert.equal(pickAssetForPlatform(assets, 'macos', 'unknown')?.name, ARM_DMG);
  assert.equal(
    pickAssetForPlatform([asset(ARM_DMG), asset(INTEL_DMG)], 'macos', 'unknown')?.name,
    ARM_DMG,
  );
});

test('intel-only release still offers intel', () => {
  const assets = [asset(INTEL_DMG)];
  assert.equal(pickAssetForPlatform(assets, 'macos', 'unknown')?.name, INTEL_DMG);
});

test('no navigator means unknown, never a wrong arch', () => {
  // Node has no Mac browser navigator.
  assert.equal(detectMacArchSync(), 'unknown');
});
