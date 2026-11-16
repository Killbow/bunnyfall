// @ts-check
// BUNNYFALL: service over the room's existing NPCs. No new world host, no cursor while mixing.
import { createTavernShift, stepTavernShift, tavernOrder, tavernDoseCount, TAVERN_RECIPES, TAVERN_INGREDIENTS, TAVERN_BARDS_FACTION, TAVERN_SHIFT_MAX_S } from '../net/tavernServiceLaw.js';
import { tavernRecipeName, tavernIngredientName, tavernServiceError } from '../systems/tavern/tavernServiceWords.js';
import { createTavernServiceHud } from '../ui/tavernServiceHud.js';
import { t } from '../systems/textManager.js';
import { addGoldPieces } from '../systems/inventory.js';
import { changeReputation } from '../systems/faction/factionRep.js';
import { bunnyMembershipOf } from '../systems/guild/bunnyMembership.js';

/** @param {any} deps */
export function createTavernServiceHost(deps) {
  let state = null, version = 0, busy = false, pending = null, observed = null;
  const hud = createTavernServiceHud();
  const now = deps.now ?? (() => Date.now() / 1000);
  const id = (pn) => deps.npcId(pn);
  const people = () => deps.people().filter((p) => p.active !== false && !p.dead);
  const person = (key) => people().find((p) => id(p) === key);
  const name = (key) => { const p = person(key); return p ? deps.name(p) : t('tavern.service.customer', 'Customer'); };
  const live = () => !!state && state.where === deps.where() && state.phase !== 'done' && now() - state.started <= TAVERN_SHIFT_MAX_S;
  const txnId = () => globalThis.crypto?.randomUUID?.() ?? `ts${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  async function send(op, extra = {}) {
    if (busy) return;
    const where = deps.where();
    if (!where) return;
    busy = true;
    const request = pending ?? { op, ...extra, txn: txnId(), version, where, buildingKey: deps.buildingKey() };
    pending = request;
    const accept = (r) => {
      if (!r) return;
      if (r.version > version) {
        if (r.gold) addGoldPieces(deps.entity(), r.gold);
        if (r.rep && deps.entity()?.factionRep) changeReputation(deps.entity().factionRep, TAVERN_BARDS_FACTION, r.rep);
        if (r.gold) deps.say(t('tavern.service.paid', 'The house pays {gold} gold. Bards\' College reputation: +{rep}.', { gold: r.gold, rep: r.rep ?? 0 }));
        deps.saveSoon?.();
      }
      state = r.state; version = r.version; pending = null;
    };
    try {
      let r;
      if (deps.act) {
        const reply = await deps.act(request, (reply) => accept(reply.data));
        if (!reply?.ok) {
          if (!reply?.unknown) pending = null;
          if (reply?.error === 'tavern-version') { state = null; version = 0; observed = null; }
          deps.say(tavernServiceError(reply?.error)); return;
        }
        r = reply.data;
      } else if (op === 'start') {
        const m = bunnyMembershipOf('bards');
        r = { state: createTavernShift({ ...request, member: !!m, rank: m?.rank ?? 0, nowS: now(), seed: Math.floor(Math.random() * 0xffffffff) }), version: version + 1 };
      } else {
        const step = stepTavernShift(state, request, now());
        if ('error' in step) { pending = null; deps.say(tavernServiceError(step.error)); return; }
        r = { ...step, version: version + 1 };
      }
      if (!r) { deps.say(tavernServiceError('offline')); return; }
      accept(r);
      if (r.refused) deps.say(t('tavern.service.wrong', 'That is not the drink I ordered. Return to the innkeeper and discard it.'));
      if (state?.phase === 'done') deps.say(t('tavern.service.complete', 'Your service has ended. Completed orders: {n}. Earned: {gold} gold.', { n: state.index, gold: state.earned }));
    } catch { deps.say(t('tavern.service.retry', 'The answer was lost. Interact again to retry the same action.')); }
    finally { busy = false; }
  }
  function book(page = 0) {
    const recipes = TAVERN_RECIPES.slice(page * 3, page * 3 + 3);
    deps.choose({ lines: [t('tavern.service.book', "The Innkeeper's Recipe Book"), t('tavern.service.bookRule', 'Three doses per cup. Order does not matter. Discard a wrong mixture.'),
      ...recipes.flatMap((r) => [tavernRecipeName(r.id), TAVERN_INGREDIENTS.filter((k) => r[k]).map((k) => `${r[k]} ${tavernIngredientName(k)}`).join(' + ')])],
      options: [
        ...(page > 0 ? [{ code: 'ArrowLeft', label: t('tavern.service.previousPage', 'Previous page'), action: () => book(page - 1) }] : []),
        ...(page < 2 ? [{ code: 'ArrowRight', label: t('tavern.service.nextPage', 'Next page'), action: () => book(page + 1) }] : []),
        { code: 'Escape', label: t('tavern.service.closeBook', 'Close recipe book'), action: () => {} },
      ] });
  }
  const row = (key, label, run, disabled = false) => ({ id: `tservice:${key}`, label, run, disabled });
  function rows(pn) {
    if (!live() || busy) return [];
    const key = id(pn), order = tavernOrder(state);
    if (key === state.keeper) return [
      ...(['mix', 'carry'].includes(state.phase) ? [
        ...TAVERN_INGREDIENTS.map((ingredient) => row(ingredient, t('tavern.service.pour', 'Pour one dose: {ingredient}', { ingredient: tavernIngredientName(ingredient) }), () => send('pour', { target: key, ingredient }), state.phase !== 'mix' || tavernDoseCount(state.mix) >= 3)),
        row('carry', t('tavern.service.carry', 'Take the prepared cup'), () => send('carry', { target: key }), state.phase !== 'mix' || tavernDoseCount(state.mix) !== 3),
        row('discard', t('tavern.service.discard', 'Discard the mixture'), () => send('discard', { target: key }), !tavernDoseCount(state.mix)),
      ] : []),
      ...(state.phase === 'dirty' ? [row('return', t('tavern.service.return', 'Return the empty cup'), () => send('return', { target: key }))] : []),
      row('book', t('tavern.service.readBook', 'Read the recipe book'), () => book()),
      row('stop', t('tavern.service.stop', 'End this shift'), () => send('stop', { target: key })),
      row('talk', t('tavern.service.innServices', 'Inn services / talk'), () => {}),
    ];
    if (key !== order?.patron) return [];
    if (state.phase === 'carry') return [row('serve', t('tavern.service.serve', 'Serve the prepared drink'), () => send('serve', { target: key }))];
    if (state.phase === 'served') return [row('collect', t('tavern.service.collect', 'Collect the empty cup'), () => send('collect', { target: key }))];
    return [row('order', t('tavern.service.repeat', 'Repeat the order'), () => deps.say(t('tavern.service.request', '{name}: A {drink}, please.', { name: name(key), drink: tavernRecipeName(order.recipe) })))];
  }
  function start(keeper) {
    if (!deps.where() || busy) return;
    if (deps.online?.() && !deps.act) { deps.say(t('tavern.service.realmRequired', 'Load an online realm character before working a paid shift.')); return; }
    const patrons = people().filter((p) => p !== keeper && deps.patron(p)).slice(0, 24).map(id);
    if (!patrons.length) { deps.say(t('tavern.service.noPatrons', 'There are no available customers in this tavern.')); return; }
    send('start', { keeper: id(keeper), patrons });
  }
  return {
    innRows: (pn) => [{ code: 'KeyS', label: t('tavern.service.start', 'S - Work a tavern shift'), action: () => { Promise.resolve().then(() => start(pn)); } },
      { code: 'KeyR', label: t('tavern.service.recipeRow', 'R - Recipe book'), action: () => { Promise.resolve().then(() => book()); } }],
    activate(pn, selected = null) {
      if (pending && !busy) { send(pending.op); return true; }
      if (!live()) return false;
      if (busy && (id(pn) === state.keeper || id(pn) === tavernOrder(state)?.patron)) return true;
      const choices = rows(pn);
      if (!choices.length || selected === 'tservice:talk') return false;
      if (deps.plaque() && selected) {
        const found = choices.find((r) => r.id === selected);
        if (found && !found.disabled) found.run();
        return true;
      }
      // Touch/classic use the same actions as an explicit chooser; no invisible wheel selection.
      deps.choose({ lines: [deps.name(pn)], options: choices.filter((r) => !r.disabled).map((r, i) => ({ code: `Digit${i + 1}`, label: r.label, action: r.id === 'tservice:talk' ? () => deps.talk(pn) : r.run })) });
      return true;
    },
    hoverName(key) {
      if (!live() || typeof key !== 'string' || !key.startsWith('person:')) return null;
      const pn = deps.people()[Number(key.slice(7))];
      if (!pn) return null;
      const actions = rows(pn);
      if (!actions.length && !busy) return null;
      if (id(pn) !== state.keeper && id(pn) !== tavernOrder(state)?.patron) return null;
      return { title: deps.name(pn), subs: [id(pn) === state.keeper ? t('tavern.service.counter', 'Tavern service counter') : tavernRecipeName(tavernOrder(state).recipe)],
        actions: actions.map(({ id, label, disabled }) => ({ id, label, disabled })) };
    },
    frame(active, blocked) {
      if (!active) { observed = null; hud.dispose(); if (!deps.act) { state = null; pending = null; } return; }
      const where = deps.where();
      if (observed !== where && !busy && deps.act) {
        observed = where; busy = true;
        deps.act({ op: 'read', txn: txnId(), where, buildingKey: deps.buildingKey() }).then((r) => {
          if (r?.ok && !pending) { state = r.data.state; version = r.data.version; }
        }).catch(() => {}).finally(() => { busy = false; });
      }
      if (live() && !blocked) hud.frame(state, name, busy); else hud.hide();
    },
    dispose() { hud.dispose(); },
    draw: (renderer, canvas, font) => hud.draw(renderer, canvas, font),
  };
}
