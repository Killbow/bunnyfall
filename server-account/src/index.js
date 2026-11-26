// @ts-check
// Account service Worker. Every named export here is read as a Worker entrypoint, so only `default` and the
// AdmitGate Durable Object are exported; constants live in service.js.

import { readSwitches } from './bunnyfall.js';
import {
  createGuest, resolveSession, 
  login, recover, overRate, overAccountRate, accountRateFull,
  legalRefusal,
  ACCOUNT_MAX, ACCOUNT_WINDOW_S,
} from './accounts.js';
import { TOKEN_V } from '../../src/net/identityToken.js';
import { ACCOUNT_VERSION, MAX_BODY_BYTES, ROUTES, OPEN_ROUTES, PATREON_OPEN_ROUTES, SAFE_OPEN_ROUTES, STAFF_ROUTES, savePathOf, realmPathOf, poiPathOf, maintaining, routeDb, d1BookmarkOf, D1_BOOKMARK_RE, shedding } from './service.js';
import { getPoiAsset, poiLiveFeed, poiHeldVersion, poiFeedTag } from './poi.js';
import { takeGrantMeasure, GRANT_FEED_PATH } from './grants.js';
import { GRANT_MEASURE_SIG_HEADER, GRANT_MEASURE_MAX_BYTES } from '../../src/net/grantMeasure.js';
import { takeNetFeed, NET_FEED_PATH } from './staffNet.js';
import { takeReactionFeed, REACTION_FEED_PATH } from './staffReactions.js';
import { STAFF_FEED_SIG_HEADER, STAFF_FEED_MAX_BYTES } from '../../server/src/staffFeedLaw.js';
import { withHonours } from './honours.js';
import { ARENA_HONOUR_PATHS } from './arena.js';
import { LOST_BODY_MAX } from '../../src/net/lostLaw.js';
import { REPORT_BODY_BYTES } from '../../src/net/reportLaw.js';
import { withEgHonours } from './egHonours.js';
import { SKIN_BODY_MAX } from '../../src/net/skinLaw.js';
import { siegesLive } from './seatBattles.js';

import { yardsKept } from './decor.js';
import { DECOR_BATCH_BYTES } from '../../src/net/decorLaw.js';
import { TEMPLATE_BODY_BYTES } from '../../src/net/decoratorLaw.js';
import { DISCORD_BOT_ROUTE, DISCORD_GAME_ROUTE, discordBotAuthorized, discordBotAction, discordGameAction } from './discordIntegration.js';
import { doorReads } from './door.js';
import { passRoute, passKey, mintPass, readPass, passMintable } from './sessionPass.js';
import { SESSION_PASS_HEADER } from '../../src/net/sessionPassLaw.js';
import { PROGRESS_ROUTES, seatRefusalOf, progressConfig, progressRoom } from './progress.js';
import { REALM_TRADE_BODY_MAX } from './realmTrade.js';
import { poiActPath, POI_ACT_BODY_MAX } from './poiTrade.js';
import { LINEAGE_BODY_MAX } from './legacy.js';
import { measured } from './metrics.js';
import { runCron } from './cron.js';
import { bannedAnswer, REPORT_BODY_MAX } from './safety.js';
import { isBanned } from './sanctions.js';
import { freezeRefusal } from './staffFreeze.js';
import { staffRoute, STAFF_STATUS, STAFF_SESSION_HEADER } from './staff.js';
import { takeHiddenSeen } from './staffHidden.js';
import { HIDDEN_SEEN_PATH, HIDDEN_SEEN_MAX_BYTES, HIDDEN_SEEN_SIG_HEADER } from '../../src/net/hiddenSeen.js';
import { discordSigned, discordInteraction, DISCORD_BODY_MAX } from './discord.js';
import { ADMIT_ROUTES, admitWait } from './admit.js';
export { AdmitGate } from './admit.js';
import {
  patreonLinkOn, openPatreon, sealPatreon, patreonExchange, patreonIdentity, linkPatreon, patreonWebhook,
  pledgeTitles, patreonHtml, patreonPage, patreonConfirmPage, patreonLinkedPage,
  PATREON_PAGES, PATREON_TICKET_S, PATREON_HOOK_MAX_BYTES, PATREON_CALLBACK_PATH,
} from './patreon.js';

