// @ts-check
// BUNNYFALL (2026-11-05, the owner: "another smaller event for lower level players, some sort of cannon being built in the
// empty area near Wayrest ... giving materials gives you coins", and "the cannon should be near Wayrest"): THE GREAT
// CANNON BY WAYREST. One build the whole realm gives ingots and planks to (net/cannonLaw.js; the account service keeps it,
// server-account/src/cannon.js), each gift paying Nyx coins at about the reach's rate; when it is whole it fires toward
// Cromwark and the next one is begun. It stands on the open ground nearest Wayrest, by a road where one runs: the map
// files say where, so every game stands it in the same place. A leaf the Cromwark host carries (scenes/cromwarkHost.js),
// so the world host wires nothing new.
import { CANNON_NEED, CANNON_KEYS, CANNON_VALUE, CANNON_GIVE_MAX, cannonMaterialName, cleanGot, cannonShare } from '../net/cannonLaw.js';
import { cannonStatus, cannonGive } from '../net/accountClient.js';
import { cannonModel, cannonArt, CANNON_ARCHIVE } from '../world/cannonModel.js';
import { createCannonOverlay } from '../ui/cannonWindow.js';
import { heldOf, takeCarried } from '../systems/materialsBag.js';
import { giveNyxCoins, nyxCoinsHeld, nyxCoinsText } from '../systems/wild/nyxShop.js';
import { wildMaskOf } from '../systems/wild/wildZone.js';
import { pathsDataPoint } from '../world/road/pathData.js';
import { ARMS } from '../world/road/roadBand.js';
import { RAY_DISTANCE, STATIC_NPC_ACTIVATION_DISTANCE } from '../player/activate.js';
import { toColor32 } from '../formats/color32Order.js';
import { addWaypoint } from '../systems/map/mapWaypoints.js';
import { trs } from '../world/mat4.js';
import { t } from '../systems/textManager.js';

const PIXEL_M = 819.2;
/** How far from the pixel's middle it stands, off the road's line (m). */
const OFF_M = 30;
/** How often the build is asked after (s), and how near a shot is seen and heard (m). */
const POLL_S = 60, SEEN_M = 1500;
/** A shot older than this when first heard of is history, not news (s). */
const NEWS_S = 15 * 60;
const KEY = 'cannon:wayrest';
const MARK_KEY = 'bunnyfall.cannon.mark', SEEN_KEY = 'bunnyfall.cannon.seenFired';
const store = {
  get(k) { try { return globalThis.localStorage?.getItem(k) ?? null; } catch { return null; } },
  set(k, v) { try { globalThis.localStorage?.setItem(k, v); } catch { /* a private window keeps nothing */ } },
};

