// The world's hover pickers: the namers that turn a hovered key into its tooltip, with the mod
// namers. It also picks the person or peer under the cursor and builds the hover contents.
import { composeContents } from '../player/worldHover.js';
import { FISH_KEY_PREFIX } from '../underwater/deepWatersFish.js';
import { lootPileName, mobilePersonName } from './worldTooltips.js';
import { MOBILE_NPC_ACTIVATION_DISTANCE } from '../player/activate.js';
import { nearestPerson } from '../talk/townTalk.js';
import { peerRayPick, SOCIAL_REACH } from '../player/socialPick.js';
import { wagonHoverName } from '../player/eotbWagon.js';
import { waterSourceHoverName } from '../systems/survival/items.js';

/** @param {any} shared */
export function createHoverPickersWorld(shared) {
  const {
    _talkPersons, camps, csaHoverName, droppedLoot, droppedTorches, dwFish, hcc, peerInSight, springAt,
  } = shared;
  // WORLD-HOVER: the port's OWN world objects, each named by the module
  // that STANDS it - World Tooltips' extension API (vendor .cs:228-257)
  // rather than its ladder, because Daggerfall has no camps, no dropped
  // torches and no cart, so the mod has no word for any of them. The
  // two corpse pools are here for a different reason: their bodies are
  // PX21c's itemised rows, which predate the mod and are not gated on
  // its switch.
  //
  // Insertion order is priority, and it is the ACTIVATION ladder's own
  // order, so the plaque reads a tie the way the press resolves one.
  const _hoverNamers = [
    (key) => shared.gatherHost?.hoverName?.(key) ?? shared.yards?.hoverName?.(key) ?? null,   // PROF-MENU: a profession node, its acts the plaque's rows; HOME-YARD: a yard piece's Move, Duplicate, Remove
    (key) => shared.gatePool?.hoverName(key) ?? null,   // WB2: the Oblivion Gate, and its countdown
    (key) => shared.sigilBroker?.hoverName(key) ?? shared.cromwark?.hoverName(key) ?? null,   // SET7: the Sigil Broker (BROKER-CAGE: caged at the faithful's circle); BUNNYFALL: Nyx
    (key) => shared.riteHost?.hoverName(key) ?? null,   // WB12d: the faithful's chest - its own keys, and its pile's before the piles' word
    (key) => shared.reachEvents.fireHover(key) ?? camps.hoverName?.(key) ?? null,
    (key) => droppedTorches.hoverName?.(key) ?? null,
    (key) => shared.exteriorFoes.hoverName?.(key) ?? null,
    (key) => shared.cityGuards.hoverName?.(key) ?? null,
    // AUDIT-WH M5: the player's OWN dropped pile, named as the interior
    // and the dungeon have always named one (.cs:534-548 - a pile of
    // ONE is that one item, the rest is "Loot Pile"). Outdoors nothing
    // answered `droppedLoot:`, so a pile fell to the model's bare
    // fallback and read a word the mod does not have.
    (key) => (typeof key === 'string' && key.startsWith('droppedLoot:')
      ? { title: droppedLoot.labelFor?.(key) ?? lootPileName(droppedLoot.contents?.(key) ?? null) } : null),   // WILD1: a body's remains by its own name
    // DW-E3: a fish is a DaggerfallLoot of one item - the mod's pile word names it by that item
    (key) => (typeof key === 'string' && key.startsWith(FISH_KEY_PREFIX)
      ? { title: lootPileName(dwFish?.fishFor(key)?.loot.items ?? null) } : null),
    // AUDIT-WH M6: ...and the two families the press has raced since
    // SURV3/EOTB-IL with no word anywhere in the tree - a water source
    // and the cart. Each named by the module that STANDS it, as the
    // torches and the camps are.
    (key) => (typeof key === 'string' && key.startsWith('water:')
      ? waterSourceHoverName(!!springAt(key)?.dry) : null),
    (key) => wagonHoverName(key),
    (key) => hcc.hoverName(key),   // HCC: the horse by its name (HorseNameTooltipController's HorseTargetLabel), the wagon, a peer's by whose it is
    (key) => csaHoverName(key),   // CSA-D: a boat, by its hull's name
    // LEFAY1: the monument to Julian LeFay - its years, the flowers laid, and its rows; after the Sigil Broker's and the
    // rite's (WB12d holds those two together) and before another player's (PEER-PLAQUE1's, the array's last): its press
    // is the street's (worldModes.tryEnter, the ladder's last family), and it answers its own key alone
    (key) => shared.lefay?.hoverName(key) ?? null,
    (key) => shared.merchantYards?.hoverName(key) ?? null,   // MERCHANT-YARDS: a yard by its name and its keeper's, a horse or a wagon on show by its own
    (key) => shared.portHost?.hoverName(key) ?? null,   // SHIPYARDS: a port's shipyard, crew hall and lighthouse by their names and keepers', and their rows
    (key) => shared.witches?.hoverName(key) ?? null,   // WITCH1: a Hearth Offering by its owner and its cakes, and its rows
    // PEER-PLAQUE1: another player, by the session's own name - the port's
    // own family (DFU has no other players), so it sits with the cart and
    // the camps ABOVE the mod's switch, as the names over heads already do.
    (key) => shared.peerHoverName(key),
  ];
  /**
   * WORLD-HOVER H2: THE MOD'S MOBILE BAND (.cs:297-320), IN ITS OWN
   * ARRAY. A live foe is named by the pool that stands it, and only
   * when it is not hostile; a walking townsperson by
   * `MobilePersonNPC.NameNPC`, off the same live pool and the same
   * index the pick raced.
   *
   * AUDIT-WH2 L2-F3: it is separate from `_hoverNamers` above because
   * the two arrays answer to different switches. Everything above is
   * the PORT's own and predates the mod, so it speaks whether World
   * Tooltips is on or off; this is the MOD's, so it must go silent
   * when the mod does. It went in `_hoverNamers` and so it never did -
   * see the note at the gate in worldModes' `exteriorHoverName`.
   */
  const _hoverModNamers = [
    (key) => shared.exteriorFoes.liveHoverName?.(key) ?? null,
    (key) => shared.cityGuards.liveHoverName?.(key) ?? null,
    (key) => {
      if (typeof key !== 'string' || !key.startsWith('mobileNpc:')) return null;
      const t = mobilePersonName(_talkPersons()[Number(key.split(':')[1])]?.person?.nameNPC);   // LW3: a traveller's name too
      return t ? { title: t } : null;
    },
  ];
  /** WORLD-HOVER H2: the nearest townsperson as a RAY PICK - the
   *  press's own scan (townTalk's `nearestPerson`, which `tryActivate`
   *  takes too), dressed in the shape the race reads. The RAY's
   *  distance with the MOD's 6.4 beside it, because the band is a gate
   *  inside the handler and not a shorter ray (AUDIT 65 MC-2). */
  const _hoverPersonPick = (eye, dir) => {
    const n = nearestPerson(eye, dir, _talkPersons());   // LW3: the road's people beside the town's
    return n && Number.isFinite(n.distance)
      ? { key: `mobileNpc:${n.index}`, distance: n.distance, reach: MOBILE_NPC_ACTIVATION_DISTANCE }
      : null;
  };
  /** PEER-PLAQUE1 (2026-09-22, Mac: "Using the world tooltip implementation for other players and interaction
   *  prompt"): ANOTHER PLAYER AS A RAY PICK - the SAME pick the interact key makes (player/socialPick.js
   *  pickPeerInFront over peersNear(), SOCIAL_REACH, townTalk's rayPersonDistance: SOC5's one law), dressed in the
   *  shape the race reads (peerRayPick), so the plaque can never name a player the key would not reach. `eye` and
   *  `dir` are the HOST's - the street's camera here; the mode's own view indoors and underground, which
   *  worldModes and dungeonContext hand in through `peerHoverPick`. */
  const _hoverPeerPick = (eye, dir) => peerRayPick(peerInSight(eye, dir), SOCIAL_REACH);

  // WORLD-HOVER: and what the ITEMISED ones HOLD - the same ladder,
  // the same pools, in the same order (AUDIT-WH H3). This used to be a
  // ternary written inline at the frame that knew about `droppedLoot:`
  // alone, so the two corpse prefixes - itemised since the first slice
  // - answered null and every body outdoors read "Empty" over a full
  // pack. Each pool answers for its own bodies, beside the producer
  // that stands them.
  const _hoverContents = composeContents([
    (key) => (typeof key === 'string' && key.startsWith('droppedLoot:') ? (droppedLoot.contents?.(key) ?? null) : null),   // AUDIT-WH2 L2-F5: C1's guard - the CONTENTS ladder is handed every key the namer is
    (key) => shared.exteriorFoes.hoverContents?.(key) ?? null,
    (key) => shared.cityGuards.hoverContents?.(key) ?? null,
    (key) => (typeof key === 'string' && key.startsWith(FISH_KEY_PREFIX) ? (dwFish?.fishFor(key)?.loot.items ?? null) : null),   // DW-E3: the fish's one item
  ]);
  return { _hoverContents, _hoverModNamers, _hoverNamers, _hoverPeerPick, _hoverPersonPick };
}
