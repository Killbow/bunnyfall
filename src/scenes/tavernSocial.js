// @ts-check
// TAVERN-SOCIAL (2026-10-30): THE TAVERN BETWEEN PLAYERS - rounds bought, bards playing together, tips. All of it rides
// the room's pose (net/wire.js tavernOf): `tq` counts my rounds, `bp` says I play now, `tt`/`tn`/`tg` my last tip. Each
// client reads the others' and decides for itself, as Rescue's call is read (scenes/rescueLink.js): a NEW round from a
// player standing near lays the round on me; a NEW tip naming my account pays me. What was already on a pose when I
// first saw it is never acted on. The innkeeper's menu (systems/guild/bunnyServices.js bardTavernOffer) asks here what
// it can offer and pays through here.

import { addGoldPieces, goldPiecesOf } from '../systems/inventory.js';
import { drinkRound, roundPrice, buskShare, tavernWords, TAVERN_NEAR_M } from '../systems/tavern/tavernLaw.js';

/** How long the `bp` bit stands at most after a performance begins, ms (one that is left without a word ends with it). */
export const BUSK_HOLD_MS = 60_000;

/**
 * @param {{ entity: () => any, online: () => boolean, peers: () => Array<{ id: string, feet: number[] }> | null,
 *   peerPose: (id: string) => any, accountOfPeer: (id: string) => string | null, myAccount: () => string | null,
 *   nameOf: (id: string) => string | null, feet: () => number[], indoors: () => boolean, say: (s: string) => void,
 *   sent: () => void }} deps `sent()` asks the pose to go out now
 */
export function createTavernSocial(deps) {
  let rounds = 0;
  let playingUntil = 0;
  /** @type {{ to: string, n: number, g: number } | null} */
  let tip = null;
  let tips = 0;
  /** the bards heard playing while I play */
  const beside = new Set();
  /** peer -> what its pose last said (tq, tn) */
  const seen = new Map();

  const near = () => {
    const me = deps.feet();
    return (deps.peers() ?? []).filter((p) => me && p.feet && Math.hypot(p.feet[0] - me[0], p.feet[2] - me[2]) <= TAVERN_NEAR_M && Math.abs(p.feet[1] - me[1]) < 6);
  };
  const playing = () => performance.now() < playingUntil;

  return {
    /** The pose's fields. */
    poseField() {
      const out = {};
      if (rounds) out.tq = rounds;
      if (playing()) out.bp = 1;
      if (tip) { out.tt = tip.to; out.tn = tip.n; out.tg = tip.g; }
      return out;
    },
    /** Whether the tavern's player rows stand: online, indoors. */
    on: () => deps.online() && deps.indoors(),
    /** The price of a round now. */
    price: () => roundPrice(near().length),
    /** Buys a round: answers the lines to say. */
    buyRound() {
      const e = deps.entity();
      const gold = roundPrice(near().length);
      if (!e || goldPiecesOf(e) < gold) return [tavernWords.poor()];
      addGoldPieces(e, -gold);
      rounds = rounds >= 255 ? 1 : rounds + 1;
      const had = drinkRound(e);
      deps.sent();
      return [tavernWords.bought(), tavernWords.luck(), ...(had?.quenched ? [tavernWords.quenched()] : [])];
    },
    /** The bards playing near now, as `{ id, name }`. */
    bardsNear: () => near().filter((p) => deps.peerPose(p.id)?.bp === 1).map((p) => ({ id: p.id, name: deps.nameOf(p.id) ?? '?' })),
    /** Tips the bard `id` `gold`: answers the lines to say. */
    tipBard(/** @type {string} */ id, /** @type {number} */ gold) {
      const e = deps.entity();
      const to = deps.accountOfPeer(id);
      if (!e || !to || goldPiecesOf(e) < gold) return [tavernWords.poor()];
      addGoldPieces(e, -gold);
      tips = tips >= 255 ? 1 : tips + 1;
      tip = { to, n: tips, g: gold };
      deps.sent();
      return [tavernWords.tipped(deps.nameOf(id) ?? '?', gold)];
    },
    /** A performance begins. */
    startPlaying() { playingUntil = performance.now() + BUSK_HOLD_MS; beside.clear(); deps.sent(); },
    /** A performance ends: the pay's share for the bards beside me and the crowd, and the lines that say why. */
    stopPlaying() {
      playingUntil = 0;
      deps.sent();
      const crowd = near().filter((p) => deps.peerPose(p.id)?.bp !== 1).length;
      const bards = beside.size;
      beside.clear();
      return { share: buskShare(bards, crowd), lines: [...(bards ? [tavernWords.together(bards)] : []), ...(crowd ? [tavernWords.crowd(crowd)] : [])] };
    },
    /** Each frame: the others' rounds and tips. */
    frame() {
      if (!deps.online()) return;
      const me = deps.myAccount();
      const close = new Set(near().map((p) => p.id));
      for (const p of deps.peers() ?? []) {
        const pose = deps.peerPose(p.id);
        if (!pose) continue;
        const was = seen.get(p.id);
        const now = { tq: pose.tq | 0, tn: pose.tn | 0 };
        seen.set(p.id, now);
        if (pose.bp === 1 && playing() && close.has(p.id)) beside.add(p.id);
        if (!was) continue;   // first seen: what it says is from before me
        if (now.tq && now.tq !== was.tq && close.has(p.id) && deps.indoors()) {
          const had = drinkRound(deps.entity());
          deps.say(tavernWords.heard(deps.nameOf(p.id) ?? '?'));
          if (had?.quenched) deps.say(tavernWords.quenched());
        }
        if (now.tn && now.tn !== was.tn && me && pose.tt === me && pose.tg > 0) {
          addGoldPieces(deps.entity(), pose.tg);
          deps.say(tavernWords.tipHeard(deps.nameOf(p.id) ?? '?', pose.tg));
        }
      }
    },
  };
}
