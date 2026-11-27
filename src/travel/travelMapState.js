// Filter flags are true when hidden, so the false defaults show everything, and the popup choices default to true.
// A missing save field restores these defaults, so older saves still load.

const DEFAULT_FILTERS = Object.freeze({ dungeons: false, temples: false, homes: false, towns: false, roads: false, tracks: false, rivers: false, streams: false, mines: false });
const DEFAULT_POPUP = Object.freeze({ speedCautious: true, sleepModeInn: true, travelShip: true });

let _filters = { ...DEFAULT_FILTERS };
let _popUp = { ...DEFAULT_POPUP };
let _markedMapId = -1;

// Returns the live object, because the travel map window edits it in place.
export function travelMapFilters() { return _filters; }

export function travelMapMarkedMapId() { return _markedMapId; }
export function setTravelMapMarkedMapId(id) { _markedMapId = Number.isFinite(id) ? id : -1; }

export function travelMapPopUpState() { return { ..._popUp }; }
export function setTravelMapPopUpState({ speedCautious, sleepModeInn, travelShip }) {
  _popUp = {
    speedCautious: !!speedCautious, sleepModeInn: !!sleepModeInn, travelShip: !!travelShip,
  };
}

let _speedHook = null;
export function setTravelSpeedCautious(on) {
  _popUp = { ..._popUp, speedCautious: !!on };
  _speedHook?.(!!on);
}
export function onTravelSpeedCautious(fn) { _speedHook = typeof fn === 'function' ? fn : null; }

export function travelMapSaveData(live = null) {
  const p = live ?? _popUp;
  return {
    filterDungeons: _filters.dungeons,
    filterTemples: _filters.temples,
    filterHomes: _filters.homes,
    filterTowns: _filters.towns,
    filterRoads: _filters.roads,
    filterTracks: _filters.tracks,
    filterRivers: _filters.rivers, filterStreams: _filters.streams,
    filterMines: _filters.mines,
    sleepInn: p.sleepModeInn,
    speedCautious: p.speedCautious,
    travelShip: p.travelShip,
  };
}

export function restoreTravelMapSaveData(data) {
  const d = data ?? {};
  _filters = {
    dungeons: !!d.filterDungeons, temples: !!d.filterTemples,
    homes: !!d.filterHomes, towns: !!d.filterTowns,
    roads: !!d.filterRoads, tracks: !!d.filterTracks,
    mines: !!d.filterMines,
    rivers: !!d.filterRivers, streams: !!d.filterStreams,
  };
  _popUp = {
    speedCautious: d.speedCautious ?? true,
    sleepModeInn: d.sleepInn ?? true,
    travelShip: d.travelShip ?? true,
  };
  return _filters;
}

export function freshTravelMapFilters() { return { ...DEFAULT_FILTERS }; }
export function freshTravelMapPopUpState() { return { ...DEFAULT_POPUP }; }

export function resetTravelMapState() {
  _filters = { ...DEFAULT_FILTERS };
  _popUp = { ...DEFAULT_POPUP };
  _markedMapId = -1;
}
