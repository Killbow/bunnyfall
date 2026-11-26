import { CHAT_STRIKES_MAX, holdemGate } from '../../relay.js';

export async function gambitFrame(ws, a, m) {
  const now = Date.now();
  if (!String(a.key ?? '').startsWith('interior:')) return;
  if (!this._spend(ws, now, holdemGate, 'gambitBucket', 'gambitDrops', 'too many card words', CHAT_STRIKES_MAX)) return;
  await this._gambitWord(ws, a, m, now);
  return;
}
