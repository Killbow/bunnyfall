import { srand, rand } from '../formats/dfRandom.js';

// The playlists are Daggerfall Unity's arrays in order; a duplicate doubles that song's odds, so none are removed.
export const DUNGEON_SONGS = Object.freeze([
  'DUNGEON.HMI', 'DUNGEON5.HMI', 'DUNGEON6.HMI', 'DUNGEON7.HMI', 'DUNGEON8.HMI',
  'DUNGEON9.HMI', 'GDNGN10.HMI', 'GDNGN11.HMI', 'GDUNGN4.HMI', 'GDUNGN9.HMI',
  '04.HMI', '05.HMI', '07.HMI', '15.HMI', '28.HMI',
]);

export const DUNGEON_SONGS_FM = Object.freeze([
  'FM_DNGN1.HMI', 'FM_DNGN1.HMI', 'FM_DNGN2.HMI', 'FM_DNGN3.HMI', 'FM_DNGN4.HMI',
  'FM_DNGN5.HMI', 'FDNGN10.HMI', 'FDNGN11.HMI', 'FDUNGN4.HMI', 'FDUNGN9.HMI',
  '04FM.HMI', '05FM.HMI', '07FM.HMI', '15FM.HMI', '15FM.HMI',
]);

export const SUNNY_SONGS = Object.freeze([
  'GDAY___D.HMI', 'SWIMMING.HMI', 'GSUNNY2.HMI', 'SUNNYDAY.HMI',
  '02.HMI', '03.HMI', '22.HMI',
]);

export const SUNNY_SONGS_FM = Object.freeze([
  'FDAY___D.HMI', 'FM_SWIM2.HMI', 'FM_SUNNY.HMI', '02FM.HMI', '03FM.HMI', '22FM.HMI',
]);

export const CLOUDY_SONGS = Object.freeze([
  'GDAY___D.HMI', 'SWIMMING.HMI', 'GSUNNY2.HMI', 'SUNNYDAY.HMI',
  '02.HMI', '03.HMI', '22.HMI', '29.HMI', '12.HMI',
]);

export const CLOUDY_SONGS_FM = Object.freeze([
  'FDAY___D.HMI', 'FM_SWIM2.HMI', 'FM_SUNNY.HMI',
  '02FM.HMI', '03FM.HMI', '22FM.HMI', '29FM.HMI', '12FM.HMI',
]);

export const OVERCAST_SONGS = Object.freeze([
  '29.HMI', '12.HMI', '13.HMI', 'GPALAC.HMI', 'OVERCAST.HMI',
]);

export const OVERCAST_SONGS_FM = Object.freeze([
  '29FM.HMI', '12FM.HMI', '13FM.HMI', 'FPALAC.HMI', 'FMOVER_C.HMI',
]);

export const RAIN_SONGS = Object.freeze(['OVERLONG.HMI', 'RAINING.HMI', '08.HMI']);

export const RAIN_SONGS_FM = Object.freeze(['FMOVER_C.HMI', 'FM_RAIN.HMI', '08FM.HMI']);

export const SNOW_SONGS = Object.freeze([
  '20.HMI', 'GSNOW__B.HMI', 'OVERSNOW.HMI', 'SNOWING.HMI',
]);

export const SNOW_SONGS_FM = Object.freeze(['20FM.HMI', 'FSNOW__B.HMI', 'FMOVER_S.HMI']);

export const SNEAKING_SONGS = Object.freeze([
  'GSNEAK2.HMI', 'SNEAKING.HMI', 'SNEAKNG2.HMI', '16.HMI', '09.HMI', '25.HMI', '30.HMI',
]);

export const SNEAKING_SONGS_FM = Object.freeze([
  'FSNEAK2.HMI', 'FMSNEAK2.HMI', 'FSNEAK2.HMI', '16FM.HMI', '09FM.HMI', '25FM.HMI', '30FM.HMI',
]);

