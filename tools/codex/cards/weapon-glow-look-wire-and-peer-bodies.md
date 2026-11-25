---
slug: weapon-glow-look-wire-and-peer-bodies
title: "Weapon Glow on the Wire: Look Glow Words and Peer Bodies"
domain: multiplayer
kind: subcard
parent: weapon-glow-overview
files:
  - src/net/wire.js
  - src/net/remotePlayers.js
  - src/net/peerBodies.js
  - src/combat/weaponGlow.js
  - src/combat/fpArm.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Weapon-Glow.md"
related:
  - weapon-glow-overview
  - weapon-glow-classic-sprite-and-morrowind-rings
  - wardrobe-wire-and-receiver-marks
  - wire-protocol-and-frame-dispatch
  - online-coop-peer-presence-and-crowd-fans
invariants:
  - "A look item may carry a `glow` word that matches LOOK_GLOW_RE: one of ten words (fire1-3, frost1-3, shock1-3, arcane2)."
  - "lookGlowOk keeps the word only on a Weapons item in a LOOK_GLOW_SLOTS hand slot (RightHand or LeftHand, the same as SIEGE_HAND_SLOTS). validLookItem drops the word anywhere else and keeps the item."
  - "Plain weapons omit `glow`, so their bytes on the wire are unchanged. Affixes never travel; only the word does."
  - "The sender always says its word (meshGlow with on: true). The receiver applies its own weaponGlowOn switch before glowFromWord."
traps:
  - "A relay older than the version that added the look glow field drops the word. Older clients ignore it. Deploy order does not matter."
  - "PeerBodies re-reads the word from the current look on each change, and passes the item to setWeaponGlow/setOffWeaponGlow so a stale weapon mesh is not lit."
dfu: []
tags:
  - weapon-glow
  - multiplayer
  - wire
  - look
  - peer-bodies
---

# Weapon Glow on the Wire: Look Glow Words and Peer Bodies

Multiplayer appearance payloads synchronize weapon glow across peers using a single compact look token rather than transmitting item affix tables (`src/net/wire.js`, `src/net/remotePlayers.js`, and `src/net/peerBodies.js`).

## Wire Encoding and Slot Validation

- When building outgoing player appearance items in `src/net/remotePlayers.js`, hand weapons compute `o.glow = glowWord(meshGlow(it, { on: true }))` (`src/combat/weaponGlow.js`). Senders always emit their token regardless of their local display toggle, while plain weapons omit `glow` so wire payloads stay unchanged.
- In `src/net/wire.js`, `LOOK_GLOW_RE` permits ten compact tokens: `fire1` through `fire3`, `frost1` through `frost3`, `shock1` through `shock3`, and `arcane2`.
- `lookGlowOk` accepts a `glow` word only when the look entry is a `Weapons` item seated in `LOOK_GLOW_SLOTS` (`RightHand` or `LeftHand`, matching `SIEGE_HAND_SLOTS`). `validLookItem` strips `glow` from any other slot or item category while keeping the item itself intact.

## Receiver Gate and Peer Body Rigs

- On look updates in `src/net/peerBodies.js`, the receiver checks its own `weaponGlowOn()` preference before decoding the word with `glowFromWord`.
- `peerBodies.js` calls `b.rig.setWeaponGlow(weaponGlowOn() ? glowFromWord(heldNow.glow) : null, heldNow)` for the main hand and `setOffWeaponGlow` for the off hand (`src/combat/fpArm.js`), passing the current item reference so stale weapon meshes are never lit.
- Only Morrowind 3D peer bodies render received weapon glows; classic billboard peers do not.
