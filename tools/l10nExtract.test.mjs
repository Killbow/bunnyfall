// Checks for the catalog extractor, run with: node --test tools/l10nExtract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'acorn';
import { extractPortStrings, keyPrefixes, keptRows, catalogCsv, ROOT, CATALOG_PATH } from './l10nExtract.mjs';

const found = extractPortStrings();

test('a key built at run time is skipped, not refused', () => {
  assert.deepEqual(found.problems, []);
  assert.ok(found.skipped.length > 0);
});

test('messages name files with forward slashes', () => {
  for (const line of [...found.skipped, ...found.problems]) assert.ok(!line.includes('\\'), line);
  for (const { at } of found.strings.values()) assert.ok(!at.includes('\\'), at);
});

const prefixesOf = (code) => keyPrefixes(parse(code, { ecmaVersion: 'latest' }).body[0].expression);

test('a key built at run time gives its literal start', () => {
  assert.deepEqual(prefixesOf('`tavern.room.${id}.cue`'), ['tavern.room.']);
  assert.deepEqual(prefixesOf("'tavern.favor.offer.' + id"), ['tavern.favor.offer.']);
  assert.deepEqual(prefixesOf("a ? 'x.one' : 'x.two'"), ['x.one', 'x.two']);
  assert.deepEqual(prefixesOf('`${id}.cue`'), []);
});

test('writing keeps the rows a run-time key can use and drops dead ones', () => {
  const onDisk = 'Key,Value\ntavern.room.a,"A"\ndead.row,"D"\nlive.row,"old"\n';
  const strings = new Map([['live.row', { en: 'new', at: 'x:1' }]]);
  const kept = keptRows(onDisk, strings, new Set(['tavern.room.']));
  assert.deepEqual(kept, [['tavern.room.a', 'A']]);
  const csv = catalogCsv(strings, kept);
  assert.ok(csv.includes('tavern.room.a') && csv.includes('"new"') && !csv.includes('dead.row'));
});

test('every skipped call has a literal start', () => {
  assert.deepEqual(found.unbounded, []);
});

test('the catalog on disk is in step with the source', () => {
  const onDisk = readFileSync(`${ROOT}/${CATALOG_PATH}`, 'utf8');
  assert.equal(onDisk, catalogCsv(found.strings, keptRows(onDisk, found.strings, found.prefixes)));
});
