// The `party` frame's handler, called by message/dispatch.js with the room as `this`.
import { isSocialRoom } from '../../relay.js';
import { followNoted } from '../../staffFollow.js';

export async function partyFrame(ws, a, m) {
  const now = Date.now();
  a = this._meterParty(ws, a, now); if (!a) return;
  if (!isSocialRoom(a.key) || !a.acct) { this._junk(ws); return; }
  this._setAttach(ws, { ...a, pm: { ...m.p, at: now } });
  const fan = followNoted(this, a, m.p);
  if (!a.party) return;
  if (this._speaker(a.acct) !== ws) return;
  let party = null;
  try { party = await this._livingParty(a.party, now); } catch (e) { console.warn('[hub] party pose failed', e?.message ?? e); return; }
  if (!party || !party.members.includes(a.acct)) { this._markParty(a.acct, null); return; }
  const out = JSON.stringify({ t: 'party', acct: a.acct, p: fan });
  for (const member of party.members) if (member !== a.acct) for (const other of this._socketsOf(member)) this._send(other, out);
  return;
}
