# Bunnyfall changelog

Newest first. One line a change, in plain words, for players. The desktop app's patch notes show the lines added since
the last release (scripts/changelogNotes.mjs).

## 2026-11-12

- Company farms: Captains and Officers can buy up to three of the world's farms inside their Company's or Charter's territory, for 6,000 gold each, from the new Farms page of the Company window. Each farm grows food, herbs, hides and wool, or timber, and puts its harvest into the Company Stores every day. Every member who does the day's chore while standing at the farm adds half again. Farms show on the world map in the Company's colours and are lost if the territory stops reaching them.
- Garrisons: a Company can keep up to 12 soldiers at its hall's town and a City Charter up to 60 at its capital, from the new Garrison page of the Company window. Captains and Officers recruit Spearmen, Crossbowmen, Knights, Battlemages and Healers with treasury gold. Soldiers eat food, ingots, planks or herbs from the Company Stores every day, and unfed soldiers desert. Put them on the city's patrol routes and you'll see them walking the streets in your colours, or send them to the front to push Rodney's blight back.
- Rodney's blight now spreads out of Cromwark, a little further every day, and shows in purple on the world map. Inside it monsters turn purple, hit 25% harder and can drop Nyx coins. Clearing a town raid near its edge pushes it back, and strong Company and Charter territories stop it at their borders. Where a territory holds it, the front is drawn in red.
- City Charters: up to three Companies with halls in the same region can hold its capital together. A Captain founds the Charter from the Company page and invites the others by tag. The Charter shows on the world map as one dashed outline round the city, sized by its Companies' territories together, and its members gather and loot 10% more anywhere inside it.
- Companies with a hall now have a territory on the world map, a patch around the hall's town in the Company's colours. It grows as members earn Renown in the hall's region and shrinks back over the weeks when they stop. Territories can overlap. Inside your own Company's territory you gather 10% more and find 10% more gold in loot.
- /dm now shows its line as a banner across the top of everyone's screen as well as in chat, in a colour of choice: /dm purple Rodney: You will all kneel!, or a #rrggbb code. Developers can use it as well as Dungeon Masters.
- Staff commands: /vanish hides a staff member from players and monsters until used again, /spawn <monster> [count] stands monsters nearby, and /greed <player> <amount> [gold|nyx] sends gold or Nyx coins to a player (Admins only), which arrive in their game within a minute.

## 2026-11-11

- Choosing a Focus craft now asks you to confirm first. Dropping a Focus craft costs 100 silver, with no weekly wait. Pledging into a free place stays free.
- Crafting has its own tab in the pause menu, next to Growth. Professions, the Bench, the Stations and your Stores are on its rail, and they no longer sit under Stats and Holdings. The Bench lists every station's items, so you can plan a craft anywhere and make it when you stand at the station.
- Crafting is reworked: you now pick the item and the materials for each part (blade, flux, grip, lining), and the materials decide the best quality the piece can reach. Pledge up to two crafts as your Focus for full experience and Masterwork; other crafts earn half and top out at Superior. All five crafting ranks start again; items you already own stay as they are.
- Places built with the World Builder can now come alive: people walk their patrol routes, talk with you through branching conversations, and trade with you; stepping into an area can start an ambush; doors, chests and switches can be used. Every trade and reward is checked and paid by the server, once.
- The POI editor can copy, cut and paste: Ctrl+C, Ctrl+X and Ctrl+V on a part, a light or a whole POI, into the same POI or another one. The in-game POI editor (`/play/?editor`) stays alongside the World Builder. A builder in it cannot be hurt and meets no foes, so edits are never lost to a fight; the World Builder's "Live view" shows its drafts in the same world.

## 2026-11-09

