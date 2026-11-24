// @ts-check
// Fetches a dungeon's enemy sprite sheets, careers, and treasure flats at once, before the enemies are built in order.
// Nothing here draws a random number (both gender sheets load), and the build stays serial for online enemy indices.

/**
 * @param {Iterable<{ mobileType: number }>} enemies
 * @param {{ basicsOf: (mobileType: number) => any, getTexture: (archive: number) => Promise<any>,
 *   loadCareer?: ((mobileType: number) => Promise<any>) | null, archives?: number[] }} deps
 */
export async function prefetchDungeonAssets(enemies, { basicsOf, getTexture, loadCareer = null, archives = [] }) {
  const sheets = new Set(archives), careers = new Set();
  for (const e of enemies) {
    const b = basicsOf(e.mobileType);
    if (!b?.maleTexture) continue;
    for (const a of [b.maleTexture, b.femaleTexture]) if (Number.isInteger(a) && a > 0) sheets.add(a);
    careers.add(e.mobileType);
  }
  // A failed fetch here is left for the build to meet and report, as before.
  await Promise.allSettled([...[...sheets].map((a) => getTexture(a)), ...(loadCareer ? [...careers].map((m) => loadCareer(m)) : [])]);
}
