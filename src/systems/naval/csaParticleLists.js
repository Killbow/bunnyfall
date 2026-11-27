// @ts-check
// The lists and their records are reused from frame to frame; the draw reads them in the same frame.
import { RENDER_MODE } from '../../world/unityParticles.js';

/**
 * @param {{ boats: () => any[], seaBoats: () => any[] | null, fadeFlats: number, flies: (boat: any) => boolean }} deps
 */
export function createCsaParticleLists(deps) {
  const lists = { wake: [], flags: [], drops: [] };
  const pool = [];
  let used = 0;
  const take = () => {
    let r = pool[used];
    if (!r) pool[used] = r = { position: [0, 0, 0], size: [0, 0, 0], rotation: null, systemRotation: null, maxSize: 0, color: undefined };
    used++;
    return r;
  };
  function addBoat(boat) {
    if ((boat.fade ?? 1) < deps.fadeFlats) return;
    for (const ps of boat.particleSystems ?? []) {
      if (!ps.particleCount || !ps.renderer?.m_Enabled) continue;
      const material = ps.renderer.m_Materials?.[0]?.material;
      const list = ps.renderer.m_RenderMode === RENDER_MODE.Mesh ? lists.flags : material === 'Default-Particle' ? lists.drops : material === 'WakeMaterial' ? lists.wake : null;
      if (!list) continue;
      const maxSize = ps.renderer.m_MaxParticleSize ?? 0.5;
      if (list === lists.flags && deps.flies(boat)) continue;
      const color = list === lists.flags && boat.flagColor ? boat.flagColor : undefined;
      const from = list.length;
      ps.renderInto(list, take);
      for (let i = from; i < list.length; i++) { list[i].maxSize = maxSize; list[i].color = color; }
    }
  }
  return function csaParticleLists() {
    lists.wake.length = 0; lists.flags.length = 0; lists.drops.length = 0;
    used = 0;
    for (const boat of deps.boats()) addBoat(boat);
    for (const boat of deps.seaBoats() ?? []) addBoat(boat);
    return lists;
  };
}
