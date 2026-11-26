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
  const arenaHeal = () => {
    if (!(playerEntity.health > 0) || shared.modes?.deathUp?.()) return;
    playerEntity.health = playerEntity.maxHealth;
    playerEntity.fatigue = maxFatigue(playerEntity);
    playerEntity.magicka = playerEntity.maxMagicka ?? playerEntity.magicka;
    surfacePlayer();
  };

  const arenaBoutBegun = () => { const b = shared.arenaBouts.bout(); return shared.arenaBouts.hour() != null && !!b && !['call', 'walk', 'count'].includes(b.phase); };
  const _arenaCityC = [0, 0, 0];

  function arenaHeraldAct(a) {
    if (a === 'watch') {
      const ex = exhibitionFor(worldMinutes());
      if (!ex) return;
      if (shared.arenaOnline?.exhibitions?.() || shared.arenaOnline?.waiting?.()) { shared.arenaBouts.dismiss(); shared.arenaOnline.watchExhibition(ex); return; }
      const no = shared.arenaGate.watchRefusal(ex.hour); if (no) { townTalk.say(no); return; }
      shared._arenaHourRun = ex.hour;
      shared.arenaBouts.dismiss();
      shared.arenaBouts.ask({ where: 'floor', kind: 'exhibition', ex });
      shared.modes?.enterArenaFloor?.('watch');
    } else if (a === 'fight') {
      if (shared.arenaOnline?.live() || shared.arenaOnline?.waiting()) { const r = shared.arenaOnline.fightLadder(); if (!r.ok && r.text) townTalk.say(r.text); return; }
      const next = nextLadderBout(arenaLadderRestore(playerEntity.arenaLadder));
      if (!next) return;
      shared.arenaBouts.ask({ where: 'floor', kind: 'ladder', next });
      shared.modes?.enterArenaFloor?.('ladder');
    } else if (a === 'hall') shared.modes?.enterArenaUndercroft?.();
    else if (a === 'window') shared.arenaGate.openWindow('bouts');
    else if (a === 'replay' || String(a).startsWith('replay:')) {
      const rec = arenaReplaysRestore(playerEntity.arenaReplays)[Number(String(a).split(':')[1] ?? 0) || 0];
      if (!rec) return;
      shared.arenaBouts.dismiss();
      if (shared.arenaBouts.askReplay(rec)) shared.modes?.enterArenaFloor?.('watch');
    }
  }

  function ejectFromCourt(words) {
    const g = shared.modes?.gateArenaGate?.() ?? null;
    if (!g) return;
    // A dead player respawns instead of landing before the gate; landed at zero health, the next frame would kill
    // them again.
    if (!(playerEntity.health > 0) || shared.modes?.deathUp?.()) { respawnOnlinePlayer(); return; }
    shared.gateVeil?.flash();
    shared.modes?.forceExitToExterior?.();
    landBeforeGate(g);
    shared.gateLink?.leave();
    setMidScreenText(words);
  }

  // Receipt lifetimes use the relay's clock, since the relay stamped them and a device clock can run ahead; null
  // until a welcome sets the offset.
  const relayNowS = () => (shared._sharedClockHeard ? Math.floor((Date.now() + shared._sharedOffsetMs) / 1000) : null);

  // Outside its court a receipt's spoils go straight into the pack; the spoils pool records spent receipts, so each
  // grants once.
  function grantSpoilsOutside(r) {
    const c = readReceipt(r);
    if (!c || !shared.spoilsPool || shared.modes?.gateArenaDay?.() === c.d) return;
    spoilsLock(() => shared.spoilsPool.grant({ day: c.d, seed: c.c, level: spoilsLevel(playerEntity.level ?? 1, c.l), acct: c.s, claims: c, text: c.x === 'rite' ? SPOILS_TEXT.rite : SPOILS_TEXT.granted }))
      .catch((e) => console.warn('[gate] spoils', e?.message ?? e));
  }
  function grantRaidSpoils(entry) {
    const c = readRaidReceipt(entry?.r);
    if (!c) return;
    const level = Math.max(1, Math.floor(Number(entry.lv) || playerEntity.level || 1));
    spoilsLock(() => shared.raidSpoils.grant({ day: raidSpoilsDay(c.w), acct: c.s, roll: () => raidSpoilsList(c.c, level, c.y, typeof entry.hd === 'boolean' ? entry.hd : raidWasHeld(c.w)), text: RAID_SPOILS_TEXT.granted,
      owner: entry.ch, kept: RAID_SPOILS_TEXT.kept(entry.nm) }))
      .catch((e) => console.warn('[raid] spoils', e?.message ?? e));
  }

  function grantSerpentSpoils(entry) {
    const c = readSerpentReceipt(entry?.r);
    if (!c) return undefined;
    const level = spoilsLevel(entry.ch === characterIdOf(playerEntity) ? playerEntity.level ?? 1 : Number(entry.lv) || c.l || 1, c.l);
    // A failed grant leaves the receipt unsettled so the carrier asks again.
    const boss = serpentBossById(c.b);
    return spoilsLock(() => shared.serpentSpoils.grant({ day: serpentSpoilsDay(c.d), acct: c.s, roll: () => serpentSpoilsList(c.c, level, c.x), text: SERPENT_SPOILS_TEXT.granted(boss),
      owner: entry.ch, kept: SERPENT_SPOILS_TEXT.kept(entry.nm, boss) }));
  }
  return {
    _arenaCityC, arenaBoutBegun, arenaHeal, arenaHeraldAct, ejectFromCourt, grantRaidSpoils, grantSerpentSpoils,
    grantSpoilsOutside, relayNowS,
  };
}
