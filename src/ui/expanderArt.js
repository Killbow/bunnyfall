import { dialFileUrl } from './grimoireArt.js';
import { effectSchool } from '../magic/spellcost.js';
import { pageParam } from '../platform/pageQuery.js';
import { isEnhanced } from './uiSkin.js';

export const illustratedUiOn = () => isEnhanced() && pageParam('bankart') !== 'off';

const loadArt = file => import(/* @vite-ignore */ dialFileUrl('dfo-expander/' + file));
const motionAllowed = () => !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let spellScene;
export async function animateSpellPreview(canvas, spell) {
  const { default: art } = await (spellScene ??= loadArt('spell-scene.js'));
  if (!canvas.isConnected) return;
  canvas.width = art.DEFAULT_WIDTH;
  canvas.height = art.DEFAULT_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const slots = (spell.effects ?? []).filter(effect => effect?.type >= 0).slice(0, 3)
    .map(effect => ({ school: effectSchool(effect), element: spell.element ?? 4 }));
  const analysis = art.analyzeSlots(slots);
  const controller = art.createController({ initialTime: .5, initialOpen: 1, firstBurstAt: 2.2 });
  let last = -Infinity;
  const frame = now => {
    if (!canvas.isConnected) return;
    if (now - last >= 1000/24) {
      if (Number.isFinite(last)) controller.update(Math.min(.1, (now-last)/1000), slots.length > 0);
      last = now;
      art.renderScene(ctx, canvas.width, canvas.height, {
        analysis, tSec: controller.getTime(), flipSnapshot: controller.getFlipSnapshot(),
        openAmount: controller.getOpenAmount(),
      });
      canvas.hidden = false;
      canvas.previousElementSibling.hidden = true;
    }
    if (motionAllowed()) requestAnimationFrame(frame);
  };
  frame(performance.now());
}

let bankScene;
const bankFrames = new WeakMap();
export function paintBankArt(canvas, vault) {
  const now = performance.now();
  if (now - (bankFrames.get(canvas) ?? -Infinity) < 1000/24) return;
  if (!motionAllowed() && bankFrames.has(canvas)) return;
  bankFrames.set(canvas, now);
  (bankScene ??= loadArt('bank-scenes.js')).then(art => {
    if (!canvas.isConnected || bankFrames.get(canvas) !== now) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const time = motionAllowed() ? now / 1000 : 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (vault) {
      art.drawSafeHangingLantern(ctx, 36, 1, .85, time);
      const pulse = art.computeBankSparklePulses(time);
      art.drawBankSparkle(ctx, 122, 78, 3, pulse.p1);
      art.drawBankSparkle(ctx, 163, 84, 2, pulse.p2);
    } else {
      art.drawNotesTableCandelabra(ctx, 42, 98, time);
    }
  }).catch(() => {});
}
