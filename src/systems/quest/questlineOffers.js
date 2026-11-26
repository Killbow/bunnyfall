// @ts-check
// Posts each questline on offer (notice board, guild and tavern givers, and the Quests tab) and begins it on take.
// A giver offer the player refuses rests that line at every giver for RETRY_GAP_S of character time.
import { QL_LINES, lineById } from '../questlines/qlLines.js';
import { RETRY_GAP_S } from '../questlines/qlLineRunner.js';
import { GUILD_GROUPS } from '../../formats/factionFile.js';
import { t } from '../../ui/textManager.js';

export const GUILD_POSTS = Object.freeze({ [GUILD_GROUPS.MagesGuild]: 'magery', [GUILD_GROUPS.HolyOrder]: 'temple' });

export function takeWords(r, title) {
  if (r?.ok) return t('ql.offer.taken', 'You took up {title}. It is on the Quests tab of the pause menu.', { title });
  if (r?.reason === 'noplace') return t('ql.offer.noPlace', 'It cannot be taken up here. Try again in a town, or in another region.');
  return t('ql.offer.notOnOffer', 'That questline is not on offer now.');
}

export const letterText = (rows) => rows.map((r) => String(r ?? '').trim()).join('\n')
  .split(/\n{2,}/).map((p) => p.split('\n').filter(Boolean).join(' ')).filter(Boolean).join('\n\n');

export function firstLetterTokens(quest) {
  for (const r of quest?.resources?.values?.() ?? []) {
    if (!r?.isItem || r.itemName !== 'letter' || !(r.usedMessageID > 0)) continue;
    return quest.getMessage?.(r.usedMessageID)?.getTextTokens?.(-1, quest.rolls) ?? null;
  }
  return null;
}

let _board = null;
export function setLineBoard(fn) { _board = typeof fn === 'function' ? fn : null; }
export const lineBoard = () => _board?.() ?? null;

/**
 * @param {{ machine: any, questlines: any, rowsOf: (tokens: any) => string[], ctx?: { say?: (text: string) => void,
 *   nowSeconds?: () => number, isPlayerInsideCastle?: () => boolean, removeNpcQuestor?: (seed: number) => void } }} deps
 */
export function createQuestlineOffers({ machine, questlines, rowsOf, ctx = {} }) {
  const runner = questlines.runner;
  // Bumped on load, so an offer parsed before the load cannot start in the loaded game.
  let generation = 0;
  const resting = new Map();
  const now = () => ctx.nowSeconds?.() ?? 0;
  const say = (text) => { if (text) ctx.say?.(text); };

  function offerOf(l) {
    if (runner.lineState(l.id) || !runner.onOffer(l.id)) return null;
    const quest = runner.offerQuest(l.id);
    const tokens = quest ? firstLetterTokens(quest) : null;
    return tokens ? { line: l, quest, tokens } : null;
  }

  function take(id, quest = null) {
    const r = questlines.takeLine(id, quest ? { quest } : undefined);
    const text = takeWords(r, lineById(id)?.title() ?? id);
    say(text);
    return { ...r, text };
  }

  function atPost(post, before = () => {}) {
    if (machine.lastNPCClickedQuestorOf?.()) return null;
    const s = now();
    for (const l of QL_LINES) {
      if (l.post !== post || (resting.get(l.id) ?? -Infinity) > s - RETRY_GAP_S) continue;
      const o = offerOf(l);
      if (!o) continue;
      before();
      const gen = generation;
      return {
        kind: 'offer', line: l.id,
        prompt: { tokens: o.tokens, buttons: 'YesNo', clickAnywhereToClose: false, allowCancel: false },
        respond: (yes) => {
          if (gen !== generation) return { kind: 'close' };
          if (!yes) { resting.set(l.id, now()); return { kind: 'refused', popup: null }; }
          const r = take(l.id, o.quest);
          return r.ok ? { kind: 'accepted', popup: null, quest: o.quest } : { kind: 'close' };
        },
      };
    }
    return null;
  }

  return {
    board() {
      const offers = QL_LINES.filter((l) => l.post === 'board').map(offerOf).filter(Boolean);
      const gen = generation;
      return {
        cards: offers.map((o) => ({ id: o.line.id, title: o.line.title(), giver: o.line.giver(), text: letterText(rowsOf(o.tokens)) })),
        take: (id) => {
          const o = offers.find((x) => x.line.id === id);
          if (!o || gen !== generation) return { ok: false, line: id, reason: 'closed', text: takeWords(null) };
          return take(id, o.quest);
        },
      };
    },
    atGuild: (guildGroup) => (GUILD_POSTS[guildGroup] ? atPost(GUILD_POSTS[guildGroup]) : null),
    // As in Daggerfall Unity, the questor leaves the work pool before the offer unless the player is in a castle.
    atTavern: (npcData) => atPost('tavern', () => { if (!ctx.isPlayerInsideCastle?.()) ctx.removeNpcQuestor?.(npcData?.nameSeed ?? 0); }),
    takeUp: (id) => take(id),
    reset() { generation++; resting.clear(); },
  };
}
