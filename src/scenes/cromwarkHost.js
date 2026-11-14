// @ts-check
// BUNNYFALL (2026-11-04, the owner's "first big world change"): THE REACH OF CROMWARK, AS THE WORLD HOST WEARS IT - a
// module the host wires (HOST-SPLIT); the laws are systems/wild/cromwark.js's, the shop's systems/wild/nyxShop.js's.
//
//   THE HAZE: from the Passes inward a purple counter on the screen, the foes' blows on me growing +25% a minute
//     (combat/formulas.js reads hazeMult), reset when I leave the deep rings or die; the air purple (`fog`).
//   THE COINS: a kill of the reach's may drop a Dusk Token into my pack (1/3/6/12% by ring, Selantha's Ring +1%), and the
//     account service is told (server-account/src/nyx.js), so Nyx's titles are paid out of coins it knows of and
//     /nyxcoin can say how many were gathered.
//   THE CAMP: the Adventurers' Guild's tent on the road at the zone's south-east corner (the owner's spot), and Nyx before
//     it - her sprite (public/art/bunnyfall-npcs/nyx.png) - whose press opens her window (ui/nyxWindow.js).
import { CROMWARK_ON, cromwarkPeace, createHazeClock, setHazeMult, hazeClockText, HAZE_CSS, nyxCoinChance, NYX_RING_LUCK, CROMWARK_CAMP_UV, blightHere } from '../systems/wild/cromwark.js';
import { setCromwarkMaps } from '../systems/wild/cromwarkTowns.js';
import { setCourtMaps, courtPosts } from '../systems/wild/cromwarkCourts.js';   // the courts' sides of the reach
import { NYX_GEAR, NYX_GARMENTS, HEART_WARDEN_S, nyxSale, nyxCoinsHeld, giveNyxCoins, nyxCoinsText, spendNyxCoins } from '../systems/wild/nyxShop.js';
import { wildMaskOf, wildInside, wildNear } from '../systems/wild/wildZone.js';
import { INSIGNIA } from '../net/insignia.js';
import { nyxFound, nyxTotal, buyInsignia, equipTitle, equipAura } from '../net/accountClient.js';
import { registerPlayerKillListener } from '../systems/playerKills.js';
import { powerKind } from '../systems/loot/lootPowers.js';
import { pathsDataPoint } from '../world/road/pathData.js';
import { ARMS } from '../world/road/roadBand.js';
import { RAY_DISTANCE, STATIC_NPC_ACTIVATION_DISTANCE } from '../player/activate.js';
import { decodePng } from '../systems/textureReplacement.js';
import { toColor32 } from '../formats/color32Order.js';
import { bunnyNpcArtUrl } from '../systems/bunnyNpcArt.js';
import { TITLE_TEXT, AURA_TEXT } from '../ui/playerBadge.js';
import { createNyxOverlay } from '../ui/nyxWindow.js';
import { TENT_MODEL } from '../systems/survival/camp.js';
import { trs } from '../world/mat4.js';
import { createCannonHost } from './cannonHost.js';
import { createWorldEventsBoard } from '../ui/worldEventsBoard.js';   // BUNNYFALL: the realm's notices - its events and the Discord   // BUNNYFALL: the great cannon by Wayrest, the smaller event
import { ENEMY_BASICS } from '../characters/enemy/enemyBasics.js';
import { IDLE_ANIMS } from '../characters/mobile/mobileUnit.js';
import { mobileBillboardSize } from '../world/rmbFlats.js';
import { KNIGHT_CITY_WATCH } from '../characters/mobile/mobileTypes.js';
import { addWaypoint, setWaypointFollowed } from '../systems/map/mapWaypoints.js';   // the camp's mark on both maps
import { t } from '../systems/textManager.js';

