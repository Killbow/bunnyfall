import { isSocialRoom, tokenGate, AMAP_ROOM_HZ_MAX } from '../../relay.js';

export async function amapFrame(ws, a, m) {
  const now = Date.now();
  a = this._meterAmap(ws, a, now); if (!a) return;
  if (!isSocialRoom(a.key) || !a.acct) { this._junk(ws); return; }
  if (!a.party) return;
  if (ws !== this._speaker(a.acct)) return;
  const budget = tokenGate(this._roomAmap, now, AMAP_ROOM_HZ_MAX);
  this._roomAmap = budget.bucket;
  if (!budget.pass) return;
  let party = null;
  try { party = await this._livingParty(a.party, now); } catch (e) { console.warn('[hub] map share failed', e?.message ?? e); return; }
  if (!party || !party.members.includes(a.acct)) { this._markParty(a.acct, null); return; }
  const mine = await this._acct(a.acct);
  const out = JSON.stringify({ t: 'amap', acct: a.acct, name: mine?.name ?? null, k: m.k, r: m.r });
  for (const member of party.members) { if (member === a.acct) continue; for (const other of this._socketsOf(member)) this._send(other, out); }
  return;
}
