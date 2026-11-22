// @ts-check
// One readout, two existing UI skins. Never a cursor surface or a separate theme.
// The carried cup is first-person art in the game's native viewport; it animates from the shift's own state changes
// (a dose poured, the cup lifted, handed over, refused or tipped out), so a reload or a reconnect never replays them.
import { t } from './textManager.js';
import { isEnhanced } from './uiSkin.js';
import { injectEnhancedStyle, injectEnhancedFonts } from './enhancedStyle.js';
import { nativeMetrics, shadowText, drawRect } from './nativePanel.js';
import { wrapText } from './talkWindow.js';
import { tavernRecipeName, tavernIngredientName } from '../trade/tavern/tavernServiceWords.js';
import { tavernRoomAvailable, tavernPatienceSeconds } from '../net/tavernRoomLaw.js';
import { tavernRoomMood } from '../trade/tavern/tavernRoomWords.js';
import { tavernOrder, tavernDoseCount, tavernOpenChores, TAVERN_DOSES, TAVERN_INGREDIENTS } from '../net/tavernServiceLaw.js';

const INK = { wine: [.53, .2, .25, 1], cream: [.86, .79, .64, 1], beer: [.76, .53, .16, 1] };
const PEWTER = [.62, .6, .55, 1], PEWTER_DARK = [.36, .34, .31, 1], HOOP = [.27, .25, .22, 1], INSIDE = [.16, .13, .1, 1];
const FOAM = [.93, .89, .78, 1];
const POUR_S = .45, HANDOFF_S = .55, RISE_S = .4, SHAKE_S = .45, TIP_S = .6, LIFT_S = .35, REWARD_S = 1.6;
const ease = (k) => 1 - (1 - k) ** 3;
const clamp01 = (k) => Math.max(0, Math.min(1, k));
/** The colour a mixture shows: each dose's ink weighted by its share. */
function mixInk(mix) {
  const n = tavernDoseCount(mix);
  if (!n) return INK.beer;
  const c = [0, 0, 0, 1];
  for (const k of TAVERN_INGREDIENTS) for (let i = 0; i < 3; i++) c[i] += INK[k][i] * (mix[k] ?? 0) / n;
  return c;
}

