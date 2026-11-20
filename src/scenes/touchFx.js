// @ts-check
// BUNNYFALL TOUCH: THE LITTLE ANIMATIONS - a gesture's pictures (net/touchLaw.js TOUCH_FX) float up from over the
// bodies it was between. Visual only: a DOM layer over the game, positioned each frame from the bodies' heads.
// The bodies have no hug or kiss clip (see the EMOTE1 note in net/chatCommands.js), so the air does the acting.
import { TOUCH_FX, fxOfLine } from '../net/touchLaw.js';

export const FX_MS = 1700;
const MAX_BURSTS = 12;

/**
 * @param {{ doc?: Document }} [deps]
 */
export function createTouchFx({ doc = document } = {}) {
  const layer = doc.createElement('div');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;overflow:hidden;';
  doc.body.append(layer);
  /** @type {{ id: string, at: number, nodes: { el: HTMLElement, dx: number, delay: number }[] }[]} */
  let bursts = [];

  function burst(id, verb, nowMs) {
    const glyphs = TOUCH_FX[verb];
    if (!id || !glyphs) return;
    const nodes = [];
    for (let i = 0; i < 5; i++) {
      const el = doc.createElement('span');
      el.textContent = glyphs[i % glyphs.length];
      el.style.cssText = 'position:absolute;left:0;top:0;font-size:22px;opacity:0;will-change:transform,opacity;';
      layer.append(el);
      nodes.push({ el, dx: (i - 2) * 14 + (Math.random() - 0.5) * 8, delay: i * 120 });
    }
    bursts.push({ id, at: nowMs, nodes });
    while (bursts.length > MAX_BURSTS) { const old = bursts.shift(); old?.nodes.forEach((n) => n.el.remove()); }
  }

  return {
    burst,
    /** A Local action line heard (or said by me): float its gesture over the speaker and the one aimed at.
     *  `peerByName(name)` is the host's id of the player called that, or null. */
    line(speakerId, text, peerByName, nowMs) {
      const f = fxOfLine(text);
      if (!f) return;
      burst(speakerId, f.verb, nowMs);
      const other = f.target ? peerByName?.(f.target) : null;
      if (other && other !== speakerId) burst(other, f.verb, nowMs);
    },
    /** Each frame: `head(id)` is the screen point over a body, `{x, y}`, or null (out of sight). */
    frame(nowMs, head) {
      bursts = bursts.filter((b) => {
        const age = nowMs - b.at;
        if (age > FX_MS + 600) { b.nodes.forEach((n) => n.el.remove()); return false; }
        const p = head(b.id);
        for (const n of b.nodes) {
          const k = (age - n.delay) / FX_MS;
          if (!p || k < 0 || k > 1) { n.el.style.opacity = '0'; continue; }
          const rise = 70 * k, sway = Math.sin(k * 6 + n.dx) * 6;
          n.el.style.opacity = String(k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4));
          n.el.style.transform = `translate(${p.x + n.dx + sway}px, ${p.y - rise}px) scale(${0.7 + 0.5 * Math.min(1, k * 3)})`;
        }
        return true;
      });
    },
    destroy() { layer.remove(); bursts = []; },
  };
}
