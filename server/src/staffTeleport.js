import { isStaff } from '../../src/net/staffCommands.js';
import { STAFF_TP_TIMEOUT_MS, quietTeleportAllowed } from '../../src/net/staffTeleport.js';
import { noteOf } from './staffFollow.js';

const fold = (s) => String(s).toLowerCase().replace(/['\u2019]/g, '').replace(/[\s-]+/g, ' ').trim();

export function routeStaffTeleport(room, ws, a, m, now) {
  const pending = room._staffTeleports ??= new Map();
  for (const [ticket, p] of pending) if (now >= p.expires || !room._all().has(p.from) || !room._all().has(p.target)) pending.delete(ticket);
  const result = (socket, nonce, fields) => room._send(socket, JSON.stringify({ t: 'stp', k: 'result', nonce, ...fields }));
  if (m.k === 'ask') {
    if (!isStaff(a.glyphs)) { result(ws, m.nonce, { error: 'denied' }); return; }
    const peers = [...room._all()].filter(([other, b]) => b.id && !b.hid && !room._dead.has(other) && !room._gone.has(other));
    let hits;
    if (m.id) hits = peers.filter(([, b]) => b.id === m.id);
    else {
      const name = fold(m.name);
      const exact = peers.filter(([, b]) => fold(b.name) === name);
      hits = exact.length ? exact : peers.filter(([, b]) => fold(b.name).startsWith(name));
    }
    if (hits.length !== 1) { result(ws, m.nonce, { error: hits.length ? 'ambiguous' : 'offline' }); return; }
    const [target, b] = hits[0];
    const acct = typeof b.sub === 'string' ? { acct: b.sub } : {};
    const quiet = m.nt === 1 && quietTeleportAllowed(a.glyphs);
    if (quiet && m.cap !== 1) {
      const note = b.sub ? noteOf(room, b.sub, now) : null;
      if (note) { result(ws, m.nonce, { id: b.id, name: b.name, ...acct, via: 'note', note: note.p, ag: Math.floor((now - note.at) / 1000) }); return; }
    }
    // A hidden asker is answered from the where note alone,
    // since a capture would tell a modded game that staff arrived.
    if (a.hid) { result(ws, m.nonce, { error: 'unavailable' }); return; }
    const fb = quiet ? (m.cap === 1 ? 'mismatch' : 'missing') : null;
    if (fb) console.info('[stp] the target\'s game is asked: its where note is', fb);
    for (const [ticket, p] of pending) if (p.from === ws) pending.delete(ticket);
    if (pending.size >= 128) { result(ws, m.nonce, { error: 'busy' }); return; }
    const ticket = crypto.randomUUID();
    pending.set(ticket, { from: ws, target, id: b.id, nonce: m.nonce, expires: now + STAFF_TP_TIMEOUT_MS, ...(fb ? { fb } : {}) });
    if (!room._send(target, JSON.stringify({ t: 'stp', k: 'capture', ticket }))) {
      pending.delete(ticket); result(ws, m.nonce, { error: 'offline' });
    }
    return;
  }
  // Only the verified target socket may answer a pending ticket.
  const p = pending.get(m.ticket);
  if (!p || p.target !== ws || p.id !== a.id) return;
  pending.delete(m.ticket);
  const asker = room._all().get(p.from);
  if (!asker?.id || room._dead.has(p.from) || room._gone.has(p.from) || !isStaff(asker.glyphs)) return;
  result(p.from, p.nonce, m.error ? { error: m.error } : { id: a.id, name: a.name, ...(typeof a.sub === 'string' ? { acct: a.sub } : {}), dest: m.dest, ...(p.fb ? { fb: p.fb } : {}) });
}