import {
  json, no, POI_OPEN_MAX, poiAssetResponse, thrown, overloaded, readCapped,
  readBody
} from './routeHelpers.js';
import { NEXT } from './routes/next.js';
import { accountRoutes } from './routes/accountRoutes.js';
import { playRoutes } from './routes/playRoutes.js';
import { townRoutes } from './routes/townRoutes.js';
import { seatsRoutes } from './routes/seatsRoutes.js';
import { worldRoutes } from './routes/worldRoutes.js';
import { mailRoutes } from './routes/mailRoutes.js';
import { storageRoutes } from './routes/storageRoutes.js';

const service = {
  async fetch(request, env, said = { parts: '' }, exec = null) {
    const held = { session: null, said, exec, pass: null };
    const res = await service.route(request, env, held);
    let mark = null;
    try { mark = held.session?.getBookmark?.() ?? null; } catch { mark = null; }
    const marked = typeof mark === 'string' && D1_BOOKMARK_RE.test(mark);
    if (!marked && !held.pass) return res;
    const out = new Response(res.body, res);
    if (marked) { out.headers.set('x-d1-bookmark', mark); out.headers.append('access-control-expose-headers', 'x-d1-bookmark'); }
    if (held.pass) { out.headers.set(SESSION_PASS_HEADER, held.pass); out.headers.append('access-control-expose-headers', SESSION_PASS_HEADER); }
    return out;
  },
  async route(request, env, held = { session: null, said: { parts: '' }, pass: null }) {
    const subtle = crypto.subtle;
    const rand = (b) => crypto.getRandomValues(b);
    const nowS = Math.floor(Date.now() / 1000);
    const origin = env.ALLOWED_ORIGIN || '*';
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/accounts(?=\/)/, '');

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'access-control-allow-headers': 'content-type, authorization, x-realm-lease, x-realm-seq, x-realm-summary, x-d1-bookmark, if-none-match, x-session-pass, x-staff-session',
          'access-control-max-age': '86400',
        },
      });
    }

    if (path === '/v1/seats/sieges/live') {
      if (request.method !== 'GET') return no('method', 405, origin);
      if (!env.DB) return no('no-database', 503, origin);
      try {
        return json(await siegesLive(env.DB, Math.floor(Date.now() / 1000)), 200, origin);
      } catch (e) {
        return thrown(path, e, origin);
      }
    }
    if (path === '/v1/health') return json({ ok: true, v: env.ACCOUNT_VERSION || ACCOUNT_VERSION, ...(maintaining(env) ? { maintenance: true } : {}) }, 200, origin);

    if (path === '/v1/pubkey') {
      const pub = String(env.IDENTITY_PUBLIC_KEY ?? '');
      return pub
        ? json({ alg: TOKEN_V, key: pub }, 200, origin)
        : no('no-signing-key', 503, origin);
    }
    if (path === '/v1/relaykey') {
      const rk = String(env.GATE_PUBLIC_KEY ?? '');
      return rk ? json({ rk }, 200, origin) : no('no-relay-key', 503, origin);
    }

    // A history restore rewinds the database, so while it runs every route below returns 503 and no write is lost.
    if (maintaining(env)) return no('maintenance', 503, origin);

    const slot = savePathOf(path);
    const realmSlot = realmPathOf(path);
    const poiPath = poiPathOf(path);
    // Unknown paths return 404 before the credential check, so a mistyped route never reads as a bad secret.
    if (!ROUTES.has(path) && !slot && !realmSlot && !poiPath) return no('not-found', 404, origin);

    if (!env.DB) return no('no-database', 503, origin);
    if (ADMIT_ROUTES.has(path) && request.method === 'POST') {
      const queued = await admitWait(env, request.headers.get('cf-connecting-ip') || 'unknown');
      if (queued) {
        const res = json({ error: 'queue', position: queued.position, wait: queued.wait }, 503, origin);
        res.headers.set('retry-after', String(Math.ceil(queued.wait / 1000)));
        return res;
      }
    }
    const db = routeDb(env.DB, path, request.method, d1BookmarkOf(request));
    if (db !== env.DB) held.session = db;
    // `primary` is the binding itself, for read-then-write paths that must not run on a replica session.
    const ctx = { db, primary: env.DB, subtle, rand, nowS };
    if (shedding(path, request.method, Date.now())) return overloaded(origin);

    try {
      // The Patreon doors take no session and no JSON, and the webhook signature covers its exact bytes.
      if (PATREON_OPEN_ROUTES.has(path)) {
        if (path === '/v1/patreon/webhook') {
          if (request.method !== 'POST') return no('method', 405, origin);
          const bytes = await readCapped(request, PATREON_HOOK_MAX_BYTES);
          if (!bytes) return no('too-large', 413, origin);
          const r = await patreonWebhook(ctx, env, new Uint8Array(bytes), request.headers.get('x-patreon-signature'), request.headers.get('x-patreon-event'));
          return 'error' in r ? no(r.error, r.error === 'patreon-closed' ? 503 : r.error === 'signature' ? 401 : 400, origin) : json(r, 200, origin);
        }
        const page = (/** @type {any} */ p, /** @type {number} */ status) => patreonHtml(patreonPage(p), status);
        if (!patreonLinkOn(env)) return page(PATREON_PAGES.off, 503);
        if (await overRate(ctx, `ip:${request.headers.get('cf-connecting-ip') || 'unknown'}`, 60)) return page(PATREON_PAGES.rate, 429);
        const outbound = (/** @type {string} */ u, /** @type {any} */ init) => globalThis.fetch(u, init);
        if (path === PATREON_CALLBACK_PATH) {
          if (request.method !== 'GET') return no('method', 405, origin);
          const state = await openPatreon('state', url.searchParams.get('state'), env, { subtle, nowS });
          if (!state) return page(PATREON_PAGES.expired, 400);
          const code = url.searchParams.get('code');
          if (!code || url.searchParams.has('error')) return page(PATREON_PAGES.declined, 200);
          const player = await db.prepare('SELECT id, handle FROM players WHERE id = ?1').bind(state.p).first();
          if (!player?.handle) return page(PATREON_PAGES.account, 403);
          const token = await patreonExchange(outbound, env, code, `${url.origin}${PATREON_CALLBACK_PATH}`);
          if ('error' in token) return page(PATREON_PAGES.down, 502);
          const who = await patreonIdentity(outbound, token.token);
          if ('error' in who) return page(PATREON_PAGES.down, 502);
          const from = await db.prepare('SELECT handle FROM players WHERE patreon_user = ?1 AND id <> ?2').bind(who.user, player.id).first();
          // The callback writes nothing; the patron confirms which account the sealed ticket names before linking.
          const ticket = await sealPatreon('ticket', { p: player.id, u: who.user, k: token.token, x: nowS + PATREON_TICKET_S }, env, { subtle, rand });
          return patreonHtml(patreonConfirmPage({ handle: player.handle, name: who.name, titles: pledgeTitles(who.tiers, who.status, env), ticket, from: from?.handle ?? null }));
        }
        if (request.method !== 'POST') return no('method', 405, origin);
        const bytes = await readCapped(request, MAX_BODY_BYTES);
        const ticket = await openPatreon('ticket', new URLSearchParams(bytes ? new TextDecoder().decode(bytes) : '').get('ticket'), env, { subtle, nowS });
        if (!ticket || typeof ticket.k !== 'string') return page(PATREON_PAGES.expired, 400);
        const who = await patreonIdentity(outbound, ticket.k);
        if ('error' in who) return page(PATREON_PAGES.down, 502);
        if (who.user !== ticket.u) return page(PATREON_PAGES.expired, 400);
        const r = await linkPatreon(ctx, { p: ticket.p, u: who.user, t: who.tiers.join(','), s: who.status });
        if ('error' in r) return page(PATREON_PAGES.account, 403);
        const row = await db.prepare('SELECT handle FROM players WHERE id = ?1').bind(ticket.p).first();
        return patreonHtml(patreonLinkedPage({ handle: row?.handle ?? '', titles: pledgeTitles(who.tiers, who.status, env) }));
      }

      if (path === GRANT_FEED_PATH) {
        if (request.method !== 'POST') return no('method', 405, origin);
        const bytes = await readCapped(request, GRANT_MEASURE_MAX_BYTES);
        if (!bytes) return no('too-large', 413, origin);
        const r = await takeGrantMeasure(ctx, env, new Uint8Array(bytes), request.headers.get(GRANT_MEASURE_SIG_HEADER));
        return 'error' in r ? no(r.error, r.error === 'grant-signature' ? 401 : 400, origin) : json(r, 202, origin);
      }

      if (path === NET_FEED_PATH || path === REACTION_FEED_PATH) {
        if (request.method !== 'POST') return no('method', 405, origin);
        const bytes = await readCapped(request, STAFF_FEED_MAX_BYTES);
        if (!bytes) return no('too-large', 413, origin);
        const r = await (path === NET_FEED_PATH ? takeNetFeed : takeReactionFeed)(ctx, env, new Uint8Array(bytes), request.headers.get(STAFF_FEED_SIG_HEADER));
        return 'error' in r ? no(r.error, r.error === 'feed-signature' ? 401 : 400, origin) : json(r, 202, origin);
      }
      if (path === HIDDEN_SEEN_PATH) {
        if (request.method !== 'POST') return no('method', 405, origin);
        const bytes = await readCapped(request, HIDDEN_SEEN_MAX_BYTES);
        if (!bytes) return no('too-large', 413, origin);
        const r = await takeHiddenSeen(ctx, env, new Uint8Array(bytes), request.headers.get(HIDDEN_SEEN_SIG_HEADER));
        return 'error' in r ? no(r.error, r.error === 'seen-signature' ? 401 : 400, origin) : json(r, 202, origin);
      }

      if (SAFE_OPEN_ROUTES.has(path)) {
        if (request.method !== 'POST') return no('method', 405, origin);
        const bytes = await readCapped(request, DISCORD_BODY_MAX);
        if (!bytes) return no('too-large', 413, origin);
        if (!(await discordSigned(env, new Uint8Array(bytes), request.headers.get('x-signature-ed25519'), request.headers.get('x-signature-timestamp'), { subtle, nowS }))) return no('signature', 401, origin);
        let interaction = null;
        try { interaction = JSON.parse(new TextDecoder().decode(bytes)); } catch { interaction = null; }
        if (!interaction || typeof interaction !== 'object') return no('body', 400, origin);
        const exec = /** @type {any} */ (held).exec;
        return json(await discordInteraction(ctx, env, interaction, typeof exec?.waitUntil === 'function' ? { later: (p) => exec.waitUntil(p) } : {}), 200, origin);
      }

      if (STAFF_ROUTES.has(path)) {
        if (request.method !== 'POST') return no('method', 405, origin);
        const body = await readBody(request);
        if (!body) return no('body', 400, origin);
        const exec = /** @type {any} */ (held).exec;
        const r = await staffRoute(typeof exec?.waitUntil === 'function' ? { ...ctx, later: (/** @type {Promise<any>} */ p) => exec.waitUntil(p) } : ctx, env, path, body, { ip: request.headers.get('cf-connecting-ip') || 'unknown', token: request.headers.get(STAFF_SESSION_HEADER) });
        return 'error' in r ? (r.message ? json({ error: r.error, message: r.message }, STAFF_STATUS[/** @type {keyof typeof STAFF_STATUS} */ (r.error)] ?? 400, origin) : no(r.error, STAFF_STATUS[/** @type {keyof typeof STAFF_STATUS} */ (r.error)] ?? 400, origin)) : json(r, 200, origin);
      }

      if (OPEN_ROUTES.has(path)) {
        if (request.method !== 'POST') return no('method', 405, origin);
        const body = await readBody(request);
        if (!body) return no('body', 400, origin);

        const ip = request.headers.get('cf-connecting-ip') || 'unknown';
        // One address bucket covers every open route; the per-handle buckets inside login and recover stop an
        // attacker with many addresses.
        if (await overRate(ctx, `ip:${ip}`, 60)) return no('rate', 429, origin);

        if (path === '/v1/auth/guest') {
          const refused = legalRefusal(body);
          if (refused) return no(refused.error, 400, origin);
          const made = await createGuest(ctx, { deviceLabel: body.label ?? null, legal: { terms: body.terms, privacy: body.privacy } });
          return json(made, 200, origin);
        }
        if (path === '/v1/auth/login') {
          const r = await login(ctx, { handle: body.handle, password: body.password, deviceLabel: body.label ?? null });
          if (r.error === 'banned') return json(r, 403, origin);
          return r.error ? no(r.error, r.error === 'rate' ? 429 : 401, origin) : json(r, 200, origin);
        }
        const r = await recover(ctx, { handle: body.handle, code: body.code, password: body.password, set: body.set === true });
        if (r.error === 'banned') return json(r, 403, origin);
        return r.error ? no(r.error, r.error === 'rate' ? 429 : r.error === 'codes-moved' ? 409 : 401, origin) : json(r, 200, origin);
      }

      if (path === DISCORD_BOT_ROUTE) {
        if (request.method !== 'POST') return no('method', 405, origin);
        if (!(await discordBotAuthorized(request, env, subtle))) return no('auth', 401, origin);
        const input = await readBody(request, MAX_BODY_BYTES);
        if (!input) return no('body', 400, origin);
        const result = await discordBotAction(ctx, env, input);
        return 'error' in result ? no(result.error, result.status, origin) : json(result, 200, origin);
      }

      const body = request.method === 'POST'
        ? await readBody(request, path === '/v1/realm/lineage' ? LINEAGE_BODY_MAX : path === '/v1/realm/trade' ? REALM_TRADE_BODY_MAX : poiActPath(path) ? POI_ACT_BODY_MAX : path === '/v1/homes/decor/batch' || path === '/v1/homes/decor/draft' || path === '/v1/homes/decor/accept' ? DECOR_BATCH_BYTES : path === '/v1/homes/caravan/templates' ? TEMPLATE_BODY_BYTES : path === '/v1/safety/report' ? REPORT_BODY_MAX : path === '/v1/report/send' ? REPORT_BODY_BYTES : path === '/v1/post/lost' ? LOST_BODY_MAX : path === '/v1/skins/upload' ? SKIN_BODY_MAX : MAX_BODY_BYTES) : {};
      if (body === undefined && path === '/v1/realm/lineage') return no('lineage-too-large', 413, origin);
      if (body === undefined && (path === '/v1/homes/decor/batch' || path === '/v1/homes/decor/draft' || path === '/v1/homes/decor/accept' || path === '/v1/homes/caravan/templates')) return no('too-large', 413, origin);
      if (!body) return no('body', 400, origin);
      if (path === '/v1/homes/yards' && request.method === 'POST') {
        const ip = request.headers.get('cf-connecting-ip') || 'unknown';
        if (overAccountRate(`yards:${ip}`, nowS, ACCOUNT_MAX, ACCOUNT_WINDOW_S)) return no('rate', 429, origin);
        const r = await yardsKept(ctx, body.mapId, nowS);
        return 'error' in r ? no(r.error, 400, origin) : json(r, 200, origin);
      }
      if (poiPath && request.method === 'GET' && (poiPath.route === 'live' || poiPath.route === 'asset')) {
        const ip = request.headers.get('cf-connecting-ip') || 'unknown';
        if (overAccountRate(`poi:${ip}`, nowS, POI_OPEN_MAX, ACCOUNT_WINDOW_S)) return no('rate', 429, origin);
        const held = poiPath.route === 'live' ? poiHeldVersion(request.headers.get('if-none-match')) : -1;
        const feed = await poiLiveFeed(env.DB, Date.now(), held);
        if (poiPath.route === 'live') {
          const etag = poiFeedTag(feed.v);
          const headers = { 'access-control-allow-origin': origin, 'access-control-expose-headers': 'etag', etag, 'cache-control': 'public, max-age=30' };
          if (held === feed.v) return new Response(null, { status: 304, headers });
          return new Response(feed.body, { status: 200, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });
        }
        if (feed.live.has(poiPath.sha) || !request.headers.get('authorization')) {
          const r = await getPoiAsset({ ...ctx, db: env.DB, bucket: env.SAVES }, poiPath.sha, { builder: false });
          return 'error' in r ? no(r.error, r.error === 'no-storage' ? 503 : 404, origin) : poiAssetResponse(r, origin);
        }
      }
      // A bearer credential never goes in a URL, which is logged. The header wins over a POST body secret.
      const auth = request.headers.get('authorization') ?? '';
      const bearer = /^Bearer (.+)$/.exec(auth)?.[1];
      const secret = bearer ?? (request.method === 'POST' ? body.secret : null);
      const hot = passRoute(path, request.method) ? await passKey(env, subtle) : null;
      const who = (hot && await readPass(hot, request.headers.get(SESSION_PASS_HEADER), secret, nowS, subtle)) || await resolveSession(ctx, secret);
      if (!who) return no('auth', 401, origin);
      // The freeze check skips banned accounts, so a banned account always hears its ban.
      const frozen = !isBanned(who.player, nowS) && freezeRefusal(path, request.method === 'GET' && !!realmSlot, who.player, nowS);
      if (frozen) return json(frozen, 403, origin);
      if (isBanned(who.player, nowS) && path !== '/v1/auth/logout') return json(bannedAnswer(who.player), 403, origin);
      if (path === DISCORD_GAME_ROUTE) {
        if (request.method !== 'POST') return no('method', 405, origin);
        const result = await discordGameAction(ctx, env, who.player, body);
        return 'error' in result ? no(result.error, result.status, origin) : json(result, 200, origin);
      }
      // A pass is minted only after the ban check and only from a primary read, since a replica can lag behind a
      // sign-out.
      if (hot && !('pass' in who) && passMintable(db, env.DB)) held.pass = await mintPass(hot, who, secret, nowS, subtle);

      const progressRoute = request.method === 'POST' ? PROGRESS_ROUTES[/** @type {keyof typeof PROGRESS_ROUTES} */ (path)] : undefined;
      const claimed = progressRoute && !accountRateFull(who.player.id, nowS, ACCOUNT_MAX, ACCOUNT_WINDOW_S) ? progressRoute[0] : null;
      // Every act that names a dead character is refused here, except the token mint, which vouches only for the
      // account.
      const door = await doorReads(db, who.player.id, { tomb: path !== '/v1/auth/token' && typeof body.character === 'string' ? body.character : null, stream: claimed });
      if (door.dead) return no('dead', 410, origin);

      // A rate limit returns 429, never 401, so a limited player is not sent to reset a working password.
      if (overAccountRate(who.player.id, nowS, ACCOUNT_MAX, ACCOUNT_WINDOW_S)) {
        return no('rate', 429, origin);
      }

      if (progressRoute) {
        const [stream, named] = progressRoute;
        const read = door.seat === undefined ? await doorReads(db, who.player.id, { tomb: null, stream }) : door;
        const seat = seatRefusalOf(read.seat, { named, character: body.character });
        if (seat) return json(seat, 403, origin);
        const line = await progressConfig(db);
        if (line.enforce) {
          const room = await progressRoom(db, who.player.id, stream, line, read.bucket);
          if (room < 1) return no('progress-play', 429, origin);
          if (stream === 'renown' && Number.isSafeInteger(body.xp)) body.xp = Math.min(body.xp, room);
        }
      }

      // Honors are read on the binding, never a replica session, because a stale champion read is written back.
      const honoursCtx = { ...ctx, db: env.DB };
      if (ARENA_HONOUR_PATHS.has(path)) who.player = await withEgHonours(honoursCtx, await withHonours(honoursCtx, who.player, nowS), nowS);
      { const res = await accountRoutes({ request, env, subtle, rand, nowS, origin, url, path, ctx, body, who }); if (res !== NEXT) return res; }
      { const res = await playRoutes({ request, env, subtle, nowS, origin, path, db, ctx, body, who }); if (res !== NEXT) return res; }
      { const res = await townRoutes({ request, env, subtle, nowS, origin, path, ctx, body, who, progressRoute }); if (res !== NEXT) return res; }
      { const res = await seatsRoutes({ request, env, subtle, nowS, origin, path, ctx, body, who, progressRoute }); if (res !== NEXT) return res; }
      { const res = await worldRoutes({ request, env, nowS, origin, path, ctx, body, who }); if (res !== NEXT) return res; }
      { const res = await mailRoutes({ request, env, held, origin, path, ctx, body, who }); if (res !== NEXT) return res; }
      { const res = await storageRoutes({ request, env, subtle, nowS, origin, url, path, slot, realmSlot, poiPath, ctx, body, who }); if (res !== NEXT) return res; }

      return no('method', 405, origin);
    } catch (e) {
      return thrown(path, e, origin);
    }
  },
};

export default {
  fetch: (request, env, exec) => { readSwitches(env); return measured(request, env, service.fetch, exec); },
  scheduled: (controller, env) => runCron(env, { cron: controller?.cron, nowS: Math.floor(Number(controller?.scheduledTime ?? Date.now()) / 1000) }),
};
