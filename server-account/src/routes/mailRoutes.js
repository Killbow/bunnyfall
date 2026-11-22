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
  // STAFF-PANEL5-FREEZE (staffFreeze.js): THE PLAYER'S OWN STAFF CHAT THREAD - read, and a line of theirs in it
  if (STAFF_CHAT_ROUTES.includes(path)) {
    if (request.method !== 'POST') return no('method', 405, origin);
    const r = await playerStaffChat(ctx, env, path, body, who.player, auditStatement);
    return 'error' in r ? no(r.error, STAFF_CHAT_STATUS[/** @type {keyof typeof STAFF_CHAT_STATUS} */ (r.error)] ?? 400, origin) : json(r, 200, origin);
  }

  // SCALE4c: ONE HEARTBEAT - the beat, the letterbox and a town's board, whichever the body names, each part answered
  // as its own route answers it (heartbeat.js), under the one session this request resolved
  if (path === '/v1/heartbeat') {
    if (request.method !== 'POST') return no('method', 405, origin);
    held.said.parts = heartbeatPartsOf(body);   // AUDIT SCALE II A-3: the parts of the body read above - capped, and behind the session
    return json(await heartbeat(ctx, who.player, env, body, who.session?.id ?? null), 200, origin);   // SESSION-SIGN E3: the beat asks its session
  }
  if (path === '/v1/account/played' && request.method === 'POST') {
    // ACC4: A BEAT, AND NOTHING IN IT IS READ. Whatever the body
    // says, the credit is the gap by THIS clock (accounts.js
    // `creditPlay`), so there is no field a client could inflate.
    return json(await creditPlay(ctx, who.player.id, who.session?.id ?? null), 200, origin);
  }

  if (path === '/v1/auth/register' && request.method === 'POST') {
    // AN UPGRADE IN PLACE of the row this session already belongs
    // to - not a new account. The recovery code in the answer is
    // THE ONLY TIME IT IS EVER READABLE.
    //
    // TERMS1: and it asks what the guest route asks. A guest made
    // before the boxes existed has agreed to nothing, and naming it is
    // where it becomes the account the request means.
    const refused = legalRefusal(body);
    if (refused) return no(refused.error, 400, origin);
    const r = await register(ctx, who.player.id, { handle: body.handle, password: body.password, legal: { terms: body.terms, privacy: body.privacy }, set: body.set === true });   // RECOVERY-SET: a set for a build that asks
    return r.error ? no(r.error, 400, origin) : json(r, 200, origin);
  }

  if (path === '/v1/account/password' && request.method === 'POST') {
    const r = await changePassword(ctx, who.player, who.session, { oldPassword: body.oldPassword, password: body.password });
    return r.error ? no(r.error, r.error === 'rate' ? 429 : r.error === 'bad-login' ? 401 : 400, origin) : json(r, 200, origin);
  }

  if (path === '/v1/account/recovery-codes' && request.method === 'POST') {
    // RECOVERY-SET: a NEW set of recovery codes, behind the password and one current code (AUDIT RECOVERY-SET A1) -
    // shown once, the old set dead with the write
    const r = await newRecoveryCodes(ctx, who.player, { password: body.password, code: body.code });
    return r.error ? no(r.error, r.error === 'rate' ? 429 : r.error === 'bad-login' || r.error === 'bad-code' ? 401 : r.error === 'codes-moved' ? 409 : 400, origin) : json(r, 200, origin);
  }

  if (path === '/v1/account/email' && request.method === 'POST') {
    // COMPLETELY OPTIONAL (Mac). Nothing is gated behind it, and
    // `null` takes it off again.
    const r = await setEmail(ctx, who.player.id, body.email ?? null);
    return r.error ? no(r.error, 400, origin) : json(r, 200, origin);
  }

  if (path === '/v1/auth/logout' && request.method === 'POST') {
    // THIS DEVICE by default. Signing out of a laptop has never
    // dropped somebody's phone, and "everywhere" is a separate,
    // explicit act rather than a surprise.
    const r = body.all === true
      ? await closeAllSessions(ctx, who.player.id)
      : await closeSession(ctx, who.session.id);
    return json({ ...r, scope: body.all === true ? 'all' : 'this' }, 200, origin);
  }

  // ═══ MAIL1: LETTERS ═════════════════════════════════════════
  //
  // THE SAME WALL AS THE SAVES', with its own word for the same
  // reason theirs has one (below): a guest is a device, and neither
  // a reader a letter can find again nor a writer a mute can reach
  // (server-account/src/letters.js says both). 403, not 401: the
  // credential is good.
  if (path.startsWith('/v1/mail/')) {
    if (accountKind(who.player) !== 'linked') return no('mail-needs-account', 403, origin);
    if (path === '/v1/mail/inbox') {
      if (request.method !== 'GET') return no('method', 405, origin);
      return json(await inboxOf(ctx, who.player, env), 200, origin);
    }
    if (request.method !== 'POST') return no('method', 405, origin);
    if (path === '/v1/mail/send') {
      const r = await sendLetter(ctx, who.player, { to: body.to, toAccount: body.toAccount, subject: body.subject, body: body.body });   // NAME-AS: or by account - a friend's letter
      if (!('error' in r)) return json(r, 200, origin);
      const status = r.error === 'muted' ? 403 : r.error === 'no-reader' || r.error === 'reader-guest' ? 404 : r.error === 'mail-rate' ? 429 : r.error === 'inbox-full' ? 409 : 400;
      return no(r.error, status, origin);
    }
    const r = path === '/v1/mail/read' ? await readLetter(ctx, who.player, env, body.id) : await deleteLetter(ctx, who.player, body.id);
    return 'error' in r ? no(r.error, 404, origin) : json(r, 200, origin);
  }

  // SERVER-POST (2026-10-08, Mac: "an ingame server mailbox that goes next to the hourglass in the pause menu ... First
  // use is to utilize it for players being granted items"): THE SERVER'S POST - the developers' pieces to one account,
  // a registered one's alone (the letters' wall, its own word), each perhaps holding an item its reader claims into the
  // online character being played (post.js). Read, claimed and thrown away here; written only by the operator's workflow.
  if (path.startsWith('/v1/post/')) {
    if (accountKind(who.player) !== 'linked') return no('post-needs-account', 403, origin);
    if (path === '/v1/post/box') {
      if (request.method !== 'GET') return no('method', 405, origin);
      return json(await postBoxOf(ctx, who.player, env), 200, origin);   // PRIVATE-REPORT: env, a reader's count
    }
    if (request.method !== 'POST') return no('method', 405, origin);
    const act = {
      '/v1/post/read': () => readPost(ctx, who.player, body.id),
      '/v1/post/claim': () => claimPost({ ...ctx, bucket: env.SAVES }, who.player, { id: body.id, character: body.character, realm: body.realm }),   // the realm record is in R2
      '/v1/post/delete': () => deletePost(ctx, who.player, body.id),
      '/v1/post/lost': () => mailLostSpoils(ctx, who.player, { day: body.day, pieces: body.pieces }),   // LOST-SPOILS: the Lost and Found's (lostSpoils.js)
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act();
    if (!('error' in r)) return json(r, 200, origin);
    if (r.error === 'seq') return json({ error: 'seq', seq: r.seq }, 409, origin);   // the service's own, as a checkpoint's
    return no(r.error, POST_STATUS[r.error] ?? REALM_STATUS[r.error] ?? 400, origin);
  }

  // PRIVATE-REPORT (2026-10-17, Mac: "Can we add a private disclosure method for exploits/bugs with the client"): A
  // PLAYER'S PRIVATE REPORT - an exploit, a bug, a security hole - to the readers REPORT_READER_HANDLES names, and
  // their inbox (reports.js). A registered account's alone, the letters' wall with its own word: a guest is a device,
  // and a report a reader cannot answer to anybody is one the next storage clear forgets who sent.
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
