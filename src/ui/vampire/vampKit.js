// @ts-check
// BUNNYFALL VAMPIRE EXPANSION - THE VISUAL PASS (2026-11-20, the owner: "make sure everything is visually interesting,
// lined up with the current ui style that the player has selected ... isnt just a bunch of menus and boxes"; asked,
// "Both skins styled", "Game art + drawn sigils"): THE VAMPIRE'S WINDOW KIT. Every vampire window (the Blood Sight card,
// the Haven, the Court, the Discipline wheel) is built of these pieces, in the dress of the skin the player chose:
//   ENHANCED PLUS  the stone-and-brass kit's own tokens (ui/enhanced/enhancedStyle.js ENHANCED_TOKENS: --ink, --slate,
//                  --iron, --bone, --brass, --blood, --ruby; the --display and --data faces), a blood-red edge;
//   CLASSIC        Daggerfall's own: dark wood and iron, gold lettering, the pixel face (ui/pixelifyFive.js).
// THE ART: Daggerfall's own pictures where they exist (an item's icon - textureCanvas.js requestFittedIcon) and small
// SVG sigils drawn here in the window's palette - the nine clans' crests (each its own colour), the six bloods' glyphs,
// the Disciplines' glyphs.
// THE SHELL (openVampWindow) is an overlay in the shape every DOM window of the port takes (ui/nyxWindow.js): a fixed
// layer over the canvas, Escape and a tap outside close it, registered with the overlay stack, its `render` called again
// on every change.

import { registerOverlay, closeOnOutsideTap } from '../enhanced/enhancedOverlays.js';
import { overlayAction } from '../input.js';
import { injectEnhancedStyle, injectEnhancedFonts } from '../enhanced/enhancedStyle.js';
import { isEnhanced } from '../../systems/uiSkin.js';
import { PIXEL_STACK } from '../pixelifyFive.js';
import { VAMPIRE_CLANS as C } from '../../systems/infection.js';

/** @param {string} tag @param {string|null} [cls] @param {string|null} [text] */
export const el = (tag, cls = null, text = null) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

// ── the colours ────────────────────────────────────────────────────────────────────────
/** Each clan's colour (its crest, its window's edge). */
export const CLAN_COLOUR = Object.freeze({
  [C.Anthotis]: '#d9a441', [C.Garlythi]: '#7f9bb3', [C.Haarvenu]: '#e0662e', [C.Khulari]: '#9fc4d6', [C.Lyrezi]: '#9a7fd1',
  [C.Montalion]: '#c9b26b', [C.Selenu]: '#3f9a8f', [C.Thrafey]: '#c46a8a', [C.Vraseth]: '#c23b3b',
});
/** Each blood's colour. */
export const BLOOD_COLOUR = Object.freeze({ scholar: '#6f8fd8', warrior: '#c0463a', rogue: '#6aa85a', noble: '#d9b04a', worker: '#a8835a', beast: '#9a5bb5' });
/** The Beast's stages' colours (Sated .. Starving). */
export const STAGE_COLOUR = Object.freeze(['#b02a35', '#a8242e', '#8f1f28', '#a3122a', '#d10f2f']);

