// The frame types the room's dispatcher looks up after the lease and freeze doors, in arm order.
import { worldFrame } from './world.js';
import { foesFrame } from './foes.js';
import { ownFrame } from './own.js';
import { hitFrame } from './hit.js';
import { tradeFrame } from './trade.js';
import { castFrame } from './cast.js';
import { cardFrame } from './card.js';
import { duelFrame } from './duel.js';
import { wedFrame } from './wed.js';
import { wdunFrame } from './wdun.js';
import { wildFrame } from './wild.js';
import { pageFrame } from './page.js';
import { parkFrame } from './park.js';
import { caravanFrame } from './caravan.js';
import { gateFrame } from './gate.js';
import { siegeFrame } from './siege.js';
import { arenaFrame } from './arena.js';
import { sevFrame } from './sev.js';
import { raidFrame } from './raid.js';
import { serpentFrame } from './serpent.js';
import { riteFrame } from './rite.js';
import { starFrame } from './star.js';
import { ktFrame } from './kt.js';
import { egFrame } from './eg.js';
import { sdFrame } from './sd.js';
import { raidtownsFrame } from './raidtowns.js';
import { owFrame } from './ow.js';
import { lookFrame } from './look.js';
import { actFrame } from './act.js';
import { stpFrame } from './stp.js';
import { findFrame } from './find.js';
import { cfgFrame } from './cfg.js';
import { socialFrame } from './social.js';
import { travFrame } from './trav.js';
import { partyFrame } from './party.js';
import { questFrame } from './quest.js';
import { amapFrame } from './amap.js';
import { whoFrame } from './who.js';
import { bardFrame } from './bard.js';
import { chatFrame } from './chat.js';
import { holdemFrame } from './holdem.js';
import { iliacFrame } from './iliac.js';
import { gambitFrame } from './gambit.js';
import { rollFrame } from './roll.js';
import { sayFrame } from './say.js';
import { narrateFrame } from './narrate.js';
import { stageFrame } from './stage.js';
import { muteFrame } from './mute.js';
import { banFrame } from './ban.js';
import { grantFrame } from './grant.js';
import { renownFrame } from './renown.js';
import { guildFrame } from './guild.js';
import { guildoutFrame } from './guildout.js';
import { homeFrame } from './home.js';

export const FRAMES = new Map([
  ['world', worldFrame],
  ['foes', foesFrame],
  ['own', ownFrame],
  ['hit', hitFrame],
  ['trade', tradeFrame],
  ['cast', castFrame],
  ['card', cardFrame],
  ['duel', duelFrame],
  ['wed', wedFrame],
  ['wdun', wdunFrame],
  ['wild', wildFrame],
  ['page', pageFrame],
  ['park', parkFrame],
  ['caravan', caravanFrame],
  ['gate', gateFrame],
  ['siege', siegeFrame],
  ['arena', arenaFrame],
  ['sev', sevFrame],
  ['raid', raidFrame],
  ['serpent', serpentFrame],
  ['rite', riteFrame],
  ['star', starFrame],
  ['kt', ktFrame],
  ['eg', egFrame],
  ['sd', sdFrame],
  ['raidtowns', raidtownsFrame],
  ['ow', owFrame],
  ['look', lookFrame],
  ['act', actFrame],
  ['stp', stpFrame],
  ['find', findFrame],
  ['cfg', cfgFrame],
  ['social', socialFrame],
  ['trav', travFrame],
  ['party', partyFrame],
  ['quest', questFrame],
  ['amap', amapFrame],
  ['who', whoFrame],
  ['bard', bardFrame],
  ['chat', chatFrame],
  ['holdem', holdemFrame],
  ['iliac', iliacFrame],
  ['gambit', gambitFrame],
  ['roll', rollFrame],
  ['say', sayFrame],
  ['narrate', narrateFrame],
  ['stage', stageFrame],
  ['mute', muteFrame],
  ['ban', banFrame],
  ['grant', grantFrame],
  ['renown', renownFrame],
  ['guild', guildFrame],
  ['guildout', guildoutFrame],
  ['home', homeFrame],
]);
