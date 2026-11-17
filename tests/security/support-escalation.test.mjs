/**
 * Human-review detection must catch natural wording without turning ordinary
 * replies into escalations. The support route only hands a ticket to a human
 * when Tether's last reply offered a handoff AND the user's short reply
 * approves it.
 */
import { registerHooks } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/server') return nextResolve('next/server.js', context);
    return nextResolve(specifier, context);
  },
});

const { offersHumanReview, isSupportEscalationApproval } = await import(
  '../../src/app/api/support/tickets/[id]/messages/route.ts'
);

test('recognizes natural human-review offers', () => {
  for (const reply of [
    'I can send this up for human review—does that sound good?',
    'Would you like me to pass this to a human reviewer?',
    'Shall I hand this over to our support team?',
    'Want me to escalate this?',
    'I can hand it to a person on our team. Should I?',
  ]) {
    assert.equal(offersHumanReview(reply), true, reply);
  }
});

test('does not treat ordinary replies as human-review offers', () => {
  for (const reply of [
    'Your account is not restricted.',
    'I can send a password reset to your inbox.',
    'Human review usually takes up to 48 hours.',
    'Escalation is not possible on your current plan.',
    'Here is how to fix your email in Settings.',
  ]) {
    assert.equal(offersHumanReview(reply), false, reply);
  }
});

test('recognizes short approvals, including punctuation', () => {
  for (const answer of [
    'yes',
    'Yes please!',
    'please do',
    'go for it',
    'Go ahead.',
    'sounds good',
    'That works',
    'Please escalate',
    'okay, go ahead',
    'yes please do',
    'yes, that works',
  ]) {
    assert.equal(isSupportEscalationApproval(answer), true, answer);
  }
});

test('does not treat refusals or unrelated replies as approvals', () => {
  for (const answer of [
    'no',
    'No thanks.',
    'not yet',
    "Please don't",
    "no, don't escalate",
    'Yes, but not yet',
    'Can you explain that again?',
    'I still cannot log in',
  ]) {
    assert.equal(isSupportEscalationApproval(answer), false, answer);
  }
});
