# Bunnyfall changelog

Newest first. One line a change, in plain words, for players. The desktop app's patch notes show the lines added since
the last release (scripts/changelogNotes.mjs).

## 2026-11-20

- Fixed a crash on farms: harvesting any of the new crops (corn, cabbage, tomatoes, sunflowers, berries, desert root, flax, gourds, grapes) crashed the game when its sacks were drawn. Every crop now has a sack.
- Vampires, the visual pass: every vampire screen is now a real window in your chosen look, stone and brass in Enhanced Plus, dark wood and gold in Classic, instead of plain message boxes. Each clan has its own crest and colour, each kind of blood its own glyph and colour.
- Blood Sight is a card: the victim's blood glyph, its kind and quality on a meter, who can see you, and each choice as an illustrated card. Feeding ends in a red flash and shows your Vitae and the Beast after.
- The Haven shows each prisoner with health and misery bars, each servant with rank, loyalty, duty and errand progress (and its kit right under it), and each enthralled townsperson with their perk. The Court shows its crest, your strikes as pips, the tithe, a Blood Hunt banner and the Masquerade as heat bars; while bitten, you see all nine bloodlines side by side.
- The Discipline wheel shows each power's glyph, its Vitae and a cooldown sweep, with the chosen one described in the middle, and casting flashes in your clan's colour. A crimson Vitae bar sits above the vitals (Enhanced Plus) or a blood vial at the left edge (Classic), and the screen's edge reddens and pulses like a heartbeat as the Beast rises.
- Choosing your bloodline: once bitten by a vampire, you no longer get the clan of the region you were bitten in. While the fever runs, go by night to any clan's Court (the back room of the taverns in its seat city) to hear what the clan offers (its land, strength, Bane and Disciplines) and ask it to claim you. The turning cannot finish until a clan has claimed you; each day a reminder says where the Courts meet. You can change your mind at another Court until the turn.
- Vampires who were already turned get one free change of clan: at another clan's Court, by night, "Swear yourself" to it. Your clan spells and Disciplines change with it; strikes with the old Court stay.
- Vampire Disciplines: an awakened vampire has five powers on one key (Numpad0 by default, change it in Controls under Magic). Tap it to cast the last one again; hold it to open a wheel, flick the mouse toward a power and let go. Each costs Vitae and has its own cooldown, none work while Starving, and the obvious ones (Beast's Fury, attacks, leaps) heat the Masquerade if townsfolk see them.
- Every vampire has Blood Heal, Beast's Fury and Mist Form, plus two of their clan's: Anthotis Blood Siphon and Arcane Ward, Garlythi Bastion and Northern Mirror, Haarvenu Blood Fire and Frost Veins, Khulari Frozen Gaze and Stalker, Lyrezi Hush and Unseen, Montalion Court Command and Exit Stage Left, Selenu Weathered Hide and Predator, Thrafey Mending Blood and Lure, Vraseth Rooftop Leap and Hunter's Sense. Aimed ones are readied: swing or cast to unleash them. Your clan's two are withheld while your own Court hunts you.
- The Masquerade: every region remembers what a vampire does there. A bite someone saw, a victim crying for the watch, a drained body, someone gone missing or a thrall breaking free raise the region's heat, which cools over a few days. A region turns Uneasy, Suspicious, then Hunted: unseen feeds may be watched after all, and witch hunters come for you outdoors at night, more of them the hotter it gets.
- The nine bloodlines now each have a strength and a Bane. For example: Garlythi prisoners never escape but poor blood barely feeds them; Khulari take captives whole but cannot give the Kiss to anyone awake; Selenu shrug off half the sun but stale blood gives them half; Thrafey keep prisoners gently but a killing feed sickens them.
- Clan Courts: each clan's Court meets by night in the back room of the taverns of its seat city (Daggerfall, Wayrest, Sentinel and the rest); look for it on the tavern door. Breaches in a clan's land earn strikes and a blood-tithe, paid in gold or Vitae. Three strikes, or a killing someone saw, and that Court declares a Blood Hunt: vampire assassins come by night, and if it is your own Court your clan withholds its strength until you ask for penance and silence the witch hunter it names.
- Your own Court also has work: hunt down a rogue vampire of a rival bloodline for gold and a strike forgiven, or take on Daggerfall's own clan quests.
- Vampire thralls: an awakened vampire has Blood Slots (more as you level) for prisoners, servants and townsfolk under your hold. Each servant and enthralled townsperson drinks a little of your Vitae every day; leave them unpaid and their loyalty runs out. A servant then leaves you, and a townsperson breaks free and talks, which hurts your name in their region.
- Capture: in Steal mode, the blow that would kill a person (a class enemy, never the watch, a quest's foe or an elite) takes them alive instead, and they step through a portal to your Haven. A townsperson can also be taken after the Kiss, at night and unseen.
- Your Haven is any home you own: its door now has "Your Haven". Prisoners have health and misery: drink from them, bleed them into a Vial of Vitae (use it from your pack), feed and tend them, let them go, or make them your servant. Their blood is stale: it keeps the Beast at bay but never reaches the best resonance. Prisoners at full misery may escape unless a servant guards the Haven.
- Servants: one can follow you as a companion (it takes a companion slot), wearing the gear you give it, as strong as its blood was good. Others guard the Haven or run errands by day: forage food for prisoners, go to market for gold, or scout fine blood for your next feed. Send a follower home from the Companions page.
- Enthralling: in Steal mode, an innkeeper, a watchman or a merchant can be enthralled where they stand. An innkeeper keeps their town's houses quiet when you feed on sleepers; a watchman hushes one witnessed bite a day in their town; a merchant sends provisions and vials of Vitae by courier.
- Vampires, awakened: a few nights after you are turned (or soon, if you are a vampire already), a letter comes from an Elder of your bloodline. Meet them after dark in a tavern of the region and they awaken the Beast in you.
- Once awakened you have Vitae, your blood, which runs down over time. As it falls the Beast rises: Sated, Thirsty, Hungry, Ravenous, Starving. Each stage changes your stats (stronger but harder to talk to when Ravenous), and a Starving vampire cannot rest. A tile on the left of the HUD shows where you stand.
- Feeding: in Steal mode, use a townsperson to feed instead of picking their pocket, or use a bed indoors to feed on whoever sleeps there. Blood Sight shows their blood (Scholar, Warrior, Rogue, Noble, Worker) and its quality, and who could see you. Choose the Kiss (costs a little Vitae, they forget you), drink and leave them, or drain them dry. Being seen is Assault, or Murder; someone left without the Kiss may call the watch.
- The blood you drink gives a gift by its kind (Scholar: mind and spells, Warrior: strength, Rogue: stealth and speed, Noble: charm, Worker: endurance, Beast: claws), stronger the better the blood, fading over a few days. Hitting monsters in a fight gives only a mouthful of Beast blood now.
- New warm gestures for roleplay: /hug, /embrace, /pat, /headpat, /kiss, /handkiss, /cuddle, /comfort, /highfive, /handshake, /fistbump, /poke, /tickle, /nuzzle, /hold, /bump, /toast and /wink. Add a name to aim one at someone ("/hug Ann"), and players nearby see it as an action line with little hearts and sparkles floating over you both. /emotes lists them all.
- Touch gestures ask first, once: when you hug, pat or kiss someone they get a question; /accept lets you do it any time from then on, /decline says no this time, /untouch <name> takes the leave back, and /touchlist shows who has it. Blocked players are never answered.
- An Emotes row on the player menu (hold the interact key on someone) opens a wheel of eight gestures: hug, pat, kiss, high five, handshake, comfort, wave and bow. Click one or press 1 to 8.


## 2026-11-19

- Fixed: only the Mages Guild and Fighters Guild quest givers wear the new paperdoll again; the rest of the hall keep their own look.
- Fixed: Nyx at the Nowhere Tavern (and the guild clerks) now show their own pictures; the game was looking for them in the wrong folder.
- The Nowhere Tavern: Nyx now shows her own face when you talk to her instead of a generic bartender, and the hall's red carpet and drapes are dyed a dark purple-blue.
- Fixed: harvesting a big field no longer makes the sacks by the first beds vanish. A farm now keeps up to 500 sacks lying about (it kept 64), still for fifteen minutes each.
- Elite dungeons now rise in batches: every two hours (on the even hours, UTC) three to five new dungeons become elite dungeons, instead of eight once a day. They stay until someone cleanses them, and up to 32 can stand at once; when the map is full, no new ones rise until a dungeon is cleansed. Everything else about them (the crystal, the purple glow, Sifrit, the 50 Dusk Tokens, the spreading purple zone after two days) is as before.
- The farm expansion: Company farms are now real places with a farmyard, animals, workshops, a market and much more. Everything is done on the farm itself in Farming Mode (enter at the farmhouse door) by walking up to things and clicking them; the old Progress & orders panel and the Crop button are gone.
- The farmyard: an order post with the week's orders, the factor's wagon, an estate ledger, a seed shelf, a tool rack, a well, a compost heap, a haystack, lanterns that light up at night, and a scarecrow in the field. Everyone passing by sees them.
- Take seed from the sacks on the seed shelf. The order post and the ledger tell you what the farm needs. Captains and Officers ship orders at the wagon and buy improvements at the tool rack, the well and the compost heap, each after a Y/N question. Improvements now show on the farm: more tools, a pump at the well, water channels along the rows.
- Fields look much better: ploughed furrows, soil that darkens when watered, three to six plants a bed that grow little by little and sway in the wind, and weeds on beds left dry.
- Harvests leave sacks by the bed. The crops are already in the Company Stores; carry the sacks (up to four) to the factor's wagon to load the week's cargo.
- New crops, depending on the land: corn, cabbage, tomatoes, sunflowers, berries, flax, gourds, grapes and desert root. They grow fastest in their own season. Grain, mushrooms and herbs grow as before.
- Crops now have grades: Common, Fine, Choice and Prize (up to double the harvest). Beds earn care by being sown and scythed well, weeded, and watered before they dry out; hover a bed to see where it is heading.
- Careful work (press F): sowing, weeding, scything, milking and ploughing become short games played right over the bed or animal, for better crops. Each gives its bonus a few times a day.
- Trouble on the farm: weeds, birds that peck at the crops (chase them off at the scarecrow), blight that spreads through a crop (pull the sick plants with the hoe, and change crops to keep it away), and wolves prowling the pens at night (click the pen to drive them off).
- Strains: two ripe beds of the same crop side by side can give a cross seed. The farm names it, and it can grow quicker, hardier or heavier. Up to twelve a farm.
- Livestock: a weekly drover sells cows, horses, pigs, dogs and cats. Feed them from the Company Stores, water them and muck out their pens. Content animals work: cows give milk, pigs give manure for the beds, a dog guards the crops, a cat keeps sacks waiting longer, a horse helps haul. Animals never die.
- Workshops: an officer pays to build a windmill, press, dairy churn, smokehouse, loom or brewery, which rises over real time. Turn the farm's goods into flour, butter, cheese, wine, oil, ale, mead, smoked meat and fish, and linen. A weekly product order pays the Company in gold.
- Sworn beasts on the farm: station a sworn beast revenant at a post on your farm (it frees a companion slot and never deserts there). Each kind works: wolves guard, a bear pulls the plough, boars find truffles, spiders spin silk, bats and rats help the soil, a dragonling warms a small greenhouse where any crop grows.
- Market day: every farm holds a market one day a week. Members stock the stalls from the Company Stores and anyone, from any Company or none, can come and buy. Enter your best crop or animal in the contests to win ribbons.
- Three new titles for farmers: Furrowhand, Harvestwarden and Sovereign of the Sheaf, earned with farm work (at most 400 a day). Sovereign of the Sheaf also gives the First Light aura. The ledger shows how far you have to go.
- Sifrit the Forbidden One is now a player's size, so she no longer gets stuck in walls. She has the Titanheart's toughness: no single hit can take more than a quarter of her health, so she cannot be one-shot. Disintegrate does nothing to her ("That won't work.").

## 2026-11-18

- Magical taverns: in every town with two taverns or more, one of them has turned blue, is called The Nowhere Tavern, and its door is a shimmering portal. Every portal opens the same grand tavern hall, so players from all over the map meet in one tavern, under windows full of stars, with Nyx behind the bar. Walk out and you step back into the town you came from. Shifts, drinks and Favor work there as in any tavern.
- Daily elite dungeons: every day eight dungeons become elite dungeons, each with a great purple crystal floating over it and a purple glow on the ground, seen from far off and marked on the world map and the travel map.
- Inside an elite dungeon the halls are lit purple and Cromwark's creatures hold it. Fell enough of them and Sifrit the Forbidden One rises: tougher than her usual self, with extra Grave Rings, and she calls Cromwark's creatures instead of mummies.
- Killing Sifrit cleanses the dungeon and adds 50 Dusk Tokens to the Nyx counter (once per dungeon). An elite dungeon left uncleansed for two days starts a purple corruption that spreads further every day, with tougher foes inside it, until someone cleanses it.
- The Overworld travel view now names the places you have explored: guild halls, and every shop, tavern or temple you have entered show their name over their roof, so you can find your way without waypoints. Places you have not visited stay unnamed, and they follow the Towns switch.
- Bards' Guild services, paid in Favor Tokens (Favor shop, press G): give an item a name of your own (10 Favor), write a flourish on an item (30 Favor; it is words on the item's card only and changes no stat or enchantment), or rename a home you own (25 Favor). Names are filtered like other player text.
- Hired traders now sell stacks properly: put up as many potions (or other stackable goods) as you like at a price each, the stall shows how many are on offer, and a buyer chooses how many to buy with the total shown while the rest stays on sale.
- Discord patrons in the tavern now stand as their custom paperdoll. If a Discord user who is talking in the tavern channel has linked their character and wears an approved custom paperdoll, the customer in the room is drawn as that paperdoll instead of only taking their name.
- The territory map is reworked. Company territories now lie on the land only, sharing borders with their neighbours instead of overlapping circles over the sea, and your own Company's border glows gold. Rodney's blight drifts and creeps, with a glowing front where a territory holds it. Garrison marches are curved roads with arrows streaming from town to front. Hover a territory or the blight to see whose it is.
- Tavern shifts: every drink you serve now earns a Favor Token, not just a finished shift.
- Tavern shifts are quicker: the cup goes into your hand as soon as it is full, and serving the right drink pays you on the spot. No more collecting and returning empty cups.
- Tavern shifts feel more alive: customers call out their orders, thank you or complain, and your cup pours, fills, lifts and changes hands in front of you.
- New tavern chores: customers leave empties on their tables and knock drinks over. Clear a table by gathering the cups and wiping it down, or sweep up a spill. Each chore pays a little and cheers up the room.
- Bards' College members now earn much more reputation from tavern shifts: one point for every drink served right and on time, and three more for a perfect shift with nothing left dirty.
- Click a player's name in the chat and pick Whisper: the chat field fills with the whisper command and their name, ready for your message.
- Your camps are listed under Holdings > Camps: each one's name, region, nearest town and map square, with a button to mark it on your map. Hitting the 3-camp limit now names the camps you already keep and says where to find them.

## 2026-11-17

- Fixed: Choosing a Bay waypoint or quest marker from the Eltheric Ocean no longer crashes the game.
- Fixed: Jumping in the Mages Guild spell shop showed "<effect not found>" and did nothing when cast. It now shows its effect, costs 13 spell points, and works for copies already in your spellbook too.
- Fixed: A booked ship leaving its berth is now towed clear of the quay and steers around piers instead of getting stuck on piers or the shore.
- Fixed: Travel refusals now name the nearest enemy with its distance and direction, and the Overworld marks lone enemies that block travel. Wilderness enemies that have not noticed you no longer close the Overworld.
- Fixed: Purchases in the Bards' Guild Favor Shop now go through instead of failing.
- Company farms now have costly shared tool, irrigation and soil upgrades, unlocked through crop deliveries. Bulk orders ask for 1,000, 5,000 and then 20,000 of each crop, pay Company gold and Argents, and enforce weekly limits and farm-grown milestones.
- The Bards’ Guild Favor shop now sells five Welkynd Shards for 10 Favor, and bundles of three Stamina or Restore Power potions for 5 Favor.
- Putrid food is cleared automatically, including from older saves, and matching raw and cooked meat now stack.
- Every Escape menu tab now uses the larger Growth tab window size.

- The Bards’ Favor shop now sells five Welkynd Shards for 10 Favor and three Stamina or Restore Power potions for 5 Favor.
- Putrid food disappears automatically, including old saved food. Matching raw and cooked meat now stack.
- All Escape menu tabs now use the Growth tab’s larger window size.

- All crop fields on each Company farm are now workable, with saved crops visible to nearby visitors outside Farming Mode. Shared field updates arrive about once per second. Existing beds keep their positions and crops.
- Company farm doors now offer Farming Mode: work 16 shared beds with a raised camera and your visible character, planting grain, mushrooms or herbs, watering them and harvesting into Company Stores. Watered crops grow in real time; unattended crops pause instead of dying.
- Farming uses native Daggerfall soil and vegetation textures, follows the active UI skin and theme, and replaces the ordinary hotbar with farming tools until you exit.

- Legendary Bartender now also unlocks the Heart's Fire aura (formerly Beaconlight), including for players who already own the title.

## 2026-11-16

- Tavern shifts now have three clickable bottle points for pouring doses, a cup progress display, and an illustrated, paged innkeeper's recipe book.
- Captains and Officers can now dismiss soldiers from the Company's Garrison page, with no gold returned. If too few soldiers remain for their orders, soldiers are recalled from the front first, then from patrol routes.
- Fixed: The Great Cannon map mark is now gold, so it no longer looks like the orange Sentinel's warriors mark. An existing orange cannon mark also turns gold.
- Fixed: Farms inside your Company's territory or Charter are no longer lost when a member's game wrongly decides they are out of reach.
- Fixed: On the Stone look, gray labels in the Social and Company windows are now lighter and easier to read.
- Fixed: Open game tabs now say when a new version of the game is out, so you know to save and reload.
- Fixed: In Bunnyfall Grimoire, the Company window no longer shows dark text on its dark background.
- Fixed: The desktop app now says in chat when a new version of the game is out.
- Fixed: Holy Word now dispels the undead in its area, and Banish Daedra now dispels the daedra it touches.
- Fixed: At some town gates, such as Chesterwark's west gate, the carriage and its driver no longer appear wedged against or inside a building.

## 2026-11-14

- The Company Overview now has a Territory section explaining the weekly shrink at each Turning and the Renown XP needed to keep its start-of-week size.
- Fixed: Entering a building or dungeon for the first time is faster because its art sets now load in parallel.
- Fixed: A stuck Shift key is now released on the next key press or click, so a ship under oars turns instead of sliding sideways.
- Fixed: Your Company no longer loses all its farms when you open the map or a farmhouse door before opening the Company tab.
- Fixed: Disenchanting now gives Enchanting experience even when your Stores cannot hold all the Arcane Essence (anything past 5,000 is lost). The Stores note now says to sell Essence at a Merchants' League hall.
- The Dialogues tab in the in-game POI editor now has a Map view that shows the conversation as a flowchart beside the selected line. Every answer also has a button to create and link a new line.
- Fixed: A party member who fails a quest no longer gets the choice of reward gear when another member completes it.
- Fixed: The sea at night is no longer black. It now reflects the night sky and sunset, shows a path of moonlight, and catches the light of quay lamps and ship lanterns.
- The game loads faster, especially on slow connections, because textures now download in parallel instead of one set at a time or twice.
- The initial game download is much smaller, so a first visit starts sooner.
- Shops and houses start loading while their greeting is open, revisited rooms open faster, and entering a dungeon takes less time.
- Startup is faster because ground snow history is saved between sessions instead of recalculated from scratch.
- Returning to nearby towns and opening the travel or handheld map are now faster.
- Leaving a ship's cabin no longer causes a brief stall.
- Fixed: Weapon, shield, face, and item graphics that fail to download now retry automatically instead of staying missing until you reload.
- Fixed: A failed fast travel or teleport no longer leaves the screen black, and the professions buttons no longer stay disabled after a network error.
- Return visits load faster because your browser now caches game files and art.
- Fixed: Removing an effect in the item enchanter no longer removes matching effects from a bound soul.
- Fixed: The desktop launcher now shows release patch notes again, and updates that finish downloading after a temporary stall install before play instead of staying on "Could not download".
- Fixed: Sailing no longer hiccups each time your guns finish reloading or a shot hits your ship or your target.
- Fixed: The pack now shows your custom paperdoll the first time you open it, instead of your ordinary doll.
- Fixed: Skeleton, zombie, and atronach revenants no longer yip, whine, snarl, or howl.
- Fixed: While a town loads, such as right after a fast travel, the carriage horses and other nearby town animals no longer repeat their sounds in quick succession.
- Fixed: Shops, bookshelves, and loot no longer offer books whose pages are missing from the game files.
- Fixed: Raiders attacking a walled town no longer get stuck in its gatehouses. They camp outside and march in through a gate, which stays open during the raid, even at night.
- Fixed: The Stores page now lists materials bought at a shop counter and says that they can't go into your Stores but crafting stations can still use them.
- Fixed: Featherweight now lets you pick up, buy, and trade for more, and the Enhanced inventory and both trade windows show the lighter load.
- Fixed: In homes in the new town layouts (Beautiful Cities and Beautiful Villages), all furniture and framed paintings can now be taken out while decorating.
- Fixed: The decorator's Built in tab now removes a cupboard, chest, or shelf that holds things, and puts what it holds in your pack.
- The game does less work each frame in towns, dungeons, and at sea, including enemy pathfinding, which helps slower computers.
- The settings menu responds faster when you pick an option.
- Enemies now check whether they can see or hear you sixteen times a second, so they may notice you (or lose sight of you) a moment later.
- Fixed: Keys and mouse buttons are released when the game window loses focus, so you no longer keep walking or swinging after switching windows.
- Fixed: Auras and the duel wall no longer risk broken pixels on some graphics cards.
- Fixed: Crafts no longer stop gaining experience once two others pass level 50. Outside your Focus, Smithing, Building, Outfitting, and Enchanting earn half experience from level 50, and you are told when one gets there.
- Fixed: In the POI editor's DM tools, editing a dialogue, event, trade, or other entry no longer scrolls the panel back to the top.
- Fixed: A POI event that opens a trade while a talk is open, such as one run by a dialogue answer, now shows the trade.
- Fixed: In the POI editor and DM tools, color pickers and dropdowns actually open up.
- Fixed: In the POI editor, Place and Paste with nothing selected now go to the last selected POI instead of making a new POI or asking you to select one.
- Fixed: In the POI editor, a paste into the same POI now rezzes in the same position as the original.
- Fixed: A new character no longer gets two copies of the main quest, and a save that already has two copies now loads with one.
- Fixed: The zone warning no longer flickers, and it no longer fills the journal's Messages with copies of itself.
- Fixed: The Giant tag on the Overworld no longer flickers, and the giant stays in the world until you move well away from it.
- Fixed: A POI event limited by a shared count, such as a prize for the first ten visitors, no longer lets two players through at the same moment.
- Fixed: Online, a POI event that adds to a saved number no longer counts the addition twice in your game.
- Fixed: Masterwright now lets you upgrade Daedric pieces to Masterwork; without it, the Upgrade tab says so instead of offering the step.
- Fixed: Escape now closes the Bench and Provisioning window, and each list scrolls on its own, so the Craft and Cook buttons stay in view. Closing the window during The Simmer no longer cooks the dish anyway, the ingredient search keeps the cursor, and pot dishes now show when they spoil.
- Fixed: Meteor, Wall of Earth, and Decoy now land where the crosshair points, even on open ground and in third person. Wall of Earth rises as a mound, Meteor falls as a rock wrapped in its element and leaves a crater, and other players see both and bump into the wall.
- Fixed: Gravity Well no longer freezes enemies in their hit animation. They keep fighting while it pulls them toward its center, about as fast as they walk, and it no longer pulls your allies.
- Fixed: You can now do the daily chore at your Company's farm from its farmhouse door.
- The map now shows garrisons on the march: a dashed arrow in the Company's colours runs from its town straight to the point on Rodney's blight edge where its soldiers push, thicker the more soldiers march.

## 2026-11-13

- Fixed: The in-game POI editor now says when a waypoint, a delay, or an encounter starts an event that takes items or gold, since the player is asked for them wherever they are.
- Fixed: The in-game POI editor no longer offers the Materials Bag or a boat's parts or deed as items a POI takes, since no player can hand them over.
- Fixed: The in-game POI editor's Sandbox can now play a visitor who cancels every hand-over.
- Fixed: A POI trade or event that takes items or gold now asks before it takes anything, and takes only the items you choose.
- Fixed: A POI trade now shows items you are wearing and quest items as missing, instead of offering the trade and then refusing it.
- Fixed: A trade recipe's form in the in-game POI editor no longer shows the word null under How often.
- Fixed: The in-game POI editor's item picker now offers the game's potions by name, in place of the empty Glass Bottle and a Potion Recipe sheet that teaches nothing.
- Fixed: The in-game POI editor can now set an encounter so that language skills and spells cannot pacify its enemies.
- Fixed: The in-game POI editor draws routes as wide bands that rise over hills, with slow arrows that show which way people walk.
- Fixed: The in-game POI editor's move, turn, and size handles brighten and grow under the cursor, with size boxes on the selection's faces and corners.
- Fixed: A recipe in a POI trade named Event no longer shares its limit with a POI event that has the recipe's name, online or offline.
- Fixed: A POI that asks for a Glass Bottle now counts and takes only empty bottles, never one of your potions.
- Staff events grow their atmosphere: smoke columns spread over the event's town, the sky turns dark purple within 120 metres of the pillar, and the scared screams of the townsfolk ring out when the event starts.
- A staff event's monsters now stand near its pillar, so players can find them there. The Forbidden One lets out an evil cackle when she appears. (The voices are the game's existing clips for now.)
- A staff event now shows a column of purple light rising from its town, seen from a few map pixels away, so players can find it.
- Camps work again: a pitched tent is kept as a camp and can be decorated (the server was not routing camp requests). Needs a server update.
- Provisioning works again: the pot, the cauldron, milling flour and setting cheese were being refused by the server (it never routed them). Needs a server update.
- Milling flour and setting cheese now work from the grain and milk in your pack and bag, not only your Stores. Cooking and brewing that are refused now say why. The Bench and Provisioning window uses the game's own buttons and chips and scrolls as one page.
- The Bench and Provisioning (pot and cauldron) now open in a window of their own that fits your screen at any UI scale, with one scrollbar per list instead of two side by side. The Crafting tab's Bench and Provisioning rows open it, and so does pressing the station's key. The Crafting tab is now as wide as the Growth tab. The Stations page is just the stations now, and the Stores page no longer repeats them.
- Staff events can now have mid bosses (smaller bosses that appear as the kills build up, before the big one) and a wave of extra monsters that arrives with the boss.
- Sifrit the Forbidden One, a necromancer boss, can be called with the staff /spawn command or set as an event boss. She calls mummies without end, and her lane, lash and ring blows hit very hard. Her health bar shows at the top of the screen.
- Two currencies are renamed everywhere you read them: silver is now Imperial Argents, and Nyx coins are now Dusk Tokens. The Dusk Token has its own picture in your pack and shop, and the Imperial Argent has its coin on the loot and haul cards. (Silver the metal, in armour, weapons and ingots, is unchanged.)
- Bunnyfall Grimoire with Readable text now lays out buttons, chips, search boxes and small texts the way Enhanced Plus does, so windows that looked fine in Plus no longer get squeezed or messy. The Grimoire's paint stays; the HUD and the pack's own art screens keep their sizes.
- Bunnyfall Grimoire is easier to read: by default its words now use Enhanced Plus's lettering and sizes, in the Grimoire's ink. Page titles keep the Grimoire font. The old all-Grimoire lettering is still there as Text: Grimoire lettering on the Grimoire's card. The card also has a new Compass option to use Enhanced Plus's compass.
- Camps: pitch a tent with Camping Equipment outdoors and it stays as your camp after you log off. Stand in it to decorate it with the same pieces as a yard, up to 100 and free. Everyone passing by sees it, tent and fire included. Packing the tent takes the camp and its decorations down. You can keep 3 camps.
- The Bench has a "How crafting works" button that explains materials, Potential and quality, Focus, the minigame, material effects and Craftwork.
- The Bench now works at every crafting station in a room, so a home with a forge and a jeweller's bench lets you craft at both.
- The crafting minigame scrolls into view when it starts, and the page scrolls back to the Craft buttons when it ends. What you just made shows by the buttons.
- A flux, lining or other fitting now starts at one you actually hold, so the list no longer says "Missing 1 Tin" when another flux would do.
- Staff events can now announce themselves to everyone online when they start and end (with a line of staff's own words if they like), show a label and the time left on the map while they run, name the mini boss, and pay the players who fought: gold to the character and Imperial Argents to the account, once the event ends, to everyone with enough kills. An event that ends without its boss falling now pays too.

## 2026-11-12

- Fixed: The in-game POI editor can now change a variable's or a spawn point's key, and every place in the POI that uses it changes with it.
- Fixed: The in-game POI editor now says when a looping route's last waypoint makes the person stop twice at its first spot.
- Fixed: The in-game POI editor's Test log now names waypoints and refused recipes by their names, and lists an object's use before what it changed.
- Fixed: The in-game POI editor's enemy picker names the added enemies, such as the Goblin and the Archer Rider, instead of Enemy and a number.
- Fixed: The in-game POI editor draws a route as the straight lines a person walks between its waypoints.
- Fixed: The in-game POI editor now says why only a persistent text variable can hold an object's state, and can make one for it.
- Fixed: An encounter set to never start again can now stay won across visits, set up with one button in the in-game POI editor.
- Fixed: The in-game POI editor's item picker now offers the game's added items, such as foods, gems, and the crossbow.
- Fixed: Offline, a POI trade's once-per-character, limited-stock, daily, and cooldown limits now last after a reload, on each device.
- Fixed: A POI dialogue now drops an answer as soon as the event it started is done, instead of showing it until the next talk.
- Fixed: Bodies of enemies killed in the in-game POI editor's Test no longer stay behind to be looted after the test ends.
- Fixed: A POI's person walking a route over sloping ground no longer sinks into the ground.
- Fixed: Looking at Daggerfall models in the in-game POI editor's Assets browser or its Daggerfall model window no longer leaves each one in graphics memory for the rest of the session.
- Fixed: Ceiling pieces and other models whose faces point away from the camera no longer show a blank preview in the in-game POI editor's Daggerfall model window.
- Fixed: Model cards in the in-game POI editor's Assets browser now show a picture of the model instead of its number.
- Fixed: The in-game POI editor's history panel can now compare two revisions of a POI and show what changed between them.
- Fixed: The in-game POI editor can now duplicate an entire POI, including its groups, parts, pictures, people, lights, and DM content, as a new draft beside the original.
- Fixed: The in-game POI editor's side panels and DM tools can now be resized by dragging their edges, and the editor saves their sizes, snap steps, and camera speed between sessions.
- Fixed: The game's tips button no longer covers the in-game POI editor's right panel or its DM tools; while the editor is open, it sits beside the right panel, and above the DM tools when they are open.
- Fixed: The in-game POI editor's Assets browser can now place pictures, items, and mounted weapons and armor in the world by clicking Place or dragging a card.
- Fixed: The in-game POI editor can now place, move, turn, size, mirror, and light flat pictures, items, and mounted weapons and armor, and show each picture in a 2D view.
- Fixed: A POI's flat pictures, placed items, and mounted weapons and armor now show in the game with their lights.
- Fixed: The in-game POI editor has an Assets browser that lists the game's models, pictures, items, and creatures, with search, filters, favorites, recent picks, and a preview.
- Fixed: A Daggerfall model can be placed from the in-game POI editor's Assets browser with Place or by dragging its card onto the world.
- Fixed: Offline, a POI's rewards and costs now reach your character: its events give and take your real gold and items, and a gift is given only once on each device.
- Fixed: The in-game POI editor's Test plays the selected POI's DM content in the world: people walk their routes, zones and objects work, dialogues and trades open, events run, and encounters spawn real enemies that leave when the test stops, while other POIs run none of theirs.
- Fixed: Trades and events in the in-game POI editor's Test use a test copy of your gold and items, with a log in the Test panel. The game does not save during a test, and your character is restored when it ends, though a quest step completed in the test stays done.
- Fixed: Copy and paste in the in-game POI editor now take a whole selection with its groups and people, save the copy so it is still there after a reload and in other tabs, use the system clipboard where the browser allows it, and name anything left out because its model or picture is missing.
- Fixed: The in-game POI editor can now group and ungroup what is selected, align and spread it, reset its turn and size, move it by an amount, and drop it to the ground.
- Fixed: The in-game POI editor's list now shows groups and people, with hide and lock buttons on each row and group, a search inside the open POIs, and dragging to regroup or reorder.
- Fixed: The in-game POI editor no longer draws things marked hidden, lets you pick hidden or locked things in the world, or lets you move locked things; the game still shows hidden things.
- Fixed: The in-game POI editor can now select several things at once with Shift+click or by dragging a box, move, turn, and size them together with the gizmo, and pick and move people in the world.
- Fixed: A POI dialogue answer that opens a trade now shows the trade instead of leaving the talk on screen.
- Fixed: The in-game POI editor has a Sandbox that plays a POI's people, dialogues, trades, and events on a test visitor, with a log, and never touches your character.
- Fixed: The in-game POI editor draws a POI's routes, waypoints, encounter areas, zones, and objects in the world while its DM tools are open, and a spot can be picked with a click on the ground.
- Fixed: The in-game POI editor's DM tools can now make a POI's routes, encounters, objects, dialogues, trades, events, and variables, link its people to them, and show where each has a problem.
- Fixed: A dialogue or trade that a POI event opens from a zone, a waypoint, an encounter, or a delay now shows on the screen.
- Fixed: A POI variable that lasts for one event run now resets to its starting value at each run, and a persistent variable that an event sets while playing offline is now saved.
- Fixed: A POI object that looks like one of the POI's models is now used where that model sits, can be used from as far as its reach, and can take its state from a persistent variable that lasts from visit to visit.
- Fixed: POI doors and chests now open when used, a locked one opens with its key item, and an open door's model no longer blocks the way.
- Fixed: A POI switch now flips on or off each time it is used, an inactive POI quest object can no longer be used, and a switch or quest object that needs a key item now works only for a player who holds it.
- Fixed: A POI person's talk range and their "shown only when" condition now work in the game.
- Fixed: A POI encounter now starts when you walk into its area, and one set to come back starts again the next time you walk in.
- Fixed: Saving a whole World Builder POI to the library from the in-game POI editor no longer fails when its lights are in a group, hidden, or locked; the library saves its parts and lights, and the dialog says what it leaves out.
- Fixed: The in-game POI editor now says when a POI's flat pictures are left out of its .glb export and the library, as it already did for Daggerfall models.
- Fixed: A part copied from one POI and pasted into another in the in-game POI editor no longer names a group the other POI lacks, which stopped that POI from being saved.
- Fixed: The in-game POI editor now lists what a POI from the World Builder holds that it cannot change yet, such as an interior, and shows each POI's size against its limit.
- Fixed: After the crafting rank reset, the Firmament could show 0 Stars, give nothing for new Renown levels, and refuse your changes with "Not enough points." It now shows how many stars you are over and keeps Accept off until they fit, and every character gets one free respec.
- Staff: the AI chat reviewer is gone, and so are the automatic spawn-check cases. Reports now only hold what players report, and the open automatic cases have been closed. A Monster watch flag now leaves a staff note on the player instead of opening a case.
- Staff: Open reports are readable now. Each case says what kind it is and why it has its level, and opens in place to the reported chat or spawn findings and the reporters' notes. From there you can Dismiss, Mute, Ban or open the player. Ticked cases, or every automatic spawn check nobody reported, can be dismissed in one go.
- Moving goods in and out of the company Stores no longer counts toward the hourly writs limit, so Put in all and taking everything back out can't lock you out of writs for an hour anymore.
- Fixed the Garrison page stuck on "Reading the garrison..." when a Company's Stores held flowers, twigs or other gathered plants. Those plants now count as herbs for Battlemages and Healers.
- You can hide pieces of gear. In the inventory, each worn piece of armour, clothing or a shield has a small eye: click it and the piece stays worn (its armour, warmth and enchantments still count) but nobody sees it, you included: not on your paperdoll, your body, your portrait or to other players. Click it again to show it. Weapons always show.
- Mastered skills past 100 level up far faster. A point used to cost 4x, 8x and then 16x the uses (100-125, 125-150, 150-200), and the cost kept growing with your character level. Now it is 2x, 3x and 4x, and past 100 your level stops making it dearer after level 20. At level 37, a point at 160 drops from about 6 hours of fighting to about 45 minutes. Progress you had banked toward the next point is kept.
- The Bench's piece panel no longer gets squeezed into a thin column on smaller screens, and its quality table no longer breaks words in half.
- Staff: the staff panel is reworked. It opens on a Home page (who is playing, open reports, live events, quick actions), finds any character as you type, and each character has its own page with plain buttons: give an item, gold or Nyx coins, set bank gold, roll back, message, mute, freeze, ban, notes. Events and notices are simple forms now.
- Adamantium, Daedric, Orichalcum and Dwarven pieces now reach Masterwork Potential on the Bench with ordinary secondary picks. You still need the rank and Smithing Focus to roll it.
- Staff: the whole staff panel now opens inside the game from a movable ST button (web and desktop app), with players, moderation, items, economy, reports, events, the live map, Follow and Hide me in one place. The staff bar in game is back while it is open. staff.html is the same panel in a browser.
- /vanish no longer cuts a staff member off the network: monsters, chat and everything else keep working while players and monsters simply can't see them.
- The chat no longer stars out swear words: what you type is what everyone sees. Names, guild names, notes and letters are still filtered.
- Starting to cook or brew on the Provisioning page now scrolls to The Simmer.
- The old crafting menus are gone. The Anvil, Workbench, Loom and Jeweler's bench pages are removed from Stations, and the Mason's bench only cuts stone. Every piece is made at the Bench now, so material Potential applies the same way for everyone. Cooking at a fire is unchanged.
- Crafting writs now take what the pot and the cauldron make. A potion writ takes your one-trait cauldron bottles of that potion (mixed bottles don't count), a dish writ your pot dishes of its kind: stew, supper, tart or feast. Provisioning also goes up to rank 100 by every way of making, no matter your other crafts. At an alchemy table, option 2 now says it opens the Provisioning page.
- Provisioning is its own system now, on its own line of the Crafting tab. Put ingredients in a pot (at a fire) or a cauldron with a base (at an alchemy table): every ingredient has hidden traits, and what you make keeps every trait two of them share. You learn traits as you make things, and your recipe book keeps every combination you find. The Simmer is its minigame: hold the heat inside the band to make it stronger.
- Dishes and potions grow stronger with your Provisioning rank: dishes up to +15 to an attribute, and your potions start as good as the shops' and end far better. Two-trait potions and trait dishes can only be made by players.
- New foods: Grain, Flour, Milk, Cheese, Honey and Salt (the Grocers sell some, Company farms grow Grain and Milk), and Boar, Bear and Crab Meat from butchery. Drinks too: put a water in the pot for Ale, Mead, Cider or Tea.
- Provisioning is no longer a Focus choice. If you had pledged it, that place is free again. Your rank and experience are kept.
- Craftwork: once a Focus craft (Smithing, Carpentry or Outfitting) reaches rank 100, you can take it into Craftwork from the Focus bar. It asks you first. Your rank goes back to 0 and you keep your perks; from then on that craft earns half the experience, and the materials' effects on what you make reach up to 40% instead of 20%. Once per craft.
- Mail and Brigandine armour in every metal can now be crafted and salvaged, from Iron to Daedric, including pieces you found.
- No more first-time craft bonuses. Their experience is now spread over every craft, so crafting levels go up much faster: a crafting skill reaches Master in about the same number of crafts as before.
- The crafting Bench fits the pause window at any interface size: the item list, the piece and its materials stack when there is not room side by side.
- Company farms: Captains and Officers can buy up to three of the world's farms inside their Company's or Charter's territory, for 6,000 gold each, from the new Farms page of the Company window. Each farm grows food, herbs, hides and wool, or timber, and puts its harvest into the Company Stores every day. Every member who does the day's chore while standing at the farm adds half again. Farms show on the world map in the Company's colours and are lost if the territory stops reaching them.
- Garrisons: a Company can keep up to 12 soldiers at its hall's town and a City Charter up to 60 at its capital, from the new Garrison page of the Company window. Captains and Officers recruit Spearmen, Crossbowmen, Knights, Battlemages and Healers with treasury gold. Soldiers eat food, ingots, planks or herbs from the Company Stores every day, and unfed soldiers desert. Put them on the city's patrol routes and you'll see them walking the streets in your colours, or send them to the front to push Rodney's blight back.
- Rodney's blight now spreads out of Cromwark, a little further every day, and shows in purple on the world map. Inside it monsters turn purple, hit 25% harder and can drop Nyx coins. Clearing a town raid near its edge pushes it back, and strong Company and Charter territories stop it at their borders. Where a territory holds it, the front is drawn in red.
- City Charters: up to three Companies with halls in the same region can hold its capital together. A Captain founds the Charter from the Company page and invites the others by tag. The Charter shows on the world map as one dashed outline round the city, sized by its Companies' territories together, and its members gather and loot 10% more anywhere inside it.
- Companies with a hall now have a territory on the world map, a patch around the hall's town in the Company's colours. It grows as members earn Renown in the hall's region and shrinks back over the weeks when they stop. Territories can overlap. Inside your own Company's territory you gather 10% more and find 10% more gold in loot.
- /dm now shows its line as a banner across the top of everyone's screen as well as in chat, in a colour of choice: /dm purple Rodney: You will all kneel!, or a #rrggbb code. Developers can use it as well as Dungeon Masters.
- Staff commands: /vanish hides a staff member from players and monsters until used again, /spawn <monster> [count] stands monsters nearby, and /greed <player> <amount> [gold|nyx] sends gold or Nyx coins to a player (Admins only), which arrive in their game within a minute.
- Heartwood is back at the Bench: anything that takes planks lets you set a Heartwood in place of one plank. It counts through its stats (strong Arcanism, heavy), so it makes a staff far better and a bow heavier.
- Materials now shape the finished piece. Hardness raises a weapon's damage or a piece of armour's armour, Toughness its condition, Lightness makes it lighter, and Arcanism raises its enchantment power, each by up to 20% either way. A material poor in a stat costs you there. The card shows the range for your picks.
- Inspiration: true strikes in the crafting minigame push those material effects toward their best.
- Choose the look of armour and clothing before you craft it: the card shows each of the piece's styles as it will look on you, and the piece is made in the one you pick.
- A new crafting minigame at the Bench, The Work: one turn of the dial for each part of the piece, faster as you go, with sparks for a true strike. Better-suited materials give you a wider mark.
- Material stats are always listed in the same order: Hardness, Toughness, Lightness, Arcanism (H T L A); Arcanism, once Affinity, is how readily a material takes and holds magic.
- New things to craft: the Archer's Axe and Light Flail, the Roleplay Realism chain and light armour sets, and the Crossbow. Crafted bows, staves and crossbows are named for their grade and then their wood ("Steel Long Bow, Oak"). The craft card now names exactly what you will make, shows its damage or armour, weight and condition at each quality you can roll, and its odds match the real roll.

## 2026-11-11

- Fixed: A trade or reward at a place that the server could not complete is no longer reported as already done; the game retries when the server does not answer and asks you to rejoin the realm if it cannot tell whether it went through.
- Fixed: A POI whose trades or events name an item the game cannot make, or check a variable that lasts only one visit, is now refused with a list of problems when saved, submitted, or approved instead of failing when a player tries it.
- Fixed: An encounter you win by surviving for a time now counts only the time you spend in its area, so it no longer ends while you are far away.
- Fixed: An encounter that ends when all its enemies are dead now finishes even if some enemies failed to appear, and resets to start again if none appeared.
- Fixed: Enemies from an encounter set to passive no longer attack on sight; they fight back once you attack them.
- Fixed: An encounter's enemies now leave when the place calls the encounter off or resets it, or when the place is taken out of the world, and an encounter that starts again no longer adds a second group to enemies left from last time.
- Fixed: With the in-game POI editor open, game messages such as a new quest show beside its right panel instead of sliding in under it.
- Fixed: A POI with a part the game cannot load, such as a Daggerfall model placed in the World Builder, now appears without that part, with its people and events, instead of not appearing at all.
- Fixed: The in-game POI editor no longer breaks on a World Builder POI that holds a Daggerfall model: selecting that part shows what it is, and the model check finishes, so the POI can be saved and sent for approval.
- Fixed: In the in-game POI editor, pasting or duplicating a part with a long key no longer freezes the page, and a paste now selects what it pasted.
- Fixed: Opening the in-game POI editor with no character yet no longer puts the editor over character creation; it waits until you stand in the world, after the name picker and the opening message.
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
