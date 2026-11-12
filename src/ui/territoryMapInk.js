// @ts-check
// BUNNYFALL COMPANIES (2026-11-12, territory): COMPANY TERRITORIES ON THE HELD MAP - each a wash of its Company's field
// colour, edged in its border colour, under the place marks; overlapping patches simply lay their washes over each other.
// The character's own Company's patch is edged a little heavier. Past the far band each patch carries its tag at its
// hall. The marks are systems/companyTerritory.js's.

/** How strong a patch's wash is, and its edge. */
export const TERRITORY_WASH_ALPHA = 0.2;
export const TERRITORY_EDGE_ALPHA = 0.85;

const paper = (view, x, y) => [(x - view.ox) * view.scale, (y - view.oy) * view.scale];

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ ox: number, oy: number, scale: number }} view
 * @param {{ x: number, y: number, r: number, fill: string, ring: string, tag?: string, mine?: boolean }[]} marks
 * @param {{ paperW: number, paperH: number, far?: boolean }} opts
 */
export function paintTerritories(ctx, view, marks, { paperW, paperH, far = false, charters = [] }) {
  if ((!marks?.length && !charters?.length) || !view) return;
  ctx.save();
  // CITY CHARTERS: each Charter one dashed outline in the pen round its capital, over a faint wash, under its Companies'
  // own patches; its name over it past the far band
  for (const c of charters ?? []) {
    const [x, y] = paper(view, c.x, c.y);
    const r = c.r * view.scale;
    if (x + r < 0 || y + r < 0 || x - r > paperW || y - r > paperH) continue;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = 'rgb(58, 40, 22)';
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.setLineDash([7, 4]);
    ctx.strokeStyle = 'rgb(58, 40, 22)';
    ctx.lineWidth = c.mine ? 2.6 : 2;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1;
  for (const m of marks) {
    const [x, y] = paper(view, m.x, m.y);
    const r = m.r * view.scale;
    if (x + r < 0 || y + r < 0 || x - r > paperW || y - r > paperH) continue;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.globalAlpha = TERRITORY_WASH_ALPHA;
    ctx.fillStyle = m.fill;
    ctx.fill();
    ctx.globalAlpha = TERRITORY_EDGE_ALPHA;
    ctx.strokeStyle = m.ring;
    ctx.lineWidth = m.mine ? 2.6 : 1.6;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (!far) {
    ctx.font = "600 13px 'Cormorant', Georgia, serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (const m of marks) {
      if (!m.tag) continue;
      const [x, y] = paper(view, m.x, m.y);
      const r = m.r * view.scale;
      if (x < -60 || y < -20 || x > paperW + 60 || y > paperH + 20) continue;
      const ty = y - r - 3;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(238, 222, 190, 0.85)';
      ctx.strokeText(`<${m.tag}>`, x, ty);
      ctx.fillStyle = 'rgba(46, 32, 18, 0.95)';   // the map's name ink: a pale border colour would vanish on the paper
      ctx.fillText(`<${m.tag}>`, x, ty);
    }
    // CITY CHARTERS: the Charter's name under its outline
    ctx.font = "italic 700 14px 'Cormorant', Georgia, serif";
    ctx.textBaseline = 'top';
    for (const c of charters ?? []) {
      const [x, y] = paper(view, c.x, c.y);
      const r = c.r * view.scale;
      if (x < -120 || y < -40 || x > paperW + 120 || y > paperH + 40) continue;
      const ty = y + r + 3;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(238, 222, 190, 0.85)';
      ctx.strokeText(c.name, x, ty);
      ctx.fillStyle = 'rgba(46, 32, 18, 0.95)';
      ctx.fillText(c.name, x, ty);
    }
  }
  ctx.restore();
}
