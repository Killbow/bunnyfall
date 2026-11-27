import { playerInSunlight, playerInDarkness, playerInHolyPlace } from '../characters/passiveSpecials.js';
import { skyMinutes } from '../world/worldTick.js';
import { getBool } from '../platform/settings.js';
import { setScrollSpellSource } from '../systems/scrolls/spellScrolls.js';
import { seasonValue, SEASONS, dateFromClassicMinutes, lunarPhasesFromMinutes, LUNAR_PHASES } from '../world/gameDate.js';
import { placeFoeFreely } from '../systems/quest/sceneMount.js';
import { placeFoeEnv, entityOccupancy, heldSpots, holdSpotWhile } from '../systems/quest/questFoeHost.js';
import { ENEMY_BASICS } from '../characters/enemyBasics.js';
import { sparedByPlayer } from '../combat/friendlyFire.js';
import { summonedBody } from '../items/foeLootCap.js';

// Classic spawning retries a refused spot on the next frame; this retries a fixed number of times so a sealed
// corridor cannot loop forever.
export const LOOSE_FOE_PLACE_ATTEMPTS = 12;

// minDistance 4 matches the classic enemy spawner fields, not the placeFoeFreely default of 5.
export function standLooseFoe({ collider, feet, yawRad, fovDegrees, foes, spawn },
  mobileType, { allied = false, lineOfSightCheck = true, minDistance = 4, maxDistance = 20, attempts = LOOSE_FOE_PLACE_ATTEMPTS } = {}) {
  if (!feet || !collider || !spawn) return null;
  // Spawns are async, so spots already chosen for a pending spawn count as occupied.
  const pending = heldSpots(collider);
  const env = placeFoeEnv({
    collider,
    // Classic placement casts from the player's center, not the feet.
    playerFeet: [feet[0], feet[1] + 0.9, feet[2]],
    playerYawRad: yawRad,
    fovDegrees,
    isOccupied: entityOccupancy((f) => f.ai?.feet, () => [...foes, ...pending], feet),
  });
  let spot = null;
  for (let i = 0; i < attempts && !spot; i++) {
    spot = placeFoeFreely(env, { minDistance, maxDistance, lineOfSightCheck });
  }
  if (!spot) return null;
  // Classic spawning lifts a flying enemy 1.5 above the tested point.
  const fly = (ENEMY_BASICS[mobileType]?.behaviour ?? 'General') === 'Flying';
  const pos = [spot.x, fly ? spot.y + 1.5 : spot.y, spot.z];
  const yaw = Math.atan2(feet[0] - spot.x, feet[2] - spot.z);
  return holdSpotWhile(collider, spot, () => spawn(mobileType, pos, { yawRad: yaw, allied })).catch(() => null);
}

export function createEnchantCtx({
  playerEntity,
  spellsByIndex,
  now,
  sinks,
  playerSpellSinks = null,
  say = null,
  magic: engine,
  foes = () => [],
  foeSinks = () => ({}),
  feet = () => [0, 0, 0],
  standLooseFoe: standFoe = null,
  messageBox = null,
  openCharacterSheet = null,
  replaceFoe = null,
  isResting = () => !!playerEntity?.isResting,
  travelUIShowing = () => false,
  bossSpell = null,
  spellToOwner = null,
} = {}) {
  setScrollSpellSource(spellsByIndex);
  // A host whose modes use different cast engines passes a getter, so an item's spell goes through the live one.
  const live = typeof engine === 'function' ? engine : () => engine;
  const magic = {
    castByItemSelf: (...a) => live().castByItemSelf(...a),
    barCast: () => live().barCast?.(),
    readySpell: (...a) => live().readySpell(...a),
    applySpellToPlayer: (...a) => live().applySpellToPlayer(...a),
    applySpellToFoe: (...a) => live().applySpellToFoe(...a),
  };
  return {
    spellsByIndex,
    now,
    sinks,
    hurtSelf: (n) => { if (n > 0) sinks?.hurt?.(n); },
    say,
    isResting,
    travelUIShowing,
    inSunlight: () => playerInSunlight(),
    inDarkness: () => playerInDarkness(),
    inHolyPlace: () => playerInHolyPlace(),
    applySpellToSelf: (record, _entity, item) => magic.castByItemSelf(record, item),
    spellToOwner: (f, record, level) => !!spellToOwner?.(f, record, level),
    castBarred: () => magic.barCast?.() === true,
    setReadySpell: (record) => magic.readySpell(record, { free: true }),
    applySpellToTarget: (record, attacker, target) => {
      const af = attacker && attacker !== playerEntity
        ? foes().find((x) => x.entity === attacker) : null;
      // The caster carries its sinks so Spell Reflection can land damage back on it.
      const casterOf = () => {
        if (!attacker) return null;
        if (attacker === playerEntity) return { entity: playerEntity, sinks: playerSpellSinks ?? sinks };
        return af ? { entity: attacker, sinks: foeSinks(af) } : { entity: attacker };
      };
      if (target === playerEntity) { magic.applySpellToPlayer(record, attacker?.level ?? 1, casterOf()); return; }
      // A boss stand-in body is not in the enemy list, so the host's boss spell handler takes it.
      if (target?.spareGear) { bossSpell?.(record, target); return; }
      const f = foes().find((x) => !x.dead && x.entity === target);
      if (!f) return;
      // Another player's next update overwrites an enemy they run, so the player's spell goes to that player.
      if (attacker === playerEntity && spellToOwner?.(f, record, playerEntity.level ?? 1)) return;
      magic.applySpellToFoe(record, attacker?.level ?? 1, f, casterOf(), undefined, foeSinks(f));
    },
    nearbyFoes: (range) => {
      const pf = feet();
      return foes().filter((f) => !f.dead && f.ai
        && Math.hypot(f.ai.feet[0] - pf[0], f.ai.feet[1] - pf[1], f.ai.feet[2] - pf[2]) <= range)
        .map((f) => ({
          mobileType: f.mobileType ?? f.entity?.mobileType ?? 128,
          distance: Math.hypot(f.ai.feet[0] - pf[0], f.ai.feet[1] - pf[1], f.ai.feet[2] - pf[2]),
          team: f.entity?.team ?? 'PlayerEnemy',
          spared: sparedByPlayer(f),
          hurt: (n, o) => foeSinks(f).hurt?.(n, o),
        }));
    },
    // Classic soul-bound release skips the line-of-sight check, while the Sanguine Rose summon keeps it.
    spawnFoe: (mobileType) => { standFoe?.(mobileType, { lineOfSightCheck: false }); },
    spawnAlliedFoe: (mobileType) => { Promise.resolve(standFoe?.(mobileType, { allied: true })).then(summonedBody, () => null); },
    messageBox,
    openCharacterSheet,
    replaceFoe,
    get allowMagicRepairs() { return getBool('Controls', 'AllowMagicRepairs'); },
    // Extra spell point conditions number seasons Winter 0 to Fall 3, but the calendar runs Fall 0 to Winter 3.
    season: () => {
      const s = seasonValue(dateFromClassicMinutes(skyMinutes()));
      return s === SEASONS.Winter ? 0 : s === SEASONS.Fall ? 3 : s;
    },
    moonPhase: (param) => {
      const { masser, secunda } = lunarPhasesFromMinutes(skyMinutes());
      const either = (...phases) => phases.includes(masser) || phases.includes(secunda);
      if (param === 4) return either(LUNAR_PHASES.Full);
      if (param === 5) return either(LUNAR_PHASES.HalfWax, LUNAR_PHASES.HalfWane);
      if (param === 6) return either(LUNAR_PHASES.New);
      return false;
    },
  };
}