// ── the sigils ─────────────────────────────────────────────────────────────────────────
const svg = (body, size = 48, view = '0 0 48 48') => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${view}" aria-hidden="true">${body}</svg>`;
/** The crests' shapes: a shield field and a device each. */
const CREST_DEVICE = Object.freeze({
  [C.Anthotis]: '<circle cx="24" cy="22" r="7" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M24 9v4M24 31v4M11 22h4M33 22h4M15 13l3 3M33 13l-3 3M15 31l3-3M33 31l-3-3" stroke="currentColor" stroke-width="2"/><circle cx="24" cy="22" r="2.5" fill="currentColor"/>',
  [C.Garlythi]: '<path d="M15 34V18h4v-4h3v4h4v-4h3v4h4v16z" fill="currentColor"/><path d="M22 34v-6h4v6" fill="#0008"/>',
  [C.Haarvenu]: '<path d="M18 33c-4-3-4-9 0-13 0 3 2 4 3 4-1-5 2-9 6-11-1 4 4 6 4 11 1-1 2-2 2-4 3 4 2 10-2 13z" fill="currentColor"/><path d="M33 12v8M29 16h8M30 13l6 6M36 13l-6 6" stroke="currentColor" stroke-width="1.5"/>',
  [C.Khulari]: '<path d="M8 34l10-16 5 7 6-11 11 20z" fill="currentColor"/><ellipse cx="24" cy="30" rx="6" ry="3" fill="#000a"/><circle cx="24" cy="30" r="1.6" fill="currentColor"/>',
  [C.Lyrezi]: '<path d="M10 24c5-7 23-7 28 0-5 7-23 7-28 0z" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M12 24h24" stroke="currentColor" stroke-width="2.5"/><path d="M16 28c2 3 14 3 16 0" stroke="currentColor" stroke-width="1.5" fill="none" stroke-dasharray="2 2"/>',
  [C.Montalion]: '<path d="M12 30l3-14 5 7 4-10 4 10 5-7 3 14z" fill="currentColor"/><rect x="12" y="31" width="24" height="4" fill="currentColor"/>',
  [C.Selenu]: '<path d="M8 22c4-4 8-4 12 0s8 4 12 0 6-3 8-1M8 30c4-4 8-4 12 0s8 4 12 0 6-3 8-1" fill="none" stroke="currentColor" stroke-width="3"/><path d="M24 8l3 7h-6z" fill="currentColor"/>',
  [C.Thrafey]: '<path d="M15 12h18c0 9-4 13-9 13s-9-4-9-13z" fill="currentColor"/><path d="M24 25v7M17 35h14" stroke="currentColor" stroke-width="3"/><circle cx="24" cy="16" r="2.5" fill="#000a"/>',
  [C.Vraseth]: '<path d="M30 10a13 13 0 1 0 0 26 10 10 0 1 1 0-26z" fill="currentColor"/><path d="M21 21l2 7 2-7z" fill="#fff8"/>',
});
/** A clan's crest: its shield in the clan's colour, its device on it. @param {number} clan @param {number} [size] */
export function clanCrest(clan, size = 48) {
  const c = CLAN_COLOUR[clan] ?? '#b02a35';
  const device = CREST_DEVICE[clan] ?? '';
  return svg(`<path d="M6 6h36v16c0 12-8 19-18 22C14 41 6 34 6 22z" fill="#120a0c" stroke="${c}" stroke-width="2.5"/><path d="M9 9h30v13c0 10-7 16-15 19-8-3-15-9-15-19z" fill="${c}22"/><g style="color:${c}">${device}</g>`, size);
}
/** The bloods' glyphs: a book, a sword, a dagger, a crown, a hammer, a claw. */
const BLOOD_DEVICE = Object.freeze({
  scholar: '<path d="M10 14c5-2 9-2 14 1 5-3 9-3 14-1v20c-5-2-9-2-14 1-5-3-9-3-14-1z" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M24 15v20" stroke="currentColor" stroke-width="2"/>',
  warrior: '<path d="M24 6l3 4v20h-6V10z" fill="currentColor"/><path d="M15 30h18v3H15zM22 33h4v7h-4z" fill="currentColor"/>',
  rogue: '<path d="M30 8l2 3-12 18-3-2z" fill="currentColor"/><path d="M14 26l8 6-2 2-8-6zM12 30l-3 6 6-3z" fill="currentColor"/>',
  noble: '<path d="M10 32l2-16 7 8 5-12 5 12 7-8 2 16z" fill="currentColor"/><circle cx="24" cy="10" r="2" fill="currentColor"/>',
  worker: '<path d="M14 14h14v8H14z" fill="currentColor"/><path d="M20 22h3v18h-3z" fill="currentColor"/><path d="M28 16h6v4h-6z" fill="currentColor"/>',
  beast: '<path d="M14 10c2 8 1 16-3 26M22 9c2 9 1 18-2 28M30 10c2 8 2 16-1 26" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
});
/** A blood's glyph in its colour, on a drop. @param {string} type @param {number} [size] */
export function bloodGlyph(type, size = 40) {
  const c = BLOOD_COLOUR[type] ?? '#b02a35';
  return svg(`<path d="M24 3C17 14 9 22 9 31a15 15 0 0 0 30 0c0-9-8-17-15-28z" fill="#1a0a0d" stroke="${c}" stroke-width="2"/><g transform="translate(9 13) scale(0.62)" style="color:${c}">${BLOOD_DEVICE[type] ?? ''}</g>`, size);
}
/** The Disciplines' glyphs, by what they do. */
const DISC_DEVICE = Object.freeze({
  heal: '<path d="M24 8C18 18 12 24 12 31a12 12 0 0 0 24 0c0-7-6-13-12-23z" fill="currentColor"/><path d="M24 24v12M18 30h12" stroke="#000b" stroke-width="3"/>',
  fury: '<path d="M14 36l4-12-6-4 10-12-2 10 7 3-10 15z" fill="currentColor"/><path d="M30 12l6 4-4 4 6 3" stroke="currentColor" stroke-width="2" fill="none"/>',
  mist: '<path d="M10 20c4-4 8-4 12 0s8 4 12 0M8 28c5-4 10-4 15 0s10 4 15 0M12 36c4-3 8-3 12 0s8 3 12 0" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
  drain: '<circle cx="14" cy="24" r="6" fill="currentColor"/><circle cx="36" cy="24" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 24c4-6 8-6 12 0" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2"/>',
  ward: '<path d="M24 6l14 6v10c0 9-6 16-14 20-8-4-14-11-14-20V12z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M24 14v20" stroke="currentColor" stroke-width="2"/>',
  mirror: '<ellipse cx="24" cy="22" rx="10" ry="13" fill="none" stroke="currentColor" stroke-width="3"/><path d="M18 16l12 12M14 38h20" stroke="currentColor" stroke-width="2"/>',
  fire: '<path d="M16 38c-6-4-6-12 0-18 0 4 2 6 4 6-2-7 3-13 8-16-1 6 6 8 6 15 1-2 2-3 2-5 4 6 3 14-3 18z" fill="currentColor"/>',
  frost: '<path d="M24 6v36M8 15l32 18M40 15L8 33" stroke="currentColor" stroke-width="3"/><path d="M20 9l4 4 4-4M20 39l4-4 4 4" stroke="currentColor" stroke-width="2" fill="none"/>',
  gaze: '<path d="M6 24c6-9 30-9 36 0-6 9-30 9-36 0z" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="24" cy="24" r="5" fill="currentColor"/><path d="M24 8v5M24 35v5" stroke="currentColor" stroke-width="2"/>',
  shadow: '<path d="M14 40c0-10 2-24 10-30 8 6 10 20 10 30z" fill="currentColor" opacity="0.85"/><circle cx="20" cy="22" r="1.6" fill="#000"/><circle cx="28" cy="22" r="1.6" fill="#000"/>',
  silence: '<path d="M16 18h6l8-7v26l-8-7h-6z" fill="currentColor"/><path d="M34 18l8 12M42 18l-8 12" stroke="currentColor" stroke-width="3"/>',
  unseen: '<path d="M6 24c6-9 30-9 36 0-6 9-30 9-36 0z" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="4 3"/><path d="M10 38L38 10" stroke="currentColor" stroke-width="3"/>',
  command: '<path d="M12 32l3-14 5 6 4-9 4 9 5-6 3 14z" fill="currentColor"/><path d="M24 34v6" stroke="currentColor" stroke-width="3"/>',
  vanish: '<path d="M8 24h20M14 16h16M14 32h16" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.6"/><path d="M30 14l10 10-10 10" fill="none" stroke="currentColor" stroke-width="3"/>',
  hide: '<path d="M24 6l14 6v10c0 9-6 16-14 20-8-4-14-11-14-20V12z" fill="currentColor" opacity="0.35"/><path d="M14 18l20 0M12 26h24M16 34h16" stroke="currentColor" stroke-width="2"/>',
  claw: '<path d="M14 8c3 10 2 20-4 30M24 6c3 11 2 22-3 34M34 8c3 10 3 20-2 30" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>',
  regen: '<path d="M24 8a16 16 0 1 1-15 10" fill="none" stroke="currentColor" stroke-width="3"/><path d="M6 12l3 7 7-3" fill="none" stroke="currentColor" stroke-width="3"/><path d="M24 18v12M18 24h12" stroke="currentColor" stroke-width="3"/>',
  charm: '<path d="M24 38C10 28 8 20 12 14s12-4 12 3c0-7 8-9 12-3s2 14-12 24z" fill="currentColor"/>',
  leap: '<path d="M8 38c6-18 18-26 32-28" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="4 3"/><path d="M34 6l7 4-4 7" fill="none" stroke="currentColor" stroke-width="3"/>',
  sense: '<circle cx="24" cy="24" r="4" fill="currentColor"/><circle cx="24" cy="24" r="11" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 3"/>',
});
/** Which glyph each Discipline wears. */
export const DISCIPLINE_GLYPH = Object.freeze({
  bloodHeal: 'heal', beastFury: 'fury', mistForm: 'mist', bloodSiphon: 'drain', arcaneWard: 'ward', bastion: 'ward', northernMirror: 'mirror',
  bloodFire: 'fire', frostVeins: 'frost', frozenGaze: 'gaze', stalker: 'shadow', hush: 'silence', unseen: 'unseen', courtCommand: 'command',
  exitStage: 'vanish', weatheredHide: 'hide', predator: 'claw', mendingBlood: 'regen', lure: 'charm', rooftopLeap: 'leap', huntersSense: 'sense',
});
/** A Discipline's glyph in `colour`. @param {string} id @param {string} colour @param {number} [size] */
export const disciplineGlyph = (id, colour, size = 36) => svg(`<g style="color:${colour}">${DISC_DEVICE[DISCIPLINE_GLYPH[id] ?? 'heal'] ?? ''}</g>`, size);
/** A bit of SVG markup as an element. @param {string} markup @param {string} [cls] */
export function art(markup, cls = 'vk-art') { const s = el('span', cls); s.innerHTML = markup; return s; }

