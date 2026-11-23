// The world's arena and spoils grants: the arena's heal, its bout check, and the Herald's choices,
// a forced exit from a gate's court, and the relay's clock in seconds. It also holds the gate,
// raid, and serpent spoils grants. The online hosts and the claim clients stay in the world.
import { arenaLadderRestore, exhibitionFor, nextLadderBout } from '../arena/arenaLadder.js';
import { arenaReplaysRestore } from '../arena/arenaReplay.js';
import { characterIdOf } from '../characters/characterId.js';
import { maxFatigue } from '../characters/statMods.js';
import { playerEntity, surfacePlayer } from '../characters/playerEntity.js';
import { RAID_SPOILS_TEXT, raidSpoilsDay, raidSpoilsList } from '../worldEvents/raidSpoils.js';
import { raidWasHeld } from '../worldEvents/raidingParties.js';
import { readRaidReceipt } from '../net/raidReceipt.js';
import { readReceipt } from '../net/gateReceipt.js';
import { readSerpentReceipt } from '../net/serpentReceipt.js';
import { SERPENT_SPOILS_TEXT, serpentSpoilsDay, serpentSpoilsList } from '../worldEvents/serpentSpoils.js';
import { serpentBossById } from '../net/serpentLaw.js';
import { setMidScreenText } from '../ui/midScreenText.js';
import { SPOILS_TEXT, spoilsLevel, spoilsLock } from '../worldEvents/spoilsPool.js';
import { worldMinutes } from './worldTick.js';

