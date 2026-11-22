// @ts-check
// BUNNYFALL VAMPIRE EXPANSION - THE VISUAL PASS: THE BEAST ON THE SCREEN. Two DOM layers over the game, never in the way
// (pointer-events none), read every BEAST_READ_MS from the curse (systems/vampire/vitae.js vampireStatus):
//   THE VIGNETTE  the screen's edge reddens as the Beast rises - nothing Sated, a breath of red Thirsty, deeper Hungry,
//                 and from Ravenous a slow heartbeat pulse; Starving the edge is dark blood. Both skins.
//   THE VIAL      on the Classic skin (whose HUD is Daggerfall's own canvas), a small blood vial at the left edge filled to
//                 the Vitae in the classic's wood and gold; Enhanced Plus draws its Vitae bar above the vitals instead
//                 (ui/enhanced/enhancedHud.js).
// Hidden while the HUD is hidden (hudShortcuts.js hudRenderEnabled) and for a vampire the Elder has not awakened.

import { vampireStatus } from '../../systems/vampire/vitae.js';
import { beastStageName } from '../../systems/vampire/bloodLaw.js';
import { isEnhanced } from '../uiSkin.js';
import { hudRenderEnabled } from '../hudShortcuts.js';
import { PIXEL_STACK } from '../pixelifyFive.js';

export const BEAST_READ_MS = 400;
/** The vignette's strength by the Beast's stage. */
export const VIGNETTE = Object.freeze([0, 0.07, 0.16, 0.28, 0.42]);

const CSS = `
@keyframes vk-heartbeat { 0%, 100% { opacity: var(--vk-base); } 12% { opacity: calc(var(--vk-base) + 0.16); } 24% { opacity: var(--vk-base); } 36% { opacity: calc(var(--vk-base) + 0.1); } }
.vk-vignette { position: fixed; inset: 0; pointer-events: none; z-index: 4; transition: opacity 900ms ease;
  background: radial-gradient(ellipse at center, transparent 48%, rgba(120,0,12,0.55) 78%, rgba(40,0,4,0.95) 100%); }
.vk-vignette.beat { animation: vk-heartbeat 1.6s ease-in-out infinite; }
.vk-vial { position: fixed; left: 10px; top: 42%; width: 22px; height: 82px; pointer-events: none; z-index: 4; }
.vk-vial .glass { position: absolute; inset: 10px 3px 0 3px; border: 2px solid #8a6a3a; border-radius: 0 0 9px 9px; background: #0e0905; box-shadow: inset 0 0 0 1px #000, 0 0 0 1px #000; overflow: hidden; }
.vk-vial .neck { position: absolute; left: 6px; right: 6px; top: 0; height: 12px; border: 2px solid #8a6a3a; border-bottom: none; background: #2a1d14; }
.vk-vial .blood { position: absolute; left: 0; right: 0; bottom: 0; background: linear-gradient(180deg, #e0303f, #6a0a14); transition: height 600ms ease; }
.vk-vial .word { position: absolute; left: 28px; top: 34px; white-space: nowrap; font: 12px ${PIXEL_STACK}; color: #f0d27a; text-shadow: 1px 1px 0 #000; }
`;

/** @param {{ entity: any, now: () => number, doc?: Document | null }} deps */
export function installBeastOverlay({ entity, now, doc = globalThis.document ?? null }) {
  if (!doc?.createElement || /** @type {any} */ (doc).__vkBeast) return;
  /** @type {any} */ (doc).__vkBeast = true;
  const st = doc.createElement('style');
  st.textContent = CSS;
  doc.head.append(st);
  const vig = doc.createElement('div');
  vig.className = 'vk-vignette';
  vig.style.opacity = '0';
  const vial = doc.createElement('div');
  vial.className = 'vk-vial';
  vial.innerHTML = '<div class="neck"></div><div class="glass"><div class="blood"></div></div><div class="word"></div>';
  vial.style.display = 'none';
  doc.body.append(vig, vial);
  const blood = /** @type {HTMLElement} */ (vial.querySelector('.blood'));
  const word = /** @type {HTMLElement} */ (vial.querySelector('.word'));
  let lastStage = -1;
  setInterval(() => {
    let s = null;
    try { s = hudRenderEnabled() ? vampireStatus(entity, Math.floor(now())) : null; } catch { s = null; }
    const stage = s ? s.stage : 0;
    const base = VIGNETTE[stage] ?? 0;
    vig.style.setProperty('--vk-base', String(base));
    vig.style.opacity = String(base);
    if (stage !== lastStage) { lastStage = stage; vig.classList.toggle('beat', stage >= 3); }
    const showVial = !!s && !isEnhanced();
    vial.style.display = showVial ? 'block' : 'none';
    if (showVial && s) {
      blood.style.height = `${Math.round((s.vitae / s.max) * 100)}%`;
      word.textContent = stage >= 2 ? beastStageName(stage) : '';
    }
  }, BEAST_READ_MS);
}
