# FIELD BUGS 2026-10-26b - "First time XP bonus from the Loom still isn't working"

One thread from the Discord's #feature-feedback, handed over by the owner as a phone screenshot. Read on main's
`d5a4c9c6a`, reproduced through the real book (`net/profBook.js`) against the real Worker (`test/accountDb.mjs`).

| | Report | What it was | Done |
|---|---|---|---|
| 1 | fogs: "We now have the ability to weave our own linen bolts (finally!) but I'm still not receiving the first time XP bonus when crafting clothing as if I had not woven the linen bolts myself. I have not bought any linen bolt using silver or gold". The screenshot: the Linen Champion Straps' box, "20 Outfitting experience, and 511 more the first time you make this piece at this grade from cloth you wove or spun yourself", and under it "You made a Fine Champion Straps (+20 Outfitting experience. Your first, but only cloth you wove or spun yourself earns the first-time bonus)" | The law as built, said wrong. Root Tendrils the service never counted (looted, or bought at a shop for gold - 2 gold in Daggerfall) wove into LOOSE Linen, and AUDIT 32 S1 walled loose cloth from its first. The box read the Stores alone, so it promised the 511 for bolts the loom had carried out to the bag; the craft put one back in loose and paid none, and its word blamed cloth fogs had in fact woven. The owner, asked: **"Woven cloth pays"** | WOVEN-PAYS |

## WOVEN-PAYS - `src/net/recipeLaw.js`, `src/net/bagLaw.js`, `server-account/src/professions.js`, `src/net/profBook.js`, `src/ui/professions/profPages.js`, `src/ui/craftXpWords.js`

WHAT DFU DOES. Nothing to follow: Daggerfall weaves nothing and has no first-make bonus (`06-Systems/Professions-Arc.md`
3.2, section 50 - the loom and its cloth are CLOTH-GEMS', a Ledger A row).

WHAT THE PORT DID. CLOTH-GEMS (2026-10-25) judged AUDIT 32 S1 by the units: a piece made wholly of Linen or Wool paid its
first-make share only where no unit it spent was bought OR LOOSE (`professions.js` craftAtAnvil's `p` over the Stores'
`loose` and `bought`). A loose unit is what a station's put-in brought that the service never counted (`bagLaw.js`
LOOSE_ORIGIN): a looted herb, one bought at a shop for gold, a friend's. A weave of loose Root Tendrils makes loose
Linen (`smeltAtForge`, `smeltOrigin`'s law), and the loom carries its bolts out to the bag (`profBook.js` smelt's
`carryOut`) - where a withdrawal gives loose units back uncounted. Measured: six uncounted Root Tendrils in the pack, a
weave of three, the bolts in the bag and none counted; the Straps' box (`profPages.js` ownSpend, which read the Stores'
bought and loose and the bought carried) said the 511; the craft's put-in moved one bolt in loose, and the service paid
+20, `firstPaid` false. Every craft of every pattern the same, the box unmoved after - the screenshot. A craft of the
character's own woven cloth (Root Tendrils gathered, counted) paid, and still does.

THE OWNER'S DECISION, asked (the cost said with the question: Outfitting's 152 cloth first-makes become buyable for
about 600 gold of shop Root Tendrils): **"Woven cloth pays"** - any cloth the character wove or spun pays its first,
whatever its goods; only cloth bought with silver stays walled.

