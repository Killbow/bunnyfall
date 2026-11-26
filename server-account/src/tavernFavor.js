// @ts-check
import { FAVOR_OFFERS, tavernProgressOf } from '../../src/net/tavernFavorLaw.js';
import { favorReward } from '../../src/trade/tavern/favorRewards.js';
import { addItem } from '../../src/items/inventory.js';
import { realmAtOf, prepareRealmRecord, dropIfUnnamed, dropObjects, mustChange, recordMovedOf } from './realm.js';

// The realm checkpoint, the debit, the delivered item or title, and the receipt commit in one batch.
export async function tavernFavorBuy(ctx, player, body) {
  const { db, bucket, nowS, rand } = ctx;
  const at = realmAtOf(body), offer = FAVOR_OFFERS.find((x) => x.id === body.offer);
  if (!at || !offer || !/^[A-Za-z0-9_-]{8,80}$/.test(body.txn ?? '') || !player?.handle) return { error: 'tavern-bad' };
  const replay = await db.prepare('SELECT t.result, c.lease, c.seq FROM tavern_service_txns t JOIN realm_characters c ON c.id = t.character WHERE t.character = ? AND t.txn = ? AND c.player = ?')
    .bind(at.id, body.txn, player.id).first();
  if (replay) return replay.lease === at.lease ? { ...JSON.parse(replay.result), realm: { seq: replay.seq }, replayed: true } : { error: 'lease' };
  const title = offer.kind === 'title' ? `title:${offer.id}` : null;
  const account = await db.prepare('SELECT insignia FROM players WHERE id = ?').bind(player.id).first();
  if (title && (` ${account?.insignia ?? ''} `).includes(` ${title} `)) return { error: 'owned' };
  let item = null, progress = null;
  const prep = await prepareRealmRecord(ctx, player.id, at, (record) => {
    const guild = record.modData?.BunnyGuilds;
    if (!guild?.bards) return 'tavern-membership';
    guild._marks ??= {};
    progress = tavernProgressOf(guild._marks.tavern);
    if (progress.favor < offer.price) return 'favor-short';
    progress.favor -= offer.price;
    guild._marks.tavern = progress;
    if (!title) {
      item = favorReward(offer.id, () => new DataView(rand(new Uint8Array(4)).buffer).getUint32(0) / 0x100000000);
      if (!item) return 'tavern-bad';
      record.items ??= []; addItem(record.items, item);
    }
    return null;
  });
  if ('error' in prep) return prep;
  const answer = { ok: true, progress, item, title: title ? offer.id : null, realm: { seq: prep.seq } };
  try {
    await db.batch([...prep.steps,
      ...(title ? [db.prepare("UPDATE players SET insignia = TRIM(COALESCE(insignia, '') || ' ' || ?) WHERE id = ? AND (' ' || COALESCE(insignia, '') || ' ') NOT LIKE ?")
        .bind(title, player.id, `% ${title} %`), mustChange(db)] : []),
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
    const current = title ? await db.prepare('SELECT insignia FROM players WHERE id = ?').bind(player.id).first() : null;
    if (title && (` ${current?.insignia ?? ''} `).includes(` ${title} `)) return { error: 'owned' };
    throw error;
  }
  await dropObjects(bucket, [prep.prev]);
  return answer;
}
