// Shared Cartography: while the buff is live in a dungeon, the caster's revealed automap rows go to the party.
import { buildCustomSpell } from '../magic/spellMaker.js';
import { hasActiveEffect } from '../magic/effects.js';
import { AMAP_KEYS_MAX, AMAP_SEND_MS, validAmapRow } from '../net/wire.js';

export const SHARED_CARTOGRAPHY_TYPE = 46;
export const SHARED_CARTOGRAPHY_SUBTYPE = 255;
export const SHARED_CARTOGRAPHY_KEY = '46,255';
export const SHARED_CARTOGRAPHY_KIND = 'sharedCartography';
/** Fixed so a bought copy has the same key on every client. */
export const SHARED_CARTOGRAPHY_SPELL_INDEX = -46001;
export const SHARED_CARTOGRAPHY_DURATION = Object.freeze({ durationBase: 20, durationMod: 2, durationPerLevel: 1 });

export const hasSharedCartography = (entity) => hasActiveEffect(entity, SHARED_CARTOGRAPHY_KIND);

export function sharedCartographySpell() {
  return buildCustomSpell({ slots: [{ type: SHARED_CARTOGRAPHY_TYPE, subType: SHARED_CARTOGRAPHY_SUBTYPE, settings: { ...SHARED_CARTOGRAPHY_DURATION } }],
    rangeType: 0, element: 4, name: 'Shared Cartography', icon: 21, index: SHARED_CARTOGRAPHY_SPELL_INDEX });
}

/** A mate who joins late keeps only rows sent while in the dungeon, so the sender resends its whole map this often.
 *  The receiver's merge is idempotent. */
export const AMAP_RESYNC_MS = 60_000;
// `commit` runs only after the link really sent a frame, so a refused send loses nothing.
export function createPartyMapSender({ sendMs = AMAP_SEND_MS, max = AMAP_KEYS_MAX, resyncMs = AMAP_RESYNC_MS } = {}) {
  let key = null;
  let sent = new Set();
  let lastAt = -Infinity;
  let syncAt = -Infinity;
  return {
    next({ active, inDungeon, partied = true, key: k, rec, nowMs }) {
      if (!inDungeon || !k || !rec) { key = null; sent = new Set(); return null; }
      if (k !== key) { key = k; sent = new Set(); syncAt = nowMs; }
      if (!active || !partied) return null;
      if (nowMs - syncAt >= resyncMs) { sent = new Set(); syncAt = nowMs; }
      if (nowMs - lastAt < sendMs) return null;
      const r = [];
      for (const row of rec.visitedThisRun ?? []) {
        if (sent.has(row) || !validAmapRow(row)) continue;
        r.push(row);
        if (r.length >= max) break;
      }
      return r.length ? { k, r } : null;
    },
    commit(frame, nowMs) {
      if (!frame || frame.k !== key) return;
      lastAt = nowMs;
      for (const row of frame.r) sent.add(row);
    },
    get sentCount() { return sent.size; },
  };
}
