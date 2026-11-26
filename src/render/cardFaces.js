// @ts-check
import { RANKS, rankOf, suitOf, isCard } from '../net/cardLaw.js';

export const RANK_JACK = 9;
export const RANK_QUEEN = 10;
export const RANK_KING = 11;
export const RANK_ACE = 12;

const court = (name, title, head) => Object.freeze({ name, title, head });

export const SUIT_CROWNS = Object.freeze([
  Object.freeze({ crown: 'Orsinium', charge: 'axe', colour: '#2f5a2a', skin: '#7f9a5c', hair: '#2a2a22',
    courts: Object.freeze([court(null, 'Champion of Orsinium', 'helm'), court(null, 'Queen of Orsinium', 'circlet'), court('Gortwog', 'King of Orsinium', 'crown')]) }),
  Object.freeze({ crown: 'Sentinel', charge: 'sun', colour: '#9a5c08', skin: '#8a5a3a', hair: '#1c1410',
    courts: Object.freeze([court('Lhotun', 'Prince of Sentinel', 'coronet'), court('Akorithi', 'Queen of Sentinel', 'circlet'), court('Camaron', 'King of Sentinel', 'crown')]) }),
  Object.freeze({ crown: 'Wayrest', charge: 'rose', colour: '#a3141e', skin: '#e6bc94', hair: '#5a3a22',
    courts: Object.freeze([court('Helseth', 'Prince of Wayrest', 'coronet'), court('Barenziah', 'Queen of Wayrest', 'circlet'), court('Eadwyre', 'King of Wayrest', 'crown')]) }),
  Object.freeze({ crown: 'Daggerfall', charge: 'dagger', colour: '#1d3f8a', skin: '#e9c29c', hair: '#6a4a2a',
    courts: Object.freeze([court('Nulfaga', 'Mage of Daggerfall', 'hood'), court('Aubk-i', 'Queen of Daggerfall', 'circlet'), court('Gothryd', 'King of Daggerfall', 'crown')]) }),
]);

export const courtOf = (c) => (isCard(c) && rankOf(c) >= RANK_JACK && rankOf(c) <= RANK_KING ? SUIT_CROWNS[suitOf(c)].courts[rankOf(c) - RANK_JACK] : null);

export const rankLabel = (r) => (RANKS[r] === 'T' ? '10' : RANKS[r]);

export function cardTitle(c) {
  if (!isCard(c)) return 'A card face down';
  const crown = SUIT_CROWNS[suitOf(c)].crown;
  const ct = courtOf(c);
  if (ct) return ct.name ? `${ct.name}, ${ct.title}` : `The ${ct.title}`;
  if (rankOf(c) === RANK_ACE) return `The Seal of ${crown}`;
  return `${rankLabel(rankOf(c))} of ${crown}`;
}

export const PIP_LAYOUT = Object.freeze([
  [[0, -1], [0, 1]],
  [[0, -1], [0, 0], [0, 1]],
  [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [0, -0.5], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [0, -0.5], [-1, 0], [1, 0], [0, 0.5], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [-1, -1 / 3], [1, -1 / 3], [0, 0], [-1, 1 / 3], [1, 1 / 3], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [0, -2 / 3], [-1, -1 / 3], [1, -1 / 3], [-1, 1 / 3], [1, 1 / 3], [0, 2 / 3], [-1, 1], [1, 1]],
].map((pips) => Object.freeze(pips.map((p) => Object.freeze(p)))));

export const STOCK = '#f4ecd6';
const BORDER = '#8a7a52';
const GOLD = '#c9a24a';
const BACK_FIELD = '#5a1a22';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} charge
 * @param {number} s
 * @param {string} ink
 * @param {string} [cut]
 */
