import { CHAT_STRIKES_MAX, rollGate, rollDice } from '../../relay.js';
import { rand32 } from '../../room/dice.js';

export async function rollFrame(ws, a, m) {
  const now = Date.now();
  if (!this._spend(ws, now, rollGate, 'rollBucket', 'rollDrops', 'too many rolls', CHAT_STRIKES_MAX)) return;
  if (a.mu && a.mu > Math.floor(now / 1000)) { this._send(ws, JSON.stringify({ t: 'muted', until: a.mu })); return; }
  const r = rollDice({ n: m.n, m: m.m, k: m.k }, rand32);
  if (!r) return;
  await this._sayLine(ws, a, m.ch, { t: 'roll', id: a.id, name: a.name, at: now, sub: a.sub, ...r }, now);
  return;
}
