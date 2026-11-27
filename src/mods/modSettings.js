// Switches of vendored mods: one small store keyed by the vendor folder, with the names, defaults,
// and descriptions that each modsettings ships. It uses the storage seam, or memory without one.

import { appStorage } from '../platform/appStorage.js';
import { onlineForcedModSetting, onlineWholeModKey, isOnlinePage, rollingAsTheRoom } from '../platform/onlineLane.js';
import { FOOT_SKIN_COUNT, CLASS_SKINS, classSkinLabel } from '../player/classSkins.js';
import { t, localizedText } from '../ui/textManager.js';
import { EDITOR_MODS } from './editorMods.js';

const STORE_KEY = 'dfjs-mod-settings';

const lazyWords = (...words) => Object.freeze(Object.defineProperties([], Object.fromEntries(
  words.map((w, i) => [i, typeof w === 'function' ? { get: w, enumerable: true } : { value: w, enumerable: true }]))));
const SHIELD_STANCES = lazyWords(() => t('mods.shieldWidget.option.hide', 'Hide'), () => t('mods.shieldWidget.option.offScreen', 'Off-screen'), () => t('mods.shieldWidget.option.corner', 'Corner'), () => t('mods.shieldWidget.option.ready', 'Ready'));
const EOTB_VIEWS = lazyWords(() => t('mods.eyeOfTheBeholder.option.dontChange', 'Don\'tChange'), () => t('mods.eyeOfTheBeholder.option.firstPerson', 'FirstPerson'), () => t('mods.eyeOfTheBeholder.option.thirdPerson', 'ThirdPerson'));

