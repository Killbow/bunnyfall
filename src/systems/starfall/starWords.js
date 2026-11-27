// @ts-check
import { t } from '../../ui/textManager.js';

export function heldBy(top, c) {
  const names = (Array.isArray(top) ? top : []).filter((x) => typeof x === 'string' && x);
  const more = Math.max(0, (c | 0) - names.length);
  if (!names.length) return more ? t('starfall.by.many', '{n, plural, one {1 defender} other {# defenders}}', { n: more }) : '';
  if (more) return t('starfall.by.more', '{names} and {n, plural, one {1 other} other {# others}}', { names: names.join(', '), n: more });
  if (names.length === 1) return names[0];
  return t('starfall.by.list', '{names} and {last}', { names: names.slice(0, -1).join(', '), last: names[names.length - 1] });
}

export const STAR_REGION_TEXT = Object.freeze({
  omen: (town, witches) => t('starfall.region.omen', 'A star is falling toward {town}. {witches} are at their rite.', { town, witches }),
  omenHeart: (town, witches) => t('starfall.region.omenHeart', 'The Heart-Star is falling toward {town}. {witches} are at their rite.', { town, witches }),
  fell: (town) => t('starfall.region.fell', 'A star has fallen near {town}.', { town }),
  held: (town, top, c) => {
    const by = heldBy(top, c);
    return by ? t('starfall.region.heldBy', 'The star near {town} is held by {by}.', { town, by }) : t('starfall.region.held', 'The star near {town} is held.', { town });
  },
});

const WAVE_CALLS = Object.freeze([
  () => t('starfall.wave.1', 'The coven comes for the star!'),
  () => t('starfall.wave.2', 'What the coven called comes out of the dark.'),
  () => t('starfall.wave.3', 'What the coven made comes for the star.'),
  () => t('starfall.wave.4', 'Mephala\'s own join the fight.'),
]);

export const STAR_AT_TEXT = Object.freeze({
  wave: (w) => (WAVE_CALLS[Math.max(1, Math.min(WAVE_CALLS.length, w | 0)) - 1])(),
  breath: () => t('starfall.at.breath', 'The star\'s light steadies.'),
  low: () => t('starfall.at.low', 'The star is going dark!'),
  circleBroken: (her) => t('starfall.at.circleBroken', '{her, select, yes {Her} other {Its}} circle is broken.', { her: her ? 'yes' : 'no' }),
  held: () => t('starfall.at.held', 'The star is held. Its thread burns away.'),
  heldHeart: () => t('starfall.at.heldHeart', 'The Heart-Star is held. Its thread burns away.'),
  lost: () => t('starfall.at.lost', 'The coven has taken the star.'),
  dawn: () => t('starfall.at.dawn', 'Dawn. The coven pulls the last light home.'),
});

export const STAR_CARD_TEXT = Object.freeze({
  name: (heart) => (heart ? t('starfall.card.heart', 'Heart-Star') : t('starfall.card.name', 'Fallen Star')),
  near: (town) => t('starfall.card.near', 'Near {town}', { town }),
  wave: (w, n) => t('starfall.card.wave', 'Wave {w} of {n}', { w, n }),
  waits: () => t('starfall.card.waits', 'The coven waits'),
  gathers: () => t('starfall.card.gathers', 'The coven gathers'),
  breath: () => t('starfall.card.breath', 'The coven draws breath'),
  held: () => t('starfall.card.held', 'Held'),
  heldBy: (top, c) => { const by = heldBy(top, c); return by ? t('starfall.card.heldBy', 'Held by {by}', { by }) : t('starfall.card.held', 'Held'); },
  lost: () => t('starfall.card.lost', 'Lost'),
  light: () => t('starfall.card.light', 'Light'),
  left: (time) => t('starfall.card.left', '{time} left', { time }),
  falls: (time) => t('starfall.card.falls', 'Falls at {time}', { time }),
  falling: () => t('starfall.card.falling', 'Falling'),
  master: (heart) => (heart ? t('starfall.bar.heart', 'Heart of the Web') : t('starfall.bar.master', 'Master of the Fallen Star')),
  circle: (n, her) => t('starfall.bar.circle', '{n} of {her, select, yes {her} other {its}} circle {n, plural, one {stands} other {stand}}', { n, her: her ? 'yes' : 'no' }),
  // Shares the gate's key for the same word.
  warded: () => t('gate.bar.halfWarded', 'Warded'),
  felled: () => t('starfall.bar.felled', 'Felled'),
  defenders: (n) => t('starfall.bar.defenders', '{n, plural, one {1 defender} other {# defenders}}', { n }),
  legend: () => t('starfall.card.legend', 'Fallen star'),
  takes: () => t('starfall.timer.takes', 'The coven takes it when this runs out'),
  comes: (heart) => (heart ? t('starfall.timer.heart', 'The Heart-Star falls') : t('starfall.timer.falls', 'A star falls')),
  rite: (witches) => t('starfall.timer.rite', '{witches} are at their rite', { witches }),
});