export const TEMPLE_GOOD_SONGS = Object.freeze(['GGOOD.HMI']);
export const TEMPLE_NEUTRAL_SONGS = Object.freeze(['GNEUT.HMI']);
export const TEMPLE_BAD_SONGS = Object.freeze(['GBAD.HMI']);
export const TEMPLE_GOOD_SONGS_FM = Object.freeze(['FGOOD.HMI']);
export const TEMPLE_NEUTRAL_SONGS_FM = Object.freeze(['FNEUT.HMI']);
export const TEMPLE_BAD_SONGS_FM = Object.freeze(['FBAD.HMI']);

export const TAVERN_SONGS = Object.freeze([
  'SQUARE_2.HMI', 'TAVERN.HMI', 'FOLK1.HMI', 'FOLK2.HMI', 'FOLK3.HMI',
]);

export const NIGHT_SONGS = Object.freeze([
  '10.HMI', '11.HMI', 'GCURSE.HMI', 'GEERIE.HMI', 'GRUINS.HMI', '18.HMI', '21.HMI',
]);

export const DAY_SONGS_FM = Object.freeze([
  'FDAY___D.HMI', 'FM_SWIM2.HMI', 'FM_SUNNY.HMI', '02FM.HMI', '03FM.HMI',
  '22FM.HMI', '29FM.HMI', '12FM.HMI', '13FM.HMI', 'FPALAC.HMI',
]);

// `rand() % length` keeps Daggerfall Unity's modulo bias, and a list of one never touches DFRandom.
export function selectSong(playlist, {
  gameDays = 0, tavern = false, dungeonKey = null, unseeded = false,
  random = Math.random,
} = {}) {
  if (!playlist || playlist.length === 0) return null;

  let index = 0;
  // The Mages Guild list re-rolls unseeded on every entry, as Daggerfall Unity's UnityEngine.Random call does.
  if (unseeded) {
    index = Math.floor(random() * playlist.length) % playlist.length;
  } else if (tavern) {
    // The >>> 0 keeps a negative day count from giving a negative index.
    index = Number(BigInt(Math.trunc(gameDays) >>> 0) % BigInt(playlist.length));
  } else if (dungeonKey !== null) {
    srand(dungeonKey >>> 0);
    index = rand() % playlist.length;
  } else if (playlist.length > 1) {
    srand(Math.trunc(gameDays) >>> 0);
    index = rand() % playlist.length;
  }
  return { name: playlist[index], index };
}

export function dungeonKey(unknown2, regionIndex) {
  return ((unknown2 & 0xffff) ^ ((regionIndex & 0xff) << 8)) >>> 0;
}

export function outdoorPlaylist({ night = false, weather = 'sunny', fm = false } = {}) {
  if (night) return fm ? NIGHT_SONGS_FM : NIGHT_SONGS;
  switch (String(weather).toLowerCase()) {
    case 'cloudy':   return fm ? CLOUDY_SONGS_FM : CLOUDY_SONGS;
    case 'overcast':
    case 'fog':      return fm ? OVERCAST_SONGS_FM : OVERCAST_SONGS;
    case 'rain':
    case 'thunder':  return fm ? RAIN_SONGS_FM : RAIN_SONGS;
    case 'snow':     return fm ? SNOW_SONGS_FM : SNOW_SONGS;
    default:         return fm ? SUNNY_SONGS_FM : SUNNY_SONGS;
  }
}

// Six entries where the GM list has seven: classic duplicates song_10 only into the GM night list, and MIDI.BSA
// has no 10FM record.
export const NIGHT_SONGS_FM = Object.freeze([
  '11FM.HMI', 'FCURSE.HMI', 'FEERIE.HMI', 'FRUINS.HMI', '18FM.HMI', '21FM.HMI',
]);

export const CASTLE_SONGS = Object.freeze(['GPALAC.HMI']);
export const CASTLE_SONGS_FM = Object.freeze(['FPALAC.HMI']);

export const COURT_SONGS = Object.freeze(['11.HMI']);
export const COURT_SONGS_FM = Object.freeze(['11FM.HMI']);

export const SHOP_SONGS = Object.freeze(['GSHOP.HMI']);
export const SHOP_SONGS_FM = Object.freeze(['FM_SQR_2.HMI']);

