// ONLINE1 (2026-09-12): THE RELAY - a Cloudflare Worker and its Room
// Durable Object. The law is in relay.js (the port's own src/net/wire.js,
// pure, tested); this file is the I/O: the upgrade, the hibernatable
// sockets, the fan-out. test/server/online_relay.test.js drives the Room over
// fake sockets and a fake state.
//
// AUDIT ONLINE (2026-09-12): the room's key rides every socket's
// attachment, not the instance (D10/E4/A1: a hibernated object wakes
// with no instance state, and `this.key` gone turned the range gate off
// for the whole cell); a socket replaced by a reconnect with its own id
// and secret loses the id BEFORE it closes, so its leave is never
// broadcast (B6/A2: the reconnected player was joined then left, and
// vanished for everyone); an id the room holds is guarded by the
// secret its first hello minted (A3: any client could kick and
// impersonate any peer); the look lives in the object's storage, not
// the attachment (A4: an attachment is bounded; a hello that overflowed
// it threw after the eviction had already run); the roster is the
// nearest ROSTER_MAX (A5); hellos are gated per room and sockets capped
// (A6); the attachments are read once into an index, not once per
// socket per pose (A7); the payload is stringified once (A9); a failed
// send closes the socket rather than passing for a delivery (A10); an
// over-rate socket that keeps sending is closed (A8), and pings are
// answered by the runtime while the object sleeps.
//
// CHAT1 (2026-09-12): a room in CHAT_ROOMS is a channel (relay.js, CHAT
// ROOMS) - a hello there keeps the secret and nothing else (ROSTER-G: and
// is told who is in the channel by NAME, cut at CHAT_ROSTER_MAX with the
// true count beside it, and its join and leave are said - the roster
// beside the chat is everyone online), a pose there reaches no one,
// and a chat line reaches every socket that said hello, the sender
// included; in a place room a chat line reaches whoever a pose would
// and the sender. The chat gate is CHAT_HZ_MAX a second per socket with
// its own strikes; a chat room holds CHAT_SOCKETS_MAX sockets. The chat
// client heartbeats with pings, which the runtime answers while the
// object sleeps.
//
// AUDIT CHAT (2026-09-12, before the merge): a channel is a whitelist,
// not a prefix, and the Worker opens no object for a chat: key it does
// not know (A1); its hello gate is never off - CHAT_HELLO_HZ_MAX, deeper
// than a place's, because a hello there costs no roster (A1); the room
// spends CHAT_ROOM_HZ_MAX lines a second for everyone, over which a
// line is dropped and no strike counted - the sender's missing echo is
// the word (A2); a pose or a ping is gated and counted BEFORE a channel
// declines to relay it, so ungated ingress is not a channel's privilege
// (A3); a room that drains sweeps its own storage on the way out, since
// a channel never empties on the way in (A7).
//
// WORLD1 (2026-09-12): THE ROOM'S MEMORY. A world room (relay.js
// isWorldRoom - a dungeon by map id) keeps its world in storage under
// world:meta and world:<n> chunks, published by the room's HOST - the
// hello'd socket in the room longest (its hello's stamp rides the
// attachment, so a wake recomputes it, and a reconnect keeps it, so a
// blip keeps the seat - AUDIT WORLD A4) - at most one frame in
// WORLD_MIN_MS of the room's last (the stamp in storage, A5), the
// socket's one FINAL frame excepted (the farewell on the way out, B5);
// from anyone else ignored, and never parsed: a large frame is
// answered before the parse and metered on the pose bucket, or the
// stream's own for a foes frame (A1; AUDIT WORLD2 A3 re-meters a frame
// whose type disagrees with its prefix, A4 refuses one outside a world
// room and strikes a non-host's stream of them). A
// joiner's welcome carries the stored world as it came (spliced in
// raw: the relay parses no world twice) and the host's id; a host
// change is a host frame to everyone. The sweeps that forget a room's
// looks and secrets (the empty hello, the drain) forget those and the
// hello bucket ALONE - the world outlives an empty room, which is the
// whole point of it - until WORLD_TTL_MS after the room last drained
// with no one back (the alarm, A3).
//
// WORLD2 (2026-09-12): THE LIVE FOES. The host streams its changed
// foes ({t:'foes', data}, FOES_HZ_MAX a second on the stream's own
// bucket - _meterFoes) and the room fans them to everyone hello'd but
// the host, under a byte budget on the instance (_roomFoes,
// FOES_ROOM_BYTES_PER_S: the frame times its listeners - AUDIT WORLD2
// A5); a non-host's is ignored unparsed at the door. A blow on the
// host's foe ({t:'hit', data}, on the pose bucket) from anyone but the
// host goes to the host's socket alone, under the room's hit budget
// (the destination socket's own `hbucket`, HIT_ROOM_HZ_MAX - A6; AUDIT WORLD6b A1). The relay reads neither.
//
// WORLD3 (2026-09-12): THE LIVE DOORS, and WORLD4 (2026-09-13): THE
// ROOM'S LOOT. A change to the room's doors, levers, movers and
// containers ({t:'act', data}, on its own bucket - _meterActs,
// ACT_HZ_MAX - so a door never starves a pose) from anyone hello'd in a
// world room goes to everyone hello'd but its author, under the room's own
// budgets (_roomActs ACT_ROOM_HZ_MAX frames, _roomActBytes
// ACT_ROOM_BYTES_PER_S bytes times its listeners - AUDIT WORLD3 A1, the
// foes fan's law); over either the frame is dropped and nobody struck. Not the host's alone: a door is whoever
// touched it. The relay reads none of it.
//
// AUDIT WORLD34 (2026-09-13, Mac: "enemies, doors, and everything else
// doesn't persist between connected players"): the root was the wire's
// own law (relay.js isWorldRoom: eight digits, and a real map id has
// nine or ten), so nothing here changed for it - but the relay must be
// REDEPLOYED, since it refuses by the same regex. Three relay findings
// beside it: a socket the ROOM closes (a refusal, a failed send) got no
// webSocketClose from the runtime, so its leave and its seat were never
// said and the survivors kept a phantom host (D1 - every door out of the
// object now reaps through _leave); the memory's floor read the room's
// last stamp whoever wrote it, so a new host's first publish after a
// handover was dropped while its client believed it went (D2 - the
// floor is per author); and the memory rode the welcome ALONE, so two
// players entering together were both handed null and never re-synced
// (C1 - a stored memory is now pushed once to every hello'd socket whose
// welcome carried none, as {t:'world', id, data}). /health says which
// relay this is (RELAY_VERSION), so a stale deploy can be told from a
// browser tab.
//
// WORLD5 (2026-09-13): THE SHARED CLOCK is a function of wall time (relay.js
// sharedClassicMinutes) and needs no frame; the welcome carries the relay's
// own `now` so a client corrects for its machine's clock. Nothing else here.
//
// SOC1 (2026-09-16, Mac: "A social button next to the chat UI ... friend
// other users, see if they are online/last online + be able to invite
// friends or other individuals to the new 4 person party system"): THE
// HUB. The world channel's object (relay.js SOCIAL_ROOM - the one room
// every player online is in) keeps the social state in its storage:
// acct:<id> an account's record (its last name, when it was last seen,
// its friends, its requests each way, its party invites, its party),
// asecret:<id> the account's secret (the first hello mints it, a later
// one must match - a hello that fails it is admitted WITHOUT its
// account and told so), party:<id> a party (its leader, its members in
// join order, its invites out, its seats gone away). A hello there that
// names an account is handed its whole picture ({t:'social', k:'state'})
// and every friend and party member hears it came ({k:'presence'} to
// the friends, {k:'party'} to the party); a leave stamps last-seen and
// says the same. An act ({t:'social', k}) rides the acts' own bucket
// (_meterSocial, SOCIAL_HZ_MAX) under the room's own budget
// (SOCIAL_ROOM_HZ_MAX), and a refused act is answered in words
// ({k:'error', m}) - a full friend list is not a protocol violation and
// closes nothing. A party pose ({t:'party', p}, _meterParty) is kept on
// the sender's attachment (`pm`) and fanned to its party's other
// members alone. Presence rooms are untouched: nothing a client says in
// a cell makes it anyone's friend or party. Parties are forgotten when
// the hub drains (the sweep); accounts never are.
//
// AUDIT SOC (2026-09-16, Mac: "Can we do an audit of everything just
// merged. Just want it to be perfection"): four lenses read the arc as
// merged and the hub's holes were these, every one measured over the
// fake object or workerd. A1 a friend request and its cancel were a
// 40x amplifier aimed at one player (a state frame and a chat line at
// the target per act, outside the chat's room-wide law because a note
// is DIRECTED) - one act of a kind at the same target per
// SOCIAL_REPEAT_MS per account now, and an invite the same (A8). A2
// three arms let a storage throw out of the door while the two beside
// them were wrapped - all five contain now. A3 one script at the hello
// gate's rate minted 4.3 million permanent accounts a day - the alarm
// sweeps, a page at a time, accounts NOBODY'S LIST NAMES and nobody has
// seen for ACCOUNT_IDLE_MS, and parties whose every seat has lapsed
// (A4: a party of one whose maker never returns was reachable by
// nothing), and the drain's sweep lists in pages. A5 one act read ~500
// keys - a state frame for an account with no socket is composed no
// more (it reached nobody), the invites' parties are read in one batch,
// a missing party is a cached miss, and the records an awake object has
// read are kept on it. A6 a stranger could take the hub's presence and
// live peer ids off an unaccepted request - a request or an invite BY
// ACCOUNT needs a relation (a request back, a friend), and a pending
// row carries a name and nothing else. A7 a socket REPLACED by a hello
// naming another account (or none) never ran its account's leave, so
// its seat could never lapse - it leaves at the replacement. A10 the
// tab bound is the hub's (ACCOUNT_TABS_MAX sockets fanned to), A11 the
// refusals are budgeted. B7 the channel's welcome carries the relay's
// clock (`now`), so the hub link reads last-seen on the relay's time
// without the presence session's welcome. B9 two tabs of one account
// in one party fought over the seat's pose - the NEWEST tab speaks for
// the seat. C20 the picture names my own tabs (`peers`), so a second
// tab of mine is no stranger to friend.
//
// ONE-SEAT (2026-09-27, Mac: "the player can only have one character only at a time. Like they shouldnt be able to
// open multiple tabs and join as different characters"): ONE TAB OF AN ACCOUNT ONLINE, decided at the hub - the one
// room every online tab holds - by the token's verified subject. A hub hello that CLAIMS (`cl`, a tab going online)
// closes the account's other tabs in the hub (CLOSE_REPLACED, SEAT_ELSEWHERE said first); one that does not is a
// reconnect, refused while another tab of the account holds the hub. The other rooms are not asked: the client that
// honours the hub's close leaves them all (net/online.js `superseded`), and a gate's court keeps its own one seat.
// ═══ ACC1d: THE RELAY VERIFIES THE NAME IT IS TOLD ════════════════
//
// THIS IMPORT IS THE EXPENSIVE LINE IN THE ARC. It puts
// src/net/identityToken.js in RELAY_GRAPH, so SLAM8's hash changes,
// RELAY_VERSION bumps, and the deploy drops every connected player.
// ACC0 chose two Workers so that account work would NOT cost this; the
// token seam is the one piece that has to be paid for, and it is paid
// once here rather than a little at a time.

