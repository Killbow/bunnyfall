// @ts-check
import { inEther, etherBandAt } from '../../../world/ethericSea.js';
import { rollElthericPiece, elthericChance } from '../../../items/aetheric.js';

export function seaPlaceBand(loc) {
  const at = loc?.mapTableData;
  if (!loc?.ether || !Number.isFinite(at?.longitude) || !Number.isFinite(at?.latitude)) return null;
  const px = Math.trunc(at.longitude / 128), py = 499 - Math.trunc(at.latitude / 128);
  return inEther(px, py) ? etherBandAt(px).id : null;
}

export const seaPileSource = (loc) => (loc?.ether && loc.wildRing > 0 ? 'vault' : 'ruin');

export function seaPileMore(items, loc, rolls = Math.random) {
  const band = seaPlaceBand(loc);
  const chance = band ? elthericChance(seaPileSource(loc), band) : 0;
  if (!(chance > 0) || !Array.isArray(items)) return items;
  const piece = rollElthericPiece(rolls, chance);
  if (piece) items.push(piece);
  return items;
}
