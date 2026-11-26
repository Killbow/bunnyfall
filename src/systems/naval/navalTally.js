// @ts-check
import { segmentOfTarget } from '../../worldEvents/serpentHost.js';

/** @param {{ clock: () => number, onSea: (target: any) => boolean }} deps */
export function createVolleyTally(deps) {
  const open = new Map();
  let last = null;
  return {
    fired(id, balls) { open.set(String(id), { balls, ended: 0, hits: 0, holed: 0, rig: 0, men: 0 }); },
    count(e) {
      const t = e.volley != null ? open.get(String(e.volley)) : null;
      if (!t) return;
      if (e.type === 'hit') {
        if (segmentOfTarget(e.target) != null) { t.hits++; t.ended++; }
        else if (!deps.onSea(e.target)) { if (e.zone !== 'rig') t.ended++; }
        else if (e.zone === 'rig') t.rig++;
        else { t.hits++; if (e.zone === 'holed') t.holed++; t.ended++; }
      } else if (e.type === 'splash' || e.type === 'land' || e.type === 'gone') t.ended++;
      else return;
      if (t.ended >= t.balls) { last = { balls: t.balls, hits: t.hits, holed: t.holed, rig: t.rig, men: t.men, at: deps.clock(), volley: String(e.volley) }; open.delete(String(e.volley)); }
    },
    men(e, n) {
      if (!(n > 0) || e.volley == null) return;
      // A volley's last ball closes its tally before the crew losses from that ball arrive.
      const t = open.get(String(e.volley)) ?? (last?.volley === String(e.volley) ? last : null);
      if (t) t.men += n;
    },
    shown(now, span) { return last && now - last.at <= span ? { balls: last.balls, hits: last.hits, holed: last.holed, rig: last.rig, men: Math.round(last.men) } : null; },
  };
}
