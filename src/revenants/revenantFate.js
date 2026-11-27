// @ts-check
// A beaten revenant kneels instead of dying, and the player chooses to kill or spare it through the loot window.
// Online the choice belongs to its owner, and a peer sees it kneel and burn.
import { takenName, revenantHandBack, revenantById, revenantOn, revenantYielded, revenantExecuted, revenantSpared, revenantMomentEvent, revenantPortrait, revenantRankNumeral, revenantLastStand, revenantLastStandEvent, revenantEscapeTail } from './revenant.js';
import { revenantTrophy, trophyKindWords } from './revenantTrophy.js';
import { PERSONALITIES } from './revenantPersonality.js';
import { retinueHasRoom, swornPlace, REVENANT_RETINUE_MAX, setRetinuePlayer, holdSworn, swornWitness } from './revenantCompanions.js';
import { companionsWithYou, COMPANION_SLOTS } from '../characters/companionSlots.js';
import { enemyDisplayName } from '../characters/enemyBasics.js';
import { DISSOLVE_EMBER, DISSOLVE_ARCANE } from '../render/dissolve.js';
import { clearPlayerHarm } from '../combat/harmMark.js';
import { willMatters, willBroken, LAST_STAND_RANK, LAST_STAND_ROAR, PHASE_TWO, lastStandHealth, phaseTwo } from './revenantFeud.js';
import { endCraft, DREAD, dreadStandHealth } from './revenantUnquiet.js';
import { t } from '../ui/textManager.js';
import { noteAct } from '../systems/questlines/qlActs.js';

export const REVENANT_YIELD_MS = 90000;
export const REVENANT_YIELD_REACH = 60;
export const EXECUTION_MS = Object.freeze({ burst: 480, end: 1500 });
export const SPARING_MS = 900;

export function revenantMayYield(f) {
  const id = f?.entity?.revenant?.id;
  if (!id || f.puppet || f.companion != null || f.yielded || f.executing || f.sparing || !revenantOn()) return false;
  const r = revenantById(id);
  return !!r && !r.defeated && !r.sworn;
}

// A whole blow (Disintegrate, a whole-health strike, or a stat drained to zero) passes the last stand and the will
// only when it is the owner's own. It still kneels, so the kill-or-spare choice always stays.
export function ownersWholeKill(whole, { fromPlayer = false, peer = false } = {}) {
  return !!whole && !!fromPlayer && !peer;
}