// ═══ SCALE2b (2026-10-04): the relay's half of the scale arc - its constants and helper in ./relayScale.js ═══
import { PARTIES_MAX, HUB_KEEP_MAX, Bounded, RoomMetrics, countedState } from './relayScale.js';

// SERPENT1 (2026-10-04, Mac: "a new world event that requires players with a ship to meet up and take on a large scale
// sea serpent in the ocean"): FOUR FILES JOIN THE BUNDLE - net/serpent/serpentLaw.js (the day's window - it imports wire.js and
// gateLaw.js, both here), net/serpent/serpentBody.js and net/serpent/serpentBrain.js (the body and the fight, pure law - they import
// each other alone) and net/serpent/serpentReceipt.js (the kill's receipt under the gate's one key). The fight lives in the cell
// its site stands in (bible/11-Multiplayer/Sea-Serpent.md section 6).
// SERPENT2 (2026-10-04, the owner: "the discord integration needs to happen"): ONE FILE JOINS THE BUNDLE -
// net/serpent/serpentHerald.js (the serpent's Discord posts and when they are owed, pure law - it imports serpentLaw.js,
// gateHerald.js and wire.js, all here). The hub posts off its own alarm, beside the gate's herald.
// RAID3 (2026-09-27, Mac, on World Events - Raiding Parties online: "1. Server"): TWO FILES JOIN THE BUNDLE -
// net/raid/raidLaw.js (a town raid's ledger, pure law - it imports nothing) and net/raid/raidReceipt.js (a raid's receipt, the
// relay's second signature under the gate's one key - it imports identityToken.js and raidLaw.js, both here).
// bible/03-World/Raiding-Parties.md, "The relay holds the raid (RAID3)".
// STAR3 (2026-10-20, the owner: "something coming from the sky and crashing into the ground, where people need to defend
// the objective in a wave based format with a boss topping off the encounter at the end"): TWO FILES JOIN THE BUNDLE -
// net/starfall/starfallLaw.js (when a star falls, where in its pixel, and the ledger its cell keeps - pure law, it imports
// wire.js and gateLaw.js, both here) and net/starfall/starReceipt.js (a star held, the relay's signature again under the
// gate's one key - it imports identityToken.js and starfallLaw.js). bible/11-Multiplayer/Starfall.md section 5.
import { STAR_LEDGERS_MAX } from './relay.js';
// DISCORD-GATES (2026-09-28, Mac: "Discord live gates?" - the omen, 15 minutes before, pinging an opt-in role, and the
// boss slain): ONE FILE JOINS THE BUNDLE - net/gate/gateHerald.js (the posts and when they are owed, pure law - it imports
// gateLaw.js and wire.js, both here). The hub posts off its own alarm; bible/11-Multiplayer/World-Bosses.md, "THE
// HERALD".
// HERALD-CARDS (2026-10-22, the owner: "overhaul our discord world event notification system to be more organized"):
// net/herald/heraldCard.js JOINS THE BUNDLE - every herald's post is one card built there (a family's colour, the moment's
// title, its facts as fields), and each family may post to a thread of its own (a relay setting over its var: gateThread,
// serpentThread, sdThread, egThread - net/relayCfg.js), the gate's thread else, the channel itself with none.
// OW6L (2026-09-29, the product owner: "Everything needs that persistence between players in the overworld."): ONE FILE
// JOINS THE BUNDLE - net/overworldLaw.js (a cell's overworld ledger: the bands and raiders spent in it, its spawned
// dungeons' clocks - pure law; it imports wire.js, gateLaw.js and raidLaw.js, all three here already).
// ARENA4 (2026-10-02, Mac: "watch AI fights, player fights, join a team (red and blue) and climb esclating tiers of
// opponents, or choose to matchmake for a real opponent to take on in real time"): FOUR FILES JOIN THE BUNDLE -
// net/arena/arenaLaw.js (the rooms, the season, the rating, the queue, the referee's numbers, the words both ways - it imports
// nothing), net/arena/arenaBrain.js (one bout on the relay: the law, the referee, the ladder's AI fighters), the bout law it
// runs (systems/arena/arenaBout.js - pure, and it reaches net/duel/duelSession.js, which reaches wire.js) and net/arena/arenaReceipt.js (a
// bout's receipt, the relay's third signature under the gate's one key). bible/11-Multiplayer/Arena.md "7. Online".
// ARENA4b (2026-10-03, Arena.md 2: "Exhibition - online: yes - the relay runs it, every client sees one bout"): ONE FILE
// JOINS THE BUNDLE - net/arena/arenaExhibition.js (the hour's exhibition as law: the schedule, the pair, the bout's id - moved
// out of systems/arena/arenaLadder.js, which hands it on; it imports arenaLaw.js, here already, and systems/wind/wind.js's seeded
// die, which imports nothing) - and the hour's room `arena:x<hour>` stands beside the bouts'.
// ARENA6 (2026-10-03, the owner: "a way to simply host private matches"): NO FILE JOINS - a private session's room
// `arena:p<code>` (net/arena/arenaLaw.js) is a floor room whose bouts its host calls, its session's law in net/arena/arenaBrain.js.

