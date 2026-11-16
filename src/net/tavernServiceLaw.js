// @ts-check
import { TAVERN_ROOM_EVENTS, tavernRoomOf, tavernRoomTip, tavernPatienceSeconds, resolveTavernRoom } from './tavernRoomLaw.js';
import { bardGoldMultiplier } from './tavernFavorLaw.js';
// BUNNYFALL: the same recipes and service state machine on the client and account service.
// A shift is personal; patrons are existing NPC identities, never a second population or a table index.
export const TAVERN_DOSES = 3;
export const TAVERN_ORDERS = 6;
export const TAVERN_ORDER_MIN_S = 20;
export const TAVERN_PATIENCE_S = 90;
export const TAVERN_STREAK_TIP = 5;
export const TAVERN_SHIFT_MAX_S = 3600;
export const TAVERN_BARDS_FACTION = 2002;
export const TAVERN_INGREDIENTS = Object.freeze(['wine', 'cream', 'beer']);
export const TAVERN_RECIPES = Object.freeze([
  { id: 'griffin', name: "Griffin's Oath", wine: 0, cream: 0, beer: 3 },
  { id: 'vigil', name: 'Last Vigil', wine: 3, cream: 0, beer: 0 },
  { id: 'smuggler', name: "Smuggler's Step", wine: 1, cream: 0, beer: 2 },
  { id: 'midnight', name: 'Midnight Pact', wine: 2, cream: 0, beer: 1 },
  { id: 'beggar', name: "Beggar's Crown", wine: 0, cream: 1, beer: 2 },
  { id: 'dibella', name: "Dibella's Veil", wine: 1, cream: 2, beer: 0 },
  { id: 'duchess', name: "Duchess's Kiss", wine: 2, cream: 1, beer: 0 },
  { id: 'pilgrim', name: "Pilgrim's Rest", wine: 0, cream: 2, beer: 1 },
  { id: 'secret', name: "Innkeeper's Secret", wine: 1, cream: 1, beer: 1 },
].map((r) => Object.freeze(r)));
/** @param {any} mix */
export const tavernDoseCount = (mix) => TAVERN_INGREDIENTS.reduce((n, k) => n + (mix?.[k] ?? 0), 0);
export const tavernEmptyMix = () => ({ wine: 0, cream: 0, beer: 0 });
/** @param {any} mix @param {string} id */
export const tavernMatches = (mix, id) => {
  const r = TAVERN_RECIPES.find((x) => x.id === id);
  return !!r && TAVERN_INGREDIENTS.every((k) => Number.isSafeInteger(mix?.[k]) && mix[k] === r[k]);
};
/** @param {any} state */
export const tavernOrder = (state) => state?.orders?.[state.index] ?? null;
/** @param {{ keeper: string, patrons: string[], where: string, rank?: number, member?: boolean, nowS: number, seed: number }} o */
export function createTavernShift({ keeper, patrons, where, rank = 0, member = false, nowS, seed }) {
  let s = seed >>> 0;
  const draw = (n) => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s >>> 8) % n; };
  const bag = TAVERN_RECIPES.map((r) => r.id);
  const orders = Array.from({ length: TAVERN_ORDERS }, () => ({
    patron: patrons[draw(patrons.length)], recipe: bag.splice(draw(bag.length), 1)[0], encounter: '',
  }));
  const encounters = TAVERN_ROOM_EVENTS.map((e) => e.id);
  for (const order of orders) order.encounter = encounters.splice(draw(encounters.length), 1)[0];
  return { room: tavernRoomOf(null), where, keeper, orders, index: 0, phase: 'mix', mix: tavernEmptyMix(), member, rank: Math.max(0, Math.min(9, Math.trunc(rank) || 0)),
    started: nowS, orderAt: nowS, streak: 0, bestStreak: 0, orderSpoiled: false, patient: true, wasted: 0, mistakes: 0, earned: 0 };
}
/** One immutable transition. The server supplies the clock and checks the revision separately.
 * @param {any} state @param {{ op: string, target?: string, ingredient?: string, choice?: string }} action @param {number} nowS */
