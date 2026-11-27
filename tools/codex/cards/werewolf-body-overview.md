---
slug: "werewolf-body-overview"
title: "Bloodmoon Werewolf Body: Skeletons, Robe Slot, and Peer Form Switching"
domain: "characters"
kind: "overview"
parent: null
files:
  - "src/combat/fpArm.js"
  - "src/combat/weaponRig.js"
  - "src/formats/mwFirstPerson.js"
  - "src/formats/mwItemMap.js"
  - "src/net/peerBodies.js"
  - "src/net/peerRiders.js"
  - "src/net/onlineWorld.js"
  - "src/net/remotePlayers.js"
  - "src/characters/werewolfSkin.js"
routes: []
tables: []
replacesBible:
  - "04-Characters/Werewolf-Body.md"
related:
  - "werewolf-shadow-fang-skin"
  - "balance-arc-lycanthropy-and-vampirism"
  - "weapon-glow-look-wire-and-peer-bodies"
  - "mw-gpu-skinning-and-sprite-batch"
  - "online-coop-peer-presence-and-crowd-fans"
invariants:
  - "Only `LycanthropyTypes` `1` (werewolf) adopts the Bloodmoon body (`WOLFSKIN` and `WOLFSKIN_1ST` in `src/combat/fpArm.js`); wereboars keep the human Morrowind body."
  - "Transformed wolves wear only `WEREWOLF_ROBE_ID` (`werewolfrobe` `CLOT` in the Robe slot, `src/formats/mwItemMap.js`), key claws as an empty hand without equipping weapons or spells, and animate solely from wolf `.kf` sources (`fpAnimSources`, `tpAnimSources`)."
  - "`src/combat/weaponRig.js` calls `fpArm.setWerewolf` before checking paralysis and `fpArm.ready()` so refused wolf builds fall back cleanly to classic lycanthrope sprites and claws."
  - "`rawToggleSheath` (`src/combat/weaponRig.js`) plays the equip sound only when the weapon in hand is not `werecreatureClaws`, so the claws draw with no sound."
traps:
  - "Missing Bloodmoon BSA (`meshes/wolf/skin.1st.nif`) or missing `Bloodmoon.esm` (`werewolfrobe`) refuses the entire wolf build in both views (a first-person refusal refuses the whole wolf)."
  - "Peer `wb` transitions (`peerIsWolf(shown)` when `(shown.wb | 0) === 1`) within `BODY_REBUILD_MS` (`10000` ms in `src/net/peerBodies.js`) wait out the remaining cooldown, and `peerRiders.js` defers unmounted werewolves until `wolfStands(id)` settles to prevent double-drawing."
dfu: []
tags:
  - "werewolf"
  - "bloodmoon"
  - "body"
  - "peer"
  - "weaponrig"
---

# Bloodmoon Werewolf Body: Skeletons, Robe Slot, and Peer Form Switching

Only `LycanthropyTypes` `1` (werewolf) adopts the Bloodmoon 3D wolf body (`WOLFSKIN` and `WOLFSKIN_1ST` in `src/combat/fpArm.js`); wereboars remain on the human Morrowind body, and `werewolfoverlay.dds` is declined on the 3D body.

## Robe Slot, Claws, and Fallback

- **Robe and Animations**: Transformed wolves wear only `WEREWOLF_ROBE_ID` (`werewolfrobe` `CLOT` in the Robe slot, `src/formats/mwItemMap.js`), key claws as an empty hand without equipping weapons or spells, and animate exclusively from wolf `.kf` sources (`fpAnimSources` and `tpAnimSources` in `src/formats/mwFirstPerson.js`).
- **Build Refusal and Rig Order**: In `src/combat/weaponRig.js`, `fpArm.setWerewolf` runs before paralysis checks and `fpArm.ready()` so refused builds fall back to classic lycanthrope sprites and claws. Missing the Bloodmoon BSA (`meshes/wolf/skin.1st.nif`) or `Bloodmoon.esm` (`werewolfrobe`) refuses the entire wolf build across both views, and `fpArm.wolfStanding()` yields while curse state and body form diverge.
- **Peer Switching**: In `src/net/peerBodies.js`, `peerBodyKey` keys wolf bodies separately from human forms. Peer `wb` transitions (`peerIsWolf(shown)` when `(shown.wb | 0) === 1`) within `BODY_REBUILD_MS` (`10000` ms) wait out the cooldown, and `src/net/peerRiders.js` defers unmounted werewolves until `wolfStands(id)` settles.
