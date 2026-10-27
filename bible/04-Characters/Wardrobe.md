# The Wardrobe - a piece's look, collected and chosen (APPEARANCES, 2026-10-27)

> Design page and record. Where the page and the code disagree, the code's own headers (`src/net/appearanceLaw.js`,
> `src/systems/appearances.js`, `src/scenes/wardrobeCounter.js`, `src/ui/wardrobe/wardrobeWindow.js`,
> `src/ui/collections/appearancesPart.js`) and the pins are what runs. Not a DFU member: Daggerfall Unity has no
> transmog (Port-Ledger section A, APPEARANCES).

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
| The classic first-person sheet (Diverse Weapons' per-template art too) | `combat/weapon/weaponRig.js` artFor |
| The Weapon Widget's clone | `combat/weapon/weaponRig.js` cloneFrame |
| The Morrowind head portrait's helm | `characters/headPortraits.js` playerHeadKey |

**Decided and said:** the pack's pictures (the grid, the worn panel, the hotbar, a hand's plaque) stay the piece's own -
they say what the piece is, and the body says what it looks like; the Enhanced Plus pack's Info box says the look a piece
wears ("Looks like Ebony Katana", `systems/appearances.js` lookLine), as the Wardrobe's list does. A weapon's glow is the piece's enchantment and is laid
on the look. Sounds (the draw, a swing, a footstep) stay the piece's. The profile card names the pieces as they are.

## 6. Online

A look's item carries `ap` - `[t, m, v]` - beside the piece's own six fields when the piece wears a look
(`net/remotePlayers.js` composeLook), OMITTED when it does not, so every look without one keeps the bytes it had
(`class`'s law). The relay keeps `ap` only when it is a look there is and of the piece's kind (`net/wire.js`
validLookItem, through `appearanceLaw.js` validWireAppearance), so no client can show a dagger as a claymore. The
peer's stand-in wears it as its own field (`peerStubEntity`), and every renderer above draws it; the look's cache key
counts it (`lookKey`), so a peer re-dressed is drawn again, and a look without one keeps its key.

The piece's own fields never change on the wire: the siege's and the royal tourney's referee (`net/siege/siegeRef.js`
siegeHeld) still finds the weapon a blow claims.

**The relay changes: RELAY_VERSION must be bumped at the merge** (the graph's hash moves - `net/wire.js` and
`net/appearanceLaw.js`, which joins the bundle with `systems/armorMaterials.js`). Either may deploy first: a relay
before it drops `ap`, and the piece is seen in its own look.

## 7. The service

The account service pays nothing here and keeps nothing new. Its bundle changes all the same: `appearance` is a
declared item field (`systems/item/itemFields.js`, `{ t, m, v }`, a look there is), so the realm's judge reads a
forged shape as a finding as it reads any field's; and it is a RECEIVER's mark (`net/realm/realmTradeLaw.js`
RECEIVER_MARKS), stripped by the wire's clamp (`systems/loot/loot.js` validLootItem), a realm trade's record and a wild
death's - so a trade's offer and its checkpoint agree on a piece that wears a look (MARK-WIRE's lesson). **The account
worker's bundle moves: ACCOUNT_VERSION must be bumped at the merge**, and `src/net/appearanceLaw.js` is listed in
`account-deploy.yml`'s paths.

## 8. Collections - the Appearances part

`10-UI/Collections.md` section 9: a tile after the account's four, every character's, its count the character's looks
over the 474 and the kit's meter; the part opens on what is held, by kind, each kind under its divider with its count
and meter; Not held and All list the rest dimmed; a row opened says how the look is had and where it is worn for its fee.

## 9. The four hosts

`scenes/worldModes.js` WIRED - its interiors are the streaming world's (`scenes/world.js`) and the fixed city's
(`scenes/exterior.js`), and both build it. `scenes/dungeonContext.js` stands no shop and no keeper: no Wardrobe there,
as `scenes/wardrobeCounter.js`'s header says. The collection's sweep and every renderer are the hosts' shared modules
(the HUD's one call, the doll, the rigs), so all four draw a look and collect one.

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

**PIN MOVED (APPEARANCES):** `test/systems/auditcards5_ui.test.js` and `test/ui/collections2.test.js` - the
Collections page's parts list the looks' part; `test/systems/weaponglow1.test.js` - the rig's art reads the held piece
(`held`) and the clone's metal the look's; `test/net/realm4.test.js`, `test/systems/auditrealm2_service.test.js` and
`test/systems/fb1009b_markwire.test.js` - the receiver's marks and the realm's volatile fields name `appearance`; `test/systems/portal1_stone.test.js` - the Portal
Stone's row is built in `scenes/shopRows.js`, and its Enhanced press stands under the Wardrobe's;
`test/scenes/hostceiling.test.js` - `worldModes.js` seven logical lines shorter. Re-aimed by content: `auditcards5.json`, `collections2.json`,
`fb1009b_markwire.json`, `fb1016b_stolengoods.json`, `steed1.json`, `wagons2_visit.json`.

## 11. Not done, named

- A sworn revenant handed a piece wearing a look draws it on my screen and in its own look on others' (a foe's kit on
  the wire, `characters/foeBodies.js` encodeWorn, carries no `ap`).
- Diverse Weapons draws an artifact's own first-person art by the artifact's enchantment, so an artifact wearing a look
  of its own template still swings its art under that mod.
- No preview in the round before paying: the window shows each look's picture, not the body wearing it.
- The new words are English until the catalog is extracted and drafted after the merge.
