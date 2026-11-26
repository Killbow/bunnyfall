// The Features registry: the one declared list behind the FEATURES home on the menu rail.
// A row is a title, a note, kind labels, and one control naming the store and key that back it.

import { ALL_KEYS } from '../platform/settings.js';
import { MOD_SETTINGS } from './modSettings.js';
import { declareOnlinePrefs } from '../platform/onlineLane.js';
import { t, localizedText } from '../ui/textManager.js';

export const KINDS = Object.freeze({
  enhanced: Object.freeze({
    get label() { return t('features.kind.enhanced', 'Enhanced'); },
    get blurb() { return t('features.kind.enhanced.blurb', 'This game’s own changes and additions to the original.'); },
  }),
  mod: Object.freeze({
    get label() { return t('features.kind.mod', 'Mod Authored'); },
    get blurb() { return t('features.kind.mod.blurb', 'Mods by other authors, credited by name.'); },
  }),
  classic: Object.freeze({
    get label() { return t('features.kind.classic', 'DFU Classic'); },
    get blurb() { return t('features.kind.classic.blurb', 'Daggerfall Unity’s own optional features.'); },
  }),
});
export const KIND_ORDER = Object.freeze(['enhanced', 'mod', 'classic']);

export const GROUPS = Object.freeze({
  sight: Object.freeze({ get label() { return t('features.group.sight', 'Sight'); } }),
  world: Object.freeze({ get label() { return t('features.group.world', 'The world'); } }),
  loot: Object.freeze({ get label() { return t('features.group.loot', 'Loot & items'); } }),
  combat: Object.freeze({ get label() { return t('features.group.combat', 'Combat'); } }),
  character: Object.freeze({ get label() { return t('features.group.character', 'Your character'); } }),
  interface: Object.freeze({ get label() { return t('features.group.interface', 'Interface'); } }),
  sound: Object.freeze({ get label() { return t('features.group.sound', 'Sound'); } }),
});
export const GROUP_ORDER = Object.freeze(['sight', 'interface', 'sound', 'world', 'loot', 'combat', 'character']);

export const WINDMILLS_KEY = 'windmills';
export const KINGS_GAMBIT_KEY = 'kingsGambit';
export const EVENT_KINDS = Object.freeze({
  gate: Object.freeze({ row: true, single: true, get label() { return t('events.kind.gate', 'Dagon\'s Breach'); } }),
  serpent: Object.freeze({ row: true, single: true, get label() { return t('events.kind.serpent', 'Sea Serpent'); } }),
  super: Object.freeze({ row: true, single: true, get label() { return t('events.kind.super', 'Abyss Dungeon'); } }),
  star: Object.freeze({ row: true, single: false, get label() { return t('events.kind.star', 'Starfall'); } }),
  raid: Object.freeze({ row: true, single: false, get label() { return t('events.kind.raid', 'Town Raid'); } }),
  festival: Object.freeze({ row: false, single: true, get label() { return t('events.kind.festival', 'Witches\' Festival'); } }),
});
export const EVENT_KIND_ORDER = Object.freeze(Object.keys(EVENT_KINDS));
export const eventKindPref = (/** @type {string} */ kind) => `eventBoard-${kind}`;

export const STORES = Object.freeze(['prefs', 'settings', 'mods']);

const modFeature = (vendor, effect, group) => {
  const mod = MOD_SETTINGS[vendor];
  return Object.freeze({
    id: `mod-${vendor.toLowerCase()}`,
    group,
    get title() { return t('features.mod.title', '{title} by {author}', { title: mod.title, author: mod.author }); },
    get note() { return mod.keys.Enabled.description; },
    get effect() { return effect(); },
    kinds: Object.freeze(['mod']),
    control: Object.freeze({ store: 'mods', vendor, key: 'Enabled' }),
  });
};

const tier = (value, label) => Object.freeze(Object.defineProperty([value], 1, { enumerable: true, get: label }));
const OFF = () => localizedText('off', 'Off');

export const MOD_CURATED = Object.freeze({
  'dynamic-skies': Object.freeze(['ActivatePixelSnow', 'densitySetting', 'MinParticleSize',
    'MaxParticleSize', 'MaxParticles']),
  'world-tooltips': Object.freeze(['HideDefaultInteractTooltip']),
  'project-legacy': Object.freeze(['Family.Descendants', 'Family.Max Siblings', 'Family.Siblings Probability', 'Legacy.Model', 'Legacy.Toll', 'Legacy.Heirloom Chance', 'Legacy.Family In World']),
  'weapon-widget': Object.freeze(['Swings.Speed', 'Bob.Length', 'Inertia.Scale']),
  'shield-widget': Object.freeze(['Shield.Scale', 'Shield.OffsetHorizontal', 'Shield.WhenAttacking']),
  'diverse-weapons': Object.freeze(['WeaponWidgetPreset']),
  'roleplay-realism-items': Object.freeze(['newWeapons', 'newArmor', 'lootRebalance']),
  'roleplay-realism': Object.freeze(['advancedArchery', 'climbingRestriction', 'underworldExpulsion', 'shipPorts']),
  'handheld-torches': Object.freeze([
    'Handling.RelaxedTwoHandedWeapons', 'Handling.RememberLastLightSource', 'Handling.StowWhenSpellcasting', 'Handling.LanternsAtWaist', 'Bob.Length']),
  'horse-cart-and-cargo': Object.freeze(['Persistence.PhysicalPersistence',
    'Following.HorseFollowDistance', 'WagonAccess.InteriorAccessDistance', 'Following.AvoidCombat', 'Following.FollowFastTravel', 'Presentation.ShowTrailingWagon']),
  pcaao: Object.freeze(['equipmentDamageEnhanced', 'fadingEnchantedItems', 'armorHitFormulaRedone',
    'criticalStrikesIncreaseDamage', 'conditionBasedEffectiveness', 'softMaterialRequirements',
    'fixedStrengthDamageModifier']),
  unleveledLoot: Object.freeze(['Iron', 'Steel', 'Silver', 'Elven', 'Dwarven', 'Mithril',
    'Adamantium', 'Ebony', 'Orcish', 'Daedric']),
  'roads-hazelnut': Object.freeze(['SmoothRoads', 'RiversAndStreams']),
  'world-of-daggerfall': Object.freeze(['Mountains']),
  'iliac-puddle-no-more': Object.freeze(['General.UnderwaterFogDistance', 'General.UnderwaterFogStrength',
    'General.WaterSurfaceTopTransparency', 'General.EnableSwimStroke', 'General.SwimSpeedMultiplier', 'General.SpawnUnderwaterEnemies']),
  'ocean-holes': Object.freeze(['General.PitSpawnRate', 'General.DungeonVisualIntensity', 'General.DungeonVisualDarkness']),
  'come-sail-away': Object.freeze(['SailingAssist.AutoTrimming', 'WindDirectionWidget.Enable', 'Waves.Enable', 'Audio.SoundVolume']),
  'immersive-travel': Object.freeze([
    'General.DisableNormalTravel', 'General.DailyCarriageFee', 'General.RegionLockedCarriages', 'ShipTravel.DisableShipTravelOutsideDocks',
  ]),
  'heat-haze': Object.freeze(['Heat Haze.Intensity', 'Heat Haze.AllowSubtropical']),
  windfall: Object.freeze(['Presentation.AudioEnabled', 'Presentation.AudioVolume', 'Presentation.LeavesEnabled', 'Presentation.SnowFlurriesEnabled', 'General.OverallWindyPeriodFrequency', 'General.GustFrequency']),
  snowfall: Object.freeze(['Snowpack.WildernessMaximumDepth', 'Snowpack.SettlementMaximumDepth', 'NPC Tracks.Enabled', 'Distance Prototype.Enabled', 'Refill.PassiveRefillHours']),
  'physical-items': Object.freeze(['Enemy Loot.Physical Enemy Drops', 'Enemy Loot.Impulse Strength', 'Item Sizes.Weapons', 'Item Sizes.Armor']),
  'daggerfall-enemy-expansion': Object.freeze(['Cheat.DisableTrollRespawn']),
  'travel-options': Object.freeze([
    'CautiousTravel.PlayerControlledCautiousTravel', 'StopAtInnsTravel.PlayerControlledInnsTravel', 'ShipTravel.OnlyFromPorts',
    'GeneralOptions.LocationPause',
    'GeneralOptions.AvoidObstacles', 'GeneralOptions.FirstPersonTravel',
    'GeneralOptions.FirstPersonTravelFollowsRoads',
  ]),
  'ambient-text': Object.freeze(['textChance', 'interval', 'postTextInterval', 'textDisplayTime']),
  'eye-of-the-beholder': Object.freeze(['Camera.LongitudinalDistance', 'Camera.FrontalPlaneOffset',
    'Camera.Speed', 'Animation.BillboardScale']),
  'immersive-footsteps': Object.freeze(['AudioQualitySettings.SoundClipQuality', 'FootstepSettings.FootstepVolumeMulti', 'ArmorSwaySettings.ArmorSwayVolumeMulti']),
  'better-ambience': Object.freeze(['Better Footsteps.enable', 'Dungeon Reverb.level', 'Dungeon Lighting.dungeonDarkness', 'Camera Shake.maxShake']),
  'oblivion-remaster-leveling': Object.freeze(['attributePoints', 'maxUpdatableAttribute',
    'allowLuckIncrease', 'luckIncreaseCost', 'primarySkillsImpact', 'majorSkillsImpact',
    'minorSkillsImpact', 'miscSkillsImpact']),
});