// ── the two dresses ─────────────────────────────────────────────────────────────────────
export const skinClass = () => (isEnhanced() ? 'vk-enh' : 'vk-cls');
const VK_CSS = `
.vk-layer { position: fixed; inset: 0; z-index: 13; display: flex; align-items: center; justify-content: center; pointer-events: auto;
  background: radial-gradient(ellipse at center, rgba(60,0,8,0.18) 0%, rgba(10,0,2,0.55) 100%); animation: vk-fade 220ms ease-out; }
@keyframes vk-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes vk-rise { from { transform: translateY(10px) scale(0.98); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes vk-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(209,15,47,0.0); } 50% { box-shadow: 0 0 18px 2px rgba(209,15,47,0.45); } }
.vk-win { --accent: #b02a35; position: relative; width: min(760px, calc(100vw - 32px)); max-height: calc(100vh - 48px); display: flex; flex-direction: column;
  animation: vk-rise 260ms cubic-bezier(.2,.8,.2,1); overflow: hidden; }
.vk-win.narrow { width: min(460px, calc(100vw - 32px)); }
.vk-head { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 14px; padding: 12px 16px; }
.vk-head .vk-art svg { display: block; filter: drop-shadow(0 2px 4px #000c); }
.vk-title { margin: 0; line-height: 1.05; }
.vk-sub { margin: 2px 0 0; opacity: 0.8; }
.vk-x { cursor: pointer; }
.vk-body { overflow-y: auto; padding: 4px 16px 14px; display: flex; flex-direction: column; gap: 12px; }
.vk-note { min-height: 0; margin: 0 16px; padding: 0; transition: all 200ms; }
.vk-note.on { padding: 7px 12px; margin: 0 16px 10px; }
.vk-sect { display: flex; align-items: center; gap: 10px; margin: 6px 0 0; text-transform: uppercase; letter-spacing: 0.18em; font-size: 12px; }
.vk-sect::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, var(--accent), transparent); opacity: 0.6; }
.vk-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.vk-card { position: relative; display: grid; grid-template-columns: auto 1fr; gap: 10px; padding: 10px 12px; align-items: start; }
.vk-card .vk-art svg { display: block; }
.vk-card h4 { margin: 0 0 2px; font-size: 16px; }
.vk-card p { margin: 0; font-size: 13px; opacity: 0.85; }
.vk-card.lit { outline: 2px solid var(--accent); outline-offset: -2px; animation: vk-pulse 2.4s ease-in-out infinite; }
.vk-card.dim { opacity: 0.55; }
.vk-acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; grid-column: 1 / -1; }
.vk-btn { cursor: pointer; padding: 6px 12px; font-size: 13px; letter-spacing: 0.04em; border-radius: 2px; transition: transform 80ms, filter 120ms; }
.vk-btn:hover:not([disabled]) { filter: brightness(1.18); }
.vk-btn:active:not([disabled]) { transform: translateY(1px); }
.vk-btn[disabled] { cursor: not-allowed; opacity: 0.45; filter: grayscale(0.6); }
.vk-btn .vk-cost { margin-left: 6px; opacity: 0.85; font-size: 12px; }
.vk-meter { position: relative; height: 12px; border-radius: 2px; overflow: hidden; margin: 5px 0 2px; }
.vk-meter i { position: absolute; inset: 0 auto 0 0; transition: width 400ms ease; }
.vk-meter span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 10px; letter-spacing: 0.08em; text-shadow: 0 1px 2px #000; }
.vk-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.vk-chip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; font-size: 12px; border-radius: 10px; }
.vk-chip svg { width: 16px; height: 16px; }
.vk-pips { display: inline-flex; gap: 4px; vertical-align: middle; }
.vk-pips i { width: 12px; height: 12px; transform: rotate(45deg); border: 1px solid var(--accent); }
.vk-pips i.on { background: var(--accent); box-shadow: 0 0 6px var(--accent); }
.vk-banner { padding: 10px 14px; text-align: center; letter-spacing: 0.08em; }
.vk-hero { display: grid; grid-template-columns: auto 1fr; gap: 16px; align-items: center; padding: 12px 14px; }
.vk-hero .vk-art svg { width: 88px; height: 88px; }
.vk-big { font-size: 26px; margin: 0; }
.vk-quality { font-size: 30px; font-weight: 600; line-height: 1; }
.vk-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.vk-heat { display: grid; grid-template-columns: 1fr 2fr auto; gap: 8px; align-items: center; font-size: 13px; }
.vk-ask { margin-top: 6px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: 13px; }
.vk-flash { position: fixed; inset: 0; pointer-events: none; z-index: 12; }
/* ── ENHANCED PLUS: the stone-and-brass tokens ── */
.vk-enh.vk-win { background: linear-gradient(180deg, var(--slate, #171b21), var(--ink, #0e1013)); color: var(--bone, #e9e4d9);
  border: 2px solid var(--iron, #2b323b); box-shadow: 0 0 0 1px #000, 0 0 0 3px color-mix(in srgb, var(--accent) 55%, transparent), 0 18px 48px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05);
  font-family: var(--data, system-ui, sans-serif); }
.vk-enh .vk-head { background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 24%, var(--slate, #171b21)), var(--slate, #171b21)); border-bottom: 1px solid var(--iron, #2b323b); }
.vk-enh .vk-title { font-family: var(--display, Georgia, serif); font-size: 28px; font-weight: 500; color: var(--bone, #e9e4d9); }
.vk-enh .vk-sub { color: var(--brass, #c08a3e); font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; }
.vk-enh .vk-sect { color: var(--brass, #c08a3e); }
.vk-enh .vk-card { background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(0,0,0,0.25)); border: 1px solid var(--iron, #2b323b); box-shadow: inset 0 1px 0 rgba(255,255,255,0.04); }
.vk-enh .vk-card h4 { font-family: var(--display, Georgia, serif); font-weight: 500; font-size: 19px; }
.vk-enh .vk-btn { font-family: var(--data, system-ui); color: var(--bone, #e9e4d9); background: linear-gradient(180deg, #2a3038, #1b1f25); border: 1px solid var(--iron, #2b323b); box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 0 #000; }
.vk-enh .vk-btn:hover:not([disabled]) { border-color: var(--brass, #c08a3e); }
.vk-enh .vk-btn.primary { background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 70%, #fff 8%), color-mix(in srgb, var(--accent) 70%, #000 30%)); border-color: color-mix(in srgb, var(--accent) 80%, #fff 10%); }
.vk-enh .vk-btn.warn { border-color: var(--blood, #8c3a32); color: #f1c8c1; }
.vk-enh .vk-x { background: none; border: none; color: var(--dim, #9a9486); font-size: 22px; }
.vk-enh .vk-meter { background: #07090b; border: 1px solid var(--iron, #2b323b); }
.vk-enh .vk-chip { background: #0c0f13; border: 1px solid var(--iron, #2b323b); color: var(--bone, #e9e4d9); }
.vk-enh .vk-note.on { background: #0c0f13; border-left: 3px solid var(--accent); color: var(--bone, #e9e4d9); }
.vk-enh .vk-banner { background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 45%, transparent), transparent); color: #fff; font-family: var(--display, Georgia, serif); font-size: 18px; }
.vk-enh .vk-hero { background: radial-gradient(ellipse at left, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%); border: 1px solid var(--iron, #2b323b); }
.vk-enh .vk-big { font-family: var(--display, Georgia, serif); font-weight: 500; }
/* ── CLASSIC: Daggerfall's own wood, iron and gold ── */
.vk-cls.vk-win { background: repeating-linear-gradient(90deg, #2a1d14 0 6px, #2f2117 6px 12px), #2a1d14; color: #e3d39c;
  border: 3px solid #5b4630; outline: 2px solid #0e0905; box-shadow: inset 0 0 0 2px #8a6a3a, inset 0 0 40px #000a, 0 14px 40px #000c; font-family: ${PIXEL_STACK}; image-rendering: pixelated; }
.vk-cls .vk-head { background: linear-gradient(180deg, #4a3522, #2a1d14); border-bottom: 2px solid #8a6a3a; }
.vk-cls .vk-title { font-size: 22px; color: #f0d27a; text-shadow: 2px 2px 0 #000; }
.vk-cls .vk-sub { color: #b9a46a; font-size: 13px; text-shadow: 1px 1px 0 #000; }
.vk-cls .vk-sect { color: #f0d27a; text-shadow: 1px 1px 0 #000; }
.vk-cls .vk-card { background: #1d140d; border: 2px solid #5b4630; box-shadow: inset 0 0 0 1px #0e0905; }
.vk-cls .vk-card h4 { color: #f0d27a; text-shadow: 1px 1px 0 #000; }
.vk-cls .vk-btn { font-family: ${PIXEL_STACK}; color: #f0d27a; background: linear-gradient(180deg, #6b5233, #3d2c1c); border: 2px solid #8a6a3a; border-right-color: #2a1d14; border-bottom-color: #2a1d14; text-shadow: 1px 1px 0 #000; }
.vk-cls .vk-btn.primary { background: linear-gradient(180deg, #8a2a24, #4a1210); }
.vk-cls .vk-btn.warn { color: #ffb0a0; }
.vk-cls .vk-x { background: none; border: none; color: #f0d27a; font-size: 20px; font-family: ${PIXEL_STACK}; }
.vk-cls .vk-meter { background: #0e0905; border: 1px solid #5b4630; }
.vk-cls .vk-chip { background: #1d140d; border: 1px solid #5b4630; color: #e3d39c; }
.vk-cls .vk-note.on { background: #1d140d; border: 1px solid #8a6a3a; color: #f0d27a; }
.vk-cls .vk-banner { background: #4a1210; border: 2px solid #8a2a24; color: #ffd8c0; text-shadow: 1px 1px 0 #000; }
.vk-cls .vk-hero { background: #1d140d; border: 2px solid #5b4630; }
.vk-cls .vk-big { color: #f0d27a; text-shadow: 2px 2px 0 #000; }
@media (max-width: 560px) { .vk-hero { grid-template-columns: 1fr; text-align: center; } .vk-hero .vk-art { justify-self: center; } .vk-grid { grid-template-columns: 1fr; } }
`;
function injectKit() {
  injectEnhancedStyle(); injectEnhancedFonts();   // the tokens and the faces - the classic dress reads its own fallbacks
  if (document.getElementById('vamp-kit-style')) return;
  const st = document.createElement('style');
  st.id = 'vamp-kit-style';
  st.textContent = VK_CSS;
  document.head.append(st);
}

