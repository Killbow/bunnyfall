// The frame's combat phases: the streaming world's arrows and the first-person weapon rig.
import { addItem, spendAmmoFor } from '../../items/inventory.js';
import {
  aimedBlowInfo, isBowWeapon, playerPainVoice, playPlayerVoice, SWING_FATIGUE_COST, tallySwingSkills,
} from '../../combat/hostCombat.js';
import { audio } from '../../audio/audio.js';
import { bowDamageArrow } from '../../combat/enemyEquipment.js';
import { calculateAttackDamage } from '../../combat/formulas.js';
import { ENEMY_HIT_VOLUME, hitSoundFor, PLAYER_HIT_VOLUME, SOUND, swingSoundFor } from '../../audio/soundClips.js';
import { flashPlayerDamage } from '../../ui/damageFlash.js';
import { hurtPlayer, playerBlowCameToNothing, playerEntity, surfacePlayer } from '../../characters/playerEntity.js';
import { inflictPoison } from '../../afflictions/poisons.js';
import { knockedDown } from '../../combat/blowEffects.js';
import { lycanthropeMoveSound } from '../../afflictions/lycanthropy.js';
import { makeInView } from '../../player/cameraView.js';
import { meterFor } from '../../render/perfMeter.js';
import { multiply } from '../../world/mat4.js';
import { playerArrowHitFoe } from '../../combat/arrowFlight.js';
import { SHAFT_REACH_M, underwaterLookUniforms } from '../../world/underwaterLook.js';
import { SKILLS, tallySkill } from '../../characters/skills.js';
import { sunDirection } from '../../world/worldClock.js';

