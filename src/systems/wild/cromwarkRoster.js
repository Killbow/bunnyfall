// @ts-check
// Cromwark's own cast. A leaf shared by spawning, grants and combat.
export const CROMWARK_ROSTER = Object.freeze([
  { id: 3136, key: 'judge', name: 'Judge', hp: 118, speed: 35, weight: 2, cooldown: 3, color: [1, .5, .95] },
  { id: 3137, key: 'horror-mite', name: 'Horror Mite', hp: 100, speed: 65, weight: 1, cooldown: 2.2, color: [1, .35, .55] },
  { id: 3138, key: 'gazadar', name: 'Gazadar', boneCorpse: true, hp: 130, speed: 35, weight: 2, cooldown: 2.8, color: [1, .3, .8] },
  { id: 3139, key: 'crystal-hulk', name: 'Crystal Hulk', hp: 300, speed: 30, weight: 1, cooldown: 2.6, color: [1, .6, .25] },
  { id: 3140, key: 'bishop', name: 'Bishop', hp: 175, speed: 30, weight: 2, cooldown: 3.2, color: [.85, .5, 1] },
  { id: 3141, key: 'pain', name: 'Pain', hp: 200, speed: 22, weight: 3, cooldown: 3.6, color: [1, .4, .65] },
  { id: 3142, key: 'frozen', name: 'Frozen', boneCorpse: true, hp: 245, speed: 25, weight: 1, cooldown: 3.2, color: [.35, .85, 1] },
].map((p, i) => Object.freeze({ ...p, archive: 9940 + i,
  range: [14, 10, 24, 6, 22, 9, 20][i], scale: [1.15, .9, 1, 1.65, 1.2, 1.1, 1.5][i] })));
export const cromwarkProfile = (id) => CROMWARK_ROSTER.find((p) => p.id === id) ?? null;
export const cromwarkHealth = (id, elite = false) => Math.round((cromwarkProfile(id)?.hp ?? 1) * (elite ? 1.6 : 1));

// The elite bit already follows the foe through saves, grants and handoffs.
export const cromwarkTitanheart = (entity) => !!entity?.eliteFoe && !!cromwarkProfile(entity.mobileType);
export const CROMWARK_TITAN_SIZE = 1.15;
export const CROMWARK_TITAN_GLOW = Object.freeze([1, .08, .06, .85]);
export const cromwarkTitanDamage = (entity, damage) => Math.min(damage, Math.max(1, Math.ceil(entity.maxHealth / 4)));

// Camps and roaming packs can add two members inside Cromwark, subject to the caller's encounter cap.
export function cromwarkPack(types) {
  return types.length ? [...types, types[0], types[1] ?? types[0]] : types;
}

// Three fifths lead actors, two fifths the original encounter table. Deeper rings
// introduce more pattern combinations, rather than multiplying everyone's stats.
export function cromwarkSpecies(normal, ring, die = Math.random) {
  if (!(ring > 0) || normal < 0 || cromwarkProfile(normal)) return normal;
  if (die() >= .6) return normal;
  const pool = ring < 2 ? [0, 1, 3, 6] : ring < 3 ? [0, 1, 2, 3, 4, 6] : [0, 1, 2, 3, 4, 5, 6];
  return CROMWARK_ROSTER[pool[Math.min(pool.length - 1, Math.floor(die() * pool.length))]].id;
}

export function makeCromwarkEntity(entity, id, own = true) {
  const p = cromwarkProfile(id);
  if (!p) return;
  entity.name = p.name;
  if (own) entity.health = entity.maxHealth = cromwarkHealth(id, entity.eliteFoe);
  entity.healthMult = 1;
  entity.damageScale = 1;
  entity.minMetalToHit = -1;
  entity.spells = [];
  // Fixed movement: Pain stays slow at every player level.
  if (entity.stats?.speed != null) entity.stats.speed = p.speed;
}
