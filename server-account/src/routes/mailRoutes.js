// Account service routes: mail, the post, reports, the heartbeat, and account and sign-in settings.
import {
  closeSession, closeAllSessions, accountKind, register, changePassword, setEmail, newRecoveryCodes, creditPlay,
  legalRefusal
} from '../accounts.js';
import { sendLetter, inboxOf, readLetter, deleteLetter } from '../letters.js';
import { postBoxOf, readPost, claimPost, deletePost } from '../post.js';
import { mailLostSpoils } from '../lostSpoils.js';
import { sendReport, myReports, reportInbox, readReport, closeReport } from '../reports.js';
import { heartbeatPartsOf } from '../metrics.js';
import { playerStaffChat, STAFF_CHAT_ROUTES, STAFF_CHAT_STATUS } from '../staffFreeze.js';
import { auditStatement } from '../staff.js';
import { heartbeat } from '../heartbeat.js';
import { REPORT_STATUS, POST_STATUS, REALM_STATUS } from '../routeStatus.js';
import { json, no } from '../routeHelpers.js';
import { NEXT } from './next.js';

export async function mailRoutes({ request, env, held, origin, path, ctx, body, who }) {
  if (STAFF_CHAT_ROUTES.includes(path)) {
    if (request.method !== 'POST') return no('method', 405, origin);
    const r = await playerStaffChat(ctx, env, path, body, who.player, auditStatement);
    return 'error' in r ? no(r.error, STAFF_CHAT_STATUS[/** @type {keyof typeof STAFF_CHAT_STATUS} */ (r.error)] ?? 400, origin) : json(r, 200, origin);
  }

  if (path === '/v1/heartbeat') {
    if (request.method !== 'POST') return no('method', 405, origin);
    held.said.parts = heartbeatPartsOf(body);
    return json(await heartbeat(ctx, who.player, env, body, who.session?.id ?? null), 200, origin);
  }
  // The credit ignores the body and uses the gap on the server clock, so a client has no field to inflate.
  if (path === '/v1/account/played' && request.method === 'POST') {
    return json(await creditPlay(ctx, who.player.id, who.session?.id ?? null), 200, origin);
  }

  // Register upgrades the session's own row in place; its answer is the only time these recovery codes are shown.
  if (path === '/v1/auth/register' && request.method === 'POST') {
    const refused = legalRefusal(body);
    if (refused) return no(refused.error, 400, origin);
    const r = await register(ctx, who.player.id, { handle: body.handle, password: body.password, legal: { terms: body.terms, privacy: body.privacy }, set: body.set === true });
    return r.error ? no(r.error, 400, origin) : json(r, 200, origin);
  }

  if (path === '/v1/account/password' && request.method === 'POST') {
    const r = await changePassword(ctx, who.player, who.session, { oldPassword: body.oldPassword, password: body.password });
    return r.error ? no(r.error, r.error === 'rate' ? 429 : r.error === 'bad-login' ? 401 : 400, origin) : json(r, 200, origin);
  }

  if (path === '/v1/account/recovery-codes' && request.method === 'POST') {
    const r = await newRecoveryCodes(ctx, who.player, { password: body.password, code: body.code });
    return r.error ? no(r.error, r.error === 'rate' ? 429 : r.error === 'bad-login' || r.error === 'bad-code' ? 401 : r.error === 'codes-moved' ? 409 : 400, origin) : json(r, 200, origin);
  }

  if (path === '/v1/account/email' && request.method === 'POST') {
    const r = await setEmail(ctx, who.player.id, body.email ?? null);
    return r.error ? no(r.error, 400, origin) : json(r, 200, origin);
  }

  if (path === '/v1/auth/logout' && request.method === 'POST') {
    const r = body.all === true
      ? await closeAllSessions(ctx, who.player.id)
      : await closeSession(ctx, who.session.id);
    return json({ ...r, scope: body.all === true ? 'all' : 'this' }, 200, origin);
  }

  if (path.startsWith('/v1/mail/')) {
    // 403 rather than 401: the credential is valid, but a guest account cannot use mail.
    if (accountKind(who.player) !== 'linked') return no('mail-needs-account', 403, origin);
    if (path === '/v1/mail/inbox') {
      if (request.method !== 'GET') return no('method', 405, origin);
      return json(await inboxOf(ctx, who.player, env), 200, origin);
    }
    if (request.method !== 'POST') return no('method', 405, origin);
    if (path === '/v1/mail/send') {
      const r = await sendLetter(ctx, who.player, { to: body.to, toAccount: body.toAccount, subject: body.subject, body: body.body });
      if (!('error' in r)) return json(r, 200, origin);
      const status = r.error === 'muted' ? 403 : r.error === 'no-reader' || r.error === 'reader-guest' ? 404 : r.error === 'mail-rate' ? 429 : r.error === 'inbox-full' ? 409 : 400;
      return no(r.error, status, origin);
    }
    const r = path === '/v1/mail/read' ? await readLetter(ctx, who.player, env, body.id) : await deleteLetter(ctx, who.player, body.id);
    return 'error' in r ? no(r.error, 404, origin) : json(r, 200, origin);
  }

  if (path.startsWith('/v1/post/')) {
    if (accountKind(who.player) !== 'linked') return no('post-needs-account', 403, origin);
    if (path === '/v1/post/box') {
      if (request.method !== 'GET') return no('method', 405, origin);
      return json(await postBoxOf(ctx, who.player, env), 200, origin);
    }
    if (request.method !== 'POST') return no('method', 405, origin);
    const act = {
      '/v1/post/read': () => readPost(ctx, who.player, body.id),
      '/v1/post/claim': () => claimPost({ ...ctx, bucket: env.SAVES }, who.player, { id: body.id, character: body.character, realm: body.realm }),
      '/v1/post/delete': () => deletePost(ctx, who.player, body.id),
      '/v1/post/lost': () => mailLostSpoils(ctx, who.player, { day: body.day, pieces: body.pieces }),
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act();
    if (!('error' in r)) return json(r, 200, origin);
    if (r.error === 'seq') return json({ error: 'seq', seq: r.seq }, 409, origin);
    return no(r.error, POST_STATUS[r.error] ?? REALM_STATUS[r.error] ?? 400, origin);
  }

  if (path.startsWith('/v1/report/')) {
    if (accountKind(who.player) !== 'linked') return no('report-needs-account', 403, origin);
    if (request.method !== 'POST') return no('method', 405, origin);
    const act = {
      '/v1/report/send': () => sendReport(ctx, who.player, body),
      '/v1/report/mine': () => myReports(ctx, who.player),
      '/v1/report/inbox': () => reportInbox(ctx, who.player, env, body),
      '/v1/report/read': () => readReport(ctx, who.player, env, body.id),
      '/v1/report/close': () => closeReport(ctx, who.player, env, body),
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act();
    return 'error' in r ? no(r.error, REPORT_STATUS[r.error] ?? 400, origin) : json(r, 200, origin);
  }
  return NEXT;
}
