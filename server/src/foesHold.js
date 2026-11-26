// Pure rules for a room's held first frames, wired by server/src/room/foes.js. Held frames go one sender a turn,
// in the order their places were taken, so no sender's frames keep another's from its turn.
import { FOES_FRAME_MAX, FOES_FULL_RESERVE } from '../../src/net/wire.js';

export const FOES_HELD_PER_SENDER = 4;
// Counts text lengths: a held frame stays as text and is parsed again when its turn comes. Parsed, a frame padded
// with empty objects takes about twenty times its length in memory.
export const FOES_HELD_BYTES_MAX = 64 * FOES_FRAME_MAX;
export const FOES_TURN_BYTES = 16 * 1024;
export const FOES_BEAT_SCAN_MS = 250;
// The floor is the room's, not each leave's, so all leaving senders together put the budget no deeper.
export const FOES_LEFT_FLOOR = -2 * FOES_FULL_RESERVE;

export const createFoesHold = () => ({ entries: [], seq: 0, bytes: 0, turn: null });

export const heldOf = (hold, ws) => hold.entries.filter((e) => e.ws === ws);

export function heldHead(hold) {
  let best = null;
  for (const e of hold.entries) if (!best || e.seq < best.seq) best = e;
  return best;
}

export function unhold(hold, e) {
  const i = hold.entries.indexOf(e);
  if (i < 0) return false;
  hold.entries.splice(i, 1);
  hold.bytes -= e.length;
  if (hold.turn?.ws === e.ws) hold.turn = null;
  return true;
}

export function served(hold, e) {
  const turn = (hold.turn?.ws === e.ws ? hold.turn.bytes : 0) + e.length;
  unhold(hold, e);
  const mine = heldOf(hold, e.ws);
  if (mine.length && turn + mine[0].length <= FOES_TURN_BYTES) { mine[0].seq = e.seq; hold.turn = { ws: e.ws, bytes: turn }; return; }
  for (const next of mine) next.seq = hold.seq++;
}

// Takes frames only from a sender holding more than the frame's own sender will, so a sender holding little
// always finds a place. Returns null, taking nothing, when no such room can be made.
function roomFor(hold, mine, over) {
  if (over <= 0) return [];
  const bytes = new Map();
  for (const e of hold.entries) bytes.set(e.ws, (bytes.get(e.ws) ?? 0) + e.length);
  const taken = [];
  while (over > 0) {
    let top = null, most = mine;
    for (const [s, b] of bytes) if (b > most) { top = s; most = b; }
    if (top === null) return null;
    const theirs = hold.entries.filter((e) => e.ws === top && !taken.includes(e));
    const e = theirs.findLast((x) => !x.hands) ?? /** @type {any} */ (theirs.at(-1));
    taken.push(e);
    bytes.set(top, most - e.length);
    over -= e.length;
  }
  for (const e of taken) unhold(hold, e);
  return taken;
}

export function holdFrame(hold, frame) {
  const mine = heldOf(hold, frame.ws);
  const last = mine.at(-1);
  // A full frame that is no handover replaces the newest frame held for that sender, unless that one is a handover.
  const replace = frame.full && !frame.hands && last && !last.hands ? last : null;
  if (!replace && mine.length && !frame.full && !frame.hands) return { fate: 'refused', gone: [] };
  if (!replace && mine.length >= FOES_HELD_PER_SENDER) return { fate: 'refused', gone: [] };
  const out = replace ? replace.length : 0;
  const held = mine.reduce((sum, e) => sum + e.length, 0) - out + frame.length;
  const gone = roomFor(hold, held, hold.bytes - out + frame.length - FOES_HELD_BYTES_MAX);
  if (!gone) return { fate: 'refused', gone: [] };
  if (replace) {
    gone.unshift({ ...replace });
    hold.bytes += frame.length - replace.length;
    Object.assign(replace, frame);
    return { fate: 'replaced', gone };
  }
  hold.entries.push({ ...frame, seq: hold.seq++, since: frame.at });
  hold.bytes += frame.length;
  return { fate: 'held', gone };
}
