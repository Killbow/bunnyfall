import test from 'node:test';
import assert from 'node:assert/strict';
import { openHomeTransfer } from '../src/ui/homeTransferWindow.js';
import { openHomeOwners } from '../src/ui/homeOwnersWindow.js';

const press = (win, code) => win.input(code);
const flush = () => new Promise((r) => setImmediate(r));

const transferHost = (answers, sent) => ({
  onlineHomes: { transfer: async (b) => { sent.push(b); return b.op === 'resolve' ? { ok: true, data: { matches: answers } } : { ok: true, data: { ok: true } }; } },
  decorCharacter: () => 'rme',
});
const start = async (host, said, shown, name) => {
  openHomeTransfer(1, 2, host, (s) => said.push(s), String, null, (w) => shown.push(w));
  await flush();
  shown.at(-1).onSubmit(name);
  await flush(); await flush();
};

test('transfer: one own match asks the move confirmation, which names the co-owner, then sends toChar', async () => {
  const sent = []; const said = []; const shown = [];
  await start(transferHost([{ char: 'rtwo', name: 'Second One', account: 'me', own: true, note: '' }], sent), said, shown, 'second one');
  assert.deepEqual(sent[0], { op: 'resolve', mapId: 1, buildingKey: 2, toName: 'second one' });
  const ask = shown.at(-1);
  assert.match(ask.lines[0], /Make Second One the main owner.*You become a co-owner/);
  press(ask, 'KeyY');
  await flush();
  assert.deepEqual(sent[1], { op: 'offer', mapId: 1, buildingKey: 2, toName: 'Second One', toChar: 'rtwo', price: 0, keepDecor: true, keepItems: true });
});

test('transfer: one match on another account goes to price steps and pins toChar', async () => {
  const sent = []; const said = []; const shown = [];
  await start(transferHost([{ char: 'r9', name: 'Zed', account: 'bo', own: false, note: '' }], sent), said, shown, 'Zed');
  shown.at(-1).onSubmit('50');
  press(shown.at(-1), 'KeyY');
  press(shown.at(-1), 'KeyY');
  press(shown.at(-1), 'KeyY');
  await flush();
  assert.deepEqual(sent.at(-1), { op: 'offer', mapId: 1, buildingKey: 2, toName: 'Zed', toChar: 'r9', price: 50, keepDecor: true, keepItems: true });
});

test('P5: one own Bob and one other Bob list both; the other row leads to the price step and an offer with toChar', async () => {
  const sent = []; const said = []; const shown = [];
  await start(transferHost([{ char: 'ro', name: 'Bob', account: 'me', own: true, note: 'level 12 Nightblade' }, { char: 'rx', name: 'Bob', account: 'ann', own: false, note: '' }], sent), said, shown, 'Bob');
  const pick = shown.at(-1);
  assert.equal(pick.options[0].label, '1: Bob (yours, level 12 Nightblade)');
  assert.equal(pick.options[1].label, '2: Bob, account ann');
  press(pick, 'Digit2');
  const price = shown.at(-1);
  assert.equal(typeof price.onSubmit, 'function');
  price.onSubmit('0');
  press(shown.at(-1), 'KeyN');
  press(shown.at(-1), 'KeyY');
  await flush();
  assert.deepEqual(sent.at(-1), { op: 'offer', mapId: 1, buildingKey: 2, toName: 'Bob', toChar: 'rx', price: 0, keepDecor: false, keepItems: false });
});

test('P6: two own Bobs read differently and picking one asks the move confirmation, not a price', async () => {
  const sent = []; const said = []; const shown = [];
  await start(transferHost([{ char: 'r1', name: 'Bob', account: 'me', own: true, note: 'level 3 Mage' }, { char: 'r2', name: 'Bob', account: 'me', own: true, note: 'level 9 Thief' }], sent), said, shown, 'Bob');
  const pick = shown.at(-1);
  assert.notEqual(pick.options[0].label, pick.options[1].label);
  press(pick, 'Digit2');
  const ask = shown.at(-1);
  assert.equal(ask.onSubmit, undefined);
  assert.match(ask.lines[0], /Make Bob the main owner/);
  press(ask, 'KeyY');
  await flush();
  assert.equal(sent.at(-1).toChar, 'r2');
  assert.equal(sent.at(-1).price, 0);
});

test('transfer: the pick list says when more matches exist', async () => {
  const sent = []; const shown = [];
  const m = [1, 2].map((i) => ({ char: `r${i}`, name: 'Bob', account: `a${i}`, own: false, note: '' }));
  const host = transferHost(m, sent);
  const orig = host.onlineHomes.transfer;
  host.onlineHomes.transfer = async (b) => { const r = await orig(b); if (b.op === 'resolve') r.data.more = true; return r; };
  await start(host, [], shown, 'Bob');
  assert.equal(shown.at(-1).lines[1], 'Only the first 2 matches are shown.');
});

test('transfer: no match says so', async () => {
  const said = []; const shown = [];
  const host = { onlineHomes: { transfer: async () => ({ ok: false, error: 'home-no-char' }) }, decorCharacter: () => 'rme' };
  await start(host, said, shown, 'Nobody');
  assert.deepEqual(said, ['home-no-char']);
});

test('owners: a co-owner can only remove itself', async () => {
  const calls = []; const shown = []; const said = [];
  const host = {
    decorCharacter: () => 'ca',
    homesApi: { owners: async (b) => { calls.push(b); return { ok: true, main: { char: 'm', name: 'Main' }, coOwners: [{ char: 'ca', name: 'Ann', at: 1 }, { char: 'cb', name: 'Bo', at: 2 }] }; } },
  };
  await openHomeOwners(1, 2, host, (s) => said.push(s), String, (w) => shown.push(w));
  const win = shown.at(-1);
  assert.deepEqual(win.lines, ['Main owner: Main', 'Co-owners: Ann, Bo']);
  assert.deepEqual(win.options.map((o) => o.code), ['KeyR', 'Escape']);
  press(win, 'KeyR');
  await flush(); await flush();
  assert.deepEqual(calls.find((c) => c.op === 'remove'), { mapId: 1, buildingKey: 2, character: 'ca', op: 'remove', char: 'ca' });
});
