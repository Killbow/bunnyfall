// @ts-check
// BUNNYFALL VAMPIRE EXPANSION: THE DISCIPLINES, CAST (the law: disciplineLaw.js; the key and its wheel:
// ui/vampire/disciplineWheel.js). An awakened vampire knows the shared three and the clan's two - the clan's withheld
// while its own Court holds a Blood Hunt on them (clanLaw.js strengthOn). A cast:
//   - is refused while Starving, before its cooldown is out, or without the Vitae to pay;
//   - pays its Vitae (vitae.js spendVitae - the Beast rises as the Vitae falls);
//   - goes through the live host's cast engine free (enchantments.js castFreeForPlayer): on the caster at once, an aimed
//     one readied for the next swing or click;
//   - if VISIBLE and seen by townsfolk (the host's `seenBy`), heats the region's Masquerade (masquerade.js, `power`).
// The cooldowns are real seconds, kept for the page's life; the last cast is remembered (the key's tap casts it again).

import { t } from '../../ui/textManager.js';
import { awakenedVampirism, spendVitae, beastStageNow } from './vitae.js';
import { BEAST } from './bloodLaw.js';
import { strengthOn } from './clanLaw.js';
import { noteBreach } from './masquerade.js';
import { DISCIPLINES, disciplinesFor, disciplineById } from './disciplineLaw.js';
import { buildCustomSpell } from '../../magic/spellMaker.js';
import { castFreeForPlayer } from '../../magic/enchantments.js';

/** id -> the real ms it is ready again. */
const _ready = new Map();
/** id -> its spell record, built once. */
const _records = new Map();
let _last = null;
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** The Disciplines this vampire knows now (none for one not awakened). @param {any} entity */
export function knownDisciplines(entity) {
  const entry = awakenedVampirism(entity);
  if (!entry) return [];
  return disciplinesFor(entry.clan, { withhold: !strengthOn(entry.clan) });
}
/** Seconds until a Discipline is ready (0 ready). @param {string} id */
export const cooldownLeft = (id) => Math.max(0, Math.ceil(((_ready.get(id) ?? 0) - nowMs()) / 1000));
/** The last Discipline cast, if still known. @param {any} entity */
export const lastDiscipline = (entity) => knownDisciplines(entity).find((d) => d.id === _last) ?? null;

/** Its spell record (the Spell Maker's builder, once). */
function recordOf(d) {
  let r = _records.get(d.id);
  if (!r) {
    r = { ...buildCustomSpell({ name: d.name(), element: d.element, rangeType: d.range, icon: d.icon, slots: d.slots }), discipline: d.id };
    _records.set(d.id, r);
  }
  return r;
}

/**
 * Cast a Discipline. Answers the line to say. `seenBy()` how many townsfolk see the caster now; `region` the region's
 * index; `now` the character's own minute.
 * @param {any} entity @param {string} id @param {{ now: number, region?: number, seenBy?: () => number }} o
 */
export function castDiscipline(entity, id, { now, region = -1, seenBy = () => 0 }) {
  const d = disciplineById(id);
  if (!d || !knownDisciplines(entity).includes(d)) return t('discipline.no.known', 'You do not know that Discipline.');
  if (beastStageNow(entity, now) >= BEAST.Starving) return t('discipline.no.starving', 'You are Starving. The Beast will not lend you its blood.');
  const left = cooldownLeft(d.id);
  if (left > 0) return t('discipline.no.cooldown', '{name} is ready again in {s} s.', { name: d.name(), s: left });
  if (!spendVitae(entity, d.vitae, now)) return t('discipline.no.vitae', '{name} needs {n} Vitae.', { name: d.name(), n: d.vitae });
  if (!castFreeForPlayer(recordOf(d), entity)) {
    spendVitae(entity, -d.vitae, now);   // nothing cast here (a place that bars it): the blood given back
    return t('discipline.no.here', 'Your blood will not answer here.');
  }
  _ready.set(d.id, nowMs() + d.cooldownS * 1000);
  _last = d.id;
  let seen = 0;
  try { seen = d.visible ? seenBy() : 0; } catch { /* none counted */ }
  if (seen > 0) noteBreach(entity, region, 'power', now);
  return d.range === 0 ? d.words() : t('discipline.readied', '{words} Strike or cast to release it.', { words: d.words() });
}

/** Tests and a new character: every cooldown and the last cast forgotten. */
export function forgetDisciplines() { _ready.clear(); _last = null; }
export { DISCIPLINES };
