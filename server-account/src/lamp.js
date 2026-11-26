export const LAMP_TITLE = 'ilovelamp';

/** @param {{ db: any }} ctx @param {{ id: string, handle?: string|null }} player */
// No relay sees interior NPCs, so the claim is trusted as sent. The title buys nothing and opens nothing.
export async function claimLamp({ db }, player) {
  if (!player?.handle) return { granted: false, why: 'guest' };
  const r = await db.prepare('UPDATE players SET lamp_title = 1 WHERE id = ?1 AND lamp_title = 0').bind(player.id).run();
  return Number(r?.meta?.changes ?? 0) > 0 ? { granted: true } : { granted: false, why: 'held' };
}
