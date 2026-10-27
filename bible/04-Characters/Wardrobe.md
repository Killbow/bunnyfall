# The Wardrobe - a piece's look, collected and chosen (APPEARANCES, 2026-10-27)

> Design page and record. Where the page and the code disagree, the code's own headers (`src/net/appearanceLaw.js`,
> `src/systems/appearances.js`, `src/scenes/wardrobeCounter.js`, `src/ui/wardrobe/wardrobeWindow.js`,
> `src/ui/wardrobe/wardrobePreview.js`, `src/ui/collections/appearancesPart.js`) and the pins are what runs. Not a DFU
> member: Daggerfall Unity has no transmog (Port-Ledger section A, APPEARANCES and APPEARANCES-II).
>
> APPEARANCES-II (2026-10-27, the same feedback and the same autonomy) finished the four things the first slice left
> undone: a sworn one's kit carries its look (section 6), Diverse Weapons draws the look and the classic Info box says it
> (section 5), and the window previews a look before it is paid (section 4).

## 1. What was asked

A player, passed on by the owner (2026-10-26), the feedback that started this set of slices:

> *"The horizontal MMO approach was working really well imo, but now that bounties, professions, and sailing have sort
> of been worked on and pushed aside, the game has gone in the direction of a theme park MMO. ... I would hate hate hate
> to see go down the path of Retail WoW, with stupid expansions that constantly overwrite your gear every single patch
> keeping you on a tread mill. Add more horizontal progression please!"*

The owner: *"build all of it with autonomy and be as detailed as possible. No exceptions and no band aids."* Research
found no way to change how armour or a weapon looks: a player kept a piece for its numbers and wore its look whether
they liked it or not. Looks a character collects and chooses are a sideways progression - nothing in them is stronger.
The decisions below were made under that autonomy.

## 2. What a look is (`src/net/appearanceLaw.js`)

A look is what a piece is drawn as: its template, its material and its style (DFU's variant). Every renderer draws a
piece from those three - the doll's record (`ui/paperDoll.js` paperdollItemImage: the template's record, SetVariant's
clamp, the metal's dye), the Morrowind map (`formats/morrowind/mwItemMap.js` dfWornArmor, `mwFirstPerson.js`
dfWeaponToMw: the template and the material), Layered Gearing's strip (`player/eyeOfTheBeholder/layeredArmor.js`
pieceCode: the family and the metal) and the first-person sheet (`combat/fpsWeapon.js`: the type and the metal). Two
pieces drawn alike are one look: Chain2 draws as chain, and a style past its material's clamp is the style it draws.

**The catalogue** (`ALL_LOOKS`) is every look there is: each of DFU's armour, shield and weapon templates (102-130, no
arrow), in leather, chain and the ten plates (armour) or the ten metals (weapons), in every style the clamp draws - a
plate cuirass three, a helm six in any metal, a shield one. 474 in all. A look's key is `t.m.v`.

**The kinds.** A piece takes a look of its own kind only, and the kind is read off what the renderers draw:

