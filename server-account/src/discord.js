// @ts-check

import { displayName, isMuted } from './accounts.js';
import { canModerate } from './titles.js';
import { importPublicKey, ID_RE } from '../../src/net/identityToken.js';
import { findAccount, strikesLook, pushLaw, strikesOf, isBanned, bannedUntil } from './sanctions.js';
import { CASE_CLAIM_S, modAct, CLICK_RE } from './safety.js';
import { usageOf } from './discordCommands.js';
import { GRANT_CASE_TAB } from './grants.js';
import { LADDER_BAN_AT, ladderMinutes, BAN_FOREVER, banUntil, reportReasonLabel } from '../../src/net/safety/safetyLaw.js';

export const DISCORD_INTERACTIONS_PATH = '/v1/discord/interactions';
export const DISCORD_API = 'https://discord.com/api/v10';
export const DISCORD_BODY_MAX = 32 * 1024;
export const DISCORD_SKEW_S = 300;
export const DISCORD_POST_MS = 8000;
export const DISCORD_USER_AGENT = 'DiscordBot (https://github.com/Lattymoy/daggerfall-js-source, 1)';
export const SAY_MAX = 1900;
export const CARD_LINES_MAX = 24;
export const CARD_TEXT_MAX = 3400;
export const CARD_ACTS = Object.freeze({
  m30: Object.freeze({ label: 'Mute 30 min', minutes: 30 }),
  m1d: Object.freeze({ label: 'Mute 1 day', minutes: 24 * 60 }),
  m7d: Object.freeze({ label: 'Mute 7 days', minutes: 7 * 24 * 60 }),
  b30: Object.freeze({ label: 'Ban 30 days', days: 30 }),
  dis: Object.freeze({ label: 'Dismiss' }),
});
const SNOWFLAKE_RE = /^\d{5,25}$/;
const HEX_KEY_RE = /^[0-9a-f]{64}$/i;

/** @param {any} env */
export const discordOn = (env) => SNOWFLAKE_RE.test(String(env?.DISCORD_MOD_CHANNEL ?? '')) && typeof env?.DISCORD_BOT_TOKEN === 'string' && env.DISCORD_BOT_TOKEN.length > 0;
/** @param {any} env */
export const interactionsOn = (env) => HEX_KEY_RE.test(String(env?.DISCORD_PUBLIC_KEY ?? ''));

/** @param {any} env @returns {Map<string, string>} */
export function discordModerators(env) {
  const out = new Map();
  for (const pair of String(env?.DISCORD_MODERATORS ?? '').split(',')) {
    const [id, handle] = pair.split(':').map((s) => s?.trim() ?? '');
    if (SNOWFLAKE_RE.test(id) && handle) out.set(id, handle.toLowerCase());
  }
  return out;
}

const hexBytes = (h) => new Uint8Array(String(h).match(/../g)?.map((b) => parseInt(b, 16)) ?? []);
/** @type {{ raw: string, key: CryptoKey|null }} */
let heldKey = { raw: '', key: null };

/** @param {any} env @param {Uint8Array} bytes @param {unknown} sigHex @param {unknown} stamp
 * @param {{ subtle: SubtleCrypto, nowS: number }} io */
export async function discordSigned(env, bytes, sigHex, stamp, { subtle, nowS }) {
  if (!interactionsOn(env) || typeof sigHex !== 'string' || !/^[0-9a-f]{128}$/i.test(sigHex) || typeof stamp !== 'string' || !/^\d{1,12}$/.test(stamp)) return false;
  if (Math.abs(nowS - Number(stamp)) > DISCORD_SKEW_S) return false;
  if (heldKey.raw !== env.DISCORD_PUBLIC_KEY) heldKey = { raw: env.DISCORD_PUBLIC_KEY, key: await importPublicKey(hexBytes(env.DISCORD_PUBLIC_KEY), { subtle }) };
  if (!heldKey.key) return false;
  const head = new TextEncoder().encode(stamp);
  const signed = new Uint8Array(head.length + bytes.length);
  signed.set(head, 0);
  signed.set(bytes, head.length);
  try { return await subtle.verify({ name: 'Ed25519' }, heldKey.key, hexBytes(sigHex), signed); } catch { return false; }
}

