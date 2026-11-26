import { isSocialRoom, byteGate, tokenGate, QUEST_ROOM_HZ_MAX, QUEST_ROOM_BYTES_PER_S } from '../../relay.js';

export async function questFrame(ws, a, m, message, doored) {
  const now = Date.now();
  if (doored !== 'quest') { a = this._meterQuest(ws, a, now); if (!a) return; }
  if (!isSocialRoom(a.key) || !a.acct) { this._junk(ws); return; }
  if (!a.party) return;
  if (this._speaker(a.acct) !== ws) return;
  const budget = tokenGate(this._roomQuest, now, QUEST_ROOM_HZ_MAX);
  this._roomQuest = budget.bucket;
  if (!budget.pass) { this._sayError(ws, 'busy'); return; }
  let party = null;
  try { party = await this._livingParty(a.party, now); } catch (e) { console.warn('[hub] quest share failed', e?.message ?? e); return; }
  if (!party || !party.members.includes(a.acct)) { this._markParty(a.acct, null); return; }
  const mine = await this._acct(a.acct);
  const out = JSON.stringify({ t: 'quest', acct: a.acct, name: mine?.name ?? null, quest: m.quest });
  const targets = [];
  for (const member of party.members) if (member !== a.acct) for (const other of this._socketsOf(member)) targets.push(other);
  const bytes = byteGate(this._roomQuestBytes, now, out.length * targets.length, QUEST_ROOM_BYTES_PER_S, true);
  this._roomQuestBytes = bytes.bucket;
  if (!bytes.pass) { this._sayError(ws, 'busy'); return; }
  for (const other of targets) this._send(other, out);
  return;
}