export function stepTavernShift(state, action, nowS) {
  if (!state || !['mix', 'carry', 'served', 'dirty'].includes(state.phase)) return { error: 'tavern-no-shift' };
  if (nowS - state.started > TAVERN_SHIFT_MAX_S) return { error: 'tavern-expired' };
  const st = structuredClone(state);
  const order = tavernOrder(st);
  let gold = 0, rep = 0, favor = 0, localRep = 0, tip = 0, roomTip = 0, roomResult = null;
  const keeper = action.target === st.keeper;
  switch (action.op) {
    case 'room':
      if (action.target !== order?.patron) return { error: 'tavern-target' };
      roomResult = resolveTavernRoom(st, action.choice);
      if (!roomResult) return { error: 'tavern-action' };
      break;
    case 'stop': st.phase = 'done'; break;
    case 'pour':
      if (!keeper || st.phase !== 'mix' || !TAVERN_INGREDIENTS.includes(action.ingredient ?? '') || tavernDoseCount(st.mix) >= TAVERN_DOSES) return { error: 'tavern-action' };
      st.mix[action.ingredient]++; break;
    case 'discard':
      if (!keeper || !['mix', 'carry'].includes(st.phase) || !tavernDoseCount(st.mix)) return { error: 'tavern-action' };
      st.mix = tavernEmptyMix(); st.phase = 'mix'; st.wasted++; st.orderSpoiled = true; st.streak = 0; break;
    case 'carry':
      if (!keeper || st.phase !== 'mix' || tavernDoseCount(st.mix) !== TAVERN_DOSES) return { error: 'tavern-action' };
      st.phase = 'carry'; break;
    case 'serve':
      if (st.phase !== 'carry' || action.target !== order?.patron) return { error: 'tavern-target' };
      if (!tavernMatches(st.mix, order.recipe)) { st.mistakes++; st.orderSpoiled = true; st.streak = 0; return { state: st, gold, rep, refused: true }; }
      if (nowS - st.orderAt < TAVERN_ORDER_MIN_S) return { error: 'tavern-too-soon' };
      st.patient = nowS - st.orderAt <= tavernPatienceSeconds(st.room);
      st.phase = 'served'; break;
    case 'collect':
      if (st.phase !== 'served' || action.target !== order?.patron) return { error: 'tavern-target' };
      st.phase = 'dirty'; st.mix = tavernEmptyMix(); break;
    case 'return':
      if (!keeper || st.phase !== 'dirty') return { error: 'tavern-action' };
      gold = Math.round(20 * (st.member ? bardGoldMultiplier(st.rank) : 1));
      st.streak = st.patient && !st.orderSpoiled ? (st.streak ?? 0) + 1 : 0;
      st.bestStreak = Math.max(st.bestStreak ?? 0, st.streak);
      tip = Math.round(TAVERN_STREAK_TIP * Math.min(st.streak, 6) * (st.member ? bardGoldMultiplier(st.rank) : 1));
      roomTip = Math.round(tavernRoomTip(tavernRoomOf(st.room)) * (st.member ? bardGoldMultiplier(st.rank) : 1));
      gold += tip + roomTip;
      st.orderSpoiled = false; st.patient = true;
      st.earned += gold; st.index++; st.orderAt = nowS;
      st.phase = st.index >= st.orders.length ? 'done' : 'mix';
      if (st.phase === 'done') { favor = 1; localRep = 1; }
      if (st.phase === 'done' && st.member) rep = st.wasted === 0 && st.mistakes === 0 ? 2 : 1;
      break;
    default: return { error: 'tavern-action' };
  }
  return { state: st, gold, rep, favor, localRep, tip, roomTip, roomResult };
}