const DECLARED_MOD_SETTINGS = Object.freeze({
  'dynamic-skies': Object.freeze({
    title: 'Dynamic Skies',
    author: 'BadLuckBurt and carademono',
    keys: Object.freeze({
      Enabled: Object.freeze({ default: true, get description() { return t('mods.dynamicSkies.Enabled.description', 'Replaces the outdoor sky with layered weather clouds, twinkling stars, both moons, tinted fog, longer sunrises and sunsets, and storm lightning. Turn this off to use the default sky.'); } }),
      densitySetting: Object.freeze({ default: 1, min: 1, max: 10, get description() { return t('mods.dynamicSkies.densitySetting.description', 'Makes fog thicker'); } }),
      ActivatePixelSnow: Object.freeze({ default: false, get description() { return t('mods.dynamicSkies.ActivatePixelSnow.description', 'Turn the pixel snow replacement on or off'); } }),
      MinParticleSize: Object.freeze({ default: 100, min: 100, max: 800, get description() { return t('mods.dynamicSkies.MinParticleSize.description', 'Minimum snow particle size'); } }),
      MaxParticleSize: Object.freeze({ default: 300, min: 100, max: 800, get description() { return t('mods.dynamicSkies.MaxParticleSize.description', 'Maximum snow particle size'); } }),
      MaxParticles: Object.freeze({ default: 20, min: 15, max: 20, get description() { return t('mods.dynamicSkies.MaxParticles.description', 'Has no effect: the mod never uses this setting.'); } }),
    }),
  }),
  'world-tooltips': Object.freeze({
    title: 'World Tooltips',
    author: 'jefetienne',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.worldTooltips.Enabled.description', 'Shows crosshair tooltips for NPCs, shops and hours, door locks, exits, levers, ladders, bookshelves, and Daedra you can summon. Chest and corpse contents still appear when turned off.');
        },
      }),
      HideDefaultInteractTooltip: Object.freeze({
        default: false,
        get description() { return t('mods.worldTooltips.HideDefaultInteractTooltip.description', 'Hides the label on things that may be meant to stay secret, such as the puzzles of the main quest.'); },
      }),
    }),
  }),
  'readied-spellcasting-hands': Object.freeze({
    title: 'Readied Spellcasting Hands',
    author: 'jefetienne',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        description: 'Your casting hands come up and stay raised while a readied spell waits for your click. '
          + 'Spells you cast on yourself go off at once.',
      }),
    }),
  }),
  'seasons-iliac-bay': Object.freeze({
    title: 'Seasons of the Iliac Bay',
    author: 'RosyTheRascal',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.seasonsIliacBay.Enabled.description', 'Trees, rocks, and plants change with spring, autumn, and winter. Add your own copy of the mod under Your own textures, or classic textures are used.');
        },
      }),
    }),
  }),
  'low-poly-trees': Object.freeze({
    title: 'Low Poly Trees',
    author: 'SquidKamer',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        description: 'The wilderness trees, bushes and stumps in 3D, made from the original game’s tree pictures, '
          + 'out to your full view distance. They change with Seasons of the Iliac Bay and in winter.',
      }),
    }),
  }),
  'roads-hazelnut': Object.freeze({
    title: 'Basic Roads',
    author: 'Hazelnut',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.roadsHazelnut.Enabled.description', 'Paints Hazelnut’s roads, tracks, rivers, and streams across the Iliac Bay terrain. When turned off, the game generates its own roads between towns.');
        },
      }),
      SmoothRoads: Object.freeze({ default: true, get description() { return t('mods.roadsHazelnut.SmoothRoads.description', 'Lightly smooths road surfaces. Turn it off for slightly better performance.'); } }),
      RiversAndStreams: Object.freeze({ default: false, get description() { return t('mods.roadsHazelnut.RiversAndStreams.description', 'Draws rivers and streams on the land.'); } }),
    }),
  }),
  'world-of-daggerfall': Object.freeze({
    title: 'World of Daggerfall',
    author: 'Kamer',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.worldOfDaggerfall.Enabled.description', 'Adds wilderness landmarks across the Iliac Bay, including bandit camps, forts, ruins, shrines, mountains, and rock fields. Encounter bandits, bears, and treasure, plus a camp outside Privateer’s Hold.');
        },
      }),
      Mountains: Object.freeze({
        default: false,
        description: 'Adds the mod’s mountains: giant, sharp rock spires. Off, the land has rounded mountains instead.',
      }),
    }),
  }),
  'aquatic-sprites': Object.freeze({
    title: 'Aquatic Sprites',
    author: 'Cliffworms',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.aquaticSprites.Enabled.description', 'Places seaweed, coral, and shells in 3 flooded dungeon areas. The original game includes these sprites, but never uses them.');
        },
      }),
    }),
  }),
  'bunnyfall-dungeons': Object.freeze({
    title: 'Bunnyfall Dungeons',
    author: 'Bunnyfall',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.bunnyfallDungeons.Enabled.description', 'Dungeons built with the Bunnyfall Dungeon Editor.');
        },
      }),
    }),
  }),
  'detailed-ships': Object.freeze({
    title: 'Detailed Ships',
    author: 'Cliffworms',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.detailedShips.Enabled.description', 'Rebuilds your ship with rigging, crates, barrels, a small boat, a rudder, and railings on deck. Below deck adds crew quarters, a kitchen, a cargo hold, an armory, a shrine to Kynareth, and sailors to talk to.');
        },
      }),
    }),
  }),
  'beautiful-villages': Object.freeze({
    title: 'Beautiful Villages of Daggerfall',
    author: 'carademono',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        description: 'Villages, hamlets, farms, manors and temples get new layouts, and roadside taverns are rebuilt. '
          + 'A town where you own a house, rent a room or have a quest building stays as you found it.',
      }),
    }),
  }),
  'beautiful-cities': Object.freeze({
    title: 'Beautiful Cities of Daggerfall',
    author: 'carademono',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        description: 'Cities get new layouts, with new districts, walls, gates, markets and docks. A city where you '
          + 'own a house, rent a room or have a quest building stays as you found it.',
      }),
    }),
  }),
  'warm-ashes-ships': Object.freeze({
    title: 'Warm Ashes - Ships',
    author: 'Kamer',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.warmAshesShips.Enabled.description', 'Pirates attack 1 in 4 ship voyages. Fight them on deck alongside your crew (using a chartered ship if you do not own one) before arriving at your destination.');
        },
      }),
    }),
  }),
  'world-events-raiding-parties': Object.freeze({
    title: 'World Events - Raiding Parties',
    author: 'Kamer',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.worldEventsRaidingParties.Enabled.description', 'Knights, bandits, or orcs raid towns for 2 hours while guards fight beside you. Defeat 15 to 25 raiders to free the town and gain regional reputation. Online players in town share the raid.');
        },
      }),
    }),
  }),
  'foraging': Object.freeze({
    title: 'Foraging',
    author: 'Harbinger451',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.foraging.Enabled.description', 'Use a Wood-Axe, Pick-Axe, Sickle, Spade, Fishing-Net, or Basket in the wilderness to chop wood, mine, cut plants, rob graves, fish, or forage. Gather by day away from towns and enemies, with finds based on your attributes, climate, and season.');
        },
      }),
    }),
  }),
  'iliac-puddle-no-more': Object.freeze({
    title: 'Iliac Puddle No More',
    author: 'jet082',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.iliacPuddleNoMore.Enabled.description', 'The seafloor drops away from every coast to depths of up to 250 meters. Swim in open water with a breath meter among fish, seaweed, coral, shipwrecks, sunken loot, and creatures of the deep.');
        },
      }),
      'General.WaterDepth': Object.freeze({ default: 250.0, min: 5.0, max: 250.0, float: true, step: 1, get description() { return t('mods.iliacPuddleNoMore.General.WaterDepth.description', 'Maximum water depth'); } }),
      'General.SpawnWaterSurfaces': Object.freeze({ default: true, get description() { return t('mods.iliacPuddleNoMore.General.SpawnWaterSurfaces.description', 'Show the water surface'); } }),
      'General.SpawnUnderwaterEnemies': Object.freeze({ default: true, get description() { return t('mods.iliacPuddleNoMore.General.SpawnUnderwaterEnemies.description', 'Spawn underwater enemies'); } }),
      'General.EnemyFrequency': Object.freeze({ default: 0.3, min: 0.0, max: 1.0, float: true, step: 0.05, get description() { return t('mods.iliacPuddleNoMore.General.EnemyFrequency.description', 'Enemy frequency rate'); } }),
      'General.MaxLiveEnemies': Object.freeze({ default: 32, min: 0, max: 256, get description() { return t('mods.iliacPuddleNoMore.General.MaxLiveEnemies.description', 'Maximum underwater enemies at once'); } }),
      'General.PassiveFishFrequency': Object.freeze({ default: 0.8, min: 0.0, max: 1.0, float: true, step: 0.05, get description() { return t('mods.iliacPuddleNoMore.General.PassiveFishFrequency.description', 'Fish frequency rate'); } }),
      'General.MaxLiveFish': Object.freeze({ default: 720, min: 0, max: 1080, get description() { return t('mods.iliacPuddleNoMore.General.MaxLiveFish.description', 'Maximum fish at once'); } }),
      'General.SpawnUnderwaterDecorations': Object.freeze({ default: true, get description() { return t('mods.iliacPuddleNoMore.General.SpawnUnderwaterDecorations.description', 'Decorate the seafloor'); } }),
      'General.DecorationPopulateRadius': Object.freeze({ default: 2, min: 1, max: 3, get description() { return t('mods.iliacPuddleNoMore.General.DecorationPopulateRadius.description', 'How far around you the seafloor is decorated, in map squares. At 3, decorations do not pop in.'); } }),
      'General.DecorationFrequency': Object.freeze({ default: 0.3, min: 0.0, max: 1.0, float: true, step: 0.05, get description() { return t('mods.iliacPuddleNoMore.General.DecorationFrequency.description', 'Decoration rate'); } }),
      'General.MaxDecorationsPerTile': Object.freeze({ default: 1080, min: 64, max: 2160, get description() { return t('mods.iliacPuddleNoMore.General.MaxDecorationsPerTile.description', 'Maximum decorations per map square. Lower values improve performance.'); } }),
      'General.SeafloorLootRate': Object.freeze({ default: 0.5, min: 0.0, max: 1.0, float: true, step: 0.05, get description() { return t('mods.iliacPuddleNoMore.General.SeafloorLootRate.description', 'Random loot rate'); } }),
      'General.MaxLiveLootObjects': Object.freeze({ default: 192, min: 0, max: 256, get description() { return t('mods.iliacPuddleNoMore.General.MaxLiveLootObjects.description', 'Maximum loose loot at once'); } }),
      'General.TreasureClusterRate': Object.freeze({ default: 0.3, min: 0.0, max: 1.0, float: true, step: 0.05, get description() { return t('mods.iliacPuddleNoMore.General.TreasureClusterRate.description', 'Wreckage treasure rate'); } }),
      'General.MaxLiveTreasureClusters': Object.freeze({ default: 12, min: 0, max: 32, get description() { return t('mods.iliacPuddleNoMore.General.MaxLiveTreasureClusters.description', 'Maximum wrecks'); } }),
      'General.TreasureCove': Object.freeze({ default: false, get description() { return t('mods.iliacPuddleNoMore.General.TreasureCove.description', 'More and better loot'); } }),
      'General.WaterSurfaceTopTransparency': Object.freeze({ default: 0.7, min: 0.0, max: 1.0, float: true, step: 0.05, get description() { return t('mods.iliacPuddleNoMore.General.WaterSurfaceTopTransparency.description', 'Water surface transparency from above'); } }),
      'General.WaterSurfaceBottomTransparency': Object.freeze({ default: 0.2, min: 0.0, max: 1.0, float: true, step: 0.05, get description() { return t('mods.iliacPuddleNoMore.General.WaterSurfaceBottomTransparency.description', 'Water surface transparency from below'); } }),
      'General.DarkerSurfaceWater': Object.freeze({ default: 0.0, min: 0.0, max: 1.0, float: true, step: 0.05, get description() { return t('mods.iliacPuddleNoMore.General.DarkerSurfaceWater.description', 'Darker surface water tint'); } }),
      'General.UnderwaterFogStrength': Object.freeze({ default: 0.5, min: 0.0, max: 1.0, float: true, step: 0.05, get description() { return t('mods.iliacPuddleNoMore.General.UnderwaterFogStrength.description', 'Underwater fog strength'); } }),
      'General.UnderwaterFogDistance': Object.freeze({ default: 0.3, min: 0.0, max: 1.0, float: true, step: 0.05, get description() { return t('mods.iliacPuddleNoMore.General.UnderwaterFogDistance.description', 'Underwater fog view distance'); } }),
      'General.SwimSpeedMultiplier': Object.freeze({ default: 1.0, min: 0.25, max: 30.0, float: true, step: 0.25, get description() { return t('mods.iliacPuddleNoMore.General.SwimSpeedMultiplier.description', 'Multiplies your swimming speed outdoors'); } }),
      'General.EnableSwimStroke': Object.freeze({ default: true, get description() { return t('mods.iliacPuddleNoMore.General.EnableSwimStroke.description', 'Press Run while swimming for a burst of speed'); } }),
      'General.ArgonianInfiniteBreath': Object.freeze({ default: true, get description() { return t('mods.iliacPuddleNoMore.General.ArgonianInfiniteBreath.description', 'Argonians never drown'); } }),
    }),
  }),
  // Listed after Iliac Puddle No More, its one non-optional dependency, which DFU loads first.
  'ocean-holes': Object.freeze({
    title: 'There’s a Hole in the Bottom of the Ocean',
    author: 'jet082',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.oceanHoles.Enabled.description', 'Adds deep-sea blue holes shrouded in dark mist that lead into flooded dungeons with better loot. Appears in about 1 in 48 open-sea squares and requires Iliac Puddle No More.');
        },
      }),
      'General.PitSpawnRate': Object.freeze({ default: 0.5, min: 0.0, max: 1.0, float: true, step: 0.05, get description() { return t('mods.oceanHoles.General.PitSpawnRate.description', 'Blue hole spawn rate: none at 0, 1 in 48 sea squares at 0.5, and 1 in 24 at 1.0.'); } }),
      'General.SurfaceHoleSize': Object.freeze({ default: 0.5, min: 0.0, max: 1.0, float: true, step: 0.05, get description() { return t('mods.oceanHoles.General.SurfaceHoleSize.description', 'Surface hole size'); } }),
      'General.SeafloorHoleSize': Object.freeze({ default: 0.5, min: 0.0, max: 1.0, float: true, step: 0.05, get description() { return t('mods.oceanHoles.General.SeafloorHoleSize.description', 'Sea floor hole size'); } }),
      'General.MiasmaParticleCount': Object.freeze({ default: 0.5, min: 0.0, max: 1.0, float: true, step: 0.05, get description() { return t('mods.oceanHoles.General.MiasmaParticleCount.description', 'Amount of mist over a hole'); } }),
      'General.MiasmaHeight': Object.freeze({ default: 0.5, min: 0.0, max: 1.0, float: true, step: 0.05, get description() { return t('mods.oceanHoles.General.MiasmaHeight.description', 'Height of the mist over a hole'); } }),
      'General.DungeonVisualIntensity': Object.freeze({ default: 0.5, min: 0.0, max: 1.0, float: true, step: 0.05, get description() { return t('mods.oceanHoles.General.DungeonVisualIntensity.description', 'Underwater dungeon fog intensity'); } }),
      'General.DungeonVisualDarkness': Object.freeze({ default: 0.5, min: 0.0, max: 1.0, float: true, step: 0.05, get description() { return t('mods.oceanHoles.General.DungeonVisualDarkness.description', 'How dark the fog and light are in flooded dungeons'); } }),
    }),
  }),
  'come-sail-away': Object.freeze({
    title: 'Come Sail Away',
    author: 'RedRoryOTheGlen',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.comeSailAway.Enabled.description', 'Buy boat parts or a deed at a shipyard. A deed works only near a port. Row or sail, and pack the boat to take along. It holds what you and your cart carry and shows on the travel map.');
        },
      }),
      'Controls.Disembark': Object.freeze({ default: 'C', text: true, get description() { return t('mods.comeSailAway.Controls.Disembark.description', 'Leave the helm (the Transport key also works).'); } }),   // CSA-D / KB1: not read by the mod any more - the key is the registry's action (inputActions.js MOD_ACTIONS); a player's saved value is carried there once (migrateKeyBinds)
      'Controls.ToggleSail': Object.freeze({ default: 'Space', text: true, get description() { return t('mods.comeSailAway.Controls.ToggleSail.description', 'Raise or stow the sails at the helm.'); } }),   // CSA-E / KB1: not read by the mod any more - the key is the registry's action (inputActions.js MOD_ACTIONS); a player's saved value is carried there once (migrateKeyBinds)
      'Controls.ToggleLight': Object.freeze({ default: 'Period', text: true, get description() { return t('mods.comeSailAway.Controls.ToggleLight.description', 'Light or douse the boat’s lanterns at the helm.'); } }),   // CSA-D / KB1: not read by the mod any more - the key is the registry's action (inputActions.js MOD_ACTIONS); a player's saved value is carried there once (migrateKeyBinds)
      'Controls.IncreaseTimeScale': Object.freeze({ default: 'KeypadPlus', text: true, get description() { return t('mods.comeSailAway.Controls.IncreaseTimeScale.description', 'Speed time up at the helm.'); } }),
      'Controls.DecreaseTimeScale': Object.freeze({ default: 'KeypadMinus', text: true, get description() { return t('mods.comeSailAway.Controls.DecreaseTimeScale.description', 'Slow time back down at the helm.'); } }),
      'Controls.ResetTimeScale': Object.freeze({ default: 'KeypadEnter', text: true, get description() { return t('mods.comeSailAway.Controls.ResetTimeScale.description', 'Return time to normal speed at the helm.'); } }),
      'Controls.TrimRight': Object.freeze({ default: 'RightBracket', text: true, get description() { return t('mods.comeSailAway.Controls.TrimRight.description', 'Hold to trim the sails to the right (when automatic sail trimming is off).'); } }),   // CSA-E / KB1: not read by the mod any more - the key is the registry's action (inputActions.js MOD_ACTIONS); a player's saved value is carried there once (migrateKeyBinds)
      'Controls.TrimLeft': Object.freeze({ default: 'LeftBracket', text: true, get description() { return t('mods.comeSailAway.Controls.TrimLeft.description', 'Hold to trim the sails to the left (when automatic sail trimming is off).'); } }),   // CSA-E / KB1: not read by the mod any more - the key is the registry's action (inputActions.js MOD_ACTIONS); a player's saved value is carried there once (migrateKeyBinds)
      'Controls.TrimModifier': Object.freeze({ default: 'Backslash', text: true, get description() { return t('mods.comeSailAway.Controls.TrimModifier.description', 'Hold with a trim key to trim the square sails instead. Hold with Toggle Sail to raise or stow only the square sails.'); } }),   // CSA-E / KB1: not read by the mod any more - the key is the registry's action (inputActions.js MOD_ACTIONS); a player's saved value is carried there once (migrateKeyBinds)
      'Controls.PortLocationSearchRange': Object.freeze({ default: 3, min: 1, max: 10, get description() { return t('mods.comeSailAway.Controls.PortLocationSearchRange.description', 'How far from you a port can be found'); } }),
      'WindDirectionWidget.Enable': Object.freeze({ default: true, get description() { return t('mods.comeSailAway.WindDirectionWidget.Enable.description', 'Show the wind’s direction on screen at the helm.'); } }),
      'WindDirectionWidget.Position': Object.freeze({ default: Object.freeze([0.5, 0.5]), tuple: 'float', get description() { return t('mods.comeSailAway.WindDirectionWidget.Position.description', 'Where the widget sits on the screen, across and down.'); } }),
      'WindDirectionWidget.Scale': Object.freeze({ default: 1, min: 0, max: 2, float: true, get description() { return t('mods.comeSailAway.WindDirectionWidget.Scale.description', 'The widget’s size.'); } }),
      'WindDirectionWidget.ScalingMode': Object.freeze({ default: 0, options: lazyWords(() => t('mods.comeSailAway.option.doNotScale', 'DoNotScale'), () => t('mods.comeSailAway.option.screenHeight', 'ScreenHeight'), () => t('mods.comeSailAway.option.screenDimensions', 'ScreenDimensions')), get description() { return t('mods.comeSailAway.WindDirectionWidget.ScalingMode.description', 'How the widget scales with the screen size.'); } }),
      'WindDirectionWidget.Color': Object.freeze({ default: '#ffffffff', color: true, get description() { return t('mods.comeSailAway.WindDirectionWidget.Color.description', 'The widget’s color.'); } }),
      'Waves.Enable': Object.freeze({ default: true, get description() { return t('mods.comeSailAway.Waves.Enable.description', 'Draw the waves breaking along the coasts around you, and let the sea carry a boat on its current.'); } }),
      'Waves.Distance': Object.freeze({ default: 2, min: 1, max: 4, get description() { return t('mods.comeSailAway.Waves.Distance.description', 'How many map squares around you have waves, in each direction.'); } }),
      'Waves.Length': Object.freeze({ default: 1.5, min: 0, max: 2, float: true, get description() { return t('mods.comeSailAway.Waves.Length.description', 'How far out the waves reach before they end.'); } }),
      'Waves.Fade': Object.freeze({ default: 0.8, min: 0, max: 1, float: true, get description() { return t('mods.comeSailAway.Waves.Fade.description', 'How far along their path the waves begin to fade.'); } }),
      'Waves.Speed': Object.freeze({ default: 100, min: 0, max: 200, get description() { return t('mods.comeSailAway.Waves.Speed.description', 'How fast the waves move: under 100 is half speed, 100 to 199 is normal, and 200 is fastest.'); } }),
      'Cargo.CargoThreshold': Object.freeze({ default: 500, min: 0, max: 2000, get description() { return t('mods.comeSailAway.Cargo.CargoThreshold.description', 'How much weight a boat can carry before it slows down.'); } }),
      'Cargo.PlayerCarriedWeight': Object.freeze({ default: true, get description() { return t('mods.comeSailAway.Cargo.PlayerCarriedWeight.description', 'Count what you carry as cargo.'); } }),
      'Cargo.CartCarriedWeight': Object.freeze({ default: true, get description() { return t('mods.comeSailAway.Cargo.CartCarriedWeight.description', 'Count what your cart carries as cargo.'); } }),
      'Cargo.PlayerWeight': Object.freeze({ default: true, get description() { return t('mods.comeSailAway.Cargo.PlayerWeight.description', 'Count your own weight as cargo.'); } }),
      'Cargo.CartItem': Object.freeze({ default: false, get description() { return t('mods.comeSailAway.Cargo.CartItem.description', 'Count the cart itself as cargo.'); } }),
      'Cargo.HorseItem': Object.freeze({ default: false, get description() { return t('mods.comeSailAway.Cargo.HorseItem.description', 'Count the horse itself as cargo.'); } }),
      'Audio.SoundVolume': Object.freeze({ default: 0.5, min: 0, max: 1, float: true, get description() { return t('mods.comeSailAway.Audio.SoundVolume.description', 'Volume of the boat’s sounds: the hull, the oars, and the sea.'); } }),
      'Handling.OarMoveSpeed': Object.freeze({ default: 1, min: 0, max: 10, float: true, get description() { return t('mods.comeSailAway.Handling.OarMoveSpeed.description', 'Top speed under oars.'); } }),
      'Handling.OarMoveAcceleration': Object.freeze({ default: 1, min: 0, max: 10, float: true, get description() { return t('mods.comeSailAway.Handling.OarMoveAcceleration.description', 'How quickly you reach top speed under oars.'); } }),
      'Handling.OarTurnSpeed': Object.freeze({ default: 1, min: 0, max: 10, float: true, get description() { return t('mods.comeSailAway.Handling.OarTurnSpeed.description', 'Top turning speed under oars.'); } }),
      'Handling.OarTurnAcceleration': Object.freeze({ default: 1, min: 0, max: 10, float: true, get description() { return t('mods.comeSailAway.Handling.OarTurnAcceleration.description', 'How quickly the oars turn the boat.'); } }),
      'Handling.SailMoveSpeed': Object.freeze({ default: 1, min: 0, max: 10, float: true, get description() { return t('mods.comeSailAway.Handling.SailMoveSpeed.description', 'Top speed under sail.'); } }),
      'Handling.SailMoveAcceleration': Object.freeze({ default: 1, min: 0, max: 10, float: true, get description() { return t('mods.comeSailAway.Handling.SailMoveAcceleration.description', 'How quickly you reach top speed under sail.'); } }),
      'Handling.SailTurnSpeed': Object.freeze({ default: 1, min: 0, max: 10, float: true, get description() { return t('mods.comeSailAway.Handling.SailTurnSpeed.description', 'Top turning speed under sail.'); } }),
      'Handling.SailTurnAcceleration': Object.freeze({ default: 1, min: 0, max: 10, float: true, get description() { return t('mods.comeSailAway.Handling.SailTurnAcceleration.description', 'How quickly the sails turn the boat.'); } }),
      'Handling.BadTack': Object.freeze({ default: false, get description() { return t('mods.comeSailAway.unread.description', 'Has no effect: the mod never uses this setting.'); } }),
      'Handling.BadTackMultiplier': Object.freeze({ default: 0.8, min: 0, max: 1, float: true, get description() { return t('mods.comeSailAway.unread.description', 'Has no effect: the mod never uses this setting.'); } }),
      'SailingAssist.AutoTrimming': Object.freeze({ default: true, get description() { return t('mods.comeSailAway.SailingAssist.AutoTrimming.description', 'Trim the sails to the wind for you.'); } }),
      'SailingAssist.AutoStowSquareSails': Object.freeze({ default: true, get description() { return t('mods.comeSailAway.SailingAssist.AutoStowSquareSails.description', 'Stow the square sails for you when you head into the wind.'); } }),
      'SailingAssist.AutoStowGaffSails': Object.freeze({ default: true, get description() { return t('mods.comeSailAway.unread.description', 'Has no effect: the mod never uses this setting.'); } }),
      'Compatibility.AnimatedWaterVertexWaves': Object.freeze({ default: false, get description() { return t('mods.comeSailAway.Compatibility.AnimatedWaterVertexWaves.description', 'Has no effect here: Animated Water isn’t included, so the mod’s own waves are always drawn.'); } }),
      // KEEP-BOATS (2026-09-30, Mac: ship ownership "less punishing" - "Keep boats & cargo"): A DEPARTURE FROM THE
      // MOD'S SHIPPED DEFAULT. The mod ships it off, and off a boat placed in a dungeon was destroyed once the player
      // was back outside - a packable one and its hold for good, a crewed one's hold with it (UpdateBoatVisibility).
      // The port ships it ON; the switch stays the player's. Pinned: test/systems/csa_registration.test.js DEPARTED.
      'Compatibility.PersistentDungeonBoats': Object.freeze({ default: true, get description() { return t('mods.comeSailAway.Compatibility.PersistentDungeonBoats.description', 'Keeps a boat you placed indoors or underground when you leave. When off, the boat disappears once you go back outside.'); } }),
      'Map.RestrictPositionReadingTime': Object.freeze({ default: true, get description() { return t('mods.comeSailAway.Map.RestrictPositionReadingTime.description', 'Position can only be viewed around midday and midnight'); } }),
      'Map.RestrictPositionReadingWeather': Object.freeze({ default: true, get description() { return t('mods.comeSailAway.Map.RestrictPositionReadingWeather.description', 'Position can only be viewed in Sunny or Cloudy weather'); } }),
      'Map.ClickRangeThreshold': Object.freeze({ default: 5, min: 1, max: 10, get description() { return t('mods.comeSailAway.Map.ClickRangeThreshold.description', 'How close the cursor must be to a map marker, in pixels, to show its name or select it.'); } }),
      'Map.PositionLineThickness': Object.freeze({ default: 2, min: 0, max: 5, get description() { return t('mods.comeSailAway.Map.PositionLineThickness.description', 'Additional pixels on each side of the position line'); } }),
      'Map.MarkerThickness': Object.freeze({ default: 2, min: 1, max: 5, get description() { return t('mods.comeSailAway.Map.MarkerThickness.description', 'Additional pixels around the map marker'); } }),
      'Map.MarkerOutlineThickness': Object.freeze({ default: 2, min: 0, max: 5, get description() { return t('mods.comeSailAway.Map.MarkerOutlineThickness.description', 'Thickness of the marker outline in pixels'); } }),
      'Map.BackdropOpacity': Object.freeze({ default: 50, min: 0, max: 100, get description() { return t('mods.comeSailAway.Map.BackdropOpacity.description', 'How much the background darkens behind the position map, in percent.'); } }),
      'Debug.ShowValues': Object.freeze({ default: false, get description() { return t('mods.comeSailAway.Debug.ShowValues.description', 'Shows boat speed, target speed, and wind strength on screen.'); } }),
    }),
  }),
  // Listed before the overhaul, which names it as a dependency and so loads after it.
  'meanerMonsters': Object.freeze({
    title: 'Meaner Monsters',
    author: 'Ralzar',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.meanerMonsters.Enabled.description', 'Rebalances 20 monsters: most hit harder and are tougher, while rats, bats, and zombies are weaker. Also enlarges werebeasts and dragonlings, and uses matching presets (including MUDEX) with Physical Combat and Armor Overhaul or Daggerfall Enemy Expansion.');
        },
      }),
    }),
  }),
  'pcaao': Object.freeze({
    title: 'Physical Combat And Armor Overhaul',
    author: 'Kirk.O',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.pcaao.Enabled.description', 'Armor reduces damage taken instead of hit chance, skills govern accuracy, shields scale with material, and critical hits boost damage. Turn this off to use standard Daggerfall Unity combat.');
        },
      }),
      // WEAR-VANILLA (2026-10-01, the repair triage: "Disable the modded feature that increases durability loss.
      // Vanilla values work fine"): the mod ships its two wear modules ON, the port ships them OFF - a blow wears gear
      // at Daggerfall Unity's own rate (combat/formulas.js damageEquipment) and a broken enchanted piece stays,
      // repairable. Online the room reads these defaults (onlineLane.js ONLINE_WHOLE_MODS); offline they stay the
      // player's. A value saved under the old default is let go once (SWITCH_RESETS). Port-Ledger, WEAR-VANILLA.
      equipmentDamageEnhanced: Object.freeze({ default: false, get description() { return t('mods.pcaao.equipmentDamageEnhanced.description', 'Your equipment wears out much faster, depending on its material, what hit it, and other factors.'); } }),
      fadingEnchantedItems: Object.freeze({ default: false, get description() { return t('mods.pcaao.fadingEnchantedItems.description', 'Enchanted weapons and armor are destroyed when they break in combat. Requires Equipment Damage Enhanced.'); } }),
      fixedStrengthDamageModifier: Object.freeze({ default: true, get description() { return t('mods.pcaao.fixedStrengthDamageModifier.description', 'Strength adds 1 damage per 10 points, as in the classic game, instead of 2.'); } }),
      armorHitFormulaRedone: Object.freeze({ default: true, get description() { return t('mods.pcaao.armorHitFormulaRedone.description', 'Armor reduces the damage you take instead of making you harder to hit.'); } }),
      criticalStrikesIncreaseDamage: Object.freeze({ default: true, get description() { return t('mods.pcaao.criticalStrikesIncreaseDamage.description', 'Critical strikes increase your damage as well as your chance to hit. Requires Armor Hit Formula Redone.'); } }),
      conditionBasedEffectiveness: Object.freeze({ default: true, get description() { return t('mods.pcaao.conditionBasedEffectiveness.description', 'Weapons and armor lose effectiveness as they wear down. Requires Armor Hit Formula Redone.'); } }),
      softMaterialRequirements: Object.freeze({ default: true, get description() { return t('mods.pcaao.softMaterialRequirements.description', 'Weapons below an enemy’s required material tier can still damage it, but with a heavy penalty. Requires Armor Hit Formula Redone.'); } }),
    }),
  }),
  // Listed after the overhaul: its manifest orders it after Roleplay & Realism.
  'unleveledLoot': Object.freeze({
    title: 'Unleveled Loot',
    author: 'Ralzar',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.unleveledLoot.Enabled.description', 'Loot and shop stock no longer scale with your level. Material drops depend on your luck, shop quality, and dungeon type, and gold found scales with luck. Turn off to use standard level-scaled loot rolls.');
        },
      }),
      ...Object.fromEntries(['Iron', 'Steel', 'Silver', 'Elven', 'Dwarven', 'Mithril', 'Adamantium', 'Ebony', 'Orcish', 'Daedric'].map((name, i) => [name, Object.freeze({
        default: i,
        options: lazyWords(() => localizedText('iron', 'Iron'), () => localizedText('steel', 'Steel'), () => localizedText('silver', 'Silver'),
          () => localizedText('elven', 'Elven'), () => localizedText('dwarven', 'Dwarven'), () => localizedText('mithril', 'Mithril'),
          () => localizedText('adamantium', 'Adamantium'), () => localizedText('ebony', 'Ebony'), () => localizedText('orcish', 'Orcish'),
          () => localizedText('daedric', 'Daedric')),
        get description() { return t('mods.unleveledLoot.MaterialSwitching.description', 'Whenever this material would drop, change it to the selected material.'); },
      })])),
    }),
  }),
  'diverse-weapons': Object.freeze({
    title: 'Diverse Weapons',
    author: 'RealAKP',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.diverseWeapons.Enabled.description', 'Gives every weapon in every metal its own first-person look, plain and enchanted, so a longsword no longer looks like a broadsword. A newer copy of the mod added under Your own textures overrides the built-in one.');
        },
      }),
      WeaponWidgetPreset: Object.freeze({
        default: false,
        get description() {
          return t('mods.diverseWeapons.WeaponWidgetPreset.description', 'Applies the Diverse Weapons preset for Weapon Widget: larger idle poses, inertia, recoil, and custom weapon bob. Turning this off restores your Weapon Widget settings.');
        },
      }),
    }),
  }),
  'roleplay-realism-items': Object.freeze({
    title: 'Roleplay & Realism: Items',
    author: 'Hazelnut & Ralzar',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.roleplayRealismItems.Enabled.description', 'Adds two new weapons, light and medium armor sets in every metal, and rebalanced item weights and prices.');
        },
      }),
      lootRebalance: Object.freeze({ default: true, get description() { return t('mods.roleplayRealismItems.lootRebalance.description', 'Rebalances loot on mobs and in piles'); } }),
      bandaging: Object.freeze({ default: true, get description() { return t('mods.roleplayRealismItems.bandaging.description', 'Allows bandages to stack, and to be used for healing based on medical skill'); } }),
      conditionBasedPrices: Object.freeze({ default: true, get description() { return t('mods.roleplayRealismItems.conditionBasedPrices.description', 'Item prices are based on condition and loot you find can be quite worn out'); } }),
      storeQualityItemCondition: Object.freeze({ default: true, get description() { return t('mods.roleplayRealismItems.storeQualityItemCondition.description', 'Shop items can be in used condition depending on the quality of the store.'); } }),
      realisticEnemyEquipment: Object.freeze({ default: true, get description() { return t('mods.roleplayRealismItems.realisticEnemyEquipment.description', 'Enemy equipment matches their class and varies in condition.'); } }),
      skillBasedStartingEquipment: Object.freeze({ default: true, get description() { return t('mods.roleplayRealismItems.skillBasedStartingEquipment.description', 'Player starting equipment is based on skills'); } }),
      skillBasedStartingSpells: Object.freeze({ default: true, get description() { return t('mods.roleplayRealismItems.skillBasedStartingSpells.description', 'Player starting spells are based on skills'); } }),
      weaponBalance: Object.freeze({ default: true, get description() { return t('mods.roleplayRealismItems.weaponBalance.description', 'Balances weapon attack speed and damage ranges against weight to give more valid choices'); } }),
      newWeapons: Object.freeze({ default: true, get description() { return t('mods.roleplayRealismItems.newWeapons.description', 'Adds two new weapons to the game, Archers Axe and Light Flail'); } }),
      newArmor: Object.freeze({ default: true, get description() { return t('mods.roleplayRealismItems.newArmor.description', 'Adds new chest, arm, leg, and foot armor pieces to the game.'); } }),
      alchemistPotions: Object.freeze({ default: true, get description() { return t('mods.roleplayRealismItems.alchemistPotions.description', 'Adds random potions for sale at alchemist stores, for a premium price'); } }),
    }),
  }),
  'roleplay-realism': Object.freeze({
    title: 'Roleplay & Realism',
    author: 'Hazelnut',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.roleplayRealism.Enabled.description', 'Adds realism changes such as draw-based archery, encumbrance and climbing limits, rebalanced weapon speed and accuracy, interactive beds, and level-scaled bank loans. Also includes port-only ship boarding, harsher guild expulsions, reworked class enemies, enhanced horse riding, and expanded skill training.');
        },
      }),
      bedSleeping: Object.freeze({ default: true, get description() { return t('mods.roleplayRealism.bedSleeping.description', 'Allows sleep to be initiated by clicking on a bed.'); } }),
      advancedArchery: Object.freeze({ default: true, get description() { return t('mods.roleplayRealism.advancedArchery.description', 'Alters to-hit and damage done by arrows depending on the length of draw.'); } }),
      encumbranceEffects: Object.freeze({ default: true, get description() { return t('mods.roleplayRealism.encumbranceEffects.description', 'Provides speed and fatigue penalties when carrying too much weight.'); } }),
      bandaging: Object.freeze({ default: true, get description() { return t('mods.roleplayRealism.bandaging.description', 'Allows bandages to be used for healing based on medical skill.'); } }),
      shipPorts: Object.freeze({ default: false, get description() { return t('mods.roleplayRealism.shipPorts.description', 'Player can only board their ship when in a port town.'); } }),
      underworldExpulsion: Object.freeze({ default: true, get description() { return t('mods.roleplayRealism.underworldExpulsion.description', 'Enables underworld guilds to expel members for poor performance... with prejudice.'); } }),
      climbingRestriction: Object.freeze({ default: true, get description() { return t('mods.roleplayRealism.climbingRestriction.description', 'Prevents climbing with a weapon drawn.'); } }),
      weaponSpeed: Object.freeze({ default: true, get description() { return t('mods.roleplayRealism.weaponSpeed.description', 'Lowers weapon damage per second for characters with high Speed.'); } }),
      weaponMaterials: Object.freeze({ default: true, get description() { return t('mods.roleplayRealism.weaponMaterials.description', 'Moderates the to-hit bonuses of weapon materials so skill remains the key factor.'); } }),
      equipDamage: Object.freeze({ default: false, get description() { return t('mods.roleplayRealism.equipDamage.description', 'Increases equipment damage proportional to max condition.'); } }),   // WEAR-VANILLA (2026-10-01): the mod ships it ON (armour x5), the port OFF - see the overhaul's wear modules above; the room's too (onlineLane.js)
      enemyAppearance: Object.freeze({ default: true, get description() { return t('mods.roleplayRealism.enemyAppearance.description', 'Remixes human enemy appearance based on class'); } }),
      purificationPotion: Object.freeze({ default: true, get description() { return t('mods.roleplayRealism.purificationPotion.description', 'Changes purification potion to cure poison rather than grant invisibility'); } }),
      autoExtinguishLight: Object.freeze({ default: true, get description() { return t('mods.roleplayRealism.autoExtinguishLight.description', 'Automatically extinguish any light sources when you exit a dungeon'); } }),
      classicStrengthDamageBonus: Object.freeze({ default: false, get description() { return t('mods.roleplayRealism.classicStrengthDamageBonus.description', 'Shows the strength damage bonus at half, as the classic game did.'); } }),
      variantNpcs: Object.freeze({ default: true, get description() { return t('mods.roleplayRealism.variantNpcs.description', 'Enable variant NPC sprites in shops and taverns'); } }),
      variantResidents: Object.freeze({ default: true, get description() { return t('mods.roleplayRealism.variantResidents.description', 'Fills 80% of houses with the townsfolk you see walking around, instead of random adventurers'); } }),
      loanAmountPerLevel: Object.freeze({ default: 4, options: Object.freeze(['2000', '4000', '6000', '8000', '10000', '20000', '30000', '40000', '50000']), get description() { return t('mods.roleplayRealism.loanAmountPerLevel.description', 'Sets the maximum amount per level that can be borrowed from banks'); } }),
      'EnhancedRiding.enhancedRiding': Object.freeze({ default: true, get description() { return t('mods.roleplayRealism.EnhancedRiding.enhancedRiding.description', 'Enable enhanced horse riding module, improving presentation and allowing galloping.'); } }),
      'EnhancedRiding.RealisticMovement': Object.freeze({ default: true, get description() { return t('mods.roleplayRealism.EnhancedRiding.RealisticMovement.description', 'Makes the horse and cart movement backwards and sideways more realistic and limited.'); } }),
      'EnhancedRiding.followTerrainEnabled': Object.freeze({ default: true, get description() { return t('mods.roleplayRealism.EnhancedRiding.followTerrainEnabled.description', 'Enables terrain following when riding.'); } }),
      'EnhancedRiding.followTerrainSoftenFactor': Object.freeze({ default: 8, min: 0, max: 32, get description() { return t('mods.roleplayRealism.EnhancedRiding.followTerrainSoftenFactor.description', 'How much the ride smooths out slopes, from 0 (none) to 32 (most).'); } }),
      'EnhancedRiding.GallopingInTowns': Object.freeze({ default: true, get description() { return t('mods.roleplayRealism.EnhancedRiding.GallopingInTowns.description', 'Enables galloping (sprinting) while riding horses in towns.'); } }),   // TOWN-GALLOP (2026-10-13, Mac: "Remove forced horse walking in towns"): the mod ships this OFF, the port ships it ON - off, the mod's CanRun refused the run in every town, and horse care's horse walked there with Run held (HORSE-WALK); the room's too (onlineLane.js ONLINE_WHOLE_MODS reads this default); no tile ever reached the switch (FT14), so no saved off stands to reset; TrampleCivilians, the mod's own, rides with it; recorded on the RR page
      'EnhancedRiding.TrampleCivilians': Object.freeze({ default: true, get description() { return t('mods.roleplayRealism.EnhancedRiding.TrampleCivilians.description', 'Enables the crime of trampling innocent townsfolk when galloping in a town.'); } }),
      // RefinedTraining (RR2)
      'RefinedTraining.refinedTraining': Object.freeze({ default: true, get description() { return t('mods.roleplayRealism.RefinedTraining.refinedTraining.description', 'Enable refined skill training service.'); } }),
      'RefinedTraining.variableTrainingPrice': Object.freeze({ default: true, get description() { return t('mods.roleplayRealism.RefinedTraining.variableTrainingPrice.description', 'Makes price of training based on skill level as well as player level.'); } }),
      'RefinedTraining.intensiveTraining': Object.freeze({ default: false, get description() { return t('mods.roleplayRealism.RefinedTraining.intensiveTraining.description', 'Enables an intensive training option covering one session a day for five days at extra cost.'); } }),
    }),
  }),
  'shield-widget': Object.freeze({
    title: 'Shield Widget',
    author: 'RedRoryOTheGlen',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.shieldWidget.Enabled.description', 'Shows your equipped shield in first person. It matches its material, shows wear as its condition drops, and lowers when you sheathe, attack, or cast.');
        },
      }),
      'Shield.Scale': Object.freeze({ default: 1.0, min: 0.8, max: 1.2, float: true, step: 0.1, get description() { return t('mods.shieldWidget.Shield.Scale.description', 'Size of the sprite'); } }),
      'Shield.OffsetHorizontal': Object.freeze({ default: 0.5, min: -1.0, max: 1.0, float: true, step: 0.1, get description() { return t('mods.shieldWidget.Shield.OffsetHorizontal.description', 'Offsets the sprite relative to the left edge of the screen'); } }),
      'Shield.OffsetVertical': Object.freeze({ default: 0.5, min: -1.0, max: 1.0, float: true, step: 0.1, get description() { return t('mods.shieldWidget.Shield.OffsetVertical.description', 'Offsets the sprite relative to the bottom edge of the screen'); } }),
      'Shield.Speed': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.shieldWidget.Shield.Speed.description', 'Speed of stance transition when attacking'); } }),
      'Shield.WhenSheathed': Object.freeze({ default: 1, options: SHIELD_STANCES, get description() { return t('mods.shieldWidget.Shield.WhenSheathed.description', 'Shield behavior when sheathing your weapon.'); } }),
      'Shield.WhenAttacking': Object.freeze({ default: 1, options: SHIELD_STANCES, get description() { return t('mods.shieldWidget.Shield.WhenAttacking.description', 'Shield behavior when attacking with a weapon.'); } }),
      'Shield.WhenCasting': Object.freeze({ default: 1, options: SHIELD_STANCES, get description() { return t('mods.shieldWidget.Shield.WhenCasting.description', 'Shield behavior when readying or casting a spell.'); } }),
      'Shield.LockAspectRatio': Object.freeze({ default: true, get description() { return t('mods.shieldWidget.Shield.LockAspectRatio.description', 'Prevents the shield sprite from stretching or squishing across different screen aspect ratios.'); } }),
      'Shield.ConditionThresholdUpper': Object.freeze({ default: 75, min: 55, max: 95, get description() { return t('mods.shieldWidget.Shield.ConditionThresholdUpper.description', 'Condition, in percent, below which the shield first looks damaged.'); } }),
      'Shield.ConditionThresholdLower': Object.freeze({ default: 25, min: 5, max: 45, get description() { return t('mods.shieldWidget.Shield.ConditionThresholdLower.description', 'Condition, in percent, below which the shield looks badly damaged.'); } }),
      'Modules.Bob': Object.freeze({ default: true, get description() { return t('mods.shieldWidget.Modules.Bob.description', 'Bob: the shield sways as you walk.'); } }),
      'Modules.Inertia': Object.freeze({ default: false, get description() { return t('mods.shieldWidget.Modules.Inertia.description', 'Inertia: the shield trails behind as you look around and move.'); } }),
      'Modules.Animation': Object.freeze({ default: false, get description() { return t('mods.shieldWidget.Modules.Animation.description', 'Animation: the shield is raised and lowered frame by frame instead of sliding (art by WilhelmBlack).'); } }),
      'Modules.Step': Object.freeze({ default: false, get description() { return t('mods.shieldWidget.Modules.Step.description', 'Step: the shield\u2019s position is rounded so it moves in steps.'); } }),
      'Modules.Recoil': Object.freeze({ default: false, get description() { return t('mods.shieldWidget.Modules.Recoil.description', 'Recoil: the shield recoils and rings when struck. Requires Physical Combat and Armor Overhaul.'); } }),
      'Bob.Length': Object.freeze({ default: 100, min: 0, max: 200, get description() { return t('mods.shieldWidget.Bob.Length.description', 'Amount of bobs in a single stride'); } }),
      'Bob.Offset': Object.freeze({ default: 0.0, min: 0.0, max: 3.0, float: true, step: 0.1, get description() { return t('mods.shieldWidget.Bob.Offset.description', 'Advances the bob timing. For use with weapon bob.'); } }),
      'Bob.SizeX': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.shieldWidget.Bob.SizeX.description', 'Extent of horizontal movement when bobbing'); } }),
      'Bob.SizeY': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.shieldWidget.Bob.SizeY.description', 'Extent of vertical movement when bobbing'); } }),
      'Bob.SpeedMove': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.shieldWidget.Bob.SpeedMove.description', 'Speed of transition between stationary and moving'); } }),
      'Bob.SpeedState': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.shieldWidget.Bob.SpeedState.description', 'Speed of transition between movement states'); } }),
      'Bob.Shape': Object.freeze({ default: 0, options: lazyWords(() => t('mods.shieldWidget.option.u', 'U'), () => t('mods.shieldWidget.option.sideways8', 'Sideways 8'), () => t('mods.shieldWidget.option.invertedU', 'Inverted U')), get description() { return t('mods.shieldWidget.Bob.Shape.description', 'Shape of bob'); } }),
      'Bob.BobWhileIdle': Object.freeze({ default: true, get description() { return t('mods.shieldWidget.Bob.BobWhileIdle.description', 'Whether the shield will slightly bob while stationary'); } }),
      'Inertia.Scale': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.shieldWidget.Inertia.Scale.description', 'The maximum distance that the sprite will be offset'); } }),
      'Inertia.Speed': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.shieldWidget.Inertia.Speed.description', 'How fast the sprite moves toward the target offset.'); } }),
      'Inertia.ForwardDepth': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.shieldWidget.Inertia.ForwardDepth.description', 'Multiplier for the change in scale when moving forward or backward'); } }),
      'Inertia.ForwardSpeed': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.shieldWidget.Inertia.ForwardSpeed.description', 'How fast the sprite scales toward the target depth.'); } }),
      'Animation.Speed': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.shieldWidget.Animation.Speed.description', 'Determines how fast the animation plays'); } }),
      'Animation.Direction': Object.freeze({ default: 0, options: lazyWords(() => t('mods.shieldWidget.option.both', 'Both'), () => t('mods.shieldWidget.option.forwardOnly', 'Forward Only'), () => t('mods.shieldWidget.option.reverseOnly', 'Reverse Only')), get description() { return t('mods.shieldWidget.Animation.Direction.description', 'Set which animations will play during actions'); } }),
      'Step.Length': Object.freeze({ default: 1, min: 1, max: 10, get description() { return t('mods.shieldWidget.Step.Length.description', 'Size of each step. Higher moves in bigger jumps.'); } }),
      'Step.Condition': Object.freeze({ default: 0, options: lazyWords(() => t('mods.shieldWidget.option.sheatheAttackOnly', 'Sheathe/Attack Only'), () => t('mods.shieldWidget.option.allTransforms', 'All Transforms')), get description() { return t('mods.shieldWidget.Step.Condition.description', 'Whether step snapping affects only sheathing or also other movements such as Bob, Inertia, and Recoil.'); } }),
      'Recoil.Scale': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.shieldWidget.Recoil.Scale.description', 'The amount the shield will recoil'); } }),
      'Recoil.Offset': Object.freeze({ default: false, get description() { return t('mods.shieldWidget.Recoil.Offset.description', 'Whether the shield should be moved to the center when recoiling'); } }),
      'Recoil.Speed': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.shieldWidget.Recoil.Speed.description', 'How fast the shield recovers from recoil.'); } }),
      'Recoil.Condition': Object.freeze({ default: 2, options: lazyWords(() => t('mods.shieldWidget.option.hitOnShield', 'Hit On Shield'), () => t('mods.shieldWidget.option.missOnShield', 'Miss On Shield'), () => t('mods.shieldWidget.option.attackOnShield', 'Attack On Shield'), () => t('mods.shieldWidget.option.anyHit', 'Any Hit'), () => t('mods.shieldWidget.option.anyMiss', 'Any Miss'), () => t('mods.shieldWidget.option.anyAttack', 'Any Attack')), get description() { return t('mods.shieldWidget.Recoil.Condition.description', 'Event required for the shield to recoil'); } }),
      'Compatibility.TextureScaleFactor': Object.freeze({ default: 1, min: 0, max: 8, get description() { return t('mods.shieldWidget.Compatibility.TextureScaleFactor.description', 'Divides the sprite\u2019s pixel size. Raise it if a replacement texture pack draws the shield too large.'); } }),
    }),
  }),
  'weapon-widget': Object.freeze({
    title: 'Weapon Widget',
    author: 'RedRoryOTheGlen',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.weaponWidget.Enabled.description', 'Adds first-person weapon animations: wind-up and recovery on swings, left- or right-hand display, sheathing, walking bob, look inertia, and hit or parry recoil. The Morrowind arms follow the same motion.');
        },
      }),
      'Modules.Swings': Object.freeze({ default: true, get description() { return t('mods.weaponWidget.Modules.Swings.description', 'Each strike winds up from the idle pose, plays at its own speed, and recovers in reverse after a hit.'); } }),
      'Modules.Ambidexterity': Object.freeze({ default: true, get description() { return t('mods.weaponWidget.Modules.Ambidexterity.description', 'Shows the weapon in your active swing hand (Switch Hand, H), mirrored in the left hand.'); } }),
      'Modules.Offset': Object.freeze({ default: true, get description() { return t('mods.weaponWidget.Modules.Offset.description', 'Slides the weapon sprite off-screen when sheathing and back on-screen when drawing or recovering from a swing.'); } }),
      'Modules.Bob': Object.freeze({ default: true, get description() { return t('mods.weaponWidget.Modules.Bob.description', 'Sways the weapon sprite as you walk.'); } }),
      'Modules.Inertia': Object.freeze({ default: false, get description() { return t('mods.weaponWidget.Modules.Inertia.description', 'The weapon trails behind as you look around and move. Requires double-scale weapon textures.'); } }),
      'Modules.Step': Object.freeze({ default: false, get description() { return t('mods.weaponWidget.Modules.Step.description', 'Rounds the weapon sprite position so animations move in discrete steps.'); } }),
      'Modules.DoubleScaleTextures': Object.freeze({ default: false, get description() { return t('mods.weaponWidget.Modules.DoubleScaleTextures.description', 'Draws the idle weapon pose at double size using the mod’s textures. Add its .dfmod file under Your own textures.'); } }),   // DISC16-B: the mod's own again (DISC14-B had it on)
      'Modules.TrueTextureSize': Object.freeze({ default: false, get description() { return t('mods.weaponWidget.Modules.TrueTextureSize.description', 'Draws custom weapon textures at their native pixel size, divided by the scale factor below.'); } }),
      'Modules.Recoil': Object.freeze({ default: false, get description() { return t('mods.weaponWidget.Modules.Recoil.description', 'Bounces the weapon back on a hit, parry, or miss, depending on the settings below.'); } }),
      'Swings.Speed': Object.freeze({ default: 1.0, min: 0.0, max: 5.0, float: true, step: 0.25, get description() { return t('mods.weaponWidget.Swings.Speed.description', 'Speed of the swing animation.'); } }),
      'Swings.Windup': Object.freeze({ default: 1, options: lazyWords(() => t('mods.weaponWidget.option.hide', 'Hide'), () => t('mods.weaponWidget.option.idle', 'Idle'), () => t('mods.weaponWidget.option.firstFrame', 'First Frame')), get description() { return t('mods.weaponWidget.Swings.Windup.description', 'What shows while the swing winds up.'); } }),
      'Swings.Recovery': Object.freeze({ default: 0, options: lazyWords(() => t('mods.weaponWidget.option.hide', 'Hide'), () => t('mods.weaponWidget.option.lastFrame', 'Last Frame')), get description() { return t('mods.weaponWidget.Swings.Recovery.description', 'What shows while the swing recovers.'); } }),
      'Swings.VanillaAlignmentOverride': Object.freeze({ default: true, get description() { return t('mods.weaponWidget.Swings.VanillaAlignmentOverride.description', 'Centers downward and upward strikes for standard weapons at the center of the screen edge.'); } }),
      'Swings.VanillaRecoveryOverride': Object.freeze({ default: true, get description() { return t('mods.weaponWidget.Swings.VanillaRecoveryOverride.description', 'Plays the upward strike animation in reverse during recovery for certain standard weapons.'); } }),
      'Swings.NoDaggerMirroredStrikes': Object.freeze({ default: true, get description() { return t('mods.weaponWidget.Swings.NoDaggerMirroredStrikes.description', 'Prevents daggers from using opposite-hand swing animations.'); } }),
      'Offset.Speed': Object.freeze({ default: 1.0, min: 0.0, max: 5.0, float: true, step: 0.25, get description() { return t('mods.weaponWidget.Offset.Speed.description', 'Speed of the slide on and off the screen.'); } }),
      'Bob.Length': Object.freeze({ default: 100, min: 0, max: 200, get description() { return t('mods.weaponWidget.Bob.Length.description', 'Amount of bobs in a single stride'); } }),
      'Bob.Offset': Object.freeze({ default: 0.0, min: 0.0, max: 1.0, float: true, step: 0.1, get description() { return t('mods.weaponWidget.Bob.Offset.description', 'Advances the bob timing. For use with weapon bob.'); } }),
      'Bob.SizeX': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.weaponWidget.Bob.SizeX.description', 'Extent of horizontal movement when bobbing'); } }),
      'Bob.SizeY': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.weaponWidget.Bob.SizeY.description', 'Extent of vertical movement when bobbing'); } }),
      'Bob.SpeedMove': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.weaponWidget.Bob.SpeedMove.description', 'Speed of transition between stationary and moving'); } }),
      'Bob.SpeedState': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.weaponWidget.Bob.SpeedState.description', 'Speed of transition between movement states'); } }),
      'Bob.Shape': Object.freeze({ default: 0, options: lazyWords(() => t('mods.weaponWidget.option.u', 'U'), () => t('mods.weaponWidget.option.sideways8', 'Sideways 8'), () => t('mods.weaponWidget.option.invertedU', 'Inverted U')), get description() { return t('mods.weaponWidget.Bob.Shape.description', 'Shape of bob'); } }),
      'Bob.BobWhileIdle': Object.freeze({ default: true, get description() { return t('mods.weaponWidget.Bob.BobWhileIdle.description', 'Whether the weapon will slightly bob while stationary'); } }),
      'Step.Length': Object.freeze({ default: 1, min: 1, max: 10, get description() { return t('mods.weaponWidget.Step.Length.description', 'Size of each position step. Higher values move the weapon in larger jumps.'); } }),
      'Step.Condition': Object.freeze({ default: 0, options: lazyWords(() => t('mods.weaponWidget.option.sheatheAttackOnly', 'Sheathe/Attack Only'), () => t('mods.weaponWidget.option.allTransforms', 'All Transforms')), get description() { return t('mods.weaponWidget.Step.Condition.description', 'Whether step snapping affects only sheathing or also other options such as Bob, Inertia, and Recoil.'); } }),
      'Inertia.Scale': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.weaponWidget.Inertia.Scale.description', 'The maximum distance that the sprite will be offset'); } }),   // DISC16-B: the mod's own again (DISC14-B had it at 0)
      'Inertia.Speed': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.weaponWidget.Inertia.Speed.description', 'How fast the weapon sprite moves toward the target offset.'); } }),
      'Inertia.ForwardDepth': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.weaponWidget.Inertia.ForwardDepth.description', 'Multiplier for the change in scale when moving forward or backward'); } }),
      'Inertia.ForwardSpeed': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.weaponWidget.Inertia.ForwardSpeed.description', 'How fast the weapon sprite scales toward the target depth.'); } }),
      'TrueTextureSize.TextureScaleFactor': Object.freeze({ default: 1, min: 1, max: 8, get description() { return t('mods.weaponWidget.TrueTextureSize.TextureScaleFactor.description', 'With True Texture Size on, divides a custom texture’s size. Raise it if the weapon draws too large.'); } }),
      'Recoil.Condition': Object.freeze({ default: 0, options: lazyWords(() => t('mods.weaponWidget.option.hitsOnly', 'Hits Only'), () => t('mods.weaponWidget.option.hitsAndParries', 'Hits and Parries'), () => t('mods.weaponWidget.option.parriesOnly', 'Parries Only'), () => t('mods.weaponWidget.option.parriesAndMisses', 'Parries and Misses'), () => t('mods.weaponWidget.option.missesOnly', 'Misses Only'), () => t('mods.weaponWidget.option.allAttacks', 'All Attacks')), get description() { return t('mods.weaponWidget.Recoil.Condition.description', 'When the swing recoils.'); } }),
      'Recoil.Chance': Object.freeze({ default: 100, min: 0, max: 100, get description() { return t('mods.weaponWidget.Recoil.Chance.description', 'Chance, in percent, of a recoil when the condition is met'); } }),
      'Recoil.PlayEntityMissEffects': Object.freeze({ default: true, get description() { return t('mods.weaponWidget.Recoil.PlayEntityMissEffects.description', 'Shows an impact effect when an attack is parried or misses an enemy.'); } }),
      'Recoil.DetectEnvironment': Object.freeze({ default: true, get description() { return t('mods.weaponWidget.Recoil.DetectEnvironment.description', 'A swing into a wall or a door within reach recoils too.'); } }),
      'Recoil.PlayEnvironmentMissEffects': Object.freeze({ default: true, get description() { return t('mods.weaponWidget.Recoil.PlayEnvironmentMissEffects.description', 'Shows an impact effect where a swing hits a wall.'); } }),
      'Recoil.MissEffectPlacement': Object.freeze({ default: 0, options: lazyWords(() => t('mods.weaponWidget.option.target', 'Target'), () => t('mods.weaponWidget.option.crosshair', 'Crosshair')), get description() { return t('mods.weaponWidget.Recoil.MissEffectPlacement.description', 'Where parry and miss impact effects appear on screen.'); } }),
      'Miscellaneous.MirrorBows': Object.freeze({ default: false, get description() { return t('mods.weaponWidget.Miscellaneous.MirrorBows.description', 'Draws the bow mirrored.'); } }),
      'Miscellaneous.MirrorTwoHandedSwords': Object.freeze({ default: false, get description() { return t('mods.weaponWidget.Miscellaneous.MirrorTwoHandedSwords.description', 'Draws a two-handed sword mirrored in the right hand.'); } }),
      'Miscellaneous.MirrorTwoHandedAxes': Object.freeze({ default: false, get description() { return t('mods.weaponWidget.Miscellaneous.MirrorTwoHandedAxes.description', 'Draws a two-handed axe mirrored in the right hand.'); } }),
      'Miscellaneous.MirrorTwoHandedBlunts': Object.freeze({ default: false, get description() { return t('mods.weaponWidget.Miscellaneous.MirrorTwoHandedBlunts.description', 'Draws a two-handed staff, hammer, or flail mirrored in the right hand.'); } }),
    }),
  }),
  'handheld-torches': Object.freeze({
    title: 'Handheld Torches',
    author: 'RedRoryOTheGlen',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.handheldTorches.Enabled.description', 'A lit torch, candle, or lantern needs a free hand and shows in first person. Keys light, drop, or throw it, a thrown torch can set an enemy on fire, and a dropped light keeps burning.');
        },
      }),
      // SOC5 (2026-09-16, Mac: "Players should be able to interact with others
      // in the world upon encountering them by pressing F on their body"): THE
      // SECOND DEPARTURE FROM THE MOD'S SHIPPED KEYS, and the same shape as
      // HT4's below. Handheld Torches ships F, and in Daggerfall Unity that is
      // free. It is not free here any more: SOC5 spends F on the port's own
      // SocialInteract action (systems/inputActions.js DEFAULT_BINDINGS), the
      // key Mac named, and online forces every vendored mod ON
      // (systems/online/onlineLane.js) - so one press would both open the F-menu on a
      // player and light a torch, for every player online, by default. O is
      // unbound in DFU's own defaults and unused by this mod's other two keys
      // and by every other vendored mod, and it says what it does: on and off.
      // The player may still bind it wherever they like; this is about what
      // SHIPS. test/systems/ht1_handheldtorches.test.js HT4 is the gate that caught it.
      'Handling.ToggleLightInput': Object.freeze({ default: "O", text: true, get description() { return t('mods.handheldTorches.Handling.ToggleLightInput.description', 'Button used to quickly ignite or douse your light source'); } }),   // KB1: not read by the mod any more - the key is the registry's action (inputActions.js MOD_ACTIONS); a player's saved value is carried there once (migrateKeyBinds)
      'Handling.RememberLastLightSource': Object.freeze({ default: true, get description() { return t('mods.handheldTorches.Handling.RememberLastLightSource.description', 'The toggle key relights the last light source you doused, if you still carry one.'); } }),
      // HT4 (2026-09-15, Mac: "Pressing tab drops torches, tab is reserved
      // for the menu"): THE ONE DEPARTURE FROM THE MOD'S SHIPPED KEYS.
      // Handheld Torches ships Tab, and in Daggerfall Unity that is free.
      // It is not free here: PX15 gave Tab to the port's own pixel dial
      // (ui/input.js, the radial menu DFU has not got), so the mod's
      // default landed on a key the port had already spent and one press
      // both opened the dial and dropped the light. The mod could not
      // have known; the port has to answer for it. G is unbound in DFU's
      // own defaults (inputActions.js DEFAULT_BINDINGS) and unused by the
      // mod's other two keys, and it stays the player's to rebind.
      'Handling.ManualDropInput': Object.freeze({ default: "G", text: true, get description() { return t('mods.handheldTorches.Handling.ManualDropInput.description', 'Button used to manually drop a light source'); } }),   // KB1: not read by the mod any more - the key is the registry's action (inputActions.js MOD_ACTIONS); a player's saved value is carried there once (migrateKeyBinds)
      // HT7 (2026-09-17, Mac: "Take care of both") - THE ONE DEFAULT THIS
      // PORT MOVES, and it is an owner decision rather than a misread.
      //
      // Handheld Torches ships `OnStow = Drop` (1), and the port kept it
      // with every other shipped default. HT6 recorded the consequence:
      // with the weapon DRAWN, equipping a shield puts your lit torch on
      // the floor - and since HT6 made the law run at the equip moment,
      // it happens while the inventory is still open, in front of you.
      // A player who equips a shield mid-fight has not asked to drop
      // anything, and a torch on a dungeon floor is an item lost to
      // whoever does not think to look down.
      //
      // So the port DEFAULTS to Unequip (0) - the light goes back to the
      // pack and `RememberLastLightSource` lights it again when a hand
      // comes free, which is the behaviour the rest of this mod is built
      // around. The mod's own default is ONE CLICK away on the Mods
      // pane's dial; nothing about the Drop path is removed, and the
      // throw (Throwing.ThrowTorchInput) is still how you put a torch on
      // the floor on purpose.
      'Handling.OnStow': Object.freeze({ default: 0, options: lazyWords(() => t('mods.handheldTorches.option.unequip', 'Unequip'), () => t('mods.handheldTorches.option.drop', 'Drop')), get description() { return t('mods.handheldTorches.Handling.OnStow.description', 'Behavior when forced to stow a light source'); } }),
      'Handling.OnPick': Object.freeze({ default: 1, options: lazyWords(() => t('mods.handheldTorches.option.store', 'Store'), () => t('mods.handheldTorches.option.equip', 'Equip'), () => t('mods.handheldTorches.option.forceEquip', 'Force Equip')), get description() { return t('mods.handheldTorches.Handling.OnPick.description', 'Behavior when picking up a light source'); } }),
      'Handling.StowWhenSpellcasting': Object.freeze({ default: true, get description() { return t('mods.handheldTorches.Handling.StowWhenSpellcasting.description', 'Casting or readying a spell puts the light away to free your hand.'); } }),
      'Handling.StowWhenClimbing': Object.freeze({ default: true, get description() { return t('mods.handheldTorches.Handling.StowWhenClimbing.description', 'Climbing puts the light away to free your hand.'); } }),
      'Handling.StowWhenSwimming': Object.freeze({ default: true, get description() { return t('mods.handheldTorches.Handling.StowWhenSwimming.description', 'Swimming puts the light away to free your hand.'); } }),
      'Handling.RelaxedTwoHandedWeapons': Object.freeze({ default: false, get description() { return t('mods.handheldTorches.Handling.RelaxedTwoHandedWeapons.description', 'Two-handed weapons will only occupy your off-hand when attacking'); } }),
      'Handling.RelaxedLanterns': Object.freeze({ default: false, get description() { return t('mods.handheldTorches.Handling.RelaxedLanterns.description', 'If enabled, will not stow lanterns when both hands are occupied'); } }),
      'Handling.LanternsAtWaist': Object.freeze({ default: true, get description() { return t('mods.handheldTorches.Handling.LanternsAtWaist.description', 'If enabled, lanterns hang at your waist instead of being held, so they never need a free hand and are never put away. Torches and candles are still held.'); } }),
      'Throwing.ThrowTorchInput': Object.freeze({ default: "X", text: true, get description() { return t('mods.handheldTorches.Throwing.ThrowTorchInput.description', 'Hold to wind up a throw, release to throw a torch.'); } }),
      'Throwing.ThrowStrength': Object.freeze({ default: 1.0, min: 0.0, max: 10.0, float: true, step: 0.25, get description() { return t('mods.handheldTorches.Throwing.ThrowStrength.description', 'Multiplies how hard you throw.'); } }),
      'Throwing.GravityStrength': Object.freeze({ default: 1.0, min: 0.0, max: 10.0, float: true, step: 0.25, get description() { return t('mods.handheldTorches.Throwing.GravityStrength.description', 'Multiplies how fast a thrown torch falls.'); } }),
      'Throwing.ThrowAngleOffset': Object.freeze({ default: 15.0, min: 0.0, max: 45.0, float: true, step: 0.25, get description() { return t('mods.handheldTorches.Throwing.ThrowAngleOffset.description', 'How many degrees above your aim the torch is thrown.'); } }),
      'Throwing.ThrowDispersion': Object.freeze({ default: 1.0, min: 0.0, max: 3.0, float: true, step: 0.1, get description() { return t('mods.handheldTorches.Throwing.ThrowDispersion.description', 'Degrees of random spread on the throw.'); } }),
      'Throwing.ThrowScaleSpeed': Object.freeze({ default: 1.0, min: 0.0, max: 10.0, float: true, step: 0.25, get description() { return t('mods.handheldTorches.Throwing.ThrowScaleSpeed.description', 'How fast the wind-up charges while the key is held.'); } }),
      'Throwing.ShowTrajectory': Object.freeze({ default: true, get description() { return t('mods.handheldTorches.Throwing.ShowTrajectory.description', 'Has no effect in this game: the throwing arc is not shown.'); } }),
      'Throwing.Bounciness': Object.freeze({ default: 0.5, min: 0.0, max: 1.0, float: true, step: 0.05, get description() { return t('mods.handheldTorches.Throwing.Bounciness.description', 'How much speed a thrown torch keeps when it bounces.'); } }),
      'Throwing.Combustion': Object.freeze({ default: true, get description() { return t('mods.handheldTorches.Throwing.Combustion.description', 'A thrown torch that hits an enemy can set it on fire.'); } }),
      'Throwing.Accuracy': Object.freeze({ default: 50, min: 0, max: 100, get description() { return t('mods.handheldTorches.Throwing.Accuracy.description', 'The to-hit modifier of the thrown torch.'); } }),
      'Throwing.Duration': Object.freeze({ default: 3, min: 0, max: 60, get description() { return t('mods.handheldTorches.Throwing.Duration.description', 'Number of rounds an enemy burns after being set on fire.'); } }),
      'Throwing.Chance': Object.freeze({ default: 50, min: 0, max: 100, get description() { return t('mods.handheldTorches.Throwing.Chance.description', 'Percentage chance that a hit sets an enemy on fire.'); } }),
      'Throwing.Magnitude': Object.freeze({ default: Object.freeze([1, 2]), tuple: 'int', get description() { return t('mods.handheldTorches.Throwing.Magnitude.description', 'Minimum and maximum fire damage dealt per round.'); } }),
      'Throwing.Emission': Object.freeze({ default: true, get description() { return t('mods.handheldTorches.Throwing.Emission.description', 'A burning enemy gives off light.'); } }),
      'Throwing.EmissionShadows': Object.freeze({ default: false, get description() { return t('mods.handheldTorches.Throwing.EmissionShadows.description', 'Has no effect in this game: light from a burning enemy does not cast shadows.'); } }),
      // MODS-ON (2026-09-14, Mac: "all mods should be on by default"): the
      // shipped modsettings.json carries `Sprite = False`, so the mod itself
      // ships its first-person hand switched off - and the hand is the mod's
      // whole subject. The HT2 audit measured what that costs: everything
      // works (all eight sprites decode and upload, the hand is free, the
      // torch is lit) and `draw()` still answers false, so a player lights a
      // torch and sees nothing. This ONE default departs; Ledger A row MODS-ON.
      'Modules.Sprite': Object.freeze({ default: true, get description() { return t('mods.handheldTorches.Modules.Sprite.description', 'Sprite: a first-person hand holding the lit torch or lantern.'); } }),
      'Modules.Bob': Object.freeze({ default: true, get description() { return t('mods.handheldTorches.Modules.Bob.description', 'Bob: the sprite sways as you walk, in step with Weapon Widget\u2019s bob.'); } }),
      'Modules.Inertia': Object.freeze({ default: false, get description() { return t('mods.handheldTorches.Modules.Inertia.description', 'Inertia: the light trails behind as you look around and move.'); } }),
      'Modules.Step': Object.freeze({ default: false, get description() { return t('mods.handheldTorches.Modules.Step.description', 'Step: the sprite\u2019s position is rounded so it moves in steps.'); } }),
      'Presentation.Tint': Object.freeze({ default: true, get description() { return t('mods.handheldTorches.Presentation.Tint.description', 'Matches the weapon sprite\'s tint when using First-Person-Lighting.'); } }),
      'Presentation.Ambidexterity': Object.freeze({ default: false, get description() { return t('mods.handheldTorches.Presentation.Ambidexterity.description', 'Mirror the first-person graphic depending on the free hand. Recommended when using Shield Widget.'); } }),
      'Presentation.Scale': Object.freeze({ default: 0.8, min: 0.8, max: 1.2, float: true, step: 0.05, get description() { return t('mods.handheldTorches.Presentation.Scale.description', 'Size of the first-person sprite.'); } }),
      'Presentation.Offset': Object.freeze({ default: Object.freeze([0.5, 0.5]), tuple: 'float', get description() { return t('mods.handheldTorches.Presentation.Offset.description', 'Horizontal and vertical screen position of the first-person hand.'); } }),
      'Presentation.Speed': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.handheldTorches.Presentation.Speed.description', 'How fast the sprite slides on and off the screen.'); } }),
      'Presentation.LockAspectRatio': Object.freeze({ default: true, get description() { return t('mods.handheldTorches.Presentation.LockAspectRatio.description', 'The sprite scales by the screen\u2019s width alone, keeping its proportions.'); } }),
      'Presentation.PlayerTorchAudio': Object.freeze({ default: true, get description() { return t('mods.handheldTorches.Presentation.PlayerTorchAudio.description', 'Plays a burning sound while you hold a torch'); } }),
      'Presentation.AudioVolume': Object.freeze({ default: 0.5, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.handheldTorches.Presentation.AudioVolume.description', 'Volume of the burning loop and the torch sounds.'); } }),
      'Bob.Length': Object.freeze({ default: 100, min: 0, max: 200, get description() { return t('mods.handheldTorches.Bob.Length.description', 'Number of bobs in a single stride.'); } }),
      'Bob.Offset': Object.freeze({ default: 0.0, min: 0.0, max: 1.0, float: true, step: 0.05, get description() { return t('mods.handheldTorches.Bob.Offset.description', 'Advances the bob timing. For use with weapon bob.'); } }),
      'Bob.SizeX': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.handheldTorches.Bob.SizeX.description', 'Extent of horizontal movement when bobbing'); } }),
      'Bob.SizeY': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.handheldTorches.Bob.SizeY.description', 'Extent of vertical movement when bobbing'); } }),
      'Bob.SpeedMove': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.handheldTorches.Bob.SpeedMove.description', 'Speed of transition between stationary and moving'); } }),
      'Bob.SpeedState': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.handheldTorches.Bob.SpeedState.description', 'Speed of transition between movement states'); } }),
      'Bob.Shape': Object.freeze({ default: 0, options: lazyWords(() => t('mods.handheldTorches.option.u', 'U'), () => t('mods.handheldTorches.option.sideways8', 'Sideways 8'), () => t('mods.handheldTorches.option.invertedU', 'Inverted U')), get description() { return t('mods.handheldTorches.Bob.Shape.description', 'Shape of bob'); } }),
      'Bob.BobWhileIdle': Object.freeze({ default: true, get description() { return t('mods.handheldTorches.Bob.BobWhileIdle.description', 'Whether the light will slightly bob while stationary'); } }),
      'Inertia.Scale': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.handheldTorches.Inertia.Scale.description', 'The maximum distance that the sprite will be offset'); } }),
      'Inertia.Speed': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.handheldTorches.Inertia.Speed.description', 'How fast the sprite moves toward the target offset.'); } }),
      'Inertia.ForwardDepth': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.handheldTorches.Inertia.ForwardDepth.description', 'Multiplier for the change in scale when moving forward or backward'); } }),
      'Inertia.ForwardSpeed': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.handheldTorches.Inertia.ForwardSpeed.description', 'How fast the sprite scales toward the target depth.'); } }),
      'Step.Length': Object.freeze({ default: 1, min: 1, max: 10, get description() { return t('mods.handheldTorches.Step.Length.description', 'Size of each step. Higher values move in larger jumps.'); } }),
      'Step.Condition': Object.freeze({ default: 0, options: lazyWords(() => t('mods.handheldTorches.option.sheatheAttackOnly', 'Sheathe/Attack Only'), () => t('mods.handheldTorches.option.allTransforms', 'All Transforms')), get description() { return t('mods.handheldTorches.Step.Condition.description', 'Whether snapping affects only sheathing or also other options such as Bob, Inertia, and Recoil.'); } }),
      'Compatibility.TextureScaleFactor': Object.freeze({ default: 1, min: 0, max: 8, get description() { return t('mods.handheldTorches.Compatibility.TextureScaleFactor.description', 'Divides a custom texture’s size. Raise it if a texture pack draws the hand too large.'); } }),
    }),
  }),
  'ambient-text': Object.freeze({
    title: 'Ambient Text',
    author: 'Regnier',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.ambientText.Enabled.description', 'Occasionally shows a short atmospheric line in the corner, such as how a crypt smells or how a village sounds at night. Lines depend on your location, the time, and the weather, and stay quiet indoors.');
        },
      }),
      textChance: Object.freeze({ default: 33, min: 0, max: 100, get description() { return t('mods.ambientText.textChance.description', 'Percentage chance of showing a line at each check'); } }),
      interval: Object.freeze({ default: 200, min: 60, max: 600, get description() { return t('mods.ambientText.interval.description', 'Real-time seconds between checks for a line'); } }),
      postTextInterval: Object.freeze({ default: 500, min: 60, max: 600, get description() { return t('mods.ambientText.postTextInterval.description', 'Real-time seconds to wait after a line is shown'); } }),
      textDisplayTime: Object.freeze({ default: 3, min: 1, max: 10, get description() { return t('mods.ambientText.textDisplayTime.description', 'Seconds a line stays on screen'); } }),
    }),
  }),
  'eye-of-the-beholder': Object.freeze({
    title: 'Eye Of The Beholder',
    author: 'RedRoryOTheGlen',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.eyeOfTheBeholder.Enabled.description', 'Third-person view without Morrowind data. Scroll out to move the camera behind your shoulder and see your character sprite on foot and on horseback. Off keeps you in first person unless you use the Morrowind body.');
        },
      }),
      'Camera.StartInThirdPerson': Object.freeze({ default: false, get description() { return t('mods.eyeOfTheBeholder.Camera.StartInThirdPerson.description', 'Start in third person when you start or load a game'); } }),
      'Camera.FrontalPlaneOffset': Object.freeze({ default: Object.freeze([0.0, 0.5]), tuple: 'float', get description() { return t('mods.eyeOfTheBeholder.FrontalPlaneOffset.description', 'Moves the camera sideways and up or down'); } }),
      'Camera.LongitudinalDistance': Object.freeze({ default: 2.0, min: 1, max: 10, float: true, get description() { return t('mods.eyeOfTheBeholder.LongitudinalDistance.description', 'How far behind you the camera sits'); } }),
      'Camera.MinimumDistance': Object.freeze({ default: 0.8, min: 0, max: 1, float: true, get description() { return t('mods.eyeOfTheBeholder.Camera.MinimumDistance.description', 'How close the camera can get to you, as a fraction of its normal distance.'); } }),
      'Camera.RidingOffset': Object.freeze({ default: 1.0, min: 0, max: 2, float: true, get description() { return t('mods.eyeOfTheBeholder.Camera.RidingOffset.description', 'Raises and pulls back the camera while you ride.'); } }),
      'Camera.Speed': Object.freeze({ default: 10.0, min: 1, max: 20, float: true, get description() { return t('mods.eyeOfTheBeholder.Camera.Speed.description', 'How fast the camera catches up to where it should be.'); } }),
      'Camera.Dampen': Object.freeze({ default: 1.0, min: 0, max: 5, float: true, get description() { return t('mods.eyeOfTheBeholder.Camera.Dampen.description', 'How much the camera lags behind a sudden move.'); } }),
      'Camera.Auto-Switch': Object.freeze({ default: true, get description() { return t('mods.eyeOfTheBeholder.Camera.AutoSwitch.description', 'Moves the camera to your other shoulder when there isn’t room'); } }),
      'Camera.SwitchResetTime': Object.freeze({ default: 3.0, min: 0, max: 6, float: true, get description() { return t('mods.eyeOfTheBeholder.Camera.SwitchResetTime.description', 'Seconds before the camera switches back. 0 keeps it switched'); } }),
      'Camera.TogglePerspective': Object.freeze({ default: 'KeypadEnter', text: true, get description() { return t('mods.eyeOfTheBeholder.Camera.TogglePerspective.description', 'Has no effect here: scroll the mouse wheel to change view.'); } }),
      'Camera.SwitchShoulder': Object.freeze({ default: 'B', text: true, get description() { return t('mods.eyeOfTheBeholder.Camera.SwitchShoulder.description', 'Moves the camera to your other shoulder.'); } }),
      'CameraOverrideWeapon.Enable': Object.freeze({ default: false, get description() { return t('mods.eyeOfTheBeholder.CameraOverrideWeapon.Enable.description', 'Use the camera position below while a weapon or spell is readied.'); } }),
      'CameraOverrideWeapon.FrontalPlaneOffset': Object.freeze({ default: Object.freeze([0.0, 0.5]), tuple: 'float', get description() { return t('mods.eyeOfTheBeholder.FrontalPlaneOffset.description', 'Moves the camera sideways and up or down'); } }),
      'CameraOverrideWeapon.LongitudinalDistance': Object.freeze({ default: 2.0, min: 1, max: 10, float: true, get description() { return t('mods.eyeOfTheBeholder.LongitudinalDistance.description', 'How far behind you the camera sits'); } }),
      'CameraOverrideMount.Enable': Object.freeze({ default: false, get description() { return t('mods.eyeOfTheBeholder.CameraOverrideMount.Enable.description', 'Use the camera position below while riding.'); } }),
      'CameraOverrideMount.FrontalPlaneOffset': Object.freeze({ default: Object.freeze([0.0, 0.5]), tuple: 'float', get description() { return t('mods.eyeOfTheBeholder.FrontalPlaneOffset.description', 'Moves the camera sideways and up or down'); } }),
      'CameraOverrideMount.LongitudinalDistance': Object.freeze({ default: 2.0, min: 1, max: 10, float: true, get description() { return t('mods.eyeOfTheBeholder.LongitudinalDistance.description', 'How far behind you the camera sits'); } }),
      'CameraOverrideBoat.Enable': Object.freeze({ default: false, get description() { return t('mods.eyeOfTheBeholder.CameraOverrideBoat.Enable.description', 'Use the camera position below while sailing.'); } }),
      'CameraOverrideBoat.FrontalPlaneOffset': Object.freeze({ default: Object.freeze([0.0, 0.0]), tuple: 'float', get description() { return t('mods.eyeOfTheBeholder.FrontalPlaneOffset.description', 'Moves the camera sideways and up or down'); } }),
      'CameraOverrideBoat.LongitudinalDistance': Object.freeze({ default: 2.0, min: 0, max: 10, float: true, get description() { return t('mods.eyeOfTheBeholder.LongitudinalDistance.description', 'How far behind you the camera sits'); } }),
      'CameraOverrideBoat.Target': Object.freeze({ default: 1, options: lazyWords(() => t('mods.eyeOfTheBeholder.option.hull', 'Hull'), () => t('mods.eyeOfTheBeholder.option.masthead', 'Masthead')), get description() { return t('mods.eyeOfTheBeholder.CameraOverrideBoat.Target.description', 'What the camera looks at while sailing.'); } }),
      'CameraScrolling.ScrollableZOffset': Object.freeze({ default: true, get description() { return t('mods.eyeOfTheBeholder.CameraScrolling.ScrollableZOffset.description', 'Scroll to move the camera closer or further away'); } }),
      'CameraScrolling.ScrollIncrement': Object.freeze({ default: 0.2, min: 0.1, max: 1, float: true, get description() { return t('mods.eyeOfTheBeholder.CameraScrolling.ScrollIncrement.description', 'How far the camera moves with each scroll'); } }),
      'CameraScrolling.ScrollableZOffsetAxis': Object.freeze({ default: 'Mouse ScrollWheel', text: true, axis: true, get description() { return t('mods.eyeOfTheBeholder.CameraScrolling.ScrollableZOffsetAxis.description', 'Has no effect here: the mouse wheel always moves the camera.'); } }),
      'AutoTogglePerspective.ToggleInput': Object.freeze({ default: 'KeypadPlus', text: true, get description() { return t('mods.eyeOfTheBeholder.AutoTogglePerspective.ToggleInput.description', 'Key that turns the automatic view changes below on or off.'); } }),   // KB1: not read by the mod any more - the key is the registry's action (inputActions.js MOD_ACTIONS); a player's saved value is carried there once (migrateKeyBinds)
      'AutoTogglePerspective.OnFoot': Object.freeze({ default: 0, options: EOTB_VIEWS, get description() { return t('mods.eyeOfTheBeholder.AutoTogglePerspective.OnFoot.description', 'Camera view to use on foot with nothing readied.'); } }),
      'AutoTogglePerspective.OnFootMelee': Object.freeze({ default: 0, options: EOTB_VIEWS, get description() { return t('mods.eyeOfTheBeholder.AutoTogglePerspective.OnFootMelee.description', 'Camera view to use on foot with a weapon readied.'); } }),
      'AutoTogglePerspective.OnFootRanged': Object.freeze({ default: 0, options: EOTB_VIEWS, get description() { return t('mods.eyeOfTheBeholder.AutoTogglePerspective.OnFootRanged.description', 'Camera view to use on foot with a bow readied.'); } }),
      'AutoTogglePerspective.OnFootSpell': Object.freeze({ default: 0, options: EOTB_VIEWS, get description() { return t('mods.eyeOfTheBeholder.AutoTogglePerspective.OnFootSpell.description', 'Camera view to use on foot with a spell readied.'); } }),
      'AutoTogglePerspective.OnHorse': Object.freeze({ default: 0, options: EOTB_VIEWS, get description() { return t('mods.eyeOfTheBeholder.AutoTogglePerspective.OnHorse.description', 'Camera view to use on horseback.'); } }),
      'AutoTogglePerspective.OnHorseReady': Object.freeze({ default: 0, options: EOTB_VIEWS, get description() { return t('mods.eyeOfTheBeholder.AutoTogglePerspective.OnHorseReady.description', 'Camera view to use on horseback with something readied.'); } }),
      'AutoTogglePerspective.OnLycan': Object.freeze({ default: 0, options: EOTB_VIEWS, get description() { return t('mods.eyeOfTheBeholder.AutoTogglePerspective.OnLycan.description', 'Camera view to use while transformed.'); } }),
      'AutoTogglePerspective.OnTransitionInterior': Object.freeze({ default: 0, options: EOTB_VIEWS, get description() { return t('mods.eyeOfTheBeholder.AutoTogglePerspective.OnTransitionInterior.description', 'Camera view to use when going indoors.'); } }),
      'AutoTogglePerspective.OnTransitionExterior': Object.freeze({ default: 0, options: EOTB_VIEWS, get description() { return t('mods.eyeOfTheBeholder.AutoTogglePerspective.OnTransitionExterior.description', 'Camera view to use when going outside.'); } }),
      'Graphics.Enable': Object.freeze({ default: true, get description() { return t('mods.eyeOfTheBeholder.Graphics.Enable.description', 'Show your character sprite'); } }),
      'Graphics.PlayerBody': Object.freeze({ default: 0, options: lazyWords(() => t('mods.eyeOfTheBeholder.option.playerPaperdoll', 'Paperdoll for player'), () => t('mods.eyeOfTheBeholder.option.playerSprite', '8 directional animated sprite')), get description() { return t('mods.eyeOfTheBeholder.Graphics.PlayerBody.description', 'How you are drawn in third person: as your paperdoll, front and back, or as the eight-direction animated sprite'); } }),
      'Graphics.OnFoot': Object.freeze({ default: 0, min: 0, max: FOOT_SKIN_COUNT - 1, get description() { return t('mods.eyeOfTheBeholder.Graphics.OnFoot.description', 'Sprite when on foot'); },
        labels: lazyWords(() => t('mods.eyeOfTheBeholder.skin.lightFighterFemale', 'Light Fighter (female)'), () => t('mods.eyeOfTheBeholder.skin.lightFighterMale', 'Light Fighter (male)'),
          () => t('mods.eyeOfTheBeholder.skin.mediumFighterFemale', 'Medium Fighter (female)'), () => t('mods.eyeOfTheBeholder.skin.mediumFighterMale', 'Medium Fighter (male)'),
          () => t('mods.eyeOfTheBeholder.skin.heavyFighterFemale', 'Heavy Fighter (female)'), () => t('mods.eyeOfTheBeholder.skin.heavyFighterMale', 'Heavy Fighter (male)'),
          () => t('mods.eyeOfTheBeholder.skin.mageFemale', 'Mage (female)'), () => t('mods.eyeOfTheBeholder.skin.mageMale', 'Mage (male)'),
          () => t('mods.eyeOfTheBeholder.skin.thiefMageFemale', 'Thief Mage (female)'), () => t('mods.eyeOfTheBeholder.skin.thiefMageMale', 'Thief Mage (male)'),
          () => t('mods.eyeOfTheBeholder.skin.fighterMageFemale', 'Fighter Mage (female)'), () => t('mods.eyeOfTheBeholder.skin.fighterMageMale', 'Fighter Mage (male)'),
          () => t('mods.eyeOfTheBeholder.skin.thiefFemale', 'Thief (female)'), () => t('mods.eyeOfTheBeholder.skin.thiefMale', 'Thief (male)'),
          () => t('mods.eyeOfTheBeholder.skin.fighterThiefFemale', 'Fighter Thief (female)'), () => t('mods.eyeOfTheBeholder.skin.fighterThiefMale', 'Fighter Thief (male)'),
          ...CLASS_SKINS.map((skin) => () => classSkinLabel(skin))) }),
      'Graphics.OnHorse': Object.freeze({ default: 0, min: 0, max: 4, get description() { return t('mods.eyeOfTheBeholder.Graphics.OnHorse.description', 'Sprite when riding a horse'); },
        labels: lazyWords(() => t('mods.eyeOfTheBeholder.skin.lightFighterFemale', 'Light Fighter (female)'), () => t('mods.eyeOfTheBeholder.skin.mediumFighterMale', 'Medium Fighter (male)'),
          () => t('mods.eyeOfTheBeholder.skin.mediumFighterFemale', 'Medium Fighter (female)'), () => t('mods.eyeOfTheBeholder.skin.heavyFighterMale', 'Heavy Fighter (male)'),
          () => t('mods.eyeOfTheBeholder.skin.heavyFighterFemale', 'Heavy Fighter (female)')) }),
      // LAYERED-GEAR (2026-10-18, the owner: "add a option between those two thats also called On foot Layered Gearing
      // Skin (WIP) Female and Male"): the on-foot body drawn in the helmet, chest and legs armor it wears
      // (player/eyeOfTheBeholder/layeredArmor.js), as a woman or a man - a skin the player chooses on the profile
      // (ui/skinCard.js, its Look toggle), not a feature's dial. 0 off (Skins), 1 female, 2 male, 3 the character's own
      // body - the default (LAYERED-GEAR-ON, 2026-10-19, the owner: "Make sure this is on by default"; layeredArmor.js
      // LAYERED_OWN). The look carries the body as `lg` (net/remotePlayers.js composeLook, wire.js validLook), so other
      // players see it too.
      'Graphics.LayeredGear': Object.freeze({ default: 3, min: 0, max: 3, get description() { return t('mods.eyeOfTheBeholder.Graphics.LayeredGear.description', 'Draws your on-foot sprite wearing your equipped helmet, chest, and leg armor (work in progress).'); },
        labels: lazyWords(() => t('mods.eyeOfTheBeholder.skin.layeredOff', 'Off'), () => t('mods.eyeOfTheBeholder.skin.layeredFemale', 'Female'),
          () => t('mods.eyeOfTheBeholder.skin.layeredMale', 'Male'), () => t('mods.eyeOfTheBeholder.skin.layeredOwn', 'Your own body')) }),
      'Graphics.ReadyStance': Object.freeze({ default: 2, options: lazyWords(() => t('mods.eyeOfTheBeholder.option.never', 'Never'), () => t('mods.eyeOfTheBeholder.option.whenIdle', 'When Idle'), () => t('mods.eyeOfTheBeholder.option.whenIdleOrMoving', 'When Idle or Moving')), get description() { return t('mods.eyeOfTheBeholder.Graphics.ReadyStance.description', 'Whether the sprite changes to a ready stance when you ready a weapon or spell.'); } }),
      'Graphics.TurnToView': Object.freeze({ default: 2, options: lazyWords(() => t('mods.eyeOfTheBeholder.option.never', 'Never'), () => t('mods.eyeOfTheBeholder.option.onlyWhenAnimating', 'Only When Animating'), () => t('mods.eyeOfTheBeholder.option.whenWeaponReadied', 'When Weapon Readied'), () => t('mods.eyeOfTheBeholder.option.always', 'Always')), get description() { return t('mods.eyeOfTheBeholder.Graphics.TurnToView.description', 'When the sprite turns to face where you look'); } }),
      'Graphics.AttackStrings': Object.freeze({ default: 3, options: lazyWords(() => localizedText('none', 'None'), () => t('mods.eyeOfTheBeholder.option.mirror', 'Mirror'), () => t('mods.eyeOfTheBeholder.option.pingPong', 'PingPong'), () => t('mods.eyeOfTheBeholder.option.mixed', 'Mixed')), get description() { return t('mods.eyeOfTheBeholder.Graphics.AttackStrings.description', 'Extra attack animations. Here PingPong looks the same as None, and Mixed the same as Mirror.'); } }),
      'Graphics.MirrorTime': Object.freeze({ default: 3.0, min: 1, max: 5, float: true, get description() { return t('mods.eyeOfTheBeholder.Graphics.MirrorTime.description', 'Seconds before a mirrored sprite turns back. 0 turns this off.'); } }),
      'Graphics.PingPongOffset': Object.freeze({ default: 1, min: -3, max: 3, get description() { return t('mods.eyeOfTheBeholder.Graphics.PingPongOffset.description', 'Has no effect here: attacks never play backwards in this game.'); } }),
      'Graphics.FirstPersonBillboard': Object.freeze({ default: 1, options: lazyWords(() => localizedText('none', 'None'), () => t('mods.eyeOfTheBeholder.option.shadowsOnly', 'Shadows Only'), () => t('mods.eyeOfTheBeholder.option.visible', 'Visible')), get description() { return t('mods.eyeOfTheBeholder.Graphics.FirstPersonBillboard.description', 'Whether your character sprite shows in first person'); } }),
      'Graphics.ShowCart': Object.freeze({ default: true, get description() { return t('mods.eyeOfTheBeholder.Graphics.ShowCart.description', 'A 3D cart follows you when you travel with your cart'); } }),
      'Graphics.TorchOffset': Object.freeze({ default: 1, options: lazyWords(() => t('mods.eyeOfTheBeholder.option.vanilla', 'Vanilla'), () => t('mods.eyeOfTheBeholder.option.billboard', 'Billboard'), () => t('mods.eyeOfTheBeholder.option.selfie', 'Selfie')), get description() { return t('mods.eyeOfTheBeholder.Graphics.TorchOffset.description', 'Whether the torch follows the orientation of the sprite'); } }),
      'Animation.WalkCycleSpeed': Object.freeze({ default: 1.0, min: 0.5, max: 1.5, float: true, get description() { return t('mods.eyeOfTheBeholder.Animation.WalkCycleSpeed.description', 'Multiplier on how fast the walk cycle plays.'); } }),
      'Animation.SyncFootsteps': Object.freeze({ default: true, get description() { return t('mods.eyeOfTheBeholder.Animation.SyncFootsteps.description', 'Footstep sounds match the sprite’s steps.'); } }),
      'Animation.BillboardScale': Object.freeze({ default: 1.0, min: 0, max: 10, float: true, get description() { return t('mods.eyeOfTheBeholder.Animation.BillboardScale.description', 'Size of the player sprite.'); } }),
      'Animation.FineBillboardScale': Object.freeze({ default: 0.0, min: 0, max: 1, float: true, get description() { return t('mods.eyeOfTheBeholder.Animation.FineBillboardScale.description', 'Fine adjustment added to the player sprite size.'); } }),
      'Animation.GlobalOffsetScale': Object.freeze({ default: 1.0, min: 0, max: 10, float: true, get description() { return t('mods.eyeOfTheBeholder.Animation.GlobalOffsetScale.description', 'Has no effect: the mod never uses this setting.'); } }),
      'Animation.FineGlobalOffsetScale': Object.freeze({ default: 0.0, min: 0, max: 1, float: true, get description() { return t('mods.eyeOfTheBeholder.Animation.FineGlobalOffsetScale.description', 'Has no effect: the mod never uses this setting.'); } }),
      'Compatibility.Don\'tHideWeapon': Object.freeze({ default: false, get description() { return t('mods.eyeOfTheBeholder.Compatibility.DontHideWeapon.description', 'Keeps the first-person weapon on screen in third person'); } }),
      'Compatibility.Don\'tHideHorse': Object.freeze({ default: false, get description() { return t('mods.eyeOfTheBeholder.Compatibility.DontHideHorse.description', 'Keeps the first-person horse on screen in third person'); } }),
      'Compatibility.Don\'tOffsetAttacks': Object.freeze({ default: false, get description() { return t('mods.eyeOfTheBeholder.Compatibility.DontOffsetAttacks.description', 'Attacks start from the camera instead of your character’s body'); } }),
      'Debug.ShowMessages': Object.freeze({ default: true, get description() { return t('mods.eyeOfTheBeholder.Debug.ShowMessages.description', 'Shows a message when the view or shoulder changes.'); } }),
    }),
  }),
  'immersive-footsteps': Object.freeze({
    title: 'Immersive Footsteps',
    author: 'Kirk.O',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() { return t('mods.immersiveFootsteps.Enabled.description', 'Footsteps that match the ground you walk on, and armor that rattles as you move.'); },
      }),
      'AudioQualitySettings.SoundClipQuality': Object.freeze({ default: 0, options: lazyWords(() => t('mods.immersiveFootsteps.option.lowQualityRetro', 'Low-Quality (Retro)'), () => t('mods.immersiveFootsteps.option.highQuality', 'High-Quality')), get description() { return t('mods.immersiveFootsteps.AudioQualitySettings.SoundClipQuality.description', 'Quality of the footstep sounds'); } }),
      'FootstepSettings.AllowFootstepSounds': Object.freeze({ default: true, get description() { return t('mods.immersiveFootsteps.FootstepSettings.AllowFootstepSounds.description', 'Play footstep sounds'); } }),
      'FootstepSettings.FootstepVolumeMulti': Object.freeze({ default: 1.0, min: 0.0, max: 10.0, float: true, step: 0.1, get description() { return t('mods.immersiveFootsteps.FootstepSettings.FootstepVolumeMulti.description', 'Volume of footstep sounds'); } }),
      'FootstepSettings.FootstepFrequency': Object.freeze({ default: 0.6, min: 0.3, max: 3.0, float: true, step: 0.1, get description() { return t('mods.immersiveFootsteps.FootstepSettings.FootstepFrequency.description', 'How often footstep sounds play. Lower values play more often.'); } }),
      'ArmorSwaySettings.AllowArmorSwaySounds': Object.freeze({ default: true, get description() { return t('mods.immersiveFootsteps.ArmorSwaySettings.AllowArmorSwaySounds.description', 'Play armor sounds as you move'); } }),
      'ArmorSwaySettings.ArmorSwayVolumeMulti': Object.freeze({ default: 1.0, min: 0.0, max: 10.0, float: true, step: 0.1, get description() { return t('mods.immersiveFootsteps.ArmorSwaySettings.ArmorSwayVolumeMulti.description', 'Volume of armor sounds'); } }),
      'ArmorSwaySettings.ArmorSwayFrequency': Object.freeze({ default: 0.6, min: 0.3, max: 3.0, float: true, step: 0.1, get description() { return t('mods.immersiveFootsteps.ArmorSwaySettings.ArmorSwayFrequency.description', 'How often armor sounds play. Lower values play more often.'); } }),
      'ErrorLoggingAndCompatibilitySettings.AllowModCompatWarnings': Object.freeze({ default: true, get description() { return t('mods.immersiveFootsteps.ErrorLoggingAndCompatibilitySettings.AllowModCompatWarnings.description', 'Warns you when another mod clashes with this one'); } }),
      'ErrorLoggingAndCompatibilitySettings.AllowVerboseErrorLogging': Object.freeze({ default: false, get description() { return t('mods.immersiveFootsteps.ErrorLoggingAndCompatibilitySettings.AllowVerboseErrorLogging.description', 'Has no effect. The game does not write an error log.'); } }),
      'ErrorLoggingAndCompatibilitySettings.DoNotSpamExceptionsLogs': Object.freeze({ default: true, get description() { return t('mods.immersiveFootsteps.ErrorLoggingAndCompatibilitySettings.DoNotSpamExceptionsLogs.description', 'Has no effect. The game does not write an error log.'); } }),
    }),
  }),
  'better-ambience': Object.freeze({
    title: 'Better Ambience',
    author: 'Joshua Steinhauer',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.betterAmbience.Enabled.description', 'The camera shakes when you’re hurt, each dungeon gets its own fog, lighting, and echo, and you can hear rain indoors.');
        },
      }),
      'Better Footsteps.enable': Object.freeze({ default: false, get description() { return t('mods.betterAmbience.BetterFootsteps.enable.description', 'Plays Better Ambience’s own footstep sounds'); } }),
      'Better Footsteps.armorVolume': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.betterAmbience.BetterFootsteps.armorVolume.description', 'Volume for armor clanking'); } }),
      'Better Footsteps.footstepVolume': Object.freeze({ default: 1.0, min: 0.0, max: 2.0, float: true, step: 0.1, get description() { return t('mods.betterAmbience.BetterFootsteps.footstepVolume.description', 'Volume for footsteps'); } }),
      'Dungeon Reverb.level': Object.freeze({ default: 1, options: lazyWords(() => localizedText('low', 'Low'), () => localizedText('medium', 'Medium'), () => localizedText('high', 'High')), get description() { return t('mods.betterAmbience.DungeonReverb.level.description', 'How much a dungeon echoes: Low is a cave, Medium is a stone room, and High is a quarry.'); } }),
      'Camera Shake.shakeAmountAdd': Object.freeze({ default: 0.0, min: 0.0, max: 20.0, float: true, step: 0.5, get description() { return t('mods.betterAmbience.CameraShake.shakeAmountAdd.description', 'Base camera shake added to every hit, on top of the damage-based shake.'); } }),
      'Camera Shake.shakeAmountMultiplier': Object.freeze({ default: 10.0, min: 0.0, max: 20.0, float: true, step: 0.5, get description() { return t('mods.betterAmbience.CameraShake.shakeAmountMultiplier.description', 'Camera shake per hit, scaled by the damage relative to your maximum health.'); } }),
      'Camera Shake.maxShake': Object.freeze({ default: 10.0, min: 0.1, max: 30.0, float: true, step: 0.5, get description() { return t('mods.betterAmbience.CameraShake.maxShake.description', 'Maximum camera shake from a single hit.'); } }),
      'Camera Shake.roughness': Object.freeze({ default: 10.0, min: 0.1, max: 30.0, float: true, step: 0.5, get description() { return t('mods.betterAmbience.CameraShake.roughness.description', 'How jarring the shake is: lower is smoother.'); } }),
      'Camera Shake.fadeInTime': Object.freeze({ default: 0.3, min: 0.05, max: 3.0, float: true, step: 0.05, get description() { return t('mods.betterAmbience.CameraShake.fadeInTime.description', 'Seconds the shake takes to build.'); } }),
      'Camera Shake.fadeOutTime': Object.freeze({ default: 0.5, min: 0.05, max: 3.0, float: true, step: 0.05, get description() { return t('mods.betterAmbience.CameraShake.fadeOutTime.description', 'Seconds the shake takes to settle.'); } }),
      'Dungeon Fog.enableFog': Object.freeze({ default: true, get description() { return t('mods.betterAmbience.DungeonFog.enableFog.description', 'Gives each dungeon its own random fog'); } }),
      'Dungeon Fog.maxFogDistance': Object.freeze({ default: 100.0, min: 20.0, max: 200.0, float: true, step: 1, get description() { return t('mods.betterAmbience.DungeonFog.maxFogDistance.description', 'Maximum distance the fog reaches past its starting point.'); } }),
      'Dungeon Fog.minFogDistance': Object.freeze({ default: 80.0, min: 20.0, max: 200.0, float: true, step: 1, get description() { return t('mods.betterAmbience.DungeonFog.minFogDistance.description', 'Minimum distance the fog reaches past its starting point.'); } }),
      'Dungeon Fog.maxFogStart': Object.freeze({ default: 10.0, min: 0.0, max: 100.0, float: true, step: 1, get description() { return t('mods.betterAmbience.DungeonFog.maxFogStart.description', 'Maximum distance from you where the fog can start.'); } }),
      'Dungeon Fog.minFogStart': Object.freeze({ default: 0.0, min: 0.0, max: 100.0, float: true, step: 1, get description() { return t('mods.betterAmbience.DungeonFog.minFogStart.description', 'Minimum distance from you where the fog can start.'); } }),
      'Dungeon Lighting.enableFogAmbientEffect': Object.freeze({ default: false, get description() { return t('mods.betterAmbience.DungeonLighting.enableFogAmbientEffect.description', 'Lights each dungeon in the color of its fog'); } }),   // BA2: ships off (see above)
      'Dungeon Lighting.dungeonDarkness': Object.freeze({ default: 1.0, min: 0.0, max: 3.0, float: true, step: 0.1, get description() { return t('mods.betterAmbience.DungeonLighting.dungeonDarkness.description', 'The darkness of dungeons'); } }),
      'Dungeon Lighting.fogAmbientEffect': Object.freeze({ default: 0.2, min: 0.0, max: 1.0, float: true, step: 0.05, get description() { return t('mods.betterAmbience.DungeonLighting.fogAmbientEffect.description', 'How much the random dungeon color affects dungeon lighting'); } }),
      'Better Rain.enableBetterRain': Object.freeze({ default: true, get description() { return t('mods.betterAmbience.BetterRain.enableBetterRain.description', 'Improves the appearance of rain particles'); } }),
      'Better Rain.enableBetterSnow': Object.freeze({ default: true, get description() { return t('mods.betterAmbience.BetterRain.enableBetterSnow.description', 'Improves the appearance of snow particles'); } }),
    }),
  }),
  'oblivion-remaster-leveling': Object.freeze({
    title: 'Oblivion Remaster Like Leveling',
    author: 'Nexus Morrowind 56569',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.oblivionRemasterLeveling.Enabled.description', 'Level up like Oblivion Remastered: raising skills fills a 100-point bar, and each level grants virtues to spend on attributes. New characters can choose which leveling system to use.');
        },
      }),
      attributePoints: Object.freeze({ default: 12, min: 0, max: 60, get description() { return t('mods.oblivionRemasterLeveling.attributePoints.description', 'Amount of points for increasing attributes'); } }),
      maxUpdatableAttribute: Object.freeze({ default: 3, min: 2, max: 8, get description() { return t('mods.oblivionRemasterLeveling.maxUpdatableAttribute.description', 'The number of attributes to be increased in one level up'); } }),
      allowLuckIncrease: Object.freeze({ default: true, get description() { return t('mods.oblivionRemasterLeveling.allowLuckIncrease.description', 'Allow Luck to be increased by more than one point'); } }),
      luckIncreaseCost: Object.freeze({ default: 4, min: 1, max: 20, get description() { return t('mods.oblivionRemasterLeveling.luckIncreaseCost.description', 'Cost to upgrade Luck by one point'); } }),
      primarySkillsImpact: Object.freeze({ default: 8, min: 0, max: 100, get description() { return t('mods.oblivionRemasterLeveling.primarySkillsImpact.description', 'Points given by a Primary Skill level up (100 points required to level up). Morrowind has no Primary skills, so this starts equal to Major skills.'); } }),
      majorSkillsImpact: Object.freeze({ default: 8, min: 0, max: 100, get description() { return t('mods.oblivionRemasterLeveling.majorSkillsImpact.description', 'Points given by a Major Skill level up (100 points required to level up)'); } }),
      minorSkillsImpact: Object.freeze({ default: 6, min: 0, max: 100, get description() { return t('mods.oblivionRemasterLeveling.minorSkillsImpact.description', 'Points given by a Minor Skill level up (100 points required to level up)'); } }),
      miscSkillsImpact: Object.freeze({ default: 2, min: 0, max: 100, get description() { return t('mods.oblivionRemasterLeveling.miscSkillsImpact.description', 'Points given by a Misc Skill level up (100 points required to level up)'); } }),
    }),
  }),
  'travel-options': Object.freeze({
    title: 'Travel Options',
    author: 'Hazelnut',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.travelOptions.Enabled.description', 'Lets you choose classic fast travel or a journey sped up to 60 times, with road following, steering, and stops for places and encounters. Off brings back the classic travel map with fast travel only.');
        },
      }),
      'CautiousTravel.PlayerControlledCautiousTravel': Object.freeze({ default: true, get description() { return t('mods.travelOptions.CautiousTravel.PlayerControlledCautiousTravel.description', "Enables the travel option \"Cautiously\" to initiate time accelerated travel, instead of vanilla fast travel"); } }),
      'CautiousTravel.SpeedPenalty': Object.freeze({ default: 20, min: 5, max: 40, get description() { return t('mods.travelOptions.CautiousTravel.SpeedPenalty.description', 'How much slower cautious travel is, in percent'); } }),
      'CautiousTravel.MaxChanceToAvoidEncounter': Object.freeze({ default: 95, min: 60, max: 100, get description() { return t('mods.travelOptions.CautiousTravel.MaxChanceToAvoidEncounter.description', 'The best chance, in percent, to avoid an encounter when traveling cautiously'); } }),
      'CautiousTravel.HealthMinimumPercentage': Object.freeze({ default: 5, min: 0, max: 25, get description() { return t('mods.travelOptions.CautiousTravel.HealthMinimumPercentage.description', 'Pause a cautious journey when your health drops to this percentage'); } }),
      'CautiousTravel.FatigueMinimumValue': Object.freeze({ default: 5, min: 0, max: 50, get description() { return t('mods.travelOptions.CautiousTravel.FatigueMinimumValue.description', 'Pause a cautious journey when your fatigue drops to this value'); } }),
      // TO-FIELD2 (Mac, 2026-09-18): "travel options instantly transports
      // you to a destination and theres no travel". DEPARTURE FROM THE
      // MOD'S SHIPPED DEFAULT, on Mac's word, and it is the whole of that
      // report. IsPlayerControlledTravel is an AND over three toggles
      // (travelPopUp.js:"export function isPlayerControlledTravel"): `(cautiousTravel || !speedCautious) &&
      // (stopAtInnsTravel || !sleepModeInn) && !travelShip`. The popup
      // opens with `sleepModeInn = true` - classic Daggerfall's own
      // default, stopping at inns - so with this key false the second
      // clause is false and EVERY default trip fell to DFU's fast
      // travel. A player had to find the Camp Out toggle before the mod
      // they turned on ever ran. Hazelnut ships it false because his
      // mod is opt-in over vanilla; here the walked journey IS the
      // feature, so it is on. The key is still a key: turning it off in
      // the Mods pane restores the mod's own default exactly.
      'StopAtInnsTravel.PlayerControlledInnsTravel': Object.freeze({ default: true, get description() { return t('mods.travelOptions.StopAtInnsTravel.PlayerControlledInnsTravel.description', 'Makes the "Inns" travel option start time-accelerated travel instead of instant fast travel.'); } }),
      'ShipTravel.OnlyFromPorts': Object.freeze({ default: true, get description() { return t('mods.travelOptions.ShipTravel.OnlyFromPorts.description', 'Allows ship travel only from locations with a port.'); } }),
      'ShipTravel.OnlyToPorts': Object.freeze({ default: false, get description() { return t('mods.travelOptions.ShipTravel.OnlyToPorts.description', 'Allows ship travel only to destinations with a port when departing from ports is required.'); } }),
      'GeneralOptions.AllowTargetingMapCoordinates': Object.freeze({ default: true, get description() { return t('mods.travelOptions.GeneralOptions.AllowTargetingMapCoordinates.description', "Allows travel map to target any coordinates using time accelerated travel"); } }),
      'GeneralOptions.LocationPause': Object.freeze({ default: 0, options: lazyWords(() => t('mods.travelOptions.option.off', 'off'), () => t('mods.travelOptions.option.nearby', 'nearby'), () => t('mods.travelOptions.option.entered', 'entered')), get description() { return t('mods.travelOptions.GeneralOptions.LocationPause.description', "Auto pause when encountering a game location during real time accelerated travel"); } }),
      'GeneralOptions.AllowWeather': Object.freeze({ default: false, get description() { return t('mods.travelOptions.GeneralOptions.AllowWeather.description', "Allows weather effects during time accelerated travel"); } }),
      'GeneralOptions.AllowAnnoyingSounds': Object.freeze({ default: false, get description() { return t('mods.travelOptions.GeneralOptions.AllowAnnoyingSounds.description', "Allows footstep and hoof sounds during time accelerated travel"); } }),
      'GeneralOptions.AllowRealGrass': Object.freeze({ default: false, get description() { return t('mods.travelOptions.GeneralOptions.AllowRealGrass.description', 'Has no effect here: Real Grass isn’t included.'); } }),
      // TRAVEL-NAV1 (2026-09-25, Mac: "Improving travel options navigation
      // to properly route around objects and stopping before running into
      // buildings"): THE PORT'S OWN KEY on the mod's pane, as HT-WAIST's is
      // on Handheld Torches' - the vendored modsettings.json does not carry
      // it and its words say so. ON: a journey steers round buildings,
      // walls and rocks and pauses short of what it cannot pass
      // (systems/travel/travelSteer.js). OFF: the mod's own beeline, exactly.
      'GeneralOptions.AvoidObstacles': Object.freeze({ default: true, get description() { return t('mods.travelOptions.GeneralOptions.AvoidObstacles.description', 'Steers time-accelerated travel around buildings, walls, and rocks, and pauses the journey if an obstacle blocks the path.'); } }),
      // OW-TOGGLE (2026-09-28, Mac: "bring back the original travel option as a toggle. Off by default." - "The normal
      // first person travel accelerated was removed in favor of the overworld travel"): THE PORT'S OWN KEY on the mod's
      // pane, as AvoidObstacles is. ON: a journey is the mod's own, walked in first person as before OW-ONLY - a map
      // pick begins it on the ground, the view does not rise with it and coming down does not stop it
      // (scenes/world.js tvOwnsJourneys, which reads it live - AUDIT OW5 T1). OFF, the default: OW-ONLY.
      'GeneralOptions.FirstPersonTravel': Object.freeze({ default: false, get description() { return t('mods.travelOptions.GeneralOptions.FirstPersonTravel.description', 'Runs time-accelerated travel in first person on the ground. When off, the enhanced interface uses the Overworld view. Takes effect immediately.'); } }),
      // TO-ROADS (FIELD BUGS 2026-09-29d, SylviaBun on the Discord: "Travel Options First Person doesn't follow roads like
      // Overworld Travel Options does" - "A way to toggle this behavior to match or not would be nice"): THE PORT'S OWN
      // KEY beside First-Person Travel, the same shape - not in the vendored modsettings.json, on the tile, read live. ON,
      // with First-Person Travel on: a journey picked on the travel map is the Overworld's route - its planner, its legs,
      // its refusals (scenes/world.js tvRoutesJourneys) - walked in first person, the view not raised. OFF, the default:
      // First-Person Travel is the mod's own straight journey, the original travel option Mac asked back.
      'GeneralOptions.FirstPersonTravelFollowsRoads': Object.freeze({ default: false, get description() { return t('mods.travelOptions.GeneralOptions.FirstPersonTravelFollowsRoads.description', 'When First Person Travel is enabled, journeys follow roads and tracks, and unreachable destinations cannot be selected. When off, you travel in a straight line. Takes effect immediately.'); } }),
      // RATE-LAW (2026-10-04, Mac: "Remove travel options dials" / "Roads now travel at x100 and non roads at x60"): the
      // mod's TimeAcceleration section (DefaultStartingAcceleration, AlwaysUseStartingAcceleration, AccelerationLimit)
      // is not declared - the spinner it started and bounded is gone, and a journey runs at its ground's rate
      // (systems/timeScale.js travelRateOf). The vendored modsettings.json keeps the three; test/systems/travel/to1_travelOptions.test.js
      // names them as the one section the port leaves out.
      'Teleportation.EnablePaidTeleportation': Object.freeze({ default: false, get description() { return t('mods.travelOptions.Teleportation.EnablePaidTeleportation.description', 'Lets Mages Guild members below rank 8 pay for teleportation services.'); } }),
      // the shipped file's spacer section "__" carries no keys
      'RoadsIntegration.Enable': Object.freeze({ default: true, get description() { return t('mods.travelOptions.RoadsIntegration.Enable.description', "Enhances the travel map with larger location dots for cities & towns, and shows roads & tracks with toggle buttons"); } }),
      'RoadsIntegration.VariableSizeDots': Object.freeze({ default: true, get description() { return t('mods.travelOptions.RoadsIntegration.VariableSizeDots.description', 'Draws all locations except cities and towns as smaller dots.'); } }),
      // AUDIT-TO1 I1: the mod ships index 1, "F" - and F is the key SOC5
      // spent on SocialInteract (inputActions.js DEFAULT_BINDINGS), the
      // same collision HT4 moved Handheld Torches' light toggle off.
      // One press did both: the friends card opened AND a road leg
      // began. Of the mod's own six: F is SOC5's, G is Handheld
      // Torches' light toggle (HT4), O its ignite and X its throw
      // (Throwing.ThrowTorchInput above) - so K, index 3, is the one
      // letter nothing in the port or a vendored mod answers. The
      // player may still pick F from the list; this is about what
      // SHIPS. `keyChoice` DECLARES the kind, the way `axis` does, so
      // the HT4 pin walks this choice list as it walks a TextKey and
      // never has to guess whether "U" is a key or a bob shape.
      'RoadsIntegration.FollowPathsKey': Object.freeze({ default: 3, keyChoice: true, options: lazyWords(() => localizedText('none', 'None'), 'F', 'G', 'K', 'O', 'X', () => t('mods.travelOptions.option.customKeyBind', 'Custom Key Bind')), get description() { return t('mods.travelOptions.RoadsIntegration.FollowPathsKey.description', 'The key that starts time-accelerated travel along roads and tracks when roads are shown.'); } }),   // KB1: not read by the mod any more - the key is the registry's action (inputActions.js MOD_ACTIONS); a player's saved value is carried there once (migrateKeyBinds)
      'RoadsIntegration.FollowPathsCustomKeyBind': Object.freeze({ default: "", text: true, get description() { return t('mods.travelOptions.RoadsIntegration.FollowPathsCustomKeyBind.description', 'Custom key bind for following paths when Custom Key Bind is selected above.'); } }),   // KB1: not read by the mod any more - the key is the registry's action (inputActions.js MOD_ACTIONS); a player's saved value is carried there once (migrateKeyBinds)
      'RoadsIntegration.EnableWaterways': Object.freeze({ default: false, get description() { return t('mods.travelOptions.RoadsIntegration.EnableWaterways.description', 'Shows rivers and streams on the travel map with a toggle button.'); } }),
      'RoadsIntegration.EnableStreamsToggle': Object.freeze({ default: false, get description() { return t('mods.travelOptions.RoadsIntegration.EnableStreamsToggle.description', 'Adds a streams toggle button separate from the rivers button.'); } }),
      'RoadsIntegration.MarkLocationColor': Object.freeze({ default: '#ffeb05ff', color: true, get description() { return t('mods.travelOptions.RoadsIntegration.MarkLocationColor.description', 'The color of a location you mark with the middle mouse button on the travel map'); } }),
      // the shipped file's spacer section "-" carries no keys
      'FastTravelCostScaling.FastTravelCostScaleFactor': Object.freeze({ default: 1, min: 1, max: 10, get description() { return t('mods.travelOptions.FastTravelCostScaling.FastTravelCostScaleFactor.description', 'Scales inn costs during standard fast travel (x4 to x6 recommended for Climate & Calories).'); } }),
      'FastTravelCostScaling.ShipTravelCostScaleFactor': Object.freeze({ default: 1, min: 1, max: 10, get description() { return t('mods.travelOptions.FastTravelCostScaling.ShipTravelCostScaleFactor.description', 'Scales ship travel costs during standard fast travel (x2 to x3 recommended for Climate & Calories).'); } }),
      // the shipped file's spacer section "_" carries no keys
      'RoadsJunctionMap.Enable': Object.freeze({ default: true, get description() { return t('mods.travelOptions.RoadsJunctionMap.Enable.description', "Enables the junction mini-map"); } }),
      'RoadsJunctionMap.PersistentMap': Object.freeze({ default: false, get description() { return t('mods.travelOptions.RoadsJunctionMap.PersistentMap.description', 'Keeps the junction mini-map visible while following paths.'); } }),
      'RoadsJunctionMap.ToggleMapOffPaths': Object.freeze({ default: true, get description() { return t('mods.travelOptions.RoadsJunctionMap.ToggleMapOffPaths.description', 'Toggles the junction mini-map when you press the follow key while off a path.'); } }),
      'RoadsJunctionMap.ScreenSize': Object.freeze({ default: 75, min: 40, max: 200, get description() { return t('mods.travelOptions.RoadsJunctionMap.ScreenSize.description', 'The width and height of the mini-map on the screen.'); } }),
      'RoadsJunctionMap.ScreenPositionX': Object.freeze({ default: 235, min: 0, max: 280, get description() { return t('mods.travelOptions.RoadsJunctionMap.ScreenPositionX.description', 'The X coordinate where the mini-map is drawn on the screen.'); } }),
      'RoadsJunctionMap.ScreenPositionY': Object.freeze({ default: 10, min: 0, max: 160, get description() { return t('mods.travelOptions.RoadsJunctionMap.ScreenPositionY.description', 'The Y coordinate where the mini-map is drawn on the screen.'); } }),
      'RoadsJunctionMap.FilterMode': Object.freeze({ default: 0, options: lazyWords(() => t('mods.travelOptions.option.point', 'Point'), () => t('mods.travelOptions.option.bilinear', 'Bilinear'), () => t('mods.travelOptions.option.trilinear', 'Trilinear')), get description() { return t('mods.travelOptions.RoadsJunctionMap.FilterMode.description', "Pixel filtering to use when rendering the mini-map"); } }),
      'RoadsJunctionMap.Circular': Object.freeze({ default: true, get description() { return t('mods.travelOptions.RoadsJunctionMap.Circular.description', "Draw the mini-map in a circle around the player"); } }),
      'RoadsJunctionMap.PlayerColor': Object.freeze({ default: '#ff0000ff', color: true, get description() { return t('mods.travelOptions.RoadsJunctionMap.PlayerColor.description', 'The color of your position and facing on the junction map'); } }),
      'RoadsJunctionMap.Opaque': Object.freeze({ default: false, get description() { return t('mods.travelOptions.RoadsJunctionMap.Opaque.description', "Render the mini-map with an opaque background color"); } }),
      'RoadsJunctionMap.BackgroundColor': Object.freeze({ default: '#327f19ff', color: true, get description() { return t('mods.travelOptions.RoadsJunctionMap.BackgroundColor.description', "The opaque background color to use for the mini-map"); } }),
      'LocationColours.DungeonLabyrinth': Object.freeze({ default: '#d77727ff', color: true, get description() { return t('mods.travelOptions.LocationColours.description', 'The color of locations on the travel map'); } }),
      'LocationColours.DungeonKeep': Object.freeze({ default: '#bf571bff', color: true, get description() { return t('mods.travelOptions.LocationColours.description', 'The color of locations on the travel map'); } }),
      'LocationColours.DungeonRuin': Object.freeze({ default: '#ab330fff', color: true, get description() { return t('mods.travelOptions.LocationColours.description', 'The color of locations on the travel map'); } }),
      'LocationColours.Graveyard': Object.freeze({ default: '#930f07ff', color: true, get description() { return t('mods.travelOptions.LocationColours.description', 'The color of locations on the travel map'); } }),
      'LocationColours.Coven': Object.freeze({ default: '#0f0f0fff', color: true, get description() { return t('mods.travelOptions.LocationColours.description', 'The color of locations on the travel map'); } }),
      'LocationColours.Farm': Object.freeze({ default: '#9b696aff', color: true, get description() { return t('mods.travelOptions.LocationColours.description', 'The color of locations on the travel map'); } }),
      'LocationColours.WealthyHome': Object.freeze({ default: '#bc8a8aff', color: true, get description() { return t('mods.travelOptions.LocationColours.description', 'The color of locations on the travel map'); } }),
      'LocationColours.PoorHome': Object.freeze({ default: '#7e5159ff', color: true, get description() { return t('mods.travelOptions.LocationColours.description', 'The color of locations on the travel map'); } }),
      'LocationColours.Temple': Object.freeze({ default: '#b0cdffff', color: true, get description() { return t('mods.travelOptions.LocationColours.description', 'The color of locations on the travel map'); } }),
      'LocationColours.Cult': Object.freeze({ default: '#447cc0ff', color: true, get description() { return t('mods.travelOptions.LocationColours.description', 'The color of locations on the travel map'); } }),
      'LocationColours.Tavern': Object.freeze({ default: '#8c5637ff', color: true, get description() { return t('mods.travelOptions.LocationColours.description', 'The color of locations on the travel map'); } }),
      'LocationColours.City': Object.freeze({ default: '#e3b490ff', color: true, get description() { return t('mods.travelOptions.LocationColours.description', 'The color of locations on the travel map'); } }),
      'LocationColours.Hamlet': Object.freeze({ default: '#c18564ff', color: true, get description() { return t('mods.travelOptions.LocationColours.description', 'The color of locations on the travel map'); } }),
      'LocationColours.Village': Object.freeze({ default: '#a56446ff', color: true, get description() { return t('mods.travelOptions.LocationColours.description', 'The color of locations on the travel map'); } }),
    }),
  }),
  'immersive-travel': Object.freeze({
    title: 'Immersive Travel',
    author: 'kkgobkk',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        description: 'Carriage drivers wait outside the gates of the walled cities. Talk to one and pay the fare to fast '
          + 'travel to a town or village. With Disable Normal Travel on, a carriage is the only fast travel there is.',
      }),
      'General.DisableNormalTravel': Object.freeze({ default: false, description: 'You can no longer travel from the map, and must use carriages and ships.' }),
      'General.DailyCarriageFee': Object.freeze({ default: 1, min: 0, max: 99, description: 'The fee you must pay to travel with a carriage for every day of travel' }),
      'General.ClearerMapDots': Object.freeze({ default: true, description: 'Draws larger dots depending on town size in the travel map.' }),
      'General.DrawRoads': Object.freeze({ default: true, description: 'Draws roads on the map when Basic Roads is on.' }),
      'General.DrawTracks': Object.freeze({ default: true, description: 'Draws dirt tracks on the map when Basic Roads is on.' }),
      'General.RegionLockedCarriages': Object.freeze({ default: false, description: 'Prevent carriages from travelling to a different region. You must travel from the capital city to leave the region.' }),
      'ShipTravel.DisableShipTravelOutsideDocks': Object.freeze({ default: true, description: 'Prevents you from choosing ship transport mode during land travel' }),
      'ShipTravel.DailyShipCost': Object.freeze({ default: 15, min: 0, max: 99, description: 'Daily cost of renting a ship, if you don’t own one.' }),
      'ShipTravel.DailyCaptainFee': Object.freeze({ default: 10, min: 0, max: 99, description: 'Daily cost of hiring a captain and crew. You pay a captain even if you own the ship.' }),
      'ShipTravel.LimitedRangeInSmallDocks': Object.freeze({ default: true, description: 'Ships in smaller locations will only take you to ports in the same region. To travel to a different region you\'ll need to sail from a city' }),
      'ShipTravel.ShowLargerDocks': Object.freeze({ default: true, description: 'Uses larger dots on the map for locations with a dock.' }),
      'ShipTravel.ShowOnlyDocks': Object.freeze({ default: false, description: 'Hides every location on the map except those that have a dock' }),
      'AllowedDestinations.Cities': Object.freeze({ default: true, description: '' }),
      'AllowedDestinations.Covens': Object.freeze({ default: false, description: '' }),
      'AllowedDestinations.Dungeons': Object.freeze({ default: false, description: '' }),
      'AllowedDestinations.Graveyards': Object.freeze({ default: false, description: '' }),
      'AllowedDestinations.Farms': Object.freeze({ default: false, description: '' }),
      'AllowedDestinations.Hamlets': Object.freeze({ default: true, description: '' }),
      'AllowedDestinations.Homes': Object.freeze({ default: false, description: '' }),
      'AllowedDestinations.Temples': Object.freeze({ default: false, description: '' }),
      'AllowedDestinations.Taverns': Object.freeze({ default: false, description: '' }),
      'AllowedDestinations.Villages': Object.freeze({ default: true, description: '' }),
    }),
  }),
  'physical-items': Object.freeze({
    title: 'Physical Items',
    author: 'demifiend000',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        description: 'A fallen foe’s gear lands around its body and you pick it up piece by piece. Shift-click an item in your pack, '
          + 'with no wagon or chest open, to drop it in front of you. Magic items and better are outlined.',
      }),
      'Enemy Loot.Physical Enemy Drops': Object.freeze({ default: true, description: 'Shows a fallen enemy’s loot on the ground around it, for the kinds of item turned on below. What the body holds stays the same.' }),
      'Enemy Loot.Impulse Strength': Object.freeze({ default: 200, min: 0, max: 400, description: 'How hard a fallen enemy’s loot is thrown out, in percent. 400 is twice the default, and at 0 the items just fall. Your own throws are not affected.' }),
      'Enemy Categories.Weapons': Object.freeze({ default: true, description: 'Show weapons on the ground when an enemy falls.' }),
      'Enemy Categories.Arrows': Object.freeze({ default: true, description: 'Show arrows on the ground when an enemy falls.' }),
      'Enemy Categories.Armor': Object.freeze({ default: true, description: 'Show armor on the ground when an enemy falls.' }),
      'Enemy Categories.Clothing': Object.freeze({ default: true, description: 'Show clothing on the ground when an enemy falls.' }),
      'Enemy Categories.Ingredients': Object.freeze({ default: true, description: 'Show ingredients on the ground when an enemy falls.' }),
      'Enemy Categories.Gold': Object.freeze({ default: true, description: 'Show gold on the ground when an enemy falls.' }),
      'Enemy Categories.Potions': Object.freeze({ default: true, description: 'Show potions on the ground when an enemy falls.' }),
      'Enemy Categories.Books': Object.freeze({ default: true, description: 'Show books on the ground when an enemy falls.' }),
      'Enemy Categories.Gems': Object.freeze({ default: true, description: 'Show gems on the ground when an enemy falls.' }),
      'Enemy Categories.Jewellery': Object.freeze({ default: true, description: 'Show jewelry on the ground when an enemy falls.' }),
      'Enemy Categories.Maps': Object.freeze({ default: true, description: 'Show maps on the ground when an enemy falls.' }),
      'Enemy Categories.Magic Items': Object.freeze({ default: true, description: 'Show magic items on the ground when an enemy falls.' }),
      'Enemy Categories.Religious Items': Object.freeze({ default: true, description: 'Show religious items on the ground when an enemy falls.' }),
      'Enemy Categories.Quest Items': Object.freeze({ default: true, description: 'Show quest items on the ground when an enemy falls.' }),
      'Enemy Categories.Transportation': Object.freeze({ default: true, description: 'Show transportation on the ground when an enemy falls.' }),
      'Enemy Categories.Other Items': Object.freeze({ default: true, description: 'Show everything not listed above on the ground when an enemy falls.' }),
      'Item Sizes.Weapons': Object.freeze({ default: 0.8, min: 0.1, max: 1.5, float: true, step: 0.01, description: 'Size of weapons on the ground.' }),
      'Item Sizes.Arrows': Object.freeze({ default: 0.32, min: 0.1, max: 1.5, float: true, step: 0.01, description: 'Size of arrows on the ground.' }),
      'Item Sizes.Armor': Object.freeze({ default: 0.65, min: 0.1, max: 1.5, float: true, step: 0.01, description: 'Size of armor on the ground.' }),
      'Item Sizes.Clothing': Object.freeze({ default: 0.52, min: 0.1, max: 1.5, float: true, step: 0.01, description: 'Size of clothing on the ground.' }),
      'Item Sizes.Ingredients': Object.freeze({ default: 0.4, min: 0.1, max: 1.5, float: true, step: 0.01, description: 'Size of ingredients on the ground.' }),
      'Item Sizes.Gold': Object.freeze({ default: 0.4, min: 0.1, max: 1.5, float: true, step: 0.01, description: 'Size of gold on the ground.' }),
      'Item Sizes.Potions': Object.freeze({ default: 0.4, min: 0.1, max: 1.5, float: true, step: 0.01, description: 'Size of potions on the ground.' }),
      'Item Sizes.Books': Object.freeze({ default: 0.4, min: 0.1, max: 1.5, float: true, step: 0.01, description: 'Size of books on the ground.' }),
      'Item Sizes.Gems': Object.freeze({ default: 0.4, min: 0.1, max: 1.5, float: true, step: 0.01, description: 'Size of gems on the ground.' }),
      'Item Sizes.Jewellery': Object.freeze({ default: 0.4, min: 0.1, max: 1.5, float: true, step: 0.01, description: 'Size of jewelry on the ground.' }),
      'Item Sizes.Maps': Object.freeze({ default: 0.4, min: 0.1, max: 1.5, float: true, step: 0.01, description: 'Size of maps on the ground.' }),
      'Item Sizes.Magic Items': Object.freeze({ default: 0.4, min: 0.1, max: 1.5, float: true, step: 0.01, description: 'Size of magic items on the ground.' }),
      'Item Sizes.Religious Items': Object.freeze({ default: 0.4, min: 0.1, max: 1.5, float: true, step: 0.01, description: 'Size of religious items on the ground.' }),
      'Item Sizes.Quest Items': Object.freeze({ default: 0.4, min: 0.1, max: 1.5, float: true, step: 0.01, description: 'Size of quest items on the ground.' }),
      'Item Sizes.Transportation': Object.freeze({ default: 0.4, min: 0.1, max: 1.5, float: true, step: 0.01, description: 'Size of transportation on the ground.' }),
      'Item Sizes.Other Items': Object.freeze({ default: 0.4, min: 0.1, max: 1.5, float: true, step: 0.01, description: 'Size of other items on the ground.' }),
      'Weapon Sizes.Dagger': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of a dagger on the ground. 0 uses the Weapons size.' }),
      'Weapon Sizes.Tanto': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of a tanto on the ground. 0 uses the Weapons size.' }),
      'Weapon Sizes.Staff': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of a staff on the ground. 0 uses the Weapons size.' }),
      'Weapon Sizes.Shortsword': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of a shortsword on the ground. 0 uses the Weapons size.' }),
      'Weapon Sizes.Wakazashi': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of a wakazashi on the ground. 0 uses the Weapons size.' }),
      'Weapon Sizes.Broadsword': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of a broadsword on the ground. 0 uses the Weapons size.' }),
      'Weapon Sizes.Saber': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of a saber on the ground. 0 uses the Weapons size.' }),
      'Weapon Sizes.Longsword': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of a longsword on the ground. 0 uses the Weapons size.' }),
      'Weapon Sizes.Katana': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of a katana on the ground. 0 uses the Weapons size.' }),
      'Weapon Sizes.Claymore': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of a claymore on the ground. 0 uses the Weapons size.' }),
      'Weapon Sizes.Dai Katana': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of a dai katana on the ground. 0 uses the Weapons size.' }),
      'Weapon Sizes.Mace': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of a mace on the ground. 0 uses the Weapons size.' }),
      'Weapon Sizes.Flail': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of a flail on the ground. 0 uses the Weapons size.' }),
      'Weapon Sizes.Warhammer': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of a warhammer on the ground. 0 uses the Weapons size.' }),
      'Weapon Sizes.Battle Axe': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of a battle axe on the ground. 0 uses the Weapons size.' }),
      'Weapon Sizes.War Axe': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of a war axe on the ground. 0 uses the Weapons size.' }),
      'Weapon Sizes.Short Bow': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of a short bow on the ground. 0 uses the Weapons size.' }),
      'Weapon Sizes.Long Bow': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of a long bow on the ground. 0 uses the Weapons size.' }),
      'Weapon Sizes.Arrow': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of an arrow on the ground. 0 uses the Weapons size.' }),
      'Armor Sizes.Cuirass': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of a cuirass on the ground. 0 uses the Armor size.' }),
      'Armor Sizes.Gauntlets': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of gauntlets on the ground. 0 uses the Armor size.' }),
      'Armor Sizes.Greaves': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of greaves on the ground. 0 uses the Armor size.' }),
      'Armor Sizes.Pauldrons': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of pauldrons, left and right, on the ground. 0 uses the Armor size.' }),
      'Armor Sizes.Helm': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of a helm on the ground. 0 uses the Armor size.' }),
      'Armor Sizes.Boots': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of boots on the ground. 0 uses the Armor size.' }),
      'Armor Sizes.Buckler': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of a buckler on the ground. 0 uses the Armor size.' }),
      'Armor Sizes.Round Shield': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of a round shield on the ground. 0 uses the Armor size.' }),
      'Armor Sizes.Kite Shield': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of a kite shield on the ground. 0 uses the Armor size.' }),
      'Armor Sizes.Tower Shield': Object.freeze({ default: 0.0, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'Size of a tower shield on the ground. 0 uses the Armor size.' }),
    }),
  }),
  'heat-haze': Object.freeze({
    title: 'Heat Haze',
    author: 'demifiend000',
    keys: Object.freeze({
      Enabled: Object.freeze({ default: true, description: 'Heat shimmer over the distant desert by day in the enhanced outdoors, strongest under a clear sky, fading in after sunrise and out before sunset.' }),
      'Heat Haze.AllowSubtropical': Object.freeze({ default: false, description: 'Also allow heat haze in subtropical climates during sunny or cloudy daytime weather.' }),
      'Heat Haze.Intensity': Object.freeze({ default: 1.5, min: 0.0, max: 3.0, float: true, step: 0.05, description: 'How strongly the haze bends the view, in pixels.' }),
      'Heat Haze.FullStrengthDistance': Object.freeze({ default: 400.4, min: 50.0, max: 3000.0, float: true, step: 0.1, description: 'Distance from you, in meters, of the ring of haze.' }),
      'Heat Haze.RingHeight': Object.freeze({ default: 1006.0, min: 50.0, max: 1500.0, float: true, step: 2, description: 'Height of the haze, in meters.' }),
      'Heat Haze.NoiseScale': Object.freeze({ default: 4.5, min: 0.25, max: 6.0, float: true, step: 0.05, description: 'How fine the shimmer’s ripples are.' }),
      'Heat Haze.AnimationSpeed': Object.freeze({ default: 4.0, min: 0.0, max: 4.0, float: true, step: 0.1, description: 'Speed of the rising-air motion.' }),
    }),
  }),
  'windfall': Object.freeze({
    title: 'Windfall',
    author: 'demifiend000',
    keys: Object.freeze({
      Enabled: Object.freeze({ default: true, description: 'Wind in the enhanced outdoors that changes by the day. Trees and plants sway, some days turn windy or stormy, gusts come with their own sound, and leaves and snow blow off the trees.' }),
      'General.WindDirectionDegrees': Object.freeze({ default: 35.0, min: 0.0, max: 360.0, float: true, step: 5, description: 'Has no effect here. The enhanced outdoors set the wind’s direction.' }),
      'General.OverallWindyPeriodFrequency': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'How often windy spells come overall. 100% is the mod’s normal rate.' }),
      'General.NaturalWindstormFrequency': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'How often a windy spell turns into a windstorm of 1 to 3 hours. At 100%, 8% of them do.' }),
      'General.GustFrequency': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'How often breezes and gusts come. 0% turns them off, and 200% makes them twice as often.' }),
      'General.GustStrength': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'How strong gusts are, in motion, leaves and sound. At 0% the steady wind still blows.' }),
      'Normal.Strength': Object.freeze({ default: 0.2, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'How much plants move on a normal day.' }),
      'Normal.SwayAmountPercent': Object.freeze({ default: 1.4, min: 0.0, max: 8.0, float: true, step: 0.1, description: 'How far treetops sway, as a percentage of the tree’s height.' }),
      'Normal.SwaySpeed': Object.freeze({ default: 0.2, min: 0.05, max: 1.5, float: true, step: 0.01, description: 'How fast trees sway, in sways per second.' }),
      'Normal.ShiverAmountPercent': Object.freeze({ default: 0.6, min: 0.0, max: 3.0, float: true, step: 0.05, description: 'How much treetops shiver, as a percentage of the tree’s height.' }),
      'Normal.ShiverSpeed': Object.freeze({ default: 0.6, min: 0.5, max: 8.0, float: true, step: 0.1, description: 'How fast treetops shiver, in shivers per second.' }),
      'Season Frequency.SpringFrequency': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'How often windy spells come in spring.' }),
      'Season Frequency.SummerFrequency': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'How often windy spells come in summer.' }),
      'Season Frequency.FallFrequency': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'How often windy spells come in autumn.' }),
      'Season Frequency.WinterFrequency': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'How often windy spells come in winter.' }),
      'Regional Frequency.OceanFrequency': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'How often windy spells come by the sea.' }),
      'Regional Frequency.DesertFrequency': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'How often windy spells come in the deserts.' }),
      'Regional Frequency.MountainFrequency': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'How often windy spells come in the mountains.' }),
      'Regional Frequency.RainforestFrequency': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'How often windy spells come in rainforests.' }),
      'Regional Frequency.SwampFrequency': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'How often windy spells come in swamps.' }),
      'Regional Frequency.SubtropicalFrequency': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'How often windy spells come in subtropical lands.' }),
      'Regional Frequency.MountainWoodsFrequency': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'How often windy spells come in mountain woods.' }),
      'Regional Frequency.WoodlandsFrequency': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'How often windy spells come in woodlands.' }),
      'Regional Frequency.HauntedWoodlandsFrequency': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'How often windy spells come in haunted woodlands.' }),
      'Regional Frequency.UnknownFrequency': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'How often windy spells come in any other climate.' }),
      'Weather Frequency.SunnyFrequency': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'How often windy spells come in sunny weather.' }),
      'Weather Frequency.CloudyFrequency': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'How often windy spells come in cloudy weather.' }),
      'Weather Frequency.OvercastFrequency': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'How often windy spells come in overcast weather.' }),
      'Weather Frequency.FogFrequency': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'How often windy spells come in fog.' }),
      'Weather Frequency.RainFrequency': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'How often windy spells come in rain. Wind in rain is also 15% stronger.' }),
      'Weather Frequency.SnowFrequency': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'How often windy spells come in snow. Wind in snow is also 10% stronger.' }),
      'Windy Day.Strength': Object.freeze({ default: 0.2, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'How much plants move on a windy day.' }),
      'Windy Day.SwayAmountPercent': Object.freeze({ default: 2.6, min: 0.0, max: 8.0, float: true, step: 0.1, description: 'How far treetops sway, as a percentage of the tree’s height.' }),
      'Windy Day.SwaySpeed': Object.freeze({ default: 0.6, min: 0.05, max: 1.5, float: true, step: 0.01, description: 'How fast trees sway, in sways per second.' }),
      'Windy Day.ShiverAmountPercent': Object.freeze({ default: 1.2, min: 0.0, max: 3.0, float: true, step: 0.05, description: 'How much treetops shiver, as a percentage of the tree’s height.' }),
      'Windy Day.ShiverSpeed': Object.freeze({ default: 1.1, min: 0.5, max: 8.0, float: true, step: 0.1, description: 'How fast treetops shiver, in shivers per second.' }),
      'Gust.Strength': Object.freeze({ default: 0.6, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'How much plants move at the height of a gust.' }),
      'Gust.SwayAmountPercent': Object.freeze({ default: 2.6, min: 0.0, max: 8.0, float: true, step: 0.1, description: 'How far treetops sway, as a percentage of the tree’s height.' }),
      'Gust.SwaySpeed': Object.freeze({ default: 0.8, min: 0.05, max: 1.5, float: true, step: 0.01, description: 'How fast trees sway, in sways per second.' }),
      'Gust.ShiverAmountPercent': Object.freeze({ default: 1.2, min: 0.0, max: 3.0, float: true, step: 0.05, description: 'How much treetops shiver, as a percentage of the tree’s height.' }),
      'Gust.ShiverSpeed': Object.freeze({ default: 1.7, min: 0.5, max: 8.0, float: true, step: 0.1, description: 'How fast treetops shiver, in shivers per second.' }),
      'Storm.Strength': Object.freeze({ default: 0.6, min: 0.0, max: 1.5, float: true, step: 0.01, description: 'How much plants move in a storm.' }),
      'Storm.SwayAmountPercent': Object.freeze({ default: 2.6, min: 0.0, max: 8.0, float: true, step: 0.1, description: 'How far treetops sway, as a percentage of the tree’s height.' }),
      'Storm.SwaySpeed': Object.freeze({ default: 0.8, min: 0.05, max: 1.5, float: true, step: 0.01, description: 'How fast trees sway, in sways per second.' }),
      'Storm.ShiverAmountPercent': Object.freeze({ default: 1.2, min: 0.0, max: 3.0, float: true, step: 0.05, description: 'How much treetops shiver, as a percentage of the tree’s height.' }),
      'Storm.ShiverSpeed': Object.freeze({ default: 1.7, min: 0.5, max: 8.0, float: true, step: 0.1, description: 'How fast treetops shiver, in shivers per second.' }),
      'Presentation.AudioEnabled': Object.freeze({ default: true, description: 'Plays the sounds of passing wind, gusts and rustling trees.' }),
      'Presentation.AudioVolume': Object.freeze({ default: 0.5, min: 0.0, max: 1.0, float: true, step: 0.01, description: 'Overall volume of the wind and rustling leaves.' }),
      'Presentation.RegularWindVolume': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'Volume of the steady breeze and of windy and stormy weather.' }),
      'Presentation.GustVolume': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'Volume of short gusts.' }),
      'Presentation.FoliageRuffleVolume': Object.freeze({ default: 100.0, min: 0.0, max: 200.0, float: true, step: 5, description: 'Volume of rustling leaves.' }),
      'Presentation.LeavesEnabled': Object.freeze({ default: true, description: 'Leaves blow about where the climate and season have them.' }),
      'Presentation.LeafAmount': Object.freeze({ default: 2.4, min: 0.0, max: 3.0, float: true, step: 0.05, description: 'How many leaves a gust blows off.' }),
      'Presentation.AmbientLeafAmount': Object.freeze({ default: 1.0, min: 0.0, max: 3.0, float: true, step: 0.05, description: 'How many leaves fall near trees. More fall on windy days and in storms.' }),
      'Presentation.SnowFlurriesEnabled': Object.freeze({ default: true, description: 'Snow drifts and blows off snow-covered trees in winter.' }),
      'Presentation.SnowFlurryAmount': Object.freeze({ default: 1.0, min: 0.0, max: 3.0, float: true, step: 0.05, description: 'How much snow blows off the trees.' }),
    }),
  }),
  'snowfall': Object.freeze({
    title: 'Snowfall',
    author: 'demifiend000',
    keys: Object.freeze({
      Enabled: Object.freeze({ default: true, description: 'Deep snow on the ground in winter in the enhanced outdoors, thicker in the wild than in towns. It builds while snow falls, melts in clear weather and shows the tracks of everyone who walks through it.' }),
      'General.ActivationOverride': Object.freeze({ default: 0, options: Object.freeze(['Auto', 'Force On', 'Force Off']), description: 'When the deep snow appears: Auto in winter outside the deserts, Force On always, Force Off never.' }),
      'Surface.SnowRadius': Object.freeze({ default: 32.0, min: 16.0, max: 64.0, float: true, step: 1, description: 'How far around you, in meters, the detailed snow reaches. Larger is less detailed.' }),
      'Surface.MeshResolution': Object.freeze({ default: 2, options: Object.freeze(['97', '129', '161']), description: 'Detail of the snow around you. Higher looks smoother and costs more.' }),
      'Surface.MaskResolution': Object.freeze({ default: 1, options: Object.freeze(['128', '256', '512']), description: 'Detail of the tracks in the snow. Changing it keeps the tracks already made.' }),
      'Surface.RecenterDistance': Object.freeze({ default: 6.0, min: 2.0, max: 12.0, float: true, step: 0.25, description: 'How far you move, in meters, before the detailed snow recenters on you.' }),
      'Surface.MaxSnowSlope': Object.freeze({ default: 55.0, min: 30.0, max: 75.0, float: true, step: 1, description: 'Slopes this steep, in degrees, get only a thin coat of snow.' }),
      'Snowpack.SettlementMinimumDepth': Object.freeze({ default: 0.2, min: 0.1, max: 1.0, float: true, step: 0.01, description: 'Starting and least snow depth, in meters, in towns and at farms, homes, dungeons, temples, taverns and graveyards.' }),
      'Snowpack.SettlementMaximumDepth': Object.freeze({ default: 0.4, min: 0.1, max: 1.0, float: true, step: 0.01, description: 'Most snow depth, in meters, in towns and other places on the map.' }),
      'Snowpack.WildernessMinimumDepth': Object.freeze({ default: 0.4, min: 0.1, max: 1.0, float: true, step: 0.01, description: 'Starting and least snow depth in the wilderness, in meters.' }),
      'Snowpack.WildernessMaximumDepth': Object.freeze({ default: 0.8, min: 0.1, max: 1.0, float: true, step: 0.01, description: 'Most snow depth in the wilderness, in meters.' }),
      'Snowpack.SnowfallDepthStep': Object.freeze({ default: 0.1, min: 0.01, max: 0.2, float: true, step: 0.001, description: 'Meters of snow added after each spell of steady snowfall.' }),
      'Snowpack.SnowfallDepthHours': Object.freeze({ default: 3.0, min: 0.25, max: 24.0, float: true, step: 0.25, description: 'Hours of steady snowfall before the snow gets deeper.' }),
      'Snowpack.MeltDepthStep': Object.freeze({ default: 0.1, min: 0.01, max: 0.2, float: true, step: 0.001, description: 'Meters of snow that melt after each spell of clear weather.' }),
      'Snowpack.MeltDepthHours': Object.freeze({ default: 72.0, min: 1.0, max: 240.0, float: true, step: 1, description: 'Hours without snow before some of it melts.' }),
      'Snowpack.DebugSnowDepthOverride': Object.freeze({ default: 0.0, min: 0.0, max: 0.8, float: true, step: 0.01, description: 'For testing: above 0, sets one snow depth everywhere. Leave it at 0.' }),
      'Context.SettlementBoundaryFeather': Object.freeze({ default: 8.0, min: 0.0, max: 32.0, float: true, step: 0.5, description: 'How many meters the snow takes to deepen past the edge of a town.' }),
      'Context.LocationLoaderIntegration': Object.freeze({ default: true, description: 'Has no effect here: this game doesn’t use Location Loader.' }),
      'Context.LocationLoaderMaximumDepth': Object.freeze({ default: 0.1, min: 0.1, max: 1.0, float: true, step: 0.01, description: 'Has no effect here: this game doesn’t use Location Loader.' }),
      'Context.LocationLoaderBoundaryFeather': Object.freeze({ default: 4.0, min: 0.0, max: 32.0, float: true, step: 0.5, description: 'Has no effect here: this game doesn’t use Location Loader.' }),
      'Basic Roads.Enabled': Object.freeze({ default: true, description: 'Keeps snow shallow on roads and tracks, with snow banks beside them.' }),
      'Basic Roads.PathMaximumDepth': Object.freeze({ default: 0.1, min: 0.1, max: 1.0, float: true, step: 0.01, description: 'Most snow depth on roads and tracks, in meters.' }),
      'Basic Roads.PathFeather': Object.freeze({ default: 1.0, min: 0.0, max: 4.0, float: true, step: 0.1, description: 'How many meters the snow takes to deepen beside a road.' }),
      'Basic Roads.BermsEnabled': Object.freeze({ default: true, description: 'Banks of snow along the main roads.' }),
      'Basic Roads.BermRise': Object.freeze({ default: 0.05, min: 0.0, max: 0.1, float: true, step: 0.001, description: 'Height of the snow banks, in meters.' }),
      'Basic Roads.BermWidth': Object.freeze({ default: 2.0, min: 0.0, max: 4.0, float: true, step: 0.1, description: 'Width of the snow banks, in meters.' }),
      'Visual.TextureWorldSize': Object.freeze({ default: 4.0, min: 1.0, max: 12.0, float: true, step: 0.25, description: 'Size of the snow pattern, in meters.' }),
      'Visual.CompressionDarkening': Object.freeze({ default: 0.18, min: 0.0, max: 0.5, float: true, step: 0.01, description: 'How much darker packed snow looks.' }),
      'Visual.ImpressionStrength': Object.freeze({ default: 1.0, min: 0.0, max: 1.0, float: true, step: 0.01, description: 'How deep and narrow the middle of a track is.' }),
      'Visual.ImpressionShoulderWidth': Object.freeze({ default: 0.5, min: 0.0, max: 1.0, float: true, step: 0.01, description: 'Width, in meters, of the sloped edge on each side of a track.' }),
      'Distance Prototype.Enabled': Object.freeze({ default: true, description: 'Covers the land beyond your surroundings in snow too. Off, the deep snow is only near you.' }),
      'Distance Prototype.DistantTracks': Object.freeze({ default: true, description: 'Shows tracks as dark marks in the distant snow, out to 320 meters.' }),
      'Player.TrackWidth': Object.freeze({ default: 0.7, min: 0.3, max: 1.4, float: true, step: 0.01, description: 'Width of your tracks, in meters.' }),
      'Player.RemainingSnow': Object.freeze({ default: 0.18, min: 0.05, max: 0.8, float: true, step: 0.01, description: 'How much snow is left in the middle of your tracks, as a fraction.' }),
      'Player.StampSpacing': Object.freeze({ default: 0.25, min: 0.1, max: 0.8, float: true, step: 0.01, description: 'How far you move, in meters, between footprints.' }),
      'NPC Tracks.Enabled': Object.freeze({ default: true, description: 'Enemies and townsfolk leave tracks too. Off keeps the tracks already made.' }),
      'NPC Tracks.TrackWidth': Object.freeze({ default: 0.55, min: 0.3, max: 1.4, float: true, step: 0.01, description: 'Least width of their tracks, in meters.' }),
      'NPC Tracks.RemainingSnow': Object.freeze({ default: 0.28, min: 0.05, max: 0.8, float: true, step: 0.01, description: 'How much snow is left in the middle of their tracks, as a fraction.' }),
      'NPC Tracks.StampSpacing': Object.freeze({ default: 0.5, min: 0.2, max: 1.5, float: true, step: 0.01, description: 'How far they move, in meters, between footprints.' }),
      'Refill.PassiveRefillHours': Object.freeze({ default: 12.0, min: 0.0, max: 48.0, float: true, step: 1, description: 'About how many hours tracks take to fill in. 0 fills them at once.' }),
      'Refill.SnowfallRefillHours': Object.freeze({ default: 1.5, min: 0.1, max: 12.0, float: true, step: 0.1, description: 'About how many hours tracks take to fill in while snow falls.' }),
    }),
  }),
  'horse-cart-and-cargo': Object.freeze({
    title: 'Horse Cart and Cargo',
    author: 'demifiend000',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.horseCartAndCargo.Enabled.description', 'Your horse and cart remain in the world where you dismount, and can follow or wait on command. Walk up to mount or hitch them, and other players online see them where you left them.');
        },
      }),
      'Persistence.PhysicalPersistence': Object.freeze({ default: true, get description() { return t('mods.horseCartAndCargo.Persistence.PhysicalPersistence.description', 'Your horse and wagon stay where you leave them. When disabled, they stay with you at all times, as in the classic game.'); } }),
      'Presentation.ShowTrailingWagon': Object.freeze({ default: true, get description() { return t('mods.horseCartAndCargo.Presentation.ShowTrailingWagon.description', 'Shows the wagon trailing behind you when riding with your cart. When disabled, only the trailing wagon is hidden.'); } }),
      'Following.HorseFollowDistance': Object.freeze({ default: 3, min: 2, max: 8, get description() { return t('mods.horseCartAndCargo.Following.HorseFollowDistance.description', 'How closely a following horse, or horse and wagon, stays behind you.'); } }),
      'Following.AvoidCombat': Object.freeze({ default: true, get description() { return t('mods.horseCartAndCargo.Following.AvoidCombat.description', 'A following horse, or horse and wagon, keeps away from enemies in a fight.'); } }),
      'Following.FollowFastTravel': Object.freeze({ default: true, get description() { return t('mods.horseCartAndCargo.Following.FollowFastTravel.description', 'A following horse or wagon travels with you when you fast travel. When disabled, it stays where you left it.'); } }),
      'WagonAccess.InteriorAccessDistance': Object.freeze({ default: 50, min: 10, max: 100, get description() { return t('mods.horseCartAndCargo.WagonAccess.InteriorAccessDistance.description', 'How close to a building or dungeon entrance your wagon must be for you to use it from inside.'); } }),
      'Hotkeys.QuickMountDismount': Object.freeze({ default: 'Alpha5', text: true, get description() { return t('mods.horseCartAndCargo.Hotkeys.QuickMountDismount.description', 'Mounts your last horse or wagon when in reach, or dismounts while riding. Click and press a key to rebind.'); } }),   // KB1: not read by the mod any more - the key is the registry's action (inputActions.js MOD_ACTIONS); a player's saved value is carried there once (migrateKeyBinds)
      'Hotkeys.SummonTransport': Object.freeze({ default: 'Alpha6', text: true, get description() { return t('mods.horseCartAndCargo.Hotkeys.SummonTransport.description', 'Calls your horse and wagon to you while outdoors. Click and press a key to rebind.'); } }),   // KB1: not read by the mod any more - the key is the registry's action (inputActions.js MOD_ACTIONS); a player's saved value is carried there once (migrateKeyBinds)
    }),
  }),
  'project-legacy': Object.freeze({
    title: 'Project Legacy',
    author: 'Lattymoy, Gh\u00f0\u00a7\u2020 and Positronico',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        description: 'A family, a family tree and an heir to carry on your line. In a Bloodline house each death is final; '
          + 'in an Enduring one it costs years.',
      }),
      'Family.Descendants': Object.freeze({ default: 0, options: Object.freeze(['Random Descendants', 'Always have descendants']), description: 'Whether you always have descendants, or only sometimes.' }),
      'Family.Max Siblings': Object.freeze({ default: 2, min: 0, max: 10, description: 'Most siblings you can have.' }),
      'Family.Siblings Probability': Object.freeze({ default: 50, min: 0, max: 100, description: 'Chance, in percent, that you have siblings.' }),
      'Legacy.Model': Object.freeze({ default: 0, options: Object.freeze(['Enduring', 'Bloodline']), description: 'The kind of family a character made before this mod gets. Enduring: a death costs years. Bloodline: a death is final.' }),
      'Legacy.Toll': Object.freeze({ default: 1, options: Object.freeze(['Light', 'Standard', 'Heavy']), description: 'How many years a death takes in an Enduring family (Arkay\u2019s toll): 4%, 6% or 10% of a lifespan.' }),
      'Legacy.Heirloom Chance': Object.freeze({ default: 50, min: 0, max: 100, description: 'The chance a Bloodline death leaves an heirloom for the heir to recover.' }),
      'Legacy.Family In World': Object.freeze({ default: true, description: 'Family members you aren’t playing go about their day at the family home, or in your town if the family has no house. Talk to one to play as them.' }),
    }),
  }),
  'daggerfall-enemy-expansion': Object.freeze({
    get title() { return t('mods.daggerfallEnemyExpansion.title', 'Daggerfall Enemy Expansion'); },
    author: 'Kamer & Kab',
    keys: Object.freeze({
      Enabled: Object.freeze({
        default: true,
        get description() {
          return t('mods.daggerfallEnemyExpansion.Enabled.description', 'Fifty new enemies, from goblins, trolls, minotaurs, and golems to mounted knights, necromancers, and witches, in new encounter tables for every dungeon and climate.');
        },
      }),
      'Cheat.DisableTrollRespawn': Object.freeze({
        default: false,
        get description() { return t('mods.daggerfallEnemyExpansion.DisableTrollRespawn.description', 'Prevent trolls from respawning after death (use for No Magic runs)'); },
      }),
    }),
  }),
});

