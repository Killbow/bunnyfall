// @ts-check
import { t } from '../../ui/textManager.js';
import { awakenedVampirism, spendVitae, beastStageNow } from './vitae.js';
import { BEAST } from './bloodLaw.js';
import { strengthOn } from './clanLaw.js';
import { noteBreach } from './masquerade.js';
import { DISCIPLINES, disciplinesFor, disciplineById } from './disciplineLaw.js';
import { buildCustomSpell } from '../../magic/spellMaker.js';
import { castFreeForPlayer } from '../../magic/enchantments.js';

const _ready = new Map();
const _records = new Map();
let _last = null;
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** @param {any} entity */
export function knownDisciplines(entity) {
  const entry = awakenedVampirism(entity);
  if (!entry) return [];
  return disciplinesFor(entry.clan, { withhold: !strengthOn(entry.clan) });
}
/** @param {string} id */
export const cooldownLeft = (id) => Math.max(0, Math.ceil(((_ready.get(id) ?? 0) - nowMs()) / 1000));
/** @param {any} entity */
export const lastDiscipline = (entity) => knownDisciplines(entity).find((d) => d.id === _last) ?? null;

function recordOf(d) {
  let r = _records.get(d.id);
  if (!r) {
    r = { ...buildCustomSpell({ name: d.name(), element: d.element, rangeType: d.range, icon: d.icon, slots: d.slots }), discipline: d.id };
    _records.set(d.id, r);
  }
  return r;
}

/**
 * @param {any} entity
 * @param {string} id
 * @param {{ now: number, region?: number, seenBy?: () => number }} o
 */
export function castDiscipline(entity, id, { now, region = -1, seenBy = () => 0 }) {
  const d = disciplineById(id);
  if (!d || !knownDisciplines(entity).includes(d)) return t('discipline.no.known', 'You do not know that Discipline.');
  if (beastStageNow(entity, now) >= BEAST.Starving) return t('discipline.no.starving', 'You are Starving. The Beast will not lend you its blood.');
  const left = cooldownLeft(d.id);
  if (left > 0) return t('discipline.no.cooldown', '{name} is ready again in {s} s.', { name: d.name(), s: left });
  if (!spendVitae(entity, d.vitae, now)) return t('discipline.no.vitae', '{name} needs {n} Vitae.', { name: d.name(), n: d.vitae });
  if (!castFreeForPlayer(recordOf(d), entity)) {
    spendVitae(entity, -d.vitae, now);
    return t('discipline.no.here', 'You cannot use that Discipline here.');
  }
  _ready.set(d.id, nowMs() + d.cooldownS * 1000);
  _last = d.id;
  let seen = 0;
  try { seen = d.visible ? seenBy() : 0; } catch { }
  if (seen > 0) noteBreach(entity, region, 'power', now);
  return d.range === 0 ? d.words() : t('discipline.readied', '{words} Strike or cast to release it.', { words: d.words() });
}

export function forgetDisciplines() { _ready.clear(); _last = null; }
export { DISCIPLINES };