export function revenantLastStandDue(f) {
  const id = f?.entity?.revenant?.id;
  if (!id || f._lastStood || f.puppet || f.companion != null || fateHeld(f) || !revenantOn()) return false;
  const r = revenantById(id);
  return !!r && !r.defeated && !r.sworn && (r.rank | 0) >= LAST_STAND_RANK;
}
export function beginLastStand(player, f, { now = Date.now(), clock = 0, roar = null, rolls = Math.random } = {}) {
  const e = f.entity;
  const r = revenantById(e?.revenant?.id);
  endCraft(f);
  f._stands = (f._stands | 0) + 1;
  // The Dread stands DREAD.STANDS times, so its latch sets only at the last one.
  f._lastStood = !(r?.dread && f._stands < DREAD.STANDS);
  f.fleeing = false;
  if (f.ai) f.ai.fleeLeft = 0;
  e.health = Math.max(1, Math.round((e.maxHealth || 1) * (r?.dread ? dreadStandHealth(f._stands, lastStandHealth(r.rank)) : lastStandHealth(r?.rank))));
  f.roaring = { at: now, until: now + LAST_STAND_ROAR * 1000 };
  // With no brain to roar (the Enhanced AI switch off), the motor is held and its swing raised for the roar.
  if (!(typeof roar === 'function' && roar(LAST_STAND_ROAR)) && f.ai) { f.ai.roarUntil = clock + LAST_STAND_ROAR; f.ai._blowHold = true; f._roarHeld = true; }
  if (!e.revenant?.p2) {
    e.revenant = { ...e.revenant, p2: phaseTwo() };
    e.damageScale = (Number.isFinite(e.damageScale) && e.damageScale > 0 ? e.damageScale : 1) * PHASE_TWO.BLOWS;
    if (e.stats) e.stats.speed = (e.stats.speed ?? 0) + PHASE_TWO.SPEED;
  }
  const rr = revenantLastStand(player, e);
  return rr ? revenantLastStandEvent(rr, player?.name, { archive: f.archive ?? f.mobileArchive ?? null, rolls }) : null;
}
export function roarStep(f, now = Date.now()) {
  if (f?.roaring && now >= f.roaring.until) {
    f.roaring = null;
    if (f._roarHeld) { f._roarHeld = false; if (f.ai) f.ai._blowHold = 'cancel'; }
  }
  return !!f?.roaring;
}
export const TEAR_MS = Object.freeze({ delay: 120, ms: 720 });
export function revenantWillHolds(f) {
  const r = revenantById(f?.entity?.revenant?.id);
  return !!r && !r.dread && willMatters(r.rank) && !willBroken(f.entity._feud);
}
export function beginTearAway(f, done, { now = Date.now() } = {}) {
  endCraft(f);
  f.fleeing = false;
  f._fleeRolled = true;
  if (f.entity) f.entity.health = 1;
  if (f.ai) { f.ai.target = null; f.ai.fleeLeft = 0; f.ai.velX = 0; f.ai.velZ = 0; }
  f.portalFx = { dir: 'out', at: now, delay: TEAR_MS.delay, ms: TEAR_MS.ms, tint: DISSOLVE_EMBER };
  f.leaving = { at: now, done };
}
export function beginYield(player, f, { now = Date.now(), rolls = Math.random } = {}) {
  endCraft(f);
  f.yielded = { at: now };
  f.fleeing = false;
  f._fleeRolled = true;
  if (f.entity) f.entity.health = 1;
  if (f.ai) { f.ai.target = null; f.ai.fleeLeft = 0; }
  // Poison from the player still ticking on it credits no one if it kills now.
  clearPlayerHarm(f.entity);
  setRetinuePlayer(player);
  const r = revenantYielded(player, f.entity);
  if (!r) return null;
  noteAct('revenant-knelt');
  f.trophy = revenantTrophy(r, { entity: f.entity, level: player?.level ?? 1, rolls });
  const ev = revenantMomentEvent('yield', r, player?.name, { body: 'Beaten, it awaits your judgment. Go to it to kill it or spare it.', archive: f.archive, rolls });
  f.yieldEvent = ev;
  return ev;
}
export function yieldStep(f, feet, dtMs = 0) {
  if (!f?.yielded) return null;
  const j = f.yielded.judging;
  // Enemy clocks run under an open window, so the wait and the walk-away pause while the choice is on screen.
  if (typeof j === 'function' ? j() : j) return null;
  f.yielded.held = (f.yielded.held ?? 0) + Math.max(0, Number(dtMs) || 0);
  if (f.yielded.held > REVENANT_YIELD_MS) return 'slip';
  if (feet && f.ai?.feet && Math.hypot(feet[0] - f.ai.feet[0], feet[2] - f.ai.feet[2]) > REVENANT_YIELD_REACH) return 'slip';
  return null;
}
export function slipEvent(player, r, { archive = null, rolls = Math.random } = {}) {
  return revenantMomentEvent('slip', r, player?.name, { body: `${t('rvn.unq.slip', 'You hesitated. {given} got away, and it will remember.', { given: r.given })}${revenantEscapeTail(r)}`, archive, rolls });
}
export function kneelPose(f, eye, now = Date.now()) {
  if (!f?.mobile?.heldPose || !f.ai) return f?._mout ?? null;
  const breath = ((now - (f.yielded?.at ?? f.executing?.at ?? 0)) % 1700) < 320;
  return f.mobile.heldPose('hurt', breath ? -2 : -1, f.ai.yaw, f.ai.feet, eye ?? f.ai.feet);
}

export function beginExecution(player, f, { now = Date.now(), rolls = Math.random } = {}) {
  const r = revenantById(f?.entity?.revenant?.id);
  f.yielded = null;
  f.executing = { at: now, burst: false, done: false };
  if (!r) return null;
  const drops = f.trophy ? `It drops ${f.trophy.name}.` : null;
  return revenantMomentEvent('executed', r, player?.name, { body: ['Executed.', drops].filter(Boolean).join(' '), archive: f.archive, rolls });
}
export function executionStep(f, now = Date.now()) {
  const x = f?.executing;
  if (!x) return null;
  const t = now - x.at;
  if (!x.burst && t >= EXECUTION_MS.burst) { x.burst = true; return 'burst'; }
  if (!x.done && t >= EXECUTION_MS.end) { x.done = true; return 'done'; }
  return null;
}
export function finishExecution(player, f) {
  revenantExecuted(player, f.entity);
  swornWitness(f.mobileType ?? f.entity?.mobileType);
  const items = [...(Array.isArray(f.entity?.items) ? f.entity.items : []), ...(f.trophy ? [f.trophy] : [])];
  f.trophy = null;
  // The items go to the pile, so the dead record never carries them a second time.
  if (f.entity) f.entity.items = [];
  return items;
}
// enemyTargets.js skips the same four states; keep the two lists in step.
export const fateHeld = (f) => !!(f && (f.yielded || f.executing || f.sparing || f.leaving));
export function dropFateHeld(list) {
  for (let i = list.length - 1; i >= 0; i--) if (fateHeld(list[i])) list.splice(i, 1);
  return list;
}