const editorModSettings = (mod) => Object.freeze({
  title: mod.title,
  author: mod.author,
  editorMod: true,
  keys: Object.freeze({
    Enabled: Object.freeze({
      default: true,
      get description() {
        return mod.description || t('mods.editorDungeons.Enabled.description', 'Dungeons built with the Bunnyfall Dungeon Editor.');
      },
    }),
  }),
});

export const MOD_SETTINGS = Object.freeze({
  ...DECLARED_MOD_SETTINGS,
  ...Object.fromEntries(EDITOR_MODS.filter((mod) => !Object.hasOwn(DECLARED_MOD_SETTINGS, mod.vendor))
    .map((mod) => [mod.vendor, editorModSettings(mod)])),
});

let memory = null;

const HT_LIGHT_KEY = Object.freeze({ vendor: 'handheld-torches', key: 'Handling.ToggleLightInput', was: 'F' });
export const KEY_MIGRATIONS = Object.freeze([
  HT_LIGHT_KEY,
  Object.freeze({ vendor: 'horse-cart-and-cargo', key: 'Hotkeys.QuickMountDismount', was: 'F7' }),
  Object.freeze({ vendor: 'horse-cart-and-cargo', key: 'Hotkeys.SummonTransport', was: 'F10' }),
]);
export const SWITCH_RESETS = Object.freeze([
  Object.freeze({ vendor: 'diverse-weapons', key: 'WeaponWidgetPreset', stamp: 'WeaponWidgetPreset@DISC20' }),
  Object.freeze({ vendor: 'pcaao', key: 'equipmentDamageEnhanced', stamp: 'equipmentDamageEnhanced@WEAR-VANILLA' }),
  Object.freeze({ vendor: 'pcaao', key: 'fadingEnchantedItems', stamp: 'fadingEnchantedItems@WEAR-VANILLA' }),
  Object.freeze({ vendor: 'roleplay-realism', key: 'equipDamage', stamp: 'equipDamage@WEAR-VANILLA' }),
  Object.freeze({ vendor: 'project-legacy', key: 'Enabled', stamp: 'Enabled@BUNNYFALL-HEIR' }),
]);
export const RETIRED_KEYS = Object.freeze([
  Object.freeze({ vendor: 'roleplay-realism', key: 'fightersTeachHandToHand' }),
]);
function migrate(m) {
  let changed = false;
  const legacy = m?.['project-legacy'];
  if (legacy && typeof legacy === 'object') {
    for (const k of Object.keys(legacy)) {
      const def = declaredKey('project-legacy', k);
      if (def && typeof def.default === 'boolean' && typeof legacy[k] !== 'boolean') { delete legacy[k]; changed = true; }
    }
  }
  for (const { vendor, key } of RETIRED_KEYS) {
    const held = m?.[vendor];
    if (!held || !Object.hasOwn(held, key)) continue;
    delete held[key];
    changed = true;
  }
  for (const { vendor, key, was } of KEY_MIGRATIONS) {
    const held = m?.[vendor];
    if (!held || held[key] !== was) continue;
    delete held[key];
    changed = true;
  }
  for (const { vendor, key, stamp } of SWITCH_RESETS) {
    const held = m?.[vendor];
    if (!held || !Object.hasOwn(held, key) || held[stamp] === true) continue;
    delete held[key];
    changed = true;
  }
  return changed;
}

