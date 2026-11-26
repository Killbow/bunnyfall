import test from 'node:test';
import assert from 'node:assert/strict';
import {
  charNameOf, resolvedOf, offerAnswerKind, homeOwnerFieldsOf, ownersViewOf, ownersRole, addCandidates, homeMayTransfer, homeHasOwners, ownersRefusal, CHAR_NAME_MAX,
} from '../src/homes/homeOwnerLaw.js';
import { homeOwnerRows, HOME_VERB } from '../src/homes/onlineHomes.js';

test('character names: trimmed, spaces kept, bounded, no control characters', () => {
  assert.equal(charNameOf('  Mara Vell '), 'Mara Vell');
  assert.equal(charNameOf(''), null);
  assert.equal(charNameOf('   '), null);
  assert.equal(charNameOf('a'.repeat(CHAR_NAME_MAX)), 'a'.repeat(CHAR_NAME_MAX));
  assert.equal(charNameOf('a'.repeat(CHAR_NAME_MAX + 1)), null);
  assert.equal(charNameOf('bad\u0007name'), null);
  assert.equal(charNameOf(7), null);
});

test('resolve answer keeps well-formed matches, own flag and note, bounded', () => {
  const m = [{ char: 'r1', name: 'Mara', account: 'ann' }, { name: 'x' }, { char: 'r2', name: 'Mara', account: 'me', own: true, note: 'level 3 Mage' }];
  const r = resolvedOf({ ok: true, data: { matches: m, more: true } });
  assert.deepEqual(r.matches.map((x) => [x.char, x.own, x.note]), [['r1', false, ''], ['r2', true, 'level 3 Mage']]);
  assert.equal(r.more, true);
  assert.deepEqual(resolvedOf({ ok: true, matches: m }).matches.length, 2);
  assert.deepEqual(resolvedOf({}), { matches: [], more: false });
  assert.equal(resolvedOf({ matches: Array.from({ length: 30 }, (_, i) => ({ char: `r${i}`, name: 'n' })) }).matches.length, 9);
});

test('offer answers: moved, sent, refused', () => {
  assert.equal(offerAnswerKind({ ok: true, data: { ok: true, moved: true } }), 'moved');
  assert.equal(offerAnswerKind({ ok: true, moved: true }), 'moved');
  assert.equal(offerAnswerKind({ ok: true, data: { ok: true } }), 'sent');
  assert.equal(offerAnswerKind({ ok: false, error: 'no-reader' }), 'refused');
  assert.equal(offerAnswerKind(null), 'refused');
});

test('home read fields: main, co-owner, main name; absent reads as the main', () => {
  assert.deepEqual(homeOwnerFieldsOf({ main: false, coOwner: true, mainName: 'Mara' }), { isMain: false, coOwner: true, mainName: 'Mara' });
  assert.deepEqual(homeOwnerFieldsOf({}), { isMain: true, coOwner: false, mainName: null });
  assert.equal(homeOwnerFieldsOf({ main: true }).isMain, true);
});

test('owners list reads either key and bounds the list', () => {
  const v = ownersViewOf({ ok: true, data: { main: { char: 'm', name: 'Main' }, owners: [{ char: 'a', name: 'A', at: 5 }, { name: 'bad' }] } });
  assert.deepEqual(v, { main: { char: 'm', name: 'Main' }, coOwners: [{ char: 'a', name: 'A', at: 5 }] });
  assert.deepEqual(ownersViewOf({ data: { coOwners: [] } }).coOwners, []);
});

test('roles: the main adds and removes anyone, a co-owner removes itself, others read', () => {
  const view = { main: { char: 'm', name: 'M' }, coOwners: [{ char: 'a', name: 'A', at: 1 }, { char: 'b', name: 'B', at: 2 }] };
  const main = ownersRole(view, 'm');
  assert.ok(main.isMain && main.canAdd && main.canRemove(view.coOwners[0]) && main.canRemove(view.coOwners[1]));
  const co = ownersRole(view, 'a');
  assert.ok(!co.isMain && !co.canAdd && co.canRemove(view.coOwners[0]) && !co.canRemove(view.coOwners[1]));
  const other = ownersRole(view, 'z');
  assert.ok(!other.canAdd && !other.canRemove(view.coOwners[0]));
  const full = { main: view.main, coOwners: Array.from({ length: 8 }, (_, i) => ({ char: `c${i}`, name: 'n', at: i })) };
  assert.equal(ownersRole(full, 'm').canAdd, false);
});

test('add candidates skip the main, co-owners, and the dead', () => {
  const view = { main: { char: 'm', name: 'M' }, coOwners: [{ char: 'a', name: 'A', at: 1 }] };
  const chars = [{ id: 'm', name: 'M' }, { id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'd', name: 'D', dead_at: 3 }];
  assert.deepEqual(addCandidates(chars, view, 'm').map((c) => c.id), ['b']);
});

test('door rows: transfer for the main only, co-owners row on held houses, none on deeds', () => {
  const rows = (home) => homeOwnerRows('private', home).map((r) => r.id);
  assert.ok(rows({ own: true, isMain: true }).includes(HOME_VERB.give));
  assert.ok(rows({ own: true, isMain: true }).includes(HOME_VERB.owners));
  assert.ok(!rows({ own: true, isMain: false }).includes(HOME_VERB.give));
  assert.ok(rows({ own: true, isMain: false }).includes(HOME_VERB.owners));
  assert.ok(!rows({ own: true, deed: true }).includes(HOME_VERB.owners));
  assert.ok(!rows({ own: true, hall: { name: 'x' } }).includes(HOME_VERB.owners));
  assert.ok(homeOwnerRows('private').map((r) => r.id).includes(HOME_VERB.give));
  assert.equal(homeMayTransfer({ own: true, isMain: false }), false);
  assert.equal(homeHasOwners({ own: false }), false);
});

test('refusals: known words, a plain line for unknown home codes, the account words otherwise', () => {
  const fb = (c) => (c === 'no-reader' ? 'No such reader.' : 'Server.');
  assert.match(ownersRefusal('home-owners-full', fb), /8 co-owners/);
  assert.match(ownersRefusal('home-zzz', fb), /could not be changed/);
  assert.equal(ownersRefusal('no-reader', fb), 'No such reader.');
});

test('refusal words: the delete retry and a full co-owner list each have their own text', async () => {
  const { accountRefusalText } = await import('../src/net/accountClient.js');
  const server = accountRefusalText('server');
  assert.equal(accountRefusalText('home-plan-changed'), 'The houses owned by this character changed while deleting. Nothing was deleted. Try again.');
  assert.equal(accountRefusalText('home-owners-full'), 'This house already has 8 co-owners.');
  assert.match(accountRefusalText('home-heir-full'), /sell or transfer a house owned by one of its co-owners/);
  for (const code of ['home-plan-changed', 'home-owners-full', 'home-heir-full']) assert.notEqual(accountRefusalText(code), server);
});
