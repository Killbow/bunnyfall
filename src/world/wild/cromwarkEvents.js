// @ts-check
import { registerModSaveData } from '../../saves/modSaveData.js';
import { CROMWARK_FIXED_PACK, CROMWARK_ROAMING_PACK } from './cromwarkBlight.js';
export const REACH_EVENTS = /** @type {readonly Readonly<{ key: string, title: string, hint: string, roster: number[] }>[]} */ (Object.freeze([
  { key: 'hunt', title: 'The Shard Hunt', hint: 'Track the roaming pack. Keep room to dodge its charges.', roster: [3137, 3139, 15, 3136, 3142] },
  { key: 'ritual', title: 'The Hollow Choir', hint: 'Silence the Bishop and Pain. Their overlapping patterns leave escape lanes.', roster: [3140, 3141, 17, 3137, 3142] },
  { key: 'cache', title: 'Forsaken Supplies', hint: 'Break the guard to recover the cache. Beware the Gazadar’s firing line.', roster: [3138, 3142, 7, 3136, 3139] },
].map(Object.freeze)));
export const reachDay = ms => Math.floor(ms / 86400000);
const hash = (a,b,c) => { let n = Math.imul(a,73856093)^Math.imul(b,19349663)^Math.imul(c,83492791); n=Math.imul(n^(n>>>16),2246822507); return (n^(n>>>13))>>>0; };
/** One destination in each 3x3 map-pixel sector. Every client uses the same
 * daily positions; settlements, water and the sealed city are excluded by host. */
export function reachSite(sx, sy, day) {
  const n=hash(sx,sy,day), px=sx*3+n%3, py=sy*3+(n>>>4)%3;
  const kind=(n>>>8)%3;
  const event = REACH_EVENTS[kind];
  const count = kind === 0 ? CROMWARK_ROAMING_PACK : CROMWARK_FIXED_PACK;
  const roster = Array.from({ length: count }, (_, slot) => event.roster[slot % event.roster.length]);
  return { px, py, day, kind, x: 170+(n>>>12)%480, z: 170+(n>>>21)%480,
    id: `${px},${py}:reach.${day}.${kind}`, ...event, roster, purpleFire: kind !== 0 && (n >>> 5) % 4 === 0 };
}
let book = { day: -1, sites: {} };
export function reachMemory(day, id) {
  if(day>book.day) {
    book.day=day;
    for(const key of Object.keys(book.sites)) if(Number(key.split('.')[1])<day-1) delete book.sites[key];
  }
  if(!book.sites[id] && Object.keys(book.sites).length>=2048) delete book.sites[Object.keys(book.sites)[0]];
  return book.sites[id] ??= { slain: [], slots: [], opened: false, said: false };
}
registerModSaveData('bunnyfall.cromwarkReach', {
  newSaveData: () => ({day:-1,sites:{}}),
  getSaveData: () => JSON.parse(JSON.stringify(book)),
  restoreSaveData: r => {
    book={day:Number.isSafeInteger(r?.day)?r.day:-1,sites:{}};
    for(const [id,m] of Object.entries(r?.sites??{}).slice(0,2048)) {
      if(!/^\d{1,4},\d{1,3}:reach\.\d{1,9}\.[0-2]$/.test(id)) continue;
      const kind = Number(id.at(-1));
      const roster = REACH_EVENTS[kind].roster;
      const count = kind === 0 ? CROMWARK_ROAMING_PACK : CROMWARK_FIXED_PACK;
      const slots = Array.isArray(m?.slots) ? m.slots.filter(i => Number.isInteger(i) && i >= 0 && i < count) :
        (Array.isArray(m?.slain) ? roster.flatMap((foe, i) => m.slain.includes(foe) ? [i] : []) : []);
      book.sites[id]={slots:[...new Set(slots)],slain:Array.isArray(m?.slain)?[...new Set(m.slain.filter(foe => roster.includes(foe)))]:[],items:Array.isArray(m?.items)?m.items.slice(0,64).filter(it=>it&&typeof it==='object'):null,opened:m?.opened===true,said:m?.said===true};
    }
  },
});
