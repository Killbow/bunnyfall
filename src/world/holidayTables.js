// @ts-check
// DFU holiday tables from `FormulaHelper.GetHolidayId` and `DFLocation.Holidays`. This file must import nothing:
// net/festivalLaw.js loads it without the game's file readers.

export const HOLIDAYS = Object.freeze({
  None: 0, New_Life: 1, Scour_Day: 2, Ovanka: 3, South_Winds_Prayer: 4,
  Day_of_Lights: 5, Waking_Day: 6, Mad_Pelagius: 7, Othroktide: 8,
  Day_of_Release: 9, Hearts_Day: 10, Perserverance_Day: 11, Aduros_Nau: 12,
  First_Harvest: 13, Day_of_Waiting: 14, Flower_Day: 15, Festival_of_Blades: 16,
  Gardtide: 17, Day_of_the_Dead: 18, Day_of_Shame: 19, Jesters_Day: 20,
  Second_Harvest: 21, Marukhs_Day: 22, Fire_Festival: 23, Fishing_Day: 24,
  Drigh_RZimb: 25, Mid_Year: 26, Dancing_Day: 27, Tibedetha: 28,
  Merchants_Festival: 29, Divad_Etept: 30, Suns_Rest: 31, Fiery_Night: 32,
  Maiden_Katrica: 33, Koomu_Alazeri: 34, Feast_of_the_Tiger: 35,
  Appreciation_Day: 36, Harvest_End: 37, Tales_and_Tallow: 38, Khurat: 39,
  Riglametha: 40, Childrens_Day: 41, Dirij_Tereur: 42, Witches_Festival: 43,
  Broken_Diamonds: 44, Emperors_Birthday: 45, Serpents_Dance: 46,
  Moon_Festival: 47, Hel_Anseilak: 48, Warriors_Festival: 49,
  North_Winds_Festival: 50, Baranth_Do: 51, Chila: 52, Saturalia: 53,
  Old_Life_Festival: 54,
});

// 0xFF means every region; any other value is a region id, which is `regionIndex + 1`.
export const REGION_CELEBRATING_HOLIDAY = Object.freeze([
  0xFF, 0x19, 0x01, 0xFF, 0x1D, 0x05, 0x19, 0x06, 0x3C, 0xFF, 0x29, 0x1A,
  0xFF, 0x02, 0x19, 0x01, 0x0E, 0x12, 0x14, 0xFF, 0xFF, 0x1C, 0x21, 0x1F, 0x2C, 0xFF, 0x12,
  0x23, 0xFF, 0x38, 0xFF, 0x01, 0x30, 0x29, 0x0B, 0x16, 0xFF, 0xFF, 0x11, 0x17, 0x14, 0x01,
  0xFF, 0x13, 0xFF, 0x33, 0x3C, 0x2E, 0xFF, 0xFF, 0x01, 0x2D, 0x18,
]);

// Days of the year, 1-based.
export const HOLIDAY_DAYS_OF_YEAR = Object.freeze([
  0x01, 0x02, 0x0C, 0x0F, 0x10, 0x12, 0x20, 0x23, 0x26, 0x2E, 0x39, 0x3A,
  0x43, 0x45, 0x55, 0x56, 0x5B, 0x67, 0x6E, 0x76, 0x7F, 0x81, 0x8C, 0x96, 0x97, 0xA6, 0xAD,
  0xAE, 0xBE, 0xC0, 0xC8, 0xD1, 0xD4, 0xDD, 0xE0, 0xE7, 0xED, 0xF3, 0xF6, 0xFC, 0x103, 0x113,
  0x11B, 0x125, 0x12C, 0x12F, 0x134, 0x13E, 0x140, 0x159, 0x15C, 0x162, 0x163,
]);

// Both tables are indexed by holiday id minus one, because `GetHolidayId` returns its loop index plus one. Reading
// a row with the enum value lands on the next holiday's day.
export const holidayDayOfYear = (holidayId) =>
  (holidayId >= 1 && holidayId <= HOLIDAY_DAYS_OF_YEAR.length
    ? HOLIDAY_DAYS_OF_YEAR[holidayId - 1] : null);

export const holidayRegion = (holidayId) =>
  (holidayId >= 1 && holidayId <= REGION_CELEBRATING_HOLIDAY.length
    ? REGION_CELEBRATING_HOLIDAY[holidayId - 1] : null);

export const HOLIDAY_SEARCH_LIMIT = 53;
export const HOLIDAY_LAST_DAY = 355;