import { RECS_MAX, RAID_CACHE_MAX, COOL_MAX } from './room/limits.js';
import { GrantPart } from './world/grant.js';
import { installParts } from './room/install.js';
import { OverworldPart } from './world/overworld.js';
import { AccountsPart } from './social/accounts.js';
import { PartiesPart } from './social/parties.js';
import { FriendsPart } from './social/friends.js';
import { GambitPart } from './games/gambit.js';
import { IliacPart } from './games/iliac.js';
import { HoldemPart } from './games/holdem.js';
import { ArenaPart } from './games/arena.js';
import { SessionPart } from './games/session.js';
import { SiegePart } from './pvp/siege.js';
import { DuelPart } from './pvp/duel.js';
import { RoyalPart } from './pvp/royal.js';
import { RaidPart } from './world/raid.js';
import { RitePart } from './world/rite.js';
import { StarPart } from './world/star.js';
import { WildPart } from './world/wild.js';
import { SeaPart } from './world/sea.js';
import { WdunPart } from './world/wdun.js';
import { SdPart } from './world/sd.js';
import { SdFightPart } from './world/sdFight.js';
import { EgPart } from './world/eg.js';
import { KetchPart } from './world/ketch.js';
import { MinePart } from './world/mine.js';   // BUNNYFALL (2026-11-25, caverns): a mine's shared state
import { ConfigPart } from './world/config.js';
import { LeasePart } from './world/lease.js';
import { BodyPart } from './world/body.js';
import { GatePart } from './world/gate.js';
import { SerpentPart } from './world/serpent.js';
import { HeraldPart } from './world/herald.js';
import { LawPart } from './room/law.js';
import { MetersPart } from './room/meters.js';
import { CaravanPart } from './world/caravan.js';
import { ParkPart } from './world/park.js';
import { GuildWordsPart } from './social/guildWords.js';
import { ChatLinesPart } from './social/chatLines.js';
import { StorePart } from './room/store.js';
import { FoesPart } from './room/foes.js';
import { SendPart } from './room/send.js';
import { SeatsPart } from './room/seats.js';
import { ReadsPart } from './room/reads.js';
import { SocketsPart } from './room/sockets.js';
import { FanPart } from './room/fan.js';
import { RepeatPart } from './social/repeat.js';
import { PollPart } from './room/hub/poll.js';
import { WhoPart } from './room/hub/who.js';
import { HubHelloPart } from './room/hub/hello.js';
import { CourtPart } from './room/hub/court.js';
import { ShardPart } from './room/hub/shard.js';
import { BusPart } from './room/hub/bus.js';
import { LifecyclePart } from './room/lifecycle.js';
import { EntryPart } from './message/entry.js';
import { PosePart } from './message/pose.js';
import { DispatchPart } from './message/dispatch.js';
import { AlarmPart } from './room/alarm.js';
import { DoorsPart } from './room/doors.js';

