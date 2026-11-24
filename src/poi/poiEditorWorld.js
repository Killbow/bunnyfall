// The POI feed, made and started at boot, and the lazy door that loads the POI editor only when
// the page asks for `?editor`.
import { appStorage } from '../platform/appStorage.js';
import { browserPoiCache, createPoiFeed } from './poiFeed.js';
import { serviceBase } from '../net/accountClient.js';

/** @param {any} shared */
export function createPoiEditorWorld(shared) {
  shared.poiFeed = createPoiFeed({ base: () => serviceBase(appStorage()), cache: browserPoiCache() });
  shared.poiFeed.start().catch((e) => console.warn('[poi] the kept feed', e?.message ?? e));
  const startPoiEditor = () => {
    import('./poiEditorMount.js').then(({ startPoiEditor: mount }) => { if (shared.alive()) mount(shared); }, (e) => console.warn('[poi] the editor did not load', e?.message ?? e));
  };
  return { startPoiEditor };
}
