/**
 * Atomic @everyone tokens: any edit touching the token deletes the whole
 * thing. Pure text-diff logic (no DOM), so every input method behaves the
 * same — backspace, select-and-type, cut, paste-over, IME, mobile.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAtomicEveryone, everyoneSpans } from '../../src/lib/composer-tokens.ts';

test('untouched text and edits elsewhere pass through', () => {
  assert.equal(applyAtomicEveryone('hi @everyone', 'hi @everyone!'), null);
  assert.equal(applyAtomicEveryone('hi @everyone', 'hey hi @everyone'), null);
  assert.equal(applyAtomicEveryone('hello', 'hello!'), null);
  assert.equal(applyAtomicEveryone('@everyone hi', '@everyone hi!'), null);
});

test('backspacing the last character removes the whole token', () => {
  assert.deepEqual(applyAtomicEveryone('hi @everyone', 'hi @everyon'), {
    text: 'hi ',
    cursor: 3,
  });
});

test('backspacing inside the token removes the whole token', () => {
  assert.deepEqual(applyAtomicEveryone('hi @everyone bye', 'hi @evryone bye'), {
    text: 'hi  bye',
    cursor: 3,
  });
});

test('selecting part of the token and typing replaces it with the typed text', () => {
  // select "eryone", type "x": the token dies, "x" lands where it started.
  assert.deepEqual(applyAtomicEveryone('hi @everyone bye', 'hi @ex bye'), {
    text: 'hi x bye',
    cursor: 4,
  });
});

test('selecting the exact token and deleting clears it', () => {
  assert.deepEqual(applyAtomicEveryone('hi @everyone bye', 'hi  bye'), {
    text: 'hi  bye',
    cursor: 3,
  });
});

test('select-all plus typing keeps only the new text', () => {
  assert.deepEqual(applyAtomicEveryone('@everyone', 'hello'), {
    text: 'hello',
    cursor: 5,
  });
});

test('edits after the token are untouched and keep their cursor', () => {
  assert.equal(applyAtomicEveryone('@everyone hi', '@everyone hi!'), null);
});

test('matching is case-insensitive, partial words are not tokens', () => {
  assert.deepEqual(everyoneSpans('@Everyone ok'), [[0, 9]]);
  assert.deepEqual(everyoneSpans('@everyoneX ok'), []);
  assert.deepEqual(everyoneSpans('hi @everyone and @everyone bye'), [[3, 12], [17, 26]]);
});

test('deleting between two tokens touches neither; select-all clears both', () => {
  assert.deepEqual(applyAtomicEveryone('@everyone a @everyone', '@everyone  @everyone'), null);
  assert.deepEqual(applyAtomicEveryone('@everyone a @everyone', ''), { text: '', cursor: 0 });
});
