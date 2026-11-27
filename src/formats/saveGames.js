// The host passes each classic save as a map of uppercase filenames to bytes. The save set is a map of slot index
// to file map, since a browser cannot walk directories.

import { BsaFile } from './bsaFile.js';
import { RumorFile } from './rumorFile.js';
import { BioFile } from './bioFile.js';
import { SaveTree, SAVETREE_FILENAME, readCStringScan } from './saveTreeFile.js';
import { SaveVars, SAVEVARS_FILENAME } from './saveVarsFile.js';
import { SaveImage, SAVE_IMAGE_FILENAME } from './saveImageFile.js';
import { DFPalette } from './dfPalette.js';

export const SAVENAME_TXT = 'SAVENAME.TXT';
export const MAPSAVE_FILENAME = 'MAPSAVE.SAV';
export const RUMOR_FILENAME = 'RUMOR.DAT';
export const BIO_FILENAME = 'BIO.DAT';

export const CLASSIC_SAVE_COUNT = 6;

export const MAPSAVE_DISCOVERED_FLAG = 0x40;

const fileOf = (files, name) => (files instanceof Map ? files.get(name) : files?.[name]);

/**
 * @param {BsaFile} mapSave
 * @param {number[]} regionLocationCounts
 * @returns {number[][]|null}
 */
export function readMapSaveDiscovery(mapSave, regionLocationCounts) {
  const discovered = [];
  for (let regionIndex = 0; regionIndex < 62; regionIndex++) {
    const name = `MAPSAVE.${String(regionIndex).padStart(3, '0')}`;
    const index = mapSave.getRecordIndex(name);
    if (index === -1) return null;
    const data = mapSave.getRecordBytes(index);
    const locationCount = Math.min(data.length, regionLocationCounts[regionIndex] | 0);
    const regionHits = [];
    for (let i = 0; i < locationCount; i++) {
      if ((data[i] & MAPSAVE_DISCOVERED_FLAG) !== 0) regionHits.push(i);
    }
    discovered.push(regionHits);
  }
  return discovered;
}

export class SaveGames {
  constructor() {
    this.isPathOpen = false;
    /** @type {Map<number, Map<string, Uint8Array>|object>} */
    this.saveGameDict = new Map();
    this.saveName = '';
    this.saveTree = null;
    this.saveVars = null;
    this.mapSave = null;
    this.rumorFile = null;
    this.bioFile = null;
    this.saveImage = null;
  }

  /**
   * A slot qualifies with SAVETREE.DAT and IMAGE.RAW. SAVEVARS.DAT is not required, matching DFU, where that check
   * is disabled.
   * @param {Map<number, object>|object} saves
   * @returns {boolean}
   */
  openSavesPath(saves) {
    this.isPathOpen = false;
    this.saveGameDict.clear();
    const entries = saves instanceof Map ? saves.entries() : Object.entries(saves ?? {});
    for (const [key, files] of entries) {
      if (!fileOf(files, SAVETREE_FILENAME) || !fileOf(files, SAVE_IMAGE_FILENAME)) continue;
      this.saveGameDict.set(Number(key), files);
    }
    if (this.saveGameDict.size === 0) return false;
    this.isPathOpen = true;
    return true;
  }

  hasSave(save) {
    return this.isPathOpen && this.saveGameDict.has(save);
  }

  /**
   * @param {number} save
   * @param {Uint8Array} [artPalBytes]
   */
  lazyOpenSave(save, artPalBytes = null) {
    if (!this.hasSave(save)) return false;
    if (!this._loadSaveImage(save, artPalBytes))
      throw new Error('Could not lazy open SavImage for index ' + save);
    if (!this._loadSaveName(save))
      throw new Error('Could not lazy open SaveName for index ' + save);
    return true;
  }

  /**
   * @param {number} save
   * @param {Uint8Array} [artPalBytes]
   * @returns {boolean}
   */
  openSave(save, artPalBytes = null) {
    if (!this.hasSave(save)) return false;
    const files = this.saveGameDict.get(save);

    if (!this._loadSaveImage(save, artPalBytes))
      throw new Error('Could not open SaveImage for index ' + save);
    if (!this._loadSaveName(save))
      throw new Error('Could not open SaveName for index ' + save);

    const treeBytes = fileOf(files, SAVETREE_FILENAME);
    this.saveTree = new SaveTree();
    this.saveTree.load(treeBytes);

    const varsBytes = fileOf(files, SAVEVARS_FILENAME);
    if (!varsBytes) throw new Error('Could not open SaveVars for index ' + save);
    this.saveVars = new SaveVars();
    this.saveVars.load(varsBytes);

    const mapSaveBytes = fileOf(files, MAPSAVE_FILENAME);
    if (!mapSaveBytes) throw new Error('Could not open MapSave for index ' + save);
    this.mapSave = new BsaFile(mapSaveBytes);

    this.rumorFile = null;
    const rumorBytes = fileOf(files, RUMOR_FILENAME);
    if (rumorBytes) {
      this.rumorFile = new RumorFile();
      this.rumorFile.load(rumorBytes);
    }

    this.bioFile = null;
    const bioBytes = fileOf(files, BIO_FILENAME);
    if (bioBytes) {
      this.bioFile = new BioFile();
      this.bioFile.load(bioBytes);
    }

    return true;
  }

  tryOpenSave(save, artPalBytes = null) {
    try {
      return this.openSave(save, artPalBytes);
    } catch {
      return false;
    }
  }

  _loadSaveImage(save, artPalBytes) {
    const files = this.saveGameDict.get(save);
    if (!files) return false;
    const bytes = fileOf(files, SAVE_IMAGE_FILENAME);
    if (!bytes) return false;
    this.saveImage = new SaveImage();
    let palette = null;
    if (artPalBytes) {
      palette = new DFPalette();
      palette.load(artPalBytes, 'ART_PAL.COL');
    }
    return this.saveImage.load(bytes, SAVE_IMAGE_FILENAME, palette);
  }

  _loadSaveName(save) {
    const files = this.saveGameDict.get(save);
    if (!files) return false;
    const bytes = fileOf(files, SAVENAME_TXT);
    if (!bytes) return false;
    this.saveName = readCStringScan(bytes, 0);
    return true;
  }
}
