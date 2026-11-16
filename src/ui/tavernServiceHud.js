// @ts-check
// One readout, two existing UI skins. Never a cursor surface or a separate theme.
import { t } from '../systems/textManager.js';
import { isEnhanced } from '../systems/uiSkin.js';
import { injectEnhancedStyle, injectEnhancedFonts } from './enhanced/enhancedStyle.js';
import { nativeMetrics, shadowText, drawRect } from './native/nativePanel.js';
import { wrapText } from './talkWindow.js';
import { tavernRecipeName, tavernIngredientName } from '../systems/tavern/tavernServiceWords.js';
import { tavernOrder, tavernDoseCount } from '../net/tavernServiceLaw.js';

/** Shared model; inject only the skin predicate/document for UI tests. @param {any} [options] */
export function createTavernServiceHud(options = {}) {
  const enhanced = options.enhanced ?? isEnhanced;
  const doc = options.document ?? globalThis.document;
  let node = null, sig = '', visible = false, state = null, lines = [];
  function ensure() {
    if (node || !doc) return;
    injectEnhancedStyle(doc); injectEnhancedFonts(doc);
    node = doc.createElement('section');
    // wplaque owns fonts, frame, colours and Enhanced Plus themes. Only placement is service-specific.
    node.className = 'wplaque tavern-service-hud'; node.setAttribute('aria-label', t('tavern.service.hud', 'Tavern service'));
    doc.body.append(node); sig = '';
  }
  function paintEnhanced() {
    if (!enhanced() || !visible) { node?.classList.remove('on'); if (node) node.hidden = true; return; }
    ensure(); if (!node) return;
    node.hidden = false; node.classList.add('on');
    const next = JSON.stringify(lines);
    if (sig === next) return; sig = next;
    node.replaceChildren();
    lines.forEach((line, i) => {
      const p = doc.createElement('div'); p.textContent = line;
      p.className = i === 1 || i === 2 ? 'wplaque-title' : 'wplaque-sub'; node.append(p);
    });
  }
  return {
    /** @param {any} value @param {(id: string) => string} name @param {boolean} busy */
    frame(value, name, busy) {
      state = value; visible = !!state && state.phase !== 'done';
      if (!visible) { paintEnhanced(); return; }
      const order = tavernOrder(state);
      lines = [t('tavern.service.shift', 'Service {n}/{total}', { n: state.index + 1, total: state.orders.length }),
        name(order.patron), tavernRecipeName(order.recipe),
        state.phase === 'mix' || state.phase === 'carry' ? t('tavern.service.contents', '{n}/3 doses: {mix}', { n: tavernDoseCount(state.mix), mix: Object.entries(state.mix).filter(([, n]) => n).map(([k, n]) => `${tavernIngredientName(k)} ${n}`).join(', ') || '-' }) : t('tavern.service.returnEmpty', 'Collect the empty cup and return it to the innkeeper.'),
        busy ? t('tavern.service.confirming', 'Confirming with the innkeeper...') : t('tavern.service.earned', 'Earned: {gold} gold', { gold: state.earned })];
      paintEnhanced();
    },
    /** Classic uses the loaded bitmap font and standard shadow. Cup materials are world art, not UI chrome. */
    draw(renderer, canvas, font) {
      if (!visible) return;
      paintEnhanced();
      const m = nativeMetrics(canvas);
      if (!enhanced() && font?.fnt) {
        let y = 24;
        for (const text of lines) for (const line of wrapText(font.fnt, text, 112)) {
          shadowText(renderer, font, line, m, 6, y); y += 9;
        }
      }
      if (state.phase === 'served') return;
      const x = 212, y = 119, w = 17, h = 24;
      const edge = [.7, .63, .49, 1], inside = [.25, .21, .15, 1];
      drawRect(renderer, m, x, y, w, h, edge);
      drawRect(renderer, m, x + 2, y + 1, w - 4, h - 3, inside);
      drawRect(renderer, m, x + w, y + 5, 6, 13, edge);
      drawRect(renderer, m, x + w, y + 7, 4, 9, inside);
      const fill = Math.round(tavernDoseCount(state.mix) / 3 * (h - 6));
      if (fill) {
        const colour = state.mix.cream > state.mix.wine + state.mix.beer ? [.78, .7, .56, 1] : state.mix.wine > state.mix.beer ? [.53, .25, .25, 1] : [.73, .52, .18, 1];
        drawRect(renderer, m, x + 2, y + h - 2 - fill, w - 4, fill, colour);
        drawRect(renderer, m, x + 2, y + h - 2 - fill, w - 4, 2, [.87, .81, .68, 1]);
      }
    },
    hide() { visible = false; paintEnhanced(); },
    dispose() { node?.remove(); node = null; sig = ''; visible = false; state = null; lines = []; },
  };
}
