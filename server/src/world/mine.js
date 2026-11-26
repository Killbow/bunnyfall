// BUNNYFALL (2026-11-25, caverns): A MINE'S ROOM - the shared mine every player in it works, kept in its dungeon room's
// storage and judged by its brain (src/net/mine/mineBrain.js). It answers `mn` words: a newcomer's `hi` with the mine as
// it stands, a strike or a plank by stepping the brain and fanning the result to everyone in the room. A refused act is
// told to its sender alone. The room's alarm ticks the mine once a minute while it is held (mineTick), so a sealed mine
// reopens as a new one with nobody in it, and a week-old mine turns over at its next word.
import { tokenGate } from '../../../src/net/wire.js';
import { validMineIn, mineRoomOf, MINE_HZ } from '../../../src/net/mine/mineWire.js';
import { createMineState, stepMine } from '../../../src/net/mine/mineBrain.js';
import { mintMineReceipt } from '../../../src/net/mine/mineReceipt.js';
import { mineLayout } from '../../../src/net/mine/mineLayout.js';

/** The room storage key the mine is kept under. */
export const MINE_KEY = 'mine';
/** How often the alarm ticks a held mine (ms). */
export const MINE_TICK_MS = 60_000;

const mineGate = (/** @type {any} */ bucket, /** @type {number} */ nowMs) => tokenGate(bucket, nowMs, MINE_HZ, MINE_HZ + 4);

export class MinePart {
  /** The room's mine: from storage, or fresh for the mine its key names; null in a room that is no mine's. */
  async _mnOf(key, nowS) {
    const room = mineRoomOf(key);
    if (!room) return null;
    if (this._mn === undefined) this._mn = (await this.state.storage.get(MINE_KEY)) ?? null;
    if (!this._mn || this._mn.mine !== room.id) this._mn = createMineState(mineLayout(room.id, 0), nowS);
    return this._mn;
  }
  async _mnSave(st) { this._mn = st; await this.state.storage.put(MINE_KEY, st); }
  _mnFan(st, ev) {
    const out = JSON.stringify({ t: 'mn', k: 'st', st, ...(ev?.length ? { ev } : {}) });
    this._fanFrames([out], (b) => !!b.id);
  }
  /** The clock first: a seal run out (or a week gone) turns the mine over before any word is judged. */
  async _mnTicked(st, nowS) {
    const r = stepMine(st, { op: 'tick' }, nowS);
    if (!r.events.length) return st.drills?.length ? r.state : st;
    await this._mnSave(r.state);
    this._mnFan(r.state, r.events);
    return r.state;
  }
  async _mnArm(now) {
    const at = await this.state.storage.getAlarm();
    if (at == null || at > now + MINE_TICK_MS) await this.state.storage.setAlarm(now + MINE_TICK_MS);
  }
  async _mnFrameIn(ws, a, m) {
    const now = Date.now(), nowS = Math.floor(now / 1000);
    const w = validMineIn(m);
    if (!w || !a.id || !mineRoomOf(a.key)) { this._junk(ws); return; }
    if (!this._spend(ws, now, mineGate, 'mnBucket', 'mnDrops', 'too many mine words')) return;
    try {
      let st = await this._mnOf(a.key, nowS);
      if (!st) { this._junk(ws); return; }
      st = await this._mnTicked(st, nowS);
      if (w.k === 'hi') { this._send(ws, JSON.stringify({ t: 'mn', k: 'st', st })); await this._mnArm(now); return; }
      const drilling = w.k === 'drill' || w.k === 'take' || w.k === 'lamp';
      if (drilling && !a.sub) { this._send(ws, JSON.stringify({ t: 'mn', k: 'no', e: 'guest' })); return; }   // a drill's ore is an account's: no account, no drill
      const op = w.k === 'strike' ? { op: 'strike', s: w.s, c: w.c }
        : w.k === 'lamp' ? { op: 'lamp', s: w.s, c: w.c }
          : drilling ? { op: w.k, s: w.s, c: w.c, k: w.h, by: String(a.sub), crew: w.crew ?? [] }
          : { op: 'prop', s: w.s, c: w.c, w: w.w, wood: w.wood, by: String(a.sub ?? a.id) };
      const r = stepMine(st, op, nowS);
      if (r.error) { this._send(ws, JSON.stringify({ t: 'mn', k: 'no', e: r.error })); return; }
      await this._mnSave(r.state);
      this._mnFan(r.state, r.events);
      // A HAUL TAKEN: signed for its taker alone (src/net/mine/mineReceipt.js), carried by their page to the account service
      if (r.haul) {
        try {
          const rc = await mintMineReceipt({ ...r.haul, mine: r.state.mine, reset: r.state.reset }, await this._receiptKeyOf(), { subtle: crypto.subtle, nowS });
          this._send(ws, JSON.stringify({ t: 'mn', k: 'rc', r: rc }));
        } catch (e) { console.warn('[mine] haul receipt refused', e?.message ?? e); }
      }
      await this._mnArm(now);
    } catch (e) { console.warn('[mine] word failed', e?.message ?? e); }
  }
  /** The alarm's turn: a held mine ticked - its noise forgetting, and with anyone in it a stray on the minute's roll -
   *  and the alarm kept while anyone stands in it or it is sealed. */
  async _mnTick() {
    if (this._mn === undefined) this._mn = (await this.state.storage.get(MINE_KEY)) ?? null;
    const st = this._mn;
    if (!st) return;
    // who stands in it: anyone (a stray's chance), and the accounts (a drill whose setter has left stops)
    const here = [];
    for (const [, b] of this._all()) if (b.id && b.sub) here.push(String(b.sub));
    let anyone = here.length > 0;
    if (!anyone) for (const [, b] of this._all()) if (b.id) { anyone = true; break; }
    const now = Date.now(), r = stepMine(st, { op: 'tick', present: anyone, here, roll: Math.random(), pick: Math.random() }, Math.floor(now / 1000));
    await this._mnSave(r.state);
    if (r.events.length) this._mnFan(r.state, r.events);
    if (anyone || r.state.sealedUntil > 0) await this._mnArm(now);
  }
}
