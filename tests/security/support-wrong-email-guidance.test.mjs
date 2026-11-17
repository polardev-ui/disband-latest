/**
 * Tether's wrong-email guidance must match the session it is in.
 *
 * The failure this guards against: a support chat signed in to a working
 * account tries the wrong-email form, relays the failed eligibility check,
 * tells the person to use Settings (which needs the login they don't have),
 * then repeats itself and escalates. The prompt now has to give the real
 * sign-out recovery path instead.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSupportSystemPrompt } from '../../src/lib/tether-support.ts';

test('support-only session is told the wrong-email form is available', () => {
  const prompt = buildSupportSystemPrompt('support_only');
  assert.match(prompt, /wrong-email form is available/);
  assert.match(prompt, /call open_email_fix_form/);
  assert.doesNotMatch(prompt, /Do not call open_email_fix_form/);
  // Account tools read the support-only login, not the account being fixed.
  assert.match(prompt, /NOT the mistyped account/);
});

test('working-account session is told to sign out and verify a usable email', () => {
  const prompt = buildSupportSystemPrompt('working_account');
  assert.match(prompt, /not available here/);
  assert.match(prompt, /Do not call open_email_fix_form/);
  assert.match(prompt, /sign out of this account/);
  assert.match(prompt, /open \/support/);
  assert.match(prompt, /verify an email they can access/);
  assert.match(prompt, /one email cannot belong to two accounts/);
});

test('prompt never sends someone who cannot sign in to Settings', () => {
  for (const kind of ['support_only', 'working_account']) {
    const prompt = buildSupportSystemPrompt(kind);
    assert.match(prompt, /Do not tell someone who cannot sign in to change their email in Settings/);
  }
  // Settings is still offered for the account they actually can sign in to.
  assert.match(buildSupportSystemPrompt('working_account'), /change THIS account's email/);
});

test('prompt forbids repeating the same reply or leaking tool mechanics', () => {
  for (const kind of ['support_only', 'working_account']) {
    const prompt = buildSupportSystemPrompt(kind);
    assert.match(prompt, /Never repeat an earlier reply word-for-word/);
    assert.match(prompt, /Never mention tool names, failed tool calls/);
    assert.match(prompt, /First acknowledge the specific thing they just said/);
  }
});