function load() {
  if (memory) return memory;
  memory = {};
  try {
    const raw = appStorage()?.getItem(STORE_KEY);
    if (raw) memory = JSON.parse(raw) ?? {};
  } catch { memory = {}; }
  if (migrate(memory)) save();
  return memory;
}
function save() {
  try { appStorage()?.setItem(STORE_KEY, JSON.stringify(memory ?? {})); } catch { }
}

export function isIntKey(def) { return def && typeof def.min === 'number' && typeof def.max === 'number' && !def.float; }
export function isFloatKey(def) { return def && def.float === true && typeof def.min === 'number' && typeof def.max === 'number'; }
export function isChoiceKey(def) { return def && Array.isArray(def.options); }
export function isTextKey(def) { return def && def.text === true; }
export function isTupleKey(def) { return def && (def.tuple === 'int' || def.tuple === 'float'); }
export function isColorKey(def) { return def && def.color === true; }

export function colorKeyRgba(value) {
  if (Array.isArray(value) && value.length === 4 && value.every((n) => Number.isFinite(n))) {
    return value.map((n) => Math.max(0, Math.min(255, Math.trunc(n))));
  }
  if (typeof value !== 'string') return null;
  let s = value.trim();
  if (s.startsWith('#')) s = s.slice(1);
  if (!/^[0-9a-fA-F]+$/.test(s)) return null;
  if (s.length === 3) s = s.split('').map((c) => c + c).join('') + 'ff';
  else if (s.length === 4) s = s.split('').map((c) => c + c).join('');
  else if (s.length === 6) s += 'ff';
  else if (s.length !== 8) return null;
  return [0, 2, 4, 6].map((i) => parseInt(s.slice(i, i + 2), 16));
}

