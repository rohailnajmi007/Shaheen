// Bases, scenery themes and times of day.

// Layout (owner 2026-11-21): the parked jets, squadron boards, trophies and decorations
// sit at the START of each base, around the take-off point (60 m past the threshold),
// so they are in view while you line up; hangars, admin block and tower are at the far
// end (src/render/scenery.js BUILDINGS_END_M). x in m from the threshold.
// Owner 2026-11-21 (second pass): the hangar block sits mid-runway and the stretches
// either side are filled with base buildings (barracks, workshops, fuel farm, offices).
export const BASES = {
  risalpur: {
    id: 'risalpur', name: 'PAF Academy Asghar Khan', city: 'Risalpur', short: 'RISALPUR',
    hangarName: 'PAFAA', // stencilled on the hangars (owner 2026-11-21)
    taxiFromM: 25, holdM: 150, // taxi start and holding point (TAXI)
    runwayM: 1200, hangars: 3, towerM: 24, parked: 'k8_front_body', apron: [20, 300],
    boards: [],
    // "Falcons' Hearth" 1965 memorial (owner's art), seen from the take-off point; hM: height (m).
    decor: [{ sprite: 'falcons_hearth_body', x: 4, hM: 11 }], theme: 'kpk',
  },
  masroor: {
    id: 'masroor', name: 'PAF Base Masroor', city: 'Karachi', short: 'MASROOR',
    hangarPlane: 'c130_front_body', // a C-130 in each big hangar (fighter bases, owner 2026-11-21)
    runwayM: 1400, hangars: 2, towerM: 28, parked: 'jf17_front_body', apron: [-60, 520], taxiFromM: -30, holdM: 135,
    boards: ['NO. 2 MR SQN|MINHASIANS', 'NO. 8 MR SQN|HAIDER'],
    // Big emblem billboards behind the parked rows, by their squadron's board (owner 2026-11-21);
    // caption = the board's number part ("NO. 2 MR SQN"), the small board shows the name.
    billboards: [
      { sprite: 'nishan_e_haider_body', board: 'NO. 2 MR SQN|MINHASIANS' },
      { sprite: 'emblem_no8_body', board: 'NO. 8 MR SQN|HAIDER' },
    ],
    theme: 'coast',
    // Background landmarks (src/render/landmarks.js), seen on the approach.
    landmarks: ['port_cranes', 'teen_talwar', 'bahria_icon', 'mazar_e_quaid', 'masjid_e_tooba', 'skyline'],
  },
  mushaf: {
    id: 'mushaf', name: 'PAF Base Mushaf', city: 'Sargodha', short: 'MUSHAF',
    hangarPlane: 'c130_front_body', // a C-130 in each big hangar (fighter bases, owner 2026-11-21)
    runwayM: 1500, hangars: 2, towerM: 26, parked: 'f16_front_body', apron: [32, 280], taxiFromM: 25, holdM: 225,
    boards: ['NO. 9 MR SQN|GRIFFINS', 'NO. 29 MR SQN|AGGRESSORS'],
    billboards: [
      { sprite: 'emblem_no9_body', board: 'NO. 9 MR SQN|GRIFFINS' },
      { sprite: 'emblem_no29_body', board: 'NO. 29 MR SQN|AGGRESSORS' },
    ],
    welcome: ['WELCOME TO MUSHAF', 'THE HOME OF EAGLES'], theme: 'punjab',
    // Stone monument (dark blue, gold key-pattern border, crest) at both runway ends.
    // Owner 2026-11-21: in the middle of the base, between the parked rows and the hangars.
    welcomeMid: true, welcomeStyle: 'monument',
    boardColor: '#8c0f0f', boardTrim: '#ebbd4d',
    // Captured-aircraft fins side by side on one black base (m from the threshold).
    trophies: [{ kinds: ['mig21', 'su30'], x: 2 }],
    // A short row of Mirage Vs (owner's front art), set well apart from the squadron
    // boards and the F-16 line (owner 2026-11-21).
    parkedGroups: [{ sprite: 'mirage5_front_body', from: 330, count: 4 }],
    banyanX: [-250, -30, 240, 1080, 1210, 1380, 1650, 1780],
    landmarks: ['fields', 'orchard', 'banyan', 'village'],
  },
  // Owner 2026-11-21: the J-10C's home; snow and the northern mountains. Also a
  // landing base after a mission. Parked (front views): a row of JF-17s, then a row
  // of J-10Cs, each squadron's board right next to its last jet.
  kamra: {
    id: 'kamra', name: 'PAF Base Kamra', city: 'Kamra', short: 'KAMRA',
    hangarPlane: 'c130_front_body', // a C-130 in each big hangar (fighter bases, owner 2026-11-21)
    runwayM: 1500, hangars: 2, towerM: 26, theme: 'north', taxiFromM: 5, holdM: 240,
    parkedGroups: [
      { sprite: 'jf17_front_body', from: -20, count: 6, board: 'NO. 26 MR SQN|BLACK SPIDERS' },
      { sprite: 'j10c_front_body', from: 102, count: 6, board: 'NO. 15 MR SQN|COBRAS' },
    ],
    boards: [], boardColor: '#14181c', boardTrim: '#d9dde2',
    billboards: [
      { sprite: 'emblem_no26_body', board: 'NO. 26 MR SQN|BLACK SPIDERS' },
      { sprite: 'emblem_no15_body', board: 'NO. 15 MR SQN|COBRAS' },
    ],
  },
  // Owner 2026-11-21: home of the F-16D; Jacobabad desert, palms and sand. Parked: No. 5
  // Sqn "Falcons" F-16Cs (owner's front art), then No. 11 Sqn "Arrows" F-16As.
  shahbaz: {
    id: 'shahbaz', name: 'PAF Base Shahbaz', city: 'Jacobabad', short: 'SHAHBAZ',
    hangarPlane: 'c130_front_body', // a C-130 in each big hangar (fighter bases, owner 2026-11-21)
    runwayM: 1500, hangars: 2, towerM: 26, theme: 'sindh', taxiFromM: 5, holdM: 240,
    parkedGroups: [
      { sprite: 'f16c_front_body', from: -20, count: 6, board: 'NO. 5 MR SQN|FALCONS' },
      { sprite: 'f16_front_body', from: 102, count: 6, board: 'NO. 11 MR SQN|ARROWS' },
    ],
    boards: [], boardColor: '#16181c', boardTrim: '#f0a020',
    billboards: [
      { sprite: 'emblem_no5_body', board: 'NO. 5 MR SQN|FALCONS' },
      { sprite: 'emblem_no11_body', board: 'NO. 11 MR SQN|ARROWS' },
    ],
  },
};

