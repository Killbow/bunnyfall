// @ts-check

import { verifySdReceipt } from '../../src/net/sdReceipt.js';
import { seededRng } from '../../src/weather/wind.js';

export const SD_HONOUR_TITLE = 1;
export const SD_HONOUR_AURA = 2;
export const SD_TITLE_CHANCE = 1 / 4;
export const SD_AURA_CHANCE = 1 / 8;
export const SD_HONOURS_SALT = 0x484f5552;

export function sdHonoursRoll(seed) {
  const r = seededRng((seed ^ SD_HONOURS_SALT) >>> 0);
  return { title: r() < SD_TITLE_CHANCE, aura: r() < SD_AURA_CHANCE };
}

const int = (v) => (Number.isSafeInteger(Number(v)) ? Number(v) : 0);
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

export async function sdRecordOf({ db }, playerId) {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM sd_kills WHERE account = ?1').bind(playerId).first();
  return { broken: int(r?.n) };
}

/** @param {{ db: any, nowS: number, subtle: SubtleCrypto, rand: (b: Uint8Array) => Uint8Array }} ctx
 * @param {{ id: string, handle?: string|null }} player @param {unknown} receipt
 * @param {CryptoKey|null} publicKey */
export async function claimSd({ db, nowS, subtle, rand }, player, receipt, publicKey) {
  if (!publicKey) return { error: 'no-gate-key' };
  const v = await verifySdReceipt(receipt, publicKey, { subtle, nowS });
  if (!v.ok) return { error: 'receipt', why: v.why };
  const c = v.claims;
  if (c.s !== player.id) return { error: 'not-yours' };
  if (!player.handle) return { recorded: false, why: 'guest', ...(await sdRecordOf({ db }, player.id)) };
  // The honours roll on this service's own draw, never the receipt seed, which the client can read in advance.
  const draw = rand(new Uint8Array(4));
  const { title, aura } = sdHonoursRoll(((draw[0] << 24) | (draw[1] << 16) | (draw[2] << 8) | draw[3]) >>> 0);
  const bits = (title ? SD_HONOUR_TITLE : 0) | (aura ? SD_HONOUR_AURA : 0);
  const prior = Number(player.sd_honours) || 0;
  const nonce = hex(rand(new Uint8Array(8)));
  const [row, , count] = await db.batch([
    db.prepare('INSERT OR IGNORE INTO sd_kills (slot, account, boss, earned, lv, title, aura, nonce, at, body) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)')
      .bind(c.d, player.id, c.b, c.x, c.l, title ? 1 : 0, aura ? 1 : 0, nonce, nowS, c.m ? JSON.stringify(c.m) : null),
    // Only the row stamped with this claim's nonce grants honours, so two concurrent claims roll once.
    db.prepare('UPDATE players SET sd_honours = sd_honours | ?2 WHERE id = ?1 AND ?2 != 0 AND EXISTS (SELECT 1 FROM sd_kills WHERE slot = ?3 AND account = ?1 AND nonce = ?4)')
      .bind(player.id, bits, c.d, nonce),
    db.prepare('SELECT COUNT(*) AS n FROM sd_kills WHERE account = ?1').bind(player.id),
  ]);
  const broken = int(count?.results?.[0]?.n);
  if (!(Number(row?.meta?.changes ?? 0) > 0)) return { recorded: false, why: 'claimed', broken };
  return { recorded: true, slot: c.d, title, aura, titleNew: title && !(prior & SD_HONOUR_TITLE), auraNew: aura && !(prior & SD_HONOUR_AURA), broken };
}