export function colorKeyHex(rgba) {
  const c = colorKeyRgba(rgba);
  if (!c) return null;
  return '#' + c.map((n) => n.toString(16).padStart(2, '0')).join('');
}

function coerce(def, v) {
  if (isColorKey(def)) {
    const hex = colorKeyHex(v);
    return hex ?? def.default;
  }
  if (isTextKey(def)) {
    const t = typeof v === 'string' ? v.trim() : '';
    return t.length ? t : def.default;
  }
  if (isTupleKey(def)) {
    if (!Array.isArray(v) || v.length !== 2) return def.default;
    const pair = v.map((x) => (def.tuple === 'int' ? Math.trunc(Number(x)) : Math.round(Number(x) * 1000) / 1000));
    return pair.every(Number.isFinite) ? Object.freeze(pair) : def.default;
  }
  if (isChoiceKey(def)) {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) ? Math.max(0, Math.min(def.options.length - 1, n)) : def.default;
  }
  if (isFloatKey(def)) {
    const f = Number(v);
    return Number.isFinite(f) ? Math.max(def.min, Math.min(def.max, Math.round(f * 1000) / 1000)) : def.default;
  }
  if (!isIntKey(def)) return !!v;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.max(def.min, Math.min(def.max, n)) : def.default;
}

export function modSettingIfDeclared(vendor, key) {
  return declaredKey(vendor, key) ? modSetting(vendor, key) : undefined;
}

