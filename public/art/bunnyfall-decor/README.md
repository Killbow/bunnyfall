# Bunnyfall decor - the launcher's and the site's trinkets

One folder, two readers: the website's front page (`index.html`, `landing.css`) loads these from `/art/bunnyfall-decor/`,
and the desktop launcher (`app/launcher/`) loads them as `art/<file>`. The shell serves this folder from the source tree
when it runs unpacked and packs it beside the launcher's page as `launcher/art` (`app/package.json` build.files,
`app/main.cjs` LAUNCHER_ART).

| file | what | from |
| --- | --- | --- |
| `bunny-wave.gif`, `bunny-cheer.png` | the Bunnyfall rabbit, waving (launcher, once Play is ready) and still (launcher while waiting; the site) | the project's own art |
| `play.gif`, `play-still.png` | the PLAY badge, and its first frame | the project's own art |
| `wood.png` | one plank of wood, 320x38, that tiles left to right; shown at 2x, pixelated | drawn for Bunnyfall (generated pixel art) |
| `chest-icon.png`, `letter-icon.png`, `coins-icon.png`, `house-icon.png`, `ship-icon.png` | the bank screen's icons, the parchment around them cleared | GrimoireUI `Img/BANK00I0.IMG.png` |
| `seal-red.png`, `seal-green.png` | the options screen's wax seals, cut out by their colour | GrimoireUI `Img/OPTN00I0.IMG.png` |
| `spellbook.png`, `scroll.png`, `chest.png` | the spellbook, a loot scroll, the dial chest | GrimoireUI (`grimoire-ui/spellbook.png`, `grimoire-loot-parchment.png`, `grimoire-dial-chest.png`) |
| `sparkle-gold.png`, `sparkle-red.png`, `heart.png`, `feather.png`, `key.png` | 16x16 cells of the spell icon sheet | `public/art/spell-icons/pack.png` |
| `argent.png`, `dusk-token.png` | the currency | `public/art/bunnyfall-currency/` |

GrimoireUI is by LordSquacquerone (credited in `src/ui/credits.js` and on the site's front page).
