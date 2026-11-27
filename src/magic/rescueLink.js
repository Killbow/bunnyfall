// @ts-check
// A Rescue cast puts `rs: {to, at}` in the caster's party pose for RESCUE_HOLD_MS.
// The named party member's client reads a new `rs.at` and moves itself next to the caster.

import { t } from '../ui/textManager.js';
import { RESCUE_HOLD_MS, RESCUE_SET_DOWN_M, RESCUE_REACH_M } from './bunnySpellLaw.js';

/**
 * @param {{ social: () => any, peers: () => Array<{ id: string, feet: number[] }> | null, accountOfPeer: (id: string) => string | null,
 *   feet: () => number[], moveTo: (p: number[]) => void, say: (s: string) => void, sent: () => void }} deps
 */
export function createRescueLink(deps) {
  /** @type {{ to: string, at: number, until: number } | null} */
  let out = null;
  const seen = new Map();
  let primed = false;
  let lastTaken = -Infinity;

  return {
    send(/** @type {string} */ id) {
      const s = deps.social();
      const acct = deps.accountOfPeer(id);
      if (!s?.party || !acct || !s.isPartyPeer?.(id)) return false;
      out = { to: acct, at: Date.now(), until: performance.now() + RESCUE_HOLD_MS };
      deps.sent();
      return true;
    },
    poseField() { return out && performance.now() < out.until ? { rs: { to: out.to, at: out.at } } : {}; },
    frame() {
      const s = deps.social();
      const me = s?.acct;
      if (!me) return;
      const members = s.others?.() ?? [];
      // The first frame only records existing calls, so a call made before this client joined is ignored.
      if (!primed) { for (const m of members) seen.set(m.acct, m?.p?.rs?.at ?? null); primed = true; return; }
      for (const m of members) {
        const rs = m?.p?.rs;
        const was = seen.get(m.acct) ?? null;
        seen.set(m.acct, rs?.at ?? null);
        if (!rs || rs.to !== me || !Number.isFinite(rs.at) || rs.at === was) continue;
        const peer = (deps.peers() ?? []).find((p) => deps.accountOfPeer(p.id) === m.acct);
        if (!peer) continue;
        const mine = deps.feet();
        const d = [mine[0] - peer.feet[0], 0, mine[2] - peer.feet[2]];
        const dist = Math.hypot(d[0], d[2]);
        if (dist > RESCUE_REACH_M + 10) continue;
        if (!Number.isFinite(peer.feet[1]) || Math.abs(peer.feet[1] - mine[1]) > RESCUE_REACH_M + 10) continue;
        if (performance.now() - lastTaken < 4000) continue;
        const k = dist > 0.01 ? RESCUE_SET_DOWN_M / dist : 0;
        lastTaken = performance.now();
        deps.moveTo([peer.feet[0] + d[0] * k, peer.feet[1], peer.feet[2] + d[2] * k]);
        deps.say(t('spell.bunny.rescued', '{name} pulls you to their side.', { name: m.name ?? t('spell.bunny.aMember', 'A party member') }));
        return;
      }
    },
  };
}
