// The returned statements run in the same D1 batch as the garden's revision claim.
import { mustChange } from './realm.js';
import { marksOpenFor } from './marks.js';
import { GUILD_TREASURY_MAX } from '../../src/net/guildLaw.js';
import { MARKS_MAX } from '../../src/net/marksLaw.js';
import { materialOf } from '../../src/net/professionLaw.js';
import { herbTier } from '../../src/net/nodeLaw.js';
import { stepFarmUpgrade, stepFarmDelivery, farmWeek, FARM_ARGENTS_PER_WEEK } from '../../src/net/farmProgressLaw.js';

export async function farmProgressStep({ db, nowS, env }, player, farm, garden, body) {
  if (!marksOpenFor(player, env)) return { error: 'marks-closed' };
  const gid=farm.guild_id, week=farmWeek(nowS), day=Math.floor(nowS/86400), from=week*7-3;
  const wallet=await db.prepare('SELECT treasury, (SELECT balance FROM guild_marks WHERE guild_id = ?1) AS argents FROM guilds WHERE id = ?1').bind(gid).first();
  if (!wallet) return {error:'farm-not-ours'};
  const balance=Number(wallet.argents??0), gold=Number(wallet.treasury);
  const who=String(player.handle||'Farmer').slice(0,64);
  const rid=`farm:${body.op}:${farm.map_id}:${farm.bought_at??0}:${body.op==='upgrade'?body.upgrade:body.crop}:${body.version}`;
  const statements=[];
  if(body.op==='upgrade') {
    const step=stepFarmUpgrade(garden,body.upgrade); if('error'in step)return step;
    if(gold<step.price.gold||balance<step.price.argents)return{error:'farm-upgrade-funds'};
    statements.push(db.prepare(`UPDATE guilds SET treasury=treasury-?2, realm_gold=MIN(realm_gold,treasury-?2), moved_by=?3, moved_at=?4, moved_kind='farm-upgrade'
      WHERE id=?1 AND treasury>=?2`).bind(gid,step.price.gold,who,nowS),mustChange(db));
    statements.push(db.prepare(`INSERT INTO marks_ledger (src_kind,src_id,dst_kind,dst_id,kind,amount,day,at,actor,who,rid)
      SELECT 'guild',?1,'burn',NULL,'farm-upgrade',?2,?3,?4,?1,?5,?6
      WHERE COALESCE((SELECT balance FROM guild_marks WHERE guild_id=?1),0)>=?2`).bind(gid,step.price.argents,day,nowS,who,rid),mustChange(db));
    return{garden:step.garden,statements,upgraded:body.upgrade};
  }
  const step=stepFarmDelivery(garden,body.crop,nowS); if('error'in step)return step;
  if(gold+step.order.gold>GUILD_TREASURY_MAX||balance+step.order.argents>MARKS_MAX)return{error:'farm-order-full'};
  const earned=await db.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM marks_ledger WHERE dst_kind='guild' AND dst_id=?1 AND kind='farm-order' AND day>=?2 AND day<?3").bind(gid,from,from+7).first();
  if(Number(earned?.total??0)+step.order.argents>FARM_ARGENTS_PER_WEEK)return{error:'farm-order-cap'};
  // Only communal stock can fill an order, so purchased or personal deposits never earn premium currency.
  const {results}=await db.prepare("SELECT rowid AS rid,material,qty FROM guild_prof_stores WHERE guild_id=? AND dep_player='' AND dep_char='' AND qty>0 ORDER BY material").bind(gid).all();
  let remaining=step.order.quantity;
  for(const row of results??[]) {
    const eligible=body.crop==='grain'?row.material==='food:grain':body.crop==='mushroom'?row.material==='food:mushroom':materialOf(row.material,herbTier)?.family==='herbs';
    if(!eligible||!remaining)continue;
    const take=Math.min(remaining,Number(row.qty));remaining-=take;
    statements.push(db.prepare(`UPDATE guild_prof_stores SET qty=qty-?2,moved_by='Farm order',moved_at=?3
      WHERE rowid=?1 AND guild_id=?4 AND dep_player='' AND dep_char='' AND material=?5 AND qty>=?2`).bind(row.rid,take,nowS,gid,row.material),mustChange(db));
  }
  if(remaining)return{error:'farm-order-stock'};
  statements.push(db.prepare(`UPDATE guilds SET treasury=treasury+?2,moved_by=?3,moved_at=?4,moved_kind='farm-order'
    WHERE id=?1 AND treasury<=?5-?2`).bind(gid,step.order.gold,who,nowS,GUILD_TREASURY_MAX),mustChange(db));
  statements.push(db.prepare(`INSERT INTO marks_ledger (src_kind,src_id,dst_kind,dst_id,kind,amount,day,at,actor,who,rid)
    SELECT 'mint',NULL,'guild',?1,'farm-order',?2,?3,?4,?1,?5,?6
    WHERE COALESCE((SELECT balance FROM guild_marks WHERE guild_id=?1),0)<=?7-?2
      AND COALESCE((SELECT SUM(amount) FROM marks_ledger WHERE dst_kind='guild' AND dst_id=?1 AND kind='farm-order' AND day>=?8 AND day<?8+7),0)<=?9-?2`)
    .bind(gid,step.order.argents,day,nowS,who,rid,MARKS_MAX,from,FARM_ARGENTS_PER_WEEK),mustChange(db));
  return{garden:step.garden,statements,reward:step.order,delivered:body.crop};
}

export const farmProgressRead = async (db,player,character,gid,details=false,nowS=0) => {
  const me=typeof character==='string'?await db.prepare('SELECT rank FROM guild_members WHERE player=? AND char_id=? AND guild_id=?').bind(player.id,character,gid).first():null;
  const mayManage=!!me&&Number(me.rank)<=1;
  const work=me&&details?await db.prepare('SELECT farm_work, farm_work_day, farm_work_today FROM players WHERE id=?').bind(player.id).first():null;
  const mine=work?{work:{total:Number(work.farm_work),today:Number(work.farm_work_day)===Math.floor(nowS/86400)?Number(work.farm_work_today):0}}:{};
  if(!mayManage||!details)return{mayManage,...mine};
  const from=farmWeek(nowS)*7-3;
  const row=await db.prepare(`SELECT treasury,
    COALESCE((SELECT balance FROM guild_marks WHERE guild_id=?1),0) AS argents,
    COALESCE((SELECT SUM(amount) FROM marks_ledger WHERE dst_kind='guild' AND dst_id=?1 AND kind='farm-order' AND day>=?2 AND day<?2+7),0) AS earned
    FROM guilds WHERE id=?1`).bind(gid,from).first();
  return{mayManage,...mine,economy:row?{gold:Number(row.treasury),argents:Number(row.argents),earned:Number(row.earned)}:null};
};
