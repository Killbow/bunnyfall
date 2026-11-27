// @ts-check

import { SpoilsGlowRenderer } from '../render/spoilsGlow.js';
import { bestRarity, RARITIES, lootRarityOn } from './lootRarity.js';
import { isPresented } from './physicalItems.js';

export const LOOT_LINES_MAX = 8;
export const LOOT_LINES_REACH = 40;
export const LOOT_LINE_CROWN = 0.6;

// Sprites are bottom-anchored, so a find's crown is its feet position plus its sprite height.
export const lootCrown = (pos, size) => (Array.isArray(pos) && pos.length >= 3 ? [pos[0], pos[1] + (Number.isFinite(size?.h) ? size.h : LOOT_LINE_CROWN), pos[2]] : null);

export function pickLootLines(finds, eye, { max = LOOT_LINES_MAX, reach = LOOT_LINES_REACH } = {}) {
  if (!Array.isArray(finds) || (!Array.isArray(eye) && !(eye instanceof Float32Array))) return [];
  const rarity = lootRarityOn();
  const out = [];
  for (const f of finds) {
    const root = f?.root;
    if (!Array.isArray(root) || root.length !== 3 || !root.every(Number.isFinite) || !Array.isArray(f.items) || !f.items.length) continue;
    // A find with its own mark draws in that mark's color and height, even with loot rarity off.
    if (f.mark) {
      const d = Math.hypot(root[0] - eye[0], root[1] - eye[1], root[2] - eye[2]);
      if (d <= (f.mark.reach ?? reach)) out.push({ root, tier: 'common', alpha: 1, d, colour: f.mark.colour, h: f.mark.h, pulse: !!f.mark.pulse });
      continue;
    }
    if (!rarity) continue;
    // Items presented in the world draw their own line, so the body or pile holding them skips them.
    const tier = bestRarity(f.own ? f.items : f.items.filter((it) => !isPresented(it)));
    if (!tier || (RARITIES[tier]?.rank ?? 0) < RARITIES.rare.rank) continue;
    const d = Math.hypot(root[0] - eye[0], root[1] - eye[1], root[2] - eye[2]);
    if (!(d <= reach)) continue;
    out.push({ root, tier, alpha: 1, d });
  }
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, max).map(({ root, tier, alpha, colour, h, pulse }) => (colour ? { root, tier, alpha, colour, h, pulse } : { root, tier, alpha }));
}

const _marksLive = new Set();
export const setLootMarksLive = (on, by = 'wild') => { if (on) _marksLive.add(by); else _marksLive.delete(by); };

export function createLootLines(gl) {
  let glow = null;
  try { glow = gl ? new SpoilsGlowRenderer(gl) : null; } catch (e) { console.warn('[loot] the lines would not build', /** @type {any} */ (e)?.message ?? e); glow = null; }
  return {
    draw(finds, proj, view, eye, seconds, fog = null) {
      if (!glow || (!lootRarityOn() && !_marksLive.size)) return false;
      const lines = pickLootLines(typeof finds === 'function' ? finds() : finds, eye);
      if (!lines.length) return false;
      glow.draw(lines, proj, view, eye, seconds, fog);
      return glow.drawn > 0;
    },
  };
}
