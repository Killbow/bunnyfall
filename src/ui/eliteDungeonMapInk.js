// @ts-check
// BUNNYFALL (2026-11-18, daily elite dungeons - net/eliteDungeonLaw.js): THE ELITE DUNGEONS ON THE HELD MAP. Each one
// standing is a violet crystal over its pixel in a soft glow; one that spreads lays its purple disc (its radius today)
// under it, edged like Rodney's blight. Under the territories and the place marks, beside the blight. The book is
// systems/eliteDungeons/edBook.js.
import { ED_CSS, ED_REWARD_NYX, edGraceLeft } from '../net/eliteDungeonLaw.js';
import { t } from './textManager.js';

const paper = (view, x, y) => [(x - view.ox) * view.scale, (y - view.oy) * view.scale];

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ ox: number, oy: number, scale: number }} view
 * @param {{ px: number, py: number, spread: number }[]} list
 * @param {{ paperW: number, paperH: number, dpr?: number, time?: number }} opts
 */
export function paintEliteDungeons(ctx, view, list, { paperW, paperH, dpr = 1, time = 0 }) {
  if (!list?.length || !view) return;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const beat = 0.75 + 0.25 * Math.sin(time * 2.4);
  for (const e of list) {
    const [x, y] = paper(view, e.px + 0.5, e.py + 0.5);
    const rr = Math.max(0, e.spread || 0) * view.scale;
    if (x + rr + 12 < 0 || y + rr + 12 < 0 || x - rr - 12 > paperW || y - rr - 12 > paperH) continue;
    if (rr > 0.5) {   // THE SPREAD: its purple disc
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.globalAlpha = 0.2; ctx.fillStyle = ED_CSS; ctx.fill();
      ctx.globalAlpha = 0.85; ctx.strokeStyle = ED_CSS; ctx.lineWidth = 1.8; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
    }
    // THE GLOW about it
    const gr = 9 + 4 * beat;
    const g = ctx.createRadialGradient(x, y, 0, x, y, gr);
    g.addColorStop(0, `rgba(176, 92, 255, ${(0.6 * beat).toFixed(3)})`); g.addColorStop(1, 'rgba(176, 92, 255, 0)');
    ctx.globalAlpha = 1; ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, gr, 0, Math.PI * 2); ctx.fill();
    // THE CRYSTAL: a tall diamond, dark-edged so it reads on parchment and on purple
    ctx.beginPath();
    ctx.moveTo(x, y - 7); ctx.lineTo(x + 3.6, y - 0.6); ctx.lineTo(x, y + 5); ctx.lineTo(x - 3.6, y - 0.6); ctx.closePath();
    ctx.fillStyle = ED_CSS; ctx.strokeStyle = '#2a0f3d'; ctx.lineWidth = 1.2;
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 5); ctx.strokeStyle = 'rgba(255, 240, 255, 0.7)'; ctx.lineWidth = 0.8; ctx.stroke();
  }
  ctx.restore();
}

/**
 * WHAT THE MAP SAYS under the pointer (map pixels): the elite dungeon there (its crystal, or inside its spread) as a hover
 * card `{ title, lines }`, or null. `today` the UTC day (for its grace).
 * @param {{ px: number, py: number, spread: number, day: number, name: string }[]} list @param {number} mx @param {number} my @param {number} today
 */
export function eliteDungeonTipAt(list, mx, my, today) {
  for (const e of list ?? []) {
    const d = Math.hypot(mx - (e.px + 0.5), my - (e.py + 0.5));
    if (d > Math.max(0.9, e.spread || 0)) continue;
    const lines = [t('edmap.what', "An elite dungeon: Cromwark's creatures, then Sifrit. Cleansing it pays {nyx} Dusk Tokens.", { nyx: ED_REWARD_NYX })];
    const left = edGraceLeft(e.day, today);
    lines.push(e.spread > 0 ? t('edmap.spreads', 'Its corruption spreads every day until it is cleansed. Foes in it are tougher.')
      : left > 1 ? t('edmap.grace', 'Its corruption begins to spread in {n} days.', { n: left }) : t('edmap.graceOne', 'Its corruption begins to spread tomorrow.'));
    return { title: e.name || t('edmap.title', 'Elite dungeon'), lines };
  }
  return null;
}

/** The travel map's rings (ui/travel/travelMapWindow.js, the bounty circle's law - ui/bounty/bountyMapMark.js): each elite
 *  dungeon a violet circle about its pixel, as wide as its spread (never under ED_TRAVEL_RING_MIN). */
export const ED_TRAVEL_RING_MIN = 1.6;
export const ED_TRAVEL_RGB = Object.freeze([176, 92, 255]);
export const eliteDungeonRings = (/** @type {any[]} */ list) => (list ?? []).map((e) => ({ cx: e.px + 0.5, cy: e.py + 0.5, r: Math.max(ED_TRAVEL_RING_MIN, e.spread || 0), label: e.name || 'Elite dungeon' }));