/** @param {unknown} s */
const plain = (s) => String(s ?? '').replace(/```/g, "'''").replace(/\s+/g, ' ').trim();
/** @param {unknown} s */
export const md = (s) => plain(s).replace(/([\\`*_~|>#\[\]()<@:-])/g, '\\$1');
/** @param {number} s */
const when = (s) => `<t:${Math.floor(s)}:f>`;
/** @param {number} m */
export const minutesWord = (m) => (m % 1440 === 0 ? `${m / 1440} day${m === 1440 ? '' : 's'}` : m % 60 === 0 ? `${m / 60} hour${m === 60 ? '' : 's'}` : `${m} min`);
/** @param {number} until */
const banWord = (until) => (until >= BAN_FOREVER ? 'for good' : `until ${when(until)}`);

/** @param {any} t @param {number} nowS */
const standingOf = (t, nowS) => [isBanned(t, nowS) ? `Banned ${banWord(bannedUntil(t))}${t?.ban_reason ? ` (${md(t.ban_reason)})` : ''}` : '',
  isMuted(t, nowS) ? `Muted until ${when(Number(t.muted_until))}` : ''].filter(Boolean).join('; ') || null;

/** @param {{ c: any, name: string, target?: any, lines: any[], reasons: string[], notes?: string[], strikes: number, nowS?: number }} o */
export function caseCard({ c, name, target = null, lines, reasons, notes = [], strikes, nowS = 0 }) {
  const spawn = c.source === 'review' && lines.some((l) => l.tab === GRANT_CASE_TAB);
  const shown = [];
  let size = 0;
  for (const l of [...lines].reverse().slice(0, CARD_LINES_MAX)) {
    const row = `${l.sub === c.target ? '>' : ' '} [${l.tab}] ${plain(l.name)}: ${plain(l.text)}`;
    if (size + row.length + 1 > CARD_TEXT_MAX) break;
    shown.unshift(row);
    size += row.length + 1;
  }
  const fields = [
    { name: 'Player', value: `${md(name) || '?'} (\`${c.target}\`)`, inline: true },
    { name: 'Reports', value: c.reports ? `${c.reports} (${c.credible} counted)` : spawn ? 'none - the spawn grants\' count opened it' : 'none', inline: true },
    { name: 'Strikes (90 days)', value: `${strikes} - next: ${strikes >= LADDER_BAN_AT ? 'a ban' : minutesWord(ladderMinutes(strikes))}`, inline: true },
  ];
  const standing = target ? standingOf(target, nowS) : null;
  if (standing) fields.push({ name: 'Now', value: standing.slice(0, 1024), inline: false });
  if (reasons.length) fields.push({ name: 'Reported for', value: [...new Set(reasons)].map(reportReasonLabel).join(', '), inline: false });
  const said = notes.map(plain).filter(Boolean);
  if (said.length) fields.push({ name: 'Reporters\' notes', value: `\`\`\`\n${said.join('\n').slice(0, 1000)}\n\`\`\``, inline: false });
  if (spawn) fields.push({ name: 'Spawn grants', value: 'what the relay or players\' games counted against this account\'s foes (the lines above). A moderator decides.', inline: false });
  if (c.auto) fields.push({ name: 'Done automatically', value: 'Muted 30 min - three reports that count.', inline: false });
  const color = c.status !== 'open' ? 0x808080 : c.auto ? 0xe08020 : 0x3070d0;
  const embed = {
    title: `Case ${c.id}${spawn ? ' (opened by the spawn grants)' : ''}`,
    description: c.lines_kept === 0 ? 'Its lines were deleted ninety days after it closed.' : shown.length ? `\`\`\`\n${shown.join('\n')}\n\`\`\`` : 'No lines kept.',
    color,
    fields,
    ...(c.status !== 'open' ? { footer: { text: `${c.status === 'dismissed' ? 'Dismissed' : 'Actioned'} by ${plain(c.resolved_by) || '?'}: ${plain(c.resolution)}` } } : {}),
  };
  const components = c.status === 'open'
    ? [{ type: 1, components: Object.entries(CARD_ACTS).map(([k, a]) => ({ type: 2, style: k === 'dis' ? 2 : k === 'b30' ? 4 : 1, label: a.label, custom_id: `safe:${k}:${c.id}` })) }]
    : [];
  return { embeds: [embed], components, allowed_mentions: { parse: [] } };
}

export const MOD_CHANNEL_NEEDS = Object.freeze([['View Channel', 1n << 10n], ['Send Messages', 1n << 11n], ['Embed Links', 1n << 14n]]);

/** @param {any} env @param {(url: string, init: any) => Promise<Response>} fetchFn @param {any} card
 * @param {string|null} [messageId] @param {{ nonce?: string }} [opt]
 * @returns {Promise<{ id: string } | { gone: true } | { refused: number } | { down: true }>} */
export async function sendCard(env, fetchFn, card, messageId = null, { nonce } = {}) {
  if (!discordOn(env)) return { down: true };
  const base = `${DISCORD_API}/channels/${env.DISCORD_MOD_CHANNEL}/messages`;
  try {
    const res = await fetchFn(messageId ? `${base}/${messageId}` : base, {
      method: messageId ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'user-agent': DISCORD_USER_AGENT },
      // The enforced nonce (the case id) keeps a post whose answer was lost from being posted twice.
      body: JSON.stringify(!messageId && nonce ? { ...card, nonce, enforce_nonce: true } : card),
      signal: AbortSignal.timeout(DISCORD_POST_MS),
    });
    if (res.status === 404 && messageId) return { gone: true };
    if (res.status === 429 || res.status >= 500) { console.warn('[discord] the API said', res.status); return { down: true }; }
    if (!res.ok) { console.warn('[discord] the API refused a card:', res.status); return { refused: res.status }; }
    const msg = await res.json().catch(() => null);
    const id = typeof msg?.id === 'string' ? msg.id : messageId;
    return id ? { id } : { down: true };
  } catch (e) { console.warn('[discord] the API', /** @type {any} */ (e)?.message ?? e); return { down: true }; }
}