export function beginSpare(player, f, { now = Date.now(), rolls = Math.random } = {}) {
  if (!retinueHasRoom()) return null;
  setRetinuePlayer(player);
  const state = swornPlace();
  const r = revenantSpared(player, f.entity, { state });
  if (!r) return null;
  const back = revenantHandBack(player, r, f.entity);
  f.yielded = null;
  f.sparing = { at: now };
  if (state === 'with') holdSworn(r.id, SPARING_MS);
  const body = (state === 'with'
    ? `Sworn to you. ${r.given} walks at your side now.`
    : `Sworn to you. Your companions are full, so ${r.given} waits until you call it.`)
    + (back.length ? ` It hands back your ${back.map((it) => takenName(it)).join(' and ')}: "It's yours. It always was."` : '');
  return { r, state, event: revenantMomentEvent('spared', r, player?.name, { body, archive: f.archive, rolls }) };
}
export const spareDone = (f, now = Date.now()) => !!f?.sparing && now - f.sparing.at >= SPARING_MS;

export function fateDissolve(f, now = Date.now()) {
  if (f?.executing) {
    const t = now - f.executing.at - EXECUTION_MS.burst;
    return t > 0 ? [Math.min(1, t / (EXECUTION_MS.end - EXECUTION_MS.burst)), ...DISSOLVE_EMBER] : null;
  }
  if (f?.sparing) {
    const t = (now - f.sparing.at - 200) / (SPARING_MS - 200);
    return t > 0 ? [Math.min(1, t), ...DISSOLVE_ARCANE] : null;
  }
  const p = f?.portalFx;
  if (p) {
    const t = (now - p.at - p.delay) / p.ms;
    const tint = p.tint ?? DISSOLVE_ARCANE;
    if (p.dir === 'in') return t >= 1 ? null : [Math.max(0.001, 1 - Math.max(0, t)), ...tint];
    return t > 0 ? [Math.min(1, t), ...tint] : null;
  }
  return null;
}

export function fateModel(player, f, { choose } = /** @type {any} */ ({})) {
  const r = revenantById(f?.entity?.revenant?.id);
  if (!r) return null;
  const kind = enemyDisplayName(r.mobileType) ?? '';
  const trait = typeof r.trait === 'string' && r.trait ? r.trait.charAt(0).toUpperCase() + r.trait.slice(1) : null;
  const P = PERSONALITIES[r.personality] ?? null;
  const used = companionsWithYou();
  const room = retinueHasRoom();
  const free = used < COMPANION_SLOTS;
  const trophy = f.trophy ?? null;
  const ev = f.yieldEvent ?? null;
  return {
    kind: 'fate',
    id: r.id,
    name: r.name,
    given: r.given,
    rank: r.rank,
    sub: [`Rank ${revenantRankNumeral(r.rank)}`, kind, trait, r.elite ? 'Elite' : null].filter(Boolean).join(' · '),
    mood: P?.label ?? null,
    blurb: P?.blurb ?? null,
    plea: { speech: ev?.speech ?? null, body: ev?.speech ? null : ev?.body ?? null },
    portrait: revenantPortrait(r),
    trophy,
    slots: { used, max: COMPANION_SLOTS, free, room, retinueMax: REVENANT_RETINUE_MAX },
    options: [
      {
        id: 'kill', key: 'K', label: 'Kill', verb: 'Execute', tone: 'warn',
        title: `Kill ${r.given}`,
        detail: trophy ? `It drops ${trophy.name}: ${trophyKindWords(trophy)}` : 'It drops what it carried',
        confirm: `Destroy ${r.name}? It is gone for good${trophy ? `, and ${trophy.name} is yours` : ''}.`,
        disabled: false,
      },
      {
        id: 'spare', key: 'S', label: 'Spare', verb: 'Spare', tone: 'primary',
        title: `Spare ${r.given}`,
        detail: !room ? `You already have ${REVENANT_RETINUE_MAX} sworn. Release one first`
          : free ? `It joins you as a companion (${used + 1} of ${COMPANION_SLOTS})`
            : `It is sworn to you, and waits until you call it (your ${COMPANION_SLOTS} companion slots are full)`,
        confirm: free ? `Spare ${r.name}? It will walk at your side.` : `Spare ${r.name}? It will wait, sent away, until you call it.`,
        disabled: !room,
      },
    ],
    choose: (id) => choose?.(id),
    live: () => !!f.yielded && !f.dead,
  };
}