/** @param {any} shared */
export function createArenaGrantsWorld(shared) {
  const { landBeforeGate, respawnOnlinePlayer, townTalk } = shared;
  /** The healers (the duel's own heal, said by the Herald rather than the duel's line). */
  const arenaHeal = () => {
    if (!(playerEntity.health > 0) || shared.modes?.deathUp?.()) return;
    playerEntity.health = playerEntity.maxHealth;
    playerEntity.fatigue = maxFatigue(playerEntity);
    playerEntity.magicka = playerEntity.maxMagicka ?? playerEntity.magicka;
    surfacePlayer();
  };

  /** The exhibition standing here has had the word (the book on it is shut) - ARENA4b: this screen's own or the relay's
   *  mirrored (each carries its hour). */
  const arenaBoutBegun = () => { const b = shared.arenaBouts.bout(); return shared.arenaBouts.hour() != null && !!b && !['call', 'walk', 'count'].includes(b.phase); };
  /** THE CITY'S FLOOR as a stage: the colosseum's sand where its block stands in a built pixel (null off it), its
   *  fighters through this host's own pool - `loose` (no cap), `transient` (no save holds them), `managed` (no cull),
   *  no champion, no loot - and the ground under a seat asked of the collider from above. */
  const _arenaCityC = [0, 0, 0];

  /** WHAT THE HERALD DOES on a choice - his own, and the Arena window's Watch and Fight (scenes/arena/arenaGate.js): to the
   *  floor's instance to watch the hour's exhibition or fight the ladder's next bout, down to the fighters' hall, or
   *  (ARENA3) the Arena window. */
  function arenaHeraldAct(a) {
    if (a === 'watch') {
      const ex = exhibitionFor(worldMinutes());
      if (!ex) return;
      if (shared.arenaOnline?.exhibitions?.() || shared.arenaOnline?.waiting?.()) { shared.arenaBouts.dismiss(); shared.arenaOnline.watchExhibition(ex); return; }   // ARENA4b: the relay's bout, from the stands of its room; ARENA-WAIT: waited for
      const no = shared.arenaGate.watchRefusal(ex.hour); if (no) { townTalk.say(no); return; }   // AUDIT PRE-MERGE 1003 B3: an hour seen here is never fought again from its call
      shared._arenaHourRun = ex.hour;
      shared.arenaBouts.dismiss();
      shared.arenaBouts.ask({ where: 'floor', kind: 'exhibition', ex });
      shared.modes?.enterArenaFloor?.('watch');
    } else if (a === 'fight') {
      // ARENA4: ONLINE THE LADDER IS THE ACCOUNT'S - its next bout fought on the relay (scenes/arena/arenaOnline.js)
      if (shared.arenaOnline?.live() || shared.arenaOnline?.waiting()) { const r = shared.arenaOnline.fightLadder(); if (!r.ok && r.text) townTalk.say(r.text); return; }   // FIELD BUGS 2026-10-16b ARENA-WAIT: never the save's ladder on the online lane
      const next = nextLadderBout(arenaLadderRestore(playerEntity.arenaLadder));
      if (!next) return;
      shared.arenaBouts.ask({ where: 'floor', kind: 'ladder', next });
      shared.modes?.enterArenaFloor?.('ladder');
    } else if (a === 'hall') shared.modes?.enterArenaUndercroft?.();
    else if (a === 'window') shared.arenaGate.openWindow('bouts');   // ARENA3
    else if (a === 'replay' || String(a).startsWith('replay:')) {
      // ARENA5: YOUR LADDER REPLAY (systems/arena/arenaReplay.js) - a bout the records keep (the newest, or the Records page's
      // pick), watched from the stands of the floor's instance
      const rec = arenaReplaysRestore(playerEntity.arenaReplays)[Number(String(a).split(':')[1] ?? 0) || 0];
      if (!rec) return;
      shared.arenaBouts.dismiss();
      if (shared.arenaBouts.askReplay(rec)) shared.modes?.enterArenaFloor?.('watch');
    }
  }

  /** WB3b: out of the court by force - its gate's day is over, or online is gone (the court is online's alone) - landed
   *  before its gate, its state forgotten, the reason said. */
  function ejectFromCourt(words) {
    const g = shared.modes?.gateArenaGate?.() ?? null;
    if (!g) return;
    // AUDIT WB B1: a player dead in the court when it is taken from them is cast out ALIVE, by the death's own door (the
    // heal first - MAC-D3's order - then before the gate): landed at no health, the next frame's watcher would kill
    // them again in Tamriel and send them to a temple
    if (!(playerEntity.health > 0) || shared.modes?.deathUp?.()) { respawnOnlinePlayer(); return; }
    shared.gateVeil?.flash();   // WB6c: the court comes apart in fire
    shared.modes?.forceExitToExterior?.();
    landBeforeGate(g);
    shared.gateLink?.leave();
    setMidScreenText(words);
  }

  /** AUDIT ONLINE2 F2: THE RELAY'S CLOCK, in seconds - null until a welcome has said it. A receipt's life is the relay's
   *  (it stamped it); a device a week ahead of it let every receipt go unasked, its Renown never counted. */
  const relayNowS = () => (shared._sharedClockHeard ? Math.floor((Date.now() + shared._sharedOffsetMs) / 1000) : null);

  /** AUDIT WB A2: THE SPOILS WITH NO FLOOR - a receipt that comes while this player is not in its court (cast out before
   *  the kill, gone, handed it by the hub's next hello) is its spoils straight into the pack; in its court the burst
   *  gives them. Once a receipt either way - the pool keeps which are spent. */
  function grantSpoilsOutside(r) {
    const c = readReceipt(r);
    if (!c || !shared.spoilsPool || shared.modes?.gateArenaDay?.() === c.d) return;
    spoilsLock(() => shared.spoilsPool.grant({ day: c.d, seed: c.c, level: spoilsLevel(playerEntity.level ?? 1, c.l), acct: c.s, claims: c, text: c.x === 'rite' ? SPOILS_TEXT.rite : SPOILS_TEXT.granted }))   // AUDIT WBX S2: never past the level the fight admitted; WB12d: the rite's ember
      .catch((e) => console.warn('[gate] spoils', e?.message ?? e));
  }
  /** RAID4b: A TOWN'S THANKS, off a receipt the relay signed at the cleanse - AUDIT RAID R4: given when the account
   *  service says this claim is the (raid, account)'s (net/raid/raidClaims.js onSpoils: a second browser, a phone or a hub's
   *  hello handing the receipt again is answered no), rolled at the level the character fought at, straight into the
   *  pack when that character stands here - else kept on the device for it, as a crash's record is - once a receipt and
   *  account, one tab at a time. */
  function grantRaidSpoils(entry) {
    const c = readRaidReceipt(entry?.r);
    if (!c) return;
    const level = Math.max(1, Math.floor(Number(entry.lv) || playerEntity.level || 1));
    spoilsLock(() => shared.raidSpoils.grant({ day: raidSpoilsDay(c.w), acct: c.s, roll: () => raidSpoilsList(c.c, level, c.y, typeof entry.hd === 'boolean' ? entry.hd : raidWasHeld(c.w)), text: RAID_SPOILS_TEXT.granted,
      owner: entry.ch, kept: RAID_SPOILS_TEXT.kept(entry.nm) }))   // AUDIT WORLD-EVENTS L3-14: held as the receipt came, for the character that fought (`hd`)
      .catch((e) => console.warn('[raid] spoils', e?.message ?? e));
  }

  function grantSerpentSpoils(entry) {
    const c = readSerpentReceipt(entry?.r);
    if (!c) return undefined;
    // AUDIT SERPENT D2: never past the level the fight admitted (the receipt's), nor the standing character's own
    const level = spoilsLevel(entry.ch === characterIdOf(playerEntity) ? playerEntity.level ?? 1 : Number(entry.lv) || c.l || 1, c.l);
    // AUDIT SERPENT D6: its promise is the carrier's - a grant that fails leaves the receipt unsettled, asked again
    const boss = serpentBossById(c.b);
    return spoilsLock(() => shared.serpentSpoils.grant({ day: serpentSpoilsDay(c.d), acct: c.s, roll: () => serpentSpoilsList(c.c, level, c.x), text: SERPENT_SPOILS_TEXT.granted(boss),
      owner: entry.ch, kept: SERPENT_SPOILS_TEXT.kept(entry.nm, boss) }));
  }
  return {
    _arenaCityC, arenaBoutBegun, arenaHeal, arenaHeraldAct, ejectFromCourt, grantRaidSpoils, grantSerpentSpoils,
    grantSpoilsOutside, relayNowS,
  };
}