/** @param {any} db @param {string} id @param {number} nowS */
export async function cardOf(db, id, nowS) {
  const c = await db.prepare('SELECT * FROM mod_cases WHERE id = ?1').bind(id).first();
  if (!c) return null;
  const target = await db.prepare('SELECT handle, guest_name, muted_until, banned_until, ban_reason FROM players WHERE id = ?1').bind(c.target).first();
  const lines = (await db.prepare('SELECT at, sub, name, tab, text FROM mod_case_lines WHERE case_id = ?1 ORDER BY at, sub').bind(id).all())?.results ?? [];
  const reports = (await db.prepare('SELECT reason, note FROM mod_reports WHERE case_id = ?1 ORDER BY at').bind(id).all())?.results ?? [];
  return caseCard({ c, name: target ? displayName(target) : '?', target, lines, reasons: reports.map((r) => String(r.reason)), notes: reports.map((r) => r.note).filter(Boolean), strikes: await strikesOf(db, c.target, nowS), nowS });
}

/** @param {string} text */
const say = (text) => {
  let out = '';
  for (const line of text.split('\n')) { if ((out ? out.length + 1 : 0) + line.length > SAY_MAX) break; out = out ? `${out}\n${line}` : line; }
  return { type: 4, data: { content: out || text.slice(0, SAY_MAX), flags: 64, allowed_mentions: { parse: [] } } };
};

async function actorOf(db, env, discordId, nowS) {
  const handle = discordModerators(env).get(String(discordId ?? ''));
  if (!handle) return null;
  const row = await db.prepare('SELECT * FROM players WHERE handle_lc = ?1').bind(handle).first();
  return row && canModerate(row, env) && !isBanned(row, nowS) ? row : null;
}

