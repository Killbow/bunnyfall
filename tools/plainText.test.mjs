// Checks for the plain-text tool, run with: node --test tools/plainText.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { baselineKey, measure, verdict, BASELINE, ROOT } from './plainText.mjs';

test('a Windows path becomes the baseline key', () => {
  const baseline = JSON.parse(readFileSync(`${ROOT}/${BASELINE}`, 'utf8'));
  const [key] = Object.keys(baseline.comments);
  assert.ok(key.includes('/'));
  assert.equal(baselineKey(key.replaceAll('/', '\\'), '\\'), key);
});

test('a path with forward slashes is unchanged', () => {
  assert.equal(baselineKey('src/ui/x.js', '/'), 'src/ui/x.js');
});

test('measured keys never hold a backslash', () => {
  for (const part of Object.values(measure())) for (const key of Object.keys(part)) assert.ok(!key.includes('\\'), key);
});

test('no file is past its baseline', () => {
  const baseline = JSON.parse(readFileSync(`${ROOT}/${BASELINE}`, 'utf8'));
  const { over, stale } = verdict(measure(), baseline);
  assert.deepEqual(over, []);
  assert.deepEqual(stale, []);
});

test('a file past its baseline is reported', () => {
  const { over } = verdict({ comments: { 'src/a.js': 9 } }, { comments: { 'src/a.js': 8 } });
  assert.equal(over.length, 1);
});
