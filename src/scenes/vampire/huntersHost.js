// @ts-check
// BUNNYFALL VAMPIRE EXPANSION, PHASE 3: THE HUNTERS. Outdoors by night, once each game hour, the law
// (systems/vampire/masquerade.js ambushDue) is asked whether they come:
//   - WITCH HUNTERS, as many as the region's Masquerade tier (Knights, Warriors and Archers "of the Witch-Hunters");
//   - a Court's ASSASSINS while it holds a Blood Hunt on the player (vampires "of the <clan> Court" - an Ancient one at
//     five strikes and more).
// They stand through the game's own loose-foe placement (the host's `stand`: world.js _standLooseFoe, the staff /spawn's),
// out of sight about the player, and fight as any foe does. The host ticks one each frame (world.js, beside the thralls).
import { t } from '../../systems/textManager.js';
import { isDayFromMinutes } from '../../systems/gameDate.js';
import { skyMinutes } from '../../systems/worldTick.js';
import { ambushDue, courtState } from '../../systems/vampire/masquerade.js';
import { clanName } from '../../systems/vampire/clanLaw.js';
import { awakenedVampirism } from '../../systems/vampire/vitae.js';

/** The witch hunters' bodies: Knight, Warrior, Archer, Ranger. */
export const HUNTER_MOBILES = Object.freeze([145, 144, 141, 142]);
/** The assassins': a Vampire, and an Ancient one for a Court long angry. */
export const ASSASSIN_MOBILE = 28;
export const ANCIENT_MOBILE = 30;

/**
 * @param {{ playerEntity: any, mode: () => string, region: () => number, now: () => number,
 *   stand: (mobileType: number) => any, say: (s: string) => void, rolls?: () => number }} deps
 */
export function createHuntersHost({ playerEntity, mode, region, now, stand, say, rolls = Math.random }) {
  let lastHour = null;
  /** Stand `mobiles`, each named by its band. */
  function standAll(mobiles, band) {
    for (const m of mobiles) {
      Promise.resolve(stand(m)).then((f) => { if (f?.entity) f.entity.bandName = band; }, () => { /* no spot: one fewer */ });
    }
  }
  return {
    tick() {
      if (!awakenedVampirism(playerEntity)) return;
      const n = Math.floor(now());
      const hour = Math.floor(n / 60);
      if (hour === lastHour) return;
      lastHour = hour;
      if (mode() !== 'exterior' || isDayFromMinutes(skyMinutes())) return;
      const r = region();
      const h = ambushDue(playerEntity, 'hunter', r, n, rolls);
      if (h) {
        standAll(Array.from({ length: h.n }, (_, i) => HUNTER_MOBILES[(hour + i) % HUNTER_MOBILES.length]), t('masq.band.hunters', 'the Witch-Hunters'));
        say(t('masq.hunters', 'Torches in the dark. Witch hunters have found your trail.'));
        return;
      }
      const a = ambushDue(playerEntity, 'assassin', r, n, rolls);
      if (a && a.clan != null) {
        const ancient = courtState(a.clan).strikes >= 5;
        standAll(Array.from({ length: a.n }, (_, i) => (ancient && i === 0 ? ANCIENT_MOBILE : ASSASSIN_MOBILE)), t('masq.band.court', 'the {clan} Court', { clan: clanName(a.clan) }));
        say(t('masq.assassins', 'Something cold moves in the shadows. The {clan} Court has sent its assassins.', { clan: clanName(a.clan) }));
      }
    },
  };
}
