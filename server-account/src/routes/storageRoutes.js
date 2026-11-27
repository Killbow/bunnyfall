// Account service routes: POI storage, cloud saves, and the realm.
import { accountKind } from '../accounts.js';
import { SAVE_MAX_BYTES, SHOT_MAX_BYTES } from '../service.js';
import {
  poiRolesOf, putPoiAsset, getPoiAsset, savePoiDraft, submitPoi, withdrawPoi, requestRetire, reviewPoi, rollbackPoi,
  listPoi, poiHistory, poiQueue, listShelf, shelfEntry, shelve, unshelve, POI_ASSET_MAX, POI_DRAFT_BODY_MAX
} from '../poi.js';
import { listSaves, putCard, putBlob, getBlob, deleteSave, saveCardOf } from '../saves.js';
import { forgetYards } from '../decor.js';
import {
  listRealm, createRealm, customsRealm, joinRealm, checkpointRealm, getRealmBlob, leaveRealm, deleteRealm, undoRealm,
  REALM_CHARACTERS_MAX, REALM_MAX_BYTES, objectBytesOf
} from '../realm.js';
import { isGzip, gzipSizeOf, gunzipText, REALM_TEXT_MAX_BYTES } from '../../../src/net/realmSaveCodec.js';
import { tradeRealm } from '../realmTrade.js';
import { tradePoi, eventClaimPoi } from '../poiTrade.js';
import { listLineages, putLineage, realmDie, realmRaise, realmWed, listUnions } from '../legacy.js';
import { bannedAnswer } from '../safety.js';
import { frozenAnswer } from '../staffFreeze.js';
import { REALM_STATUS } from '../routeStatus.js';
import { json, no, POI_STATUS, poiAssetResponse, homeOrdersOf, readCapped, readBody } from '../routeHelpers.js';
import { NEXT } from './next.js';

