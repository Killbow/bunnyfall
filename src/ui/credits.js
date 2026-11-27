// ═══════════════════════════════════════════════════════════════════
// CREDITS - who made what the port carries (CR1, Mac's call 2026-08-30:
// "as we integrate these I really want to give credit to the mod
// developer who created it").
//
// ONE TABLE, ON THE SCREEN. Every third-party work in the tree has a
// row here, and the About pane renders the rows; a README in vendor/
// credits the author to whoever reads the repo, and this credits them
// to whoever plays the game, which is the audience that matters to a
// modder. test/systems/credits.test.js sweeps vendor/ against this list both
// ways, so a work cannot be vendored without a row and a row cannot
// name a folder that is gone.
//
// Two kinds of row, kept apart on the screen because they are owed
// differently:
//   - BUILT ON: the game itself and the source the game began as a 1:1 port of (SCOPE1: now its reference).
//   - MODS: a modder's own work, carried with the author's permission
//     (never without - the roads were removed whole for exactly that).
//     `vendor` names the folder whose README records the permission.
//
// No URLs are invented: a contact is what the author's own manifest
// says it is.
//
// L10N4: the sentences are the player's language - what a work is, the
// terms it is carried under, and the words around a name ("and
// contributors", "through the Nexus page") - each a getter over t(), so
// the About pane reads them as it draws, never English frozen at load.
// The names stay as they are: a work's title, its author, its version,
// its link, its folder.
//
// L10N6: the translations are credited as the works are, one row a
// language (translationCredits, below the table).
// ═══════════════════════════════════════════════════════════════════

import { t, availableLocales, intlLocale, BASE_LOCALE, PSEUDO_LOCALE } from './textManager.js';

