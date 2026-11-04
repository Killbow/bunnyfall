// @ts-check
// BUNNYFALL (2026-11-04, the owner's "first big world change"): THE REACH OF CROMWARK, AS THE WORLD HOST WEARS IT - a
// module the host wires (HOST-SPLIT); the laws are systems/wild/cromwark.js's, the shop's systems/wild/nyxShop.js's.
//
//   THE HAZE: from the Passes inward a purple counter on the screen, the foes' blows on me growing +25% a minute
//     (combat/formulas.js reads hazeMult), reset when I leave the deep rings or die; the air purple (`fog`).
//   THE COINS: a kill of the reach's may drop a Nyx coin into my pack (1/3/6/12% by ring, Selantha's Ring +1%), and the
//     account service is told (server-account/src/nyx.js), so Nyx's titles are paid out of coins it knows of and
//     /nyxcoin can say how many were gathered.
//   THE CAMP: the Adventurers' Guild's tent on the road at the zone's south-east corner (the owner's spot), and Nyx before
//     it - her sprite (public/art/bunnyfall-npcs/nyx.png) - whose press opens her window (ui/nyxWindow.js).
import { cromwarkPeace, createHazeClock, setHazeMult, hazeClockText, HAZE_CSS, nyxCoinChance, NYX_RING_LUCK, CROMWARK_CAMP_UV } from '../systems/wild/cromwark.js';
import { setCromwarkMaps } from '../systems/wild/cromwarkTowns.js';
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
import { t } from '../systems/textManager.js';

/** A map pixel's side (m) - the pixel frame the camp is laid in (east, north from its south-west corner). */
const PIXEL_M = 819.2;
/** Nyx's sprite: its texture's place in the renderer's cache, and her height (m) - her width the picture's own share. */
export const NYX_ARCHIVE = 9910;
export const NYX_RECORD = '0#0';
export const NYX_H = 2.15;   // the owner: "shes supposed to be a bit of a taller lady" - a head over the townsfolk's ~1.8
/** Where she and the tent stand off the road's line (m), and how near a press reaches her. */
const NYX_OFF_M = 6, TENT_OFF_M = 12, NYX_REACH = STATIC_NPC_ACTIVATION_DISTANCE;
/** The account's coins not yet heard by the service, kept across a reload. */
const OWED_KEY = 'bunnyfall.nyx.owed';
const HEART_KEY = 'bunnyfall.nyx.heartWarden';
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
  const clock = createHazeClock();
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
    if (!foe?.wildFoe || !cromwarkPeace(deps.kind?.())) return;
    const luck = powerKind(deps.entity, 'nyxluck') ? NYX_RING_LUCK : 0;
    if (Math.random() >= nyxCoinChance(foe.wildRing || deps.ring?.() || 1, luck)) return;
    const items = deps.items?.();
    if (!items) return;
    giveNyxCoins(items, 1);
    owed++; store.set(OWED_KEY, String(owed));
    deps.clink?.();
    deps.say?.(t('cromwark.coin', 'A Nyx coin! You carry {coins}.', { coins: nyxCoinsText(nyxCoinsHeld(items)) }));
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
  function campFrame() {
    if (!site && performance.now() > siteTried) { site = findSite(); siteTried = performance.now() + 10000; }
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
      const r = await buyInsignia(io, o.id);
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
  /** A chat line: `/nyxcoin` - how many Nyx coins the realm has gathered. True when it was the command. */
  function command(text, out) {
    if (!/^\/nyxcoins?$/i.test(String(text ?? '').trim())) return false;
    const io = deps.io?.();
    if (!io) { out(t('nyx.cmdOffline', 'Sign in to read the Nyx coin count.')); return true; }
    nyxTotal(io).then((r) => {
      if (!r?.ok) { out(t('nyx.cmdFailed', 'The Nyx coin count could not be read.')); return; }
      const d = r.data ?? {};
      out(t('nyx.cmd', 'Nyx coins gathered: {total} by {players, plural, one {# adventurer} other {# adventurers}} ({spent} spent on titles). Yours: {mine}. In your pack: {pack}.',
        { total: d.total ?? 0, players: d.players ?? 0, spent: d.spent ?? 0, mine: d.mine?.found ?? 0, pack: nyxCoinsHeld(deps.items?.() ?? []) }));
    }, () => out(t('nyx.cmdFailed', 'The Nyx coin count could not be read.')));
    return true;
  }

  return {
    frame, fog, command,
    /** Nyx's billboard, for the host's flats. */
    batches: () => (at && batch ? [batch] : []),
    /** The Guild's tent, in the host's world pass. */
    draw(r = renderer) { if (!at || !tent?.gpu || !tentMat || !r?.drawMesh) return 0; r.drawMesh(tent.gpu, tentMat, null); return 1; },
    /** The eye's box on her. */
    targets: () => (at && box ? box : []),
    hoverName: (key) => (key === 'nyx:camp' && at ? { title: 'Nyx', subs: [t('nyx.hover', 'Adventurers\' Guild · Trades in Nyx coins')] } : null),
    /** A press on her: Info names her, anything else opens her window. */
    activate(key, mode = 'grab') {
      if (key !== 'nyx:camp' || !at) return false;
      if (mode === 'info') deps.say?.(t('nyx.info', 'You see Nyx, the Adventurers\' Guild\'s quartermaster. She trades in Nyx coins.'));
      else if (mode === 'steal') deps.say?.(t('nyx.steal', 'Nyx keeps a hand on her purse.'));
      else open();
      return true;
    },
    ours: (key) => key === 'nyx:camp',
    /** For the probes. */
    state: () => ({ site, at, haze: { on: clock.on, s: clock.seconds, mult: clock.mult }, owed, heart: heartS }),
    /** Death resets the haze. */
    died() { clock.reset(); setHazeMult(1); },
    get hazeOn() { return clock.on; },
  };
}