export function paintCharge(ctx, charge, s, ink, cut = STOCK) {
  ctx.save();
  ctx.scale(s, s);
  ctx.fillStyle = ink;
  ctx.beginPath();
  if (charge === 'dagger') {
    ctx.moveTo(0, -0.5); ctx.lineTo(0.14, 0.1); ctx.lineTo(-0.14, 0.1); ctx.closePath();
    ctx.rect(-0.32, 0.08, 0.64, 0.11);
    ctx.rect(-0.065, 0.18, 0.13, 0.2);
    ctx.moveTo(0.08, 0.44); ctx.arc(0, 0.44, 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = cut;
    ctx.beginPath(); ctx.moveTo(0, -0.38); ctx.lineTo(0.03, 0.04); ctx.lineTo(-0.03, 0.04); ctx.closePath(); ctx.fill();
  } else if (charge === 'rose') {
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
      const x = Math.cos(a) * 0.22, y = Math.sin(a) * 0.22;
      ctx.moveTo(x + 0.2, y); ctx.arc(x, y, 0.2, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.fillStyle = cut;
    ctx.beginPath(); ctx.arc(0, 0, 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.arc(0, 0, 0.07, 0, Math.PI * 2); ctx.fill();
  } else if (charge === 'sun') {
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI) / 6, w = Math.PI / 18;
      ctx.moveTo(Math.cos(a - w) * 0.28, Math.sin(a - w) * 0.28);
      ctx.lineTo(Math.cos(a) * 0.5, Math.sin(a) * 0.5);
      ctx.lineTo(Math.cos(a + w) * 0.28, Math.sin(a + w) * 0.28);
      ctx.closePath();
    }
    ctx.moveTo(0.27, 0); ctx.arc(0, 0, 0.27, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = cut;
    ctx.beginPath(); ctx.arc(0, 0, 0.17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.arc(0, 0, 0.11, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.rect(-0.045, -0.5, 0.09, 1);
    for (const m of [1, -1]) {
      ctx.moveTo(0.045 * m, -0.24); ctx.lineTo(0.28 * m, -0.4);
      ctx.quadraticCurveTo(0.56 * m, -0.12, 0.28 * m, 0.18);
      ctx.lineTo(0.045 * m, 0.02); ctx.closePath();
    }
    ctx.fill();
  }
  ctx.restore();
}

function paintHead(ctx, head, hy, r, ink) {
  ctx.lineWidth = 1;
  if (head === 'crown' || head === 'coronet') {
    const pts = head === 'crown' ? 5 : 3, top = head === 'crown' ? r * 1.15 : r * 0.7;
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(-r * 0.95, hy - r * 0.55);
    for (let k = 0; k < pts; k++) {
      const x0 = -r * 0.95 + (k * 1.9 * r) / pts;
      ctx.lineTo(x0 + (0.95 * r) / pts, hy - r * 0.55 - top);
      ctx.lineTo(x0 + (1.9 * r) / pts, hy - r * 0.55);
    }
    ctx.lineTo(r * 0.95, hy - r * 0.35); ctx.lineTo(-r * 0.95, hy - r * 0.35); ctx.closePath(); ctx.fill();
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.arc(0, hy - r * 0.45, r * 0.1, 0, Math.PI * 2); ctx.fill();
  } else if (head === 'circlet') {
    ctx.strokeStyle = GOLD; ctx.lineWidth = r * 0.18;
    ctx.beginPath(); ctx.ellipse(0, hy - r * 0.5, r * 0.95, r * 0.28, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(0, hy - r * 0.78, r * 0.13, 0, Math.PI * 2); ctx.fill();
  } else if (head === 'helm') {
    ctx.fillStyle = '#8c9096';
    ctx.beginPath(); ctx.arc(0, hy - r * 0.1, r * 1.08, Math.PI, 0); ctx.lineTo(r * 1.08, hy + r * 0.25); ctx.lineTo(-r * 1.08, hy + r * 0.25); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(-r * 0.7, hy - r * 0.15, r * 1.4, r * 0.18);
    ctx.fillStyle = ink; ctx.beginPath(); ctx.moveTo(0, hy - r * 1.6); ctx.lineTo(r * 0.25, hy - r * 1.05); ctx.lineTo(-r * 0.25, hy - r * 1.05); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillStyle = '#3a2f4a';
    ctx.beginPath(); ctx.moveTo(0, hy - r * 1.9); ctx.quadraticCurveTo(r * 1.6, hy - r * 0.6, r * 1.3, hy + r * 1.3); ctx.lineTo(r * 0.85, hy + r * 1.3);
    ctx.quadraticCurveTo(r * 1.0, hy - r * 0.2, 0, hy - r * 1.05); ctx.quadraticCurveTo(-r * 1.0, hy - r * 0.2, -r * 0.85, hy + r * 1.3); ctx.lineTo(-r * 1.3, hy + r * 1.3);
    ctx.quadraticCurveTo(-r * 1.6, hy - r * 0.6, 0, hy - r * 1.9); ctx.closePath(); ctx.fill();
  }
}

function paintVeil(ctx, hy, r) {
  ctx.fillStyle = '#d8ccb0';
  ctx.beginPath(); ctx.ellipse(0, hy + r * 0.2, r * 1.25, r * 1.35, 0, Math.PI, 0); ctx.lineTo(r * 1.35, hy + r * 1.6); ctx.lineTo(-r * 1.35, hy + r * 1.6); ctx.closePath(); ctx.fill();
}

function paintCourt(ctx, c, w, h) {
  const crown = SUIT_CROWNS[suitOf(c)], ct = courtOf(c);
  if (!ct) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.clip();
  ctx.fillStyle = '#ebe0c2'; ctx.fillRect(-w / 2, -h / 2, w, h);
  const r = w * 0.17, hy = -h * 0.12;
  if (ct.head === 'circlet') paintVeil(ctx, hy, r);
  ctx.fillStyle = crown.colour;
  ctx.beginPath(); ctx.moveTo(-w * 0.46, h / 2); ctx.quadraticCurveTo(-w * 0.42, hy + r * 1.4, 0, hy + r * 1.2); ctx.quadraticCurveTo(w * 0.42, hy + r * 1.4, w * 0.46, h / 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = GOLD;
  ctx.beginPath(); ctx.moveTo(-r * 0.9, hy + r * 1.25); ctx.lineTo(0, hy + r * 2.1); ctx.lineTo(r * 0.9, hy + r * 1.25); ctx.lineTo(r * 0.6, hy + r * 1.2); ctx.lineTo(0, hy + r * 1.75); ctx.lineTo(-r * 0.6, hy + r * 1.2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = crown.skin;
  ctx.fillRect(-r * 0.32, hy + r * 0.6, r * 0.64, r * 0.7);
  ctx.beginPath(); ctx.ellipse(0, hy, r * 0.82, r, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = crown.hair;
  ctx.beginPath(); ctx.ellipse(0, hy - r * 0.55, r * 0.85, r * 0.5, 0, Math.PI, 0); ctx.fill();
  ctx.fillRect(-r * 0.4, hy - r * 0.05, r * 0.2, r * 0.12); ctx.fillRect(r * 0.2, hy - r * 0.05, r * 0.2, r * 0.12);
  if (suitOf(c) === 0) {
    ctx.fillStyle = STOCK;
    ctx.beginPath(); ctx.moveTo(-r * 0.32, hy + r * 0.55); ctx.lineTo(-r * 0.24, hy + r * 0.28); ctx.lineTo(-r * 0.16, hy + r * 0.55); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(r * 0.32, hy + r * 0.55); ctx.lineTo(r * 0.24, hy + r * 0.28); ctx.lineTo(r * 0.16, hy + r * 0.55); ctx.closePath(); ctx.fill();
  }
  paintHead(ctx, ct.head, hy, r, crown.colour);
  const sx = w * 0.27, sy = h * 0.27, sw = w * 0.2;
  ctx.fillStyle = STOCK; ctx.strokeStyle = GOLD; ctx.lineWidth = Math.max(1, w * 0.015);
  ctx.beginPath(); ctx.moveTo(sx - sw / 2, sy - sw * 0.55); ctx.lineTo(sx + sw / 2, sy - sw * 0.55); ctx.lineTo(sx + sw / 2, sy + sw * 0.1);
  ctx.quadraticCurveTo(sx + sw / 2, sy + sw * 0.55, sx, sy + sw * 0.75); ctx.quadraticCurveTo(sx - sw / 2, sy + sw * 0.55, sx - sw / 2, sy + sw * 0.1); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.translate(sx, sy); paintCharge(ctx, crown.charge, sw * 0.8, crown.colour); ctx.restore();
  ctx.restore();
  ctx.strokeStyle = crown.colour; ctx.lineWidth = Math.max(1, w * 0.02); ctx.strokeRect(-w / 2, -h / 2, w, h);
}

function footText(ctx, text, y, maxW, size) {
  let px = size;
  ctx.font = `bold ${px}px Georgia, serif`;
  while (px > 6 && (ctx.measureText(text)?.width ?? 0) > maxW) { px -= 1; ctx.font = `bold ${px}px Georgia, serif`; }
  ctx.fillText(text, 0, y);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} c
 * @param {number} w
 * @param {number} h
 */
export function paintFace(ctx, c, w, h) {
  const crown = SUIT_CROWNS[suitOf(c)], r = rankOf(c), u = w / 128;
  ctx.save();
  ctx.fillStyle = STOCK; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = BORDER; ctx.lineWidth = 3 * u; ctx.strokeRect(1.5 * u, 1.5 * u, w - 3 * u, h - 3 * u);
  ctx.strokeStyle = crown.colour; ctx.lineWidth = 1.2 * u; ctx.strokeRect(7 * u, 7 * u, w - 14 * u, h - 14 * u);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const label = rankLabel(r);
  const corner = () => {
    ctx.fillStyle = crown.colour;
    ctx.font = `bold ${label.length > 1 ? 22 * u : 26 * u}px Georgia, serif`;
    ctx.fillText(label, 0, 0);
    ctx.translate(0, 22 * u); paintCharge(ctx, crown.charge, 17 * u, crown.colour);
  };
  ctx.save(); ctx.translate(16 * u, 21 * u); corner(); ctx.restore();
  ctx.save(); ctx.translate(w - 16 * u, h - 21 * u); ctx.rotate(Math.PI); corner(); ctx.restore();
  ctx.translate(w / 2, h / 2);
  if (r <= 8) {
    for (const [x, y] of PIP_LAYOUT[r]) {
      ctx.save(); ctx.translate(x * 22 * u, y * 54 * u); if (y > 0.01) ctx.rotate(Math.PI);
      paintCharge(ctx, crown.charge, 24 * u, crown.colour);
      ctx.restore();
    }
  } else if (r === RANK_ACE) {
    ctx.strokeStyle = crown.colour; ctx.lineWidth = 2.5 * u;
    ctx.beginPath(); ctx.arc(0, -8 * u, 38 * u, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5 * u;
    ctx.beginPath(); ctx.arc(0, -8 * u, 33 * u, 0, Math.PI * 2); ctx.stroke();
    ctx.save(); ctx.translate(0, -8 * u); paintCharge(ctx, crown.charge, 54 * u, crown.colour); ctx.restore();
    ctx.fillStyle = crown.colour;
    footText(ctx, crown.crown.toUpperCase(), 44 * u, 70 * u, 13 * u);
  } else {
    const ct = courtOf(c);
    ctx.save(); ctx.translate(0, -6 * u); paintCourt(ctx, c, 76 * u, 110 * u); ctx.restore();
    ctx.fillStyle = crown.colour;
    footText(ctx, (ct?.name ?? crown.crown).toUpperCase(), 58 * u, 66 * u, 12 * u);
  }
  ctx.restore();
}

export function paintBack(ctx, w, h) {
  const u = w / 128;
  ctx.save();
  ctx.fillStyle = STOCK; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = BACK_FIELD; ctx.fillRect(7 * u, 7 * u, w - 14 * u, h - 14 * u);
  ctx.save();
  ctx.beginPath(); ctx.rect(7 * u, 7 * u, w - 14 * u, h - 14 * u); ctx.clip();
  ctx.strokeStyle = 'rgba(201,162,74,0.55)'; ctx.lineWidth = 1.2 * u;
  for (let k = -h; k < w + h; k += 14 * u) {
    ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k + h, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(k + h, 0); ctx.lineTo(k, h); ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = GOLD; ctx.lineWidth = 2 * u; ctx.strokeRect(12 * u, 12 * u, w - 24 * u, h - 24 * u);
  ctx.translate(w / 2, h / 2);
  ctx.fillStyle = BACK_FIELD; ctx.beginPath(); ctx.arc(0, 0, 40 * u, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = GOLD; ctx.lineWidth = 3 * u; ctx.stroke();
  ctx.lineWidth = 1.2 * u; ctx.beginPath(); ctx.arc(0, 0, 34 * u, 0, Math.PI * 2); ctx.stroke();
  for (const [s, x, y] of [[3, 0, -1], [2, 1, 0], [1, 0, 1], [0, -1, 0]]) {
    ctx.save(); ctx.translate(x * 19 * u, y * 19 * u); paintCharge(ctx, SUIT_CROWNS[s].charge, 15 * u, GOLD, BACK_FIELD); ctx.restore();
  }
  ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(0, 0, 3 * u, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
