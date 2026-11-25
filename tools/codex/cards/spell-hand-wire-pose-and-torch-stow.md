---
slug: "spell-hand-wire-pose-and-torch-stow"
title: "Spell Hand Turn-Taking, Torch Stow, and Mixed-Pair Wire Poses"
domain: "combat"
kind: "subcard"
parent: "two-hands-overview"
files:
  - "src/combat/weaponRig.js"
  - "src/combat/playerWeapon.js"
  - "src/combat/fpArm.js"
  - "src/combat/twoHands/spellHand.js"
  - "src/combat/twoHands/spellHandArm.js"
  - "src/combat/twoHands/mixedArm.js"
  - "src/magic/hostMagic.js"
  - "src/net/wire.js"
  - "src/net/peerBodies.js"
  - "src/scenes/frame/inputFrame.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-Mixed-Pair-Spell-Hand.md"
related:
  - "two-hands-overview"
  - "two-hands-mixed-pair-and-spell-hand"
  - "two-hands-morrowind-mirror-rig-and-spread"
  - "weapon-glow-look-wire-and-peer-bodies"
invariants:
  - "`weaponRig.js` blocks new blows while a cast plays or `castPending()` holds a queued cast, and reports `handsBusy` whenever state is non-`Idle`, a hit holds, the 3D shot is busy, or `techniqueFlying()` is true."
  - "`_castOneHand` latches at cast start (`spellHandNow`), and `torchStowsForSpell` clears `leftBusy` when handheld torches and `stowOnSpellcasting` are enabled while a spell is armed or casting."
  - "`poseHandsOf(usingRightHand, strikeHand)` (`src/net/wire.js`) emits `lh: 1` when not using the right hand and `ah: 1` when the left hand struck, while `peerHandsOf(look, shown)` (`src/net/peerBodies.js`) resolves two-hand and spell-hand visuals for human peers only."
  - "`src/magic/hostMagic.js` re-exports `CAST_PRESS` from `src/combat/twoHands/spellHand.js` so scene hosts route pending casts through `takeReady` and `firePending` without importing two-hands modules directly."
traps:
  - "A touch tap that only locks a target (`_tapLockOnly` in `src/scenes/frame/inputFrame.js`) must not trigger a readied spell cast."
  - "In `src/combat/fpArm.js`, `endAttack` finishes `AttackEnd` follow-through and frees the arm; queued casts must reach `endAttack` rather than cutting it short, and older relays strip `ah` gracefully without closing the socket."
dfu:
  - "Assets/Scripts/Game/WeaponManager.cs"
  - "Assets/Scripts/Game/FPSSpellCasting.cs"
tags:
  - "spell-hand"
  - "two-hands"
  - "wire"
  - "torch"
  - "morrowind-arm"
---

# Spell Hand Turn-Taking, Torch Stow, and Mixed-Pair Wire Poses

Spell-hand casting, mixed-pair shooting, and peer pose payloads coordinate across `src/combat/weaponRig.js`, `src/combat/fpArm.js`, `src/magic/hostMagic.js`, and `src/net/wire.js`.

- **Turn-taking and torch stowing:** `weaponRig.js` blocks new swings while a cast plays or `castPending()` is true, and reports `handsBusy` when state is non-`Idle`, a hit holds, the 3D shot is busy, or `techniqueFlying()` is true. In `src/combat/fpArm.js`, `endAttack` completes `AttackEnd` follow-through before queued casts fire, `weaponMuzzle` resolves the striking hand muzzle, and `activeHand` in `src/combat/playerWeapon.js` reports the gun hand during `shotHeld`. At cast start, `_castOneHand` latches via `spellHandNow`, while `torchStowsForSpell` (`src/combat/twoHands/spellHand.js`) clears `leftBusy` when handheld torches and `stowOnSpellcasting` are active.
- **Host routing and touch locks:** `src/magic/hostMagic.js` re-exports `CAST_PRESS` from `spellHand.js` to route queued casts through `takeReady` and `firePending`. In `src/scenes/frame/inputFrame.js`, a target-locking touch tap (`_tapLockOnly`) never fires a readied spell.
- **Wire poses and peer bodies:** `poseHandsOf(usingRightHand, strikeHand)` (`src/net/wire.js`) sets `lh: 1` when not using the right hand and `ah: 1` on left-hand strikes (older relays strip `ah` cleanly), while `peerHandsOf(look, shown)` (`src/net/peerBodies.js`) resolves two-hand and spell-hand visuals for human peers.