export const modModules = (vendor) =>
  Object.keys(MOD_SETTINGS[vendor]?.keys ?? {}).filter((k) => k.startsWith('Modules.'));

export const modDials = (vendor) =>
  (MOD_CURATED[vendor] ?? []).filter((k) => MOD_SETTINGS[vendor]?.keys?.[k] !== undefined);

export const FEATURES = Object.freeze([
  Object.freeze({
    id: 'smaller-dungeons',
    group: 'world',
    get title() { return t('features.smallerDungeons.title', 'Smaller dungeons'); },
    get note() { return t('features.smallerDungeons.note', 'Dungeons bigger than five blocks are cut down to five: a center block with four around it, the same every visit. Main-story dungeons keep full size. A quest keeps the size it was set up at. Online every dungeon has its own size instead.'); },
    get effect() { return t('features.smallerDungeons.effect', 'Takes effect on the next dungeon you enter. A save made at the other size puts you at the dungeon\u2019s start.'); },
    kinds: Object.freeze(['classic']),
    control: Object.freeze({ store: 'settings', key: 'Experimental/SmallerDungeons' }),
  }),
  Object.freeze({
    id: 'medium-dungeons',
    group: 'world',
    title: 'Medium dungeons',
    note: 'Dungeons over eight blocks are cut to eight: two side by side with six around them, the same every visit. If '
      + 'Smaller dungeons is on too, it wins. Main-story dungeons keep full size; a quest keeps the size it was set up at. '
      + 'Online every dungeon has its own size instead.',
    effect: 'Takes effect on the next dungeon you enter. A save made at another size puts you at the dungeon\u2019s start.',
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'mediumDungeons', initial: false, online: false }),
  }),
  Object.freeze({
    id: 'world-dungeon-sizes',
    group: 'world',
    title: 'Dungeon sizes as online',
    note: 'Every dungeon takes the size it has online (small, medium or large, half of them medium), the same every '
      + 'visit. If Smaller dungeons is on too, it wins; this row wins over Medium dungeons. A quest keeps the size it '
      + 'was set up at. Online it is always on.',
    effect: 'Takes effect on the next dungeon you enter. A save made at another size puts you at the dungeon\u2019s start.',
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'worldDungeonSizes', initial: false, online: true }),
  }),
  Object.freeze({
    id: 'horse-care',
    group: 'world',
    get title() { return t('features.horseCare.title', 'Horse care'); },
    get note() { return t('features.horseCare.note', 'Every horse has its own Speed, Stamina, Endurance and Strength. It walks unless you hold Run to gallop, which tires it, and feeding it builds a bond that makes it better. On Boons, neglect costs nothing and it’s never slower than the classic horse. On Hard, a hungry horse is weaker. Off is the classic horse.'); },
    get effect() { return t('features.horseCare.effect', 'Takes effect at once. Online, each player picks their own.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({
      store: 'prefs', key: 'horseCare', initial: 'boons', online: 'player',
      tiers: Object.freeze([tier(false, OFF), tier('boons', () => t('features.horseCare.boons', 'Boons')), tier('hard', () => t('features.horseCare.hard', 'Hard'))]),
      also: Object.freeze([Object.freeze({ store: 'prefs', key: 'saddlePanel', initial: 'auto', online: 'player' })]),
      parts: Object.freeze([Object.freeze({
        key: 'saddlePanel', get label() { return t('features.horseCare.saddlePanel', 'Saddle panel'); },
        get tiers() { return [['auto', t('features.horseCare.saddleAuto', 'When needed')], ['always', t('features.horseCare.saddleAlways', 'Always')], ['off', OFF()]]; },
      })]),
    }),
  }),
  Object.freeze({
    id: 'wagon-upkeep',
    group: 'world',
    get title() { return t('features.wagonUpkeep.title', 'Wagon upkeep'); },
    get note() { return t('features.wagonUpkeep.note', 'Your wagon wears as it rolls and on long journeys, and a Wagon Yard or a Wagon Repair Kit mends it. On Boons, wear costs nothing. On Hard, a worn wagon is slower and sells for less. Off is the classic wagon.'); },
    get effect() { return t('features.wagonUpkeep.effect', 'Takes effect at once. Online, each player picks their own.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({
      store: 'prefs', key: 'wagonUpkeep', initial: 'boons', online: 'player',
      tiers: Object.freeze([tier(false, OFF), tier('boons', () => t('features.wagonUpkeep.boons', 'Boons')), tier('hard', () => t('features.wagonUpkeep.hard', 'Hard'))]),
    }),
  }),
  Object.freeze({
    id: 'land-view-distance',
    group: 'sight',
    get title() { return t('features.landViewDistance.title', 'Land view distance'); },
    get note() { return t('features.landViewDistance.note', 'How far the land around you is drawn, in map squares: up to 6 with the enhanced outdoors, and up to 4 '
      + 'on the classic UI or with the outdoors off.'); },
    get effect() { return t('features.effect.worldLoads', 'Takes effect when the world next loads.'); },
    kinds: Object.freeze(['enhanced', 'classic']),
    control: Object.freeze({
      store: 'prefs', key: 'landViewDistance', initial: 5, online: 'player', lane: 'landView',
      classic: 3,
      also: Object.freeze([Object.freeze({ store: 'settings', key: 'Experimental/TerrainDistance' })]),
    }),
  }),
  Object.freeze({
    id: 'enhanced-environments',
    group: 'sight',
    get title() { return t('features.enhancedEnvironments.title', 'Enhanced environments'); },
    get note() { return t('features.enhancedEnvironments.note', 'A living sky with the sun, both moons and stars, clouds that build with the weather and cast shadows, falling rain and snow, and grass that bends in the wind. Off brings back the classic painted sky and weather. The third choice uses Dynamic Skies by BadLuckBurt and carademono, included with permission. Its settings open on this tile.'); },
    get effect() { return t('features.effect.worldLoads', 'Takes effect when the world next loads.'); },
    kinds: Object.freeze(['enhanced', 'mod']),
    control: Object.freeze({
      store: 'prefs', key: 'enhancedEnvironments', initial: true, online: true, lane: 'outdoors',
      also: Object.freeze([Object.freeze({ store: 'mods', vendor: 'dynamic-skies', key: 'Enabled' })]),
    }),
  }),
  Object.freeze({
    id: 'enhanced-ai',
    group: 'combat',
    get title() { return t('features.enhancedAi.title', 'Enhanced AI'); },
    get note() { return t('features.enhancedAi.note', 'Enemies take turns, back off when hurt, and archers keep their distance. Big attacks are marked on the ground: hit hard to stagger them or dodge. Red, hatched attacks can’t be stopped. Trees, rocks and crates block sight and missiles. Pathfinding only works in dungeons for now: towns, interiors and doors come later. Off keeps the classic behavior.'); },
    get effect() { return t('features.enhancedAi.effect', 'Takes effect right away. Pathfinding changes from the next dungeon you enter.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({
      store: 'prefs', key: 'enhancedAI', initial: true, online: true,
      also: Object.freeze([Object.freeze({ store: 'prefs', key: 'telegraphContrast', initial: false, online: 'player' })]),
      parts: Object.freeze([Object.freeze({ key: 'telegraphContrast', label: 'Telegraph contrast' })]),
    }),
  }),
  Object.freeze({
    id: 'enhanced-climbing',
    group: 'world',
    get title() { return t('features.enhancedClimbing.title', 'Enhanced climbing'); },
    get note() { return t('features.enhancedClimbing.note', 'Press Jump at a ledge to climb onto or over it, or while moving forward to vault a low wall. Jump at a high ledge to catch it and hang: Forward climbs up, Left and Right move along it, Crouch lets go. Hold Forward against any wall to climb it. Holding on wears out your grip. Your Climbing skill sets how long it lasts, how high you reach and how fast you climb. Off keeps the classic climbing.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'enhancedClimbing', initial: true, online: true }),
  }),
  Object.freeze({
    id: 'enhanced-water',
    group: 'sight',
    get title() { return t('features.enhancedWater.title', 'Enhanced water'); },
    get note() { return t('features.enhancedWater.note', 'Seas, rivers and ponds you can see into: waves that grow with the wind, foam where they meet the shore, '
      + 'ripples where things move, the sky and the moon on the surface. Off brings back the classic flat water.'); },
    get effect() { return t('features.effect.worldLoads', 'Takes effect when the world next loads.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'enhancedWater', initial: true, online: 'player' }),
  }),
  Object.freeze({
    id: 'water-quality',
    group: 'sight',
    get title() { return t('features.waterQuality.title', 'Water quality'); },
    get note() { return t('features.waterQuality.note', 'How detailed the enhanced water is. Full shows what lies under the surface and ripples where things move. Simple is lighter on your machine.'); },
    get effect() { return t('features.effect.worldLoads', 'Takes effect when the world next loads.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'waterQuality', initial: 'full', online: 'player', tiers: Object.freeze([tier('full', () => t('features.waterQuality.full', 'Full')), tier('simple', () => t('features.waterQuality.simple', 'Simple'))]) }),
  }),
  Object.freeze({
    id: 'enhanced-lighting',
    group: 'sight',
    get title() { return t('features.enhancedLighting.title', 'Enhanced lighting'); },
    get note() { return t('features.enhancedLighting.note', 'Warmer, more natural light: lanterns and torches that glow and fade with distance, light through fog, shadows from the sun and your torch, darker corners, a glow on windows and flames, and rays of sunlight. Off is the classic flat lighting. Steady shadows stops shadows flickering, at some cost to frame rate. Calmer eye slows how fast your eyes adjust to light and dark.'); },
    get effect() { return t('features.enhancedLighting.effect', 'Lighting changes when the world next loads. Steady shadows and calmer eye change right away.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({
      store: 'prefs', key: 'enhancedLighting', initial: true, online: 'player',
      also: Object.freeze([Object.freeze({ store: 'prefs', key: 'steadyShadows', initial: true, online: 'player' }), Object.freeze({ store: 'prefs', key: 'shadowDebug', initial: false, online: 'player' }), Object.freeze({ store: 'prefs', key: 'calmEye', initial: false, online: 'player' })]),
      parts: Object.freeze([Object.freeze({ key: 'enhancedLighting', label: 'Lighting' }), Object.freeze({ key: 'steadyShadows', label: 'Steady shadows' }), Object.freeze({ key: 'calmEye', label: 'Calmer eye' }), Object.freeze({ key: 'shadowDebug', label: 'Shadow debug log' })]),
    }),
  }),
  Object.freeze({
    id: 'modded-lighting',
    group: 'sight',
    get title() { return t('features.moddedLighting.title', 'Modded lighting ({mod})', { mod: 'Improved Interior Lighting' }); },
    get note() { return t('features.moddedLighting.note', 'Needs the Improved Interior Lighting mod. Its warm, flickering lights replace the classic lighting, '
      + 'and with shadows on, lamps, people and monsters cast soft shadows too.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'moddedLighting', initial: 'on', online: 'player', tiers: Object.freeze([
      tier('off', OFF), tier('on', () => t('features.moddedLighting.on', 'On')), tier('shadows', () => t('features.moddedLighting.shadows', 'With shadows'))]) }),
  }),
  Object.freeze({
    id: 'grass',
    group: 'sight',
    get title() { return t('features.grass.title', 'Grass'); },
    get note() { return t('features.grass.note', 'How much grass grows in the enhanced outdoors. Grass is the heaviest thing outdoors, so try Half first if the game runs slow. Meadow: hand-drawn tufts, flowers and bushes. Pixel: finer, older tufts. Smooth: soft, shaded blades.'); },
    get effect() { return t('features.grass.effect', 'The amount changes when the world next loads. The style changes right away.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({
      store: 'prefs', key: 'grassDensity', initial: 1, online: 'player', tiers: Object.freeze([tier(1, () => t('features.grass.full', 'Full')), tier(0.5, () => t('features.grass.half', 'Half')), tier(0.25, () => t('features.grass.quarter', 'Quarter')), tier(0, OFF)]),
      also: Object.freeze([Object.freeze({ store: 'prefs', key: 'grassStyle', initial: 'meadow', online: 'player' })]),
      parts: Object.freeze([Object.freeze({ key: 'grassStyle', get label() { return t('features.grass.style', 'Style'); },
        tiers: Object.freeze([tier('meadow', () => t('features.grass.style.meadow', 'Meadow')), tier('pixel', () => t('features.grass.style.pixel', 'Pixel')), tier('smooth', () => t('features.grass.style.smooth', 'Smooth'))]) })]),
    }),
  }),
  Object.freeze({
    id: 'cloud-quality',
    group: 'sight',
    get title() { return t('features.cloudQuality.title', 'Cloud quality'); },
    get note() { return t('features.cloudQuality.note', 'How detailed the clouds in the enhanced outdoors are. Low is lighter on your machine, and High looks best if you have power to spare.'); },
    get effect() { return t('features.effect.worldLoads', 'Takes effect when the world next loads.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'cloudQuality', initial: 'default', online: 'player', tiers: Object.freeze([tier('default', () => t('features.cloudQuality.default', 'Default')), tier('lo', () => localizedText('low', 'Low')), tier('hi', () => localizedText('high', 'High'))]) }),
  }),
  Object.freeze({
    id: 'ground-sharpness',
    group: 'sight',
    get title() { return t('features.groundSharpness.title', 'Ground sharpness'); },
    get note() { return t('features.groundSharpness.note', 'How sharp the ground looks into the distance. Off is the cheapest and blurs far ground, and Maximum is the sharpest. Turn it down if the outdoors run slow.'); },
    get effect() { return t('features.effect.worldLoads', 'Takes effect when the world next loads.'); },
    kinds: Object.freeze(['enhanced', 'classic']),
    control: Object.freeze({ store: 'prefs', key: 'groundSharpness', initial: 'default', online: 'player', tiers: Object.freeze([tier('off', OFF), tier('default', () => t('features.groundSharpness.default', 'Default (4x)')), tier('max', () => t('features.groundSharpness.max', 'Maximum'))]) }),
  }),
  Object.freeze({
    id: 'real-windows',
    group: 'sight',
    title: 'Real windows',
    note: 'From the street, house windows show the rooms behind them, warmly lit at night; from inside, you can see '
      + 'out through them. Rooms only is lighter on your machine, and Off is the classic flat glass.',
    effect: 'Takes effect at once.',
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'realWindows', initial: 'full', online: 'player', tiers: Object.freeze([['full', 'Full'], ['rooms', 'Rooms only'], ['off', 'Off']]) }),
  }),
  Object.freeze({
    id: 'render-scale',
    group: 'sight',
    get title() { return t('features.renderScale.title', 'Render scale'); },
    get note() { return t('features.renderScale.note', 'Draws the world at a lower resolution and scales it up to fit, but menus and the HUD stay sharp. Try 75% if the outdoors run slow on a big or high-resolution screen. Retro Picture Mode replaces this while it’s on.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'renderScale', initial: 1, online: 'player', classic: 1, tiers: Object.freeze([[1, '100%'], [0.85, '85%'], [0.75, '75%'], [0.67, '67%'], [0.5, '50%']]) }),
  }),
  Object.freeze({
    id: 'enhanced-combat-visuals',
    group: 'sight',
    get title() { return t('features.enhancedCombatVisuals.title', 'Enhanced combat visuals'); },
    get note() { return t('features.enhancedCombatVisuals.note', 'Hidden enemies can be seen: a chameleon shimmers, a shadow is a silhouette, and an invisible enemy '
      + 'flashes when you hit it. The rules don’t change. Off hides them as the original does.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'enhancedCombatVisuals', initial: true, online: true }),
  }),
  Object.freeze({
    id: 'hotbar-modifiers',
    group: 'interface',
    get title() { return t('features.hotbarModifiers.title', 'Hotbar sets on Shift, Ctrl and Alt'); },
    get note() { return t('features.hotbarModifiers.note', 'Hold Shift, Ctrl or Alt with a hotbar key to use that slot of set II, III or IV without switching the bar. Holding Shift to run while pressing a slot uses set II.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'hotbarModifiers', initial: false, online: 'player' }),
  }),
  Object.freeze({
    id: 'weapon-glow',
    group: 'sight',
    get title() { return t('features.weaponGlow.title', 'Weapon glow'); },
    get note() { return t('features.weaponGlow.note', 'A weapon with a fire, frost or shock damage bonus wears a moving outline of its element, '
      + 'brighter the stronger it is, and an enchanted Morrowind weapon glows. Off draws weapons as before.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'weaponGlow', initial: true, online: 'player' }),
  }),
  Object.freeze({
    id: 'resource-highlights',
    group: 'sight',
    get title() { return t('features.resourceHighlights.title', 'Resource highlights'); },
    get note() { return t('features.resourceHighlights.note', 'How herbs, veins, trees and other gathering spots near you stand out. Glint makes them catch the light with sparkles. Outline rings each one in its profession’s color, plain to see day or night. Both does both.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'resourceHighlights', initial: 'glint', online: 'player', tiers: Object.freeze([tier('glint', () => t('features.resourceHighlights.glint', 'Glint')), tier('outline', () => t('features.resourceHighlights.outline', 'Outline')), tier('both', () => t('features.resourceHighlights.both', 'Both'))]) }),
  }),
  Object.freeze({
    id: 'lockpick-minigame',
    group: 'loot',
    get title() { return t('features.lockpickGame.title', 'Lockpicking minigame'); },
    get note() { return t('features.lockpickGame.note', 'On: a locked door or chest opens the lock window, and you set the pins yourself. Off: the lock is picked at once on your Lockpicking skill, and a failed try never breaks a lockpick, so you can simply try again.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['enhanced', 'classic']),
    control: Object.freeze({ store: 'prefs', key: 'lockpickMinigame', initial: false, online: 'player' }),
  }),
  Object.freeze({
    id: 'quick-loot',
    group: 'loot',
    get title() { return t('features.quickLoot.title', 'Quick loot'); },
    get note() { return t('features.quickLoot.note', 'Loot without opening a window: the mouse wheel moves through the list, Activate takes one item, and the Take '
      + 'everything key takes all but junk (Take gear sets which gear). Off uses the inventory window.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({
      store: 'prefs', key: 'quickLoot', initial: true, online: 'player',
      also: Object.freeze([Object.freeze({ store: 'prefs', key: 'quickLootTier', initial: 'all', online: 'player' })]),
      parts: Object.freeze([Object.freeze({ key: 'quickLootTier', label: 'Take gear', tiers: Object.freeze([['all', 'All'], ['magic', 'Magic+'], ['rare', 'Rare+']]) })]),
    }),
  }),
  Object.freeze({
    id: 'loot-rarity',
    group: 'loot',
    get title() { return t('features.lootRarity.title', 'Loot rarity'); },
    get note() { return t('features.lootRarity.note', 'Weapons, armor and jewelry can drop as Magic, Rare or Legendary, with extra bonuses you can read '
      + 'and compare. The odds depend on what you killed, where, and your luck. Rare and Legendary gear is rarer '
      + 'early on and becomes more common as you grow. Rare and Legendary items drop unidentified. Off is the classic loot. Online, some weapons carry a '
      + 'sigil that grows with your Renown.'); },
    get effect() { return t('features.lootRarity.effect', 'Takes effect on the next drop. Items you’re wearing update within a few seconds.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'lootRarity', initial: true, online: true }),
  }),
  Object.freeze({
    id: 'wind',
    group: 'sight',
    get title() { return t('features.wind.title', 'Wind'); },
    get note() { return t('features.wind.note', 'See the wind in the enhanced outdoors: trees and plants lean and sway with it, and faint streaks of '
      + 'air show which way it blows and how hard.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({
      store: 'prefs', key: 'floraSway', initial: true, online: 'player', lane: 'wind',
      also: Object.freeze([Object.freeze({ store: 'prefs', key: 'windWisps', initial: true, online: 'player' })]),
      parts: Object.freeze([Object.freeze({ key: 'floraSway', get label() { return t('features.wind.sway', 'Sway'); } }),
        Object.freeze({ key: 'windWisps', get label() { return t('features.wind.wisps', 'Wisps'); } })]),
    }),
  }),
  Object.freeze({
    id: 'enhanced-sounds',
    group: 'sound',
    get title() { return t('features.enhancedSounds.title', 'Enhanced sounds'); },
    get note() { return t('features.enhancedSounds.note', 'New sounds on the enhanced UI: wind outdoors that rises and falls with its strength and goes quiet '
      + 'indoors, a coin clink in the enhanced inventory, hands and boots on stone when you climb, the tools when you '
      + 'gather, a horse that snorts and breathes, its hooves changing with the ground, the sea under a deck with its '
      + 'bells and its own music at the helm, surf on the shore, the wild by region and hour, and a town\'s street, '
      + 'smithies and taverns.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'soundEnhancements', initial: true, online: 'player' }),
  }),
  Object.freeze({
    id: 'first-person-lighting',
    group: 'sight',
    get title() { return t('features.firstPersonLighting.title', 'First-person lighting'); },
    get note() { return t('features.firstPersonLighting.note', 'What you hold in first person takes the light of where you stand: your weapon, your spellcasting '
      + 'hands, the torch in your off hand and the Morrowind arms.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['enhanced', 'classic']),
    control: Object.freeze({ store: 'prefs', key: 'firstPersonLighting', initial: true, online: 'player' }),
  }),
  Object.freeze({
    id: 'enhanced-map',
    group: 'interface',
    get title() { return t('features.enhancedMap.title', 'Enhanced map'); },
    get note() { return t('features.enhancedMap.note', 'One hand-drawn parchment map for the world, towns and dungeons, held in your hands, that you can pan '
      + 'and zoom. Off uses the classic three map windows.'); },
    get effect() { return t('features.effect.nextMap', 'Takes effect the next time a map is opened.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'heldMap', initial: true, online: 'player' }),
  }),
  Object.freeze({
    id: 'dungeon-map-3d',
    group: 'interface',
    get title() { return t('features.dungeonMap3d.title', '3D dungeon map'); },
    get note() { return t('features.dungeonMap3d.note', 'The enhanced map shows dungeons in 3D, hand-drawn: turn, tilt and zoom it, with every floor you’ve '
      + 'explored at its own height. Off shows one flat floor at a time.'); },
    get effect() { return t('features.effect.nextMap', 'Takes effect the next time a map is opened.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'dungeonMap3d', initial: true, online: 'player' }),
  }),
  Object.freeze({
    id: 'tamriel-map',
    group: 'interface',
    title: 'Tamriel on the map',
    note: 'The enhanced map zooms out past the Iliac Bay to show all of Tamriel: its provinces, capitals, mountains and '
      + 'seas, hand-drawn and joined to the Bay’s own coast. You can’t travel beyond the Bay.',
    effect: 'Takes effect the next time a map is opened.',
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'tamrielMap', initial: true, online: 'player' }),
  }),
  Object.freeze({
    id: 'tamriel-land',
    group: 'world',
    title: 'Land beyond the Bay',
    note: 'The land goes on past the edge of the Iliac Bay, with the hills, mountains, coasts, sky and trees of each '
      + 'province. There are no towns, roads or dungeons there yet.',
    effect: 'Takes effect when the world next loads.',
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'tamrielLand', initial: true, online: 'player' }),
  }),
  Object.freeze({
    id: 'weather-events',
    group: 'world',
    get title() { return t('features.weatherEvents.title', 'Weather as places'); },
    get note() { return t('features.weatherEvents.note', 'Rain, storms and snow move across the land with the wind, so you can see a storm coming, walk into '
      + 'it and out the other side. Off uses the classic weather, the same everywhere in the region.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'weatherEvents', initial: true, online: true }),
  }),
  Object.freeze({
    id: 'real-forests',
    group: 'world',
    get title() { return t('features.realForests.title', 'Real forests'); },
    get note() { return t('features.realForests.note', 'Trees grow together in forests, with open grassland between them. Dungeons, ruins, shrines and camps '
      + 'are often hidden in the woods, and towns and farms stand in cleared fields. Deserts are unchanged. '
      + 'Off spreads the trees evenly, like the original.'); },
    get effect() { return t('features.effect.worldLoads', 'Takes effect when the world next loads.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'realForests', initial: true, online: true }),
  }),
  Object.freeze({
    id: 'bantha-jungle',
    group: 'world',
    get title() { return t('features.banthaJungle.title', 'Jungle of Bantha'); },
    get note() { return t('features.banthaJungle.note', 'Bantha, from Lainlyn to Mournoth, becomes dense jungle: giant trees overhead, palms, ferns and broad '
      + 'leaves underfoot, and a humid haze that is thickest at dawn and in rain. Off keeps its original woods.'); },
    get effect() { return t('features.effect.worldLoads', 'Takes effect when the world next loads.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'banthaJungle', initial: true, online: true }),
  }),
  Object.freeze({
    id: 'landforms',
    group: 'world',
    title: 'Landforms',
    note: 'Mountains and high ground stand taller, as the map draws them. Roads are cut level into hillsides and built up '
      + 'over hollows, and rivers run in channels below their banks. Off keeps the classic ground.',
    effect: 'Takes effect when the world next loads.',
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'landforms', initial: true, online: true }),
  }),
  Object.freeze({
    id: 'road-verges',
    group: 'world',
    title: 'Clear roadsides',
    note: 'Trees, bushes, rocks and herbs keep off the roads and tracks, and no branch hangs over them. Off lets them '
      + 'grow up to the edge of the road, like the original.',
    effect: 'Takes effect when the world next loads.',
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'roadVerges', initial: true, online: true }),
  }),
  Object.freeze({
    id: 'climate-blend',
    group: 'world',
    title: 'Blended climates',
    note: 'Where two climates meet, their ground, grass and trees mix across a wide, uneven border instead of changing '
      + 'along a straight line. Off changes them at a straight edge, like the original.',
    effect: 'Takes effect when the world next loads.',
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'climateBlend', initial: true, online: true }),
  }),
  Object.freeze({
    id: 'nearby-quests',
    group: 'world',
    title: 'Nearby quests',
    note: 'Quests from guilds, temples, nobles and townsfolk send you to towns and dungeons near where you took them: a '
      + 'day or two away at first, farther as you level, and anywhere in the region by about level 15. '
      + 'Off sends you anywhere in the region from the start, like the original.',
    effect: 'Takes effect on the next quest you take. Quests you already have keep their places.',
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'nearbyQuests', initial: true, online: 'player' }),
  }),
  Object.freeze({
    id: 'questlines',
    group: 'world',
    get title() { return t('features.questlines.title', 'Questlines'); },
    get note() { return t('features.questlines.note', 'Every quest shows its objectives, some let you choose how they end, some offer a piece of gear '
      + 'fitted to you when done, and questlines lead to the Breaches, the Battlespire and the Abyss. Off is the classic journal '
      + 'and its rewards, and online it is always on.'); },
    get effect() { return t('features.questlines.effect', 'Takes effect on the next quest you take. Quests you already have keep their rules.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'questlines', initial: true, online: true }),
  }),
  Object.freeze({
    id: 'living-world',
    group: 'world',
    title: 'Living world',
    note: 'Townsfolk have names, homes, trades and daily routines. They open their shops, meet and talk at the square '
      + 'and the tavern, sleep at night and remember how you treated them. Everyone online sees the same people. '
      + 'Off fills the streets with the classic wandering strangers, who vanish at dusk.',
    effect: 'Takes effect when a town next loads.',
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'livingWorld', initial: true, online: 'player' }),
  }),
  Object.freeze({
    id: 'mod-windmills-kamer',
    group: 'world',
    get title() { return t('features.mod.title', '{title} by {author}', { title: 'Windmills of Daggerfall', author: 'Kamer' }); },
    get note() { return t('features.mod.windmillsKamer.note', 'Windmills with turning sails on seven farms, with machinery inside and a look for every climate and '
      + 'season. Off leaves the farms as they were.'); },
    get effect() { return t('features.effect.worldLoads', 'Takes effect when the world next loads.'); },
    kinds: Object.freeze(['mod']),
    control: Object.freeze({ store: 'prefs', key: WINDMILLS_KEY, initial: true, online: 'player' }),
  }),
  Object.freeze({
    id: 'mod-kings-gambit',
    group: 'world',
    get title() { return t('features.mod.title', '{title} by {author}', { title: 'The King\u2019s Gambit', author: t('credits.author.unnamed', 'Unnamed ({source})', { source: 'thekingsgambit.dfmod' }) }); },
    get note() { return t('features.mod.kingsGambit.note', 'A game of armies and kings at a tavern\'s card table, against a regular or another player, for gold or for fun. Off, the tables offer only Hold\'em and Iliac Hand.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['mod']),
    control: Object.freeze({ store: 'prefs', key: KINGS_GAMBIT_KEY, initial: true, online: 'player' }),
  }),
  modFeature('seasons-iliac-bay', () => t('features.effect.worldLoads', 'Takes effect when the world next loads.'), 'sight'),
  modFeature('low-poly-trees', () => t('features.effect.worldLoads', 'Takes effect when the world next loads.'), 'sight'),
  modFeature('heat-haze', () => t('features.effect.atOnce', 'Takes effect at once.'), 'sight'),
  modFeature('windfall', () => t('features.effect.atOnce', 'Takes effect at once.'), 'sight'),
  modFeature('snowfall', () => t('features.effect.atOnce', 'Takes effect at once.'), 'sight'),
  modFeature('roads-hazelnut', () => t('features.effect.worldLoads', 'Takes effect when the world next loads.'), 'world'),
  modFeature('travel-options', () => t('features.effect.worldLoads', 'Takes effect when the world next loads.'), 'world'),
  modFeature('immersive-travel', () => t('features.mod.immersiveTravel.effect', 'Takes effect the next time you start the game. Loading a save isn’t enough. Fares and rules change at the next map.'), 'world'),
  modFeature('world-of-daggerfall', () => t('features.effect.worldLoads', 'Takes effect when the world next loads.'), 'world'),
  modFeature('aquatic-sprites', () => t('features.effect.gameLoads', 'Takes effect when the game next loads.'), 'world'),
  modFeature('bunnyfall-dungeons', () => t('features.effect.gameLoads', 'Takes effect when the game next loads.'), 'world'),
  ...Object.keys(MOD_SETTINGS).filter((vendor) => MOD_SETTINGS[vendor].editorMod)
    .map((vendor) => modFeature(vendor, () => t('features.effect.gameLoads', 'Takes effect when the game next loads.'), 'world')),
  modFeature('detailed-ships', () => t('features.effect.gameLoads', 'Takes effect when the game next loads.'), 'world'),
  modFeature('beautiful-villages', () => t('features.mod.beautifulTowns.effect', 'Takes effect the next time you start the game. Loading a save isn’t enough. Offline it also needs Replace Game Artwork.'), 'world'),
  modFeature('beautiful-cities', () => t('features.mod.beautifulTowns.effect', 'Takes effect the next time you start the game. Loading a save isn’t enough. Offline it also needs Replace Game Artwork.'), 'world'),
  modFeature('warm-ashes-ships', () => t('features.mod.warmAshesShips.effect', 'Takes effect on your next sea voyage.'), 'world'),
  modFeature('world-events-raiding-parties', () => t('features.effect.atOnce', 'Takes effect at once.'), 'world'),
  modFeature('iliac-puddle-no-more', () => t('features.effect.worldLoads', 'Takes effect when the world next loads.'), 'world'),
  modFeature('ocean-holes', () => t('features.effect.worldLoads', 'Takes effect when the world next loads.'), 'world'),
  modFeature('come-sail-away', () => t('features.effect.gameLoads', 'Takes effect when the game next loads.'), 'world'),
  modFeature('foraging', () => t('features.mod.foraging.effect', 'Takes effect right away. Its quests change when the game next loads.'), 'world'),
  modFeature('meanerMonsters', () => t('features.mod.meanerMonsters.effect', 'Takes effect on monsters that appear after the change. With Daggerfall Enemy Expansion on, it takes effect when the game next loads.'), 'combat'),
  modFeature('daggerfall-enemy-expansion', () => t('features.effect.gameLoads', 'Takes effect when the game next loads.'), 'combat'),
  modFeature('pcaao', () => t('features.effect.atOnce', 'Takes effect at once.'), 'combat'),
  modFeature('unleveledLoot', () => t('features.mod.unleveledLoot.effect', 'Takes effect on the next drop or shop restock.'), 'loot'),
  modFeature('weapon-widget', () => t('features.effect.atOnce', 'Takes effect at once.'), 'combat'),
  modFeature('shield-widget', () => t('features.effect.atOnce', 'Takes effect at once.'), 'combat'),
  modFeature('readied-spellcasting-hands', () => t('features.effect.atOnce', 'Takes effect at once.'), 'combat'),
  modFeature('diverse-weapons', () => t('features.mod.diverseWeapons.effect', 'Takes effect when a weapon is next drawn.'), 'combat'),
  modFeature('roleplay-realism-items', () => t('features.effect.gameLoads', 'Takes effect when the game next loads.'), 'loot'),
  modFeature('roleplay-realism', () => t('features.effect.gameLoads', 'Takes effect when the game next loads.'), 'loot'),
  modFeature('handheld-torches', () => t('features.effect.atOnce', 'Takes effect at once.'), 'loot'),
  modFeature('ambient-text', () => t('features.effect.atOnce', 'Takes effect at once.'), 'interface'),
  modFeature('eye-of-the-beholder', () => t('features.mod.eyeOfTheBeholder.effect', 'Takes effect at once. Scroll out to leave first person.'), 'sight'),
  modFeature('immersive-footsteps', () => t('features.effect.atOnce', 'Takes effect at once.'), 'sound'),
  modFeature('world-tooltips', () => t('features.effect.atOnce', 'Takes effect at once.'), 'interface'),
  modFeature('better-ambience', () => t('features.mod.betterAmbience.effect', 'Takes effect right away. A dungeon’s fog and light change from the next one you enter.'), 'world'),
  modFeature('horse-cart-and-cargo', () => t('features.effect.atOnce', 'Takes effect at once.'), 'world'),
  modFeature('physical-items', () => t('features.mod.physicalItems.effect', 'Takes effect right away. A size change applies to items that drop afterward.'), 'world'),
  Object.freeze({
    id: 'mod-weapon-sheathing',
    group: 'combat',
    title: 'Weapon Sheathing',
    get note() { return t('features.mod.weaponSheathing.note', 'With the Morrowind body, a put-away weapon hangs in a scabbard on your hip or back, and a bow gets a '
      + 'quiver. Off, a put-away weapon disappears, as in Morrowind.'); },
    get effect() { return t('features.mod.weaponSheathing.effect', 'Takes effect at once with the Morrowind body.'); },
    kinds: Object.freeze(['mod']),
    control: Object.freeze({ store: 'prefs', key: 'mwSheathing', initial: true, online: 'player' }),
  }),
  Object.freeze({
    id: 'steel-helm',
    group: 'combat',
    title: 'Steel Helm',
    note: 'With the Morrowind body, choose how a Steel Helm looks. Closed has a visor and a plume, and Open is a nasal helm that shows the face.',
    effect: 'Takes effect at once with the Morrowind body.',
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'mwSteelHelm', initial: 'closed', online: 'player', tiers: Object.freeze([['closed', 'Closed'], ['open', 'Open']]) }),
  }),
  Object.freeze({
    id: 'beast-footwear',
    group: 'combat',
    get title() { return t('features.beastFeet.title', 'Beast Footwear'); },
    get note() { return t('features.beastFeet.note', 'With the Morrowind body, how a Khajiit’s or an Argonian’s boots and shoes are drawn. Shafts only keeps a boot’s shaft over the bare foot and hides shoes. Hidden hides all footwear, as in Morrowind.'); },
    get effect() { return t('features.mod.weaponSheathing.effect', 'Takes effect at once with the Morrowind body.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'mwBeastFeet', initial: 'worn', online: 'player',
      tiers: Object.freeze([tier('worn', () => t('features.beast.asWorn', 'As worn')), tier('shafts', () => t('features.beastFeet.shafts', 'Shafts only')),
        tier('hidden', () => t('features.beast.hidden', 'Hidden'))]) }),
  }),
  Object.freeze({
    id: 'beast-helmets',
    group: 'combat',
    get title() { return t('features.beastHelm.title', 'Beast Helmets'); },
    get note() { return t('features.beastHelm.note', 'With the Morrowind body, how a Khajiit’s or an Argonian’s helmets are drawn. Open only hides closed helmets but keeps open ones, like the chain coif, as in Morrowind. Hidden hides them all.'); },
    get effect() { return t('features.mod.weaponSheathing.effect', 'Takes effect at once with the Morrowind body.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'mwBeastHelm', initial: 'worn', online: 'player',
      tiers: Object.freeze([tier('worn', () => t('features.beast.asWorn', 'As worn')), tier('open', () => t('features.beastHelm.open', 'Open only')),
        tier('hidden', () => t('features.beast.hidden', 'Hidden'))]) }),
  }),
  Object.freeze({
    id: 'mw-spell-effects',
    group: 'combat',
    title: 'Morrowind Spell Effects',
    note: 'With Morrowind data, spells look as they do in Morrowind: a swirl and glowing hands as you cast, the bolt in flight, the hit and the burst. Off shows only the classic spell missiles.',
    effect: 'Takes effect at once.',
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'mwSpellEffects', initial: true, online: 'player' }),
  }),
  Object.freeze({
    id: 'mw-body-motion',
    group: 'combat',
    get title() { return t('features.mwBodyMotion.title', 'Morrowind Body Motion'); },
    get note() { return t('features.mwBodyMotion.note', 'In third person a Morrowind body walks at the pace you move, carries each weapon its own way, and '
      + 'swings with its whole body while its legs keep moving. Off plays Morrowind\u2019s own animations.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'mwBodyMotion', initial: true, online: 'player' }),
  }),
  Object.freeze({
    id: 'mw-shoulder-camera',
    group: 'sight',
    get title() { return t('features.mwShoulder.title', 'Over the Shoulder'); },
    get note() { return t('features.mwShoulder.note', 'With a Morrowind body in third person, the camera sits behind a shoulder so your head no longer hides '
      + 'your aim. With a weapon or a spell out it rises over your head instead, so shots land on the crosshair.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'mwShoulderCam', initial: 'off', online: 'player', tiers: Object.freeze([
      tier('off', OFF), tier('right', () => t('features.mwShoulder.right', 'Right')), tier('left', () => t('features.mwShoulder.left', 'Left'))]) }),
  }),
  Object.freeze({
    id: 'mw-npc-bodies',
    group: 'world',
    title: 'Morrowind People',
    note: 'With the Morrowind body, the people around you get Morrowind bodies too, nearest first. Near shows up to 24, and All shows up to 48 but costs more.',
    effect: 'Takes effect at once.',
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'mwNpcBodies', initial: 'near', online: 'player', tiers: Object.freeze([['off', 'Off'], ['near', 'Near'], ['all', 'All']]) }),
  }),
  Object.freeze({
    id: 'npc-marks',
    group: 'world',
    get title() { return t('features.npcMarks.title', 'Morrowind People Marks'); },
    get note() { return t('features.npcMarks.note', 'With Morrowind People on, a small icon bobs over the people worth finding: a yellow mark over someone a '
      + 'quest needs, a coin over a merchant, and a blue gem over guild trainers, guild quest givers and the arena\u2019s officers.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'npcMarks', initial: true, online: 'player' }),
  }),
  Object.freeze({
    id: 'mw-billboard-look',
    group: 'world',
    get title() { return t('features.mwBillboardLook.title', 'Billboard Look'); },
    get note() { return t('features.mwBillboardLook.note', 'With the Morrowind body, bodies and horses stand as flat upright pictures, like the '
      + 'classic sprites. Off, they are drawn as the camera sees them in 3D.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'mwBillboardLook', initial: false, online: 'player' }),
  }),
  Object.freeze({
    id: 'mw-model-detail',
    group: 'world',
    get title() { return t('features.mwModelDetail.title', 'Morrowind Model Detail'); },
    get note() { return t('features.mwModelDetail.note', 'With the Morrowind body, Pixelated draws bodies, horses and your arms in large pixels '
      + 'like the classic sprites. Sharp draws them at your screen’s full resolution and uses more video memory.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'mwModelDetail', initial: 'pixel', online: 'player', tiers: Object.freeze([tier('pixel', () => t('features.mwModelDetail.pixel', 'Pixelated')), tier('sharp', () => t('features.mwModelDetail.sharp', 'Sharp'))]) }),
  }),
  modFeature('oblivion-remaster-leveling', () => t('features.mod.oblivionRemasterLeveling.effect', 'Takes effect on the next character you make. Existing characters keep the system they were created with.'), 'character'),
  modFeature('project-legacy', () => t('features.mod.projectLegacy.effect', 'Takes effect right away. A family keeps the model it was founded with.'), 'character'),
  Object.freeze({
    id: 'enemy-infighting',
    group: 'combat',
    get title() { return t('features.enemyInfighting.title', 'Enemies Fight Each Other'); },
    get note() { return t('features.enemyInfighting.note', 'Monsters attack anything they aren’t allied with, not just you: a bear fights a spider, a Daedra '
      + 'fights a knight. On by default in Daggerfall Unity.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['classic']),
    control: Object.freeze({ store: 'settings', key: 'Enhancements/EnemyInfighting' }),
  }),
  Object.freeze({
    id: 'varied-dungeon-monsters',
    group: 'world',
    get title() { return t('features.variedDungeonMonsters.title', 'Varied Dungeon Monsters'); },
    get note() { return t('features.variedDungeonMonsters.note', 'Random monsters are picked from the dungeon’s full list around your level, so a dungeon has more '
      + 'variety instead of the same few. Off by default in Daggerfall Unity.'); },
    get effect() { return t('features.effect.nextDungeon', 'Takes effect on the next dungeon you enter.'); },
    kinds: Object.freeze(['classic']),
    control: Object.freeze({ store: 'settings', key: 'Enhancements/AlternateRandomEnemySelection' }),
  }),
  Object.freeze({
    id: 'torches-from-items',
    group: 'loot',
    get title() { return t('features.torchesFromItems.title', 'Torches Light Your Way'); },
    get note() { return t('features.torchesFromItems.note', 'Your light in dungeons comes from a torch, lantern or candle you carry, and it burns down, instead '
      + 'of a light you always have. Off by default in Daggerfall Unity.'); },
    get effect() { return t('features.torchesFromItems.effect', 'Takes effect right away. New characters and shop stock follow it.'); },
    kinds: Object.freeze(['classic']),
    control: Object.freeze({ store: 'settings', key: 'Enhancements/PlayerTorchFromItems' }),
  }),
  Object.freeze({
    id: 'combat-voices',
    group: 'sound',
    get title() { return t('features.combatVoices.title', 'Combat Voices'); },
    get note() { return t('features.combatVoices.note', 'You and your enemies grunt when swinging and cry out when hit. The sounds are in the original game but '
      + 'go unused. On by default in Daggerfall Unity.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['classic']),
    control: Object.freeze({ store: 'settings', key: 'Enhancements/CombatVoices' }),
  }),
  Object.freeze({
    id: 'calm-hud',
    group: 'interface',
    get title() { return t('features.calmHud.title', 'Calm HUD'); },
    get note() { return t('features.calmHud.note', 'Your health, fatigue and magicka bars fade away while all three are full, and come back the moment one changes.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'hudCalm', initial: true, online: 'player' }),
  }),
  Object.freeze({
    id: 'near-death-warning',
    group: 'interface',
    get title() { return t('features.nearDeathWarning.title', 'Near Death Warning'); },
    get note() { return t('features.nearDeathWarning.note', 'The screen pulses as your health gets low: slowly below 40%, fast below 20%. On by default in '
      + 'Daggerfall Unity.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['classic']),
    control: Object.freeze({ store: 'settings', key: 'Enhancements/NearDeathWarning' }),
  }),
  Object.freeze({
    id: 'bows-left-hand',
    group: 'combat',
    get title() { return t('features.bowsLeftHand.title', 'Bows In Left Hand'); },
    get note() { return t('features.bowsLeftHand.note', 'Bows go in your left hand only, so you can keep a one-handed weapon in your right and switch between '
      + 'them. Off by default in Daggerfall Unity.'); },
    get effect() { return t('features.bowsLeftHand.effect', 'Takes effect on the next weapon you equip.'); },
    kinds: Object.freeze(['classic']),
    control: Object.freeze({ store: 'settings', key: 'Enhancements/BowLeftHandWithSwitching' }),
  }),
  Object.freeze({
    id: 'choose-guild-jobs',
    group: 'interface',
    get title() { return t('features.chooseGuildJobs.title', 'Choose Guild Jobs'); },
    get note() { return t('features.chooseGuildJobs.note', 'Guilds show you a list of the jobs you can take instead of giving you one at random. Off by default '
      + 'in Daggerfall Unity.'); },
    get effect() { return t('features.chooseGuildJobs.effect', 'Takes effect the next time a guild offers you work.'); },
    kinds: Object.freeze(['classic']),
    control: Object.freeze({ store: 'settings', key: 'Enhancements/GuildQuestListBox' }),
  }),
  Object.freeze({
    id: 'dungeon-wall-style',
    group: 'sight',
    get title() { return t('features.dungeonWallStyle.title', 'Dungeon Wall Style'); },
    get note() { return t('features.dungeonWallStyle.note', 'Which textures dungeon walls use: Classic, the region’s climate (Climate) or random (Random). Climate and Random keep main-story dungeons classic, while Climate Only and Random Only change them too. Classic by default in Daggerfall Unity.'); },
    get effect() { return t('features.effect.nextDungeon', 'Takes effect on the next dungeon you enter.'); },
    kinds: Object.freeze(['classic']),
    control: Object.freeze({ store: 'settings', key: 'Video/RandomDungeonTextures', classic: 0 }),
  }),
  Object.freeze({
    id: 'quick-slots',
    group: 'interface',
    get title() { return t('features.quickSlots.title', 'Quick slots'); },
    get note() { return t('features.quickSlots.note', 'Diamond puts 4 slots in a diamond at the bottom left, on keys 1 to 4. Hotbar puts 10 above your health bars on keys 1 to 0. Diamonds makes them diamonds. Drag an item or spell onto a slot, or point at it and press the key. Off hides them, but their keys still work.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({
      store: 'prefs', key: 'quickbarStyle', initial: 'hotbar', online: 'player', lane: 'quickSlots',
      also: Object.freeze([Object.freeze({ store: 'prefs', key: 'quickslots', initial: true, online: 'player' }),
        Object.freeze({ store: 'prefs', key: 'hotbarShape', initial: 'square', online: 'player' })]),
    }),
  }),
  Object.freeze({
    id: 'loading-screen',
    group: 'interface',
    title: 'Loading screens',
    note: 'While the world loads, a screen shows where you are going over one of your screenshots or the menu\u2019s '
      + 'night sky. Choose the screenshots under Screenshots in the menu. '
      + 'Off shows no screen, except when a game starts from the menu.',
    effect: 'Takes effect at the next load.',
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({
      store: 'prefs', key: 'loadingScreen', initial: 'shots', online: 'player',
      tiers: Object.freeze([['shots', 'Your screenshots'], ['art', 'Night sky'], ['off', 'Off']]),
    }),
  }),
  Object.freeze({
    id: 'event-board',
    group: 'interface',
    get title() { return t('features.eventBoard.title', 'Event board'); },
    get note() { return t('features.eventBoard.note', 'A board at the left of the screen lists the world events you can still reach, with how far away each one '
      + 'is and the time left. Their news opens at the top of the board and is kept in your journal. Turn an event off with its own button and '
      + 'it leaves the board, its news kept in your journal alone. Off, the news goes back to the chat and the screen\'s message line.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['enhanced', 'classic']),
    control: Object.freeze({
      store: 'prefs', key: 'eventBoard', initial: true, online: 'player',
      also: Object.freeze(EVENT_KIND_ORDER.map((kind) => Object.freeze({ store: 'prefs', key: eventKindPref(kind), initial: true, online: 'player' }))),
      parts: Object.freeze(EVENT_KIND_ORDER.map((kind) => Object.freeze({ key: eventKindPref(kind), get label() { return EVENT_KINDS[kind].label; } }))),
    }),
  }),
  Object.freeze({
    id: 'quest-herald',
    group: 'interface',
    get title() { return t('features.questHerald.title', 'Quest news'); },
    get note() { return t('features.questHerald.note', 'A notice slides in when a quest begins, when its journal gains an entry, when one of its deadlines is '
      + 'less than a day away, and when it ends. Off updates the journal without a notice.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'questHerald', initial: true, online: 'player' }),
  }),
  Object.freeze({
    id: 'quest-tracker',
    group: 'interface',
    get title() { return t('features.questTracker.title', 'Quest tracker'); },
    get note() { return t('features.questTracker.note', 'A card at the top right shows the quest you track from the journal, or else the one it last updated: its '
      + 'newest entry, where it points and the time left. Off keeps the classic screen, with no quest card.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'questTracker', initial: true, online: 'player' }),
  }),
  Object.freeze({
    id: 'quest-marks',
    group: 'interface',
    get title() { return t('features.questMarks.title', 'Quest marks'); },
    get note() { return t('features.questMarks.note', 'Places your quests send you to are marked on the map once your map knows them, and the quest you follow is '
      + 'marked on the compass. Off is the classic map and compass, which mark nothing for a quest.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'questMarks', initial: true, online: 'player' }),
  }),
  Object.freeze({
    id: 'quest-guidance',
    group: 'interface',
    title: 'Quest guidance',
    note: 'Journal marks only places your map already knows. Town also circles the building your journal names, on the '
      + 'Enhanced town map and your compass. Exact also marks a quest\u2019s item, person or foe in dungeons and buildings, '
      + 'which can spoil the search.',
    effect: 'Takes effect at once.',
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'questGuidance', initial: 'journal', online: 'player', classic: 'journal', tiers: Object.freeze([['journal', 'Journal'], ['town', 'Town'], ['exact', 'Exact']]) }),
  }),
  Object.freeze({
    id: 'dungeon-sense',
    group: 'interface',
    title: 'Look around',
    note: 'In a dungeon, selecting Info mode makes the levers, doors and containers near you and in sight glow for '
      + 'a few seconds. With secrets, walls that only a lever moves glow too.',
    effect: 'Takes effect at once.',
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'dungeonSense', initial: 'on', online: 'player', tiers: Object.freeze([['off', 'Off'], ['on', 'On'], ['secrets', 'With secrets']]) }),
  }),
  Object.freeze({
    id: 'dungeon-echoes',
    group: 'interface',
    title: 'Lever echoes',
    note: 'When a lever or a plate moves something out of sight, a message says which way, the Enhanced map marks it, and '
      + 'it glows when you reach it. In Info mode, a lever\u2019s World Tooltips label says which way it works.',
    effect: 'Takes effect at once.',
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'dungeonEchoes', initial: true, online: 'player' }),
  }),
  Object.freeze({
    id: 'dungeon-way-out',
    group: 'interface',
    title: 'Way out',
    note: 'In a dungeon, an arrow on the compass leads you back the way you came, to the entrance.',
    effect: 'Takes effect at once.',
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'dungeonWayOut', initial: true, online: 'player' }),
  }),
  Object.freeze({
    id: 'dungeon-route-line',
    group: 'interface',
    title: 'Dungeon exit route',
    note: 'Draw a blue floor line along the explored route back to the dungeon entrance. Requires Way out.',
    effect: 'Takes effect at once.',
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'dungeonWayOutLine', initial: false, online: 'player' }),
  }),
  Object.freeze({
    id: 'wilderness-camps',
    group: 'world',
    get title() { return t('features.wildernessCamps.title', 'Wilderness camps & packs'); },
    get note() { return t('features.wildernessCamps.note', 'Out in the wilds you sometimes meet a small group of enemies, a camp or a roaming pack, instead of '
      + 'only one at a time. Off keeps the classic single encounters.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'wildernessCamps', initial: true, online: 'player' }),
  }),
  Object.freeze({
    id: 'road-encounters',
    group: 'world',
    title: 'Encounters on the road',
    note: 'While you travel, enemies far below your level no longer stop you, and others sometimes come as a '
      + 'patrol. Off stops for every encounter, like the original.',
    effect: 'Takes effect at once.',
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'roadEncounters', initial: true, online: 'player' }),
  }),
  Object.freeze({
    id: 'town-watch',
    group: 'world',
    get title() { return t('features.townWatch.title', 'The watch defends the town'); },
    get note() { return t('features.townWatch.note', 'When a monster attacks you in a town and you’re not wanted, the town guard comes to help, then '
      + 'leaves once it’s safe. Commit a crime and they come for you as usual. Off keeps the classic guard, '
      + 'which only shows up for crimes.'); },
    get effect() { return t('features.effect.atOnce', 'Takes effect at once.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({ store: 'prefs', key: 'townWatch', initial: true, online: 'player' }),
  }),
  Object.freeze({
    id: 'blood',
    group: 'combat',
    get title() { return t('features.blood.title', 'Blood'); },
    get note() { return t('features.blood.note', 'Stains stay on floors and walls where blood lands. A big killing blow sprays it further, and a heavy hit on you splashes a few drops on the screen. The slider sets how much, from Light to Abattoir. Off keeps the classic fading splash.'); },
    get effect() { return t('features.blood.effect', 'Takes effect right away. How many marks stay changes when the game next loads or you enter a dungeon.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({
      store: 'prefs', key: 'blood-gore', initial: 'normal', online: 'player', lane: 'blood',
      also: Object.freeze([
        Object.freeze({ store: 'prefs', key: 'blood-marks', initial: true, online: 'player' }),
        Object.freeze({ store: 'prefs', key: 'blood-overkill', initial: true, online: 'player' }),
        Object.freeze({ store: 'prefs', key: 'blood-screen', initial: true, online: 'player' }),
      ]),
      parts: Object.freeze([
        Object.freeze({ key: 'blood-marks', get label() { return t('features.blood.marks', 'Marks stay'); } }),
        Object.freeze({ key: 'blood-overkill', get label() { return t('features.blood.overkill', 'Overkill'); } }),
        Object.freeze({ key: 'blood-screen', get label() { return t('features.blood.screen', 'On the lens'); } }),
      ]),
    }),
  }),
  Object.freeze({
    id: 'mod-climates-calories',
    group: 'character',
    get title() { return t('features.mod.title', '{title} by {author}', { title: 'Climates & Calories', author: 'Ralzar' }); },
    get note() { return t('features.mod.climatesCalories.note', 'Hunger, thirst, sleep and the weather come into play, so eat, drink, dress for the climate and rest by a fire or in a bed. Boons only rewards you, Casual borrows a little stamina, Hard can make you sick, and Off is the classic game.'); },
    get effect() { return t('features.mod.climatesCalories.effect', 'Takes effect at once. Online, each player picks their own.'); },
    kinds: Object.freeze(['mod', 'enhanced', 'classic']),
    control: Object.freeze({
      store: 'prefs', key: 'survival', initial: 'boons', online: 'player',
      tiers: Object.freeze([tier(false, OFF), tier('boons', () => t('features.mod.climatesCalories.boons', 'Boons')), tier('casual', () => t('features.mod.climatesCalories.casual', 'Casual')), tier('hard', () => t('features.mod.climatesCalories.hard', 'Hard'))]),
      also: Object.freeze([Object.freeze({ store: 'prefs', key: 'survivalTempHud', initial: true, online: 'player' })]),
      parts: Object.freeze([Object.freeze({ key: 'survivalTempHud', get label() { return t('features.mod.climatesCalories.tempHud', 'Temperature on the HUD'); } })]),
    }),
  }),
  Object.freeze({
    id: 'naval-combat',
    group: 'combat',
    get title() { return t('features.navalCombat.title', 'Naval Combat'); },
    get note() { return t('features.navalCombat.note', 'Ship battles on Come Sail Away’s boats. At the helm, look to one side and hold Attack to aim a broadside, then let go to fire. Pirates, merchant ships and navies sail the Bay. Batter a ship until it surrenders, board it, take its cargo, then sink it or let it go. Piracy is a crime, and pirates can board your ship and fight you on deck. Online, everyone in the room shares one sea.'); },
    get effect() { return t('features.navalCombat.effect', 'Takes effect right away. Ship handling changes the next time you take the helm. Online it’s always on.'); },
    kinds: Object.freeze(['enhanced']),
    control: Object.freeze({
      store: 'prefs', key: 'naval', initial: true, online: true,
      also: Object.freeze([
        Object.freeze({ store: 'prefs', key: 'naval-ships', initial: 'some', online: 'player' }),
        Object.freeze({ store: 'prefs', key: 'naval-boarders', initial: true, online: 'player' }),
        Object.freeze({ store: 'prefs', key: 'naval-raid-prize', initial: true, online: 'player' }),
        Object.freeze({ store: 'prefs', key: 'naval-aim-camera', initial: true, online: 'player' }),
        Object.freeze({ store: 'prefs', key: 'naval-handling', initial: 'responsive', online: 'player' }),
        Object.freeze({ store: 'prefs', key: 'naval-auto-repair', initial: true, online: 'player' }),
      ]),
      parts: Object.freeze([
        Object.freeze({ key: 'naval-ships', get label() { return t('features.navalCombat.ships', 'Ships at sea'); },
          tiers: Object.freeze([tier('few', () => t('features.navalCombat.ships.few', 'Few')), tier('some', () => t('features.navalCombat.ships.some', 'Some')), tier('many', () => t('features.navalCombat.ships.many', 'Many'))]) }),
        Object.freeze({ key: 'naval-boarders', get label() { return t('features.navalCombat.boarders', 'Pirates board you'); } }),
        Object.freeze({ key: 'naval-raid-prize', get label() { return t('features.navalCombat.raidPrize', 'Raiders\u2019 plunder'); } }),
        Object.freeze({ key: 'naval-aim-camera', get label() { return t('features.navalCombat.aimCamera', 'Broadside camera'); } }),
        Object.freeze({ key: 'naval-handling', get label() { return t('features.navalCombat.handling', 'Ship handling'); },
          tiers: Object.freeze([tier('responsive', () => t('features.navalCombat.handling.responsive', 'Responsive')), tier('classic', () => t('features.navalCombat.handling.classic', 'Classic'))]) }),
        Object.freeze({ key: 'naval-auto-repair', get label() { return t('features.navalCombat.autoRepair', 'Crew repairs on their own'); } }),
      ]),
    }),
  }),
]);

const _lanes = new Map();
export function registerFeatureLane(name, lane) { _lanes.set(name, Object.freeze({ ...lane })); }
export const featureLane = (name) => _lanes.get(name) ?? null;
export function resolveControl(f) {
  const c = f?.control;
  if (!c || typeof c !== 'object' || !c.lane) return c;
  return { ...c, ...(_lanes.get(c.lane) ?? {}) };
}
const declaredPrefs = (list) => list.flatMap((f) => [f.control, ...(f.control?.also ?? [])])
  .filter((c) => c?.store === 'prefs' && c.initial !== undefined);
export const FEATURE_PREF_DEFAULTS = Object.freeze(Object.fromEntries(declaredPrefs(FEATURES).map((c) => [c.key, c.initial])));
export const FEATURE_PREF_ONLINE = Object.freeze(Object.fromEntries(declaredPrefs(FEATURES).map((c) => [c.key, c.online])));
declareOnlinePrefs(FEATURE_PREF_ONLINE);

export function featureForControl(store, key, vendor = null) {
  const is = (k) => k.store === store && k.key === key && (store !== 'mods' || k.vendor === vendor);
  return FEATURES.find((f) => is(f.control) || (f.control.also ?? []).some(is)) ?? null;
}

function storeHas(control) {
  switch (control.store) {
    case 'prefs': return typeof control.key === 'string' && !!control.key;
    case 'settings': return ALL_KEYS.includes(control.key);
    case 'mods': return !!MOD_SETTINGS[control.vendor]?.keys?.[control.key];
    default: return false;
  }
}

export function checkFeature(f) {
  const out = [];
  if (!f || typeof f !== 'object') return ['not an object'];
  if (typeof f.id !== 'string' || !f.id) out.push('no id');
  if (typeof f.title !== 'string' || !f.title) out.push('no title');
  if (!GROUPS[f?.group]) out.push(`unknown group '${f?.group}'`);
  if (!Array.isArray(f.kinds) || !f.kinds.length) out.push('no kinds');
  else {
    for (const k of f.kinds) if (!KINDS[k]) out.push(`unknown kind '${k}'`);
    if (new Set(f.kinds).size !== f.kinds.length) out.push('a kind repeated');
  }
  const c = resolveControl(f);
  if (!c || typeof c !== 'object') out.push('no control');
  else if (!STORES.includes(c.store)) out.push(`unknown store '${c.store}'`);
  else if (!storeHas(c)) out.push(`${c.store} has no key '${c.store === 'mods' ? `${c.vendor}/` : ''}${c.key}'`);
  else if (c.store === 'prefs') {
    if (c.initial === undefined) out.push('a prefs row declares its initial value');
    if (!(c.online === true || c.online === false || c.online === 'player')) out.push("a prefs row declares its online answer: true, false or 'player'");
    if (c.lane && !_lanes.has(c.lane)) out.push(`lane '${c.lane}' is not registered`);
    if (c.tiers !== undefined) {
      if (!Array.isArray(c.tiers) || !c.tiers.length) out.push('tiers is not a list');
      else {
        const def = c.default ?? c.initial;
        if (!c.tiers.some(([v]) => String(v) === String(def))) out.push(`tiers do not include the default ${def}`);
      }
    }
  }
  if (c && typeof c === 'object' && c.also !== undefined) {
    if (!Array.isArray(c.also)) out.push('also is not a list');
    else for (const a of c.also) {
      if (!a || !STORES.includes(a.store)) out.push(`also: unknown store '${a?.store}'`);
      else if (!storeHas(a)) out.push(`also: ${a.store} has no key '${a.store === 'mods' ? `${a.vendor}/` : ''}${a.key}'`);
      else if (a.store === 'prefs') {
        if (a.initial === undefined) out.push(`also: the covered pref '${a.key}' declares its initial value`);
        if (!(a.online === true || a.online === false || a.online === 'player')) out.push(`also: the covered pref '${a.key}' declares its online answer`);
      }
    }
  }
  if (c && typeof c === 'object' && c.parts !== undefined) {
    const own = new Set([c.key, ...(Array.isArray(c.also) ? c.also.filter((a) => a?.store === 'prefs').map((a) => a.key) : [])]);
    if (c.store !== 'prefs') out.push('parts are prefs, on a prefs row');
    if (!Array.isArray(c.parts) || !c.parts.length) out.push('parts is not a list');
    else for (const pt of c.parts) {
      if (!pt || !own.has(pt.key)) out.push(`part '${pt?.key}' is not the row's key or one it covers`);
      if (typeof pt?.label !== 'string' || !pt.label) out.push(`part '${pt?.key}' has no label`);
      if (pt?.tiers !== undefined && (!Array.isArray(pt.tiers) || pt.tiers.length < 2)) out.push(`part '${pt?.key}': tiers is not a list`);
    }
  }
  if (c && typeof c === 'object' && c.classic !== undefined) {
    const ok = c.store === 'prefs' ? Array.isArray(c.tiers) && c.tiers.some(([v]) => String(v) === String(c.classic))
      : c.store === 'settings' && Number.isInteger(c.classic) && c.classic >= 0;
    if (!ok) out.push(`classic '${c.classic}' is not one of the row's values`);
  }
  if (c && typeof c === 'object') {
    if (c.read !== undefined && typeof c.read !== 'function') out.push('read is not a function');
    if (c.write !== undefined && typeof c.write !== 'function') out.push('write is not a function');
    if ((c.read === undefined) !== (c.write === undefined)) out.push('read and write come together');
  }
  return out;
}

export function checkFeatures(list) {
  const out = [];
  const ids = new Set();
  const controls = new Set();
  list.forEach((f, i) => {
    const name = f?.id ?? `#${i}`;
    for (const p of checkFeature(f)) out.push(`${name}: ${p}`);
    if (ids.has(f?.id)) out.push(`${name}: id repeated`);
    ids.add(f?.id);
    const c = f?.control;
    if (c && typeof c === 'object') {
      for (const k of [c, ...(Array.isArray(c.also) ? c.also : [])]) {
        const sig = `${k.store}:${k.vendor ?? ''}:${k.key}`;
        if (controls.has(sig)) out.push(`${name}: control repeated (${sig})`);
        controls.add(sig);
      }
    }
  });
  return out;
}

const fold = (t) => String(t ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2018\u2019]/g, "'").toLowerCase();
export function featureSearchText(f) {
  const c = f?.control ?? {};
  const mod = c.store === 'mods' ? MOD_SETTINGS[c.vendor] : null;
  return fold([f?.title, f?.note, GROUPS[f?.group]?.label, ...(f?.kinds ?? []).map((k) => KINDS[k]?.label),
    ...(c.parts ?? []).map((pt) => pt.label), mod?.title, mod?.author, c.vendor].filter(Boolean).join(' \n '));
}
export function matchesFeatureQuery(f, query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = featureSearchText(f);
  return words.every((w) => text.includes(w));
}

export function filterFeatures(list, kind) {
  return kind == null ? list.slice() : list.filter((f) => f.kinds.includes(kind));
}

export function featureCounts(list) {
  const out = { all: list.length };
  for (const k of KIND_ORDER) out[k] = 0;
  for (const f of list) for (const k of f.kinds) if (out[k] !== undefined) out[k] += 1;
  return out;
}
