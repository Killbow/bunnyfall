// PLAIN-TEXT (2026-10-26; the owner: "We need a law to reduce over explanatory text + reduce the amount of ai-like
// crafted text"). bible/Home.md, SAY IT ONCE, PLAINLY: player strings, comments and the bible are held to the limits in
// tools/plainText.mjs. What was already past them is in tools/plainTextBaseline.json, which may only go down.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  measure, verdict, stringBreach, longCommentBlocks, longParagraphs, BASELINE, ROOT,
  STRING_WORDS_MAX, SENTENCE_WORDS_MAX, COMMENT_LINES_MAX, PARAGRAPH_WORDS_MAX,
} from '../../tools/plainText.mjs';

const base = JSON.parse(readFileSync(new URL(`../../${BASELINE}`, import.meta.url), 'utf8'));

test('PLAIN-TEXT the limits are the law\'s: 40 words a string, 25 a sentence, 8 lines a comment block, 150 words a bible paragraph', () => {
  assert.deepEqual([STRING_WORDS_MAX, SENTENCE_WORDS_MAX, COMMENT_LINES_MAX, PARAGRAPH_WORDS_MAX], [40, 25, 8, 150]);
});

test('PLAIN-TEXT a string: plain and short passes; too long, a sentence too long, or padding fails', () => {
  assert.equal(stringBreach('You cannot rest with enemies nearby.'), null);
  assert.equal(stringBreach('Your game could not be saved just now.'), null, '"just now" is plain English');
  assert.deepEqual(stringBreach(Array(41).fill('word.').join(' ')), { words: 41, sentence: 1, padding: [] });
  assert.equal(stringBreach(`${Array(26).fill('word').join(' ')}.`).sentence, 26);
  assert.equal(stringBreach('Simply press the key.').padding.length, 1);
  assert.equal(stringBreach('It is not just a sword.').padding.length, 1);
  assert.equal(stringBreach('A seamless journey.').padding.length, 1);
  assert.equal(stringBreach('{n, plural, one {# piece} other {# pieces}} made.'), null, 'an argument is one word');
});

test('PLAIN-TEXT a comment block past 8 lines counts, a block of 8 does not; a bible paragraph past 150 words counts, a table never', () => {
  const block = (n) => `${Array(n).fill('// a line').join('\n')}\nconst x = 1;\n`;
  assert.equal(longCommentBlocks(block(8)), 0);
  assert.equal(longCommentBlocks(block(9)), 1);
  assert.equal(longCommentBlocks(`/*\n${Array(8).fill(' * a line').join('\n')}\n */\nconst x = 1;\n`), 1);
  assert.equal(longCommentBlocks(`${block(9)}${block(9)}`), 2);
  assert.equal(longParagraphs(Array(150).fill('w').join(' ')), 0);
  assert.equal(longParagraphs(`${Array(151).fill('w').join(' ')}\n\n${Array(151).fill('w').join(' ')}`), 2);
  assert.equal(longParagraphs(`| ${Array(200).fill('w').join(' ')} |`), 0);
});

test('PLAIN-TEXT nothing grows past the law: every player string, every source file and every bible page is within its limit or its baseline, and a baseline lowered by a cleanup is written lower (node tools/plainText.mjs --lower)', () => {
  const { over, stale } = verdict(measure(ROOT), base);
  assert.deepEqual(over, [], 'past the law - shorten it, never raise the baseline');
  assert.deepEqual(stale, [], 'text got plainer - lower the baseline: node tools/plainText.mjs --lower');
});

test('PLAIN-TEXT the baseline only lists what breaks the law, and only ever with a count', () => {
  for (const part of ['strings', 'comments', 'bible']) {
    for (const [k, n] of Object.entries(base[part])) assert.ok(Number.isSafeInteger(n) && n > 0, `${part} ${k}`);
  }
});