// AUDIT WORLD34 D4: the relay names itself in /health. SLAM13 (AUDIT SLAM A5): the name lives in net/wire.js, so the
// welcome can carry it; /health reads it through the import above. LOCALDEV1: it is NOT re-exported from this module -
// workerd (wrangler dev, 1.20260911) refuses a worker entry whose named export is a string ("Incorrect type for map
// entry 'RELAY_VERSION': the provided value is not of type 'function or ExportedHandler'"), so the local relay would
// not start at all. The production runtime let it through, which is why nothing caught it; the pins read wire.js.

export { default } from './worker/entry.js';


export class Room {
  constructor(state, env) {
    this._metrics = new RoomMetrics();   // SCALE2b: the room's counts, written to Analytics Engine a window at a time (relayScale.js)
    this._kind = null;                   // SCALE2b: the room's kind for a metric, from the first attachment it reads
    // Storage counts reach only the METRICS point, so without that binding the proxy is skipped.
    this.state = env?.METRICS ? countedState(state, this._metrics) : state;
    // ACC1d: the runtime hands a Durable Object (state, env) and this
    // class had been taking the first alone. The public key and the TTL
    // ceiling are config (bible ACC1d D2/D3), so the object needs it.
    this.env = env ?? {};
    /** The verifying key, imported once per instance. A CryptoKey
     *  cannot be stored, so this is memory and dies with the object -
     *  which is right: it is derived from a config string that cannot
     *  change without a deploy, and a deploy is a new object. */
    this._verifyKey = undefined;   // undefined = not tried, null = there is none
    /** SEAT1b (Seats-Arc 4.2): THE WATCH - each verified account's last tick and last move in this room, ms. Memory: a
     *  deploy or an eviction forgets it, and the next pose that moves starts it again (the account service's daily cap is
     *  what bounds the ticks, never this). Bounded by the room's own sockets, the oldest let go past SOCKETS_MAX. */
    this._watch = new Map();
    /** ACC1d/F8: THE SIGNATURES THIS ROOM HAS ALREADY HONOURED, and
     *  when each stops mattering. A token is spent once (Mac). PER-ROOM
     *  and in memory, because the relay has no global state a hello
     *  could touch without becoming the bottleneck ACC0 refused for
     *  provider links - the record says exactly what that does and does
     *  not close. */
    this._spent = new Map();
    this._owed = new Map();    // SCALE5b: the second wire's batch - socket -> what the room has said it and not yet sent (`_owe`)
    this._owedSoon = null;     // SCALE5b: the batch's timer while a pose is owed (POSE_BATCH_MS)
    this._owedLate = null;     // SCALE5b: and while only a channel's roster is (ROSTER_BATCH_MS)
    /** MOD1: THE NEWEST MUTE ORDER THIS ROOM HAS APPLIED, per account -
     *  `{i, mu, sig}`. Two jobs: an order older than one already applied
     *  is ignored (so a replayed mute cannot undo an unmute inside its
     *  minute), and a hello whose token was minted BEFORE the newest
     *  order here takes the order's word (so a token minted a moment
     *  before the mute cannot carry its holder past it). Memory, bounded
     *  by ORDERS_MAX, oldest out - the account row is the truth and
     *  every later token carries it, so this only has to cover the gap. */
    this._orders = new Map();
    /** AUDIT SAFE RELAY-5: THE NEWEST BAN ORDER THIS ROOM HAS TAKEN, per account - `{i, bn, sig}` (`bn` 0: lifted),
     *  APART from `_orders`: the two shared MOD1's one row, so a newer unmute lifted a ban and an unban lifted a mute
     *  that stood. A ban here closes the account's sockets and refuses its hello while it stands (`_takeOrder`,
     *  `_bannedHello`); a mute order never touches it, nor it a mute. RELAY-7: kept in storage too (BANS_KEY, read
     *  once a wake by `_loadBans`), BANS_MAX at most, each for BAN_KEEP_S. */
    this._bans = new Map();
    this._bansLoad = null;
    /** AUDIT SAFE RELAY-8: A NEW VOICE'S METER, the ACCOUNT's (`a.sub` -> when its last public line here was said) - a
     *  socket's own meter let K sockets of one account say K lines a gap, and a reconnect start a fresh one. Pruned as
     *  it is spent (`_newVoiceSpends`): an entry older than NEW_VOICE_GAP_MS holds nobody back. */
    this._paces = new Map();
    /** GUILD1c: THE REMOVALS AND DISBANDINGS THIS ROOM HAS APPLIED - `gi` (a guild gone) or `gi:gm` (one member gone)
     *  -> the order's `i`, the newest kept. MOD1's `_orders` job for a guild: a hello whose token was minted before one
     *  takes it off, and a guild order older than one changes nothing - so neither a token minted a moment before a
     *  removal nor a replayed join inside its minute carries the member back into the guild's chat. Memory, bounded by
     *  GUILD_OUTS_MAX, oldest out - the roster is the truth and every later token carries it. */
    this._guildOuts = new Map();
    this._guildOutsLoad = null;   // AUDIT MERGE-PLUS A3: the storage read that fills it, once a wake
    this._roomGuild = null;   // GUILD1c: the room's budget for guild-tag fans (GUILD_ROOM_HZ_MAX)
    this._guildChat = null;   // GUILD1c: the hub's budget for guild lines (GUILD_CHAT_ROOM_HZ_MAX), apart from the room's and the parties'
    this._idx = null;   // ws -> attachment, read once (A7); kept by the doors that change the socket set (SCALE2b)
    this._idxAt = -Infinity;   // SCALE2b: when the index was last walked against the runtime's list
    /** SCALE2b: THE ROOM'S HELLO BUCKET (A6), in memory. It was read from storage and written back on every hello -
     *  before the gate refused a storm, so a storm paid two storage operations a hello for its own refusal. The bucket
     *  is `tokenGate`'s, capped at its rate, so it refills whole in one second; a room sleeps only after a quiet spell
     *  far longer than that, so a wake never had anything to read back. Every bucket of this object's own lives on the
     *  instance for the same reason (AUDIT ATTACH, above); this one was the last in storage. */
    this._hellos = null;
    /** SCALE2b: THE IDS' SECRETS (A3), id -> secret (null: none), read from storage the first time a wake asks for an id
     *  (`_secretOf`) and kept; every write and delete keeps the copy. A hello read its id's secret and wrote it back
     *  every time. Read an id at a time, never listed: a deploy drops sockets without their leave, and a hub that never
     *  drains keeps every secret such a drop left behind - a list of them a wake would grow without end. */
    this._secrets = new Bounded(HUB_KEEP_MAX);
    this._asecrets = new Bounded(HUB_KEEP_MAX);   // SCALE2b: the hub's account id -> profile secret (null: none), read once and kept
    this._noGateRcpt = new Bounded(HUB_KEEP_MAX); // SCALE2b: accounts the hub holds no gate receipt for (dropped whole when one is written)
    this._noSdRcpt = new Bounded(HUB_KEEP_MAX);   // SD9a: and no Hour receipt (dropped whole when one is written)
    this._noKtRcpt = new Bounded(HUB_KEEP_MAX);   // AUDIT KETCH L1-2: and no Ketch receipt (the same)
    this._noEgRc = new Bounded(HUB_KEEP_MAX);   // EG-ZA: and no breach receipt held (dropped whole when one is written)
    this._noSerpentRcpt = new Bounded(HUB_KEEP_MAX);   // SCALE5a: and no serpent receipt - the one receipt every hub hello still read from storage (dropped whole when one is written)
    this._noRaidRcpt = new Bounded(HUB_KEEP_MAX); // SCALE2b: and no raid receipts
    this._noStarRcpt = new Bounded(HUB_KEEP_MAX); // STAR3: and no star receipts (dropped whole when one is written)
    this._worldMemo = undefined;   // SCALE2b: the stored world, raw, as `_worldRaw` read it (undefined: not read this wake)
    this._parks = null;            // SCALE2b: a cell's parked teams, key -> record - a promise of the one list a wake
    this._wardenAt = undefined;    // WARDEN1: when the cell's next road team falls due (null: none waits; undefined: its teams not read this wake)
    this._attachedAt = new WeakMap();   // SCALE2b: ws -> when its attachment was last written to the runtime
    this._roomChat = null;   // AUDIT CHAT A2: the room's own chat budget - on the instance, since a sleeping room fans nothing
    this._travFan = null;   // TV3: a region room's fan budget for traveller marks (TRAV_ROOM_HZ_MAX)
    this._travClearFan = null;   // AUDIT DEEP T3-2: and its clears', apart - a flood of either never starves the other
    this._travOwed = new Map();   // AUDIT DEEP2 C2: the clears the room's budget refused, owed (id -> the frame) and said on its next pass
    this._partyChat = null;   // CHAT-CHAN: the hub's budget for party lines (PARTY_CHAT_ROOM_HZ_MAX), apart from the room's
    this._roomFoes = null;   // AUDIT WORLD2 A5: the room's foes byte budget (the frame times its listeners)
    this._roomFoesIn = null;   // AUDIT WORLD6b A3: a cell's foes INGRESS budget, spent at the door before the parse
    this._roomOwn = null;   // OWN1: a world room's own-lane fan budget (anyone's, as a cell's foes are)
    this._roomOwnIn = null;   // OWN1: and its ingress, spent at the door before the parse
    // AUDIT WORLD6b A1/A2: the hit funnel (AUDIT WORLD2 A6) is the DESTINATION socket's own bucket (`hbucket` among its meters), not the room's
    this._roomActs = null;   // WORLD3: the room's action-frame budget (a door, a lever, a platform moved)
    this._roomWho = null;    // AUDIT WORLD6b-iii(e) B1: the room's ask budget (WHO_ROOM_HZ_MAX) - the one arm past the hello that reads storage
    this._looks = new Map(); // AUDIT WORLD6b-iii(e) B1: the looks said hello with, kept on the instance while it is awake - a repeat ask reads no storage; after a hibernation the storage's copy is read once and kept again
    this._roomActBytes = null;   // AUDIT WORLD3 A1: and its BYTE budget - the frame times its listeners, as the foes fan has
    this._roomQuestBytes = null;   // AUDIT PARTY8: the quest fan's byte budget - a 64 KiB share times fifty-six tabs at eight seats
    this._roomWorld = null;      // SLAM11: the memory push's OWN byte budget, borrowing - it used to charge the foes stream's, and a big memory's debt would have stalled live foes
    this._roomSocial = null;     // SOC1: the hub's budget for social acts (SOCIAL_ROOM_HZ_MAX) - over it an act is refused with 'busy'
    this._roomRenown = null;     // AUDIT RENOWN1 SEC-2/WIRE-1: the room's budget for renown fans (RENOWN_ROOM_HZ_MAX) - on the instance, as the chat's is
    this._acctIdx = null;        // SOC1: account -> its hello'd sockets, built from the index when asked; SCALE5a: then KEPT by the doors that change a socket's account (`_reindex`), rebuilt only when the index itself is re-walked
    this._idxSeq = new WeakMap(); this._idxN = 0;   // SCALE5a: each socket's place in the index's own order (`_enter`) - a per-account set is read back in it
    this._idIdx = null;          // SCALE5b: peer id -> its sockets, kept as the account index is - a directed frame's target without a walk (`_idFirst`)
    this._giIdx = null;          // SCALE5c: guild -> its members' sockets, kept the same way - a guild's line without a walk of the whole hub
    this._folds = new WeakMap();   // SCALE5c: an attachment -> its name as a search folds it (`_findNames`)
    this._findRoom = null;       // SCALE5c: the whole hub's search bucket (HUB_FIND_ROOM_HZ_MAX)
    this._everyone = null;       // SCALE5c: { at, s } - everyone online as the bus last said it (`_everyoneSaid`)
    this._busKey = undefined;    // SCALE5c part two: the channel this bus is (its first shard's), never another's
    this._hostMemo = undefined;  // SCALE5b: the room's host (`_hostOf`), kept until a socket's id or hello stamp moves - undefined: not known
    this._seatSaid = undefined;  // SEAT-LIVE: the host the room was last told (`_sayHost`) - undefined: not known since this object woke
    this._relayCfg = undefined;  // SCALE5b: the relay's settings (net/relayCfg.js) - the hub's from its storage, any other room's as the hub last answered
    this._relayCfgAt = -Infinity;   // SCALE5b: when a room not the hub last asked
    this._relayCfgP = null;         // LEASE1: that ask, in flight or settled (`_leaseHeard` waits on it)
    this._rfSaid = false;        // SCALE5b: whether this cell last said it judges the poses that reach it (`_rfSay`)
    // SCALE5c (the bus): its shards' sockets (`ShardSocket`, by the id each shard gives its own), and what is owed each shard
    this._vsocks = new Map();
    this._vhid = new Set();      // STAFF-PANEL5-HIDDEN: the ShardSockets that are hidden staff spectators' (`_busCount` leaves them out)
    this._hidHellos = new WeakSet();   // STAFF-PANEL5-HIDDEN: the hellos whose VERIFIED token said `hd: 1` (`_named`) - a frame's own fields are the client's word, an entry here the relay's alone
    this._vper = new Map();      // shard -> how many ShardSockets of its the bus holds (the shards a frame to everyone reaches)
    this._cper = new Map();      // SCALE5d part two: a court's copy -> how many of its sockets the court holds (its beats' reach)
    this._vshut = new Bounded(HUB_KEEP_MAX);   // SCALE5d part two: the ids of the ShardSockets this object closed - never asked to say their hello again
    this._down = new Map();      // shard -> { s: [frames], i: frame -> its index, seg: [Map vid -> [indexes] | {all: index}], cur: the open Map, close: [[vid, code, reason]] }
    this._downT = null;
    // HUB-PULL (2026-10-16): THE BUS NEVER CALLS A SHARD - a sealed delivery waits in its shard's outbox until the shard's
    // poll is answered with it, and stays until the shard says it ran it (the poll's `ack`)
    this._outbox = new Map();    // shard -> [{ q, body }] in order, unacknowledged; `bytes` on the list
    this._polls = new Map();     // shard -> { done, t }: its poll the bus holds while it owes it nothing
    // (a shard) the bus instance whose `rs` it heard - its polls say so, and until one does the bus says `rs` (HUB-PULL audit);
    // and the wake of a poll backing off after a miss, which a hand-up the bus answered calls
    this._rsBoot = null;
    this._pollWake = null;
    this._toldN = new Map();     // shard -> the count its last delivery carried (every shard the bus has handed anything - a hello's words, at least)
    this._countT = null;         // the count's tell, owed within HUB_COUNT_MS of a hello or a leave
    // SCALE5c (a shard): what it owes the bus, and what it knows of the hub
    this._up = [];               // [vid, kind, payload] in the order they happened
    this._upGate = new WeakMap();   // socket -> its frames' bucket on the way up (HUB_UP_HZ_MAX)
    this._upT = null;
    this._upBusy = null;         // the hand-up in flight
    this._vidIdx = new Map();    // vid -> its socket here (rebuilt from the attachments after a wake - `_byVid`)
    this._vidIdxFull = false;
    this._hubKey = undefined;    // this shard's key (undefined: not known yet; null: no shard)
    this._hubTotal = null;       // the hub's count everywhere, as the bus last said it
    this._hubTotalSaid = null;   // the count last said to this shard's sockets
    this._hubCountT = null;
    this._hubSyncAt = 0;         // when this shard last told the bus every socket it holds
    this._hubAlarmed = false;
    this._vseq = 0;
    // AUDIT SCALE II R2-7: EVERY HAND-UP AND DELIVERY NUMBERED. One delivery in flight each way kept the order, and a lost
    // one was lost for good (a world line, a hello's words, a close the bus decided - the link open and mute); one that
    // landed but whose answer was lost, sent again, would run twice. Each is numbered under its sender's instance (`_boot`);
    // one that did not land goes again as it was, and its receiver runs a number it has run once, never twice
    this._boot = crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
    this._upSeq = 0;              // (a shard) the last hand-up's number
    this._upRetry = null;         // (a shard) the hand-up that did not land: { q, e, live? }, sent again before anything after it
    this._upInFlight = null;      // (a shard) the events of the hand-up on the wire
    this._upHoldUntil = 0;        // (a shard) after a miss, when the next try goes
    this._upBytes = 0;            // (a shard) AUDIT SCALE II R2-11: what `_up` holds, bytes
    this._upSeen = new Map();     // (the bus) shard -> { b, q }: the newest hand-up of its it ran
    this._downSeq = new Map();    // (the bus) shard -> the last delivery's number
    this._downSeen = null;        // (a shard) { b, q }: the newest delivery it ran - HUB-PULL: its poll's `ack`
    this._downGone = new Set();   // (a shard) HUB-PULL: the ids a delivery named that it no longer holds - its next poll tells the bus
    this._pollOn = false;         // (a shard) HUB-PULL: its poll loop runs (one poll at the bus at a time)
    this._shardSeen = new Map();  // (the bus) AUDIT SCALE II R2-9: shard -> when it last handed anything up
    this._silentAt = 0;           // (the bus) when it last let go of a silent shard's sockets
    this._hubKeyKept = null;      // (a shard) AUDIT SCALE II R2-4: the name it last kept in storage (HUB_KEY_KEY)
    this._swept = false;         // SCALE5b: the drain's sweep ran and nothing has said hello since - the next empty room's hello need not sweep again
    this._subIdx = null;         // SCALE5a: verified account (`sub`) -> its hello'd sockets, kept as the account index is - ONE-SEAT's other tabs (`_otherTabsOf`) without a walk of every socket
    this._parties = new Bounded(PARTIES_MAX);   // SOC1: party id -> record, kept while the object is awake (a party pose reads its party once a second; a wake reads storage once and keeps it again)
    this._recs = new Bounded(RECS_MAX);      // AUDIT SOC A5: account id -> record, kept while the object is awake - every write goes through _putAcct/_putAccts so the copy is the storage's; bounded at RECS_MAX
    this._alarmArmed = false;    // AUDIT SOC A3: the sweep's alarm is armed once per instance life (a storage read otherwise on every hello)
    this._cool = new Bounded(COOL_MAX);      // AUDIT SOC A1/A8: "kind from to" -> when a directed act last went through, on the instance (a flood keeps the object awake; a hibernation is a quiet hub); bounded at COOL_MAX
    this._dead = new Set();      // AUDIT WORLD34 D1: the sockets this object closed itself, whose leave the runtime will not deliver - reaped on the way out of every door
    this._gone = new WeakSet();  // AUDIT WORLD34 D1: and the ones whose leave has been said, so a runtime that does deliver a close says it once
    // AUDIT ATTACH (2026-09-23): EVERY PER-SOCKET METER LIVES HERE, not on the socket's attachment - each arm's bucket
    // and strike count, the junk count, and the funnels onto a destination (`hbucket`, `tinbucket`, `cin`). They rode
    // the attachment, which the runtime caps at 2 KiB and refuses a write past WHOLE, and the widest place socket's
    // (an id and an account at ID_RE's bound, a pose at its bounds, twenty arms' meters, a full funnel) was past it:
    // a meter whose write was refused never advanced, so the arm it gated let everything through. A meter is rate
    // state - the room's own budgets and _cool have always lived here, for the reason that holds for these: a flood
    // keeps the object awake, and it sleeps only after a quiet spell. Every bucket refills whole in two seconds of it
    // (the cast meter, a whole blast deep, is the slowest; the quest floor takes five), so a wake forgets nothing the
    // quiet had not already refilled - but the act share's
    // borrowed debt (SLAM13), which a wake forgives early: that share keeps one sender from holding the room's act
    // budget against the others, and a room that went quiet had no others acting. The attachment keeps what a wake
    // must recompute: the key, who the socket is, where it stands, the hello's stamp and the room's marks.
    this._meters = new WeakMap();   // ws -> its meters (_meterOf)
    // WB3: A GATE ROOM'S FIGHT (net/gate/gateBrain.js), read from storage once per instance life and checkpointed every
    // CHECKPOINT_MS, so an eviction loses that much of it and not the fight; undefined = not read yet, null = none
    this._fight = undefined;
    this._fightSavedAt = 0;
    // INT11: the boss fights' trails of their bodies' poses, by socket (_trailPose) - in memory alone. AUDIT INT11: and when
    // this instance began keeping them: until a trail's span on, a body with none is not known to stand anywhere (_trailOf)
    this._trails = null;
    this._trailsAt = Date.now();
    this._siege = undefined;   // PVP-REF: a siege room's fighters, by account (storage's `siege` after a wake)
    this._siegeSavedAt = 0;
    this._helloBy = new Map();   // AUDIT-SEATS R3: a battle room's hello buckets, by verified account (_battleHelloGate) - a wake forgets them, as the meters
    this._receiptKey = undefined;   // WB3: the relay's signing key (GATE_SIGNING_KEY), imported once; null = none (the receipts go out unsigned)
    this._leaseKey = undefined;   // LEASE1: the lease key (net/roomLease.js leaseKeyOf), derived once; null = none (no lease handed out, nobody bound)
    this._grants = null;            // GRANT2 (Spawn-Grants.md section 12): a cell's spawn grants (_grantState) - made at its first ask, in memory alone
    this._gateFell = undefined;     // WB3: the hub's last word of a kill, said to a hello while its gate still holds
    this._serpentSiteRec = undefined; // SERPENT2: the hub's record of where the serpent lies, as accounts said it (net/gate/gateHerald.js foldGateSite) - undefined: not read yet
    this._serpentFells = undefined; // SERPENT1: the hub's kills of the latest serpent day, one a site (SERPENT_FELLS_KEY), said to a hello while that day holds
    this._event = undefined;        // EVENT1: the hub's live event, read once (_liveEvent) - undefined: not read yet
    this._raids = new Bounded(RAID_CACHE_MAX);        // RAID3: a cell's raid ledgers read so far (net/raid/raidLaw.js) - AUDIT RAID R1: its identity (key and signature) -> ledger|null; storage is the truth; R6: at most RAID_CACHE_MAX
    this._raidSavedAt = new Map();  // RAID3: when each ledger was last written (a word that moves nothing writes at most every RAID_SAVE_MS)
    this._raidCleaning = new Set(); // RAID3: the raids whose cleanse is being minted - a word that lands meanwhile is not heard (an input gate holds for storage alone, and the mint awaits crypto)
    this._raidSlots = new Map();    // RAID-ROLL: a cell's copy of each day's slots (net/raid/raidLaw.js raidDaySlots) - a few days at most
    this._raidDays = new Map();     // RAID-ROLL: a cell's copy of each day's whole roll from the hub - day -> { ids: Set|null, at }
    this._raidTownsKept = undefined; // RAID-ROLL: the hub's towns table - undefined unread, null none kept, else the regions
    this._raidDayRolls = new Map(); // RAID-ROLL: the hub's day -> [raid identity] off the kept table - a few days at most
    this._stars = new Bounded(4 * STAR_LEDGERS_MAX);   // STAR3: a cell's star ledgers read so far (net/starfall/starfallLaw.js), identity -> ledger|null - never a settled one (`_starKeep`); storage is the truth
    this._starSavedAt = new Bounded(4 * STAR_LEDGERS_MAX);   // STAR3: when each was last written (a word that moves nothing writes at most every STAR_SAVE_MS)
    this._starHolding = new Set();  // STAR3: the stars whose hold is being minted - a word that lands meanwhile is not heard (the raid's _raidCleaning)
    this._starHeld = undefined;     // STAR3: the hub's held stars of the nights still standing, [n, s, px, py, at] - undefined: not read yet
    this._raidTownsUp = new Map();  // RAID-ROLL: the hub's table pieces in flight, a socket's - ws -> { n, parts }
    this._raidCleans = undefined;   // RAID3: the hub's cleansed raids ([key, at, sig] - AUDIT RAID R1), read once - undefined: not read yet
    this._wdun = null;              // PVPDUNGEONS: the hub's halls record (net/wild/wildLaw.js wdun*) - read once a wake
    this._wdunSavedAt = 0;          // PVPDUNGEONS: a heartbeat writes at most every WDUN_HERE_MS; a lock, a death, a reset at once
    this._wdunRate = new WeakMap(); // PVPDUNGEONS: each socket's own bucket for wdun words
    this._wdunKin = new Map();      // PVPDUNGEONS: a place room's answers from the hub, `taker|owner` -> { kin, at }
    this._instanceKin = new Map();  // INSTANCES: an instance room's yeses from the hub, `subject|owner` -> { kin, at } (INSTANCE_KIN_KEEP_MS)
    this._wildLoad = null;          // WILD1: a place room's remains (net/wild/wildLaw.js) - read from storage once an instance life, by its prefix; storage is the truth, written at every change
    this._owLoad = null;            // OW6L: a cell's overworld ledger (net/overworldLaw.js) - the one storage read an instance life, its promise shared by every word and hello that lands while it runs; storage is the truth, written at every change
    this._roomOw = null;            // OW6L: a cell's budget for fanning its ledger's changes (OW_ROOM_HZ_MAX) - on the instance, as the chat's is
    this._herald = undefined;       // DISCORD-GATES: the hub's door to Discord ({hook, role}), read once - undefined: not read yet, null: none (no posts)
    this._gateSiteRec = undefined;  // DISCORD-GATES: the hub's record of where the gate stands, as accounts said it (net/gate/gateHerald.js foldGateSite) - undefined: not read yet
    this._serpents = undefined;     // SERPENT1: the serpents' fights a cell holds, by id (storage's SERPENT_FIGHTS_KEY after a wake) - undefined: not read yet
    this._serpentSavedAt = new Map(); // SERPENT1: when each was last checkpointed
    this._serpentFalling = new Map(); // SERPENT1: the kills being said (one fall at a time a fight - AUDIT WB12d R2's law)
    this._serpentArmedTo = 0;       // SERPENT1: the beat a blow already armed (a volley a frame never re-arms it)
    this._serpentRestAt = 0;        // SERPENT1: when a beating serpent's cell last ran its other duties (_alarmRest)
    try {
      // the runtime answers the client's ping while the object sleeps
      if (state.setWebSocketAutoResponse && typeof WebSocketRequestResponsePair === 'function') state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
    } catch { /* an older runtime */ }
  }
}
installParts(Room, GrantPart);
installParts(Room, OverworldPart);
installParts(Room, AccountsPart);
installParts(Room, PartiesPart);
installParts(Room, FriendsPart);
installParts(Room, GambitPart);
installParts(Room, IliacPart);
installParts(Room, HoldemPart);
installParts(Room, ArenaPart);
installParts(Room, SessionPart);
installParts(Room, SiegePart);
installParts(Room, DuelPart);
installParts(Room, RoyalPart);
installParts(Room, RaidPart);
installParts(Room, RitePart);
installParts(Room, StarPart);
installParts(Room, WildPart);
installParts(Room, SeaPart);
installParts(Room, WdunPart);
installParts(Room, SdPart);
installParts(Room, SdFightPart);
installParts(Room, EgPart);
installParts(Room, KetchPart);
installParts(Room, MinePart);   // BUNNYFALL (2026-11-25, caverns)
installParts(Room, ConfigPart);
installParts(Room, LeasePart);
installParts(Room, BodyPart);
installParts(Room, GatePart);
installParts(Room, SerpentPart);
installParts(Room, HeraldPart);
installParts(Room, LawPart);
installParts(Room, MetersPart);
installParts(Room, CaravanPart);
installParts(Room, ParkPart);
installParts(Room, GuildWordsPart);
installParts(Room, ChatLinesPart);
installParts(Room, StorePart);
installParts(Room, FoesPart);
installParts(Room, SendPart);
installParts(Room, SeatsPart);
installParts(Room, ReadsPart);
installParts(Room, SocketsPart);
installParts(Room, FanPart);
installParts(Room, RepeatPart);
installParts(Room, PollPart);
installParts(Room, WhoPart);
installParts(Room, HubHelloPart);
installParts(Room, CourtPart);
installParts(Room, ShardPart);
installParts(Room, BusPart);
installParts(Room, LifecyclePart);
installParts(Room, EntryPart);
installParts(Room, PosePart);
installParts(Room, DispatchPart);
installParts(Room, AlarmPart);
installParts(Room, DoorsPart);
