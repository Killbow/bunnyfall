// @ts-check
import { perksOf, PERKS_REFUSED_AT, logLines } from './captainLedger.js';
import { createCaptainStarsOverlay } from '../../ui/navalPlunderDoor.js';

/** @param {{ ledger: any, naval: () => any, office: () => any, minutes: () => number, show: (overlay: any) => void, changed: () => void }} deps */
export function createCaptainPageHost(deps) {
  function model() {
    const L = deps.ledger, at = Math.floor(deps.minutes());
    const mq = L.marque(at);
    return {
      crowns: L.crowns().map((c) => { const n = deps.naval()?.notorietyOf?.(c.crown) ?? 0; return { ...c, notoriety: n, perks: perksOf(c.rank.rank, n) }; }),
      refusedAt: PERKS_REFUSED_AT,
      marque: mq ? { crown: mq.crown, days: Math.max(1, Math.ceil((mq.until - at) / 1440)) } : null,
      contracts: deps.office().pageContracts(),
      charts: deps.office().pageCharts(),
      log: logLines(L.log),
      stars: { ...L.captain(), set: L.tree().length - 1 },
    };
  }
  function openStars() {
    const w = createCaptainStarsOverlay({ ledger: deps.ledger, changed: deps.changed });
    if (w) deps.show(w);
    return !!w;
  }
  const stars = () => ({ ledger: deps.ledger, changed: deps.changed });
  return { model, openStars, stars };
}
