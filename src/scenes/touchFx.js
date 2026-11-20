// @ts-check
// BUNNYFALL TOUCH: THE LITTLE ANIMATIONS - what a gesture throws up when it is said on Local. Visual and sound only: a DOM
// layer over the game, positioned each frame from the bodies' heads. The bodies have no hug or kiss clip (see the EMOTE1
// note in net/chatCommands.js), so the air does the acting:
//   - a plate over the speaker's head says the action ("Bran hugs Ann."), in the skin's own dress;
//   - the gesture's pictures move in its own way (hearts orbit a hug, sparks burst from a high five, a wave rolls);
//   - a soft glow blooms on each body it was between;
//   - when the gesture is MINE or AT ME there is no head to draw over (first person), so the plate sits high on the screen
//     and the glow washes the screen's edge;
//   - a short chime or click answers it (`play`).
import { TOUCH_FX, fxOfLine } from '../net/touchLaw.js';

export const FX_MS = 1900;
export const PLATE_MS = 3600;
const MAX_BURSTS = 12;
const NODES = 6;

/** How a gesture's pictures move: 'orbit' circles the head, 'burst' flies out and falls, 'wave' sweeps side to side,
 *  anything else rises. And the glow's colour. */
const MOTION = Object.freeze({
  hug: 'orbit', embrace: 'orbit', cuddle: 'orbit', hold: 'orbit', nuzzle: 'orbit', comfort: 'orbit', kiss: 'orbit', handkiss: 'orbit',
  highfive: 'burst', fistbump: 'burst', bump: 'burst', cheer: 'burst', clap: 'burst', toast: 'burst', dance: 'burst', poke: 'burst', tickle: 'burst',
  wave: 'wave', bow: 'wave', salute: 'wave', wink: 'wave',
});
const GLOW = Object.freeze({ kiss: '255,120,160', handkiss: '255,120,160', hug: '255,170,90', embrace: '255,150,110', cuddle: '255,150,170', comfort: '255,205,110', hold: '255,160,170', nuzzle: '255,160,170' });
const GLOW_DEFAULT = '240,200,110';

/**
 * @param {{ doc?: Document, play?: (verb: string, involvesMe: boolean) => void, enhanced?: () => boolean }} [deps]
 */
