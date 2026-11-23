// @ts-check
// BUNNYFALL CAMPS IN HOLDINGS (player feedback: "guys I may forget 2 other camps ages ago, but I cannot find anything on
// the map, any suggestion how to find it?" - after "You already keep 3 camps. Pick one up first"): THE CAMPS PAGE on the
// pause menu's Holdings rail (ui/enhanced/enhancedMenu.js) - every camp the account keeps, wherever it stands: its name,
// where it is (the region, the nearest town, the map pixel), when it was pitched, how furnished - and a button to MARK it
// on the map (a followed personal waypoint, systems/map/mapWaypoints.js, drawn by the held map and the Overworld alike).
//
// Packing a camp up stays where it always was - at its tent, in the world (scenes/homeYards.js strikes a camp whose tent is
// gone): striking one from here would leave its tent standing and pitch it again. So this page finds camps; it does not
// strike them.
//
// Self-contained: it asks the account service itself (accountDecor's `campsMine`) and reads the game's maps off
// net/staffPlaces.js keptMaps, so no host wires it. Dressed by the Holdings kit's roles (ui/holdingsPages.js).
import { accountDecor, storedSession } from '../net/accountClient.js';
import { appStorage } from '../platform/appStorage.js';
import { ensureHoldingsStyle } from './holdingsPages.js';
import { keptMaps, staffPlaces } from '../net/staffPlaces.js';
import { campMapPoint, CAMPS_MAX } from '../net/campLaw.js';
import { addWaypoint, listWaypoints, removeWaypoint, setWaypointFollowed, cleanWaypointName } from '../maps/mapWaypoints.js';
import { t } from './textManager.js';

export const CAMPS_PAGE_SECTIONS = Object.freeze([Object.freeze(['camps', 'Camps'])]);
/** The page stands for a signed-in account (a camp is a linked account's), in a game that has its maps. */
export const campsPageShown = () => { try { return !!storedSession(appStorage()); } catch { return false; } };
/** How long a read of the camps is kept before the page asks again, ms. */
const READ_KEEP_MS = 20_000;

/** @type {{ status: 'idle'|'loading'|'ready'|'fail', camps: any[], at: number, error: string }} */
let _read = { status: 'idle', camps: [], at: 0, error: '' };
let _api = /** @type {any} */ (null);
const api = () => (_api ??= accountDecor({ fetch: (u, i) => globalThis.fetch(u, i), storage: appStorage() }));
/** Forget what was read (a sign-out, a new visit): the next draw asks again. */
export function resetCampsPage() { _read = { status: 'idle', camps: [], at: 0, error: '' }; _api = null; }

/** The place words of a camp: `{ region, town, pixels }` - the region it stands in, the town nearest its pixel and how many map
 *  pixels off (null where the game's maps are not loaded). Pure over `maps` (a MapsFile). */
export function campPlace(maps, c) {
  if (!maps?.getRegionIndexAt) return { region: '', town: '', pixels: 0 };
  const r = maps.getRegionIndexAt(c.px, c.py);
  if (!Number.isInteger(r) || r < 0) return { region: '', town: '', pixels: 0 };
  const region = String(maps.getRegionName?.(r) ?? '');
  let best = null;
  for (const p of staffPlaces(maps, r).list) {
    if (p.kind !== 'town') continue;
    const d = Math.hypot(p.px - c.px, p.py - c.py);
    if (!best || d < best.d) best = { name: p.name, d };
  }
  return { region, town: best?.name ?? '', pixels: best ? Math.round(best.d) : 0 };
}

/** A camp's place in one line: "Near Daggerfall, Daggerfall" (or the pixel alone while the maps are not loaded). */
export function campPlaceLine(maps, c) {
  const p = campPlace(maps, c);
  const where = [p.town ? (p.pixels ? t('camps.page.near', 'near {town}', { town: p.town }) : p.town) : '', p.region].filter(Boolean).join(', ');
  return where || t('camps.page.pixel', 'map square {px}, {py}', { px: c.px, py: c.py });
}

const markName = (c) => cleanWaypointName(t('camps.page.markName', 'Camp: {name}', { name: c.name }), 'Camp');
/** The waypoint of mine that marks camp `c`, or null. */
const markOf = (c) => { const n = markName(c), p = campMapPoint(c); return listWaypoints().find((w) => w.mine && w.kind === 'personal' && w.name === n && Math.abs(w.mx - p.mx) < 0.01 && Math.abs(w.my - p.my) < 0.01) ?? null; };