/** @param {any} shared */
export function createCombatFrame(shared) {
  const {
    _crimeResponse, _deckBodies, _fr, _guardPool, _underLook, arrows, cam, cityGuards, deepWaters, drainExteriorFatigue,
    duelArrowTargets, duelMeleeHit, duelStrikeOut, dwRender, exteriorFoes, gamePaused, hitEffects, livingStrikeRoad,
    livingStruckPool, magic, modes, navalLeash, player, playerTicker, renderer, serpentArrowOn, townTalk, walkMode, weaponRig,
  } = shared;
  function frameArrowsPhase(now, dt) {
    const { minute, foeDt } = _fr;
    // C13: streaming-world arrows fly against the live pixel
    // collider (lost on geometry/terrain, as DFU misses are). Drawn
    // without a remap - the streaming pixels each carry their own,
    // and 99800's weapon archive needs none.
    // X2-slice: ENEMY arrows hunt the player - the impact runs the
    // same damage member the melee does (BowDamage :141), so the
    // Dodging tally, the poison seam and the recoverable arrow all
    // ride the hit.
    meterFor(renderer.gl)?.markCpu('arrows');   // PERF-ZONE2: the missiles' flight and their draw
    arrows.tick(foeDt, () => ({   // AUDIT (pre-merge) P6: QUEST-POPUP-PAUSE's hold - offline, an arrow already loosed waits under the quest's box with its archer
      // enemy arrows hunt only a SPAWNED, WALKING player - fly/orbit
      // camera modes have no capsule to hit
      playerFeet: walkMode && shared.playerSpawned ? player.pos : null,
      playerHeight: player.height,   // ROAD-H tail: the contact is the LIVE capsule (crouch 0.9, ride 2.6)
      onPlayerHit: (m) => {
        const shooter = m.shooterFoe;
        tallySkill(playerEntity, SKILLS.Dodging, 1);
        const dmg = shooter && !shooter.dead ? exteriorFoes.partyHit(calculateAttackDamage(shooter.entity, playerEntity, {
          weapon: m.weapon,
          blowInfo: m.aimed ? aimedBlowInfo(m) : null,   // TELL6d: an aimed shot's x1.4
          onInflictPoison: (att, tgt, pt) => inflictPoison(playerEntity, pt, false, { currentMinute: Math.floor(playerTicker.ownMinutes) }),
          say: (l) => townTalk.say(l),
        }), shooter) : 0;   // PSCALE1: a shared archer's arrow, harder for the party beside me
        if (dmg > 0) {
          hurtPlayer(playerEntity, dmg);
          audio.playOneShot(hitSoundFor(m.weapon), PLAYER_HIT_VOLUME);   // AUDIT 58: PlayerFootsteps.cs:330-344 - the blow that lands ON the player is volumeScale 1, not EnemySounds' 1.1
          // AUDIT 24 (wave 46): an arrow reaches the player through
          // BowDamage -> ApplyDamageToPlayer -> SendDamageToPlayer,
          // the same door as a blow, so it owes the flash and the cry
          // too. This site had the sound and neither of the others.
          flashPlayerDamage(dmg);   // BA1: RemoveHealth carries the amount
          playPlayerVoice(audio, playerPainVoice(playerEntity, dmg));
          surfacePlayer();
        } else playerBlowCameToNothing(playerEntity);   // AUDIT FINAL F10: an arrow weighed to nothing for the party is the door's word too
        addItem(playerEntity.items, bowDamageArrow());   // BowDamage: the arrow is recoverable from the target; MAC-N1: minted, not a bare literal
      },
      // AR1: the impact learns the FOES - the shaft an archer looses
      // at another foe (MT-ii's infighting selection) LANDS now, on
      // BowDamage's non-player arm. Both pools are candidates; the
      // shooter is excluded inside the flight module.
      foeTargets: [...[...exteriorFoes.foes, ...cityGuards.guards]
        .filter((t) => !t.dead && t.ai).map((t) => ({ feet: t.ai.feet, ref: t })), ...duelArrowTargets()],   // DUEL1: and my duel opponent's body, while we fight
      onFoeHit: (m, t) => (t?.duel ? undefined : exteriorFoes.arrowHitFoe(m, t)),   // DUEL1: a foe's shaft stops on a duellist and deals them nothing
      boxTargets: shared.serpentHost?.handBoxes?.() ?? null,   // SERPENT4: the sea serpent's hide - a hand's shaft stops in it
      onPlayerArrowHitBox: (m, t) => serpentArrowOn(m, t),
      // AUDIT 39 (#64): and the PLAYER's shaft lands too. It used to
      // fly, spend its Arrow and tally Archery against a guard or an
      // encounter foe and inflict nothing - both impact arms were
      // gated on `m.enemy`, and this bow branch `continue`s past the
      // melee hit chain below. The damage door is each pool's own, so
      // a killed watchman still runs the crime and the corpse.
      onPlayerArrowHitFoe: (m, t) => (t?.duel ? duelStrikeOut('arrow', m.weapon ?? null, 'StrikeDown', weaponRig.playerWeapon?.lastDrawMs ?? 0, t.id, { off: !!weaponRig.playerWeapon?.isOffHandItem?.(m.weapon) }) : playerArrowHitFoe(m, t, {   // DUEL1: my shaft on my duel opponent is a strike their client resolves   // AUDIT-SEATS G5: on a battle's foe (`t.id`), a shaft to the referee
        playerEntity, playerWeapon: weaponRig.playerWeapon, playerFeet: player.pos,
        dealDamage: (f, d) => (cityGuards.guards.includes(f)
          ? cityGuards.hurtGuard(f, d, player.pos, m.dir, { kind: 'arrow', abilityControl: m.technique?.control })   // AUDIT-39r: the shaft shoves the watch too (WeaponManager.cs:576-595); TELL1: a shaft's weight on a wind-up
          : exteriorFoes.damageFoe(f, d, player.pos, m.dir, { kind: 'arrow', weapon: m.weapon ?? null, abilityControl: m.technique?.control })),   // AUDIT FEUD 2: the bow (a metal weakness rides to a puppet's owner)   // WORLD6b-iii(e): the kind rides the hit - a puppet's owner lands the shaft (ar), as the dungeon's host has since WORLD3
        audio, hitEffects, say: (l) => townTalk.say(l),
        onInflictPoison: (att, tgt, pt) => (cityGuards.guards.includes(t) ? inflictPoison(tgt, pt, false, { currentMinute: Math.floor(playerTicker.ownMinutes) }) : exteriorFoes.poisonFoe(t, pt)),   // WORLD6b-iii(e): the pool's one poison door - a puppet's dose rides the hit to its owner; the watch is dosed here (the player's own)
        // AUDIT 58: WeaponManager.cs:630's HandleAttackFromSource sits
        // AFTER the damage fork closes (:615), so a shaft that lost the
        // roll still enrages what it hit and wakes the area. ROAD-G G1
        // (review): the WATCH carries the pair now
        // (cityGuards.js:"function handleAttackFromPlayer"), so this seam ROUTES by pool exactly
        // as `dealDamage` above it does, instead of excluding the
        // guards - a zero-damage shaft into a pacified watchman has to
        // reach the same door the zero-damage SWING already reaches
        // (cityGuards.js:"damageGuard(foe, 0, playerFeet, null)"). DFU makes no pool distinction:
        // AssignBowDamageToTarget's player arm (DaggerfallMissile.cs
        // :660-688) calls WeaponDamage, so :630 runs for the shaft as
        // for the swing.
        onAttackFromPlayer: (f) => (cityGuards.guards.includes(f)
          ? cityGuards.handleAttackFromPlayer(f, player.pos)
          : exteriorFoes.attackFromPlayer(f, player.pos, 'arrow')),   // AUDIT WORLD6b-iii(e) A2: the shaft's kind on the zero blow; AUDIT WORLD6b-ii B4: the one door - a PUPPET's is its owner's (a zero blow diverted, a damaging one already was), no area of mine wakes
      })),
    }));
    arrows.draw(renderer);
    // UNDER-LOOK and UNDER-RAYS (FIELD BUGS 2026-10-01 #4, #5): under the sea, the water body and the sun's shafts over
    // every pixel the world drew - after the last world pass, before the weapon and the HUD (world/underwater/underwaterLook.js)
    if (deepWaters && dwRender && shared._dwFogP?.under && shared._dwFrame) {
      dwRender.drawUnderwaterLook(underwaterLookUniforms({ depth: shared._dwFogP.oceanY - cam.pos[1], daylight: shared._dwFrame.daylight, toSun: sunDirection(minute), sunColor: renderer._sunColor, sunScale: renderer._sunScale }, _underLook), shared._dwFogP.oceanY, SHAFT_REACH_M, now / 1000);
      renderer.markForeignPass();
    }
  }
  function frameRigPhase(now, dt) {
    const { paralyzed, proj, view } = _fr;
    // C9: the exterior FP weapon - swings/sounds through the rig. The
    // open world still has no ACTION OBJECTS in melee reach, and that
    // is DFU's own shape above ground rather than a hole: there is no
    // action-object list out here for envAttack to walk, so
    // WeaponEnvDamage's exterior arm is AttemptExteriorDoorBash
    // (WeaponManager.cs:475 -> PlayerActivate.cs:1056-1079). ROAD-B
    // shipped that arm - static building doors are BASHABLE now, off
    // the no-enemy swing at the foot of this frame (:6442), through
    // the mode machine's `attemptExteriorDoorBash` - so the E-enter
    // seam is no longer their only door.
    // FS1: the two that rode along with it are not. "Melee strike
    // frames resolve to nothing" was written before G1/G4/X, and forty
    // lines below this comment a swing resolves against live guards,
    // then encounter foes, then wandering civilians; "targets pend the
    // RMB animal/exterior-foe arc" was written before AR1, and the
    // arrows.update call above hands foeTargets both live pools. A
    // sentence with one true clause kept two false ones alive.
    meterFor(renderer.gl)?.markCpu('rig');   // PERF-ZONE2: the magic, the weapon rig's frame and its draw - the Morrowind arm's pose, pack and upload live here
    const frameSpells = () => {   // PERF-V8
    if (walkMode && shared.playerSpawned) {
      // M2: the armed click's cast fires with the LIVE look; missiles
      // fly through this host's world every walk frame.
      if ((modes?.mode ?? 'exterior') === 'exterior') {
        const _mfwd = [Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)];
        magic.firePending([...cam.pos], _mfwd, gamePaused());   // AUDIT SPELL-HAND L4-6: a kept press never leaves under a window
        magic.update(dt, player.pos, _mfwd, player.height, player.feetAt());   // X11: the candle hangs off the look direction; DISC13-A off the render feet
        // Spells such as Gravity Well move deck bodies, so save their spots again or the carry undoes it.
        if (_deckBodies.size) navalLeash();
        { const mv = lycanthropeMoveSound(playerEntity, dt); if (mv != null) audio.playOneShot(mv, 1); }   // LM1: the beast's own noise while transformed (real time)
      }
      // U8h/AUDIT 17e F17: the worn-weapon bind moved INTO createWeaponRig
      // so all four hosts inherit it (the interior host was missing it).
      for (const ev of weaponRig.frame(dt, { paralyzed: paralyzed || knockedDown() })) {   // TELL6e: knocked down, no swing
        // AUDIT 23 (combat-2): the bow machine's frame-4 loose sound.
        if (ev === 'bowSound') { audio.playOneShot(SOUND.ArrowShoot, 1.1); continue; }
        if (ev !== 'hit') continue;
        // EVERY RANGED WEAPON, not only the bow: `isBowWeapon` is
        // "scored on Archery", which is what the Thunderlock is too.
        if (isBowWeapon(weaponRig.playerWeapon.weapon)) {
          const shot = { summoned: false };   // STUCK-ARROWS: DFU's isArrowSummoned, carried by the shaft
          if (spendAmmoFor(playerEntity.items, weaponRig.playerWeapon.weapon, shot)) {
            // AUDIT 23 (C14): the swing fatigue + the FULL bow tally
            // arm (Archery AND CriticalStrike) - see exterior.js.
            drainExteriorFatigue(SWING_FATIGUE_COST);
            tallySwingSkills(playerEntity, weaponRig.playerWeapon.weapon, weaponRig.playerWeapon.blowWeight);   // AUDIT PISTOLET A2: an off-hand shot counts as its blow weighs, as the other two hosts count it (THE FOUR HOSTS RULE)
            const fwd = [Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)];
            arrows.fire(cam.pos, fwd, { fromPlayer: true, weapon: weaponRig.playerWeapon.weapon, summoned: shot.summoned }); weaponRig.noteShot?.(weaponRig.playerWeapon.weapon);   // SPELLFX1: the peers draw it   // FIELD-GUN17: the barrel's own offset when the hand holds the gun, null for every bow - the rig answers, the lane forks   // #64: LastBowUsed rides the shaft - the impact prices off it   // ROAD-H H1c: ArrowFlight.fire applies GetAimPosition's player arm (the bow hand), as DFU's missile does its own
          }
          continue;
        }
        // C14: the melee swing's fatigue, unconditional.
        drainExteriorFatigue(SWING_FATIGUE_COST);
        // G1: melee swings resolve against live guards. G4: no guard
        // hit -> WANDERING townsfolk (civilian one-hit Murder +
        // response; wandering guard NPC -> Assault + conversion with
        // the swing carried onto the fresh foe).
        const lookFwd = [Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)];
        const guardHitSound = (g) => audio.play3d(hitSoundFor(weaponRig.playerWeapon.strikingWeapon), g.ai.feet, ENEMY_HIT_VOLUME, { maxDistance: 16 });   // DISC10-E: PlayHitSound(currentRightHandWeapon) (WeaponManager.cs:563-566) - the hand's item, never the claws marker
        // AUDIT 23 (combat-4): the host-side double tallies are gone -
        // resolvePlayerHit runs DFU's tally arm itself.
        // DISC19-F / FB0929: under friendly protection the watch's pool
        // spares the town's defenders on every pass (cityGuards
        // .resolvePlayerHit) - no pass offers them the swing alone.
        // AUDIT DISC19: `swing` is the one swing's token - the attack
        // grunt rolls in the first pool that has anyone, not in each.
        const swing = {};
        // DUEL1: my duel opponent first - a swing that reaches them is theirs (their client resolves it: net/duel/duelSession.js),
        // tallied as a connect, and no pool, civilian or door hears it
        const abilityBlow = weaponRig.playerWeapon.techniqueBlow?.ability;
        if (!abilityBlow && duelMeleeHit(cam.pos, makeInView(proj, view, multiply))) {
          tallySwingSkills(playerEntity, weaponRig.playerWeapon.weapon, weaponRig.playerWeapon.blowWeight);
          surfacePlayer();
        } else if (!cityGuards.resolvePlayerHit(weaponRig.playerWeapon, cam.pos, lookFwd, player.pos, makeInView(proj, view, multiply), guardHitSound, { swing })) {
          // X-slice: encounter foes resolve after the watch, before civilians
          if (exteriorFoes.resolvePlayerHit(weaponRig.playerWeapon, cam.pos, lookFwd, player.pos, makeInView(proj, view, multiply), guardHitSound, { swing })) {
            tallySwingSkills(playerEntity, weaponRig.playerWeapon.weapon, weaponRig.playerWeapon.blowWeight);
            surfacePlayer();
          } else if (!abilityBlow)
          cityGuards.resolveCivilianHit(weaponRig.playerWeapon, cam.pos, lookFwd, player.pos, livingStruckPool(_guardPool()),
            { onMurder: () => _crimeResponse(), onHitSound: guardHitSound, swing }).then((r) => {
            if (r?.carriedHit) tallySwingSkills(playerEntity, weaponRig.playerWeapon.weapon, weaponRig.playerWeapon.blowWeight);
            r ||= livingStrikeRoad(cam.pos, lookFwd);   // LW7: a swing that met nobody in the street, at the road's travellers - ROAD-SPARE: struck, spared, or nobody
            if (r?.crime || r?.struck) surfacePlayer();   // LW7: a traveller on the road, struck down
            // ROAD-B: WeaponManager.WeaponEnvDamage (:474-477) - a
            // swing that met no living thing is offered to the STATIC
            // DOORS, and a door under it is BASHED (PlayerActivate
            // .AttemptExteriorDoorBash). This is the input R1's flag
            // said the two bash arms were waiting for; outdoors there
            // is no action-object list for envAttack to walk, so the
            // door ray is the mode machine's.
            // AUDIT 23 (C9): the no-enemy swing sound at the hit frame -
            // and NOT when the env arm consumed the swing, which is
            // what WeaponEnvDamage returning true means (:1066).
            // AUDIT 29g: a swing that stopped on a spared body (r.spared) met someone - no door behind him is bashed
            else if (r?.spared || !modes?.attemptExteriorDoorBash?.(cam.pos, lookFwd)) audio.playOneShot(swingSoundFor(weaponRig.playerWeapon.weapon), 1.1);
          }).catch((e) => console.error('[civil]', e));
        } else if (weaponRig.playerWeapon.techniqueBlow) {
          // TECH1 (AUDIT): the watch took the swing - and a technique's blow strikes all it reaches, so the encounter foes
          // in its ring are offered it too (one swing: the watch's pool already tallied it and rolled its grunt - `swing`)
          if (exteriorFoes.resolvePlayerHit(weaponRig.playerWeapon, cam.pos, lookFwd, player.pos, makeInView(proj, view, multiply), guardHitSound, { swing })) surfacePlayer();
        }
      }
    }
    };
    frameSpells();
  }
  return { frameArrowsPhase, frameRigPhase };
}
