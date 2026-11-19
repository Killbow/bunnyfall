// @ts-check
// BUNNYFALL (2026-11-20, the owner: "you place a permanent npc there that is a noble for donation, the specific pos with /pos",
// "once the players reach that area the bar appears, the bar is also available in the notices of the realm"): THE SENTINEL
// GARRISON'S NOBLE. One envoy of Sentinel stands where the owner put him (net/sentinelLaw.js SENTINEL_NOBLE); a press on him
// opens the window where arms and armor are given for a side (ui/sentinelWindow.js), and within SENTINEL_NEAR_M of him the bar
// shows at the top of the screen. The count is kept by the account service (server-account/src/sentinel.js). A leaf the
// Cromwark host carries (scenes/cromwarkHost.js), as the cannon is, so the world host wires nothing new.
//
// His picture is public/art/bunnyfall-npcs/sentinel-noble.png when it exists; until then the city watch's knight stands in.
import { SENTINEL_NOBLE, SENTINEL_NEAR_M, SENTINEL_OFFERS, SENTINEL_DONOR_PIECES, sentinelNobleSite, sentinelWordText } from '../net/sentinelLaw.js';
import { sentinelStatus, sentinelGive, sentinelBuy } from '../net/accountClient.js';
import { sentinelPiece } from '../systems/sentinelShop.js';
import { createSentinelOverlay } from '../ui/sentinelWindow.js';
import { itemName } from '../ui/enhanced/enhancedArt.js';
import { isAmmunition } from '../systems/item/itemTemplates.js';
import { isEquipped } from '../systems/equip.js';
import { isBoundByNature } from '../systems/item/itemBound.js';
import { addItem } from '../systems/inventory.js';
import { decodePng } from '../systems/textureReplacement.js';
import { toColor32 } from '../formats/color32Order.js';
import { bunnyNpcArtUrl } from '../systems/bunnyNpcArt.js';
import { RAY_DISTANCE, STATIC_NPC_ACTIVATION_DISTANCE } from '../player/activate.js';
import { ENEMY_BASICS } from '../characters/enemy/enemyBasics.js';
import { IDLE_ANIMS } from '../characters/mobile/mobileUnit.js';
import { mobileBillboardSize } from '../world/rmbFlats.js';
import { KNIGHT_CITY_WATCH } from '../characters/mobile/mobileTypes.js';
import { t } from '../systems/textManager.js';

const KEY = 'sentinel:noble';
const ARCHIVE = 9930, RECORD = '0#0';
const POLL_S = 60, SEEN_M = 900;

/** A piece the noble may take: arms or armor in the pack that is not worn, bound or a quest's. */
export const giftable = (/** @type {any} */ it) => !!it && ((it.group === 'Weapons' && !isAmmunition(it)) || it.group === 'Armor')
  && !isEquipped(it) && !isBoundByNature(it) && it.questItem !== true;

