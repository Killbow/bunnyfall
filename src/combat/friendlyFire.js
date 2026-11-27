// @ts-check

export const isShipmate = (t) => !!t && (t.deckBoat != null || t.shipmate === true) && !t.dead && t.entity?.team === 'PlayerAlly';

export const isRefugee = (t) => !!t && t.refugee === true && !t.dead && t.entity?.team === 'PlayerAlly';

// Melee leaves town defenders out because the city guard code applies its own protection to them.
export const sparedBySwing = (t) => isShipmate(t) || isRefugee(t);

export const sparedByPlayer = (t) => !!t && (t.defender === true || sparedBySwing(t));

export function boutTeammates(a, b) {
  const x = a?.entity?.bout ?? null, y = b?.entity?.bout ?? null;
  return !!x && !!y && a !== b && String(x.id) === String(y.id) && (x.side | 0) === (y.side | 0);
}
