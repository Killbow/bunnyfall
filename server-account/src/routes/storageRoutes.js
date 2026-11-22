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
  // ═══ ACC2: THE SAVES ═══════════════════════════════════════
  //
  // THE WALL, and the only place in this service that asks what an
  // account may DO rather than who it is. A guest is refused every
  // save route, read and write alike: an account that can be lost
  // by clearing a browser cannot hold a backup, because a backup
  // that cannot be restored is worse than none.
  //
  // ITS OWN WORD, not `not-registered`. That one already means "this
  // account has no password yet" at the sign-in routes, and the
  // refusal table maps one word to one sentence - so reusing it
  // would tell a player at the backup button to sign in again,
  // which is not what they need to do. 403 rather than 401 because
  // the credential is GOOD; there is nothing to sign in again with.
  // ═══ POI-1: THE POI STORE (poi.js) ═════════════════════════
  //
  // A builder's uploads, drafts and submissions; an approver's queue and word; the list and a POI's history. Every
  // door asks the role itself (poi.js poiRolesOf), so a route here is never more than the roles say.
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
      // POI-4b: an entry on the library's shelf, read to a draft's own bound (an entry is a POI without its place)
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
      // A RAW BODY, against its kind's own bound (as a save's is), read only for a builder
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
      // POI v2: a PLAYER'S doors, not a builder's - a live POI's trade or event, settled on the caller's own realm character
      // (poiTrade.js asks the live revision, the lease, the sequence and the hold itself). A moved record says the service's seq.
      if (route === 'trade' || route === 'event-claim') {
        const r = route === 'trade' ? await tradePoi({ ...pctx, rand: ctx.rand }, me.id, body) : await eventClaimPoi({ ...pctx, rand: ctx.rand }, me.id, body);
        if (r.error === 'seq') return json({ error: 'seq', seq: r.seq }, 409, origin);
        return answer(r);
      }
      if (route === 'submit') return answer(await submitPoi(pctx, me, env, { id: body.id, rev: body.rev }));
      if (route === 'withdraw') return answer(await withdrawPoi(pctx, me, env, { id: body.id, rev: body.rev }));
      if (route === 'retire') return answer(await requestRetire(pctx, me, env, { id: body.id }));
      if (route === 'review') return answer(await reviewPoi(pctx, me, env, { id: body.id, rev: body.rev, verdict: body.verdict, note: body.note ?? null, docSha: body.docSha ?? null }));   // AUDIT POI S1: what the approver saw
      if (route === 'rollback') return answer(await rollbackPoi(pctx, me, env, { id: body.id, rev: body.rev }));
      if (route === 'unshelve') return answer(await unshelve(pctx, me, env, { id: body.id }));
    }
    return no('method', 405, origin);
  }

  if (path === '/v1/saves' || slot) {
    if (accountKind(who.player) !== 'linked') return no('saves-need-account', 403, origin);
    const me = who.player.id;

    if (path === '/v1/saves') {
      if (request.method !== 'GET') return no('method', 405, origin);
      return json({ saves: await listSaves(ctx, me) }, 200, origin);
    }

    const bucket = env.SAVES;
    const sctx = { ...ctx, bucket };

    if (!slot.part) {
      if (request.method === 'PUT') {
        // THE CARD, and it is what CREATES a slot - the blobs below
        // refuse to land without one (saves.js says why: it is
        // SAV4's "a slot is only real WITH its SaveInfo", and it is
        // also the only thing bounding R2).
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
      // A RAW BODY, AGAINST ITS OWN BOUND. `readBody` caps at
      // MAX_BODY_BYTES (4 KiB), which is right for every JSON route
      // this service has and would refuse every real save - so the
      // blob routes never touch it and carry the bound that fits
      // them instead. The length is checked BEFORE the body is
      // read, so a caller announcing a gigabyte costs nothing, and
      // as it arrives, so one announcing nothing costs the bound.
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
      // THE BLOB ITSELF, not a JSON wrapper around a base64 copy of
      // it: a save is hundreds of kilobytes and base64 is a third
      // more of them, paid twice (once on the wire, once in the
      // string the client would have to hold whole).
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

  // ═══ REALM P1: THE REALM'S CHARACTERS (realm.js) ═════════════
  //
  // An online character's truth, held here: listed, made (born online or brought in once through customs),
  // joined under a lease, checkpointed at the next sequence, left, deleted - and its save read back for a join's
  // load or a copy to offline. EVERY ACCOUNT, a guest's too: a guest plays online, and its characters are its
  // account's as its Renown is.
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
        // A RAW BODY against the save's own bound, as the save slots read theirs; the lease, the sequence and
        // the tile ride headers, since the body is the save.
        const raw = await readCapped(request, REALM_MAX_BYTES);
        if (!raw) return no('too-large', 413, origin);
        if (!raw.byteLength) return no('body', 400, origin);
        // REALM-GZIP: a packed save is bounded twice - the request above, and the text it says it opens to (its
        // trailer's word, unread; every opening keeps the bound itself, so a gzip that lies buys nothing)
        const packed = new Uint8Array(raw);
        if (isGzip(packed) && gzipSizeOf(packed) > REALM_TEXT_MAX_BYTES) return no('too-large', 413, origin);
        let summary = null;
        try { summary = JSON.parse(request.headers.get('x-realm-summary') || 'null'); } catch { summary = null; }
        const r = await checkpointRealm(rctx, me, {
          id: realmSlot.id, lease: request.headers.get('x-realm-lease'), seq: Number(request.headers.get('x-realm-seq')), summary,
          session: who.session?.id ?? null,   // SESSION-SIGN (AUDIT PLAN-1000 E3): the save asks its session and the ban itself
        }, raw, raw.byteLength);
        // a sequence refused says the service's own, so a tab whose last answer was lost can resync (never a way in:
        // the write still needs the lease)
        if (r.error === 'seq') return json({ error: 'seq', seq: r.seq }, 409, origin);
        if (r.error === 'banned') return json(bannedAnswer(r.player), 403, origin);   // E3: a ban under a pass, at once
        if (r.error === 'frozen') return json(frozenAnswer(r.player), 403, origin);   // STAFF-PANEL5-FREEZE: a freeze under a pass, the same
        return answer(r);
      }
      if (request.method === 'GET') {
        const r = await getRealmBlob(rctx, me, realmSlot.id);
        if (r.error) return no(r.error, REALM_STATUS[r.error] ?? 404, origin);
        // REALM-GZIP: the save as stored, packed or plain, to a tab that asks for it so (it opens either); to one that
        // does not - a build from before - a packed save is opened here, and it reads the text it always read
        let body = r.object.body;
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
    // REALM-GZIP: every answer that hands a tab a lease says this service opens a packed save - a tab packs only then,
    // so a new build before its service is deployed (or after one rolled back) sends the text it always sent
    const leased = (/** @type {any} */ r) => answer(r.error ? r : { ...r, gzip: true });
    if (path === '/v1/realm/create') return leased(await createRealm(rctx, me, { name: body.name, summary: body.summary, lineage: body.lineage, person: body.person }));   // LEGACY7: born as a person of the account's own line
    if (path === '/v1/realm/customs') return leased(await customsRealm(rctx, me, { origin: body.origin, name: body.name, summary: body.summary }));   // AUDIT REALM L3-F2/F3: one guarded batch, and resumable
    if (path === '/v1/realm/join') return leased(await joinRealm(rctx, me, body.id));
    if (path === '/v1/realm/trade') {
      // REALM P2.1: a sequence refused says the service's own, as a checkpoint's does
      const r = await tradeRealm(rctx, me, body);
      if (r.error === 'seq') return json({ error: 'seq', seq: r.seq }, 409, origin);
      return answer(r);
    }
    if (path === '/v1/realm/leave') return answer(await leaveRealm(rctx, me, { id: body.id, lease: body.lease }));
    if (path === '/v1/realm/undo') return answer(await undoRealm(rctx, me, body.id));   // HOUSE-LOSS: a customs that never landed, undone
    // LEGACY7 (legacy.js): Project Legacy's lines - listed, written past their rev (a stale write answered with the
    // stored record, to merge into), and a fallen character's tombstone under its lease
    if (path === '/v1/realm/lineages') return json({ lineages: await listLineages(rctx, me) }, 200, origin);
    if (path === '/v1/realm/lineage') {
      const r = await putLineage(rctx, me, { id: body.id, record: body.record, base: body.base ?? null });   // AUDIT LEGACY III A2: the rev it was made from
      if (r.error === 'lineage-stale') return json(r, 409, origin);
      if (r.error === 'lineage-law') return json(r, 400, origin);   // INT18: which of the family's laws the copy broke
      return answer(r);
    }
    if (path === '/v1/realm/die') return answer(await realmDie(rctx, me, { id: body.id, lease: body.lease, why: body.why, hold: body.hold ?? false }));   // LEGACY7 part three: 'retired' keeps a union; REZ-BLOODLINE AUDIT R1: `hold`, the death door's fall a Resurrect may take back
    if (path === '/v1/realm/raise') return answer(await realmRaise(rctx, me, { id: body.id, lease: body.lease, diedAt: body.diedAt }));   // REZ-BLOODLINE AUDIT R1: a party's Resurrect inside the hold, under the lease that fell
    // LEGACY7 part three: a half of one wedding, and the account's unions
    // AUDIT LEGACY III O1/O3: the other's character as the relay stamped it, and a half taken back
    if (path === '/v1/realm/wed') return answer(await realmWed(rctx, me, { id: body.id, lease: body.lease, sid: body.sid, partner: body.partner, partnerChar: body.partnerChar, withdraw: body.withdraw === true }));
    if (path === '/v1/realm/unions') return json({ unions: await listUnions(rctx, me) }, 200, origin);
    // /v1/realm/delete - HOUSE-LOSS: which undoes one too, for a door that asks a delete. ACCOUNT-HOMES: the homes it
    // bought go with it (QUEST-HOME's `moved`), and their towns' kept yards are let go as a decor write lets them go (YARD-SHED)
    const deleted = await deleteRealm(rctx, me, body.id);
    for (const { mapId } of deleted?.moved ?? []) forgetYards(mapId);
    return answer(await homeOrdersOf(deleted, me, env, subtle, nowS));   // QUEST-HOME: its homes a house again to every page online
  }
  return NEXT;
}