- Fixed: enemies in shared dungeons no longer go out of sync between players (a party member fighting something you can't see). When you enter a dungeon someone else is already in, its enemies appear a moment later, once the game has the room's state from them, and they match on everyone's screen. Everyone in the dungeon fights enemies built for the same level.
- Fixed: removed the rocket live event (the poop mounds and flying farting horses). `/event rocket` no longer exists.
- Resting at a fire, tent or bed now asks whether you want a Long Rest (8 hours pass) or a Short Rest (heal and catch some sleep, no time passes). The 10-minute wait between long rests is gone. A party member's long rest no longer pulls you into it; you only sleep when you choose to rest.
- The Overworld travel panel now lets you see and switch between Cautiously and Recklessly, slipping past a pack now shows a message ("The Orcs lose your trail."), and packs no longer vanish in crowded areas or spawn out of sight in first person.
- Fixed: In dungeons, your minions' and allies' spells no longer hit you when their target dies before the spell lands (a Vampire's Sleep, for example), and their fireballs no longer catch you in the blast.

## 2026-11-08

- Playing online, your progress is now saved to the realm when you leave - closing the window, force-exiting or pressing Exit. Nothing since your last save is lost any more on a hard exit (previously up to five minutes of play could be undone).
- Before a planned server restart you now get a warning: a countdown above the hotbar and checkpoints in chat, so you can find a safe place to stop.

## 2026-11-07

- Your raised dead, companions, crew, and allied guards now remember how to aim outside dungeons, hitting enemies outdoors and inside buildings instead of firing politely through them.
- Fixed: Allied spells now land on enemies in interiors or while in the overworld.
- Fixed: Your allies' spells no longer have a chance to hit you or your other allies.
- Fixed: Your allies' spells and melee attacks now land on enemies owned by other players.
- Fixed: Other players' summoned creatures are now recognized as allies instead of hostile enemies, so your minions and summons fight real enemies instead of each other.
- Fixed: other players' custom paperdolls were not drawn in the world. The server now tells everyone whose skin is whose (this needs the server updated).
- Fixed: your own custom paperdoll sometimes did not show on your character in the world (the desktop app most often), while it showed in the inventory.
- You can keep up to 15 custom paperdolls per account now.
- You can stop drawing other players' custom paperdolls: one switch at the top of the Social tab (also in Settings), and a Hide skin button on each friend. A hidden player is drawn as their ordinary look; they are never told. In chat, `/hideskin <name>`, `/showskin <name>` and `/hiddenskins` do the same by name, and a chat line's name menu has Hide skin.
- Custom paperdolls: upload a front and a back picture to your account on the new skins page (`/skins.html`), choose how tall it is drawn (half to one and a fifth of a player), and send it to staff. Once approved, pick it with the new Paperdoll button on the main menu and it becomes your paperdoll in the inventory and your body in the world for everyone who sees you. Only the drawing changes: hit box, reach and eye height stay the same.

## 2026-11-06

- The Great Cannon by Wayrest now fires with a muzzle flash, a bank of smoke, a cannon boom and a big screen shake for anyone nearby, and players far away hear it rumble. A few seconds later its shell lands on Cromwark in a huge explosion that everyone in the reach can see, hear and feel, and each shot adds 500 to the realm's Nyx coin count.
- New: Cheb's Necromancy by Chebgonaz. Nine new Mysticism effects in the Spell Maker: Summon Skeleton, Zombie, Ghost, Mummy, Vampire, Lich, Ancient Vampire and Ancient Lich, and Recall Minions. Ready-made versions (Animate Dead, Raise Mummy, Vampiric Pact and the rest) are sold at every spell shop.
  - Summoning needs a Humanoid Corpse in your pack, plus a second reagent for the stronger undead (Ectoplasm, Oil or a Bandage, roses, Lich Dust). Reagents are only used up when the minion rises.
  - Minions follow you everywhere, through doors and fast travel, fight at your side and are seen by other players nearby. They use your companion slots, and when one falls it is gone for good.
  - Humanoid enemies and orcs now carry a corpse, and searching a grave, coffin or sarcophagus can turn one up (better odds with high Mysticism, Intelligence and Willpower).
  - New class: the Necromancer, in the class list after the eighteen classics. It starts with Animate Dead, Novice Recall and a corpse.
- New Argonian looks: Rox's New Argonians by SynfulRoX adds ten more Argonian faces (faces 11 to 20 at character creation), each with its own body and vampire face. The original ten are still there.
- Casting Decoy no longer makes your character vanish in third person (or for other players). Enemies still lose track of you.
- Fixed a crash when opening Salvage at the Reforge with two or more Magic pieces in your pack.
- Melee rework. Weapons that fell behind were raised and nothing got weaker: two-handers now hit about a quarter harder than a longsword, one-handers sit level with it, daggers close behind, and bows and the crossbow were raised to make up for their range.
- Every weapon has its own strength now:
  - Longsword and claymore: never roll a weak hit.
  - Broadsword: hits harder on anything wearing no armour (beasts, monsters, unarmoured people).
  - Katana and dai-katana: the first hit on an unhurt enemy cuts half again as hard.
  - Saber: each hit on the same enemy makes the next one harder, up to a quarter more; switching target or pausing resets it.
  - Daggers and short blades: hit half again as hard on an enemy that has not noticed you.
  - Axes: hit a quarter harder on an enemy under half health.
  - Mace: punches through half of the enemy's armour. Flail, warhammer, Light Flail and crossbow punch through a third.
  - Flail: sometimes lands a hit twice.
  - Light Flail: swings about 15% faster than other blunt weapons.
  - Staff: held in both hands it blocks 10% of weapon and arrow hits.
- Two-handed weapons cleave: a hit also strikes up to two enemies next to the one you hit, for half the damage. The claymore reaches three, for a bit more.
- Shields block part of every weapon or arrow hit you take, by size: buckler 5%, round 8%, kite 12%, tower 18%, on top of their armour.
- Fighting bare-handed with a shield is about 13% slower, and you keep the shield's block.
- The Notices of the Realm button and the tips ? can be moved, resized and hidden in the HUD editor (Alt+U), like the rest of the HUD.
- New: the Notices of the Realm board shows the world events (Cromwark and the Great Cannon, with its progress) and our Discord when you enter the world. The scroll button at the right edge opens it again.
- The notice board's text is readable again on every look of the game.
- Tutorial tips no longer pop up in the middle of what you are doing. A glowing ? at the right edge of the screen shows how many are waiting; click it to read them.
- A soft chime plays when another player says something in chat (Settings, Chat, to turn it off).
- Salvage works on found Magic items again; they break into Welkynd shards as before.
- Salvaging from your pack now says why it could not be done, instead of a plain "could not be salvaged".
- You can no longer salvage pieces you made yourself, and the game says so.
- Bards stay visible to their audience for the whole song.

## 2026-11-05

- Spell scrolls are priced by how strong the spell is: starter spells sell for about a tenth of before, rare ones keep their price.
- New event: the Great Cannon by Wayrest. Give ingots and planks for Nyx coins; when it is whole it fires on Cromwark and a new one begins.
- The Cromwark reach looks like a warzone: burnt ground and dead trees, more of both toward the heart.
- The shared account vault, Nyx coin counting, player festivals and house guestbooks now reach the server properly.
- The map shows each court's side of the Cromwark border: Daggerfall's roadblock, Sentinel's warriors and Orsinium's claim.
- Characters on one account can share items and gold through the bank's account vault.
- Project Legacy: adopt an heir from a choice of children, or make your own.
- Stuck in the Cromwark reach? /unstuck now works there, after a short wait.
- Respawning in the Cromwark reach takes as long as anywhere else.
- Nyx's title shop counts your coins correctly.

## 2026-11-08

- Playing online, your progress is now saved to the realm when you leave - closing the window, force-exiting or pressing Exit. Nothing since your last save is lost any more on a hard exit (previously up to five minutes of play could be undone).

## 2026-11-07

- Crossbows are now a quarter of what they used to be worth, and they have been giving a swap cooldown.
