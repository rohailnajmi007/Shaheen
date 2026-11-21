// Bases, scenery themes and times of day.

export const BASES = {
  risalpur: {
    id: 'risalpur', name: 'PAF Academy Asghar Khan', city: 'Risalpur', short: 'RISALPUR',
    runwayM: 1200, hangars: 3, towerM: 24, parked: 'k8_front_body', apron: [420, 700],
    boards: [], welcome: ['PAF ACADEMY ASGHAR KHAN', 'FIRST OF THE FEW'], theme: 'kpk',
  },
  masroor: {
    id: 'masroor', name: 'PAF Base Masroor', city: 'Karachi', short: 'MASROOR',
    runwayM: 1400, hangars: 2, towerM: 28, parked: 'jf17_front_body', apron: [300, 900],
    boards: ['NO. 2 SQN|MINHASIANS', 'NO. 8 SQN|HAIDER'],
    welcome: ['WELCOME TO MASROOR', 'THE HOME OF WARRIORS'], welcomeX: [1430], theme: 'coast',
    // Background landmarks (src/render/landmarks.js), seen on the approach.
    landmarks: ['port_cranes', 'teen_talwar', 'bahria_icon', 'mazar_e_quaid', 'masjid_e_tooba', 'skyline'],
  },
  mushaf: {
    id: 'mushaf', name: 'PAF Base Mushaf', city: 'Sargodha', short: 'MUSHAF',
    runwayM: 1500, hangars: 2, towerM: 26, parked: 'f16_front_body', apron: [300, 1000],
    boards: ['NO. 9 SQN|GRIFFINS', 'NO. 29 SQN|AGGRESSORS'],
    welcome: ['WELCOME TO MUSHAF', 'THE HOME OF EAGLES'], theme: 'punjab',
    // Stone monument (dark blue, gold key-pattern border, crest) at both runway ends.
    welcomeX: [-170, 1540], welcomeStyle: 'monument',
    boardColor: '#8c0f0f', boardTrim: '#ebbd4d',
    // Captured-aircraft fins side by side on one black base (m from the threshold).
    trophies: [{ kinds: ['mig21', 'su30'], x: 520 }],
    banyanX: [-250, -30, 240, 1080, 1210, 1380, 1650, 1780],
    landmarks: ['fields', 'orchard', 'banyan', 'village'],
  },
  // Owner 2026-11-21: the J-10C's home; snow and the northern mountains. Also a
  // landing base after a mission. Parked (front views): a row of JF-17s, then a row
  // of J-10Cs, each squadron's board right next to its last jet.
  kamra: {
    id: 'kamra', name: 'PAF Base Kamra', city: 'Kamra', short: 'KAMRA',
    runwayM: 1500, hangars: 2, towerM: 26, theme: 'north',
    parkedGroups: [
      { sprite: 'jf17_front_body', from: 300, count: 6, board: 'NO. 26 MR SQN|BLACK SPIDERS' },
      { sprite: 'j10c_front_body', from: 470, count: 6, board: 'NO. 15 MR SQN|COBRAS' },
    ],
    boards: [], boardColor: '#14181c', boardTrim: '#d9dde2',
    welcome: ['WELCOME TO KAMRA', 'PAF BASE KAMRA'],
  },
};

// Home base per aircraft (owner, 2026-11-19): the Mushshak flies from Risalpur, the
// F-16s and Mirage from Mushaf (Sargodha), the JF-17 from Masroor (Karachi). The ferry
// world is laid out from the home base (x = 0) to the right: the near destination at
// ROUTE_M[0], the far one at ROUTE_M[1] (refuelling stop at the near base on the way).
export const ROUTE_M = [6500, 12500];

// Fuel truck at a refuelling stop (owner 2026-11-20: comes on its own once the jet
// stops at a base that is not the destination). Drives in, pumps, drives off.
export const REFUEL = {
  driveS: 2.5,      // drive in / drive off
  pumpS: 5,         // filling the tanks
  parkAheadM: 22,   // parks this far ahead of the main wheels (clear of the nose)
  driveInM: 70,     // arrives from this far ahead
  cancelKt: 3,      // the jet rolling faster than this sends the truck away
};
export const ROUTES_FROM = {
  risalpur: ['masroor', 'mushaf'],
  mushaf: ['risalpur', 'masroor'],
  masroor: ['mushaf', 'risalpur'],
  kamra: ['risalpur', 'mushaf'],
};
// Landing bases after a mission (strike, air to air): any base but home, at random.
export const recoveryBases = (home) => Object.keys(BASES).filter((id) => id !== home);
// What you see on the way to each base (route notes on the start screen).
const ROUTE_NOTE = {
  risalpur: 'Mountains and the PAF Academy',
  masroor: 'Coast, sea and the Karachi skyline',
  mushaf: 'Green Punjab plains and Sargodha',
  kamra: 'Snow and the northern mountains',
};

// [base id, threshold x in m] for a ferry flight from this home base.
export function ferryLayout(home) {
  const [near, far] = ROUTES_FROM[home] || ROUTES_FROM.risalpur;
  return [[home, 0], [near, ROUTE_M[0]], [far, ROUTE_M[1]]];
}

// Start-screen routes from this home base.
export function routesFrom(home) {
  const h = BASES[home] || BASES.risalpur;
  const [near, far] = ROUTES_FROM[h.id];
  return [
    { id: near, label: `${cap(h.short)} → ${cap(BASES[near].short)}`, km: ROUTE_M[0] / 1000, note: ROUTE_NOTE[near] },
    { id: far, label: `${cap(h.short)} → ${cap(BASES[far].short)}`, km: ROUTE_M[1] / 1000, note: `${ROUTE_NOTE[far]}. Refuel stop at ${cap(BASES[near].short)} if needed` },
  ];
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
  punjab: {
    mountains: '#8a98a6', mountainsHi: 0.1, snow: false,
    hills: '#5e8d42', hillsHi: 0.08,
    trees: '#2b5524',
    ground: '#5d9440', groundDark: '#4a7b32',
    sea: false, city: false,
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
