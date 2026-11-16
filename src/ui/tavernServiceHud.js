// @ts-check
// A readout, never a cursor surface. All actions use the existing NPC ray and world plaque.
import { t } from '../systems/textManager.js';
import { tavernRecipeName, tavernIngredientName } from '../systems/tavern/tavernServiceWords.js';
import { tavernOrder, tavernDoseCount } from '../net/tavernServiceLaw.js';

export function createTavernServiceHud() {
  let node = null, sig = '';
  function ensure() {
    if (node || typeof document === 'undefined') return;
    node = document.createElement('section');
    node.className = 'tavern-service-hud'; node.setAttribute('aria-label', t('tavern.service.hud', 'Tavern service'));
    // Scoped and owned by this node: the look stays locked, the reticle and the normal world plaque remain clear.
    const style = document.createElement('style');
    style.textContent = '.tavern-service-hud{position:fixed;top:15%;left:14px;max-width:min(245px,45vw);z-index:5;pointer-events:none;color:#eee0bd;background:#241d16ed;border-left:2px solid #b89756;padding:11px 13px;font:13px/1.5 Georgia,serif;text-shadow:0 1px #000}.tavern-service-hud p{margin:4px 0}.tavern-service-hud .ts-small{font-size:12px;color:#cfbe9b}.tavern-service-hud .ts-mug{position:fixed;bottom:19%;right:22%;width:52px;height:72px;border:4px solid #baaa89;border-radius:3px 3px 8px 8px;background:#443627;overflow:visible;box-shadow:3px 4px 5px #0006}.tavern-service-hud .ts-mug:after{content:"";position:absolute;right:-20px;top:12px;width:16px;height:35px;border:4px solid #baaa89;border-radius:0 9px 9px 0}.tavern-service-hud .ts-fill{position:absolute;bottom:0;left:0;right:0;background:#bc842f;border-top:5px solid #ddceae;transition:height .18s}.tavern-service-hud .ts-dirty{opacity:.6}@media(max-width:600px){.tavern-service-hud{top:12%;left:8px;padding:8px;max-width:47vw;font-size:12px}.tavern-service-hud .ts-mug{right:18%;bottom:24%;width:40px;height:58px}}@media(prefers-reduced-motion:reduce){.tavern-service-hud .ts-fill{transition:none}}';
    node.append(style); document.body.append(node);
  }
  return {
    /** @param {any} state @param {(id: string) => string} name @param {boolean} busy */
    frame(state, name, busy) {
      if (!state || state.phase === 'done') { if (node) node.hidden = true; return; }
      ensure(); if (!node) return; node.hidden = false;
      const order = tavernOrder(state);
      const lines = [t('tavern.service.shift', 'Service {n}/{total}', { n: state.index + 1, total: state.orders.length }),
        name(order.patron), tavernRecipeName(order.recipe),
        state.phase === 'mix' || state.phase === 'carry' ? t('tavern.service.contents', '{n}/3 doses: {mix}', { n: tavernDoseCount(state.mix), mix: Object.entries(state.mix).filter(([, n]) => n).map(([k, n]) => `${tavernIngredientName(k)} ${n}`).join(', ') || '-' }) : t('tavern.service.returnEmpty', 'Collect the empty cup and return it to the innkeeper.'),
        busy ? t('tavern.service.confirming', 'Confirming with the innkeeper...') : t('tavern.service.earned', 'Earned: {gold} gold', { gold: state.earned })];
      const next = JSON.stringify([lines, state.phase, state.mix]);
      if (sig === next) return; sig = next;
      for (const child of [...node.children]) if (child.tagName !== 'STYLE') child.remove();
      lines.forEach((line, i) => { const p = document.createElement('p'); p.textContent = line; if (i === 0 || i > 2) p.className = 'ts-small'; node.append(p); });
      if (state.phase !== 'served') {
        const cup = document.createElement('div'); cup.className = `ts-mug${state.phase === 'dirty' ? ' ts-dirty' : ''}`; cup.setAttribute('aria-hidden', 'true');
        const fill = document.createElement('div'); fill.className = 'ts-fill'; fill.style.height = `${tavernDoseCount(state.mix) / 3 * 80}%`;
        if (state.mix.cream > state.mix.wine + state.mix.beer) fill.style.background = '#c8b390'; else if (state.mix.wine > state.mix.beer) fill.style.background = '#873f40';
        cup.append(fill); node.append(cup);
      }
    },
    hide() { if (node) node.hidden = true; },
    dispose() { node?.remove(); node = null; sig = ''; },
  };
}