FIXED.
- THE WALL IS SILVER. A judged recipe's first pays wherever no unit BOUGHT WITH SILVER is spent - the Stores' `bought`:
  the Weavers' counter, the furnisher's, the Drakes market (`recipeLaw.js` firstCraftPays's `own`). A station spends an
  input's loose units first, then its bought, then its own (`bagLaw.js` STATION_ORIGINS), so a bought unit is spent only
  where one is held and the loose do not cover the craft's units: the decision's `boughtSpent`. A bought bolt beside a
  loose one is not spent by the one-bolt Straps (they pay) and is by the two-bolt Breeches (they do not).
- A PATTERN IS MADE BY THE CRAFT THAT LAID ITS FIRST ON. A craft of silver-bought cloth lays none on and takes nothing:
  the next craft of that pattern that can pay, pays (`patternMade`, `prof_crafts.first_paid`, migration
  `0176_first_paid.sql`). Without it fogs's every pattern already sewn of loose cloth stayed spent, its share never paid;
  and every cloth pattern sewn of the Weavers' cloth before CLOTH-GEMS (when no judged first could pay) was spent the same
  way. A row from before the column made its pattern where it was the first and its XP holds the share - the least share
  is 500 (`FIRST_MAKE_FLOOR`) and no judged craft's own XP reaches it at any rank under every star of the Firmament
  (pinned). Every other recipe's pattern is made by any craft of it, as before. The most first-make XP a track can earn
  is unchanged: each key pays once.
- THE BOX READS WHAT THE PRESS WOULD SPEND. `bagLaw.js` stationSpend: the shortfall put in first from what is carried
  (the count cut to what the pack holds, its bought then its own, then the pack's uncounted units as loose - the
  `work` put-in's own order), then the Stores loose first. `profBook.js` spendOf asks it of the book's Stores and count;
  `profPages.js` ownSpend asks it of every input (a book without spendOf - the tests' - the law over its Stores and count).
- THE ANSWER SAYS WHAT THE DECISION DID: `firstPaid` off `first_paid` (a row from before it read off its piece, as
  CLOTH-GEMS read it).

NOT CHANGED - THE DISENCHANT. A piece wholly of cloth gives its Enchanting XP only where its cloth was the maker's own
and it was never sold (`alchemyLaw.js` disenchantXp's `own`, `products.bought_with` none) - loose cloth gives none, as
before. Its XP comes again with every piece, so the owner's answer for a first-make (one a pattern, bounded) does not
carry to it: loose cloth of shop-bought Root Tendrils would buy Enchanting with gold, AUDIT PROF12 E2's exploit. Its line
said "its maker wove or spun that cloth", which fogs's loose cloth was; it says "woven or spun from goods you gathered"
now. The owner's call if it should follow.

KNOWN, AND THE OWNER'S CALL. Loose is the pack's word: a bolt traded from a friend, or withdrawn before BAG1, goes in
loose and pays too - so the Weavers' bolts reach a first through a second character and a trade. Telling them apart
from the loom's own would need the carried count to keep a fourth origin.

THE FOUR HOSTS. The station pages are `scenes/world.js`'s (setProfessionsPages - unchanged wiring; the craft's word
through `craftXpText`, one call); `worldModes.js`, `exterior.js` and `dungeonContext.js` build no station page and no
craft word. HOST-SPLIT: no host grew.

THE WORDS. Five keys moved in English and redrafted in all 25 languages: the box's `prof.page.craft.xpFirstOwn` ("from
cloth not bought with silver") and `prof.page.craft.xpBought` ("This would use cloth bought with silver, which earns no
first-time bonus."), the craft's `prof.craft.xpFirstBought` ("Cloth bought with silver earns no first-time bonus, so
this piece's is still yours to earn"), the Outfitting how-to's `prof.page.how.outfitting` and the disenchant's
`prof.page.enchant.cloth`.

THE SERVICE. ACCOUNT_VERSION acct195, migration 0176 (a column, NULL for every row before it). No relay change.

PINS: `test/net/fb1026b_wovenpays.test.js` (6: the law twice, the report through the real book and Worker, the silver
wall, the pattern made by the craft that paid, the rows from before the column). PIN MOVED: `clothgems_service` (a
pack's loose cloth pays; the rows' `first_paid`), `clothgems_client` (ownSpend's loose and its put-in; the words),
`fb1015f_firstcraft` (the words; the Weavers' Straps' second still owes its first), `prof12_client` (the disenchant's
line), `fb1018d_crafthowto` (the how-to). Mutants `tools/mutants/fb1026b_wovenpays.json` (10, all dead).
`clothgems.json`: CLOTHGEMS-svc-loose-pays and CLOTHGEMS-pages-loose-unread retired (the law they killed is the owner's
no longer - WOVEN-PAYS-svc-loose-walled-again is the first's inverse), five records re-aimed by content and
CLOTHGEMS-svc-answer-by-recipe's tests widened to the new pins;
`audit32.json`'s two S1 records, `prof3.json`'s PROF3-svc-no-first-bonus and `fb1018d_crafthowto.json`'s
CRAFT-HOWTO-outfitting-dropped re-aimed by content.