| Kind | Templates | Why one kind |
| --- | --- | --- |
| an armour slot (head, right arm, left arm, chest, hands, legs, feet) | 102-108, and Roleplay & Realism's pieces by their slot | one equip slot: one doll layer, one Morrowind part, one Layered strip |
| shield | 109-112 | all four are a shield in the left hand |
| dagger | 113 | the classic Dagger sheet |
| short blade | 114, 116, 117 | the LongBlade sheet, Morrowind's ShortBladeOneHand, either hand |
| long blade | 118-121 | the LongBlade sheet, LongBladeOneHand, either hand |
| two-handed blade | 122, 123 | the LongBlade sheet, LongBladeTwoHand, both hands |
| one-handed axe | 127 (and the Archer's Axe) | Battleaxe, AxeOneHand, either hand |
| two-handed axe | 128 | Battleaxe, AxeTwoHand, both hands |
| mace, flail, warhammer, staff | 124, 125, 126, 115 | each its own sheet and group |
| bow | 129, 130 | the Bow sheet and group |

A weapon's kind is its classic sheet, its Morrowind group and its hands together, so a look never changes a swing: the
sheet's frames, the Morrowind animation and the doll's either-hand record are the piece's own. The table is pinned
against the live functions both ways (`test/systems/appearances.test.js`).

**Not looks.** An artifact's own record and a Gilded piece's gold are their own art: they are not collected (they can
wear a look, drawn plain). The guns draw one picture whatever their metal, so they neither give nor take one. Roleplay &
Realism's fourteen templates are drawn only while that mod is on, so they are never looks; its pieces still take a
classic look of their kind (a Jerkin a cuirass's).

## 3. How a look is had (`src/systems/appearances.js`)

Every armour piece, shield and weapon the character holds adds its look: the pack, the wagon and the Materials Bag are
swept once a frame from the HUD's one call (`ui/hud/hud.js` drawHud - every host makes it, on every skin) and when the
Wardrobe opens. A record is read once until its template or metal changes; the list is replaced, never pushed to, and
kept in the catalogue's order. It is the character's, in the save (`entity.appearances`, an `ENTITY_FIELDS` row of
`systems/save/save.js`); a save from before restores none, and the first frame collects what the pack holds.

Buying, finding, crafting, a quest's reward, a trade - every way a piece reaches the character collects its look, since
the sweep reads the lists and not the doors (ACQUIRE1's law, `systems/acquireWatch.js`). Loot armour is always style 1
(DFU's CreateRandomArmor takes no variant roll); a shop's armour rolls its style (`systems/shopStock.js`
randomizeArmorVariant), so the other styles are bought.

The collection is cosmetic, so the client's word is enough. Nothing rides the account service and nothing is paid from
it: there is nothing to close, and no migration (0181 was not needed).

## 4. The Wardrobe at the counter

A Clothing Store's, an Armorer's and a Weaponsmith's keeper put a **Wardrobe** row on their popup - DFU's own shops,
the tailor and the two smiths. Any of the three re-dresses any worn piece, as DFU's repair shops mend any piece.

- **The classic popups** (`ui/merchant/merchantServiceWindow.js`, `merchantRepairWindow.js`): DFU's art has no room,
  so the row is the port's own, drawn under the art in the parchment's dark, the Portal Stone's law (PORTAL1). The rows
  stack (`shopRowRect`): the Portal Stone's first, the Wardrobe's 12 px under it; its key is W. THE NATIVE-WINDOW RULE:
  the art and DFU's four rects are unchanged; the row is a port element and cites this page.
- **Enhanced Plus** (`merchantServiceDoor.js`, `merchantRepairDoor.js`): a press above the Portal Stone's (which stays
  above Exit), its picture the clothing glyph.
- **The host** (`scenes/worldModes.js`): one construction (`scenes/shopRows.js` createShopRows) and one spread of its
  rows into each popup, in a building and nowhere else. The Portal Stone's row and counter moved there with the
  Wardrobe's, so the host is 7 logical lines shorter (11,025 -> 11,018, its ceiling lowered with it); the Wardrobe's
  counter, window and acts live in `scenes/wardrobeCounter.js`.

**The window** (`ui/wardrobe/wardrobeWindow.js`, its door `wardrobeDoor.js`) is the port's own, in the Reforge's shape
and the Broker's classes, so both skins dress it: the Plus sheet carries its rules (`enhancedPlusStyle.js`
WARDROBE_CSS), the classic skin lays the Broker's sheet and them. The worn pieces that can take a look stand in a list,
each with what it looks like now; the one picked shows its own look first (Free, Worn while it wears no other) and every
collected look of its kind with its fee and a Wear press. A short purse says how much more; pressed, a refused press
says why and takes nothing. The last word sits in a live region; Escape and a tap outside close it; the keyboard starts
on the piece picked and keeps its place across a press (`ui/domRepaint.js` repaintKeepingScroll).

**The preview** (APPEARANCES-II). A look's picture and name in the card are one press, **Try**, that shows the
character wearing that look on the piece picked, in the preview at the card's head. Nothing is changed or paid until
Wear lands. The window opens on what the piece wears, and shows what is worn again when another piece is picked or a
press lands. The figure is the one the pack shows on this skin (`ui/wardrobe/wardrobePreview.js`): the Morrowind body on
Enhanced Plus where one stands for the player, else the paper doll (`ui/paperDoll.js` composeDollFor - the inventory's
own art, its composite and click mask untouched). Both draw a stand-in (`systems/appearances.js` previewWearer) that
reads as the character and holds a copy of the piece in the look, so it reaches the figure through drawnPiece. No art,
no preview; a body that cannot be built shows the doll.

**The preview's body** is a rig of the preview's own, built off the stand-in as the player's is (`combat/weapon/
weaponRig.js` armBuildOptsOf), drawn with the renderer the player's arm was last bound to (armRenderer, set where every
host's weapon rig attaches the arm) and unloaded when the window shuts. One build at a time, the newest asked last: a look
passed over while one builds is never built. A figure is kept per look and per worn table (the last 8), so a Wear on
another piece is in every later figure.

**The fee** is a twentieth of what a piece of the look is minted at (`itemBaseValue`), at least 25 gold: an Iron look
is 25, an Ebony longsword's 288, a Daedric cuirass's 7,680. The piece's own look back costs nothing. A look stays on the
piece taken off and worn again; it is the WEARER's mark, so a piece handed over arrives in its own look (below).

## 5. Every renderer reads it

`drawnPiece(item)` is the piece as it is drawn: the piece itself, or - wearing a look - one copy of it in the look's
template, material and style, its dye left to the metal, an artifact's record and a Gilded piece's gold dropped, its
enchantments kept. One copy a piece and look, made again when its slot or the look changes: the Weapon Widget's clone
compares its weapon by identity, and a new copy every frame would reset a swing. It is never handed to a number.

| Renderer | Where it reads the look |
| --- | --- |
| The paperdoll - the player's, a peer's doll billboard, the profile card's | `ui/paperDoll.js` paperdollItemImage |
| The Morrowind body and arms - worn armour and shields | `formats/morrowind/mwItemMap.js` dfWornArmor |
| The Morrowind arms and body - the weapon in hand, the off hand, a sheath, the glow's weapon | `combat/fpArm.js` (build, setWeapon, setOffWeapon, setWeaponGlow, setOffWeaponGlow) |
| Layered Gearing - my body and every peer walker | `player/eyeOfTheBeholder/layeredArmor.js` pieceCode |
| The classic first-person sheet (Diverse Weapons' per-template art too - the copy is no artifact, APPEARANCES-II) | `combat/weapon/weaponRig.js` artFor, `combat/diverseWeapons/diverseWeapons.js` moddedWeaponFilename |
| The Weapon Widget's clone | `combat/weapon/weaponRig.js` cloneFrame |
| The Morrowind head portrait's helm | `characters/headPortraits.js` playerHeadKey |

**Diverse Weapons draws the look** (APPEARANCES-II). Under the mod a weapon swings its template's own sheet, and an
artifact its own by its enchantment (`combat/diverseWeapons/diverseWeapons.js` moddedWeaponFilename,
WeaponBasics.GetModdedWeaponFilename). drawnPiece's copy kept the artifact's enchantments for its glow, so an artifact
wearing a look swung its own art - or the classic sheet, for a look of another template. The copy is no artifact now
(`net/appearanceLaw.js` isLookCopy): it swings the look's file, `<NAME>MAGIC` while the piece is enchanted and the plain
one while its element shows, as the classic sheet does with the mod off. The doll asks the mod's picture in the look's
metal (`ui/paperDoll.js` composeDoll reads the drawn piece's dye): asked in the piece's own, a Steel longsword dressed as
an Ebony Katana drew the mod's katana in steel. A departure from GetModdedWeaponFilename for a drawn copy (Port-Ledger
section A, APPEARANCES-II).

**Decided and said:** the pack's pictures (the grid, the worn panel, the hotbar, a hand's plaque) stay the piece's own -
they say what the piece is, and the body says what it looks like. A weapon's glow is the piece's enchantment and is laid
on the look. Sounds (the draw, a swing, a footstep) stay the piece's. The profile card names the pieces as they are.

**The Info box says the look** a piece wears ("Looks like Ebony Katana", `systems/appearances.js` lookLine), as the
Wardrobe's list does: on Enhanced Plus as a box of its own (`ui/enhanced/enhancedInventory.js` itemInfoBoxes), and -
APPEARANCES-II - on the classic skin as the record's last line, in the record's alignment (`ui/native/nativeInventory.js`
_info). The classic popup shows its boxes one click at a time, so a box of its own would hide the line behind a click.
The little panel beside the classic doll keeps the record alone (its four half-height rows).

## 6. Online

A look's item carries `ap` - `[t, m, v]` - beside the piece's own six fields when the piece wears a look
(`net/remotePlayers.js` composeLook), OMITTED when it does not, so every look without one keeps the bytes it had
(`class`'s law). The relay keeps `ap` only when it is a look there is and of the piece's kind (`net/wire.js`
validLookItem, through `appearanceLaw.js` validWireAppearance), so no client can show a dagger as a claymore. The
peer's stand-in wears it as its own field (`peerStubEntity`), and every renderer above draws it; the look's cache key
counts it (`lookKey`), so a peer re-dressed is drawn again, and a look without one keeps its key.

The piece's own fields never change on the wire: the siege's and the royal tourney's referee (`net/siege/siegeRef.js`
siegeHeld) still finds the weapon a blow claims.

**A sworn one's kit** (APPEARANCES-II). A piece given to a sworn revenant keeps the look it was dressed in (it is the
player's own object, `systems/revenant/revenantGear.js`), and the owner's screen drew it so (composeLook's `ap`). Its foe
record's kit carried no look, so every other screen drew the piece in its own. The record now carries `la` beside `lw`:
each entry is a piece's index in `lw` and its look's `[t, m, v]` (`characters/foeBodies.js` foeWireLook, decodeWorn),
OMITTED when no piece wears a look, so a kit without one keeps its bytes. A puppet still building, an heir and the
body's cache key all carry it.

**A field of its own**, not three more numbers on a piece: a reader from before it drops `la` and stands the pieces in
their own looks, where a longer piece would have refused the whole record. The wire keeps a look only of its piece's
kind (`net/wire.js` validFoeRecord, through validWireAppearance); any other is dropped and its piece stands in its own.

**The relay changes: RELAY_VERSION is `world270`** (the graph's hash moves - `net/wire.js` and
`net/appearanceLaw.js`, which joins the bundle with `systems/armorMaterials.js`). Either may deploy first: a relay
before it drops `ap`, and the piece is seen in its own look. APPEARANCES-II: the relay forwards a foe frame unread
(validFoeRecord is the door each reader runs), but `net/wire.js` and `net/appearanceLaw.js` are in its bundle, so the
bundle moves again - its version is named at the merge, as the slice was told (`test/net/relayversion.test.js` SLAM8 is
red on the branch for that alone).

## 7. The service

The account service pays nothing here and keeps nothing new. Its bundle changes all the same: `appearance` is a
declared item field (`systems/item/itemFields.js`, `{ t, m, v }`, a look there is), so the realm's judge reads a
forged shape as a finding as it reads any field's; and it is a RECEIVER's mark (`net/realm/realmTradeLaw.js`
RECEIVER_MARKS), stripped by the wire's clamp (`systems/loot/loot.js` validLootItem), a realm trade's record and a wild
death's - so a trade's offer and its checkpoint agree on a piece that wears a look (MARK-WIRE's lesson). **The account
worker's bundle moves: ACCOUNT_VERSION is `acct200`**, and `src/net/appearanceLaw.js` is listed in
`account-deploy.yml`'s paths. APPEARANCES-II changes `appearanceLaw.js` (drawnPiece's copies are marked, isLookCopy)
and `net/wire.js` (validFoeRecord's `la`), both in the worker's bundle, so it moves again; the service reads nothing new
and pays nothing.

## 8. Collections - the Appearances part

`10-UI/Collections.md` section 9: a tile after the account's four, every character's, its count the character's looks
over the 474 and the kit's meter; the part opens on what is held, by kind, each kind under its divider with its count
and meter; Not held and All list the rest dimmed; a row opened says how the look is had and where it is worn for its fee.

## 9. The four hosts

`scenes/worldModes.js` WIRED - its interiors are the streaming world's (`scenes/world.js`) and the fixed city's
(`scenes/exterior.js`), and both build it. `scenes/dungeonContext.js` stands no shop and no keeper: no Wardrobe there,
as `scenes/wardrobeCounter.js`'s header says. The collection's sweep and every renderer are the hosts' shared modules
(the HUD's one call, the doll, the rigs), so all four draw a look and collect one.

APPEARANCES-II's seams, host by host. The kit's look rides the foe pool of the street and of a building
(`scenes/exteriorFoes.js`, one factory): `scenes/world.js` WIRED (its companion layer, `scenes/crewAshore.js`, stands a
sworn one in its streets) and `scenes/worldModes.js` WIRED (its interiors' pool). `scenes/exterior.js` stands no sworn
one - FLAGGED, as REVENANT-COMPANION is. `scenes/dungeonContext.js` FLAGGED: its own lane carries no kit (section 11).
Diverse Weapons' sheet, the doll's ask and the classic Info box live in shared modules every host's weapon rig and pack
read, so all four have them. The preview is the Wardrobe's, which only `scenes/worldModes.js` builds; its body draws with
the renderer every host's weapon rig binds the arm to. No host gains a line.

## 10. Pins

- `test/systems/appearances.test.js` - the kinds against the renderers' functions both ways, the catalogue, a piece's
  look off the producers' own pieces (an artifact by `createArtifact`, a Gilded piece by `mintGilded`), the sweep and the
  save, a look worn and drawn, that no number moves for any look of any kind, the Wardrobe's acts and fee, the words,
  the field and the mark.
- `test/net/appearances_wire.test.js` - `ap` said and kept, a stand-in drawn, the key, the referee.
- `test/ui/appearances_render.test.js` - the doll, the Morrowind body, Layered Gearing, the arms on the fixture rig, the
  sheet, the clone and the helm.
- `test/ui/wardrobe_window.test.js` - the rows on both popups, the counter and the host's wiring, the window driven.
- `test/ui/appearances_part.test.js` - the Collections part.
- Mutants: `tools/mutants/appearances.json`.

APPEARANCES-II's pins:

- `test/net/appearances2_kit.test.js` - a sworn one's gift in a look through the street pool's own puppet path: the
  owner's body, `la` beside six-number pieces, the copy drawn through drawnPiece, the twin swapped in, a puppet still
  building, the heir, and the wire's law.
- `test/ui/appearances2_render.test.js` - Diverse Weapons' sheet of a drawn copy (an artifact's, another template's, a
  plain piece's), the doll's ask in the look's metal, the classic Info box in both alignments, the Plus pack's words.
- `test/ui/appearances2_preview.test.js` - the stand-in, the doll tried on over a synthetic art set (the inventory's
  composite untouched), the preview's skins, memo, art and shutting, the body built on the fixture rig one at a time
  with its renderer, and the window's Try, Wear and pieces driven.
- Mutants: `tools/mutants/appearances2.json` (40, all dead).

**PIN MOVED (APPEARANCES):** `test/systems/auditcards5_ui.test.js` and `test/ui/collections2.test.js` - the
Collections page's parts list the looks' part; `test/systems/weaponglow1.test.js` - the rig's art reads the held piece
(`held`) and the clone's metal the look's; `test/net/realm4.test.js`, `test/systems/auditrealm2_service.test.js` and
`test/systems/fb1009b_markwire.test.js` - the receiver's marks and the realm's volatile fields name `appearance`; `test/systems/portal1_stone.test.js` - the Portal
Stone's row is built in `scenes/shopRows.js`, and its Enhanced press stands under the Wardrobe's;
`test/scenes/hostceiling.test.js` - `worldModes.js` seven logical lines shorter. Re-aimed by content: `auditcards5.json`, `collections2.json`,
`fb1009b_markwire.json`, `fb1016b_stolengoods.json`, `steed1.json`, `wagons2_visit.json`.

**PIN MOVED (APPEARANCES-II):** `test/systems/dw3_icons.test.js` - the doll's import ask reads the piece as it is drawn
(`itemDyeColor(drawnPiece(it))`); `test/ui/wardrobe_window.test.js` - the window's words are 27 (the preview's two, a
look's Try and its own look's). Re-aimed by content, all dead: `auditmwnpc2.json` (the pending build's look, the heir's
kit) and `watch1.json` (a pending build's species) - the kit's merge and the heir's read moved.

## 11. Not done, named

- A sworn one's kit underground. A dungeon's own lane streams no kit at all: a peer's copy of my sworn one there wears
  its own roll (`Morrowind-NPCs.md` section 23, THE DUNGEON'S LAW), so neither a given piece nor its look reaches
  another screen in a dungeon. The kit's crossing is RVN-GEAR's to build (`06-Systems/Revenants.md` section 40); its
  look would ride with it as `la`.