// Discord drops a press that is not answered within three seconds, so the relay push runs after the answer.
const pushAfter = (io, env, order) => { const p = pushLaw(env, io.fetchFn, order); if (io.later) io.later(p); return p; };

const REFUSED = Object.freeze({
  'not-moderator': 'You are not a moderator in the game.', protected: 'Moderators cannot be muted or banned.', 'no-player': 'Nobody has that name.',
  ambiguous: 'More than one guest has that name - use the account id.', 'bad-minutes': 'A mute is 1 to 10080 minutes.', 'bad-days': 'A ban is 0 (for good) to 365 days.',
  'not-banned': 'That account is not banned.',
  'staff-claimed': 'Another staff member has this case in the staff panel.', 'case-acted': 'Another moderator is acting on this case now.',
  'case-closed': 'That case is already closed.', 'not-developer': 'Only an Admin can act on a spawn case.',
  'admin-sanction': 'An Admin set this - only an Admin can lift or shorten it.',
});
const refusedText = (e) => REFUSED[/** @type {keyof typeof REFUSED} */ (e)] ?? `Refused: ${e}.`;
const redraw = async (ctx, caseId) => ({ type: 7, data: await cardOf(ctx.db, caseId, ctx.nowS) });

async function onPress(ctx, env, body, actor, io) {
  const m = /^safe:(m30|m1d|m7d|b30|dis):([0-9a-f]{16})$/.exec(String(body?.data?.custom_id ?? ''));
  if (!m) return say('That button is not one of the safety cards\'.');
  const [, act, caseId] = m;
  const c = await ctx.db.prepare('SELECT * FROM mod_cases WHERE id = ?1').bind(caseId).first();
  if (!c) return say('That case is gone.');
  if (c.status !== 'open') return redraw(ctx, caseId);
  // The claim and the mark are one statement, so a double click or two moderators at once act only once.
  const claimed = await ctx.db.prepare('UPDATE mod_cases SET claimed_at = ?2 WHERE id = ?1 AND status = \'open\' AND (claimed_at IS NULL OR claimed_at < ?3)')
    .bind(caseId, ctx.nowS, ctx.nowS - CASE_CLAIM_S).run();
  if (!claimed?.meta?.changes) return redraw(ctx, caseId);
  const release = () => ctx.db.prepare('UPDATE mod_cases SET claimed_at = NULL WHERE id = ?1').bind(caseId).run();
  const a = CARD_ACTS[/** @type {keyof typeof CARD_ACTS} */ (act)];
  const { nowS } = ctx;
  /** @type {any} */
  const ask = 'minutes' in a
    ? { act: 'mute', minutes: a.minutes, resolution: (/** @type {any} */ r) => (r.kept ? `muted (a longer mute stands, until ${when(r.until)})` : `muted ${minutesWord(a.minutes)}`) }
    : 'days' in a
      ? { act: 'ban', days: a.days, resolution: (/** @type {any} */ r) => (r.until > banUntil(a.days, nowS) ? `banned (a longer ban stands, ${banWord(r.until)})` : `banned ${a.days} days`) }
      : { act: 'dismiss' };
  const click = typeof body?.id === 'string' && CLICK_RE.test(body.id) ? body.id : null;
  const r = await modAct(ctx, actor, env, { ...ask, target: c.target, caseId, click, reason: `case ${caseId}`, actorName: `${displayName(actor)} (Discord)`, from: 'Discord', keepLonger: true },
    { push: (o) => { pushAfter(io, env, o); } });
  if ('error' in r) { await release(); return r.error === 'no-player' ? say('That account is gone.') : say(refusedText(r.error)); }
  return redraw(ctx, caseId);
}

const optionOf = (sub, name) => (Array.isArray(sub?.options) ? sub.options.find((o) => o?.name === name)?.value : undefined);

