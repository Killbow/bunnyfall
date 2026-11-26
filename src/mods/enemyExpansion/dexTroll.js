// The troll that gets back up: Daggerfall Enemy Expansion's troll corpse prefab (`1618_20`),
// registered on the corpse prefab door in characters/corpseMarker.js.

import { DEX_TABLE_TEXT } from './dexTableText.js';
import { registerCorpsePrefab, sayEnemyDied } from '../../characters/corpseMarker.js';
import { applySpell } from '../../magic/effects.js';
import { runMagicRoundsFor } from '../../world/worldTick.js';
import { modSetting } from '../modSettings.js';
import { registerModSaveData } from '../../saves/modSaveData.js';
import { t, getLocalizedEnemyName } from '../../ui/textManager.js';
import { enemyDisplayName } from '../../characters/enemyBasics.js';

const COMPONENTS = JSON.parse(DEX_TABLE_TEXT['Prefabs/1618_20.imported.json']).Components;
const BILLBOARD = COMPONENTS.find((c) => c.$type === 'DaggerfallBestiaryProject.BestiaryTrollCorpseBillboard');

export const TROLL_CORPSE = Object.freeze({
  archive: BILLBOARD.Archive, record: BILLBOARD.Record, respawnTime: BILLBOARD.RespawnTime,
  ash: Object.freeze({ archive: BILLBOARD.AshArchive, record: BILLBOARD.AshRecord, centre: 0.1 }),
});
export const TROLL_TRIGGER_RADIUS = 1;
const DEFAULT_STAT = 50;

export function trollCorpseEntity(career) {
  const s = DEFAULT_STAT;
  return {
    isPlayer: false, isClass: false, level: 0, maxHealth: 1, health: 1, career: career ?? null, activeEffects: [], items: [],
    stats: { strength: s, intelligence: s, willpower: s, agility: s, endurance: s, personality: s, speed: s, luck: s },
  };
}

const _down = new Map();
const _pending = new Map();
let _vendor = null;

const cheat = () => _vendor != null && modSetting(_vendor, 'Cheat.DisableTrollRespawn') === true;

function makeTrollCorpse(f, host) {
  f.corpseDisabled = true;
  let entity = null, ended = false, rising = false;
  const key = host.key(f);
  const c = {
    respawnBuffer: TROLL_CORPSE.respawnTime,
    get entity() { return entity; },
    get down() { return !ended && f.corpsePrefab === c && !!f.dead && !!f.corpse && host.alive(); },
    frame(dt) {
      if (ended || rising || !host.runs(f) || cheat()) return;
      c.respawnBuffer -= dt;
      if (c.respawnBuffer > 0) return;
      rising = true;
      Promise.resolve(host.rise(f)).then((stood) => {
        rising = false;
        if (ended) return;
        if (!stood) { c.respawnBuffer = TROLL_CORPSE.respawnTime; return; }
        end();
        host.say(t('dex.troll.recovered', 'The {name} has recovered from its injuries.', { name: getLocalizedEnemyName(f.mobileType, enemyDisplayName(f.mobileType)) }));
      });
    },
    sphere() {
      if (ended || rising) return null;
      const b = host.body(f);
      if (!b?.pos) return null;
      return { center: [b.pos[0], b.pos[1] + (b.size?.h ?? 0) / 2, b.pos[2]], radius: TROLL_TRIGGER_RADIUS };
    },
    struck(spell, casterLevel, caster) {
      if (ended || rising) return null;
      if (!host.runs(f)) { host.send(f, spell, casterLevel); return null; }
      entity ??= trollCorpseEntity(f.entity?.career);
      const r = applySpell(spell, casterLevel, entity, sinks, Math.random, caster);
      if (entity.health <= 0) burn();
      return r;
    },
    rounds(from, to) {
      if (ended || rising || !entity?.activeEffects.length || !host.runs(f)) return;
      runMagicRoundsFor(entity, from, to, { sinks });
      if (entity.health <= 0) burn();
    },
    gone(kind) {
      if (ended) return;
      end();
      if (kind === 2) host.toAsh(f, TROLL_CORPSE.ash);
      else host.vanish(f);
    },
    release() { end(); },
  };
  const sinks = { hurt: (n) => { if (n > 0) entity.health = Math.max(0, entity.health - n); } };
  function end() {
    ended = true;
    if (key != null && _down.get(key) === c) _down.delete(key);
    if (f.corpsePrefab === c) f.corpsePrefab = null;
  }
  function burn() {
    if (ended) return;
    end();
    sayEnemyDied(host.say, f.mobileType);
    host.toAsh(f, TROLL_CORPSE.ash);
  }
  if (key != null) {
    _down.set(key, c);
    if (_pending.has(key)) { c.respawnBuffer = _pending.get(key); _pending.delete(key); }
  }
  return c;
}

export function trollSaveData() {
  const activeCorpses = [];
  for (const [key, c] of _down) {
    if (c.down) activeCorpses.push({ key, respawnBuffer: c.respawnBuffer });
    else _down.delete(key);
  }
  return { activeCorpses };
}
export function restoreTrollSaveData(rec) {
  _pending.clear();
  for (const { key, respawnBuffer } of Array.isArray(rec?.activeCorpses) ? rec.activeCorpses : []) {
    if (typeof key !== 'string' || !Number.isFinite(respawnBuffer) || respawnBuffer <= 0) continue;
    const c = _down.get(key);
    if (c?.down) c.respawnBuffer = respawnBuffer;
    else _pending.set(key, respawnBuffer);
  }
}

let _installed = false;
export function installDexTroll(vendor) {
  if (_installed) return false;
  _installed = true;
  _vendor = vendor;
  registerCorpsePrefab(TROLL_CORPSE.archive, TROLL_CORPSE.record, makeTrollCorpse);
  registerModSaveData(vendor, { newSaveData: () => ({ activeCorpses: [] }), getSaveData: trollSaveData, restoreSaveData: restoreTrollSaveData });
  return true;
}
export function _resetDexTroll() { _down.clear(); _pending.clear(); _vendor = null; _installed = false; }
