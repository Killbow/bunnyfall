// @ts-check
// BUNNY-SPELLS: RESCUE BETWEEN PLAYERS. A Rescue cast at a party member goes as Resurrect's call does (RESURRECT1): the
// caster's party pose carries `rs: {to, at}` for RESCUE_HOLD_MS, and the member's own client, reading its party's poses,
// steps to the caster when a NEW `rs` names it - to where the caster stands in its own room (the peer whose account it
// is), a step in front. The receiving client decides, as ALLY-CAST's law holds: party members alone, the caster in
// sight in the same room (the cast's own pick; the receiver finds them among its room's peers), and nothing else moves.

import { t } from '../systems/textManager.js';
import { RESCUE_HOLD_MS, RESCUE_SET_DOWN_M, RESCUE_REACH_M } from '../systems/spell/bunnySpellLaw.js';

/**
 * @param {{ social: () => any, peers: () => Array<{ id: string, feet: number[] }> | null, accountOfPeer: (id: string) => string | null,
 *   feet: () => number[], moveTo: (p: number[]) => void, say: (s: string) => void, sent: () => void }} deps
 *   `sent()` asks the party pose to go out now; `moveTo` sets the player down (a teleport within the scene).
 */
export function createRescueLink(deps) {
  /** @type {{ to: string, at: number, until: number } | null} */
  let out = null;
  /** account -> the last `rs.at` read from it */
  const seen = new Map();
  let primed = false;

  return {
    /** The caster's call to the party member `id` (a peer in the room). Answers whether it went. */
    send(/** @type {string} */ id) {
      const s = deps.social();
      const acct = deps.accountOfPeer(id);
      if (!s?.party || !acct || !s.isPartyPeer?.(id)) return false;
      out = { to: acct, at: Date.now(), until: performance.now() + RESCUE_HOLD_MS };
      deps.sent();
      return true;
    },
    /** The pose's field while the call stands. */
    poseField() { return out && performance.now() < out.until ? { rs: { to: out.to, at: out.at } } : {}; },
    /** Each frame: a new call naming me brings me to its caster. */
    frame() {
      const s = deps.social();
      const me = s?.acct;
      if (!me) return;
      const members = s.others?.() ?? [];
      if (!primed) { for (const m of members) seen.set(m.acct, m?.p?.rs?.at ?? null); primed = true; return; }   // calls before I looked are not mine to answer
      for (const m of members) {
        const rs = m?.p?.rs;
        const was = seen.get(m.acct) ?? null;
        seen.set(m.acct, rs?.at ?? null);
        if (!rs || rs.to !== me || !Number.isFinite(rs.at) || rs.at === was) continue;
        const peer = (deps.peers() ?? []).find((p) => deps.accountOfPeer(p.id) === m.acct);
        if (!peer) continue;   // not in my room: nothing to step to
        const mine = deps.feet();
        const d = [mine[0] - peer.feet[0], 0, mine[2] - peer.feet[2]];
        const dist = Math.hypot(d[0], d[2]);
        if (dist > RESCUE_REACH_M + 10) continue;
        const k = dist > 0.01 ? RESCUE_SET_DOWN_M / dist : 0;
        deps.moveTo([peer.feet[0] + d[0] * k, peer.feet[1], peer.feet[2] + d[2] * k]);
        deps.say(t('spell.bunny.rescued', '{name} pulls you to their side.', { name: m.name ?? t('spell.bunny.aMember', 'A party member') }));
        return;
      }
    },
  };
}
