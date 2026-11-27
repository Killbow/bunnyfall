import { CHAT_STRIKES_MAX, holdemGate } from '../../relay.js';

export async function holdemFrame(ws, a, m) {
  const now = Date.now();
  if (!String(a.key ?? '').startsWith('interior:')) return;
  if (!this._spend(ws, now, holdemGate, 'holdemBucket', 'holdemDrops', 'too many card words', CHAT_STRIKES_MAX)) return;
  await this._holdemWord(ws, a, m, now);
  return;
}