export const MAGES_GUILD_SONGS = Object.freeze(['GMAGE_3.HMI', 'MAGIC_2.HMI']);
export const MAGES_GUILD_SONGS_FM = Object.freeze(['FM_NITE3.HMI']);

export const INTERIOR_SONGS = Object.freeze(['23.HMI']);
export const INTERIOR_SONGS_FM = Object.freeze(['23FM.HMI']);

export const KNIGHT_SONGS = Object.freeze(['17.HMI']);
export const KNIGHT_SONGS_FM = Object.freeze(['17FM.HMI']);

export const PALACE_SONGS = Object.freeze(['06.HMI']);
export const PALACE_SONGS_FM = Object.freeze(['06FM.HMI']);

export const TAVERN_SONGS_FM = Object.freeze(['FM_SQR_2.HMI']);

export const MUSIC_ENVIRONMENTS = Object.freeze([
  'city', 'wilderness', 'castle', 'dungeonExterior', 'dungeonInterior',
  'graveyard', 'magesGuild', 'fighterTrainers', 'interior', 'palace',
  'shop', 'tavern', 'templeGood', 'templeNeutral', 'templeBad',
]);

export function environmentForBuilding(buildingType, { factionId = 0, templeAlignment = null } = {}) {
  const B = {
    Alchemist: 0, Armorer: 2, Bank: 3, Bookseller: 5, ClothingStore: 6,
    FurnitureStore: 7, GemStore: 8, GeneralStore: 9, Library: 10,
    GuildHall: 11, PawnShop: 12, WeaponSmith: 13, Temple: 14, Tavern: 15,
    Palace: 16,
  };
  const SHOPS = [B.Alchemist, B.Armorer, B.Bank, B.Bookseller, B.ClothingStore,
    B.FurnitureStore, B.GemStore, B.GeneralStore, B.Library, B.PawnShop, B.WeaponSmith];
  if (SHOPS.includes(buildingType)) return 'shop';
  if (buildingType === B.Tavern) return 'tavern';
  if (buildingType === B.Palace) return 'palace';
  if (buildingType === B.GuildHall) {
    return factionId === MAGES_GUILD_FACTION ? 'magesGuild' : 'interior';
  }
  if (buildingType === B.Temple) {
    if (factionId === FIGHTERS_GUILD_FACTION) return 'fighterTrainers';
    if (templeAlignment === 'good') return 'templeGood';
    if (templeAlignment === 'neutral') return 'templeNeutral';
    if (templeAlignment === 'bad') return 'templeBad';
    // Daggerfall Unity writes nothing for an unresolvable temple, so the caller keeps the previous environment.
    return null;
  }
  return 'interior';
}

export const MAGES_GUILD_FACTION = 40;
export const FIGHTERS_GUILD_FACTION = 41;

export function playlistForEnvironment(environment, {
  arrested = false, night = false, weather = 'sunny', fm = false,
} = {}) {
  // Arrest overrides every environment, and dungeon exteriors and graveyards take night songs at any hour.
  if (arrested) return fm ? COURT_SONGS_FM : COURT_SONGS;
  switch (environment) {
    case 'city':
    case 'wilderness':      return outdoorPlaylist({ night, weather, fm });
    case 'castle':          return fm ? CASTLE_SONGS_FM : CASTLE_SONGS;
    case 'dungeonExterior':
    case 'graveyard':       return fm ? NIGHT_SONGS_FM : NIGHT_SONGS;
    case 'dungeonInterior': return fm ? DUNGEON_SONGS_FM : DUNGEON_SONGS;
    case 'magesGuild':      return fm ? MAGES_GUILD_SONGS_FM : MAGES_GUILD_SONGS;
    case 'fighterTrainers': return fm ? KNIGHT_SONGS_FM : KNIGHT_SONGS;
    case 'palace':          return fm ? PALACE_SONGS_FM : PALACE_SONGS;
    case 'shop':            return fm ? SHOP_SONGS_FM : SHOP_SONGS;
    case 'tavern':          return fm ? TAVERN_SONGS_FM : TAVERN_SONGS;
    case 'templeGood':      return fm ? TEMPLE_GOOD_SONGS_FM : TEMPLE_GOOD_SONGS;
    case 'templeNeutral':   return fm ? TEMPLE_NEUTRAL_SONGS_FM : TEMPLE_NEUTRAL_SONGS;
    case 'templeBad':       return fm ? TEMPLE_BAD_SONGS_FM : TEMPLE_BAD_SONGS;
    case 'interior':
    default:                return fm ? INTERIOR_SONGS_FM : INTERIOR_SONGS;
  }
}

