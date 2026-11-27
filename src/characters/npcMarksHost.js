// @ts-check
import { NpcMarkRenderer, NPC_MARKS_MAX, markBob } from '../render/npcMarkPass.js';
import { staticNpcRoute } from '../guilds/guildServiceFlow.js';
import { hasCustomMerchantService } from '../guilds/guildServices.js';
import { isShop, isRepairShop } from '../trade/shopStock.js';
import { BUILDING_TYPES } from '../world/buildingNames.js';
import { isShelved } from '../systems/quest/quest.js';
import { getPref } from '../ui/uiPrefs.js';
import { createGuildForGroup } from '../guilds/guildVariants.js';
import { arenaGatePersonOf } from '../world/arenaCity.js';
import { ACTION_FLAGS } from '../world/rdbLayout.js';

export const NPC_MARKS_REACH = 30;
export const NPC_MARKS_FADE = 0.2;
export const MARK_OVER_HEAD_M = 0.2;
export const NPC_MARKS_CANDIDATES = 96;

export const npcMarksOn = () => getPref('npcMarks') !== false;

/**
 * @param {{ npcFactionId: number, dict: any, building?: any }} o
 */
export function staticNpcRouteIn({ npcFactionId, dict, building = null }) {
  const buildingFactionId = building?.factionId ?? 0;
  return staticNpcRoute(/** @type {any} */ ({
    npcFactionId,
    npcFaction: dict?.get(npcFactionId) ?? null,
    buildingFaction: buildingFactionId ? (dict?.get(buildingFactionId) ?? null) : null,
    buildingType: building?.buildingType ?? -1,
    insideBuilding: !!building,
    isShop,
    isRepairShop,
    isBank: (t) => t === BUILDING_TYPES.Bank,
    isTavern: (t) => t === BUILDING_TYPES.Tavern,
    hasCustomMerchantService,
  }));
}

/**
 * @param {any} route
 * @param {any} [dict]
 */
export function routeMark(route, dict = null) {
  if (route?.kind === 'merchant') return 'merchant';
  if (route?.kind === 'guildService') return createGuildForGroup(route.guildGroup, route.buildingFactionId, dict) ? 'service' : null;
  if (route?.kind === 'witchesCoven') return 'service';
  return null;
}

const ARENA_OFFICES = new Set(['herald', 'redRecruiter', 'blueRecruiter', 'bookmaker', 'pitMaster', 'hallKeeper']);
/** @param {any} holder */
export const arenaOfficer = (holder) => ARENA_OFFICES.has(holder?.arenaRole) || (holder?.position != null && ARENA_OFFICES.has(arenaGatePersonOf(holder)?.role));

/** @param {any} holder */
export function clickable(holder) {
  if ('width' in holder && !holder.width) return false;
  const flag = holder.action?.actionFlag;
  return flag !== ACTION_FLAGS.ShowText && flag !== ACTION_FLAGS.ShowTextWithInput;
}

/** @param {any} b */
export function questMarked(b) {
  if (!b || b.isComponentDestroyed) return false;
  const q = b.targetQuest ?? b.machine?.getQuest?.(b.questUID) ?? null;
  if (!q || q.questComplete || q.questBreak || isShelved(q)) return false;
  return (b.targetResource ?? q.getResource?.(b.targetSymbol) ?? null) != null;
}

/**
 * @param {any} holder
 * @param {{ dict: any, building?: any, offersWork?: (holder: any) => boolean }} ctx
 */
export function markKindOf(holder, ctx) {
  if (!holder || holder.active === false || holder.dead || !clickable(holder)) return null;
  if (arenaOfficer(holder)) return 'service';
  if (questMarked(holder.questBehaviour ?? holder.behaviour)) return 'quest';
  if (holder.factionID == null) return null;
  const custom = hasCustomMerchantService(holder.factionID);
  if (holder._mwMarkRoute === undefined || holder._mwMarkCustom !== custom) {
    const dict = ctx?.dict ?? null;
    if (!dict?.get(holder.factionID)) return null;
    holder._mwMarkRoute = routeMark(staticNpcRouteIn({ npcFactionId: holder.factionID, dict, building: ctx?.building ?? null }), dict);
    holder._mwMarkCustom = custom;
  }
  if (holder._mwMarkRoute) return holder._mwMarkRoute;
  return ctx?.offersWork?.(holder) ? 'quest' : null;
}

const phaseOf = (id) => {
  const s = String(id);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000;
};

const reducedMotionReader = () => {
  let at = -Infinity, reduced = false;
  return (nowS) => {
    if (nowS - at > 1) { at = nowS; try { reduced = !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches; } catch { reduced = false; } }
    return reduced;
  };
};

