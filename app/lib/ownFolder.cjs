// BUNNYFALL OWN-FOLDER (2026-10-30, players: "the desktop client asks us to sign in again and does not show our
// characters"): THE APP'S DATA IN A FOLDER OF ITS OWN. The shell kept upstream's pinned folder, <appData>/Daggerfall
// JavaScript - the very folder DFO Online's desktop app writes. With both installed they shared one sign-in, one set of
// settings, one single-instance lock and one store of downloaded game versions (Game/), so each app signed the other
// out and could even start the other's game files. Bunnyfall now keeps <appData>/Bunnyfall. On the first launch there
// it takes a copy of what is the player's own from the old folder - the ARENA2 path (config.json), the settings and
// sign-in (Prefs/) and the offline saves (Saves/) - and never the downloaded versions, the GPU cache or the logs. The old
// folder is left as it is, for DFO Online.

const fs = require('node:fs');
const path = require('node:path');

const OWN_FOLDER = 'Bunnyfall';
const OLD_FOLDER = 'Daggerfall JavaScript';
const CARRIED = ['config.json', 'Prefs', 'Saves'];

/** The folder the app keeps its data in, under `appData`, copied over from the old one the first time. Never throws. */
function ownUserData(appData) {
  const own = path.join(appData, OWN_FOLDER);
  if (fs.existsSync(own)) return own;
  const old = path.join(appData, OLD_FOLDER);
  try {
    fs.mkdirSync(own, { recursive: true });
    for (const name of CARRIED) {
      const from = path.join(old, name);
      if (fs.existsSync(from)) fs.cpSync(from, path.join(own, name), { recursive: true, errorOnExist: false, force: false });
    }
  } catch (e) {
    console.warn('[own-folder] the old folder was not copied', e);
  }
  return own;
}

module.exports = { ownUserData, OWN_FOLDER, OLD_FOLDER };
