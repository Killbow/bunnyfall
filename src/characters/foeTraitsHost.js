// @ts-check
import { bossTraitsOf, bossTraitMask, bossTraitsOfMask, giveBossTraits, hasBossTrait, markBossWrath, bossWardShare, standBossWard,
  bossClockS, tickBossClock, bossTraitsTick, bossStrikeAt, bossTraitsTaught, bossWardBrokeLine, bossWrathLine, relayBossTraits, bossTraitWords,
  bossTraitsMetLine } from './bossTraits.js';
import { promoteEliteFoe } from './eliteFoes.js';
import { retellHit } from '../ui/hitNumbers.js';
import { t } from '../ui/textManager.js';

export function traitWire(entity, seeded = false) {
  const out = /** @type {Record<string, number>} */ ({});
  if (!bossTraitsOf(entity).length) return out;
  if (entity.bossWrath) out.bw = 1;
  if (entity.bossWard) out.bv = bossWardShare(entity, bossClockS());
  if (seeded && entity.eliteFoe) { out.z = 1; out.bt = bossTraitMask(entity.bossTraits); }
  return out;
}
export const traitWireKey = (r) => `${r.bw ?? 0},${r.bv ?? -1}`;
export function readTraitWire(entity, r, say, nameOf) {
  if (!entity || !r) return;
  if (r.z === 1 && !entity.eliteFoe) promoteEliteFoe(entity, { own: false });
  if (entity.eliteFoe && Number.isInteger(r.bt) && !bossTraitsOf(entity).length) giveBossTraits(entity, bossTraitsOfMask(r.bt, entity.raidLeader ? 2 : 1), { own: false });
  if (r.bw === 1 && markBossWrath(entity)) say?.(bossWrathLine(nameOf()));
  if (r.bv !== undefined && hasBossTrait(entity, 'warded')) {
    if (entity.bossWardShown > 0 && r.bv === 0) say?.(bossWardBrokeLine(nameOf()));
    entity.bossWardShown = r.bv / 100;
  }
}
export function traitsAuthority(entity, on) {
  if (!entity || !hasBossTrait(entity, 'warded')) return;
  if (on) standBossWard(entity, bossClockS());
  else { if (entity.bossWard) entity.bossWardShown = bossWardShare(entity, bossClockS()) / 100; entity.bossWard = undefined; }
}
export function hostLordTraits(q, say) {
  if (!q?.lord || !q.entity || bossTraitsOf(q.entity).length) return;
  const name = q.name ?? q.entity.name ?? '';
  if (giveBossTraits(q.entity, relayBossTraits(name, q.mobile), { own: false })) say?.(bossTraitsMetLine(name, bossTraitWords(q.entity)));
}
export function strikeTraits(entity, damage, kind, weapon, element, whole, thorns, say) {
  const d = bossStrikeAt(entity, damage, kind, weapon, element, whole, thorns);
  if (d !== damage) retellHit(entity, d, t('bossTraits.tag.resisted', 'Resisted'));
  for (const l of bossTraitsTaught(entity)) say?.(l);
  return d;
}
export function traitsFrame(foes, authority, dt, say, nameOf) {
  const s = tickBossClock(performance.now(), !(dt > 0));
  if (!authority) return;
  for (const f of foes) if (!f?.dead && f.entity?.bossWrathFrom != null && bossTraitsTick(f.entity, s) === 'wrath') say?.(bossWrathLine(nameOf(f)));
}
