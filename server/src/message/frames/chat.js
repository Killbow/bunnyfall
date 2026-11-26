import { chatGate, CHAT_STRIKES_MAX } from '../../relay.js';
import { staffLine } from '../../staffFreeze.js';

export async function chatFrame(ws, a, m) {
  this._metrics.c.chats++;
  const now = Date.now();
  if (!this._spend(ws, now, chatGate, 'cbucket', 'cdrops', 'too many lines', CHAT_STRIKES_MAX)) return;
  if (m.ch === 'staff') { staffLine(this, ws, a, m, now); return; }
  if (a.mu && a.mu > Math.floor(now / 1000)) { this._send(ws, JSON.stringify({ t: 'muted', until: a.mu })); return; }
  await this._sayLine(ws, a, m.ch, { t: 'chat', id: a.id, name: a.name, text: m.text, at: now, sub: a.sub, ...(m.me === true ? { me: true } : {}), ...(m.items ? { items: m.items } : {}), ...(m.item ? { item: m.item } : {}), ...(m.ch === 'whisper' ? { to: m.to } : {}), ...(m.vol ? { vol: m.vol } : {}) }, now);
  return;
}
