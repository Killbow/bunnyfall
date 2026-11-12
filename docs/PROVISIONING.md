# Provisioning: the pot and the cauldron

Status: design, waiting on the owner's approval. Nothing here is built yet.

Provisioning leaves the crafting system (docs/CRAFTING.md) and becomes its own system: its own line on the Crafting rail,
its own rules, its own minigame. The only things kept are the skill (Provisioning, rank 1 to 100) and every character's
rank and XP in it. It is no longer a Focus choice.

## Decisions taken

- One skill, Provisioning 1 to 100, for cooking and alchemy both.
- Players keep their current Provisioning rank and XP.
- Not a Focus craft. Focus is chosen from Smithing, Carpentry, Outfitting and Enchanting.
- Its own line on the Crafting rail, after Stores.
- Cooking grows both ways: plants double as kitchen herbs and spices, and new food items are added.

## The idea in one paragraph

Every ingredient carries two or three traits. You put ingredients in a pot (food) or a cauldron (alchemy) and the result
keeps every trait that at least two of them share. Traits start hidden; you learn them by tasting an ingredient, by
making something with it, or as your rank rises. Your recipe book keeps every combination you have found, and you can
make one again with a single press. What you make is never chosen from a list: you find it.

## Ingredients

### Bases (alchemy)

Pure Water, Rain Water, Nectar, Ichor and Elixir Vitae appear in most of Daggerfall's potions. In the new system they
are bases, not trait carriers: every potion takes exactly one, and the base sets how strong and how long it is.

| Base | Strength | Duration |
|---|---|---|
| Rain Water | low | short |
| Pure Water | low | long |
| Nectar | medium | medium |
| Ichor | high | short |
| Elixir Vitae | high | long |

### Trait carriers (alchemy)

The 25 plants, 23 creature parts, the metals, Holy Relic, the teeth, Ivory and Pearl. Their traits are derived from
Daggerfall's 20 recipes (systems/potionRecipes.js): an ingredient carries the effect of each recipe it is in, up to
three, so every classic recipe still makes its classic potion. An ingredient in fewer than two recipes gets a second
trait chosen to open new combinations.

Alchemy traits are the potion effects the game already runs (effects.js): Healing, Stamina, Restore Power, Strength,
Resist Fire, Resist Frost, Resist Shock, Resist Poison, Cure Disease, Cure Poison, Free Action, Water Breathing, Water
Walking, Levitation, Slow Falling, Chameleon, Invisibility, Shadow Form.

### Food

Kitchen traits, each a buff the game can already apply (dish effects, survival needs.js):

| Trait | What it does |
|---|---|
| Hearty | Well Fed lasts longer |
| Refreshing | quenches thirst |
| Fortifying | + Endurance |
| Mighty | + Strength |
| Swift | + Agility |
| Clear | + Willpower |
| Keen | + Intelligence |
| Warming | resist cold (Climates & Calories' chill) |
| Cooling | resist heat |
| Restful | stamina lasts longer |

Sources:
- **The six foods today:** meat, fish, egg, mushroom, apple, orange.
- **Plants as herbs and spices:** each of the 25 plants also carries one kitchen trait (Pine Branch Warming, Aloe
  Cooling, Clover Restful...). A plant used in a pot is a herb; in a cauldron, an ingredient.
- **New food items**, each a real item with a Daggerfall icon:

| Item | From |
|---|---|
| Grain | Company farms, general stores |
| Flour | milled from Grain at a mill (Stations) |
| Milk | Company farms |
| Cheese | made from Milk at the pot |
| Honey | foraging (wild hives), general stores |
| Salt | mining, general stores |
| Game meats (venison, boar, bear...) | butchery by creature, in place of one plain meat |

- **Drinks**, made at the pot and quenching thirst: Ale (Grain and water), Mead (Honey and water), Tea (any herb and
  water). Each carries its ingredients' traits like a dish.

## Making something

1. Open Provisioning on the Crafting rail, at a fire (cooking) or an alchemy table (alchemy). Away from them you can
   browse your book and plan.
2. Put 2 ingredients in (rank 1), up to 3 at rank 40 and 4 at rank 75. Alchemy also takes one base.
3. The result's traits show as soon as they are known. An unknown trait shows as "?".
4. Play The Simmer, or skip it.
5. The service decides the result, names it from its traits ("Warming Hearty Stew", "Potion of Resist Fire and
   Healing") and adds it to your book.

Strength and duration come from the rank, the base (alchemy) and The Simmer. More traits in one result share the
strength: two traits each at full, three at 80%, four at 65%.

## The Simmer (the minigame)

The pot has a heat needle that drifts on its own, faster as rank rises. A band marks the right heat; it moves slowly.
You hold the heat (a key or a press) to raise it and let go to let it fall. Keeping the needle in the band fills the
pot's meter; the longer you stay in, the stronger the result, up to a quarter more. Boiling over or going cold costs
some. It lasts about twenty seconds. Skipping it gives the plain result.

## Spoilage (owner to decide)

Proposed: a dish keeps 7 game days in the pack and never spoils in the Stores; a potion never spoils. A spoiled dish
still fills hunger but gives no traits.

## Feasts

A pot of 4 ingredients made at a Company hall can be set on the hall's table. Everyone in the Company who eats from it
gets its traits. One feast a hall a day.

## XP

Each make pays by its ingredients' worth and its trait count, with no first-time bonus. Paced so Provisioning reaches
100 in about as many makes as a crafting skill reaches Master.

## Compatibility

- Every dish and potion players own stays as it is and works.
- The four dishes and twenty potions are in every book from the start, so nothing that can be made today is lost.
- Characters with Provisioning pledged as Focus get that place back.
- The old cooking and brewing pages are removed once the new page covers them.

## Phases

1. Ingredient traits and bases (shared law), the four dishes and twenty potions mapped onto them, a check script.
2. Service: make by ingredients, the book, discovery, XP; migration (Focus places freed).
3. The Provisioning page and The Simmer.
4. New food items, their sources, drinks.
5. Feasts. Spoilage if approved.
