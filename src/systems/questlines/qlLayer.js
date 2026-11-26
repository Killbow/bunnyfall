// @ts-check
import { startStamp, isStamped, observe, readObjectives, outcomeOf, outcomeNow, fallbackOutcome, questTierOf, holds, isCatchAll } from './qlLaw.js';
import { sheetFor } from './qlSheets.js';
import { scaleGold, goldFactor, goldStillOwed, rewardTier, payProfileOf, rollRewardChoice, rewardSeed, standingMovesOf } from './qlRewards.js';
import { isGoldPieces } from '../../items/inventory.js';
import { t, textRevision } from '../../ui/textManager.js';
import { createLineRunner } from './qlLineRunner.js';
import { noteFirstUse } from '../../ui/tutorials.js';

export const OFFERS_MAX = 12;

// The oldest offer that names no piece goes first, because a named piece comes once per line.
export function trimOffers(list) {
  const dropped = [];
  while (list.length > OFFERS_MAX) {
    const i = list.findIndex((o) => !o.pieces?.some((p) => p.named));
    dropped.push(...list.splice(i < 0 ? 0 : i, 1));
  }
  return dropped;
}

// The kind is part of the key because sheet ids are unique only within each list.
export const sheetTextKey = (sheet, kind, id, choice = null) => `${sheet?.quest}.${kind}.${id}${choice != null ? `.${choice}` : ''}`;

// `give pc nothing` counts as pay and a letter does not; cached because a script is fixed when parsed.
const _payers = new WeakMap();
function scriptPays(quest) {
  if (_payers.has(quest)) return _payers.get(quest);
  let pays = false;
  for (const task of quest?.tasks?.values?.() ?? []) {
    for (const a of task?.actions ?? []) {
      if (a.typeName === 'QlPaid' || a.typeName === 'TrainPc' || (a.typeName === 'GivePc' && (a.isNothing || quest.getItem?.(a.itemSymbol)?.itemName !== 'letter'))) { pays = true; break; }
    }
    if (pays) break;
  }
  _payers.set(quest, pays);
  return pays;
}
function gearOf(quest, sheet, o) {
  const pays = (x) => !x.failure && payProfileOf(x).gear;
  if (!(o ? pays(o) : (sheet.outcomes ?? []).some(pays))) return false;
  return !!(quest.ql.paid || quest.questSuccess || (!quest.questComplete && scriptPays(quest)));
}
const PLAIN = (_q, text, _key) => text;

