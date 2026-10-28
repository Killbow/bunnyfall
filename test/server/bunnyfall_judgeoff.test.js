// BUNNYFALL: the judge switched off for a friends' server (server-account/src/bunnyfall.js JUDGE_OFF). A lawless
// checkpoint that the upstream judge holds is stored clean with the switch on: nothing held, nothing found, the clean
// object this one. Unset, the judge stands (the upstream INT tests run with it on).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../../server-account/src/index.js';
import { standService } from '../accountDb.mjs';
import { seatRealm, freshSave } from '../realmSeat.mjs';
import { JUDGE_COLUMNS } from '../../server-account/src/realm.js';
import { createWeapon } from '../../src/combat/enemyEquipment.js';
import { seeded } from '../honestItems.mjs';

async function lawless(vars) {
  const s = await standService({ DEVELOPER_HANDLES: 'mac', ...vars });
  const raw = s.env.DB._raw;
  const who = await s.registered('Ann');
  const R = await seatRealm(s.env, who.secret, 'Ann');
  const put = async (save) => {
    const at = R.at();
    const res = await worker.fetch(new Request(`https://accounts.invalid/v1/realm/${R.id}/data`, {
      method: 'PUT', headers: { authorization: `Bearer ${who.secret}`, 'x-realm-lease': at.lease, 'x-realm-seq': String(at.seq + 1) }, body: JSON.stringify(save),
    }), s.env);
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  assert.equal((await put(freshSave())).status, 200);
  const forged = { ...createWeapon(113, 1, seeded(7)), affixes: [{ id: 'damage', value: 40 }] };   // a line no producer mints
  const r = await put(freshSave({ items: [forged] }));
  const row = raw.prepare(`SELECT obj, ${JUDGE_COLUMNS} FROM realm_characters WHERE id = ?`).get(R.id);
  const found = raw.prepare('SELECT COUNT(*) AS n FROM realm_findings WHERE char_id = ?').get(R.id).n;
  return { r, row, found };
}

test('BUNNYFALL JUDGE-OFF: with the switch on, a lawless checkpoint is stored clean - nothing held, nothing found', async () => {
  const { r, row, found } = await lawless({ JUDGE_OFF: 'on' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.tradeHeld ?? null, null);
  assert.equal(row.held ?? null, null);
  assert.equal(row.clean_obj, row.obj, 'this checkpoint is the clean one');
  assert.equal(Number(found), 0);
});

test('BUNNYFALL JUDGE-OFF: unset, the judge holds the same checkpoint (the upstream law, untouched)', async () => {
  const { r, row, found } = await lawless({});
  assert.equal(r.status, 200);
  assert.equal(row.held, 'law');
  assert.ok(Number(found) > 0);
});

test('BUNNYFALL JUDGE-OFF: the friends\' server sets it', () => {
  assert.match(readFileSync(new URL('../../selfhost/accounts.toml', import.meta.url), 'utf8'), /\nJUDGE_OFF = "on"\n/);
});