function ask(rerender) {
  _read = { ..._read, status: 'loading' };
  Promise.resolve(api().campsMine()).then((r) => {
    _read = r?.ok && Array.isArray(r.data?.camps) ? { status: 'ready', camps: r.data.camps, at: Date.now(), error: '' } : { status: 'fail', camps: [], at: Date.now(), error: r?.error ?? 'offline' };
  }, () => { _read = { status: 'fail', camps: [], at: Date.now(), error: 'offline' }; }).finally(() => rerender());
}

/** The page: `detail` the rail's detail pane; `kit` the menu's makers ({ el, divider }). */
export function drawCampsPage(detail, rerender, { el, divider } = /** @type {any} */ ({})) {
  ensureHoldingsStyle();
  detail.append(divider(t('camps.page.title', 'Camps')));
  if (_read.status === 'idle' || (_read.status !== 'loading' && Date.now() - _read.at > READ_KEEP_MS)) ask(rerender);
  if (_read.status === 'loading' && !_read.at) { detail.append(el('p', 'px-note', t('camps.page.loading', 'Looking for your camps...'))); return; }
  if (_read.status === 'fail') { detail.append(el('p', 'px-note', t('camps.page.fail', 'Your camps could not be read just now. Try again in a moment.'))); return; }
  const camps = _read.camps;
  detail.append(el('p', 'px-note', t('camps.page.intro', 'A tent pitched outdoors with the camping kit stays as a camp until its tent is packed up. You may keep {max} at once. Mark one to follow it on your map; to pack one up, go to it and pick up its tent.', { max: CAMPS_MAX })));
  if (!camps.length) { detail.append(el('p', 'px-note', t('camps.page.none', 'You keep no camps.'))); return; }
  const maps = keptMaps();
  const list = el('div', 'hld-list');
  camps.forEach((c) => {
    const card = el('div', 'hld-refit');
    const head = el('div', 'hld-head');
    head.append(el('span', 'hld-name', c.name), el('span', 'hld-state', `${camps.indexOf(c) + 1} / ${CAMPS_MAX}`));
    card.append(head, el('span', 'hld-sub', campPlaceLine(maps, c)));
    const bits = [t('camps.page.square', 'Map square {px}, {py}', { px: c.px, py: c.py }), t('camps.page.pieces', '{n} decorations', { n: c.pieceCount ?? 0 })];
    if (c.placedAt) bits.push(t('camps.page.placed', 'pitched {date}', { date: new Date(c.placedAt * 1000).toLocaleDateString() }));
    card.append(el('span', 'hld-sub', bits.join(' - ')));
    const acts = el('div', 'hld-acts');
    const mark = markOf(c);
    const b = el('button', mark ? 'act' : 'act primary', mark ? t('camps.page.unmark', 'Unmark on the map') : t('camps.page.mark', 'Mark on the map'));
    b.onclick = () => {
      if (mark) removeWaypoint(mark.id, { quiet: true });
      else { const p = campMapPoint(c); const got = addWaypoint({ kind: 'personal', mx: p.mx, my: p.my, name: markName(c), color: 'gold' }); if (got) setWaypointFollowed(got.waypoint.id, true); }
      rerender();
    };
    acts.append(b);
    card.append(acts);
    list.append(card);
  });
  detail.append(list);
}

/** The camps' names and places as one sentence for the limit's refusal - "Camp A (near X, Region), Camp B (...)" - or '' for none. */
export function campsSentence(camps, maps = keptMaps()) {
  return (camps ?? []).slice(0, CAMPS_MAX).map((c) => `${c.name} (${campPlaceLine(maps, c)})`).join('; ');
}

/** Ask the service for the camps and say where they are: resolves the words to add to a refusal (the refusal itself points at Holdings), '' on any failure. */
export async function campsWhereWords() {
  try {
    const r = await api().campsMine();
    const s = r?.ok ? campsSentence(r.data?.camps) : '';
    return s ? t('camps.page.whereMine', 'Yours stand at: {list}.', { list: s }) : '';
  } catch { return ''; }
}