export const MUSIC_ENV = Object.freeze({
  Castle: 'castle', City: 'city', DungeonExterior: 'dungeonExterior',
  DungeonInterior: 'dungeonInterior', Graveyard: 'graveyard',
  MagesGuild: 'magesGuild', Interior: 'interior', Palace: 'palace',
  Shop: 'shop', Tavern: 'tavern', TempleGood: 'templeGood',
  TempleNeutral: 'templeNeutral', TempleBad: 'templeBad',
  Wilderness: 'wilderness', FighterTrainers: 'fighterTrainers',
});

export const LOCATION_TYPES = Object.freeze({
  TownCity: 0, TownHamlet: 1, TownVillage: 2, HomeFarms: 3,
  DungeonLabyrinth: 4, ReligionTemple: 5, Tavern: 6, DungeonKeep: 7,
  HomeWealthy: 8, ReligionCult: 9, DungeonRuin: 10, HomePoor: 11,
  Graveyard: 12, Coven: 13, HomeYourShips: 14, None: 0xffff,
});

export const TEMPLE_FACTIONS = Object.freeze([0x52, 0x54, 0x58, 0x5C, 0x5E, 0x62, 0x6A, 0x24]);
export const GOD_FACTIONS = Object.freeze([0x15, 0x16, 0x18, 0x1A, 0x1B, 0x1D, 0x21, 0x23]);
export const TEMPLE_ALIGNMENTS = Object.freeze([
  'good',
  'bad',
  'good',
  'neutral',
  'bad',
  'good',
  'bad',
  'neutral',
]);

export function getTempleIndex(factionId) {
  // The byte cast is Daggerfall Unity's, so an id above 255 takes its low byte.
  const b = Number(factionId) & 0xff;
  const i = TEMPLE_FACTIONS.indexOf(b);
  return i >= 0 ? i : GOD_FACTIONS.indexOf(b);
}

export function templeAlignment(factionId) {
  const i = getTempleIndex(factionId);
  return i >= 0 ? TEMPLE_ALIGNMENTS[i] : null;
}

export function musicEnvironment({
  inside = false, insideDungeon = false, insideDungeonCastle = false,
  inLocationRect = false, locationType = LOCATION_TYPES.None,
  buildingType = -1, factionId = 0,
} = {}) {
  const L = LOCATION_TYPES;
  if (!inside) {
    if (!inLocationRect) return MUSIC_ENV.Wilderness;
    switch (locationType) {
      case L.DungeonKeep:
      case L.DungeonLabyrinth:
      case L.DungeonRuin:
      case L.Coven:
      // HomePoor counts as a dungeon exterior, as Daggerfall Unity reads it.
      case L.HomePoor:        return MUSIC_ENV.DungeonExterior;
      case L.Graveyard:       return MUSIC_ENV.Graveyard;
      case L.HomeFarms:
      case L.HomeWealthy:
      case L.Tavern:
      case L.TownCity:
      case L.TownHamlet:
      case L.TownVillage:
      case L.ReligionTemple:  return MUSIC_ENV.City;
      default:                return MUSIC_ENV.Wilderness;
    }
  }
  if (insideDungeon) {
    return insideDungeonCastle ? MUSIC_ENV.Castle : MUSIC_ENV.DungeonInterior;
  }
  return environmentForBuilding(buildingType, {
    factionId, templeAlignment: templeAlignment(factionId),
  });
}

export function holdEnvironment(next, previous) {
  return next === null || next === undefined ? (previous ?? MUSIC_ENV.Wilderness) : next;
}

