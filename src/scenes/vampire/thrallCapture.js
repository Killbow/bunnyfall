// @ts-check
// BUNNYFALL VAMPIRE EXPANSION, PHASE 2: SUBDUE. An awakened vampire in STEAL MODE whose own blow would kill a person - a
// class foe (thrallLaw.js subduableFoe: never the watch, a companion, a revenant, an elite, a quest's or another
// player's) - takes them alive instead: held at 1, they step through the sparing portal the sworn revenants take
// (revenantFate.js fateDissolve's `sparing`, the pools' own fate frame removes them when it closes) and wait in the
// Haven as a PRISONER (systems/vampire/thralls.js takePrisoner), with their blood's kind and quality.
// The two foe pools' death arms ask here (scenes/exteriorFoes.js, scenes/dungeonContext.js), one line each.

import { getInteractionMode } from '../../player/interactionMode.js';
import { awakenedVampirism } from '../../systems/vampire/vitae.js';
import { captureRefusal, takePrisoner } from '../../systems/vampire/thralls.js';
import { subduableFoe, archetypeOfFoe, qualityOfFoe, mobileOfThrall } from '../../systems/vampire/thrallLaw.js';
import { archetypeName } from '../../systems/vampire/bloodLaw.js';
import { clanCaptor } from '../../systems/vampire/clanLaw.js';
import { enemyDisplayName } from '../../characters/enemyBasics.js';
import { t } from '../../ui/textManager.js';
import { revenantGivenName } from '../../revenants/revenant.js';   // the revenants' seeded given name

/** A captive's name: a given name from DFU's banks on a seeded side-stream (the revenants' own - the shared DFRandom put
 *  back), else the words for one with no name: "a Nightblade". */
function captiveName(mobileType, gender, rolls) {
  try {
    const n = revenantGivenName(`thrall:${Date.now()}:${Math.floor(rolls() * 1e9)}`, mobileType, gender);
    if (n && n !== 'Nameless') return n;
  } catch { /* no banks yet: the plain words */ }
  return t('thrall.captive.of', 'a {kind}', { kind: String(enemyDisplayName(mobileType) ?? '') || t('thrall.captive', 'a captive') });
}

/**
 * The death arm's question: take this foe alive? Answers true when it did (the arm returns at once, the foe held at 1
 * and stepping through its portal).
 * @param {any} f the pool's foe record
 * @param {{ playerEntity: any, fromPlayer: boolean, peer: any, shared?: boolean, questFoe?: boolean,
 *   portals?: { open: (at: number[]) => void } | null, say?: ((s: string) => void) | null, rolls?: () => number }} o
 */
export function subdueFoe(f, { playerEntity, fromPlayer, peer, shared = false, questFoe = false, portals = null, say = null, rolls = Math.random }) {
  if (!fromPlayer || peer || shared || questFoe || !f?.entity || f.puppet) return false;
  if (getInteractionMode() !== 'steal' || !awakenedVampirism(playerEntity)) return false;
  if (!subduableFoe(f.mobileType) || f.companion != null || f.entity.revenant || f.entity.eliteFoe || f.yielded || f.sparing) return false;
  const no = captureRefusal(playerEntity);
  if (no) { say?.(no); return false; }
  const type = archetypeOfFoe(f.mobileType);
  const captor = clanCaptor(awakenedVampirism(playerEntity)?.clan);   // PHASE 3: the Khulari take them whole
  const p = takePrisoner(playerEntity, {
    name: captiveName(f.mobileType, f.gender === 'female' ? 'female' : 'male', rolls), gender: f.gender === 'female' ? 'female' : 'male', type,
    quality: qualityOfFoe(f.entity.level, rolls()) + (captor ? 10 : 0), mobile: mobileOfThrall(type, f.mobileType), source: 'foe', health: captor ? 60 : 30,
  });
  if (!p) return false;
  f.entity.health = 1;
  if (f.ai) { f.ai.velX = 0; f.ai.velZ = 0; f.ai.target = null; }
  f.sparing = { at: Date.now() };
  try { if (f.ai?.feet) portals?.open([f.ai.feet[0], f.ai.feet[1], f.ai.feet[2]]); } catch { /* no portal, the step all the same */ }
  say?.(t('thrall.subdued', 'You subdue {name} and send them to your Haven. {type} blood, {quality}%.', { name: p.name, type: archetypeName(p.type), quality: p.quality }));
  return true;
}
