// The pure extraction behind tools/extract-enemy-basics.mjs, so a test can re-extract and diff the module.

const MATERIALS = { None: -1, Iron: 0, Steel: 1, Silver: 2, Elven: 3, Dwarven: 4, Mithril: 5, Adamantium: 6, Ebony: 7, Orcish: 8, Daedric: 9 };

// Keep the custom === -1 guard: indexOf('};', -1) searches from 0 and slices nothing, which hides every column.
export function sliceEnemyTable(src) {
  const tableStart = src.indexOf('static MobileEnemy[] Enemies = new MobileEnemy[]');
  if (tableStart < 0) throw new Error('EnemyBasics.cs: Enemies[] table not found');
  const custom = src.indexOf('// Custom enemies', tableStart);
  const tableEnd = src.indexOf('};', custom === -1 ? tableStart : custom);
  if (tableEnd <= tableStart) throw new Error('EnemyBasics.cs: Enemies[] table end not found');
  return src.slice(tableStart, tableEnd);
}

export function extractEnemyBasics(src, soundClipsSrc) {
  const SOUNDCLIPS = Object.fromEntries(
    [...soundClipsSrc.matchAll(/^\s*(\w+) = (\d+),/gm)].map((m) => [m[1], Number(m[2])]));
  const field = (b, k) => { const m = b.match(new RegExp(`\\b${k} = ([^,\\n]+),`)); return m ? m[1].trim() : null; };
  const num = (v) => (v === null ? null : Number(v));
  // An anim-frame element is a C# constant expression: the Orc Warlord's `4 -1` evaluates to 3, so the signed terms
  // are summed, and anything that is not an integer fails.
  function animFrame(s, id, key) {
    const v = s.trim().split(/\s+/).map(Number).reduce((a, b) => a + b, 0);
    if (!Number.isInteger(v)) throw new Error(`ASSERT FAIL: enemy ${id} ${key} element "${s.trim()}" -> ${v}`);
    return v;
  }

  const table = sliceEnemyTable(src);
  const blocks = table.split('new MobileEnemy()').slice(1);

  const out = {};
  for (const b of blocks) {
    const id = num(field(b, 'ID'));
    if (id === null) continue;
    // Stub entries carry only an ID, so omitted fields take the C# struct defaults.
    const e = {
      maleTexture: num(field(b, 'MaleTexture')) ?? 0,
      femaleTexture: num(field(b, 'FemaleTexture')) ?? 0,
      behaviour: (field(b, 'Behaviour') || 'MobileBehaviour.General').replace('MobileBehaviour.', ''),
      affinity: (field(b, 'Affinity') || 'MobileAffinity.None').replace('MobileAffinity.', ''),
    };
    const corpse = b.match(/CorpseTexture = CorpseTexture\((\d+),\s*(\d+)\)/);
    if (corpse) e.corpseTexture = { archive: Number(corpse[1]), record: Number(corpse[2]) };
    const mm = field(b, 'MinMetalToHit');
    e.minMetalToHit = mm ? MATERIALS[mm.replace('WeaponMaterialTypes.', '')] : 0;
    for (const k of ['MinDamage', 'MaxDamage', 'MinDamage2', 'MaxDamage2', 'MinDamage3', 'MaxDamage3', 'MinHealth', 'MaxHealth', 'Level', 'ArmorValue', 'Weight', 'MapChance', 'SoulPts', 'BloodIndex', 'ChanceForAttack2', 'ChanceForAttack3', 'ChanceForAttack4', 'ChanceForAttack5']) {
      const v = num(field(b, k));
      if (v !== null) e[k[0].toLowerCase() + k.slice(1)] = v;
    }
    if (/HasIdle = true/.test(b)) e.hasIdle = true;
    if (/HasSpellAnimation = true/.test(b)) e.hasSpellAnimation = true;
    if (/HasRangedAttack1 = true/.test(b)) e.hasRangedAttack1 = true;
    if (/HasRangedAttack2 = true/.test(b)) e.hasRangedAttack2 = true;
    for (const k of ['PrimaryAttackAnimFrames', 'PrimaryAttackAnimFrames2', 'PrimaryAttackAnimFrames3', 'PrimaryAttackAnimFrames4', 'PrimaryAttackAnimFrames5', 'SpellAnimFrames', 'RangedAttackAnimFrames', 'SeducerTransform1Frames', 'SeducerTransform2Frames']) {
      const m = b.match(new RegExp(`\\b${k} = new int\\[\\] \\{([^}]+)\\}`));
      if (m) e[k[0].toLowerCase() + k.slice(1)] = m[1].split(',').map((s) => animFrame(s, id, k));
    }
    // An entry that omits Team takes the struct default, MobileTeams member 0, which is PlayerEnemy.
    const team = field(b, 'Team');
    e.team = team ? team.replace('MobileTeams.', '') : 'PlayerEnemy';
    const loot = b.match(/LootTableKey = "(.)"/);
    if (loot) e.lootTableKey = loot[1];
    if (/CanOpenDoors = true/.test(b)) e.canOpenDoors = true;
    if (/ParrySounds = true/.test(b)) e.parrySounds = true;
    if (/CastsMagic = true/.test(b)) e.castsMagic = true;
    if (/SeesThroughInvisibility = true/.test(b)) e.seesThroughInvisibility = true;
    if (/NoShadow = true/.test(b)) e.noShadow = true;
    if (/HasSeducerTransform1 = true/.test(b)) e.hasSeducerTransform1 = true;
    if (/HasSeducerTransform2 = true/.test(b)) e.hasSeducerTransform2 = true;
    if (/PrefersRanged = true/.test(b)) e.prefersRanged = true;
    if (/PrefersNoise = true/.test(b)) e.prefersNoise = true;
    // Unity's Color * scalar scales alpha too, and the 3-argument constructor sets alpha to 1: alpha is the scalar.
    const glow = b.match(/GlowColor = new Color\(([^)]*)\)\s*\*\s*([\d.]+)f/);
    if (glow) {
      const [r, g, bl] = glow[1].split(',').map((v) => Number(v.trim()));
      const k = Number(glow[2]);
      e.glowColor = { r: r * k, g: g * k, b: bl * k, a: k };
    }
    for (const k of ['MoveSound', 'BarkSound', 'AttackSound']) {
      const f = b.match(new RegExp(k + String.raw` = \(int\)SoundClips\.(\w+)`));
      if (f && SOUNDCLIPS[f[1]] !== undefined) e[k[0].toLowerCase() + k.slice(1)] = SOUNDCLIPS[f[1]];
    }
    out[String(id)] = e;
  }
  return out;
}