export const CREDITS = Object.freeze({
  builtOn: Object.freeze([
    Object.freeze({
      title: 'The Elder Scrolls II: Daggerfall',
      author: 'Bethesda Softworks',
      get what() { return t('credits.daggerfall.what', 'The original game. All of its art, sound, text, and world data are read from your own copy\'s ARENA2 folder. None of it is included here.'); },
    }),
    Object.freeze({
      title: 'Daggerfall Unity',
      get author() { return t('credits.author.andContributors', '{name} and contributors', { name: 'Gavin Clayton (Interkarma)' }); },
      get what() { return t('credits.dfu.what', 'This game began as a rewrite of Daggerfall Unity and still uses it as its reference. Its quest scripts, book index, settings tables, game text table, interaction-mode icons and mouse cursor are included unchanged (MIT License).'); },
      vendor: Object.freeze(['dfu-quests', 'dfu-books', 'dfu-settings', 'dfu-text', 'dfu-icons', 'dfu-cursor']),
      link: 'https://github.com/Interkarma/daggerfall-unity',
    }),
    Object.freeze({
      title: 'Silkscreen',
      version: '1.001',
      get author() { return t('credits.author.projectAuthors', 'The {project} Project Authors', { project: 'Silkscreen' }); },
      get what() { return t('credits.silkscreen.what', 'Provides the digit 5 for numbers in the Enhanced skin, replacing the Pixelify Sans 5 that resembles an 8.'); },
      get terms() { return t('credits.silkscreen.terms', 'SIL Open Font License 1.1. The license is included with the glyph.'); },
      vendor: Object.freeze(['silkscreen-five']),
      link: 'https://github.com/googlefonts/silkscreen',
    }),
    Object.freeze({
      title: 'Alegreya',
      version: '5.1.0 (Fontsource)',
      get author() { return t('credits.author.projectAuthors', 'The {project} Project Authors', { project: 'Alegreya' }); },
      get what() { return t('credits.alegreya.what', 'The Book text font, the game’s default for menus and windows on the Enhanced skin.'); },
      get terms() { return t('credits.alegreya.terms', 'SIL Open Font License 1.1. The license is included with the font in fonts/alegreya.'); },
      link: 'https://github.com/huertatipografica/Alegreya',
    }),
    Object.freeze({
      get title() { return t('credits.pixelifyGlyphs.title', 'The 2 and the Z'); },
      author: 'DFO',
      get what() { return t('credits.pixelifyGlyphs.what', 'Custom 2 and Z glyphs drawn on the Pixelify Sans grid for the Enhanced skin so they cannot be mistaken for each other.'); },
      get terms() { return t('credits.pixelifyGlyphs.terms', 'The game\'s own work (vendor/pixelify-glyphs/, built by tools/pixelifyGlyphs.py).'); },
      vendor: Object.freeze(['pixelify-glyphs']),
    }),
    Object.freeze({
      get title() { return t('credits.layeredArmor.title', 'Layered Gearing'); },
      author: 'DFO',
      get what() { return t('credits.layeredArmor.what', 'Artwork for the Layered Gearing style, covering helmets, chest armor, leg armor, cloaks, and hoods for both body types. Includes leather, chain, and plate across seven metals, built from Daggerfall\'s class and enemy sprites.'); },
      get terms() { return t('credits.layeredArmor.terms', 'Made for DFO and carried under the owner\'s exception for art drawn from Daggerfall\'s own (vendor/layered-armor/README.md).'); },
      vendor: Object.freeze(['layered-armor']),
    }),
    Object.freeze({
      title: 'Project Raum',
      author: 'Mac (Lattymoy)',
      get what() { return t('credits.raum.what', 'An animated leather book reader for the Enhanced skin with an opening cover, two-page spreads, turning pages, and stained paper. It displays Daggerfall\'s books in their original fonts.'); },
      get terms() { return t('credits.raum.terms', 'The author\u2019s own work, from his repository.'); },
      vendor: Object.freeze(['raum-book']),
      link: 'https://github.com/Lattymoy/project-raum',
    }),
    Object.freeze({
      get title() { return t('credits.vorbis.title', 'Vorbis setup headers for FSB5'); },
      // CSA-A: two codebook headers FMOD strips from a Unity audio clip, needed to turn Come Sail Away's sounds back into Ogg files
      get author() { return t('credits.vorbis.author', 'The {project} authors and the {foundation} ({library})', { project: 'vgmstream', foundation: 'Xiph.org Foundation', library: 'libvorbis' }); },
      get what() { return t('credits.vorbis.what', 'Restores two Vorbis setup headers that Unity audio clips omit, so Come Sail Away’s five sounds play as the author made them.'); },
      get terms() { return t('credits.vorbis.terms', 'From vgmstream\u2019s table (ISC-style license) and libvorbis\u2019s encoder output (BSD-3-Clause, Xiph.org). Both licenses are included with the files.'); },
      vendor: Object.freeze(['vorbis-fsb-setups']),
      link: 'https://github.com/vgmstream/vgmstream',
    }),
    Object.freeze({
      get title() { return t('credits.classSkins.title', 'Daggerfall class skins'); },
      // SKIN2: an art pack, not a mod (no switch, so no Features row) - Mac's ExistingClasses archive. It names no author for the pack (one folder
      // names Kamer, for the bounty hunter), so the screen says so rather than crediting a guess; the record is open in
      // vendor/class-skins/README.md and the registry row.
      get author() { return t('credits.author.unnamed', 'Unnamed ({source})', { source: 'ExistingClasses' }); },
      get what() { return t('credits.classSkins.what', 'Redrawn third-person sprite sheets for the adventurer, acrobat, assassin, burglar, bounty hunter, dark acolyte, Dark Brotherhood, healer, monk, nightblade, pirate, and sorcerer. Includes 20 sheets, most in both sexes, selectable on your profile\'s Skin card.'); },
      get terms() { return t('credits.classSkins.terms', 'Used with the artists\u2019 permission, on Mac\u2019s word. The archive states no license. Its 1,683 pictures are included unchanged.'); },
      vendor: Object.freeze(['class-skins']),
    }),
    // BUNNYFALL (2026-11-26, caverns): the owner's own models, baked by tools/mineArtBake.mjs into public/art/bunnyfall-mine/
    Object.freeze({
      get title() { return t('credits.mineArt.title', 'Mine entrance and ores'); },
      author: 'Killbow',
      get what() { return t('credits.mineArt.what', 'The low-poly mine entrance placed at every mine mouth in the wilds, along with the ore and crystal models.'); },
      get terms() { return t('credits.mineArt.terms', 'Made for Bunnyfall by its owner.'); },
    }),
  ]),
  mods: Object.freeze([
    // MODPACK1 / WEEB1: the two mods a player attaches from their own downloads (none of their art ships with the game),
    // and the framework whose law the port follows to stand Weeberfall's townsfolk
    Object.freeze({
      title: 'Paperdoll Enhanced',
      version: '1.2.0',
      author: 'Barbariank, jodzie, TheCausedMarlin',
      get what() { return t('credits.pde.what', 'Hand-drawn paperdolls for female characters, loaded from your own copy of the mod (none of its art ships with the game). Any missing metal variants are recolored from the mod\'s existing sprites.'); },
      get terms() { return t('credits.pde.terms', 'Not distributed with the game. Each player supplies their own copy.'); },
      get contact() { return t('credits.contact.manifest', '{contact}', { contact: 'nexusmods.com/daggerfallunity/mods/748' }); },
      vendor: Object.freeze([]),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/748',
    }),
    Object.freeze({
      title: 'Weeberfall',
      author: 'Weeberfall\u2019s authors',
      get what() { return t('credits.weeb.what', 'Optional art and townsfolk loaded from your own copy of the mod, with no assets bundled with the game. The Dibellan Degeneracy add-on has its own switch.'); },
      get terms() { return t('credits.weeb.terms', 'Not distributed with the game. Each player supplies their own copy.'); },
      get contact() { return t('credits.contact.manifest', '{contact}', { contact: 'nexusmods.com/daggerfallunity' }); },
      vendor: Object.freeze([]),
      link: 'https://www.nexusmods.com/daggerfallunity',
    }),
    Object.freeze({
      title: 'Flat Replacer',
      author: 'Numidium3rd',
      get what() { return t('credits.flatReplacer.what', 'Defines how mod townsfolk replace building NPCs, assigning each one a sprite, portrait, and name. Used to place Weeberfall\'s townsfolk.'); },
      get terms() { return t('credits.flatReplacer.terms', 'Its rules followed under its MIT License (Copyright (c) 2020 numidium).'); },
      get contact() { return t('credits.contact.manifest', '{contact}', { contact: 'github.com/numidium/dfu-mods' }); },
      vendor: Object.freeze([]),
      link: 'https://github.com/numidium/dfu-mods/tree/master/FlatReplacer',
    }),
    Object.freeze({
      title: 'Meaner Monsters',
      version: '1.5.2',
      author: 'Ralzar',
      get what() { return t('credits.meanerMonsters.what', 'Makes 20 monsters tougher and tones down rats, bats, and zombies. Werewolves and wereboars are a fifth larger, and the dragonling two and a half times its size. Based on version 1.5.2. With the combat overhaul on, Kirk.O\'s numbers apply.'); },
      get terms() { return t('credits.meanerMonsters.terms', 'Used with permission under its MIT License (Copyright (C) 2020 Ralzar, authors Hazelnut and Ralzar).'); },
      get contact() { return t('credits.contact.manifest', '{contact}', { contact: 'forums.dfworkshop.com' }); },
      vendor: Object.freeze(['meanerMonsters']),
      link: 'https://github.com/Ralzar81/Meaner-Monsters',
    }),
    Object.freeze({
      title: 'Unleveled Loot',
      version: '1.1.2',
      author: 'Ralzar',
      get what() { return t('credits.unleveledLoot.what', 'Loot and stock ignore your level; materials follow luck, shop quality, and dungeon type. Bodies carry gold divided by your level and multiplied by luck. Daedra and Orcs can drop their metals, and any material can stand in for another.'); },
      get terms() { return t('credits.unleveledLoot.terms', 'Used with permission under its MIT License (Copyright (C) 2020 Ralzar).'); },
      get contact() { return t('credits.unleveledLoot.contact', '{author}, through the Nexus page ({page})', { author: 'Ralzar', page: 'daggerfallunity mod 135' }); },
      vendor: Object.freeze(['unleveledLoot']),
      link: 'https://github.com/Ralzar81/Unleveled-Loot',
    }),
    Object.freeze({
      title: 'Physical Combat And Armor Overhaul',
      version: '1.44',
      author: 'Kirk.O',
      get what() { return t('credits.pcaao.what', 'Armor reduces damage instead of hit chance, and skills and stats decide hits and blocks. Wear uses his Believable Equipment Characteristics And Durability. His versions of Ralzar\'s Meaner Monsters and Roleplay & Realism\'s archery apply when those mods are on.'); },
      get terms() { return t('credits.pcaao.terms', 'Used with the author\u2019s permission. Based on the released mod and its public source, which states no license.'); },
      get contact() { return t('credits.contact.manifest', '{contact}', { contact: 'kirkoliveri@gmail.com' }); },
      vendor: Object.freeze(['pcaao']),
      link: 'https://github.com/magicono43/DFU-Mod_Physical-Combat-And-Armor-Overhaul',
    }),
    Object.freeze({
      title: 'Weapon Widget',
      version: '1.6',
      author: 'RedRoryOTheGlen',
      get what() { return t('credits.weaponWidget.what', 'Overhauls first-person weapons and Morrowind arms with wind-up and recovery animations, active-hand rendering, and smooth sheathing. Adds walking bob, look inertia, double-size idle sprites from the mod, and recoil when you hit, parry, or miss.'); },
      get terms() { return t('credits.weaponWidget.terms', 'Used with the author\u2019s permission.'); },
      get contact() { return t('credits.contact.nexus', '{author}, through the Nexus page ({page})', { author: 'RedRoryOTheGlen', page: 'daggerfallunity mod 860' }); },
      vendor: Object.freeze(['weapon-widget']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/860',
    }),
    Object.freeze({
      title: 'Diverse Weapons',
      version: '1.7.3',
      author: 'RealAKP',
      get what() { return t('credits.diverseWeapons.what', 'First-person sprites for 18 weapons in every metal, plain and enchanted, where the original game has one sprite per weapon class. Includes double-size idle sprites for Weapon Widget and matching inventory icons.'); },
      get terms() { return t('credits.diverseWeapons.terms', 'Used with the author\u2019s permission. The script is under the MIT License, and the sprites are the author\u2019s own paintings.'); },
      get contact() { return t('credits.contact.nexus', '{author}, through the Nexus page ({page})', { author: 'RealAKP', page: 'daggerfallunity mod 242' }); },
      vendor: Object.freeze(['diverse-weapons']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/242',
    }),
    Object.freeze({
      title: "Rox's New Argonians",
      version: '1.0',
      author: 'SynfulRoX',
      get what() { return t('credits.roxArgonians.what', 'Ten new Argonian heads and bodies for both genders, with a matching vampire face for each head. Available as Argonian faces 11 to 20 alongside the original ten.'); },
      get terms() { return t('credits.roxArgonians.terms', 'Free to edit and redistribute, as long as credit to the original creator is included.'); },
      get contact() { return t('credits.contact.nexus', '{author}, through the Nexus page ({page})', { author: 'SynfulRoX', page: 'daggerfallunity mod 1206' }); },
      vendor: Object.freeze(['roxs-new-argonians']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/1206',
    }),
    Object.freeze({
      title: "Cheb's Necromancy",
      version: '0.0.24',
      author: 'Chebgonaz',
      get what() { return t('credits.chebsNecromancy.what', 'Adds necromancy under Mysticism, with spells to raise skeletons, zombies, ghosts, mummies, vampires, and liches that follow and fight for you. Also adds Recall Minions, corpse reagents, grave robbing, and the Necromancer class.'); },
      get terms() { return t('credits.chebsNecromancy.terms', 'Released under the Unlicense (public domain). Its C# is ported by hand.'); },
      get contact() { return t('credits.contact.nexus', '{author}, through the Nexus page ({page})', { author: 'Chebgonaz', page: 'daggerfallunity mod 714' }); },
      vendor: Object.freeze(['chebs-necromancy']),
      link: 'https://github.com/jpw1991/daggerfall-chebs-necromancy',
    }),
    Object.freeze({
      title: 'GrimoireUI',
      version: '1.2',
      author: 'LordSquacquerone',
      get what() { return t('credits.grimoireUi.what', 'Redraws Daggerfall\'s menus at triple resolution with parchment and wood panels, a book-style spellbook, and two new fonts. Select it on the UI Overhaul card under Overhauls.'); },
      get terms() { return t('credits.grimoireUi.terms', 'Used with the author\u2019s permission. The pictures and fonts are the author\u2019s own art, included unchanged.'); },
      get contact() { return t('credits.contact.nexus', '{author}, through the Nexus page ({page})', { author: 'LordSquacquerone', page: 'daggerfallunity mod 1222' }); },
      vendor: Object.freeze(['grimoire-ui']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/1222',
    }),
    Object.freeze({
      title: 'Roleplay & Realism: Items',
      version: '1.3',
      author: 'Hazelnut & Ralzar',
      get what() { return t('credits.rrItems.what', 'Adds the Archer\'s Axe, the Light Flail, and light and medium armor sets in every metal with custom art. Also rebalances item weights and prices, and updates loot tables, enemy gear, starting kits, and shop stock.'); },
      get terms() { return t('credits.rrItems.terms', 'Used with the authors\u2019 permission under the MIT License. The 280 sprites are the authors\u2019 own art.'); },
      get contact() { return t('credits.contact.forumsOrNexus', '{author}, through the DFU forums ({forums}) or the Nexus page ({page})', { author: 'Hazelnut', forums: 'forums.dfworkshop.net', page: 'daggerfallunity mod 61' }); },
      vendor: Object.freeze(['roleplay-realism-items']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/61',
    }),
    Object.freeze({
      title: 'Roleplay & Realism',
      version: '1.8',
      author: 'Hazelnut',
      get what() { return t('credits.rr.what', 'Gameplay rule changes such as bow draw power, climbing, swing speed, armor wear, encumbrance, loans, ship boarding, and usable beds. Also includes NPC variants, enhanced riding, refined training, and the Master Armorer quests.'); },
      get terms() { return t('credits.rr.terms', 'Used with the author\u2019s permission under the MIT License.'); },
      get contact() { return t('credits.contact.forumsOrNexus', '{author}, through the DFU forums ({forums}) or the Nexus page ({page})', { author: 'Hazelnut', forums: 'forums.dfworkshop.net', page: 'daggerfallunity mod 16' }); },
      vendor: Object.freeze(['roleplay-realism']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/16',
    }),
    Object.freeze({
      title: 'Shield Widget',
      version: '1.6',
      author: 'RedRoryOTheGlen',
      get what() { return t('credits.shieldWidget.what', 'Renders your shield in first person with metal-matched sprites that show wear as condition drops. The shield bobs as you walk, slides away when you sheathe, swing, or cast, and recoils when struck.'); },
      get terms() { return t('credits.shieldWidget.terms', 'Used with the author\u2019s permission, with the mod\u2019s own 600 sprites.'); },
      get contact() { return t('credits.contact.nexus', '{author}, through the Nexus page ({page})', { author: 'RedRoryOTheGlen', page: 'daggerfallunity mod 733' }); },
      vendor: Object.freeze(['shield-widget']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/733',
    }),
    Object.freeze({
      title: 'Weapon Sheathing',
      version: '1.6',
      author: 'Greatness7',
      get what() { return t('credits.weaponSheathing.what', 'Sheathed Morrowind weapons hang in scabbards and quivers: 71 models and 3 skeleton add-ons that work as in OpenMW. Scabbards by akortunov, Greatness7, Heinrich, London Rook, Lord Berandas, Melchior Dahrk, MementoMoritius, Petethegoat, PikachunoTM, and Remiros, per the readme.'); },
      get terms() { return t('credits.weaponSheathing.terms', 'The mod\u2019s own permission: free to use with credit and no fee.'); },
      get contact() { return t('credits.contact.nexus', '{author}, through the Nexus page ({page})', { author: 'Greatness7', page: 'morrowind mod 46069' }); },
      vendor: Object.freeze(['weapon-sheathing']),
      link: 'https://www.nexusmods.com/morrowind/mods/46069',
    }),
    Object.freeze({
      title: 'Handheld Torches',
      version: '1.4.1',
      author: 'RedRoryOTheGlen',
      get what() { return t('credits.handheldTorches.what', 'Holding a light takes a free hand and shows in first person; a two-handed weapon stows or drops it. Light, put out, drop, or throw torches; a thrown torch can ignite an enemy. Dropped torches persist across saves.'); },
      get terms() { return t('credits.handheldTorches.terms', 'Used with the author\u2019s permission, with the mod\u2019s own textures.'); },
      get contact() { return t('credits.contact.nexus', '{author}, through the Nexus page ({page})', { author: 'RedRoryOTheGlen', page: 'daggerfallunity mod 780' }); },
      vendor: Object.freeze(['handheld-torches']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/780',
    }),
    Object.freeze({
      title: 'Climates & Calories',
      version: '1.7.1',
      author: 'Ralzar',
      get what() { return t('credits.climatesCalories.what', 'Survival rules for temperature, hunger, thirst, sleep, spoilage, and camping, in four tiers. Off is the classic game, and Boons (the default) only gives bonuses. Casual borrows stamina until a need is met, and Hard can hurt and sicken you.'); },
      get terms() { return t('credits.climatesCalories.terms', 'Reworked from the mod\u2019s rules with the author\u2019s permission, passed on by Mac. Its numbers were the starting point, and its own art is used for spoiled food, raw meat and the waterskin.'); },
      get contact() { return t('credits.contact.forumsManifest', '{author}, on the DFU forums', { author: 'Ralzar' }); },
      vendor: Object.freeze(['climates-calories']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/49',
    }),
    Object.freeze({
      title: 'World Tooltips',
      version: '1.1',
      author: 'jefetienne',
      get what() { return t('credits.worldTooltips.what', 'Displays a tooltip for the target under your crosshair, including NPCs, shop signs and hours, door locks, dungeon entrances, switches, and containers. On the Enhanced skin, it appears directly at the crosshair instead of in the mod\'s tooltip panel.'); },
      get terms() { return t('credits.worldTooltips.terms', 'Used with permission under its MIT License (Copyright (c) 2009-2018 jefetienne), with a second MIT notice for Daggerfall Workshop.'); },
      get contact() { return t('credits.contact.forumsManifest', '{author}, on the DFU forums', { author: 'jefetienne' }); },
      vendor: Object.freeze(['world-tooltips']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/158',
    }),
    Object.freeze({
      title: 'Readied Spellcasting Hands',
      version: '1.3',
      author: 'jefetienne',
      what: 'Your hands stay raised while a spell is readied, in the spell\u2019s element, instead of an empty screen. The cast plays on from them when you click. Works with the classic first-person hands.',
      terms: 'Used with permission under its MIT License (Copyright (c) 2009-2018 jefetienne), with a second MIT notice for Daggerfall Workshop.',
      contact: 'jefetienne, on the DFU forums',
      vendor: Object.freeze(['readied-spellcasting-hands']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/91',
    }),
    Object.freeze({
      title: 'Windmills of Daggerfall',
      version: '2.0',
      author: 'Kamer',
      get what() { return t('credits.windmills.what', 'Adds windmills at the seven farms the author chose, on the Enhanced skin, with turning sails, interior machinery, and 17 climate and seasonal variants. The Classic skin keeps Daggerfall\'s original farms.'); },
      get terms() { return t('credits.windmills.terms', 'Used with the author\u2019s permission.'); },
      contact: 'DFU Discord',
      vendor: Object.freeze(['windmills-kamer']),
    }),
    // WOD1: Kamer's second - AFTER the mill, which the CR1 gate finds
    // first by his name.
    Object.freeze({
      title: 'World of Daggerfall',
      version: '2.0',
      author: 'Kamer',
      get what() { return t('credits.worldOfDaggerfall.what', 'Populates 227,938 wilderness squares across the Iliac Bay with his 65 layouts of bandit camps, forts, ruins, shrines, mountains, and rock fields. Includes the bandits, bears, warriors, and treasure they hold, plus his camp outside Privateer\'s Hold.'); },
      get terms() { return t('credits.worldOfDaggerfall.terms', 'Used with the author’s permission, confirmed by Mac.'); },
      get contact() { return t('credits.contact.dfuForums', 'DFU forums'); },
      vendor: Object.freeze(['world-of-daggerfall']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/181',
    }),
    // LPT1: Kamer's sixth (beside his wilderness), under the handle his manifest signs it with
    Object.freeze({
      title: 'Low Poly Trees',
      version: '5',
      author: 'SquidKamer',
      what: '3D trees, bushes and stumps in the wilderness: his 253 low-poly models replace Daggerfall\u2019s flat sprites, each tree with its own size and angle. Far away they are drawn as pictures, so you can still see to the horizon. Their leaves and bark are painted from your own Daggerfall art and from Seasons of the Iliac Bay\u2019s, so they change with the seasons.',
      terms: 'Included on Mac\u2019s word. SquidKamer\u2019s permission is still to be recorded.',
      contact: 'DFU Discord',
      vendor: Object.freeze(['low-poly-trees']),
    }),
    Object.freeze({
      title: 'Basic Roads',
      version: '1.3.1',
      author: 'Hazelnut',
      get what() { return t('credits.basicRoads.what', 'Roads and tracks painted across the Iliac Bay from the author\'s hand-drawn network. Shown in both skins and on the map.'); },
      get terms() { return t('credits.basicRoads.terms', 'Used with the author\u2019s permission. The road painter is under the MIT License (Copyright (C) 2020 Hazelnut).'); },
      get contact() { return t('credits.contact.dfuForums', 'DFU forums'); },
      vendor: Object.freeze(['roads-hazelnut']),
      link: 'https://github.com/ajrb/dfunity-mods',
    }),
    Object.freeze({
      title: 'Travel Options',
      version: '1.11',
      author: 'Hazelnut',
      get what() { return t('credits.travelOptions.what', 'Adds accelerated overland travel with steering controls, encounter stops, and following Basic Roads\' roads and tracks, using Jedidia\'s Tedious Travel autopilot. Also adds a road-network map overlay, a ports filter, a location info key, and location markers.'); },
      get terms() { return t('credits.travelOptions.terms', 'Code under the MIT License (Copyright (C) 2020 Hazelnut, PlayerAutoPilot Copyright (C) 2019 Jedidia). The 3 interface textures are the mod’s own art, used with the author’s permission.'); },
      contact: 'forums.dfworkshop.net',
      vendor: Object.freeze(['travel-options']),
      link: 'https://github.com/ajrb/dfunity-mods',
    }),
    Object.freeze({
      title: 'Dynamic Skies',
      version: '2.3.4',
      get author() { return t('credits.author.pair', '{first} and {second}', { first: 'BadLuckBurt', second: 'carademono' }); },
      get what() { return t('credits.dynamicSkies.what', 'The Enhanced sky: an atmosphere built on Feral Pug\'s extension of Unity\'s procedural sky, layered clouds, stars, moon phases, fog, storms, and pixel snow. The shader, presets, and textures are the mod\'s own. The Classic skin keeps Daggerfall\'s painted sky.'); },
      get terms() { return t('credits.dynamicSkies.terms', 'Used with the authors\u2019 permission.'); },
      get contact() { return t('credits.contact.discordServer', '{server} Discord server', { server: 'Lysandus\' Tomb' }); },
      vendor: Object.freeze(['dynamic-skies']),
      link: 'https://github.com/drcarademono/dynamic-skies',
    }),
    Object.freeze({
      title: 'Seasons of the Iliac Bay',
      version: '1.1',
      author: 'RosyTheRascal',
      get what() { return t('credits.seasons.what', 'Autumn, spring, and winter textures for trees, rocks, and plants in woodland, hill, haunted, and mountain regions. The textures are not bundled and load from your own copy of the mod.'); },
      get terms() { return t('credits.seasons.terms', 'Used with the author\u2019s permission.'); },
      get contact() { return t('credits.contact.discordServer', '{server} Discord server', { server: 'Lysandus\' Tomb' }); },
      vendor: Object.freeze(['seasons-iliac-bay']),
    }),
    Object.freeze({
      title: 'Ambient Text',
      version: '1.8',
      author: 'Regnier',
      get what() { return t('credits.ambientText.what', 'Shows occasional remarks about your surroundings, picked from 918 lines written by the author to match your location, the hour, and the weather. It stays quiet indoors and waits longer between lines.'); },
      get terms() { return t('credits.ambientText.terms', 'Used with the author\u2019s permission, with the author\u2019s own lines.'); },
      contact: 'forums.dfworkshop.net',
      vendor: Object.freeze(['ambient-text']),
    }),
    Object.freeze({
      title: 'Eye Of The Beholder',
      version: '2.1',
      author: 'RedRoryOTheGlen',
      get what() { return t('credits.eyeOfTheBeholder.what', 'Third-person view without Morrowind data: scroll the mouse wheel to pull the camera behind your shoulder, staying clear of walls. Renders your character as an 8-directional sprite while standing, walking, attacking, casting, or riding.'); },
      get terms() { return t('credits.eyeOfTheBeholder.terms', 'Used with the author\u2019s permission, with the mod\u2019s own 3,035 sprites.'); },
      contact: 'rmufrancisco@gmail.com',
      vendor: Object.freeze(['eye-of-the-beholder']),
    }),
    Object.freeze({
      title: 'Immersive Footsteps',
      version: '1.01',
      author: 'Kirk.O',
      get what() { return t('credits.immersiveFootsteps.what', 'Matches footsteps to surfaces (such as grass, gravel, snow, water, wood, and tile) and to leather, chain, or plate boots on stone. Also adds armor rattle, landing, and splash sounds in two quality levels.'); },
      get terms() { return t('credits.immersiveFootsteps.terms', 'Used with the author\u2019s permission, from the author\u2019s MIT-licensed source, with the mod\u2019s 210 sound clips.'); },
      contact: 'forums.dfworkshop.net',
      vendor: Object.freeze(['immersive-footsteps']),
    }),
    Object.freeze({
      title: 'Better Ambience',
      version: '0.1.4',
      author: 'Joshua Steinhauer',
      get what() { return t('credits.betterAmbience.what', 'Shakes the camera when you take damage, adds per-dungeon fog, lighting, and sound echoes, and muffles rain indoors and at dungeon entrances. Its armor-clank footsteps stay off while Immersive Footsteps is enabled, as that mod\'s author asks.'); },
      get terms() { return t('credits.betterAmbience.terms', 'Used with the author\u2019s permission under the MIT License, with the 29 sound clips the mod uses, from the author\u2019s repository. Its rain and snow particle changes are not included.'); },
      contact: 'forums.dfworkshop.net',
      vendor: Object.freeze(['better-ambience']),
    }),
    Object.freeze({
      title: 'Oblivion Remaster Like Leveling',
      version: '0.5.3',
      // THE ONE ROW ON THIS SCREEN WHOSE AUTHOR IS NOT KNOWN. Nothing
      // in the shipped archive names them - no licence file, no script
      // header, an empty author field in the `.omwaddon` - so the
      // screen says so and names the page the mod comes from, rather
      // than crediting a guess. The record is open in
      // vendor/oblivion-remaster-leveling/README.md and in the
      // registry row, and it is filled in the moment Mac has the name.
      get author() { return t('credits.author.unnamed', 'Unnamed ({source})', { source: 'Nexus Morrowind 56569' }); },
      get what() { return t('credits.oblivionLeveling.what', 'An optional leveling mode, offered at character creation, from an OpenMW Lua mod for Morrowind. Skills fill a 100-point bar, fastest for primary and major skills, and overflow carries over. Each level gives points for attributes, with Luck costing more.'); },
      get terms() { return t('credits.oblivionLeveling.terms', 'Used with the author\u2019s permission, on Mac\u2019s word. The archive states no license and names no author.'); },
      vendor: Object.freeze(['oblivion-remaster-leveling']),
    }),
    Object.freeze({
      title: 'Horse Cart and Cargo',
      version: '1.0.0-rc12',
      author: 'demifiend000',
      get what() { return t('credits.horseCart.what', 'Your horse and wagon stay in the world, visible to other players online, and can follow, wait, or be called outdoors. Hitch them together, open a parked wagon from nearby entrances, and see its cargo and turning wheels.'); },
      get terms() { return t('credits.horseCart.terms', 'Used with the author\u2019s permission, with the mod\u2019s own horse art.'); },
      get contact() { return t('credits.contact.nexus', '{author}, through the Nexus page ({page})', { author: 'demifiend000', page: 'daggerfallunity mod 1374' }); },
      vendor: Object.freeze(['horse-cart-and-cargo']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/1374',
    }),
    Object.freeze({
      title: 'Project Legacy',
      version: '0.4.1',
      author: 'Lattymoy, Gh\u00f0\u00a7\u2020 and Positronico',
      what: 'Your family and its tree. When you fall, an heir carries on your line: a sibling, a child or a newborn, with traits from their blood and upbringing. Switch between siblings, in a Bloodline house where death is final or an Enduring house where it costs years. Recover the remains and heirloom of the fallen and lay them to rest. Family members you are not playing live at the family home, where you can meet them and play them. Find it on the pause menu\u2019s Family tab.',
      terms: 'Used with permission: Mac is Lattymoy, the mod\u2019s first-named author. Rebuilt from the released mod with its bugs fixed.',
      vendor: Object.freeze(['project-legacy']),
    }),
    Object.freeze({
      title: 'Aquatic Sprites',
      version: '1.0',
      author: 'Cliffworms',
      get what() { return t('credits.aquaticSprites.what', 'Weed, coral, and shells: underwater sprites included with Daggerfall that were never used. Places 119 of them across 3 flooded dungeon areas, right where the author put them.'); },
      get terms() { return t('credits.aquaticSprites.terms', 'Used with the author’s permission, under terms that ask only for credit: “The mod may be distributed/translated without my authorization as long as I am credited as the author.” The dungeon areas are rebuilt from your own game files.'); },
      get contact() { return t('credits.contact.nexus', '{author}, through the Nexus page ({page})', { author: 'Cliffworms', page: 'daggerfallunity mod 276' }); },
      vendor: Object.freeze(['aquatic-sprites']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/276',
    }),
    Object.freeze({
      title: 'Detailed Ships',
      version: '1.0.0',
      author: 'Cliffworms',
      get what() { return t('credits.detailedShips.what', 'Rebuilds both ownable ships, with rigging, quarters, a cargo hold, an armory, sailors, and a Kynareth shrine. The readme credits the statue to King of Worms and Zoran. Pieces from Ninelan\'s Daggerfall Expanded Textures use stand-ins made for this game.'); },
      get terms() { return t('credits.detailedShips.terms', 'Used with the author’s permission, under terms that ask only for credit: “The mod may be distributed/translated without my authorization as long as I am credited as the author.” The ships and the original pictures are rebuilt from your own game files.'); },
      get contact() { return t('credits.contact.nexus', '{author}, through the Nexus page ({page})', { author: 'Cliffworms', page: 'daggerfallunity mod 1080' }); },
      vendor: Object.freeze(['detailed-ships']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/1080',
    }),
    // WD3: carademono's two town mods, one entry each (two vendors, two pages).
    Object.freeze({
      title: 'Beautiful Villages of Daggerfall',
      version: '1.4.2',
      author: 'carademono',
      what: 'The Iliac Bay\u2019s villages, hamlets, farms, manors and temples laid out again, and its roadside taverns rebuilt: 7,317 places, exactly as the author arranged them. Most pieces it borrows from other mods (Daggerfall Expanded Textures, the RMB Resource Pack and others) are replaced with stand-ins made for this game.',
      terms: 'Used with the author\u2019s permission. Every town is the author\u2019s edit applied to your own game files.',
      contact: 'carademono, through the Lysandus\u2019 Tomb Discord server',
      vendor: Object.freeze(['beautiful-villages']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/566',
    }),
    Object.freeze({
      title: 'Beautiful Cities of Daggerfall',
      version: '0.5.0',
      author: 'carademono',
      what: 'The Iliac Bay\u2019s cities laid out again, with districts, walls, gates, markets and docks: 410 cities, exactly as the author arranged them. Most pieces it borrows from other mods are replaced with stand-ins made for this game.',
      terms: 'Used with the author\u2019s permission. Every city is the author\u2019s edit applied to your own game files.',
      contact: 'carademono, through the Lysandus\u2019 Tomb Discord server',
      vendor: Object.freeze(['beautiful-cities']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/720',
    }),
    // VE4: carademono's third - the Texture Overhaul's first pack, worn from the Overhauls screen.
    Object.freeze({
      title: 'Vanilla Enhanced',
      version: '3.4.7',
      author: 'carademono',
      what: 'Daggerfall’s textures remastered: the ground, trees, rocks and plants, city walls and dungeons. Turn it on from the Texture Overhaul card, where its add-ons Masked Roads (with Kokey) and Snowless Swamps and Jungles have their own switches.',
      terms: 'Used with the author’s permission. The author’s repaints are included unchanged from the mod’s public repository.',
      contact: 'carademono, through the Lysandus’ Tomb Discord server',
      vendor: Object.freeze(['vanilla-enhanced']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/273',
    }),
    // WA1: Kamer's third - after the mill and the wilderness, which the CR1
    // gate finds first by his name.
    Object.freeze({
      title: 'Warm Ashes - Ships',
      version: '1.1',
      author: 'Kamer',
      get what() { return t('credits.warmAshes.what', 'Adds pirate ambushes during ship fast travel, where you and your crew fight raiders on deck to reach your destination. Includes his four quests and six ship layouts.'); },
      get terms() { return t('credits.warmAshes.terms', 'Used with the author\u2019s permission. The quests are his own, unchanged, and the ships are his edits applied to your own game files.'); },
      contact: 'DFU Discord',
      vendor: Object.freeze(['warm-ashes-ships']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/985',
    }),
    // RAID1: Kamer's fourth, and the first he made for this port - no public
    // page to link.
    Object.freeze({
      title: 'World Events - Raiding Parties',
      version: '1.1',
      author: 'Kamer',
      get what() { return t('credits.raidingParties.what', 'Knights, bandits, or orcs raid towns daily for 2 hours (10 real minutes online). Defeat 15 to 25 raiders with the watch to raise standing with the region, its people, a knightly order, and the Fighters Guild.'); },
      get terms() { return t('credits.raidingParties.terms', 'Made by Kamer for this game, used with his permission, with some bugs fixed.'); },
      contact: 'DFU Discord',
      vendor: Object.freeze(['world-events-raiding-parties']),
    }),
    // ARENA1: Kamer's fifth - after his raiding parties.
    Object.freeze({
      title: 'Daggerfall Arena',
      version: '1.0',
      author: 'Kamer',
      what: 'The Arena of Daggerfall, a colosseum in the middle of Daggerfall city: his arena with its tiers, torches and braziers, and a 32-block undercroft beneath it. It is drawn with your own Daggerfall art.',
      terms: 'Used with the author\u2019s permission, passed on by Mac.',
      contact: 'DFU Discord',
      vendor: Object.freeze(['daggerfall-arena']),
    }),
    Object.freeze({
      title: 'Iliac Puddle No More',
      version: '1.2.2',
      author: 'jet082',
      get what() { return t('credits.iliacPuddle.what', 'Turns the Iliac Bay into a sea up to 250 meters deep where you can dive, swim, surface, and watch your breath. The depths hold underwater fog, seaweed, coral, fish, sea creatures, and guarded shipwrecks with treasure.'); },
      get terms() { return t('credits.iliacPuddle.terms', 'Used with the author\u2019s permission. The coastline is rebuilt from your own Daggerfall files.'); },
      get contact() { return t('credits.contact.nexus', '{author}, through the Nexus page ({page})', { author: 'jet082', page: 'daggerfallunity mod 1304' }); },
      vendor: Object.freeze(['iliac-puddle-no-more']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/1304',
    }),
    Object.freeze({
      title: 'There’s a Hole in the Bottom of the Ocean',
      version: '1.1.0',
      author: 'jet082',
      get what() { return t('credits.oceanHoles.what', 'Adds deep-sea blue holes to Iliac Puddle No More, marked by dark pits under plumes of miasma. Swim down to enter flooded, pitch-black dungeons where sea creatures replace fire enemies and loot rolls one material tier higher.'); },
      get terms() { return t('credits.oceanHoles.terms', 'Used with the author\u2019s permission.'); },
      get contact() { return t('credits.contact.nexus', '{author}, through the Nexus page ({page})', { author: 'jet082', page: 'daggerfallunity mod 1313' }); },
      vendor: Object.freeze(['ocean-holes']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/1313',
    }),
    Object.freeze({
      title: 'Come Sail Away',
      version: '2.1',
      author: 'RedRoryOTheGlen',
      get what() { return t('credits.comeSailAway.what', 'Buy a boat as parts or a deed, launch it (deeds near a port), and pack it up to carry with you. Row, or trim the sails to the wind. Includes its boats, sails, oars, wind gauge, waves, and sounds.'); },
      get terms() { return t('credits.comeSailAway.terms', 'Used with the author\u2019s permission, with his own pictures and sounds. Some wave textures are rebuilt from your own Daggerfall files.'); },
      get contact() { return t('credits.contact.nexus', '{author}, through the Nexus page ({page})', { author: 'RedRoryOTheGlen', page: 'daggerfallunity mod 1131' }); },
      vendor: Object.freeze(['come-sail-away']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/1131',
    }),
    // FORAGE1: Harbinger451's, with the four quest actions it needs restated
    // from Jagget's Quest Actions Extension (nothing of that mod carried).
    Object.freeze({
      title: 'Foraging',
      version: '1.7',
      author: 'Harbinger451',
      get what() { return t('credits.foraging.what', 'Chop wood, mine gems and metals, cut plants, rob graves, fish, and forage by day, away from towns and enemies. Attributes, climate, and season affect results. Firewood quests use four actions from Jagget\'s Quest Actions Extension, with thanks.'); },
      get terms() { return t('credits.foraging.terms', 'Used with the author\u2019s permission, with his own quests and textures, and 6 bugs fixed.'); },
      vendor: Object.freeze(['foraging']),
    }),
    // IT1: kkgobkk's carriages at the gates.
    Object.freeze({
      title: 'Immersive Travel',
      version: '1.5',
      author: 'kkgobkk',
      what: 'Carriages at the city gates. A carriage and driver wait outside walled cities and take you to a town or village for a fare: a daily fee plus any nights at an inn. Online, the carriage is how you fast travel over land.',
      terms: 'Used with the author\u2019s permission. The 4 city gates are the author\u2019s edits applied to your own game files.',
      contact: 'kkgobkk, through the Nexus page (daggerfallunity mod 986)',
      vendor: Object.freeze(['immersive-travel']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/986',
    }),
    // PI1: demifiend000's items in the world as themselves.
    Object.freeze({
      title: 'Physical Items',
      version: '0.1.29',
      author: 'demifiend000',
      what: 'Items lie in the world as themselves. A fallen enemy\u2019s gear scatters around the body to be picked up piece by piece, and Shift-clicking an item in your pack drops it in front of you. Each shows its own picture (its Morrowind one when Morrowind data is attached) and a rarity glow.',
      terms: 'Used with the author’s permission. It includes no art.',
      contact: 'demifiend000, through the Nexus page (daggerfallunity mod 1411)',
      vendor: Object.freeze(['physical-items']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/1411',
    }),
    // HAZE1 / WINDFALL1 / SNOWFALL1 / ALIKR1 (2026-10-08, Mac: "We have permission to use and
    // implement everything into the codebase"): the four environment mods, handed over together.
    Object.freeze({
      title: 'Heat Haze',
      version: '1.0.1',
      author: 'demifiend000',
      what: 'Heat shimmer in the desert. On sunny and cloudy days the distant land and sky waver in the heat, fading in after sunrise and out before sunset. Part of the enhanced outdoors.',
      terms: 'Used with the author\u2019s permission, on Mac\u2019s word.',
      contact: 'demifiend000, through the Nexus page (daggerfallunity mod 1397)',
      vendor: Object.freeze(['heat-haze']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/1397',
    }),
    Object.freeze({
      title: 'Windfall',
      version: '1.0.0',
      author: 'demifiend000',
      what: 'Wind that changes from day to day. Trees and plants sway each in their own way, some days are windy or stormy, gusts come and go with their own sounds, and leaves and snow blow off the branches. Part of the enhanced outdoors.',
      terms: 'Used with the author\u2019s permission, on Mac\u2019s word, with the mod\u2019s own pictures and sounds.',
      contact: 'demifiend000, through the Nexus page (daggerfallunity mod 1396)',
      vendor: Object.freeze(['windfall']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/1396',
    }),
    Object.freeze({
      title: 'Snowfall',
      version: '1.0.5',
      author: 'demifiend000',
      what: 'Daggerfall\u2019s winter ground repainted with the author\u2019s snow. Part of the enhanced outdoors.',
      terms: 'Used with the author\u2019s permission, on Mac\u2019s word.',
      contact: 'demifiend000, through the Nexus page (daggerfallunity mod 1401)',
      vendor: Object.freeze(['snowfall']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/1401',
    }),
    Object.freeze({
      title: 'Sands of the Alik\u2019r',
      version: '2',
      author: 'Unnamed (Nexus mod 1390)',
      what: 'The desert ground repainted as pale, rippled dune sand. Part of the enhanced outdoors.',
      terms: 'Used with the author\u2019s permission, on Mac\u2019s word. The archive names no author.',
      vendor: Object.freeze(['sands-of-the-alikr']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/1390',
    }),
    // KG3 (bible/11-Multiplayer/Kings-Gambit.md section 10.7): the bundle names no author - the credits' own unnamed form
    // until the owner names them (CR1 asks every row for an author; AUDIT KG C17)
    Object.freeze({
      get title() { return t('credits.kingsGambit.title', 'The King\u2019s Gambit'); },   // the game's name as its table says it (L10N4)
      version: '1',
      get author() { return t('credits.author.unnamed', 'Unnamed ({source})', { source: 'thekingsgambit.dfmod' }); },
      get what() { return t('credits.kingsGambit.what', 'A card game of armies and kings played at tavern card tables against regulars or online against another player. Unit cards use art from Iliac Hand, and king cards use the Bay deck.'); },
      get terms() { return t('credits.kingsGambit.terms', 'Used with permission, on Mac\u2019s word. The bundle names no author.'); },
      vendor: Object.freeze(['kings-gambit']),
    }),
    // DEX0 (bible/04-Characters/Enemy-Expansion.md): Kamer & Kab's fifty enemies and their encounter tables.
    Object.freeze({
      get title() { return t('credits.dex.title', 'Daggerfall Enemy Expansion'); },   // the mod's name as its manifest says it (L10N4)
      version: '1.3.4',
      author: 'Kamer & Kab',
      get what() { return t('credits.dex.what', 'Adds 50 new enemies and updated encounter tables, including goblins, regenerating trolls, minotaurs, golems, Dwarven centurions, mounted knights, witches, and Vengeful King Lysandus. Uses Kamer and Kab\'s custom and repainted sprites, plus Morrowind models where available.'); },
      get terms() { return t('credits.dex.terms', 'Ported from the shipped bundle and the authors’ own source, with their art carried over byte for byte (Daggerfall’s own sprites in it are rebuilt from your files). See vendor/daggerfall-enemy-expansion/README.md for the permission record.'); },
      get contact() { return t('credits.contact.nexus', '{author}, through the Nexus page ({page})', { author: 'Kamer & Kab', page: 'daggerfallunity mod 372' }); },
      vendor: Object.freeze(['daggerfall-enemy-expansion']),
      link: 'https://www.nexusmods.com/daggerfallunity/mods/372',
    }),
    // MUDEX1 (bible/04-Characters/Enemy-Expansion.md, MUDEX): Meaner Monsters' own form beside DEX, by its author.
    Object.freeze({
      title: 'MUDEX',
      version: '1.0.1',
      author: 'Ralzar',
      get what() { return t('credits.mudex.what', 'Meaner Unleveled Daggerfall Enemy Expansion: Ralzar\'s Meaner Monsters balance patch for Daggerfall Enemy Expansion. When both are enabled, it rebalances 35 classic and expansion monsters and gives each dungeon type themed, unleveled encounter tables.'); },
      get terms() { return t('credits.mudex.terms', 'Used with permission, on Mac’s word, with its two tables carried byte for byte. The repository states no license.'); },
      vendor: Object.freeze(['mudex']),
      link: 'https://github.com/Ralzar81/MUDEX',
    }),
  ]),
});

/** Names as the player's language lists them ("A, B and C"). */
const listOf = (names) => {
  try { return new Intl.ListFormat(intlLocale(), { type: 'conjunction' }).format(names); } catch { return names.join(', '); }
};

/** L10N6: THE TRANSLATIONS, credited as the works are - one row a language the game holds text for, English and the
 *  pseudo-locale aside (textManager availableLocales, as scenes/localeData.js registers them): its name in itself,
 *  whose words they are, and a bundled pack's terms and source. Mac's decisions (Localization-Arc.md): a machine draft
 *  says it is one; the people who translate or check a language are credited by name (`locales/<tag>/translators.json`);
 *  a pack is bundled only on its authors' terms, and those travel with it. A pack the player installed is their own -
 *  the Language row says so, the credits do not. Read as the About pane draws it, so every sentence is the player's
 *  language's. */
export function translationCredits(infos = availableLocales()) {
  return infos.filter((i) => i.code !== BASE_LOCALE && i.code !== PSEUDO_LOCALE && !i.hidden).map((i) => {
    const people = i.translators ?? [];
    const pack = i.bundled ?? null;
    const lines = [];
    if (i.source === 'machine') {
      lines.push(people.length
        ? t('credits.l10n.checked', 'Machine translation by Claude, checked and corrected by {names}.', { names: listOf(people) })
        : t('credits.l10n.machine', 'Machine translation by Claude, still being checked. Corrections from native speakers are welcome.'));
    } else {
      lines.push(people.length
        ? t('credits.l10n.people', 'Translated by {names}.', { names: listOf(people) })
        : t('credits.l10n.community', 'Translated by the community.'));
    }
    if (pack) lines.push(t('credits.l10n.bundled', 'Uses {pack} for the original Daggerfall text, with permission from its authors.', { pack: pack.name }));
    const authors = [...(pack?.authors ?? []), ...people];
    return Object.freeze({
      code: i.code,
      title: i.name,
      author: authors.length ? listOf(authors) : 'Claude (Anthropic)',
      what: lines.join(' '),
      ...(pack ? { terms: t('credits.l10n.terms', '{license}: {terms}', { license: pack.license, terms: pack.terms }) } : {}),
      ...(pack && /^https?:\/\//.test(pack.source) ? { link: pack.source } : {}),
    });
  });
}
