// Messages in: `{t: build, id, seed, c, geo, band, given, lite}`. Out: `{t: built, id, parts}` with buffers
// transferred, or `{t: error, id, message}`. Imports pure modules only, since a worker has no DOM.

import { egCircleBuild, egCirclePartsTransfers } from './egCircleParts.js';
import { loadEgHeroFragMeshes, egHeroFragIdsOf } from './egHeroFragModel.js';
import { egCircleSpecs, egSpecGive } from '../../net/eliteGates/egLaw.js';

globalThis.onmessage = async (ev) => {
  const m = ev.data ?? {};
  if (m.t !== 'build') return;
  try {
    for (const s of Array.isArray(m.given) ? m.given : []) egSpecGive(s);
    await loadEgHeroFragMeshes(egHeroFragIdsOf(egCircleSpecs(m.seed, m.c, m.geo ?? 0)));
    const parts = egCircleBuild(m);
    globalThis.postMessage({ t: 'built', id: m.id, parts }, egCirclePartsTransfers(parts));
  } catch (e) {
    globalThis.postMessage({ t: 'error', id: m.id, message: String(e?.message ?? e) });
  }
};