// ── the pieces ─────────────────────────────────────────────────────────────────────────
/** A button. `cost` a small figure after its label; `why` disables it and says why on hover. */
export function button(label, onClick, { kind = '', cost = null, why = null } = {}) {
  const b = el('button', `vk-btn ${kind}`.trim(), label);
  b.type = 'button';
  if (cost != null) b.append(el('span', 'vk-cost', String(cost)));
  if (why) { b.disabled = true; b.title = why; }
  b.onclick = (e) => { e.stopPropagation(); if (!why) onClick(); };
  return b;
}
/** A meter: `now` of `max`, its colour, the words on it. */
export function meter(now, max, colour, label = '') {
  const m = el('div', 'vk-meter');
  const f = el('i');
  f.style.width = `${Math.max(0, Math.min(100, (Number(now) / Math.max(1, Number(max))) * 100))}%`;
  f.style.background = `linear-gradient(180deg, ${colour}, color-mix(in srgb, ${colour} 60%, #000))`;
  f.style.boxShadow = `0 0 8px ${colour}88`;
  m.append(f, el('span', null, label));
  return m;
}
/** A chip: a small readout with an optional glyph. */
export function chip(text, glyphMarkup = null, colour = null) {
  const c = el('span', 'vk-chip');
  if (glyphMarkup) c.append(art(glyphMarkup));
  c.append(el('span', null, text));
  if (colour) c.style.borderColor = colour;
  return c;
}
/** Diamond pips: `on` of `max`. */
export function pips(on, max) {
  const p = el('span', 'vk-pips');
  for (let i = 0; i < max; i++) p.append(el('i', i < on ? 'on' : null));
  return p;
}
/** A section's heading. */
export const section = (text) => el('div', 'vk-sect', text);