const declaredKey = (vendor, key) =>
  (Object.hasOwn(MOD_SETTINGS, vendor) && Object.hasOwn(MOD_SETTINGS[vendor].keys, key) ? MOD_SETTINGS[vendor].keys[key] : undefined);

export function onlineModSetting(vendor, key, search) {
  const room = onlineForcedModSetting(vendor, key, search);
  if (room !== undefined) return room;
  const def = declaredKey(vendor, key);
  return def && onlineWholeModKey(vendor, key, search) ? def.default : undefined;
}

const _reads = new Map();
let _readsGen = -1, _readsOnline = false;
export function modSetting(vendor, key) {
  if (rollingAsTheRoom()) return readModSetting(vendor, key);
  const online = isOnlinePage();
  if (_readsGen !== _generation || _readsOnline !== online) { _reads.clear(); _readsGen = _generation; _readsOnline = online; }
  let held = _reads.get(vendor);
  if (held?.has(key)) return held.get(key);
  const v = readModSetting(vendor, key);
  if (!held) _reads.set(vendor, held = new Map());
  held.set(key, v);
  return v;
}
function readModSetting(vendor, key) {
  const def = declaredKey(vendor, key);
  if (!def) throw new Error(`modSetting: ${vendor}/${key} is not a declared switch`);
  const forced = onlineModSetting(vendor, key);
  if (forced !== undefined) return forced;
  const v = load()[vendor]?.[key];
  return v === undefined ? def.default : coerce(def, v);
}

