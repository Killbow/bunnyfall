# Bunnyfall changelog

Newest first. One line a change, in plain words, for players. The desktop app's patch notes show the lines added since
the last release (scripts/changelogNotes.mjs).

## 2026-11-07

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

## 2026-11-07

- Crossbows are now a quarter of what they used to be worth, and they have been giving a swap cooldown.