export function createTouchFx({ doc = document, play, enhanced = () => true } = {}) {
  const layer = doc.createElement('div');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;overflow:hidden;';
  const style = doc.createElement('style');
  style.textContent = `
.dftfx-plate { position:absolute; left:0; top:0; max-width:260px; padding:5px 12px; border-radius:3px; text-align:center; font-size:14px; line-height:1.25; white-space:normal; will-change:transform,opacity; text-shadow:0 1px 2px #000; }
.dftfx-plate[data-skin="enhanced"] { background:rgba(14,16,19,.9); border:1px solid #c08a3e; color:#e9e4d9; font-family:var(--display, Georgia, serif); font-size:16px; box-shadow:0 0 12px rgba(192,138,62,.35); }
.dftfx-plate[data-skin="classic"] { background:#2a1d14; border:2px solid #5b4630; color:#f0d27a; font-family:var(--pixel, monospace); box-shadow:0 0 0 1px #0e0905; }
.dftfx-glow { position:absolute; left:0; top:0; width:150px; height:150px; margin:-75px 0 0 -75px; border-radius:50%; will-change:transform,opacity; }
.dftfx-edge { position:absolute; inset:0; opacity:0; will-change:opacity; }
@media (prefers-reduced-motion: reduce) { .dftfx-glow, .dftfx-edge { display:none; } }
`;
  doc.head.append(style);
  doc.body.append(layer);
  /** @type {{ id: string|null, at: number, motion: string, glow: HTMLElement|null, plate: HTMLElement|null, edge: HTMLElement|null, nodes: { el: HTMLElement, a: number, delay: number, v: number }[] }[]} */
  let bursts = [];
  const drop = (b) => { b.nodes.forEach((n) => n.el.remove()); b.glow?.remove(); b.plate?.remove(); b.edge?.remove(); };

  /** @param {string|null} id the body it is over (null: mine, drawn on the screen) */
  function burst(id, verb, nowMs, plateText, aimedAtMe) {
    const glyphs = TOUCH_FX[verb];
    if (!glyphs) return;
    const motion = MOTION[verb] ?? 'rise';
    const rgb = GLOW[verb] ?? GLOW_DEFAULT;
    const nodes = [];
    for (let i = 0; i < NODES; i++) {
      const el = doc.createElement('span');
      el.textContent = glyphs[i % glyphs.length];
      el.style.cssText = 'position:absolute;left:0;top:0;font-size:22px;opacity:0;will-change:transform,opacity;';
      layer.append(el);
      nodes.push({ el, a: (i / NODES) * Math.PI * 2 + Math.random() * 0.5, delay: i * 110, v: 0.7 + Math.random() * 0.6 });
    }
    let glow = null, edge = null, plate = null;
    if (id) {
      glow = doc.createElement('div');
      glow.className = 'dftfx-glow';
      glow.style.background = `radial-gradient(circle, rgba(${rgb},.55) 0%, rgba(${rgb},.18) 45%, transparent 70%)`;
      layer.append(glow);
    } else if (aimedAtMe) {
      edge = doc.createElement('div');
      edge.className = 'dftfx-edge';
      edge.style.background = `radial-gradient(ellipse at center, transparent 55%, rgba(${rgb},.38) 100%)`;
      layer.append(edge);
    }
    if (plateText) {
      plate = doc.createElement('div');
      plate.className = 'dftfx-plate';
      plate.dataset.skin = enhanced() ? 'enhanced' : 'classic';
      plate.textContent = plateText;
      layer.append(plate);
    }
    bursts.push({ id, at: nowMs, motion, glow, plate, edge, nodes });
    while (bursts.length > MAX_BURSTS) { const old = bursts.shift(); if (old) drop(old); }
  }

  const sentence = (name, text) => {
    const t = String(text ?? '').trim();
    return name ? `${name} ${t}` : t.charAt(0).toUpperCase() + t.slice(1);
  };

  return {
    burst,
    /** A Local action line heard (or said by me): the plate, pictures, glow and sound for its gesture.
     *  `peerByName(name)` is the host's id of the player called that, or null. `who` is { name, mine, myName }: the speaker's name,
     *  `mine` whether I said it, and `myName` my own name. */
    line(speakerId, text, peerByName, nowMs, who = {}) {
      const f = fxOfLine(text);
      if (!f) return;
      const mine = !!who.mine;
      const target = f.target || '';
      const atMe = !!target && !!who.myName && target.toLowerCase() === String(who.myName).toLowerCase();
      const line = sentence(who.name, text);
      // the speaker: over their head when I can see them, else on the screen (that is me)
      burst(mine ? null : speakerId, f.verb, nowMs, line, atMe);
      const other = target && !atMe ? peerByName?.(target) : null;
      if (other && other !== speakerId) burst(other, f.verb, nowMs, '', false);
      try { play?.(f.verb, mine || atMe); } catch { /* a sound that will not play is no loss */ }
    },
    /** Each frame: `head(id)` is the screen point over a body, `{x, y}`, or null (out of sight). `size` is the screen's
     *  { w, h } for the pieces that live on the screen itself. */
    frame(nowMs, head, size = { w: 1280, h: 720 }) {
      bursts = bursts.filter((b) => {
        const age = nowMs - b.at;
        if (age > Math.max(FX_MS + 700, PLATE_MS + 400)) { drop(b); return false; }
        const p = b.id ? head(b.id) : size.w > 0 ? { x: size.w / 2, y: size.h * 0.3 } : null;
        const onScreen = !b.id;
        // the plate: rises a little, holds, fades
        if (b.plate) {
          const k = age / PLATE_MS;
          if (!p || k > 1) b.plate.style.opacity = '0';
          else {
            b.plate.style.opacity = String(k < 0.08 ? k / 0.08 : 1 - Math.max(0, (k - 0.75) / 0.25));
            const lift = onScreen ? 0 : 54 + 8 * Math.min(1, age / 400);
            b.plate.style.transform = `translate(${p.x - b.plate.offsetWidth / 2}px, ${p.y - lift - (onScreen ? 0 : b.plate.offsetHeight)}px)`;
          }
        }
        // the glow: blooms and fades over the first moments
        if (b.glow) {
          const k = age / 1100;
          if (!p || k > 1) b.glow.style.opacity = '0';
          else { b.glow.style.opacity = String(Math.sin(k * Math.PI)); b.glow.style.transform = `translate(${p.x}px, ${p.y + 52}px) scale(${0.6 + 0.7 * k})`; }
        }
        if (b.edge) { const k = age / 1400; b.edge.style.opacity = k > 1 ? '0' : String(Math.sin(k * Math.PI)); }
        // the pictures
        for (const n of b.nodes) {
          const k = (age - n.delay) / FX_MS;
          if (!p || k < 0 || k > 1) { n.el.style.opacity = '0'; continue; }
          let x = p.x, y = p.y - (onScreen ? 0 : 20), s = 0.7 + 0.5 * Math.min(1, k * 3);
          if (b.motion === 'orbit') {
            const r = 34 + 12 * k, ang = n.a + k * 3.2;
            x += Math.cos(ang) * r; y += Math.sin(ang) * r * 0.45 - 40 * k;
          } else if (b.motion === 'burst') {
            const d = 95 * n.v * Math.sqrt(k);
            x += Math.cos(n.a) * d; y += Math.sin(n.a) * d - 18 + 70 * k * k;
            s *= 1.1 - 0.5 * k;
          } else if (b.motion === 'wave') {
            x += Math.sin(k * 9 + n.a) * 26 + (n.a - 3) * 8; y -= 30 + 50 * k;
          } else {
            x += (n.a - 3) * 9 + Math.sin(k * 6 + n.a) * 6; y -= 70 * k;
          }
          n.el.style.opacity = String(k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4));
          n.el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
        }
        return true;
      });
    },
    destroy() { bursts.forEach(drop); bursts = []; layer.remove(); style.remove(); },
  };
}