/** @param {any} deps the Cromwark host's own (scenes/cromwarkHost.js) */
export function createCannonHost(deps) {
  const { renderer = null, maps = null } = deps;
  let site = null, siteTried = 0;
  /** The open ground nearest Wayrest: a pixel of Wayrest's region that holds no place, a road's first. */
  function findSite() {
    if (!maps?.getLocationByName) return null;
    const city = maps.getLocationByName('Wayrest', 'Wayrest')?.mapTableData;
    if (!city) return null;
    const cx = Math.trunc(city.longitude / 128), cy = 499 - Math.trunc(city.latitude / 128);
    const region = maps.getRegionIndexAt?.(cx, cy);
    const taken = new Set();
    try {
      const reg = maps.getRegion(maps.getRegionIndex('Wayrest'));
      for (const e of reg?.mapTable ?? []) taken.add(`${Math.trunc(e.longitude / 128)},${499 - Math.trunc(e.latitude / 128)}`);
    } catch { /* the city's own pixel at least */ }
    taken.add(`${cx},${cy}`);
    const net = deps.roads?.() ?? null;
    let best = null;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = cx + dx, y = cy + dy, r = Math.hypot(dx, dy);
      if (r < 1 || taken.has(`${x},${y}`) || maps.getRegionIndexAt?.(x, y) !== region) continue;   // land of Wayrest's own, no place on it
      const bits = net ? pathsDataPoint(net, x, y) : 0;
      const d = r - (bits ? 0.9 : 0);
      if (!best || d < best.d) best = { px: x, py: y, bits, d };
    }
    if (!best) return null;
    const arm = ARMS.find(([bit, sx, sz]) => !(best.bits & bit) && (sx === 0 || sz === 0)) ?? ARMS[0];
    const len = Math.hypot(arm[1], arm[2]) || 1, ux = arm[1] / len, uz = arm[2] / len, c = PIXEL_M / 2;
    // the barrel laid toward Cromwark: the reach's middle, east and north in the pixel's frame
    const box = wildMaskOf(maps)?.box;
    const zx = box ? (box.x0 + box.x1) / 2 : best.px, zy = box ? (box.y0 + box.y1) / 2 : best.py - 10;
    const yaw = Math.atan2(zx - best.px, best.py - zy);
    return { px: best.px, py: best.py, at: [c + ux * OFF_M, c + uz * OFF_M], yaw };
  }
  function markSite(sp) {
    if (store.get(MARK_KEY) === '1') return;
    try {
      const r = addWaypoint({ kind: 'personal', mx: sp.px + sp.at[0] / PIXEL_M, my: sp.py + 1 - sp.at[1] / PIXEL_M, name: t('cannon.mark', 'The Great Cannon (Wayrest)'), color: 'orange' });
      if (r?.waypoint) store.set(MARK_KEY, '1');
    } catch (e) { console.warn('[cannon] the map mark', e?.message ?? e); }
  }

  // ── THE BUILD, AS THE SERVICE KEEPS IT ───────────────────────────────────────
  let build = null, asking = false, nextAsk = 0, recoilAt = -1;
  const io = () => deps.io?.() ?? null;
  function heard(r) {
    if (!r?.ok) return;
    const d = r.data ?? r;
    build = { round: Number(d.round) || 1, firedAt: Number(d.firedAt) || 0, got: cleanGot(d.got) };
    const seen = Number(store.get(SEEN_KEY)) || 0;
    if (build.firedAt > seen) {
      store.set(SEEN_KEY, String(build.firedAt));
      if (seen > 0 || Date.now() / 1000 - build.firedAt < NEWS_S) fire();
    }
  }
  async function ask() {
    const i = io();
    if (!i || asking) return;
    asking = true;
    try { heard(await cannonStatus(i)); } catch { /* asked again later */ } finally { asking = false; }
  }
  /** It fires: every game hears it, and one standing near sees the barrel kick. */
  function fire() {
    deps.say?.(t('cannon.fired', 'The Great Cannon by Wayrest has fired on Cromwark! Its builders begin the next one.'));
    if (at) { deps.mid?.(t('cannon.boom', 'BOOM')); recoilAt = performance.now(); }
  }

  // ── STANDING IT ─────────────────────────────────────────────────────────────
  let gpu = null, mat = null, at = null, box = null;
  function ensureGpu() {
    if (gpu || !renderer?.createMesh || !renderer.uploadTexture) return;
    for (const { record, image } of cannonArt()) renderer.uploadTexture(CANNON_ARCHIVE, record, toColor32(image), { opaque: true });
    gpu = renderer.createMesh(cannonModel({ scaffold: true }));
  }
  function frame() {
    const now = performance.now();
    if (now > nextAsk) { nextAsk = now + POLL_S * 1000; ask(); }
    if (!site && now > siteTried) { site = findSite(); siteTried = now + 10000; if (site) markSite(site); }
    at = null;
    if (!site || deps.mode?.() !== 'exterior') return;
    const tr = deps.pixelTranslation(site.px, site.py);
    if (!tr) return;
    const x = tr[0] + site.at[0], z = tr[2] + site.at[1], y = deps.heightAt(x, z);
    if (!Number.isFinite(y)) return;   // its pixel not built
    const f = deps.feet?.() ?? deps.cam?.();
    if (f && Math.hypot(f[0] - x, f[2] - z) > SEEN_M) return;
    ensureGpu();
    at = [x, y, z];
    // the kick: back along the barrel and home again, a second and a half
    const k = recoilAt >= 0 ? (now - recoilAt) / 1500 : 1;
    const back = k < 1 ? Math.sin(Math.min(1, k * 6) * Math.PI / 2) * (1 - k) * 1.4 : 0;
    if (k >= 1) recoilAt = -1;
    const yawDeg = (site.yaw * 180) / Math.PI;
    mat = trs(x - Math.sin(site.yaw) * back, y, z - Math.cos(site.yaw) * back, 0, yawDeg, 0);
    box = [{ key: KEY, aabb: { min: [x - 3, y, z - 3], max: [x + 3, y + 4.5, z + 3] }, distance: RAY_DISTANCE, reach: STATIC_NPC_ACTIVATION_DISTANCE + 3, noSurface: false }];
  }

  // ── GIVING ──────────────────────────────────────────────────────────────────
  let busy = false, win = null;
  const rows = () => (build ? CANNON_KEYS.map((key) => ({
    key, name: cannonMaterialName(key), have: build.got[key], need: CANNON_NEED[key],
    carried: heldOf(deps.entity, key, { counter: false }), worth: CANNON_VALUE[key],
  })) : null);
  async function give(key) {
    const i = io();
    if (!i) return { ok: false, text: t('cannon.signIn', 'Sign in and go online to give to the cannon.') };
    if (!build) return { ok: false, text: t('cannon.wait', 'The foreman is still counting. Try again in a moment.') };
    const want = Math.min(heldOf(deps.entity, key, { counter: false }), CANNON_NEED[key] - build.got[key], CANNON_GIVE_MAX);
    if (!(want > 0)) return { ok: false, text: t('cannon.nothing', 'You have none of that to give.') };
    if (busy) return { ok: false, text: t('cannon.busy', 'The foreman is busy.') };
    busy = true;
    const take = takeCarried(deps.entity, key, want);
    try {
      const r = await cannonGive(i, key, take.taken);
      const d = r?.data ?? r;
      if (!r?.ok || !d) { take.back(); return { ok: false, text: t('cannon.failed', 'The gift did not reach the foreman. Nothing was taken.') }; }
      const got = Number(d.taken) || 0;
      if (got < take.taken) { take.back(); if (got > 0) takeCarried(deps.entity, key, got); }   // only what the build still needed
      const coins = Number(d.coins) || 0;
      if (coins > 0) { giveNyxCoins(deps.items?.() ?? [], coins); deps.clink?.(); }
      deps.saved?.();
      heard(r);
      if (d.fired) { store.set(SEEN_KEY, String(Number(d.firedAt) || 0)); fire(); }
      if (!got) return { ok: false, text: t('cannon.enough', 'The build has all it needs of that.') };
      return { ok: true, text: coins > 0
        ? t('cannon.thanks', 'You give {n} {name}. The foreman pays you {coins}.', { n: got, name: cannonMaterialName(key), coins: nyxCoinsText(coins) })
        : t('cannon.thanksNoCoin', 'You give {n} {name}. It counts toward your next Nyx coin.', { n: got, name: cannonMaterialName(key) }) };
    } catch {
      take.back();
      return { ok: false, text: t('cannon.failed', 'The gift did not reach the foreman. Nothing was taken.') };
    } finally { busy = false; }
  }
  function open() {
    if (win && !win.done) return;
    win = createCannonOverlay({
      build: () => (build ? { round: build.round, share: cannonShare(build.got), rows: rows() ?? [] } : null),
      purse: () => nyxCoinsHeld(deps.items?.() ?? []),
      give, busy: () => busy, load: () => ask(),
      onClose: () => { win = null; },
    });
    if (win) deps.show?.(win);
  }

  return {
    frame,
    draw(r = renderer) { if (!at || !gpu || !mat || !r?.drawMesh) return 0; r.drawMesh(gpu, mat, null); return 1; },
    targets: () => (at && box ? box : []),
    hoverName: (key) => (key === KEY && at ? { title: t('cannon.name', 'The Great Cannon'), subs: [build ? t('cannon.hover', '{pct}% built · Give ingots and planks for Nyx coins', { pct: Math.floor(cannonShare(build.got) * 100) }) : t('cannon.hoverIdle', 'Give ingots and planks for Nyx coins')] } : null),
    activate(key, mode = 'grab') {
      if (key !== KEY || !at) return false;
      if (mode === 'info') deps.say?.(t('cannon.info', 'You see the Great Cannon, built by the realm to fire on Cromwark.'));
      else open();
      return true;
    },
    ours: (key) => key === KEY,
    state: () => ({ site, at, build }),
  };
}