/**
 * THE SHELL. `render(body, api)` draws the body (called again on every `api.rerender`); `api.note(text, ok)` says a line
 * under the header; `api.close()`. Answers the overlay for the host's slot (mountWindow / townTalk.showOverlay).
 * @param {{ id: string, title: () => string, sub?: () => string, crest?: () => string, accent?: () => string, narrow?: boolean,
 *   render: (body: HTMLElement, api: any) => void, onClose?: () => void }} o
 */
export function openVampWindow({ id, title, sub = () => '', crest = () => '', accent = () => '#b02a35', narrow = false, render, onClose }) {
  if (typeof document === 'undefined') return null;
  injectKit();
  let fired = false;
  const layer = el('div', 'vk-layer');
  const win = el('div', `vk-win ${skinClass()}${narrow ? ' narrow' : ''}`);
  win.id = id;
  win.setAttribute('role', 'dialog');
  const head = el('header', 'vk-head');
  const crestBox = el('span', 'vk-art');
  const titles = el('div');
  const h = el('h2', 'vk-title');
  const s = el('p', 'vk-sub');
  titles.append(h, s);
  const x = el('button', 'vk-x', '✕');
  x.type = 'button';
  x.setAttribute('aria-label', 'Close');
  head.append(crestBox, titles, x);
  const note = el('p', 'vk-note');
  note.setAttribute('aria-live', 'polite');
  const body = el('div', 'vk-body');
  win.append(head, note, body);
  layer.append(win);
  document.body.append(layer);
  const api = {
    rerender: () => draw(),
    note: (text, ok = false) => { note.textContent = text || ''; note.className = `vk-note${text ? ' on' : ''}${ok ? ' ok' : ''}`; },
    close: () => close(),
  };
  function draw() {
    if (fired) return;
    win.style.setProperty('--accent', accent());
    crestBox.innerHTML = crest();
    h.textContent = title();
    s.textContent = sub();
    for (const c of [...body.children]) c.remove();
    render(body, api);
  }
  const close = () => {
    if (fired) return;
    fired = true;
    unregister();
    globalThis.removeEventListener('keydown', onKey, { capture: true });
    offOutside();
    clearInterval(tick);
    layer.remove();
    onClose?.();
  };
  x.onclick = (e) => { e.stopPropagation(); close(); };
  const onKey = (/** @type {KeyboardEvent} */ e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (overlayAction(e) === 'back') { e.preventDefault(); e.stopPropagation(); close(); }
  };
  globalThis.addEventListener('keydown', onKey, { capture: true });
  const offOutside = closeOnOutsideTap(layer, '.vk-win', close);
  const unregister = registerOverlay(close);
  const tick = setInterval(() => { if (!body.matches(':hover')) draw(); }, 2000);
  draw();
  return {
    isChoiceWindow: true,
    get done() { return fired; },
    input() { /* its own capture keydown owns the keyboard */ },
    click() { /* a fixed layer over the canvas */ },
    wheel() { /* its body scrolls itself */ },
    hover() { /* its own :hover */ },
    tick() { /* its own clock repaints it */ },
    draw() { /* DOM, not canvas */ },
    dispose() { close(); },
    repaint() { draw(); },
  };
}

/** A full-screen flash in `colour` (the bite, a Discipline's cast): `ms` long, `peak` its strongest. */
export function screenFlash(colour, { ms = 420, peak = 0.45, shape = 'vignette' } = {}) {
  if (typeof document === 'undefined') return;
  const f = el('div', 'vk-flash');
  f.style.background = shape === 'ring'
    ? `radial-gradient(circle at center, transparent 30%, ${colour} 55%, transparent 75%)`
    : `radial-gradient(ellipse at center, transparent 35%, ${colour} 100%)`;
  f.style.opacity = '0';
  document.body.append(f);
  f.animate([{ opacity: 0 }, { opacity: peak, offset: 0.25 }, { opacity: 0 }], { duration: ms, easing: 'ease-out' }).onfinish = () => f.remove();
}
