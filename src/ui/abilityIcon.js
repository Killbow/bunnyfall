// Small engraved silhouettes shared by the spellbook and the hotbar.
import { abilityById } from '../combat/abilities/registry.js';
import { abilityArt } from '../combat/abilities/abilityArt.js';

const actionMarks = {
  helix:'M2 11q10-3 2-9M2 3q10 3 2 9',
  needle:'M2 11l9-9m-5 0h5v5',
  cross:'M2 2l9 9M11 2l-9 9',
  crescent:'M2 10q8 2 9-8-4 6-9 8z',
  ward:'M2 2h9v4q0 3-4.5 5Q2 9 2 6z',
  rain:'M3 2l-1 6m5-5-1 7m5-5-1 6',
  crack:'M7 1L3 7h4l-1 5 5-7H7z',
  roots:'M6 2v9M2 5l4 3 4-3M3 2l3 3 3-3',
  dash:'M2 3h8M4 6h7M2 9h7',
  horizon:'M1 7h11M4 4h5',
  braid:'M2 2q0 4 4 5t5 4M11 2q0 4-4 5t-5 4',
  orbit:'M11 6a5 5 0 1 1-3-4m0-1v3h3',
  lash:'M2 11q-1-7 5-5t4-4',
  fan:'M2 10l9-8M2 10l10-4M2 10h10',
  claw:'M2 9l3-7M5 11l3-8M8 12l3-8',
  vault:'M1 10q5-13 11 0m0-4v4H8',
  cyclone:'M1 3q12-3 11 1T3 7q-4 3 5 4',
  mark:'M1 4V1h3m5 0h3v3m0 5v3H9m-5 0H1V9M6 6h1',
  eye:'M1 7q6-8 11 0-5 7-11 0zm5 0h1',
  halo:'M1 7a5.5 3 0 1 0 11 0 5.5 3 0 1 0-11 0',
  crown:'M1 3l3 3 2-4 3 4 3-3-2 7H3z',
  fracture:'M1 6h3l2-5 1 5 5-2-3 4 2 4-5-2-3 2 1-4z',
  feather:'M2 11Q2 3 11 2q0 7-7 7m-2 2 5-5',
  veil:'M2 11Q1 3 6 2q5 1 5 9M4 9l2-4 3 4',
  step:'M1 10h9l2-3H6V2L3 7z',
  bubbles:'M1 9a2 2 0 1 0 4 0 2 2 0 1 0-4 0M8 4a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
  anchor:'M6 2v9M3 5h6M1 7q0 4 5 4t5-4',
  return:'M5 3H2v3m0-3q9-4 10 3 0 5-7 5',
  key:'M2 3a2 2 0 1 0 4 0 2 2 0 1 0-4 0m4 2 6 6m-3-3 2-2',
};

const marks = {
  blade: 'M8 24l13-16 4-2-1 6-13 14z M6 21l7 6 M6 29l4-6',
  dagger: 'M9 21l8-14 5-2-1 8-9 11z M6 19l8 6 M7 27l4-6',
  bow: 'M7 6q21 2 18 20L7 6z M6 26L21 11m-6 0h6v6',
  axe: 'M7 27L21 6 M14 10l5 5q7 3 9-4-4 1-7-6z',
  hammer: 'M7 27l12-16 M13 7l5-5 10 9-5 6z',
  fist: 'M8 17V9q2-4 4 0v6-9q2-3 4 0v8-9q2-3 4 1v9-7q3-2 4 1v10l-5 8H12z',
  staff: 'M7 28L21 8 M19 10l-3-4 5-4 5 4-2 5z',
  pair: 'M5 5l4 2 15 17-2 2L6 10z M26 5l-4 2-6 7m-3 5-6 7-2-2 6-7 M18 25l7-7 M6 18l6 6',
  star: 'M16 3l3 9 9 3-9 4-3 9-3-9-9-4 9-3z',
  feather: 'M6 27l14-18 M9 20Q7 9 25 4q1 15-13 17 M15 15l7-1',
  anchor: 'M16 10v16 M10 14h12 M5 19q2 7 11 8 9-2 11-8 M5 23v-4h4m14 0h4v4 M13 7a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
  eye: 'M3 16q13-17 26 0-13 16-26 0z M12 16a4 4 0 1 0 8 0 4 4 0 1 0-8 0',
  wave: 'M4 13q5 5 9-2t10-3l4 3 M4 20q5 5 10 0t12 0',
  key: 'M6 10a5 5 0 1 0 10 0 5 5 0 1 0-10 0 M14 14l12 12 2-3m-8-3 3-3',
  flask: 'M12 4h8m-7 0v9L6 24q-1 3 3 3h14q4 0 2-3l-7-11V4 M10 20h12',
  step: 'M5 23l10-12-1 8h11l-9 6H5z M6 11l4-4m-1 9 4-4',
  ward: 'M16 3l10 4-1 10q-2 6-9 11-8-5-10-12L5 7z M11 15l4 4 7-9',
};
const utilities = {
  trailblazer:'step', 'unbound-will':'ward', featherstep:'feather', 'wayfarers-anchor-mark':'anchor',
  'wayfarers-anchor-recall':'anchor', 'hunters-awareness':'eye', 'deepwater-training':'wave',
  riverstride:'wave', breakaway:'step', 'field-antidote':'flask', lockbreaker:'key',
};
const families = { 'short-blade':'dagger', 'long-blade':'blade', axe:'axe', blunt:'hammer', 'hand-to-hand':'fist', archery:'bow' };
const races = { breton:'ward', redguard:'blade', nord:'hammer', 'dark-elf':'dagger', 'high-elf':'eye',
  'wood-elf':'bow', khajiit:'fist', argonian:'wave', imperial:'star', lilmothit:'step', lungaris:'feather', orc:'axe' };

