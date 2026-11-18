// @ts-check
// BARDS' GUILD SERVICES, paid in Favor Tokens (law: src/net/bardServiceLaw.js). One route, `/v1/bards/service`, three ops:
//   item-name  { pick, item, name }          a piece of the realm record renamed (`bardName` on the record)
//   item-buff  { pick, item, buff: {name, text} }   a cosmetic flourish written on a piece (`bardBuff`) - no stat, no spell
//   home-name  { mapId, buildingKey, name }  a home the account owns renamed (`homes.title`, migration 0212)
// The Favor is debited inside the realm character's record - where the Favor Tokens live (modData.BunnyGuilds._marks.tavern)
// - in the SAME batch as the write the service pays for, so the Favor and the service land together or neither does. A
// receipt (tavern_service_txns, the tavern's own table) makes a request asked again after a lost answer answer the same.
import { bardServicePrice, bardItemNameOf, bardHomeNameOf, bardBuffOf, bardWritable } from '../../src/net/bardServiceLaw.js';
import { tavernProgressOf } from '../../src/net/tavernFavorLaw.js';
import { recordIsOffered } from '../../src/net/realm/realmTradeLaw.js';
import { homeMapIdOk, homeBuildingKeyOk } from '../../src/net/homeLaw.js';
import { overRate } from './accounts.js';
import { realmAtOf, prepareRealmRecord, dropIfUnnamed, dropObjects, mustChange, recordMovedOf } from './realm.js';

const TXN_RE = /^[A-Za-z0-9_-]{8,80}$/;
/** A bard's hand: this many services an hour per account (a flood of renames is no use to anyone). */
const BARD_OPS_MAX = 30;
const BARD_WINDOW_S = 3600;

/**
 * @param {any} ctx `{ db, bucket, nowS, rand }`
 * @param {any} player @param {any} body
 */
export async function bardServiceAct(ctx, player, body) {
  const { db, bucket, nowS } = ctx;
  const at = realmAtOf(body), price = bardServicePrice(body?.op);
  if (!at || price == null || !TXN_RE.test(body.txn ?? '')) return { error: 'bard-bad' };
  const op = /** @type {'item-name'|'item-buff'|'home-name'} */ (body.op);
  const replay = await db.prepare('SELECT t.result, c.lease, c.seq FROM tavern_service_txns t JOIN realm_characters c ON c.id = t.character WHERE t.character = ? AND t.txn = ? AND c.player = ?')
    .bind(at.id, body.txn, player.id).first();
  if (replay) return replay.lease === at.lease ? { ...JSON.parse(replay.result), realm: { seq: replay.seq }, replayed: true } : { error: 'lease' };

  // the words, cleaned and filtered, before anything is asked of the record
  let name = null, buff = null, pick = -1, offered = null, home = null;
  if (op === 'item-name') {
    const n = bardItemNameOf(body.name);
    if ('error' in n) return n;
    name = n.text;
  } else if (op === 'item-buff') {
    const b = bardBuffOf(body.buff);
    if ('error' in b) return b;
    buff = b.buff;
  } else {
    const n = bardHomeNameOf(body.name);
    if ('error' in n) return n;
    name = n.text;
    if (!homeMapIdOk(body.mapId) || !homeBuildingKeyOk(body.buildingKey)) return { error: 'bard-bad' };
    home = await db.prepare('SELECT map_id, building_key FROM homes WHERE map_id = ? AND building_key = ? AND player = ? AND guild_id IS NULL AND deed = 0')
      .bind(body.mapId, body.buildingKey, player.id).first();
    if (!home) return { error: 'bard-home-gone' };
  }
  if (op !== 'home-name') {
    pick = body.pick;
    offered = body.item;
    if (!Number.isSafeInteger(pick) || pick < 0 || !offered || typeof offered !== 'object' || Array.isArray(offered)) return { error: 'bard-bad' };
  }
  if (await overRate(ctx, `bard:${player.id}`, BARD_OPS_MAX, BARD_WINDOW_S)) return { error: 'bard-rate' };

  /** @type {any} */ let progress = null;
  const prep = await prepareRealmRecord(ctx, player.id, at, (record) => {
    const guild = record.modData?.BunnyGuilds;
    if (!guild?.bards) return 'bard-membership';
    guild._marks ??= {};
    progress = tavernProgressOf(guild._marks.tavern);
    if (progress.favor < price) return 'bard-favor-short';
    if (op !== 'home-name') {
      const rec = Array.isArray(record.items) ? record.items[pick] : null;
      if (!rec || !recordIsOffered(rec, offered)) return 'bard-item-gone';
      if (!bardWritable(rec)) return 'bard-item-refused';
      if (op === 'item-name') rec.bardName = name; else rec.bardBuff = buff;
    }
    progress.favor -= price;
    guild._marks.tavern = progress;
    return null;
  });
  if ('error' in prep) return prep;
  const answer = { ok: true, op, progress, pick, name, buff, ...(home ? { mapId: home.map_id, buildingKey: home.building_key } : {}), realm: { seq: prep.seq } };
  try {
    await db.batch([...prep.steps,
      ...(home ? [db.prepare('UPDATE homes SET title = ? WHERE map_id = ? AND building_key = ? AND player = ? AND guild_id IS NULL AND deed = 0')
        .bind(name, home.map_id, home.building_key, player.id), mustChange(db)] : []),
      db.prepare('INSERT INTO tavern_service_txns (character, txn, result, at) VALUES (?, ?, ?, ?)').bind(at.id, body.txn, JSON.stringify(answer), nowS)]);
  } catch (error) {
    await dropIfUnnamed(db, bucket, player.id, at.id, prep.key);
    const receipt = await db.prepare('SELECT result FROM tavern_service_txns WHERE character = ? AND txn = ?').bind(at.id, body.txn).first();
    if (receipt) {
      const current = await db.prepare('SELECT seq FROM realm_characters WHERE id = ?').bind(at.id).first();
      return { ...JSON.parse(receipt.result), realm: { seq: current.seq }, replayed: true };
    }
    const changed = await recordMovedOf(db, player.id, at);
    if (changed) return changed;
    if (home) return { error: 'bard-home-gone' };
    throw error;
  }
  await dropObjects(bucket, [prep.prev]);
  return answer;
}