export async function storageRoutes({
  request, env, subtle, nowS, origin, url, path, slot, realmSlot, poiPath, ctx, body, who
}) {
  if (poiPath) {
    const pctx = { ...ctx, bucket: env.SAVES };
    const me = who.player;
    const answer = (r) => ('error' in r ? json(r, POI_STATUS[r.error] ?? 400, origin) : json(r, 200, origin));
    const { route } = poiPath;
    if (route === 'me' && request.method === 'GET') return json({ handle: me.handle ?? null, ...poiRolesOf(me, env) }, 200, origin);
    if (route === 'list' && request.method === 'GET') return answer(await listPoi(pctx, me, env));
    if (route === 'queue' && request.method === 'GET') return answer(await poiQueue(pctx, me, env));
    if (route === 'doc' && request.method === 'GET') return answer(await poiHistory(pctx, me, env, poiPath.id));
    if (route === 'shelf' && request.method === 'GET') return answer(poiPath.id ? await shelfEntry(pctx, me, env, poiPath.id) : await listShelf(pctx, me, env));
    if (route === 'shelf' && request.method === 'PUT' && !poiPath.id) {
      if (!poiRolesOf(me, env).builder) return no('poi-not-builder', 403, origin);
      const put = await readBody(request, POI_DRAFT_BODY_MAX);
      if (put === undefined) return no('too-large', 413, origin);
      if (!put) return no('body', 400, origin);
      return answer(await shelve(pctx, me, env, { item: put.item }));
    }
    if (route === 'asset' && request.method === 'GET') {
      const r = await getPoiAsset(pctx, poiPath.sha, poiRolesOf(me, env));
      return 'error' in r ? no(r.error, r.error === 'no-storage' ? 503 : 404, origin) : poiAssetResponse(r, origin);
    }
    if (route === 'asset' && request.method === 'PUT') {
      if (!poiRolesOf(me, env).builder) return no('poi-not-builder', 403, origin);
      const kind = url.searchParams.get('kind');
      if (kind !== 'mesh' && kind !== 'texture') return no('poi-kind', 400, origin);
      const raw = await readCapped(request, POI_ASSET_MAX[kind]);
      if (!raw) return no('too-large', 413, origin);
      if (!raw.byteLength) return no('body', 400, origin);
      return answer(await putPoiAsset(pctx, me, env, { sha: poiPath.sha, kind, bytes: raw }));
    }
    if (route === 'draft' && request.method === 'PUT') {
      if (!poiRolesOf(me, env).builder) return no('poi-not-builder', 403, origin);
      const draft = await readBody(request, POI_DRAFT_BODY_MAX);
      if (draft === undefined) return no('too-large', 413, origin);
      if (!draft) return no('body', 400, origin);
      return answer(await savePoiDraft(pctx, me, env, { doc: draft.doc, base: draft.base ?? null }));
    }
    if (request.method === 'POST') {
      if (route === 'trade' || route === 'event-claim') {
        const r = route === 'trade' ? await tradePoi({ ...pctx, rand: ctx.rand }, me.id, body) : await eventClaimPoi({ ...pctx, rand: ctx.rand }, me.id, body);
        if (r.error === 'seq') return json({ error: 'seq', seq: r.seq }, 409, origin);
        return answer(r);
      }
      if (route === 'submit') return answer(await submitPoi(pctx, me, env, { id: body.id, rev: body.rev }));
      if (route === 'withdraw') return answer(await withdrawPoi(pctx, me, env, { id: body.id, rev: body.rev }));
      if (route === 'retire') return answer(await requestRetire(pctx, me, env, { id: body.id }));
      if (route === 'review') return answer(await reviewPoi(pctx, me, env, { id: body.id, rev: body.rev, verdict: body.verdict, note: body.note ?? null, docSha: body.docSha ?? null }));
      if (route === 'rollback') return answer(await rollbackPoi(pctx, me, env, { id: body.id, rev: body.rev }));
      if (route === 'unshelve') return answer(await unshelve(pctx, me, env, { id: body.id }));
    }
    return no('method', 405, origin);
  }

  if (path === '/v1/saves' || slot) {
    // Guests get no cloud saves. This code differs from not-registered, which means no password at sign-in.
    if (accountKind(who.player) !== 'linked') return no('saves-need-account', 403, origin);
    const me = who.player.id;

    if (path === '/v1/saves') {
      if (request.method !== 'GET') return no('method', 405, origin);
      return json({ saves: await listSaves(ctx, me) }, 200, origin);
    }

    const bucket = env.SAVES;
    const sctx = { ...ctx, bucket };

    // The card creates a slot; a blob write to a slot without a card is refused.
    if (!slot.part) {
      if (request.method === 'PUT') {
        const card = saveCardOf(await readBody(request));
        if (!card) return no('body', 400, origin);
        const r = await putCard(sctx, me, { ...slot, card });
        return r.error ? no(r.error, r.error === 'too-many-saves' ? 409 : 400, origin) : json(r, 200, origin);
      }
      if (request.method === 'DELETE') {
        const r = await deleteSave(sctx, me, slot);
        return r.error ? no(r.error, 404, origin) : json(r, 200, origin);
      }
      return no('method', 405, origin);
    }

    if (request.method === 'PUT') {
      // Blob routes read the raw body against their own bound, since the JSON body cap would refuse a real save.
      const max = slot.part === 'shot' ? SHOT_MAX_BYTES : SAVE_MAX_BYTES;
      const body = await readCapped(request, max);
      if (!body) return no('too-large', 413, origin);
      if (!body.byteLength) return no('body', 400, origin);
      const r = await putBlob(sctx, me, slot, slot.part, body, body.byteLength);
      return r.error ? no(r.error, r.error === 'no-slot' ? 404 : 503, origin) : json(r, 200, origin);
    }

    if (request.method === 'GET') {
      const r = await getBlob(sctx, me, slot, slot.part);
      if (r.error) return no(r.error, r.error === 'no-storage' ? 503 : 404, origin);
      return new Response(r.object.body, {
        status: 200,
        headers: {
          'content-type': 'application/octet-stream',
          'access-control-allow-origin': origin,
          'cache-control': 'no-store',
        },
      });
    }
    return no('method', 405, origin);
  }

  // Realm routes serve every account, guests included.
  if (path.startsWith('/v1/realm')) {
    const me = who.player.id;
    const rctx = { ...ctx, bucket: env.SAVES };
    const answer = (r, ok = 200) => (r.error ? no(r.error, REALM_STATUS[r.error] ?? 400, origin) : json(r, ok, origin));
    if (path === '/v1/realm') {
      if (request.method !== 'GET') return no('method', 405, origin);
      return json({ characters: await listRealm(rctx, me), max: REALM_CHARACTERS_MAX }, 200, origin);
    }
    if (realmSlot) {
      if (request.method === 'PUT') {
        const raw = await readCapped(request, REALM_MAX_BYTES);
        if (!raw) return no('too-large', 413, origin);
        if (!raw.byteLength) return no('body', 400, origin);
        const packed = new Uint8Array(raw);
        // A packed save is also bounded by the size its gzip trailer claims; unpacking enforces the bound again.
        if (isGzip(packed) && gzipSizeOf(packed) > REALM_TEXT_MAX_BYTES) return no('too-large', 413, origin);
        let summary = null;
        try { summary = JSON.parse(request.headers.get('x-realm-summary') || 'null'); } catch { summary = null; }
        // A refused sequence returns the service's seq so a tab can resync; a write still needs the lease.
        const r = await checkpointRealm(rctx, me, {
          id: realmSlot.id, lease: request.headers.get('x-realm-lease'), seq: Number(request.headers.get('x-realm-seq')), summary,
          session: who.session?.id ?? null,
        }, raw, raw.byteLength);
        if (r.error === 'seq') return json({ error: 'seq', seq: r.seq }, 409, origin);
        if (r.error === 'banned') return json(bannedAnswer(r.player), 403, origin);
        if (r.error === 'frozen') return json(frozenAnswer(r.player), 403, origin);
        return answer(r);
      }
      if (request.method === 'GET') {
        const r = await getRealmBlob(rctx, me, realmSlot.id);
        if (r.error) return no(r.error, REALM_STATUS[r.error] ?? 404, origin);
        let body = r.object.body;
        // Builds that do not ask for gzip get the save unpacked.
        if (url.searchParams.get('enc') !== 'gzip') {
          const bytes = await objectBytesOf(r.object);
          body = isGzip(bytes) ? await gunzipText(bytes, REALM_TEXT_MAX_BYTES) : bytes;
          if (body == null) return no('no-data', 404, origin);
        }
        return new Response(body, {
          status: 200,
          headers: {
            'content-type': 'application/octet-stream',
            'access-control-allow-origin': origin,
            'access-control-expose-headers': 'x-realm-seq',
            'x-realm-seq': String(r.seq),
            'cache-control': 'no-store',
          },
        });
      }
      return no('method', 405, origin);
    }
    if (request.method !== 'POST') return no('method', 405, origin);
    // Answers that grant a lease say this service opens packed saves, and a tab packs only after it hears that.
    const leased = (/** @type {any} */ r) => answer(r.error ? r : { ...r, gzip: true });
    if (path === '/v1/realm/create') return leased(await createRealm(rctx, me, { name: body.name, summary: body.summary, lineage: body.lineage, person: body.person }));
    if (path === '/v1/realm/customs') return leased(await customsRealm(rctx, me, { origin: body.origin, name: body.name, summary: body.summary }));
    if (path === '/v1/realm/join') return leased(await joinRealm(rctx, me, body.id));
    if (path === '/v1/realm/trade') {
      const r = await tradeRealm(rctx, me, body);
      if (r.error === 'seq') return json({ error: 'seq', seq: r.seq }, 409, origin);
      return answer(r);
    }
    if (path === '/v1/realm/leave') return answer(await leaveRealm(rctx, me, { id: body.id, lease: body.lease }));
    if (path === '/v1/realm/undo') return answer(await undoRealm(rctx, me, body.id));
    if (path === '/v1/realm/lineages') return json({ lineages: await listLineages(rctx, me) }, 200, origin);
    if (path === '/v1/realm/lineage') {
      const r = await putLineage(rctx, me, { id: body.id, record: body.record, base: body.base ?? null });
      if (r.error === 'lineage-stale') return json(r, 409, origin);
      if (r.error === 'lineage-law') return json(r, 400, origin);
      return answer(r);
    }
    if (path === '/v1/realm/die') return answer(await realmDie(rctx, me, { id: body.id, lease: body.lease, why: body.why, hold: body.hold ?? false }));
    if (path === '/v1/realm/raise') return answer(await realmRaise(rctx, me, { id: body.id, lease: body.lease, diedAt: body.diedAt }));
    if (path === '/v1/realm/wed') return answer(await realmWed(rctx, me, { id: body.id, lease: body.lease, sid: body.sid, partner: body.partner, partnerChar: body.partnerChar, withdraw: body.withdraw === true }));
    if (path === '/v1/realm/unions') return json({ unions: await listUnions(rctx, me) }, 200, origin);
    const deleted = await deleteRealm(rctx, me, body.id);
    for (const { mapId } of deleted?.moved ?? []) forgetYards(mapId);
    return answer(await homeOrdersOf(deleted, me, env, subtle, nowS));
  }
  return NEXT;
}