Object.assign(marks, {
  tanto:'M8 22l11-14 5-1-2 6-12 12z M6 24l4-5m-6 8 4-5',
  shortsword:'M8 21L20 8l5-2-2 6-12 12z M6 19l8 7 M5 27l5-6',
  wakizashi:'M6 24Q18 15 23 5l1 6Q19 19 9 26z M5 21l7 6',
  broadsword:'M6 23L18 8l8-4-3 10-13 13z M4 21l9 7',
  saber:'M5 23Q20 18 26 4q-1 15-17 22 M5 20q-3 10 7 8',
  katana:'M5 25Q18 15 26 4q-4 13-18 22 M5 21l6 6',
  claymore:'M7 23L24 3l-2 8-13 14 M4 18l3 4 7 3 M3 29l5-7',
  'dai-katana':'M4 27l6-7Q23 9 27 3q-1 10-15 21 M7 18l8 8',
  'battle-axe':'M7 28L22 5 M13 9l8 5q7-1 7-8l-8 2-3-4z',
  'war-axe':'M6 28L22 5 M12 8q3 5 8 6l7-1-3 7q-10 1-15-8z',
  'archers-axe':'M6 28L21 6 M15 8l6 6 6-5-5-4 M3 18L14 5m-4 0h4v4',
  mace:'M6 28l12-14 M16 14l-2-7 5-4 7 2 2 6-5 6z',
  'light-flail':'M6 27l9-13q0-10 6-9l2 5 M21 12l4-2 3 4-3 4-5-2z',
  flail:'M5 27l9-16q3-9 8-6l1 7 M18 14l5-3 5 4-1 6-6 1-4-5z',
  crossbow:'M7 25L23 7 M6 11q12-1 16 13L6 11z M4 27l5-2',
  ballista:'M5 24L24 5 M5 8l6 1 12 11 2 6 M5 8l20 18 M8 22l3 5m0-7 4 5',
  'short-bow':'M8 7q16 2 16 17L8 7z M7 23l13-13',
});
const weapons = { longsword:'blade', 'long-bow':'bow', warhammer:'hammer', 'hand-to-hand':'fist' };
const cache = new Map();
export function abilityIcon(id) {
  if (cache.has(id)) return cache.get(id);
  const ability = abilityById(id);
  if (!ability) return '';
  const [, style, second] = id.split('.');
  const kind = ability.category;
  const mark = kind === 'utility' ? utilities[style] : kind === 'racial' ? races[style] : weapons[style] ?? style;
  const color = {weapon:'#e8c994', combination:'#cfc0f7', racial:'#f4ac82', utility:'#8ddbc6'}[kind];
  const capstone = ability.rank === 100;
  const pips = kind === 'weapon' ? Math.floor(ability.rank / 25) : kind === 'combination' ? (capstone ? 2 : 1) : 0;
  const detail = Array.from({length:pips}, (_,i) => '<circle cx="'+(16+(i-(pips-1)/2)*4)+'" cy="29" r="1"/>').join('');
  const accent = style.endsWith('recall') ? 'M5 12l-3 3 3 3m-3-3h7'
    : style === 'riverstride' || style === 'breakaway' ? 'M3 10l4-4m-1 7 4-4' : '';
  const emblem = kind === 'combination'
    ? '<path transform="translate(-1 3) scale(.75)" d="'+marks[families[style]]+'"/><path transform="translate(31 3) scale(-.75 .75)" d="'+marks[families[second]]+'"/>'
    : '<path d="'+marks[mark]+'"/>';
  const art = abilityArt(id);
  const action = (kind === 'weapon' || kind === 'combination') && actionMarks[art?.form];
  const enamel = { shadow:'#c895f4', gold:'#ffd578', steel:'#8ad7ff', moon:'#c8cfff',
    stone:'#d1b49b', ember:'#ffa174', leaf:'#a5d993', wind:'#b1eee7', tide:'#82cfe5' };
  const badge = action
    ? '<g transform="translate(17 15)" stroke="'+(enamel[art.material] ?? color)+'"><circle cx="6.5" cy="6.5" r="6.6" fill="#171a20"/><path transform="translate(1.3 1.3) scale(.8)" d="'+action+'" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></g>'
    : '';
  // BUNNYFALL: a lit plate behind the emblem in the color of its kind, and a second inner frame for a capstone.
  const plate = '<defs><radialGradient id="g" cx=".5" cy=".38" r=".7"><stop offset="0" stop-color="'+color+'" stop-opacity=".2"/><stop offset="1" stop-color="'+color+'" stop-opacity="0"/></radialGradient></defs>';
  const frame = capstone ? '<rect x="3" y="3" width="26" height="26" rx="3.5" fill="none" stroke="'+color+'" stroke-opacity=".45" stroke-width=".8"/>' : '';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'+plate+'<rect x="1" y="1" width="30" height="30" rx="5" fill="#201e21" stroke="'+color+'" stroke-opacity="'+(capstone ? '.9' : '.35')+'"/><rect x="1" y="1" width="30" height="30" rx="5" fill="url(#g)"/>'+frame+'<g transform="translate(2 1) scale(.87)" fill="none" stroke="'+color+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">'+emblem+'<path d="'+accent+'"/></g>'+badge+'<g fill="'+color+'">'+detail+'</g></svg>';
  const url = 'data:image/svg+xml,' + encodeURIComponent(svg);
  cache.set(id, url);
  return url;
}
