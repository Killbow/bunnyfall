// The world's merchant yards and port host: each finds its sites on the built pixels and places
// them on the ground. The yards also show the wagons and open the yard trade, mend, and bench.
import { createMerchantYards } from './merchantYards/merchantYardsHost.js';
import { createPortHost } from '../travel/portHost.js';
import { setMidScreenText } from '../ui/midScreenText.js';

/** @param {any} shared */
export function createPortHostsWorld(shared) {
  const {
    _mode, _portSites, _portT, _yardSites, _yardT, built, cam, climbLighthouse, collider, getTexture, hcc, lightsOnAt,
    mendAtYard, minuteNow, openShipyard, openYardBench, player, renderer, state, surfaceAt, townTalk,
    uploadRecordFrame, walkMode,
  } = shared;
  shared.merchantYards = createMerchantYards({
    renderer, getTexture, uploadRecordFrame, collider: () => collider,
    sites: () => {
      _yardSites.length = 0;
      if (_mode() !== 'exterior') return _yardSites;
      for (const p of built.values()) {
        if (!p.merchantYards?.length || !p.locOrigin) continue;
        const t = state.pixelTranslation(p.px, p.py, _yardT);
        for (const s of p.merchantYards) {
          const at = (s.scene ??= { ...s });
          at.x = t[0] + p.locOrigin[0] + s.x; at.z = t[2] + p.locOrigin[2] + s.z; at.comp = state.compensation[1];
          _yardSites.push(at);
        }
      }
      return _yardSites;
    },
    groundAt: (x, z) => surfaceAt(x, z),
    eye: () => cam.pos, feet: () => (walkMode && shared.playerSpawned ? player.feetAt() : null),
    horseArt: () => !!hcc.presentation.horseArt.ensureStationary(),
    showWagon: (r, texRemap, position, rotation, kind) => hcc.drawShowWagon(r, texRemap, position, rotation, kind),
    wagonBox: (kind) => hcc.partsOf(kind)?.box ?? null,
    open: (site, mode, name) => shared.modes?.openYardTrade?.(site.kind, site.regionIndex, mode, name, site.mapId) ?? false,
    say: (text) => townTalk.say(text), midText: (text) => setMidScreenText(text),
    mend: () => mendAtYard(),
    bench: () => openYardBench(),
  });
  shared.portHost = createPortHost({
    renderer, getTexture, uploadRecordFrame, collider: () => collider,
    sites: () => {
      _portSites.length = 0;
      if (_mode() !== 'exterior') return _portSites;
      for (const p of built.values()) {
        if (!p.portSites?.length || !p.locOrigin) continue;
        const t = state.pixelTranslation(p.px, p.py, _portT);
        for (const s of p.portSites) {
          const at = (s.scene ??= { ...s });
          at.x = t[0] + p.locOrigin[0] + s.x; at.z = t[2] + p.locOrigin[2] + s.z; at.comp = state.compensation[1];
          _portSites.push(at);
        }
      }
      return _portSites;
    },
    groundAt: (x, z) => surfaceAt(x, z),
    feet: () => (walkMode && shared.playerSpawned ? player.feetAt() : null),
    lit: () => lightsOnAt(minuteNow()),
    open: (site, page) => openShipyard(site, page),
    climb: (site, way, at) => climbLighthouse(way, at),
    say: (text) => townTalk.say(text), midText: (text) => setMidScreenText(text),
  });
}
