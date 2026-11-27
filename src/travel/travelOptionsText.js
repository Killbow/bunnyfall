// `TRAVEL_OPTIONS_TEXT` matches vendor/travel-options/TravelOptionsModData.csv key for key, so new strings go in
// `TRAVEL_NAV_TEXT`. Callers use the SDF variants (`HelpInfoSDF`, `MsgTimeFormat`); the other two exist only to
// match the CSV.
import { t } from '../ui/textManager.js';

export const TRAVEL_OPTIONS_TEXT = Object.freeze({
  MsgArrived: "You have arrived at your destination.",
  MsgArrivedJunc: "You've arrived at a junction.",
  MsgEnemies: "Enemies are seeking to prevent your travel...",
  MsgAvoidFail: "You failed to avoid an encounter!",
  MsgAvoidSuccess: "You successfully avoided an encounter.",
  MsgLowHealth: "You are close to the point of death!",
  MsgLowFatigue: "You are exhausted and should rest.",
  MsgOcean: "You've found yourself in the sea, maybe you should travel on a ship.",
  MsgNearLocation: "Paused the journey since a {0} called {1} is nearby.",
  MsgEnterLocation: "Paused the journey as you've entered a {0} called {1}.",
  MsgCircumnavigate: "Circumnavigating {0}.",
  MsgNoPath: "There's no path here to follow in that direction.",
  MsgFollowRoad: "Following a road.",
  MsgFollowTrack: "Following a dirt track.",
  MsgTargetCoords: "Map coordinates: {0}, {1}.",
  MsgNewRegion: "You have entered the region of {0}.",
  DirectionN: "N",
  DirectionNE: "NE",
  DirectionE: "E",
  DirectionSE: "SE",
  DirectionS: "S",
  DirectionSW: "SW",
  DirectionW: "W",
  DirectionNW: "NW",
  DirectionNone: "none",
  TipMap: "Consult Map",
  TipCamp: "Stop to Camp",
  MsgResume: "Resume your journey to {0}?",
  MsgFollow: "Do you want to follow this road?",
  MsgTeleportCost: "Teleportation will cost you {0} gold, is that acceptable?",
  MsgPlayerControlled: "Player Controlled Journey",
  MsgTimeFormat: " {0} hours {1} mins (approx)",
  MsgTimeFormatNoSDF: "~ {0} hours {1} mins",
  MsgNoPort: "You cannot travel by ship from here, since there's no port.",
  MsgNoDestPort: "You cannot travel by ship to there, as that location has no port.",
  MsgNoSailing: "Your journey doesn't cross any ocean, so a ship is not needed.",
  MsgNotVisited: "You have not visited this location yet, so can't fast travel there.",
  MsgGuildHalls: "Guild Halls:    ",
  MsgNoKnowledge: "You have no knowledge of {0}.",
  LocationTypeDungeonKeep: "Keep",
  LocationTypeDungeonLabyrinth: "Labyrinth",
  LocationTypeDungeonRuin: "Ruin",
  HelpInfoSDF: "Travel Options Help\n\nTravel Map\n\nLeftClick - Select travel destination (region, location, map pixel)\nRightClick - Zoom in or out\nMiddleClick - Mark a location (for example as a destination for road following)\nI - Location information known to character (press while hovering or after selecting)\n\nAccelerated Travel\n\n{0} - Follow road or track\nM - Open travel map while travelling (or click map button)\nC - Pause travel for camp (or click camp button)\n{1} - Exit travel (or click exit button)\n{2} - Open travel map when stopped to resume journey, or to choose a new destination",
  HelpInfo: "Travel Options Help\n\nTravel Map\n\nLeftClick - Select travel destination (region, location, map pixel)\nRightClick - Zoom in or out\nMiddleClick - Mark a location\nI - Location information known to character\n\nAccelerated Travel\n\n{0} - Follow road or track\nM - Open travel map while travelling (or click map button)\nC - Pause travel for camp (or click camp button)\n{1} - Exit travel (or click exit button)\n{2} - Open travel map when stopped to resume journey,\n    or to choose a new destination",
});

export const TRAVEL_NAV_TEXT = Object.freeze({
  MsgBlocked: "Paused the journey since the way ahead is blocked.",
  MsgStuck: "Paused the journey since you're making no headway.",
  get MsgGatesShut() { return t('travel.nav.gatesShut', 'Paused the journey since the city gates are shut for the night.'); },
});

export function format(template, ...args) {
  return String(template).replace(/\{(\d+)\}/g, (whole, i) => {
    const v = args[Number(i)];
    return v === undefined ? whole : String(v);
  });
}

export function localize(key) {
  return Object.prototype.hasOwnProperty.call(TRAVEL_OPTIONS_TEXT, key) ? TRAVEL_OPTIONS_TEXT[key] : '';
}

export function directionText(direction) {
  switch (direction) {
    case 128: return TRAVEL_OPTIONS_TEXT.DirectionN;
    case 64: return TRAVEL_OPTIONS_TEXT.DirectionNE;
    case 32: return TRAVEL_OPTIONS_TEXT.DirectionE;
    case 16: return TRAVEL_OPTIONS_TEXT.DirectionSE;
    case 8: return TRAVEL_OPTIONS_TEXT.DirectionS;
    case 4: return TRAVEL_OPTIONS_TEXT.DirectionSW;
    case 2: return TRAVEL_OPTIONS_TEXT.DirectionW;
    case 1: return TRAVEL_OPTIONS_TEXT.DirectionNW;
    default: return TRAVEL_OPTIONS_TEXT.DirectionNone;
  }
}