/** @param {{ machine: any, questLists?: any, ctx?: any, service?: any, nowMs?: () => number }} deps */
export function createQuestlines({ machine, questLists = null, ctx = {}, service = null, nowMs = undefined }) {
  const probe = { carries: (r) => !!ctx.carriesQuestItem?.(r) };
  let offers = [];
  let nextOffer = 1;
  let golds = new Map();
  const rows = new WeakMap();
  const hasDoor = () => typeof ctx.offerReward === 'function';
  let history = {};
  const runner = createLineRunner({
    machine, service, nowMs,
    ctx: {
      level: () => ctx.playerEntity?.level ?? 1,
      online: () => !!ctx.online?.(),
      nowSeconds: () => ctx.nowSeconds?.() ?? 0,
      onHonour: (h) => ctx.onHonour?.(h),
      outcomeText: (quest) => layer.outcomeLine(quest, ctx.expand),
    },
  });

  const layer = {
    stamp(quest) {
      const st = startStamp();
      if (!st) return null;
      const meta = questLists?.findQuestMeta?.(quest?.questName) ?? null;
      // The Questlines tutorial waits for a quest the player takes, never one a new character starts on.
      if (sheetFor(quest?.questName) && !['S0000977', '_BRISIEN'].includes(quest?.questName) && meta?.scope !== 'init') noteFirstUse('questlines');
      st.tier = questTierOf({
        minReq: meta?.scope === 'init' ? null : meta?.quest?.minReq ?? null,
        social: meta?.scope === 'social',
        level: ctx.playerEntity?.level ?? 1,
        sheetTier: sheetFor(quest?.questName)?.tier ?? null,
      });
      return st;
    },

    look() {
      const news = [];
      for (const quest of machine.quests.values()) {
        if (!isStamped(quest) || quest.questTombstoned) continue;
        const sheet = sheetFor(quest.questName);
        if (!sheet) continue;
        const moved = observe(quest, sheet, probe);
        if (moved.done.length || moved.failed.length || moved.chose.length || moved.outcome) news.push({ quest, ...moved });
      }
      runner.look();
      return news;
    },

    rowOf(quest, expand = PLAIN) {
      if (!isStamped(quest)) return null;
      const sheet = sheetFor(quest.questName);
      if (!sheet) return null;
      // The journal reads every row ten times a second, so a row is reused while its inputs are unchanged.
      const kept = rows.get(quest);
      const rev = textRevision();
      if (kept && kept.ended && quest.questComplete && kept.rev === rev && kept.expand === expand) return kept.row;
      const read = readObjectives(quest, sheet, probe).filter((o) => o.state !== 'hidden');
      const o = outcomeOf(quest, sheet);
      const gear = gearOf(quest, sheet, o);
      let names = '';
      for (const r of quest.resources?.values?.() ?? []) if (r?.isPerson === true) names += `${r.displayName ?? ''}|`;
      const sig = `${rev}|${quest.ql.tier}|${read.map((x) => `${x.id}:${x.state}`).join(',')}|${JSON.stringify(quest.ql.choices)}|${o?.id ?? ''}|${gear}|${names}`;
      if (kept && kept.sig === sig && kept.expand === expand) {
        kept.ended = !!quest.questComplete;
        return kept.row;
      }
      const objectives = read.map((x) => ({ ...x, text: expand(quest, x.text, sheetTextKey(sheet, 'o', x.id)) }));
      const choices = (sheet.branches ?? []).filter((b) => quest.ql.choices[b.id]).map((b) => {
        const c = b.choices.find((x) => x.id === quest.ql.choices[b.id]);
        return { branch: b.id, text: expand(quest, b.text, sheetTextKey(sheet, 'b', b.id)), choice: c ? expand(quest, c.text, sheetTextKey(sheet, 'b', b.id, c.id)) : '' };
      });
      const row = {
        tier: quest.ql.tier, family: sheet.family ?? null, objectives, choices,
        outcome: o ? { id: o.id, text: expand(quest, o.text, sheetTextKey(sheet, 'r', o.id)), failure: !!o.failure } : null,
        gear,
      };
      rows.set(quest, { sig, rev, expand, row, ended: !!quest.questComplete });
      return row;
    },

    reward(quest, dfItem, resource = null) {
      if (!isStamped(quest)) return;
      if (resource?.itemName === 'letter') { runner.lettered(quest); return; }
      const sheet = sheetFor(quest.questName);
      if (sheet) observe(quest, sheet, probe);
      if (sheet && dfItem && !quest.ql.paid) {
        // Gold scales by the outcome holding now, not the latched one, because a quest may pay before it ends.
        const now = outcomeNow(quest, sheet, probe) ?? fallbackOutcome({ ...quest, questSuccess: true }, sheet);
        const scaled = scaleGold(dfItem, now, isGoldPieces(dfItem));
        if (scaled) golds.set(quest.uid, { base: scaled.before, factor: goldFactor(now), shares: Math.max(1, Math.trunc(quest.hooks?.rewardShares?.(quest) ?? 1) || 1) });
      }
      quest.ql.paid = true;
    },

    ending(quest) {
      if (!isStamped(quest) || quest.ql.moved) return null;
      const sheet = sheetFor(quest.questName);
      if (!sheet) return null;
      const merged = !!quest.ql.outcome;
      observe(quest, sheet, probe, { settle: true, ending: true });
      quest.ql.moved = true;
      const outcome = outcomeOf(quest, sheet);
      runner.ended(quest, outcome);
      if (outcome ? !outcome.failure : quest.questSuccess) history[String(quest.questName).toUpperCase()] = outcome?.id ?? 'done';
      const paidGold = golds.get(quest.uid);
      golds.delete(quest.uid);
      if (!outcome) return null;
      // Online, where the clock is shared, a failure costs no standing, matching the fail-free end of a quest.
      const failureFree = !!outcome.failure && !!quest.hooks?.sharedClock?.();
      if (!failureFree) for (const st of standingMovesOf(outcome)) ctx.changeReputation?.(st.factionId, st.amount, false);
      if (Number.isSafeInteger(outcome.legal) && outcome.legal !== 0) ctx.changeLegalRep?.(outcome.legal);
      const owed = goldStillOwed(paidGold, outcome);
      if (owed > 0) {
        quest.hooks?.addGold?.(owed);
        quest.hooks?.addHUDText?.(t('ql.reward.goldSettled', 'You receive {gold} more gold pieces for how it ended.', { gold: owed }));
      }
      if (!payProfileOf(outcome).gear || outcome.failure || !(quest.ql.paid || quest.questSuccess)) return null;
      // An outcome latched before the end (a party copy or an outcome line) pays no gear while a failure row holds.
      if (merged && sheet.outcomes.some((o) => o.failure && !isCatchAll(o) && holds(quest, o.on, probe))) return null;
      const tier = rewardTier(quest.ql.tier, outcome);
      const line = quest.questName;
      // A named piece is spent when taken, not when rolled, and a name a waiting offer holds is not rolled twice.
      const named = outcome.named && !history[`named:${line}`] && !offers.some((x) => x.questName === line && x.pieces.some((p) => p.named)) ? outcome.named : null;
      const pieces = rollRewardChoice({ seed: rewardSeed(quest), level: ctx.playerEntity?.level ?? 1, tier, entity: ctx.playerEntity ?? null, named });
      if (!pieces.length) return null;
      const offer = { id: nextOffer++, questName: quest.questName, title: quest.displayName || quest.questName, outcome: outcome.id, tier, pieces };
      offers.push(offer);
      const dropped = trimOffers(offers);
      for (const gone of dropped) ctx.onOfferDropped?.(gone);
      if (dropped.includes(offer)) return null;
      ctx.onQuestlineOffer?.(offer);
      return offer;
    },

    outcomeLine(quest, expand = PLAIN) {
      if (!isStamped(quest)) return null;
      const sheet = sheetFor(quest.questName);
      const o = sheet ? outcomeOf(quest, sheet) : null;
      return o ? expand(quest, o.text, sheetTextKey(sheet, 'r', o.id)) : null;
    },

    act(kind, n = 1) {
      if (typeof kind !== 'string' || !kind || !(n > 0)) return 0;
      let heard = 0;
      for (const quest of machine.quests.values()) {
        if (!isStamped(quest) || quest.questComplete || quest.questTombstoned || quest.shelvedAt != null) continue;
        quest.ql.acts[kind] = (quest.ql.acts[kind] ?? 0) + Math.floor(n);
        heard++;
      }
      return heard;
    },

    offers: () => (hasDoor() ? offers.map((o) => ({ ...o })) : []),

    take(id, index) {
      if (!hasDoor()) return null;
      const i = offers.findIndex((o) => o.id === id);
      if (i < 0) return null;
      const offer = offers[i];
      const piece = offer.pieces[index];
      if (!piece) return null;
      ctx.offerReward(null, piece.item);
      offers.splice(offers.indexOf(offer), 1);
      if (piece.named) history[`named:${offer.questName}`] = String(piece.item.name);
      return piece.item;
    },

    lineRows: () => runner.rows(),
    takeLine: (id, opts) => runner.takeLine(id, opts),
    history: () => ({ ...history }),
    runner,

    snapshot: () => ({
      offers: structuredClone(offers), nextOffer, lines: runner.snapshot(), history: { ...history },
      gold: Object.fromEntries([...golds].filter(([uid]) => machine.quests?.has?.(uid)).map(([uid, g]) => [uid, { ...g }])),
    }),
    restore(data) {
      runner.restore(data?.lines);
      history = {};
      if (data?.history && typeof data.history === 'object') for (const [k, v] of Object.entries(data.history)) if (typeof v === 'string' && /^(named:)?[A-Z0-9$_]{1,12}$/.test(k)) history[k] = v;
      offers = Array.isArray(data?.offers) ? data.offers.filter((o) => o && Number.isSafeInteger(o.id) && Array.isArray(o.pieces) && o.pieces.length).map((o) => structuredClone(o)) : [];
      trimOffers(offers);
      nextOffer = Math.max(Number.isSafeInteger(data?.nextOffer) ? data.nextOffer : 1, ...offers.map((o) => o.id + 1), 1);
      // The bridge restores the machine first, so only gold records for quests it holds are kept.
      golds = new Map();
      if (data?.gold && typeof data.gold === 'object') {
        for (const [k, g] of Object.entries(data.gold)) {
          const uid = Number(k);
          if (machine.quests?.has?.(uid) && Number.isSafeInteger(g?.base) && g.base >= 0 && Number.isFinite(g?.factor) && Number.isSafeInteger(g?.shares) && g.shares >= 1) golds.set(uid, { base: g.base, factor: g.factor, shares: g.shares });
        }
      }
    },
  };
  return layer;
}