/** @param {any} deps the Cromwark host's own (scenes/cromwarkHost.js) */
export function createSentinelHost(deps) {
  const { renderer = null } = deps;
  const site = sentinelNobleSite();
  const io = () => deps.io?.() ?? null;

  // ── THE BAR, AS THE SERVICE KEEPS IT ─────────────────────────────────────────
  /** @type {{ pct: { stay: number, leave: number } | null, dark: boolean, over: boolean, outcome: string | null, daysLeft: number, today: number, cap: number, given: number, tokens: number, donorAt: number } | null} */
  let status = null;
  let asking = false, nextAsk = 0, why = null;
  function heard(/** @type {any} */ r) {
    const d = r?.data ?? r;
    if (!r?.ok || !d) return;
    status = { pct: d.pct ?? null, dark: !!d.dark, over: !!d.over, outcome: d.outcome ?? null, daysLeft: Number(d.daysLeft) || 0, today: Number(d.mine?.today) || 0, cap: Number(d.mine?.cap) || 0,
      given: Number(d.mine?.given) || 0, tokens: Number(d.mine?.tokens) || 0, donorAt: Number(d.mine?.donorAt) || SENTINEL_DONOR_PIECES };
  }
  async function ask() {
    const i = io();
    if (!i) { why = t('sentinel.signInRead', 'Sign in and go online to see how the garrison stands.'); return; }
    if (asking) return;
    asking = true;
    try {
      const r = await sentinelStatus(i);
      if (r?.ok) { why = null; heard(r); } else why = t('sentinel.refused', 'The envoy cannot be reached ({error}). The server may need its update.', { error: r?.error ?? 'no answer' });
    } catch (e) { why = t('sentinel.refused', 'The envoy cannot be reached ({error}). The server may need its update.', { error: e?.message ?? 'no answer' }); } finally { asking = false; }
  }

  // ── THE BAR ON SCREEN, near him ──────────────────────────────────────────────
  let hud = null;
  function hudFrame(/** @type {boolean} */ near) {
    if (typeof document === 'undefined') return;
    if (!near || !status) { if (hud) hud.style.display = 'none'; return; }
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'sentinel-bar';
      hud.style.cssText = 'position:fixed;top:96px;left:50%;transform:translateX(-50%);z-index:6;pointer-events:none;width:min(420px,70vw);font:600 15px Georgia,serif;color:#fbe9d6;text-shadow:0 0 4px #000,0 0 8px #000;text-align:center';
      const label = document.createElement('div'); label.className = 'sb-label';
      const bar = document.createElement('div'); bar.style.cssText = 'display:flex;height:12px;margin-top:4px;border-radius:6px;overflow:hidden;background:rgba(0,0,0,0.55);border:1px solid rgba(0,0,0,0.7)';
      const a = document.createElement('i'); a.style.cssText = 'display:block;height:100%;background:#d9573a';
      const b = document.createElement('i'); b.style.cssText = 'display:block;height:100%;background:#5b86b8';
      bar.append(a, b); hud.append(label, bar); document.body.append(hud);
    }
    hud.style.display = '';
    const [label, bar] = /** @type {HTMLElement[]} */ ([hud.children[0], hud.children[1]]);
    const s = status;
    if (s.over) { label.textContent = s.outcome === 'stay' ? t('sentinel.overStay', 'The garrison has chosen to stay.') : s.outcome === 'leave' ? t('sentinel.overLeave', 'The garrison has gone home.') : t('sentinel.overDivided', 'The garrison has divided: some stay, some go.'); bar.style.display = 'none'; return; }
    if (!s.pct) { label.textContent = t('sentinel.hudDark', "Sentinel's warriors: the count is secret now"); bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    label.textContent = `${t('sentinel.hudStay', 'Stay {pct}%', { pct: s.pct.stay })}  ·  ${t('sentinel.hudLeave', 'Go home {pct}%', { pct: s.pct.leave })}`;
    /** @type {HTMLElement} */ (bar.children[0]).style.width = `${s.pct.stay}%`;
    /** @type {HTMLElement} */ (bar.children[1]).style.width = `${s.pct.leave}%`;
  }

  // ── STANDING HIM ─────────────────────────────────────────────────────────────
  let at = null, batch = null, box = null, art = null, artLoading = false, fall = null, fallLoading = false;
  function loadArt() {
    if (art || artLoading || !renderer?.createBillboardBatch || typeof fetch !== 'function') return;
    artLoading = true;
    fetch(bunnyNpcArtUrl('sentinel-noble')).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => decodePng(new Uint8Array(b))).then((img) => {
        renderer.uploadTexture(ARCHIVE, RECORD, toColor32(img));
        art = { w: (SENTINEL_NOBLE.h * img.width) / img.height, h: SENTINEL_NOBLE.h };
      }).catch(() => { art = { failed: true }; });   // no picture yet: the watch's knight stands in
  }
  function loadFall() {
    if (fall || fallLoading || !deps.getTexture) return;
    fallLoading = true;
    const archive = ENEMY_BASICS[KNIGHT_CITY_WATCH]?.maleTexture;
    Promise.resolve(archive ? deps.getTexture(archive) : null).then((tex) => { fall = tex ? { tex, archive } : { failed: true }; }, () => { fall = { failed: true }; });
  }
  function makeBatch() {
    if (art?.w) return renderer.createBillboardBatch(ARCHIVE, RECORD, { w: art.w, h: art.h }, [[0, 0, 0]]);
    if (art?.failed && fall?.tex) {
      const rec = IDLE_ANIMS[0].record;
      if (!renderer.textures?.has?.(`${fall.archive}_${rec}#0`)) deps.uploadRecordFrame?.(fall.archive, rec, 0);
      const sz = mobileBillboardSize(fall.tex, rec), k = SENTINEL_NOBLE.h / Math.max(0.01, sz.h);
      return renderer.createBillboardBatch(fall.archive, `${rec}#0`, { w: sz.w * k, h: SENTINEL_NOBLE.h }, [[0, 0, 0]]);
    }
    return null;
  }
  function frame() {
    const now = performance.now();
    if (now > nextAsk) { nextAsk = now + POLL_S * 1000; ask(); }
    at = null;
    if (deps.mode?.() !== 'exterior') { hudFrame(false); return; }
    const tr = deps.pixelTranslation?.(site.px, site.py);
    if (!tr) { hudFrame(false); return; }
    const x = tr[0] + site.x, z = tr[2] + site.z, y = deps.heightAt?.(x, z);
    if (!Number.isFinite(y)) { hudFrame(false); return; }   // his pixel not built
    const f = deps.feet?.() ?? deps.cam?.();
    const d = f ? Math.hypot(f[0] - x, f[2] - z) : Infinity;
    hudFrame(d <= SENTINEL_NEAR_M);
    if (d > SEEN_M) return;
    at = [x, y, z];
    loadArt();
    if (art?.failed) loadFall();
    if (!batch) { batch = makeBatch(); if (batch) batch.origin = [0, 0, 0]; }
    if (batch) { batch.origin[0] = x; batch.origin[1] = y; batch.origin[2] = z; }
    box = [{ key: KEY, aabb: { min: [x - 0.5, y, z - 0.5], max: [x + 0.5, y + SENTINEL_NOBLE.h, z + 0.5] }, distance: RAY_DISTANCE, reach: STATIC_NPC_ACTIVATION_DISTANCE, noSurface: false }];
  }

  // ── GIVING ───────────────────────────────────────────────────────────────────
  let busy = false, win = null;
  /** @type {Map<string, any>} key -> the piece, as the window last listed it */
  let held = new Map();
  function pieces() {
    const list = (deps.items?.() ?? []).filter(giftable);
    held = new Map(list.map((it, i) => [String(i), it]));
    return list.map((it, i) => ({ key: String(i), name: itemName(it) }));
  }
  async function give(/** @type {string} */ key, /** @type {'stay'|'leave'} */ side) {
    const i = io();
    if (!i) return { ok: false, text: t('sentinel.signIn', 'Sign in and go online to give to the envoy.') };
    if (busy) return { ok: false, text: t('sentinel.busy', 'The envoy is busy.') };
    const items = deps.items?.() ?? [];
    const it = held.get(key), at0 = it ? items.indexOf(it) : -1;
    if (!it || at0 < 0 || !giftable(it)) return { ok: false, text: t('sentinel.gone', 'You no longer have that piece.') };
    busy = true;
    items.splice(at0, 1);   // taken first, and put back if the service does not count it
    const back = () => { addItem(items, it); };
    try {
      const r = await sentinelGive(i, side, 1);
      const d = r?.data ?? r;
      if (!r?.ok || !Number(d?.taken)) { back(); return { ok: false, text: sentinelWordText(r?.error ?? d?.error ?? '') }; }
      deps.saved?.();
      heard(r);
      return { ok: true, text: side === 'stay'
        ? t('sentinel.thanksStay', 'The envoy takes it. The garrison will stand a little stronger.')
        : t('sentinel.thanksLeave', 'The envoy takes it. The garrison will travel a little lighter.') };
    } catch { back(); return { ok: false, text: t('sentinel.failed', 'The gift did not reach the envoy. Nothing was taken.') }; } finally { busy = false; }
  }
  // ── THE STORES: what Garrison Tokens buy ─────────────────────────────────────
  /** What each offer is, in a line (the window's note under its name). */
  const NOTE = Object.freeze(/** @type {Record<string, string>} */ ({
    'shards-5': 'Bound, like every Welkynd Shard.', 'shards-20': 'Bound, like every Welkynd Shard.',
    'envoys-signet': 'Ring. Imprint: Open Hand, spells cost less and hits restore magicka.',
    'garrison-wall': 'Shield. Imprint: Hold the Line, every blow on you is softened.',
    'banners-edge': 'Longsword. Imprint: Standard Raised, a chance to strike twice.',
    'garrison-ballista': 'Crossbow. Imprint: Crossfire, each bolt arcs on to a nearby foe as lightning.',
    'sunderers-bolt': "Crossbow. Imprint: Rampart Breaker, each hit's force splashes the foes about it.",
    'wardens-claymore': 'Claymore. Imprint: Last Rampart, kills heal you and it bites harder when you are low.',
    'oathkeepers-axe': 'War axe. Imprint: Cleave the Line, each hit splashes the foes about it.',
    'garrison-maul': 'Warhammer. Imprint: Momentum, every hit adds to the next, up to five times.',
    'quiet-oath': 'Dagger. Imprint: Envoy’s Kiss, poison on every hit, doubled on the wounded.',
    'tallow-staff': 'Staff. Imprint: Banked Embers, spells cost less and hits restore magicka.',
    'banners-bow': 'Longbow. Imprint: Hunter’s Standard, stronger at night and against animals.',
  }));
  const shop = () => SENTINEL_OFFERS.map((o) => ({ id: o.id, name: o.name, price: o.price, note: NOTE[o.id] ?? '' }));
  async function buy(/** @type {string} */ id) {
    const i = io();
    if (!i) return { ok: false, text: t('sentinel.signIn', 'Sign in and go online to give to the envoy.') };
    if (busy) return { ok: false, text: t('sentinel.busy', 'The envoy is busy.') };
    const items = deps.items?.() ?? [];
    const piece = sentinelPiece(id);
    if (!piece) return { ok: false, text: t('sentinel.noOffer', 'The envoy does not sell that.') };
    if (!(deps.canCarry?.(piece) ?? true)) return { ok: false, text: t('sentinel.heavy', 'You cannot carry that.') };   // asked before the price is taken
    busy = true;
    try {
      const r = await sentinelBuy(i, id);
      if (!r?.ok) { if (r?.data?.mine ?? r?.mine) heard({ ok: true, data: { ...(status ?? {}), mine: r.data?.mine ?? r.mine } }); return { ok: false, text: r?.error === 'sentinel-short' ? t('sentinel.short', 'You do not have the tokens for that yet.') : sentinelWordText(r?.error ?? '') }; }
      addItem(items, piece);
      deps.saved?.(); deps.clink?.();
      const d = r.data ?? r;
      if (status && d.mine) status = { ...status, given: Number(d.mine.given) || status.given, tokens: Number(d.mine.tokens) || 0 };
      return { ok: true, text: t('sentinel.bought', 'Bought: {name}.', { name: SENTINEL_OFFERS.find((o) => o.id === id)?.name ?? id }) };
    } catch { return { ok: false, text: t('sentinel.buyFailed', 'The envoy could not sell that just now. Nothing was taken.') }; } finally { busy = false; }
  }
  function open() {
    if (win && !win.done) return;
    win = createSentinelOverlay({
      name: SENTINEL_NOBLE.name, title: t('sentinel.title', "Sentinel's envoy"),
      status: () => (status ? { ...status } : null), pieces, give, shop, buy,
      busy: () => busy, load: () => ask(), why: () => why,
      onClose: () => { win = null; },
    });
    if (win) deps.show?.(win);
  }

  return {
    frame,
    batches: () => (at && batch ? [batch] : []),
    targets: () => (at && box ? box : []),
    hoverName: (key) => (key === KEY && at ? { title: SENTINEL_NOBLE.name, subs: [t('sentinel.hover', "Sentinel's envoy · Give arms and armor")] } : null),
    activate(key, mode = 'grab') {
      if (key !== KEY || !at) return false;
      if (mode === 'info') deps.say?.(t('sentinel.info', "You see {name}, an envoy of Sentinel. The warriors at the edge of the reach answer to him.", { name: SENTINEL_NOBLE.name }));
      else if (mode === 'steal') deps.say?.(t('sentinel.steal', 'His guards watch your hands.'));
      else open();
      return true;
    },
    ours: (key) => key === KEY,
    /** The garrison's bar for the realm's notices (ui/worldEventsBoard.js): or null before it is heard. */
    progress: () => (status ? { pct: status.pct, dark: status.dark, over: status.over, outcome: status.outcome, daysLeft: status.daysLeft } : null),
    ask: () => ask(),
  };
}