const _loadedForGame = new Map();
export function latchModLoaded(vendor, on) { _loadedForGame.set(vendor, !!on); return !!on; }
export const modLatchedOn = (vendor) => _loadedForGame.get(vendor);

export function storedModSetting(vendor, key) {
  if (!declaredKey(vendor, key)) return undefined;
  return load()[vendor]?.[key];
}

const _settingsOf = new Map();
export function modSettingsOf(vendor) {
  const keys = MOD_SETTINGS[vendor]?.keys;
  if (!keys) throw new Error(`modSettingsOf: ${vendor} is not a vendored mod with switches`);
  const rolling = rollingAsTheRoom(), online = isOnlinePage();
  const held = rolling ? null : _settingsOf.get(vendor);
  if (held && held.gen === _generation && held.online === online) return { ...held.out };
  const out = {};
  for (const k of Object.keys(keys)) out[k] = modSetting(vendor, k);
  if (!rolling) _settingsOf.set(vendor, { gen: _generation, online, out: { ...out } });
  return out;
}

let _generation = 0;
export const modSettingsGeneration = () => _generation;

export function setModSetting(vendor, key, value) {
  const def = declaredKey(vendor, key);
  if (!def) throw new Error(`setModSetting: ${vendor}/${key} is not a declared switch`);
  const m = load();
  const v = coerce(def, value);
  (m[vendor] ??= {})[key] = v;
  for (const r of SWITCH_RESETS) if (r.vendor === vendor && r.key === key) m[vendor][r.stamp] = true;
  save();
  _generation++;
  return v;
}

export function flattenModPreset(vendor, values) {
  const keys = MOD_SETTINGS[vendor]?.keys;
  if (!keys || !values || typeof values !== 'object') return Object.freeze({});
  const out = {};
  for (const [section, entries] of Object.entries(values)) {
    if (!entries || typeof entries !== 'object') continue;
    for (const [key, raw] of Object.entries(entries)) {
      const name = `${section}.${key}`;
      const def = keys[name];
      if (!def) continue;
      const v = (typeof raw === 'string' && /^(true|false)$/i.test(raw.trim())) ? /^true$/i.test(raw.trim()) : raw;
      out[name] = coerce(def, v);
    }
  }
  return Object.freeze(out);
}

export function _resetModSettings() { memory = null; _generation++; _loadedForGame.clear(); try { appStorage()?.removeItem(STORE_KEY); } catch { } }