/** A map pixel's side (m) - the pixel frame the camp is laid in (east, north from its south-west corner). */
const PIXEL_M = 819.2;
/** Nyx's sprite: its texture's place in the renderer's cache, and her height (m) - her width the picture's own share. */
export const NYX_ARCHIVE = 9910;
export const NYX_RECORD = '0#0';
export const NYX_H = 2.15;   // the owner: "shes supposed to be a bit of a taller lady" - a head over the townsfolk's ~1.8
/** Where she and the tent stand off the road's line (m), and how near a press reaches her. */
const NYX_OFF_M = 6, TENT_OFF_M = 12, NYX_REACH = STATIC_NPC_ACTIVATION_DISTANCE;
/** The camp's other tents and its guards. */
export const CAMP_TENTS = 12, CAMP_GUARDS = 6;
/** The account's coins not yet heard by the service, kept across a reload. */
const OWED_KEY = 'bunnyfall.nyx.owed';
const HEART_KEY = 'bunnyfall.nyx.heartWarden';
const CAMP_MARK_KEY = 'bunnyfall.nyx.campMark';
const store = {
  get(k) { try { return globalThis.localStorage?.getItem(k) ?? null; } catch { return null; } },
  set(k, v) { try { globalThis.localStorage?.setItem(k, v); } catch { /* a private window keeps nothing */ } },
};

/**
 * `deps`: `renderer`, `meshes` ({ getGpuMesh }), `maps`, `roads()` the road network, `pixelTranslation(px, py)`,
 * `heightAt(x, z)`, `feet()`, `cam()`, `kind()` the zone kind I stand in, `ring()` its ring, `mode()`, `alive()`,
 * `entity` the player's, `items()` the pack, `gender()`, `canCarry(item)`, `saved()` after a sale, `clink()`,
 * `say(text)`, `mid(text)`, `show(overlay)`, `io()` the account's credentials, `wardrobe()` { held, title },
 * `adopt(answer)` / `self(answer, secret)` the wardrobe's word adopted and worn at once, `loadWardrobe()`.
 * @param {any} deps
 */
