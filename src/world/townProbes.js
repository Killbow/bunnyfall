// Test probe surfaces for the town loop, built from the world host in src/scenes/world.js.
import { addGold } from '../justice/court.js';
import { charSheetDoorReady } from '../ui/charSheetDoor.js';
import { isNight } from './worldClock.js';
import { playerEntity } from '../characters/playerEntity.js';

/** @param {any} host */
export function createTownProbes(host) {
  const {
    _crimeResponse, built, cam, cityGuards, droppedLoot, minuteNow, state, townTalk, weaponRig
  } = host;
  // Install after the mode machine exists: modes.installShotProbes defines an interior __people hook,
  // and the town surface must win.
  function installTownProbes() {
    window.__people = () => {
      const out = [];
      for (const p of built.values()) {
        if (!p.population) continue;
        const t = state.pixelTranslation(p.px, p.py);
        p.population.pool.forEach((it, i) => {
          if (!it.active) return;
          out.push({
            pixel: `${p.px},${p.py}`, i, visible: it.visible, pend: it.scheduleEnable, recyc: it.scheduleRecycle,
            archive: it.person.archive, state: it.person.state, moves: it.person.moveCount, seeks: it.person.seekCount,
            pos: [
              it.person.pos[0] + p.locOrigin[0] + t[0],
              it.person.pos[1] + t[1],
              it.person.pos[2] + p.locOrigin[2] + t[2],
            ].map((v) => Number(v.toFixed(2))),
          });
        });
      }
      return JSON.stringify(out);
    };
    window.__talk = () => JSON.stringify(townTalk._debug());
    window.__heldPose = (spec) => (spec ? weaponRig?.setHeldPose?.(spec) : weaponRig?.heldPose?.());
    window.__chargenRace = () => townTalk._debug().overlayFlow?.race?.key ?? null;
    window.__chargenConfirm = () => townTalk._debug().overlayFlow?.raceConfirm ?? null;
    window.__chargenFlow = () => townTalk._debug().overlayFlow ?? null;
    window.__addGold = (n) => addGold(playerEntity, n);
    window.__guards = () => JSON.stringify(cityGuards._debug());
    window.__droppedLoot = () => JSON.stringify(droppedLoot._piles.map((pl) => ({ n: pl.items.length, pos: pl.pos.map((v) => +v.toFixed(1)), record: pl.record, flat: !!pl.batch })));
    window.__crime = () => _crimeResponse();
    window.__guardDamage = (i, dmg) => cityGuards._damage(i, dmg);
    window.__uiArt = () => JSON.stringify({ charsheet: charSheetDoorReady() });
    window.__attack = () => weaponRig.clickAttack();
    window.__townDebug = () => {
      const pixels = [];
      for (const p of built.values()) {
        if (!p.population) continue;
        const t = state.pixelTranslation(p.px, p.py);
        const local = [cam.pos[0] - t[0] - p.locOrigin[0], cam.pos[1] - t[1], cam.pos[2] - t[2] - p.locOrigin[2]];
        const [pgx, pgy] = p.population.nav.worldToNav(local[0], local[2]);
        pixels.push({
          pixel: `${p.px},${p.py}`, loc: p.location, pool: p.population.pool.length,
          max: p.population.maxPopulation,
          act: p.population.pool.filter((it) => it.active).length,
          vis: p.population.pool.filter((it) => it.visible).length,
          pgx, pgy, w: p.population.nav.weightAt(pgx, pgy),
          spawnTest: p.population.nav.getRandomSpawnPosition(pgx, pgy, 96, 10),
          origin: [p.locOrigin[0] + t[0], p.locOrigin[1] + t[1], p.locOrigin[2] + t[2]],
          navW: p.population.nav.width, navH: p.population.nav.height,
        });
      }
      return JSON.stringify({ night: isNight(minuteNow()), pixels });
    };
  }
  return { installTownProbes };
}
