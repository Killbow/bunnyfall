// @ts-check
// BUNNYFALL VAMPIRE EXPANSION - THE VISUAL PASS: THE BLOOD SIGHT CARD. What the vampire sees leaning over a victim
// (scenes/vampire/vampireFeed.js), drawn in the vampire's window kit (ui/vampire/vampKit.js) in the player's skin:
//   the blood's glyph in its colour, the victim's name, the blood's kind and its quality on a meter, its resonance's
//   gift, who could see (an eye, red when watched), the region's wariness - then each choice a card with its glyph and
//   what it costs; once chosen, what came of it, the Vitae and the Beast after, and a red flash at the bite.
// The choices and their consequences are the feeding's own; this file only draws and asks.

import { t } from '../textManager.js';
import { openVampWindow, el, art, bloodGlyph, disciplineGlyph, chip, meter, button, section, screenFlash, BLOOD_COLOUR, STAGE_COLOUR } from './vampKit.js';
import { archetypeName, bloodQualityName, resonanceWords, beastStageName, VITAE_MAX } from '../../systems/vampire/bloodLaw.js';

/** Each choice's glyph (a Discipline's - vampKit.js DISCIPLINE_GLYPH) and its line. */
const CHOICE = Object.freeze({
  kiss: { glyph: 'lure', hint: () => t('sight.hint.kiss', 'Sip, and cloud their memory. No one will suspect.') },
  drink: { glyph: 'bloodSiphon', hint: () => t('sight.hint.drink', 'More blood, and no Vitae spent. They may cry for the watch.') },
  drain: { glyph: 'predator', hint: () => t('sight.hint.drain', 'All of it. The most blood, and a death.'), kind: 'warn' },
  take: { glyph: 'stalker', hint: () => t('sight.hint.take', 'The Kiss, and they follow you to your Haven.') },
  enthrall: { glyph: 'courtCommand', hint: () => t('sight.hint.enthrall', 'Bind them where they stand, to serve you here.') },
  leave: { glyph: 'mistForm', hint: () => t('sight.hint.leave', 'Let them be.') },
});
const EYE = '<svg width="16" height="16" viewBox="0 0 48 48"><path d="M4 24c7-11 33-11 40 0-7 11-33 11-40 0z" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="24" cy="24" r="6" fill="currentColor"/></svg>';

/**
 * @param {{ victim: { name: string, type: string, quality: number, seen: number, sleeper?: boolean, scouted?: number, wary?: boolean },
 *   choices: Array<{ id: string, label: string }>, status: () => ({ vitae: number, stage: number } | null),
 *   onPick: (id: string) => string[], onClose?: () => void }} o
 */
export function openBloodSight({ victim, choices, status, onPick, onClose }) {
  const colour = BLOOD_COLOUR[victim.type] ?? '#b02a35';
  /** @type {string[]|null} what came of the choice */
  let after = null;
  let picked = null;
  return openVampWindow({
    id: 'vamp-blood-sight', narrow: true,
    title: () => victim.name,
    sub: () => (victim.sleeper ? t('sight.sub.sleeper', 'Asleep - Blood Sight') : t('sight.sub', 'Blood Sight')),
    crest: () => bloodGlyph(victim.type, 52),
    accent: () => colour,
    onClose,
    render(body, api) {
      if (after) {
        const st = status();
        const res = el('div', 'vk-hero');
        res.append(art(bloodGlyph(victim.type, 88)));
        const words = el('div');
        for (const line of after) words.append(el('p', null, line));
        if (st) {
          words.append(meter(st.vitae, VITAE_MAX, STAGE_COLOUR[st.stage] ?? '#b02a35', t('sight.vitae', 'Vitae {v} - {stage}', { v: Math.round(st.vitae), stage: beastStageName(st.stage) })));
        }
        res.append(words);
        body.append(res);
        const acts = el('div', 'vk-acts');
        acts.append(button(t('sight.done', 'Wipe your mouth and go'), () => api.close(), { kind: 'primary' }));
        body.append(acts);
        return;
      }
      // THE VICTIM
      const hero = el('div', 'vk-hero');
      hero.append(art(bloodGlyph(victim.type, 88)));
      const info = el('div');
      const big = el('div', 'vk-row');
      const q = el('span', 'vk-quality', `${victim.quality}%`);
      q.style.color = colour;
      big.append(q, el('span', 'vk-big', t('sight.blood', '{type} blood, {word}', { type: archetypeName(victim.type), word: bloodQualityName(victim.quality) })));
      info.append(big, meter(victim.quality, 100, colour, t('sight.quality', 'Quality')));
      info.append(el('p', null, t('sight.resonance', 'Resonance: {gift}.', { gift: resonanceWords(victim.type) })));
      const chips = el('div', 'vk-chips');
      const eye = chip(victim.seen > 0 ? t('sight.seen', '{n} can see you', { n: victim.seen }) : t('sight.unseen', 'No one is watching'), EYE, victim.seen > 0 ? '#d10f2f' : '#4e7f72');
      eye.style.color = victim.seen > 0 ? '#ff8a8a' : '#9fd4c4';
      chips.append(eye);
      if (victim.scouted) chips.append(chip(t('sight.scouted', 'Marked by your servant: +{n}%', { n: victim.scouted })));
      if (victim.wary) chips.append(chip(t('sight.wary', 'A wary region: there may be eyes you cannot see'), null, '#c08a3e'));
      info.append(chips);
      hero.append(info);
      body.append(hero);
      // THE CHOICES
      body.append(section(t('sight.choose', 'What will you do?')));
      const grid = el('div', 'vk-grid');
      for (const c of choices) {
        const def = CHOICE[c.id] ?? CHOICE.leave;
        const card = el('div', `vk-card${c.id === 'leave' ? ' dim' : ''}`);
        card.append(art(disciplineGlyph(def.glyph, def.kind === 'warn' ? '#e04848' : colour, 34)));   // each choice the glyph of the Discipline it is kin to
        const text = el('div');
        text.append(el('h4', null, c.label), el('p', null, def.hint()));
        card.append(text);
        const acts = el('div', 'vk-acts');
        acts.append(button(c.id === 'leave' ? t('sight.leaveBtn', 'Leave') : t('sight.doBtn', 'Do it'), () => {
          picked = c.id;
          const lines = onPick(c.id);
          if (c.id === 'leave' || !lines.length) { api.close(); return; }
          after = lines;
          if (picked !== 'enthrall') screenFlash('rgba(150,0,16,0.9)', { ms: 520, peak: 0.55 });
          api.rerender();
        }, { kind: def.kind ?? (c.id === 'kiss' ? 'primary' : '') }));
        card.append(acts);
        grid.append(card);
      }
      body.append(grid);
    },
  });
}
