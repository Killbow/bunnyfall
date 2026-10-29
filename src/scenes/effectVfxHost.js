// @ts-check
// BUNNYFALL SPELL VISUALS: who is drawn with their effects this frame - me (seen from outside my head), the foes and
// NPCs of the place, and the peers drawn this frame (their pose's `ef`) - and the one draw (render/effectMotes.js).
// The world host wires `peers(seen)` with the auras, `draw()` with the veiled bodies, and effectVfxBits into its pose.
import { compiledPass } from '../render/glProgram.js';
import { EffectMotes } from '../render/effectMotes.js';
import { effectVfxBits, FX_ALL } from '../systems/effectVisuals.js';
import { isMagicallyConcealed } from '../systems/effects.js';

const RANGE = 40, BODIES_MAX = 32;

/**
 * @param {{ renderer: any, self: () => ({ feet: number[], height: number, entity: any }|null), foes: () => any[],
 *   peerAt: (d: any) => (number[]|null), off: () => boolean }} deps
 */
export function createEffectVfxHost({ renderer, self, foes, peerAt, off }) {
  const passOf = compiledPass(renderer.gl, [], () => new EffectMotes(renderer.gl), (e) => console.warn('[fx] spell visuals would not build', e?.message ?? e));
  let seenPeers = [];
  const bodies = [];
  const seedOf = (k) => { let h = 2166136261; for (const ch of String(k)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return ((h >>> 0) % 997) / 997; };
  const seeds = new WeakMap();
  const seedFor = (o) => { let s = seeds.get(o); if (s === undefined) { s = Math.random(); seeds.set(o, s); } return s; };

  function gather(eye) {
    bodies.length = 0;
    const near = (p) => Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]) < RANGE;
    const me = self();
    if (me?.entity) {
      const bits = effectVfxBits(me.entity);
      const head = [me.feet[0], me.feet[1] + me.height * 0.9, me.feet[2]];
      if (bits && Math.hypot(head[0] - eye[0], head[1] - eye[1], head[2] - eye[2]) > 0.9) bodies.push({ at: me.feet, height: me.height, bits, seed: 0.37 });
    }
    for (const f of foes()) {
      if (bodies.length >= BODIES_MAX) break;
      const feet = f?.ai?.feet;
      if (!feet || !f.entity || f.dead || f.corpse || (f.entity.health ?? 1) <= 0 || isMagicallyConcealed(f.entity)) continue;
      const bits = effectVfxBits(f.entity);
      if (bits && near(feet)) bodies.push({ at: feet, height: f.ai.height ?? 1.8, bits, seed: seedFor(f) });
    }
    for (const d of seenPeers) {
      if (bodies.length >= BODIES_MAX) break;
      const bits = (d?.shown?.ef | 0) & FX_ALL;
      if (!bits) continue;
      const at = peerAt(d);
      if (at && near(at)) bodies.push({ at, height: 1.8, bits, seed: seedOf(d.id) });
    }
  }

  return {
    /** The peers drawn this frame (the auras' list). */
    peers(seen) { seenPeers = seen ?? []; },
    /** Draw this frame's motes under the frame's camera. */
    draw() {
      const proj = renderer._proj, view = renderer._view, eye = renderer._camPos;
      if (off() || !proj || !view || !eye) { seenPeers = []; return; }
      gather(eye);
      seenPeers = [];   // this frame's, drawn once
      if (!bodies.length) return;
      const pass = passOf();
      if (!pass) return;
      pass.draw(bodies, proj, view, performance.now() / 1000 % 3600);
      if (pass.drawn) renderer.markForeignPass();
    },
  };
}
