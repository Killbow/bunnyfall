// @ts-check
import { MOBILE_NPC_ACTIVATION_DISTANCE } from './activate.js';
import { WHY_IN_PARTY } from '../net/social.js';

export const SOCIAL_REACH = MOBILE_NPC_ACTIVATION_DISTANCE;

/**
 * @template {{ id: string, cv?: number }} P
 * @param {P[]|null|undefined} peers
 * @param {((id: string) => boolean)|null} isMate
 * @returns {P[]}
 */
export function openPeers(peers, isMate) {
  if (!Array.isArray(peers)) return [];
  return peers.filter((p) => p && (!p.cv || (typeof isMate === 'function' && isMate(p.id) === true)));
}

/**
 * @param {number[]} camPos
 * @param {number[]} fwd
 * @param {{ id: string, feet: number[] }[]|null} peers
 * @param {number} reach
 * @param {(camPos: number[], fwd: number[], feet: number[]) => number} distanceOf
 * @returns {{ peer: { id: string, feet: number[] }, distance: number }|null}
 */
export function pickPeerInFront(camPos, fwd, peers, reach, distanceOf) {
  if (!Array.isArray(peers) || typeof distanceOf !== 'function') return null;
  let best = null, bestDist = Infinity;
  for (const p of peers) {
    if (!p || !Array.isArray(p.feet)) continue;
    const d = distanceOf(camPos, fwd, p.feet);
    if (d < bestDist) { best = p; bestDist = d; }
  }
  if (!best || !(bestDist <= reach)) return null;
  return { peer: best, distance: bestDist };
}

export const PEER_KEY_PREFIX = 'peer:';

export const peerIdOfKey = (key) => (typeof key === 'string' && key.startsWith(PEER_KEY_PREFIX) && key.length > PEER_KEY_PREFIX.length ? key.slice(PEER_KEY_PREFIX.length) : null);

/**
 * @param {{ peer: { id: string }, distance: number }|null} hit
 * @param {number} [reach]
 * @returns {{ key: string, distance: number, reach: number }|null}
 */
export function peerRayPick(hit, reach = SOCIAL_REACH) {
  if (!hit?.peer?.id || !Number.isFinite(hit.distance)) return null;
  return { key: PEER_KEY_PREFIX + hit.peer.id, distance: hit.distance, reach };
}

/**
 * @param {{ relation?: string|null, whyNotInvite?: string|null }|null} acts
 * @returns {string|null}
 */
export function peerRelationText(acts) {
  if (!acts) return null;
  if (acts.whyNotInvite === WHY_IN_PARTY) return 'In your party';
  if (acts.relation === 'friend') return 'Friend';
  return null;
}