export function contextEquals(a, b) {
  if (!a || !b) return false;
  return a.environment === b.environment
    && a.weather === b.weather
    && a.night === b.night
    && a.gameDays === b.gameDays
    && a.locationIndex === b.locationIndex
    && a.arrested === b.arrested;
}

export class SongManager {
  /**
   * @param {object} sinks
   * @param {(name: string) => void} sinks.play
   * @param {() => void} sinks.stop
   * @param {boolean} [sinks.fm]
   */
  constructor({ play, stop, fm = false, random = Math.random } = {}) {
    this._play = play ?? (() => {});
    this._stop = stop ?? (() => {});
    this.fm = fm;
    this.random = random;
    this.playSong = true;
    this.currentPlaylist = null;
    this.currentSong = null;
    this.currentSongIndex = 0;
    this._last = null;
    this._current = null;
  }

  update(context, { songEnded = false } = {}) {
    const ctx = {
      environment: context.environment ?? MUSIC_ENV.Wilderness,
      weather: context.weather ?? 'sunny',
      night: Boolean(context.night),
      gameDays: Math.trunc(context.gameDays ?? 0),
      locationIndex: context.locationIndex ?? -1,
      arrested: Boolean(context.arrested),
      dungeonKey: context.dungeonKey ?? null,
    };
    this._current = ctx;

    // A finished song clears the playing guard, so the same song may start again.
    if (songEnded) this._playing = null;

    if (!contextEquals(ctx, this._last) || (songEnded && this.playSong)) {
      const dayChanged = ctx.gameDays !== this._last?.gameDays;
      const locationChanged = ctx.locationIndex !== this._last?.locationIndex;
      const first = this._last === null;
      this._last = ctx;

      const lastPlaylist = this.currentPlaylist;
      this.currentPlaylist = playlistForEnvironment(ctx.environment, {
        arrested: ctx.arrested, night: ctx.night, weather: ctx.weather, fm: this.fm,
      });

      // A new day or a new location picks a new song even when the playlist is the same.
      if (this.currentPlaylist !== lastPlaylist || dayChanged || locationChanged || first) {
        this._playAnotherSong();
        return this.currentSong;
      }
    }

    if (songEnded) this._playCurrentSong();
    return this.currentSong;
  }

  _playAnotherSong() {
    const env = this._current.environment;
    const isTavern = env === MUSIC_ENV.Tavern;
    const isDungeon = env === MUSIC_ENV.DungeonInterior;
    const unseeded = env === MUSIC_ENV.MagesGuild;
    const pick = selectSong(this.currentPlaylist, {
      gameDays: this._current.gameDays,
      tavern: isTavern,
      dungeonKey: isDungeon ? (this._current.dungeonKey ?? null) : null,
      unseeded,
      random: this.random,
    });
    if (!pick) return;
    this.currentSong = pick.name;
    this.currentSongIndex = pick.index;
    this._playCurrentSong();
  }

  _playCurrentSong(forcePlay = false) {
    if (!this.currentSong) return;
    if (!forcePlay && (this._playing === this.currentSong || !this.playSong)) return;
    this._playing = this.currentSong;
    this._play(this.currentSong);
  }

  startPlaying() {
    this.playSong = true;
    this._playing = null;
    this._playCurrentSong(true);
  }

  stopPlaying() {
    this.playSong = false;
    this._playing = null;
    this._stop();
  }

  togglePlay() {
    if (this.playSong) this.stopPlaying();
    else this.startPlaying();
  }

  playNextSong() {
    if (!this.currentPlaylist?.length) return;
    if (++this.currentSongIndex >= this.currentPlaylist.length) this.currentSongIndex = 0;
    this.currentSong = this.currentPlaylist[this.currentSongIndex];
    this._playCurrentSong();
  }

  playPreviousSong() {
    if (!this.currentPlaylist?.length) return;
    if (--this.currentSongIndex < 0) this.currentSongIndex = this.currentPlaylist.length - 1;
    this.currentSong = this.currentPlaylist[this.currentSongIndex];
    this._playCurrentSong();
  }
}