export function createCromwarkHost(deps) {
  const { renderer = null, meshes = null, maps = null } = deps;
  setCromwarkMaps(maps);
  setCourtMaps(maps);
  const clock = createHazeClock();
  const cannon = createCannonHost(deps);   // the great cannon by Wayrest (scenes/cannonHost.js)
  // the board of the realm's events, once a session as the world stands (ui/worldEventsBoard.js)
  const board = createWorldEventsBoard({ cannon: () => cannon.progress(), askCannon: () => cannon.ask(), cromwark: CROMWARK_ON, ready: () => !!deps.boardReady?.() });
  let lastT = null, heartS = 0;
  let hud = null;

  // ── THE HAZE ──────────────────────────────────────────────────────────────────────────────────────────────────
  const hazeRing = () => (cromwarkPeace(deps.kind?.()) && deps.alive?.() ? (deps.ring?.() ?? 0) : 0);
  function hudFrame() {
    if (typeof document === 'undefined') return;
    const show = clock.on && deps.mode?.() !== 'interior';
    if (!show) { if (hud) hud.style.display = 'none'; return; }
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'cromwark-haze';
      hud.style.cssText = `position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:6;pointer-events:none;font:600 18px 'Cormorant',Georgia,serif;letter-spacing:0.12em;color:${HAZE_CSS};text-shadow:0 0 6px #000,0 0 12px rgba(120,40,200,0.8);text-align:center;white-space:nowrap`;
      document.body.append(hud);
    }
    hud.style.display = '';
    const pct = Math.round((clock.mult - 1) * 100);
    hud.textContent = `${t('cromwark.haze', 'PURPLE HAZE')} ${hazeClockText(clock.seconds)}${pct > 0 ? `  ·  ${t('cromwark.hazeHarder', '+{pct}% damage taken', { pct })}` : ''}`;
  }
  function frame() {
    const now = performance.now() / 1000;
    const dt = lastT == null ? 0 : Math.min(1, Math.max(0, now - lastT));
    lastT = now;
    const ring = hazeRing();
    const was = clock.minutes;
    // HAZE-WALKER: the boots' step is longer than a minute - the clock walked slower under them
    const walk = powerKind(deps.entity, 'hazewalk');
    clock.frame(ring, walk?.step > 0 ? (dt * 60) / walk.step : dt);
    setHazeMult(clock.mult);
    if (clock.on && clock.minutes > was) deps.mid?.(t('cromwark.hazeRises', 'The haze thickens. Foes hit {pct}% harder.', { pct: Math.round((clock.mult - 1) * 100) }));
    if (ring === 4) { heartS = clock.seconds; if (heartS >= HEART_WARDEN_S && store.get(HEART_KEY) !== '1') { store.set(HEART_KEY, '1'); deps.say?.(t('cromwark.heartWarden', 'You have endured the Heart. Nyx will sell you the title Warden of the Heart.')); } }
    hudFrame();
    campFrame();
    try { cannon.frame(); } catch (e) { console.warn('[cannon]', e?.message ?? e); }
    try { board.frame(); } catch (e) { console.warn('[events board]', e?.message ?? e); }
    owedFrame(now);
  }
  /** The air in the deep rings: the fog pulled toward the haze's purple and drawn in. */
  function fog(r, row, color) {
    if (!clock.on || !r?.setFog || !row || !color) return;
    const k = Math.min(0.6, 0.35 + 0.05 * clock.minutes);
    const c = new Float32Array(color.length);
    const P = [0.34, 0.16, 0.5];
    for (let i = 0; i < color.length; i++) c[i] = i < 3 ? color[i] * (1 - k) + P[i] * k : color[i];
    const end = Number.isFinite(row.end) ? Math.min(row.end, 1500) : row.end;
    r.setFog(row.mode, (row.density ?? 0) * 1.4, row.start, end, c);
  }

  // ── THE COINS ─────────────────────────────────────────────────────────────────────────────────────────────────
  let owed = Math.max(0, Math.trunc(Number(store.get(OWED_KEY)) || 0)), owedAt = 0, owedBusy = false;
  function owedFrame(now) {
    if (!owed || owedBusy || now < owedAt) return;
    const io = deps.io?.();
    if (!io) { owedAt = now + 30; return; }
    owedBusy = true;
    const n = Math.min(5, owed);
    nyxFound(io, n).then((r) => {
      if (r?.ok) { owed -= n; store.set(OWED_KEY, String(owed)); owedAt = now; } else owedAt = now + 30;
    }, () => { owedAt = now + 30; }).finally(() => { owedBusy = false; });
  }
  registerPlayerKillListener('cromwark', (foe) => {
    // and in Rodney's blight past the zone (systems/rodneyBlight.js): the outer ring's chance
    const inZone = !!foe?.wildFoe && cromwarkPeace(deps.kind?.());
    if (!inZone && !(foe && !foe.isPlayer && blightHere())) return;
    const luck = powerKind(deps.entity, 'nyxluck') ? NYX_RING_LUCK : 0;
    if (Math.random() >= nyxCoinChance(inZone ? (foe.wildRing || deps.ring?.() || 1) : 1, luck)) return;
    const items = deps.items?.();
    if (!items) return;
    giveNyxCoins(items, 1);
    owed++; store.set(OWED_KEY, String(owed));
    deps.clink?.();
    deps.say?.(t('cromwark.coin', 'A Dusk Token! You carry {coins}.', { coins: nyxCoinsText(nyxCoinsHeld(items)) }));
    deps.saved?.();
  });

  // ── THE CAMP ──────────────────────────────────────────────────────────────────────────────────────────────────
  /** The camp's map pixel and its spot in it, found once (the mask and the roads are the map files'). */
  let site = null, siteTried = 0;
  function findSite() {
    const m = wildMaskOf(maps), bx = m?.box;
    if (!bx) return null;
    // the owner's corner: the zone's south-east tip - its southernmost pixel east of its middle (CROMWARK_CAMP_UV's side)
    let tx = -1, ty = -1;
    const east = bx.x0 + (bx.x1 - bx.x0) * Math.min(0.9, Math.max(0.1, CROMWARK_CAMP_UV[0] - 0.2));
    for (let y = bx.y1; y >= bx.y0 && tx < 0; y--) for (let x = bx.x1; x >= east; x--) if (wildInside(m, x, y)) { tx = x; ty = y; break; }
    if (tx < 0) return null;
    const net = deps.roads?.() ?? null;
    let best = null;
    for (let dy = -1; dy <= 4; dy++) for (let dx = -2; dx <= 4; dx++) {
      const x = tx + dx, y = ty + dy;
      if (wildInside(m, x, y)) continue;   // outside the zone - the counter never runs at the camp
      const bits = net ? pathsDataPoint(net, x, y) : 0;
      const d = Math.hypot(dx, dy) - (bits ? 3 : 0) - (wildNear(m, x, y) ? 1 : 0);   // a road's pixel at the edge first
      if (!best || d < best.d) best = { px: x, py: y, bits, d };
    }
    if (!best) return null;
    // beside the road's line through the pixel's centre: off the first arm it does not run along
    const arm = ARMS.find(([bit, sx, sz]) => !(best.bits & bit) && (sx === 0 || sz === 0)) ?? ARMS[0];
    const len = Math.hypot(arm[1], arm[2]) || 1, ux = arm[1] / len, uz = arm[2] / len;
    const c = PIXEL_M / 2;
    return { px: best.px, py: best.py, nyx: [c + ux * NYX_OFF_M, c + uz * NYX_OFF_M], tent: [c + ux * TENT_OFF_M, c + uz * TENT_OFF_M], yaw: Math.atan2(-ux, -uz) };
  }
  /** The owner: "mark it on the map in game and make it visible when travelling the overworld" - a purple waypoint on
   *  the camp, followed (the Overworld keeps a followed waypoint on the screen's edge), laid once a device; one removed
   *  stays removed. */
  function markCamp(sp) {
    if (store.get(CAMP_MARK_KEY) === '1') return;
    const mx = sp.px + sp.nyx[0] / PIXEL_M, my = sp.py + 1 - sp.nyx[1] / PIXEL_M;
    try {
      const r = addWaypoint({ kind: 'personal', mx, my, name: t('nyx.campMark', 'Guild Camp (Nyx)'), color: 'purple' });
      if (r?.waypoint) { setWaypointFollowed(r.waypoint.id, true); store.set(CAMP_MARK_KEY, '1'); }
    } catch (e) { console.warn('[nyx] the camp mark', e?.message ?? e); }
  }
  /** The courts' posts, marked once a device on the Overworld map (a followed camp is the one kept in view; these are plain
   *  marks, the owner's to remove). The same pixels the zone map's pennants stand on. */
  const COURT_MARK_KEY = 'bunnyfall.courts.marks';
  function markCourts() {
    if (store.get(COURT_MARK_KEY) === '1') return;
    const mask = wildMaskOf(maps);
    const posts = courtPosts(mask);
    if (!posts.length) return;
    try {
      for (const p of posts) addWaypoint({ kind: 'personal', mx: p.x, my: p.y, name: p.court.name, color: p.court.wp });
      store.set(COURT_MARK_KEY, '1');
    } catch (e) { console.warn('[courts] the posts\' marks', e?.message ?? e); }
  }
  let at = null, batch = null, art = null, artLoading = false, tent = null, tentLoading = false, tentMat = null, box = null;
  function loadArt() {
    if (art || artLoading || !renderer?.createBillboardBatch || typeof fetch !== 'function') return;
    artLoading = true;
    fetch(bunnyNpcArtUrl('nyx')).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => decodePng(new Uint8Array(b))).then((img) => {
        renderer.uploadTexture(NYX_ARCHIVE, NYX_RECORD, toColor32(img));
        art = { w: (NYX_H * img.width) / img.height, h: NYX_H };
      }).catch((e) => { art = { failed: true }; console.warn('[nyx] her picture would not load', e?.message ?? e); });
  }
  function loadTent() {
    if (tent || tentLoading || !meshes?.getGpuMesh) return;
    tentLoading = true;
    Promise.resolve(meshes.getGpuMesh(TENT_MODEL)).then((gpu) => { tent = { gpu: gpu ?? null }; }).catch(() => { tent = { gpu: null }; });
  }
  /** The camp's scatter, about its pixel's centre (m): CAMP_TENTS tents on the side away from the road, CAMP_GUARDS guards
   *  round Nyx - made once a site, off a small fixed generator seeded by its pixel. */
  let layout = null;
  function campLayout() {
    if (layout) return layout;
    let seed = (site.px * 73856093) ^ (site.py * 19349663);
    const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const ux = site.nyx[0] - PIXEL_M / 2, uz = site.nyx[1] - PIXEL_M / 2, base = Math.atan2(ux, uz);
    const tents = [];
    for (let i = 0; i < CAMP_TENTS; i++) {
      const a = base + (i / (CAMP_TENTS - 1) - 0.5) * 2.6 + (rnd() - 0.5) * 0.25, r = 18 + rnd() * 20;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      tents.push({ x, z, yaw: Math.atan2(-x + ux, -z + uz) + (rnd() - 0.5) * 0.6 });   // facing the camp's middle, a little askew
    }
    const guards = [];
    // the owner: "not in a circle around her, spread them a bit through the camp" - each by a tent of its own, a few metres
    // to its side (a tent every other one), and one at the camp's road side
    for (let i = 0; i < CAMP_GUARDS; i++) {
      const tn = tents[(i * 2 + 1) % tents.length], a = rnd() * Math.PI * 2, r = 4 + rnd() * 3;
      guards.push(i === 0 ? { x: ux * 0.3 + (rnd() - 0.5) * 4, z: uz * 0.3 + (rnd() - 0.5) * 4 } : { x: tn.x + Math.sin(a) * r, z: tn.z + Math.cos(a) * r });
    }
    return (layout = { tents, guards });
  }
  /** The guards: the city watch's knight, standing - one billboard each, on the ground where they stand. */
  let guardTex = null, guardLoading = false;
  const guardBatches = [];
  function standGuards(cx, cz) {
    if (!guardTex && !guardLoading && deps.getTexture) {
      guardLoading = true;
      const archive = ENEMY_BASICS[KNIGHT_CITY_WATCH]?.maleTexture;
      Promise.resolve(archive ? deps.getTexture(archive) : null).then((tex) => { guardTex = tex ? { tex, archive } : { failed: true }; }, () => { guardTex = { failed: true }; });
    }
    if (!guardTex?.tex || !renderer?.createBillboardBatch) return;
    const rec = IDLE_ANIMS[0].record;
    if (!renderer.textures?.has?.(`${guardTex.archive}_${rec}#0`)) deps.uploadRecordFrame?.(guardTex.archive, rec, 0);
    const sz = mobileBillboardSize(guardTex.tex, rec);
    const L = campLayout().guards;
    for (let i = 0; i < L.length; i++) {
      let b = guardBatches[i];
      if (!b) { b = guardBatches[i] = renderer.createBillboardBatch(guardTex.archive, `${rec}#0`, { w: sz.w, h: sz.h }, [[0, 0, 0]]); b.origin = [0, 0, 0]; }
      const x = cx + L[i].x, z = cz + L[i].z, y = deps.heightAt(x, z);
      b.origin[0] = x; b.origin[1] = Number.isFinite(y) ? y : at.feet[1]; b.origin[2] = z;
    }
  }
  const tentMats = [];
  let courtTried = 0;
  function campFrame() {
    if (store.get(COURT_MARK_KEY) !== '1' && performance.now() > courtTried) { courtTried = performance.now() + 15000; markCourts(); }
    if (!site && performance.now() > siteTried) { site = findSite(); siteTried = performance.now() + 10000; if (site) markCamp(site); }
    at = null;
    if (!site || deps.mode?.() !== 'exterior') return;
    const tr = deps.pixelTranslation(site.px, site.py);
    if (!tr) return;
    const nx = tr[0] + site.nyx[0], nz = tr[2] + site.nyx[1], tx = tr[0] + site.tent[0], tz = tr[2] + site.tent[1];
    const ny = deps.heightAt(nx, nz), ty = deps.heightAt(tx, tz);
    if (!Number.isFinite(ny)) return;   // her pixel not built
    const f = deps.feet?.();
    if (f && Math.hypot(f[0] - nx, f[2] - nz) > 900) return;
    at = { feet: [nx, ny, nz], tent: [tx, Number.isFinite(ty) ? ty : ny, tz] };
    loadArt(); loadTent();
    if (art?.w && !batch) {
      batch = renderer.createBillboardBatch(NYX_ARCHIVE, NYX_RECORD, { w: art.w, h: art.h }, [[0, 0, 0]]);
      batch.origin = [0, 0, 0];
    }
    if (batch) { batch.origin[0] = nx; batch.origin[1] = ny; batch.origin[2] = nz; }
    tentMat = trs(at.tent[0], at.tent[1], at.tent[2], 0, (site.yaw * 180) / Math.PI, 0);
    // the owner: "add like a dozen more random tents and npcs guarding the area" - the camp's tents on the side away from
    // the road, and the Guild's guards round Nyx, the same on every machine (a fixed scatter off the camp's own pixel)
    const cx = tr[0] + PIXEL_M / 2, cz = tr[2] + PIXEL_M / 2;
    tentMats.length = 0;
    for (const p of campLayout().tents) {
      const x = cx + p.x, z = cz + p.z, y = deps.heightAt(x, z);
      if (Number.isFinite(y)) tentMats.push(trs(x, y, z, 0, (p.yaw * 180) / Math.PI, 0));
    }
    standGuards(cx, cz);
    box = [{ key: 'nyx:camp', aabb: { min: [nx - 0.5, ny, nz - 0.5], max: [nx + 0.5, ny + NYX_H, nz + 0.5] }, distance: RAY_DISTANCE, reach: NYX_REACH, noSurface: false }];
  }

  // ── HER SHOP ──────────────────────────────────────────────────────────────────────────────────────────────────
  let busy = false;
  const nyxTitles = () => INSIGNIA.filter((o) => o.currency === 'nyx');
  const titleRows = () => {
    const w = deps.wardrobe?.() ?? { held: [], title: null, aura: null };
    return nyxTitles().map((o) => ({
      id: o.id, key: o.key, kind: o.kind, name: (o.kind === 'aura' ? AURA_TEXT : TITLE_TEXT)[o.key] ?? o.key, price: o.price, owned: (w.held ?? []).includes(o.id), worn: o.kind === 'aura' ? w.aura === o.key : w.title === o.key,
      locked: o.key === 'heartwarden' && store.get(HEART_KEY) !== '1' ? t('nyx.heartLocked', 'Stand ten minutes on the haze counter in the Heart first') : null,
    }));
  };
  function buy(id) {
    if (!at) return { ok: false, text: t('nyx.away', 'Nyx is not here.') };
    const offer = [...NYX_GEAR, ...NYX_GARMENTS].find((o) => o.id === id);
    const items = deps.items?.();
    if (!offer || !items) return { ok: false, text: t('nyx.gone', 'Nyx does not sell that.') };
    const r = nyxSale(offer, { items, gender: deps.gender?.() ?? 'male', canCarry: (it) => deps.canCarry?.(it) ?? true });
    if (r.reason === 'heavy') return { ok: false, text: t('nyx.heavy', 'You cannot carry that.') };
    if (r.ok) { deps.clink?.(); deps.saved?.(); }
    return r;
  }
  async function buyTitle(id) {
    const o = nyxTitles().find((x) => x.id === id);
    const io = deps.io?.();
    if (!o) return { ok: false, text: t('nyx.gone', 'Nyx does not sell that.') };
    if (!io) return { ok: false, text: t('nyx.signIn', 'Sign in and go online to buy a title.') };
    const row = titleRows().find((x) => x.id === id);
    if (row?.locked) return { ok: false, text: row.locked };
    const items = deps.items?.() ?? [];
    if (nyxCoinsHeld(items) < o.price) return { ok: false, text: t('nyx.short', 'You need {coins}.', { coins: nyxCoinsText(o.price) }) };
    if (busy) return { ok: false, text: t('nyx.busy', 'Nyx is busy.') };
    busy = true;
    try {
      let r = await buyInsignia(io, o.id);
      // the account's count lags the pack (coins found before the service heard of them, or while it was away): the pack is
      // the game's word, so the gap is reported and the sale asked again, once
      if (!r?.ok && r?.error === 'short') {
        const tot = await nyxTotal(io).catch(() => null);
        const mine = tot?.ok ? tot.data?.mine : null;
        let gap = mine ? o.price - Math.max(0, (Number(mine.found) || 0) - (Number(mine.spent) || 0)) : 0;
        while (gap > 0) { const n = Math.min(5, gap); const f = await nyxFound(io, n).catch(() => null); if (!f?.ok) break; gap -= n; }
        if (mine && gap <= 0) r = await buyInsignia(io, o.id);
      }
      if (!r?.ok) return { ok: false, text: r?.error === 'owned' ? t('nyx.ownedAlready', 'Your account already owns that.') : r?.error === 'short' ? t('nyx.unheard', 'The Guild has not counted enough of your coins yet. Try again in a moment.') : t('nyx.failed', 'Nyx could not sell that right now.') };
      spendNyxCoins(items, o.price);
      deps.adopt?.(r.data);
      deps.clink?.(); deps.saved?.();
      return { ok: true, text: t('nyx.sold', 'Bought: {name}, for {coins}.', { name: (o.kind === 'aura' ? AURA_TEXT : TITLE_TEXT)[o.key] ?? o.key, coins: nyxCoinsText(o.price) }) };
    } catch { return { ok: false, text: t('nyx.failed', 'Nyx could not sell that right now.') }; } finally { busy = false; }
  }
  async function wearTitle(id) {
    const row = titleRows().find((x) => x.id === id);
    const io = deps.io?.();
    if (!row?.owned || !io) return { ok: false, text: t('nyx.notOwned', 'Your account does not own that.') };
    if (busy) return { ok: false, text: t('nyx.busy', 'Nyx is busy.') };
    busy = true;
    try {
      const want = row.worn ? null : row.key;
      const r = row.kind === 'aura' ? await equipAura(io, want) : await equipTitle(io, want);
      if (!r?.ok) return { ok: false, text: t('nyx.failed', 'Nyx could not sell that right now.') };
      deps.adopt?.(r.data); deps.self?.(r.data, io.secret);
      return { ok: true, text: want ? t('nyx.wearing', 'Wearing {name}.', { name: row.name }) : t('nyx.takenOff', '{name} taken off.', { name: row.name }) };
    } catch { return { ok: false, text: t('nyx.failed', 'Nyx could not sell that right now.') }; } finally { busy = false; }
  }
  let win = null;
  function open() {
    if (win && !win.done) return;
    win = createNyxOverlay({
      purse: () => nyxCoinsHeld(deps.items?.() ?? []),
      gear: () => NYX_GEAR.map((g) => ({ id: g.id, name: g.name, brief: `${g.power.name}: ${g.power.brief}`, price: g.price })),
      garments: () => NYX_GARMENTS.map((g) => ({ id: g.id, name: g.name, price: g.price })),
      titles: titleRows, buy, buyTitle, wearTitle, busy: () => busy,
      load: () => deps.loadWardrobe?.(),
      onClose: () => { win = null; },
    });
    if (win) deps.show?.(win);
  }

  // ── /nyxcoin ──────────────────────────────────────────────────────────────────────────────────────────────────
  /** A chat line: `/nyxcoin` - how many Dusk Tokens the realm has gathered. True when it was the command. */
  function command(text, out) {
    if (!/^\/nyxcoins?$/i.test(String(text ?? '').trim())) return false;
    const io = deps.io?.();
    if (!io) { out(t('nyx.cmdOffline', 'Sign in to read the Dusk Token count.')); return true; }
    nyxTotal(io).then((r) => {
      if (!r?.ok) { out(t('nyx.cmdFailed', 'The Dusk Token count could not be read.')); return; }
      const d = r.data ?? {};
      out(t('nyx.cmd', 'Dusk Tokens gathered: {total} by {players, plural, one {# adventurer} other {# adventurers}} ({spent} spent on titles). Yours: {mine}. In your pack: {pack}.',
        { total: d.total ?? 0, players: d.players ?? 0, spent: d.spent ?? 0, mine: d.mine?.found ?? 0, pack: nyxCoinsHeld(deps.items?.() ?? []) }));
    }, () => out(t('nyx.cmdFailed', 'The Dusk Token count could not be read.')));
    return true;
  }

  /** CAMP-POST: the camp's map point, for the map's own post beside the courts' (a waypoint is the player's to remove; this stays). Found once. */
  let _campPt = null;
  function campPoint() {
    if (_campPt) return _campPt;
    const sp = site ?? findSite();
    if (sp) _campPt = { x: sp.px + sp.nyx[0] / PIXEL_M, y: sp.py + 1 - sp.nyx[1] / PIXEL_M };
    return _campPt;
  }

  return {
    frame, fog, command,
    /** The Guild camp's post `[{ court: { css, name }, x, y }]` for the held map (empty until its pixel is known). */
    campPosts: () => { try { const p = campPoint(); return p ? [{ court: { css: '#9b4dff', name: t('nyx.campMark', 'Guild Camp (Nyx)') }, x: p.x, y: p.y }] : []; } catch { return []; } },
    /** The cannon alone, for a game with no online frame to carry it (it stands offline too; only its build and its gifts need the service). */
    cannonFrame() { try { cannon.frame(); } catch (e) { console.warn('[cannon]', e?.message ?? e); } },
    /** The cannon's shot, its flash and smoke, for the particle pass (null with none). */
    particles: () => cannon.particles(),
    /** Nyx's billboard, for the host's flats. */
    batches: () => [...(at ? [...(batch ? [batch] : []), ...guardBatches] : []), ...(deps.poiNpcs?.()?.batches() ?? [])],
    /** The Guild's tent, in the host's world pass. */
    draw(r = renderer) { const c = cannon.draw(r); if (!at || !tent?.gpu || !tentMat || !r?.drawMesh) return c; r.drawMesh(tent.gpu, tentMat, null); for (const m of tentMats) r.drawMesh(tent.gpu, m, null); return c + 1 + tentMats.length; },
    /** The eye's box on her. */
    targets: () => [...(at && box ? box : []), ...cannon.targets(), ...(deps.poiNpcs?.()?.targets() ?? [])],
    hoverName: (key) => cannon.hoverName(key) ?? deps.poiNpcs?.()?.hoverName(key) ?? (key === 'nyx:camp' && at ? { title: 'Nyx', subs: [t('nyx.hover', 'Adventurers\' Guild · Trades in Dusk Tokens')] } : null),
    /** A press on her: Info names her, anything else opens her window. */
    activate(key, mode = 'grab') {
      if (cannon.ours(key)) return cannon.activate(key, mode);
      if (deps.poiNpcs?.()?.ours(key)) return deps.poiNpcs().activate(key, mode);   // BUNNYFALL
      if (key !== 'nyx:camp' || !at) return false;
      if (mode === 'info') deps.say?.(t('nyx.info', 'You see Nyx, the Adventurers\' Guild\'s quartermaster. She trades in Dusk Tokens.'));
      else if (mode === 'steal') deps.say?.(t('nyx.steal', 'Nyx keeps a hand on her purse.'));
      else open();
      return true;
    },
    ours: (key) => key === 'nyx:camp' || cannon.ours(key) || !!deps.poiNpcs?.()?.ours(key),
    /** For the probes. */
    state: () => ({ site, at, haze: { on: clock.on, s: clock.seconds, mult: clock.mult }, owed, heart: heartS }),
    /** Death resets the haze. */
    died() { clock.reset(); setHazeMult(1); },
    get hazeOn() { return clock.on; },
  };
}
