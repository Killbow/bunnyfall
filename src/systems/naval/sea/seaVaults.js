// @ts-check
import { BANDS, VEIL_X, LEAGUE_PX, veilhaven, etherCellOf, isleOfCell, etherHash, etherRng, etherBandAt } from '../../../world/ethericSea.js';
import { HAUNT_SPREAD, ABYSS_HAUNT_LEAGUES } from '../etherShips.js';
import { seaVaultKey } from '../../../net/wire.js';

export const SEA_VAULTS = Object.freeze({ deep: 4, abyss: 3 });
export const SEA_VAULT_SALT = 0x5ea7;
export const SEA_VAULT_SPACING_CELLS = 6;
export const SEA_VAULT_SEARCH_CELLS = 10;
export const SEA_VAULT_TRIES = 8;

export function vaultWaters(band) {
  const i = BANDS.findIndex((b) => b.id === band);
  const from = BANDS[i].from, to = BANDS[i + 1]?.from ?? from + ABYSS_HAUNT_LEAGUES;
  const row = veilhaven().py, spread = HAUNT_SPREAD[band] ?? HAUNT_SPREAD.deep;
  return { x0: Math.ceil(VEIL_X - to * LEAGUE_PX), x1: Math.floor(VEIL_X - from * LEAGUE_PX), y0: row - spread, y1: row + spread };
}

/** @typedef {{ key: string, cx: number, cy: number, x: number, y: number, band: string, ring: number, name: string }} SeaVault */
/** @type {Map<number, readonly SeaVault[]>} */
const _days = new Map();

// Every client and the hub must draw the same vaults for a day, so this stays a pure function of the day.
/**
 * @param {number} day
 * @returns {readonly SeaVault[]}
 */
export function seaVaultPicks(day) {
  const d = Math.trunc(Number(day)) || 0;
  const had = _days.get(d);
  if (had) return had;
  /** @type {SeaVault[]} */
  const out = [];
  for (const band of Object.keys(SEA_VAULTS)) {
    const bi = BANDS.findIndex((b) => b.id === band);
    const w = vaultWaters(band);
    for (let slot = 0; slot < SEA_VAULTS[band]; slot++) {
      for (let tryN = 0; tryN < SEA_VAULT_TRIES; tryN++) {
        const r = etherRng(etherHash(SEA_VAULT_SALT, d, bi, slot, tryN));
        const [sx, sy] = etherCellOf(w.x0 + r() * (w.x1 - w.x0), w.y0 + r() * (w.y1 - w.y0));
        const v = nearestRuin(sx, sy, band, out);
        if (v) { out.push({ ...v, ring: bi + 1 }); break; }
      }
    }
  }
  if (_days.size > 4) _days.clear();
  _days.set(d, Object.freeze(out.map((v) => Object.freeze(v))));
  return /** @type {readonly SeaVault[]} */ (_days.get(d));
}

function nearestRuin(sx, sy, band, taken) {
  for (let ring = 0; ring <= SEA_VAULT_SEARCH_CELLS; ring++) {
    for (let cy = sy - ring; cy <= sy + ring; cy++) {
      for (let cx = sx - ring; cx <= sx + ring; cx++) {
        if (Math.max(Math.abs(cx - sx), Math.abs(cy - sy)) !== ring) continue;
        const isle = isleOfCell(cx, cy);
        if (!isle || isle.kind !== 'ruin' || etherBandAt(isle.px).id !== band) continue;
        if (taken.some((t) => Math.max(Math.abs(t.cx - cx), Math.abs(t.cy - cy)) < SEA_VAULT_SPACING_CELLS)) continue;
        return { key: seaVaultKey(cx, cy), cx, cy, x: isle.px, y: isle.py, band, ring: 0, name: isle.name };
      }
    }
  }
  return null;
}

export const seaVaultAt = (vaults, x, y) => (vaults ?? []).find((v) => v.x === x && v.y === y) ?? null;
export const seaVaultByKey = (vaults, key) => (vaults ?? []).find((v) => v.key === key) ?? null;
export const _resetSeaVaultsForTests = () => _days.clear();