// Home base per aircraft (owner, 2026-11-19): the Mushshak flies from Risalpur, the
// F-16s and Mirage from Mushaf (Sargodha), the JF-17 from Masroor (Karachi). The ferry
// world is laid out from the home base (x = 0) to the right: the near destination at
// ROUTE_M[0], the far one at ROUTE_M[1] (refuelling stop at the near base on the way).
export const ROUTE_M = [6500, 12500, 18500, 24500];

// Taxi out (owner 2026-11-21): every flight starts where the base's decorations begin
// (base taxiFromM, else startM; m from the threshold; owner: "not a mile back") and you
// roll slowly past the parked jets, squadron boards and trophies, then stop at the base's
// holding point (holdM) before the take-off run. No afterburner while taxiing.
// maxKt: taxi speed limit; stop within [stopBeforeM before, stopAfterM past] the line
// below stopKt to be cleared; the prompt changes to "stop" promptStopM before the line.
// The holding point has a hold line, flashing amber guard lights and a HOLD sign;
// green centre-line lights lead to it (lightEveryM).
export const TAXI = { startM: 0, maxKt: 22, stopKt: 2, stopBeforeM: 30, stopAfterM: 60, promptStopM: 70, lightEveryM: 14, clearedShowS: 3 };

// Fuel truck at a refuelling stop (owner 2026-11-20: comes on its own once the jet
// stops at a base that is not the destination). Drives in, pumps, drives off.
export const REFUEL = {
  driveS: 2.5,      // drive in / drive off
  pumpS: 5,         // filling the tanks
  parkAheadM: 22,   // parks this far ahead of the main wheels (clear of the nose)
  driveInM: 70,     // arrives from this far ahead
  cancelKt: 3,      // the jet rolling faster than this sends the truck away
};
// Ferry destinations, nearest first: every other base (owner 2026-11-21).
export const ROUTES_FROM = {
  risalpur: ['kamra', 'mushaf', 'shahbaz', 'masroor'],
  mushaf: ['kamra', 'risalpur', 'shahbaz', 'masroor'],
  masroor: ['shahbaz', 'mushaf', 'kamra', 'risalpur'],
  kamra: ['risalpur', 'mushaf', 'shahbaz', 'masroor'],
  shahbaz: ['masroor', 'mushaf', 'kamra', 'risalpur'],
};
// Landing bases after a mission (strike, air to air): any base but home, at random.
export const recoveryBases = (home) => Object.keys(BASES).filter((id) => id !== home);
// What you see on the way to each base (route notes on the start screen).
const ROUTE_NOTE = {
  risalpur: 'Mountains and the PAF Academy',
  masroor: 'Coast, sea and the Karachi skyline',
  mushaf: 'Green Punjab plains and Sargodha',
  kamra: 'Snow and the northern mountains',
  shahbaz: 'Sindh desert, sand and palms',
};

// [base id, threshold x in m] for a ferry flight from this home base.
export function ferryLayout(home) {
  const dests = ROUTES_FROM[home] || ROUTES_FROM.risalpur;
  return [[home, 0], ...dests.map((id, i) => [id, ROUTE_M[i]])];
}

