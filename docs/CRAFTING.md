# Crafting rework

Design for the full crafting rework. Status: draft for review, Phase 1 data only. Branch: `crafting-rework`
(local commits, nothing pushed until approved).

## Why

The audit found these problems in the current system:

- 1,202 recipes, of which 808 are generated permutations (504 jewelry, 304 garments). About 170 distinct DFU items sit
  behind them.
- Progression is recipe-driven: XP is 20 x the recipe's tier, plus a per-recipe "first make" bonus.
- Materials barely affect quality. The roll depends on `rank - recipe rank`; materials only gate the tier and a few
  give a flat +1 step. The only decisions are "pick a recipe" and "have the ingredients".
- Two crafts past rank 50 is a hard XP wall. It generated a long history of confusion and patches.
- Cooking has 4 dishes (7 recipes) and shares a track with alchemy. Alchemy is DFU's 20 potions.
- Salvage, upgrades and the market are separate islands.

## Decisions

- Clean rank reset. Old items stay valid.
- Crafting is **form + materials**. One form per DFU template.
- The craft limit becomes an opt-in **Focus**.
- Cooking and Alchemy split into separate tracks, with a real consumables economy (heavy use, Company feasts).
- Progression stays per character. Gathering is never a crafting slot.

## Tracks

- Gathering (unchanged, free, unlimited): Mining, Logging, Herbalism, Hunting, Fishing.
- Crafting (6): Smithing (with jewelry), Building (carpentry and masonry), Outfitting, Alchemy, Cooking, Enchanting.
- Every character may take any craft to rank 100.
- **Focus**: a character pledges up to 2 crafts. Focus crafts level at full speed and unlock Mastery (rank 75+ perks and
  Masterwork). Other crafts level at half speed with no Mastery. Focus can be changed with a weekly cooldown.

## Forms and materials

- A **form** is a DFU template with **slots** (see `src/net/craft/forms.js`). Sizes, dyes and gems are options on the
  form, not separate recipes.
- Every material has four visible stats, 0 to 10: **Hardness, Toughness, Lightness, Affinity** (see
  `src/net/craft/materialStats.js`).
- The **primary slot** picks the DFU material, so combat numbers stay DFU's and old items stay valid. Other slots and the
  stats decide condition, weight, enchant points and quality.
- Each family reads the stats with its own weights (a weapon wants Hardness, armor wants Toughness, a bow wants
  Lightness). The weights are in `forms.js`.

- Slots that the old recipes always filled the same way (the flux in a weapon, the grip, a plate's lining, a haft, a
  bow's binder, arrowheads) are real choices now, from a group of materials (see `GROUPS` in `forms.js`). Each such slot
  has a tenth of the suitability; the main slot has the rest. Things with no stats yet (herbs, foods, stone, mortar,
  hides) stay fixed.
- The stats are strongly skewed inside a tier: a material is clearly good at some things and poor at others, so the
  choice always matters.

## Quality

- **Potential**: how well the chosen materials *suit* the form, compared with the best that material's tier could do.
  It is not raw power. A piece's base power already comes from its DFU material, so a perfect iron piece is as suitable
  as a perfect daedric one (and far weaker). Potential sets the quality ceiling and is shown before crafting.
- **Execution**: rank against the form's difficulty, plus the minigame.
- The result is the lower of the two. The five quality names stay.
- The bands from suitability to Potential are a draft (`POTENTIAL_BANDS`); tuning them is part of review.

## XP

- XP comes from the value of what is made, not from the recipe. No first-make bonus.
- The existing "a quarter for trivial work" rule stays. The 10% craft fee already works from value.

## Gathering and refining

- Gathering keeps its ranks and perks. Material tier gates stay, so gatherers stay necessary.
- Refining (smelt, cure, saw, cut) becomes open station work. The matching gathering track gives a yield bonus.

## Cooking and alchemy

- Potions become the main source of healing and mana and leave loot tables. A limited potion belt keeps demand up.
  Potency comes from herb properties.
- Cooking gets tiers 1 to 6 filled in. One active food buff at a time.
- Company feasts: a cook prepares a feast at the Company table and it buffs the Company members present.

## Old items and compatibility

- Old items keep their `recipe` id, quality and provenance. An adapter maps them to a form so salvage, temper and
  upgrade keep working.
- Open craft writs and the masonry/fort perks need explicit conversion.

## Phases

1. Material stats and form tables as pure data, no UI. (`src/net/craft/`, reviewed through `docs/CRAFTING-TABLES.md`.)
2. Server craft endpoint and migration (rank reset).
3. New crafting window, keeping the minigames.
4. Alchemy/cooking split and the consumables economy.
5. Remove the old recipe code.

## Open questions

- How stats turn into item values without breaking DFU's combat formulas (draft: primary slot picks the DFU material,
  stats move condition, weight and enchant points inside a bounded band).
- Gathered-material grades (purity) on top of tier are decided out of v1: they touch the Stores, the market and salvage.
  They can be added later as a Potential bonus.
- The bands that turn suitability into a quality name. See the Potential and Worked builds sections of
  `CRAFTING-TABLES.md`.
- Binder and flux have few real materials today (resin, tin, copper); the flux group borrows the other metals, and the
  binder group borrows linen and cured leather. Better binders could come with new gatherable materials.
- Stonework, dishes and potions have no stats yet.