/** Shared model; inject only the skin predicate/document/clock for UI tests. @param {any} [options] */
export function createTavernServiceHud(options = {}) {
  const enhanced = options.enhanced ?? isEnhanced;
  const doc = options.document ?? globalThis.document;
  const clock = options.now ?? (() => (globalThis.performance?.now?.() ?? Date.now()) / 1000);
  let node = null, sig = '', visible = false, state = null, lines = [];
  // Animation memory: what the cup last showed and the moments its changes began.
  let seen = null, level = 0, levelFrom = 0, levelAt = -99, pourInk = null, pourAt = -99, liftAt = -99, handAt = -99,
    shakeAt = -99, tipAt = -99, tipInk = null, handInk = INK.beer, handFill = 0, reward = null, rewardNode = null;
  function ensure() {
    if (node || !doc) return;
    injectEnhancedStyle(doc); injectEnhancedFonts(doc);
    node = doc.createElement('section');
    // wplaque owns fonts, frame, colours and Enhanced Plus themes. Only placement is service-specific.
    node.className = 'wplaque tavern-service-hud'; node.setAttribute('aria-label', t('tavern.service.hud', 'Tavern service'));
    doc.body.append(node); sig = '';
  }
  function paintEnhanced() {
    if (!enhanced() || !visible) { node?.classList.remove('on'); if (node) node.hidden = true; return; }
    ensure(); if (!node) return;
    node.hidden = false; node.classList.add('on');
    const next = JSON.stringify(lines);
    if (sig === next) return; sig = next;
    node.replaceChildren();
    lines.forEach((line, i) => {
      const p = doc.createElement('div'); p.textContent = line;
      p.className = i === 1 || i === 2 ? 'wplaque-title' : 'wplaque-sub'; node.append(p);
    });
  }
  /** Turn the difference between two states into the cup's motions. */
  function observe(next) {
    const now = clock(), doses = tavernDoseCount(next.mix);
    if (!seen || seen.where !== next.where || seen.started !== next.started) {
      level = levelFrom = doses; levelAt = -99;
    } else {
      if (next.index > seen.index) { handAt = now; handInk = mixInk(seen.mix); handFill = seen.doses / TAVERN_DOSES; level = levelFrom = 0; levelAt = -99; }
      else if ((next.wasted ?? 0) > (seen.wasted ?? 0)) { tipAt = now; tipInk = mixInk(seen.mix); levelFrom = level; level = 0; levelAt = now; }
      else if (doses > seen.doses) {
        const poured = TAVERN_INGREDIENTS.find((k) => (next.mix[k] ?? 0) > (seen.mix[k] ?? 0)) ?? 'beer';
        pourInk = INK[poured]; pourAt = now; levelFrom = levelNow(now); level = doses; levelAt = now;
      } else if (doses !== level) { level = levelFrom = doses; levelAt = -99; }
      if ((next.mistakes ?? 0) > (seen.mistakes ?? 0)) shakeAt = now;
      if (next.phase === 'carry' && seen.phase !== 'carry') liftAt = now + (now - pourAt < POUR_S ? POUR_S - (now - pourAt) : 0);
    }
    seen = { where: next.where, started: next.started, index: next.index, wasted: next.wasted, mistakes: next.mistakes, phase: next.phase,
      doses, mix: { ...next.mix } };
  }
  const levelNow = (now) => levelFrom + (level - levelFrom) * ease(clamp01((now - levelAt) / POUR_S));
  /** The shown cup: a pewter tankard, low over the counter while mixing, raised while carried. */
  function drawCup(renderer, m) {
    const now = clock();
    const hand = now - handAt, carried = state.phase === 'carry';
    let x = 204, y = carried ? 140 : 152;
    if (carried) y -= 4 * Math.sin(Math.PI * clamp01((now - liftAt) / LIFT_S));
    x += Math.sin(now * 1.7) * (carried ? 1.2 : .6); y += Math.abs(Math.sin(now * 1.7)) * (carried ? 1 : .4);
    if (now - shakeAt < SHAKE_S) x += Math.sin((now - shakeAt) * 60) * 3 * (1 - (now - shakeAt) / SHAKE_S);
    let scale = 1;
    if (hand < HANDOFF_S) {
      // Handed over: the full cup moves forward to the customer and out of view, then an empty one comes up.
      const k = ease(hand / HANDOFF_S); x -= 50 * k; y -= 24 * k; scale = 1 - .55 * k;
      if (k > .95) return;
    } else if (hand < HANDOFF_S + RISE_S) {
      y += 60 * (1 - ease((hand - HANDOFF_S) / RISE_S));
    }
    const w = Math.round(22 * scale), h = Math.round(30 * scale), rx = Math.round(x), ry = Math.round(y);
    if (w < 6) return;
    const shown = hand < HANDOFF_S ? handFill : levelNow(now) / TAVERN_DOSES;
    // Pour: a stream from above the frame into the cup while the level rises.
    if (now - pourAt < POUR_S && pourInk) {
      const top = Math.max(0, ry - 34);
      drawRect(renderer, m, rx + Math.round(w / 2) - 1, top, 2, ry + h - 3 - Math.round(shown * (h - 7)) - top, pourInk);
    }
    // Handle, body, rim and hoops.
    drawRect(renderer, m, rx + w, ry + Math.round(6 * scale), Math.round(7 * scale), Math.round(15 * scale), PEWTER_DARK);
    drawRect(renderer, m, rx + w, ry + Math.round(9 * scale), Math.round(4 * scale), Math.round(9 * scale), [0, 0, 0, 0.55]);
    drawRect(renderer, m, rx, ry, w, h, PEWTER);
    drawRect(renderer, m, rx + 2, ry + 2, w - 4, h - 4, INSIDE);
    const fill = Math.round(clamp01(shown) * (h - 7));
    const ink = hand < HANDOFF_S ? handInk : mixInk(state.mix);
    if (fill > 0) {
      drawRect(renderer, m, rx + 2, ry + h - 2 - fill, w - 4, fill, ink);
      const ripple = Math.round(Math.sin(now * 5) * 2);
      drawRect(renderer, m, rx + 3 + Math.max(0, ripple), ry + h - 2 - fill, w - 7, 1, [Math.min(1, ink[0] + .2), Math.min(1, ink[1] + .2), Math.min(1, ink[2] + .2), 1]);
      if (fill >= h - 8 && (hand < HANDOFF_S || state.mix.beer)) drawRect(renderer, m, rx + 1, ry - 1, w - 2, 3, FOAM);
    }
    // Tipped out: the old mixture spills from the lip and the level drains.
    if (now - tipAt < TIP_S && tipInk) drawRect(renderer, m, rx - 3, ry + 3, 2, Math.round((1 - (now - tipAt) / TIP_S) * 40) + 4, tipInk);
    for (const band of [5, h - 7]) drawRect(renderer, m, rx, ry + Math.round(band * scale), w, Math.max(1, Math.round(2 * scale)), HOOP);
    drawRect(renderer, m, rx + 2, ry + 3, 1, h - 8, [1, 1, 1, .18]);
  }
  /** "+gold, +Favor" rising where the customer was handed the cup. */
  function drawReward(renderer, m, font) {
    if (!reward) return;
    const k = (clock() - reward.at) / REWARD_S;
    if (k >= 1) { reward = null; return; }
    if (enhanced() || !font?.fnt) return;
    const alpha = k < .15 ? k / .15 : 1 - Math.max(0, k - .6) / .4;
    shadowText(renderer, font, reward.text, m, 110, 92 - 22 * ease(k), { color: [1, .87, .5, alpha], shadow: [0, 0, 0, alpha * .8], align: 'center', w: 100 });
  }
  function showRewardNode(text) {
    if (!enhanced() || !doc?.body) return;
    rewardNode?.remove();
    const n = doc.createElement('div');
    n.className = 'wplaque on tavern-service-reward';
    n.setAttribute('aria-hidden', 'true');
    const line = doc.createElement('div'); line.className = 'wplaque-title'; line.textContent = text; n.append(line);
    // Placement only; the skin's plaque supplies the face and frame.
    Object.assign(n.style ?? {}, { left: '50%', top: '40%', transform: 'translate(-50%, 0)', pointerEvents: 'none', minWidth: '0' });
    doc.body.append(n); rewardNode = n;
    const done = () => { n.remove(); if (rewardNode === n) rewardNode = null; };
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (typeof n.animate === 'function' && !reduced) {
      n.animate([{ opacity: 0, transform: 'translate(-50%, 10px)' }, { opacity: 1, transform: 'translate(-50%, 0)', offset: .15 },
        { opacity: 1, transform: 'translate(-50%, -26px)', offset: .6 }, { opacity: 0, transform: 'translate(-50%, -44px)' }], { duration: REWARD_S * 1000, easing: 'ease-out' }).finished.then(done, done);
    } else setTimeout(done, REWARD_S * 1000);
  }
  return {
    /** @param {any} value @param {(id: string) => string} name @param {boolean} busy */
    frame(value, name, busy) {
      state = value; visible = !!state && state.phase !== 'done';
      if (!visible) { paintEnhanced(); return; }
      observe(state);
      const order = tavernOrder(state);
      lines = [t('tavern.service.shift', 'Service {n}/{total}', { n: state.index + 1, total: state.orders.length }),
        name(order.patron), tavernRecipeName(order.recipe),
        state.phase === 'mix' || state.phase === 'carry' ? t('tavern.service.contents', '{n}/3 doses: {mix}', { n: tavernDoseCount(state.mix), mix: Object.entries(state.mix).filter(([, n]) => n).map(([k, n]) => `${tavernIngredientName(k)} ${n}`).join(', ') || '-' }) : t('tavern.service.returnEmpty', 'Collect the empty cup and return it to the innkeeper.'),
        busy ? t('tavern.service.confirming', 'Confirming with the innkeeper...') : t('tavern.service.earned', 'Earned: {gold} gold', { gold: state.earned }),
        t('tavern.service.favorShift', 'Favor this shift: +{n}', { n: state.index })];
      const chores = tavernOpenChores(state);
      if (chores.length) {
        const tables = chores.filter((c) => c.kind === 'table').length, spills = chores.length - tables;
        lines.push(t('tavern.chore.waiting', 'To clean: {tables} tables, {spills} spills', { tables, spills }));
      }
      if (state.room) lines.push(tavernRoomMood(state.room));
      if (tavernRoomAvailable(state)) lines.push(t('tavern.room.available', 'Your last customer has an opening: Work the room.'));
      lines.push(t('tavern.service.streak', 'Perfect service streak: {n}', { n: state.streak ?? 0 }));
      if (state.phase === 'mix' || state.phase === 'carry') lines.push(t('tavern.service.patience', 'Customer patience: {s}s', { s: Math.max(0, Math.ceil(tavernPatienceSeconds(state.room) - (Date.now() / 1000 - state.orderAt))) }));
      paintEnhanced();
    },
    /** A payment landed: show what it was worth for a moment, over the room. */
    reward(gold, favor) {
      if (!gold && !favor) return;
      const text = [gold ? t('tavern.service.rewardGold', '+{gold} gold', { gold }) : '', favor ? t('tavern.service.rewardFavor', '+{n} Favor', { n: favor }) : ''].filter(Boolean).join('  ·  ');
      reward = { text, at: clock() };
      showRewardNode(text);
    },
    /** Classic uses the loaded bitmap font and standard shadow. Cup materials are world art, not UI chrome. */
    draw(renderer, canvas, font) {
      const m = nativeMetrics(canvas);
      drawReward(renderer, m, font);
      if (!visible) return;
      paintEnhanced();
      if (!enhanced() && font?.fnt) {
        let y = 24;
        for (const text of lines) for (const line of wrapText(font.fnt, text, 112)) {
          shadowText(renderer, font, line, m, 6, y); y += 9;
        }
      }
      // A legacy shift between handing over and collecting has no cup in hand.
      if (state.phase === 'served') return;
      drawCup(renderer, m);
    },
    hide() { visible = false; paintEnhanced(); },
    dispose() { node?.remove(); node = null; rewardNode?.remove(); rewardNode = null; reward = null; sig = ''; visible = false; state = null; lines = []; seen = null; },
  };
}
