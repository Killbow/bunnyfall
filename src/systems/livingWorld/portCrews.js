// @ts-check

/**
 * @typedef {{ key: string, a: { id: number }, b: { id: number } }} Lane
 * @typedef {{ lane: Lane, k: number, count: number }} Berth
 */

/**
 * @param {readonly Lane[]} lanes
 * @param {number} portId
 * @param {(lane: Lane) => number} countOf
 * @returns {Berth[]}
 */
export function portPackets(lanes, portId, countOf) {
  const out = [];
  for (const lane of [...lanes].sort((p, q) => (p.key < q.key ? -1 : p.key > q.key ? 1 : 0))) {
    if (lane.a.id !== portId && lane.b.id !== portId) continue;
    const n = countOf(lane) | 0;
    for (let k = 0; k < n; k++) out.push({ lane, k, count: n });
  }
  return out;
}

/**
 * @param {{ slot: number }} res
 * @param {readonly { slot: number }[]} sailors
 * @param {readonly Berth[]} packets
 */
export function berthOf(res, sailors, packets) {
  const order = [...sailors].sort((p, q) => p.slot - q.slot);
  const i = order.findIndex((s) => s.slot === res.slot);
  return packets.length && i >= 0 ? packets[i % packets.length] : null;
}

/**
 * @param {Berth|null} berth
 * @param {number} portId
 * @param {(berth: Berth) => ({ phase: string, port?: { id: number } | null, until?: number | null } | null)} packetAt
 * @returns {{ at: 'home'|'sea'|'abroad', port?: number, until?: number }}
 */
export function sailorAt(berth, portId, packetAt) {
  if (!berth) return { at: 'home' };
  const p = packetAt(berth);
  if (!p) return { at: 'home' };
  if (p.phase !== 'dwell') return { at: 'sea' };
  if (p.port?.id === portId) return { at: 'home' };
  return { at: 'abroad', port: p.port?.id, until: p.until ?? undefined };
}

/**
 * @param {number} portId
 * @param {readonly Lane[]} lanes
 * @param {(lane: Lane) => number} countOf
 * @param {(berth: Berth) => ({ phase: string, port?: { id: number } | null, until?: number | null } | null)} packetAt
 * @param {(portId: number) => readonly { slot: number }[]} sailorsOf
 * @returns {{ res: any, until: number, berth: Berth }[]}
 */
export function crewsAshore(portId, lanes, countOf, packetAt, sailorsOf) {
  const out = [];
  for (const berth of portPackets(lanes, portId, countOf)) {
    const p = packetAt(berth);
    if (!p || p.phase !== 'dwell' || p.port?.id !== portId) continue;
    const far = berth.lane.a.id === portId ? berth.lane.b.id : berth.lane.a.id;
    const theirs = portPackets(lanes, far, countOf);
    const sailors = sailorsOf(far) ?? [];
    for (const s of sailors) {
      const b = berthOf(s, sailors, theirs);
      if (b && b.lane.key === berth.lane.key && b.k === berth.k) out.push({ res: s, until: p.until ?? 0, berth });
    }
  }
  return out;
}
