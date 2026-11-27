// @ts-check
import { PASSAGE_HULLS, PASSAGE_RAY_M, passageHintText } from './passage.js';
import { alongside, BERTH_SNAP_M, BERTH_WAY } from './shipLife.js';
import { forwardOfYaw } from './navalAI.js';
import { segmentBoxEntry } from './navalBallistics.js';
import { prizeDeedValue } from './navalPlunder.js';
import { mintDeed } from './comeSailAwayItems.js';
import { NAVAL_WIRE_GONE } from './navalWire.js';

/** @param {any} host @param {any} deps */
export function createPassageBerths(host, deps) {
  function mooredAt(e) {
    const r = e.ship.errand;
    if (r?.kind === 'moored') return e.fromHarbour ? { key: r.harbour, i: r.berth } : null;
    // Another player's copy carries no errand on the wire, so it is matched to a berth by position.
    if (!e.owner || r || (e.ship.speed ?? 0) >= BERTH_WAY) return null;
    for (const h of host.harbours.values()) {
      const berths = h?.harbour?.berths ?? [];
      for (let i = 0; i < berths.length; i++) if (Math.hypot(berths[i].pos[0] - e.ship.pos[0], berths[i].pos[1] - e.ship.pos[2]) <= BERTH_SNAP_M) return { key: h.key, i };
    }
    return null;
  }
  function passageShip() {
    if (!host.enabled() || host.boarding() || host.myBoat() || !deps.passage) return null;
    const look = deps.look?.();
    if (!look) return null;
    const a = look.origin, d = look.dir, b = [a[0] + d[0] * PASSAGE_RAY_M, a[1] + d[1] * PASSAGE_RAY_M, a[2] + d[2] * PASSAGE_RAY_M];
    let best = null, bestT = Infinity;
    for (const e of host.sea.values()) {
      const s = e.ship;
      if (e.liner || e.prize || e.retiring || !PASSAGE_HULLS.includes(s.hull) || !host.stanceOf(s).friendly || !mooredAt(e)) continue;
      if (deps.passageCrosses && !deps.passageCrosses(s.hull)) continue;
      const box = e.boat ? host.hullBox(e.boat) : null;
      const t = box ? segmentBoxEntry(a, b, box)?.t : null;
      if (t != null && t < bestT) { best = e; bestT = t; }
    }
    return best;
  }
  let passageSaid = null;
  function passageHint() {
    const e = deps.passage ? passageShip() : null;
    if (e && e.id !== passageSaid) deps.say?.(passageHintText(e.ship.names?.name ?? null), 3);
    passageSaid = e?.id ?? null;
  }
  function charter(id, record) {
    const e = host.sea.get(id), r = host.csa(), m = e ? mooredAt(e) : null;
    const h = m ? host.harbours.get(m.key)?.harbour : null, b = h?.berths?.[m.i];
    if (!e || !b || typeof r?.LaunchFromDeed !== 'function' || typeof deps.board?.mintUid !== 'function') return null;
    const s = e.ship, at = alongside(b, s.hull, h.hull), pos = [at[0], deps.seaY(), at[1]];
    const worth = prizeDeedValue(s.hull), deed = mintDeed(s.hull, s.variant ?? 0, deps.board.mintUid(), worth);
    let boat = null;
    try { boat = r.LaunchFromDeed(deed, [deed], pos, forwardOfYaw(b.yaw), deps.board.terrainAt?.(pos)); } catch (err) { console.warn('[naval] a booked ship would not be placed', err); }
    if (!boat) return null;
    boat.charter = record;
    // A booked ship never packs, so the crossing never plans a second launch of her.
    boat.packable = false;
    return boat;
  }
  function charterSailed(id) {
    const e = host.sea.get(id), m = e ? mooredAt(e) : null;
    if (!e) return false;
    if (e.owner) host.adopt(e);
    host.departedOf(e.fromHarbour ?? m?.key, host.day()).add(e.ship.seed);
    host.drop(e);
    noteGone(e.ship.seed);
    return true;
  }
  // Booked ships are shared by seed on the wire, so no player shows the same ship at her berth again that day.
  const gone = new Set();
  let said = [];
  function noteGone(seed) {
    if (!Number.isInteger(seed) || gone.has(seed)) return;
    gone.add(seed);
    said = [...said, seed].slice(-NAVAL_WIRE_GONE);
    for (const e of host.sea.values()) if (e.ship.seed === seed) host.retire(e);
  }
  const goneSeed = (seed) => gone.has(seed);
  const goneSaid = () => said;
  const hearGone = (seeds) => { for (const sd of seeds ?? []) noteGone(sd); };
  return { passageShip, passageHint, charter, charterSailed, goneSeed, goneSaid, hearGone };
}