// Start-screen routes from this home base.
export function routesFrom(home) {
  const h = BASES[home] || BASES.risalpur;
  const dests = ROUTES_FROM[h.id];
  return dests.map((id, i) => ({
    id, label: `${cap(h.short)} → ${cap(BASES[id].short)}`, km: ROUTE_M[i] / 1000,
    note: i ? `${ROUTE_NOTE[id]}. Refuel stop at ${cap(BASES[dests[i - 1]].short)} if needed` : ROUTE_NOTE[id],
  }));
}
const cap = (s) => s[0] + s.slice(1).toLowerCase();

// Scenery colours per region. Layers far to near.
export const THEMES = {
  kpk: {
    mountains: '#7f93ad', mountainsHi: 0.55, snow: true,
    hills: '#5d8a4a', hillsHi: 0.22,
    trees: '#2f5a2a',
    ground: '#5f8f45', groundDark: '#4b7737',
    sea: false, city: false,
  },
  coast: {
    // Karachi is flat coast: no mountain layer (owner, 2026-11-19).
    mountains: null, mountainsHi: 0, snow: false,
    hills: '#c2a676', hillsHi: 0.1,
    trees: '#6d7343',
    ground: '#c4ad7c', groundDark: '#ad9564',
    sea: true, city: true,
  },
  // Flat Punjab plain (owner 2026-11-21: no mountains at Mushaf).
  // Owner 2026-11-21: fields and canals, not too green: dusty olive land, a patchwork of
  // wheat, mustard, green and fallow fields (fieldColors) and a canal with its tree line.
  punjab: {
    mountains: null, mountainsHi: 0, snow: false,
    hills: '#9a9a62', hillsHi: 0.05,
    trees: '#46552a',
    ground: '#8e9156', groundDark: '#767a45',
    sea: false, city: false,
    fields: true, fieldColors: ['#c9b56a', '#d9c24a', '#7f9a4a', '#a88f62', '#b9a874', '#93a15a'], canal: '#4f86a6',
  },
  // Northern areas (Kamra, owner 2026-11-21): tall snow-capped ranges, snowy hills
  // dotted with pines, snow on the ground. snowLine: share of the range under snow.
  north: {
    mountains: '#8797ad', mountainsHi: 0.33, snow: true, snowLine: 0.45,
    hills: '#dde5ee', hillsHi: 0.3,
    trees: '#26443a',
    ground: '#e8edf2', groundDark: '#c3cdd8',
    sea: false, city: false, pines: true,
  },
  // Jacobabad (Shahbaz, owner 2026-11-21): flat Sindh desert, low dunes, palm groves.
  sindh: {
    mountains: null, mountainsHi: 0, snow: false, // flat (owner 2026-11-21)
    hills: '#d9bf8c', hillsHi: 0.06,
    trees: '#5f6e34',
    ground: '#dcc28e', groundDark: '#c4a874',
    sea: false, city: false, palms: true,
  },
  desert: {
    mountains: '#9c8574', mountainsHi: 0.3, snow: false,
    hills: '#b08b5c', hillsHi: 0.16,
    trees: '#71663c',
    ground: '#b8955f', groundDark: '#a07e4c',
    sea: false, city: false,
  },
};

// Sky gradient (top, middle, horizon), sun, light on the land (multiply), haze.
export const TIMES = {
  dawn: {
    label: 'Dawn', skyTop: '#2b3a6b', skyMid: '#c9839a', skyHorizon: '#ffc58f',
    sun: { x: 0.18, y: 0.78, color: '#ffd9a0', size: 1.0 }, light: [0.86, 0.74, 0.74], haze: '#e8a991',
    hazeAmount: 0.45, stars: 0.15, lights: true, cloud: '#ffd7c2', cloudShade: '#8a6f8f',
  },
  day: {
    label: 'Day', skyTop: '#2f6fc4', skyMid: '#74abe2', skyHorizon: '#cfe6f5',
    sun: { x: 0.78, y: 0.16, color: '#fffbe8', size: 0.8 }, light: [1, 1, 1], haze: '#bcd6ea',
    hazeAmount: 0.4, stars: 0, lights: false, cloud: '#ffffff', cloudShade: '#a9bfd6',
  },
  dusk: {
    label: 'Dusk', skyTop: '#1d2552', skyMid: '#a5527a', skyHorizon: '#ff9a52',
    sun: { x: 0.72, y: 0.82, color: '#ffb36b', size: 1.3 }, light: [0.82, 0.62, 0.55], haze: '#d6825f',
    hazeAmount: 0.5, stars: 0.3, lights: true, cloud: '#ffc09a', cloudShade: '#6b4a73',
  },
  night: {
    label: 'Night', skyTop: '#03060f', skyMid: '#0a1530', skyHorizon: '#1b2a4d',
    sun: { x: 0.25, y: 0.2, color: '#e8eefc', size: 0.35, moon: true }, light: [0.28, 0.32, 0.46], haze: '#1a2644',
    hazeAmount: 0.55, stars: 1, lights: true, cloud: '#4a5675', cloudShade: '#1c2338',
  },
};