async function onCommand(ctx, env, body, actor, io) {
  const sub = Array.isArray(body?.data?.options) ? body.data.options[0] : null;
  const who = String(optionOf(sub, 'player') ?? '').trim();
  // An id is tried before a handle, so a player whose handle looks like an account id cannot take the act.
  let row = ID_RE.test(who) ? await findAccount(ctx.db, { target: who }) : { error: 'no-player' };
  if ('error' in row && row.error === 'no-player') row = await findAccount(ctx.db, { name: who });
  if ('error' in row) return say(refusedText(row.error));
  const name = displayName(row);
  const reason = optionOf(sub, 'reason');
  const by = `${displayName(actor)} (Discord)`;
  const push = (/** @type {string} */ o) => { pushAfter(io, env, o); };
  switch (sub?.name) {
    case 'lookup': {
      const r = await strikesLook(ctx, actor, env, { target: row.id });
      if ('error' in r) return say(refusedText(r.error));
      const now = [r.bannedUntil ? `banned ${banWord(r.bannedUntil)}${r.banReason ? ` (${md(r.banReason)})` : ''}` : '', r.mutedUntil ? `muted until ${when(r.mutedUntil)}` : ''].filter(Boolean).join('; ') || 'in good standing';
      const acts = r.history.slice(0, 10).map((h) => `${when(h.at)} ${h.kind}${h.voided ? ' (voided - its case dismissed)' : ''}${h.until ? ` until ${h.until >= BAN_FOREVER ? 'forever' : when(h.until)}` : ''} by ${md(h.by) || '?'}${h.reason ? ` - ${md(h.reason)}` : ''}`);
      return say([`**${md(name)}** (\`${row.id}\`): ${now}. ${r.strikes} strike${r.strikes === 1 ? '' : 's'} in 90 days; next: ${r.next === 'ban' ? 'a ban' : minutesWord(Number(r.next))}.`, ...acts].join('\n'));
    }
    case 'mute': case 'unmute': {
      const minutes = sub.name === 'unmute' ? 0 : Number(optionOf(sub, 'minutes') ?? ladderMinutes(await strikesOf(ctx.db, row.id, ctx.nowS)));
      const r = await modAct(ctx, actor, env, { act: 'mute', target: row.id, minutes, reason, actorName: by, from: 'Discord', resolution: () => `muted ${minutesWord(minutes)} (/mod)` }, { push });
      if ('error' in r) return say(refusedText(r.error));
      return say(minutes ? `${md(name)} is muted for ${minutesWord(minutes)}.` : `${md(name)} can chat again.`);
    }
    case 'ban': case 'unban': {
      const days = sub.name === 'unban' ? null : Number(optionOf(sub, 'days') ?? 30);
      const r = await modAct(ctx, actor, env, days === null ? { act: 'unban', target: row.id, actorName: by, from: 'Discord' }
        : { act: 'ban', target: row.id, days, reason, actorName: by, from: 'Discord', resolution: (/** @type {any} */ x) => `banned ${banWord(x.until)} (/mod)` }, { push });
      if ('error' in r) return say(refusedText(r.error));
      return say(days === null ? `${md(name)} is unbanned.` : `${md(name)} is banned ${banWord(r.until)}.`);
    }
    default: return say(usageOf('mod'));
  }
}

/** @param {{ db: any, nowS: number, subtle: SubtleCrypto, rand: (b: Uint8Array) => void }} ctx @param {any} env
 * @param {any} body
 * @param {{ fetchFn?: (url: string, init: any) => Promise<Response>, later?: (p: Promise<unknown>) => void }} [io] */
export async function discordInteraction(ctx, env, body, { fetchFn = (u, i) => globalThis.fetch(u, i), later } = {}) {
  if (body?.type === 1) return { type: 1 };
  const io = { fetchFn, later: later ?? ((p) => { p.catch(() => {}); }) };
  const actor = await actorOf(ctx.db, env, body?.member?.user?.id ?? body?.user?.id, ctx.nowS);
  if (!actor) return say('Only the game\'s moderators can do that - ask a developer to add your Discord id to DISCORD_MODERATORS.');
  if (body?.type === 3) return onPress(ctx, env, body, actor, io);
  if (body?.type === 2 && body?.data?.name === 'mod') return onCommand(ctx, env, body, actor, io);
  return say('Nothing to do.');
}