const SHARED = new WeakMap();
const takePass = (gl, build) => {
  let e = SHARED.get(gl);
  if (!e) {
    let pass = null;
    try { pass = build(gl); } catch (err) { console.warn('[npc-marks] the pass would not build', /** @type {any} */ (err)?.message ?? err); pass = null; }
    SHARED.set(gl, (e = { pass, users: 0 }));
  }
  e.users++;
  return e.pass;
};
const letPassGo = (gl) => {
  const e = SHARED.get(gl);
  if (!e || --e.users > 0) return;
  SHARED.delete(gl);
  e.pass?.dispose?.();
};

/**
 * @param {WebGL2RenderingContext | null} gl
 * @param {{ build?: (gl: any) => any, reduced?: (nowS: number) => boolean }} [o]
 */
export function createNpcMarks(gl, { build = (g) => new NpcMarkRenderer(g), reduced = reducedMotionReader() } = {}) {
  let pass = gl ? takePass(gl, build) : null;
  /** @type {any[]} */
  const holders = [];
  /** @type {string[]} */
  const kinds = [];
  let n = 0;
  /** @type {{ at: number[], kind: string, alpha: number, d: number }[]} */
  const marks = Array.from({ length: NPC_MARKS_MAX }, () => ({ at: [0, 0, 0], kind: 'quest', alpha: 0, d: 0 }));
  let shown = 0;
  const release = () => { for (let i = 0; i < n; i++) holders[i] = null; n = 0; };
  return {
    begin() { release(); },
    /**
     * @param {any} holder
     * @param {{ dict: any, building?: any }} ctx
     */
    consider(holder, ctx) {
      if (!pass || n >= NPC_MARKS_CANDIDATES || !npcMarksOn()) return;
      const kind = markKindOf(holder, ctx);
      if (!kind) return;
      holders[n] = holder; kinds[n] = kind; n++;
    },
    /**
     * @param {Iterable<any> | null | undefined} list
     * @param {{ dict: any, building?: any }} ctx
     */
    considerAll(list, ctx) { if (list && pass && npcMarksOn()) for (const h of list) this.consider(h, ctx); },
    /**
     * @param {{ dict: any, building?: any }} ctx
     * @param {Iterable<any> | null | undefined} people
     * @param {Iterable<any> | null} [stands]
     */
    gather(ctx, people, stands = null) { this.begin(); this.considerAll(people, ctx); this.considerAll(stands, ctx); },
    /**
     * @param {Float32Array} proj
     * @param {Float32Array} view
     * @param {ArrayLike<number>} eye
     * @param {{ heightOf?: (id: any) => number } | null | undefined} lane
     * @param {number} seconds
     */
    draw(proj, view, eye, lane, seconds) {
      shown = 0;
      if (!pass || !n || !lane?.heightOf || !npcMarksOn()) { release(); return false; }
      const still = reduced(seconds);
      for (let i = 0; i < n; i++) {
        const h = holders[i], id = h._mwActor?.id, feet = h._mwFeet;
        if (id == null || !feet) continue;
        const height = lane.heightOf(id);
        if (!(height > 0)) continue;
        const d = Math.hypot(feet[0] - eye[0], feet[1] + height - eye[1], feet[2] - eye[2]);
        if (!(d <= NPC_MARKS_REACH)) continue;
        if (shown === NPC_MARKS_MAX && marks[shown - 1].d <= d) continue;
        let at = shown < NPC_MARKS_MAX ? shown++ : NPC_MARKS_MAX - 1;
        const m = marks[at];
        while (at > 0 && marks[at - 1].d > d) { marks[at] = marks[at - 1]; at--; }
        marks[at] = m;
        m.d = d; m.kind = kinds[i];
        m.at[0] = feet[0]; m.at[1] = feet[1] + height + MARK_OVER_HEAD_M + markBob(seconds, phaseOf(id), still); m.at[2] = feet[2];
        const fadeFrom = NPC_MARKS_REACH * (1 - NPC_MARKS_FADE);
        m.alpha = d <= fadeFrom ? 1 : Math.max(0, (NPC_MARKS_REACH - d) / (NPC_MARKS_REACH - fadeFrom));
      }
      release();
      if (!shown) return false;
      pass.draw(marks, shown, proj, view, eye);
      return pass.drawn > 0;
    },
    shown() { return marks.slice(0, shown).map(({ at, kind, alpha }) => ({ at: [...at], kind, alpha })); },
    dispose() { release(); if (pass && gl) letPassGo(gl); pass = null; },
  };
}
