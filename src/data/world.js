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
    welcome: ['WELCOME TO MASROOR', 'THE HOME OF WARRIORS'], theme: 'coast',
  },
  mushaf: {
    id: 'mushaf', name: 'PAF Base Mushaf', city: 'Sargodha', short: 'MUSHAF',
    runwayM: 1500, hangars: 2, towerM: 26, parked: 'f16_front_body', apron: [300, 1000],
    boards: ['NO. 9 SQN|GRIFFINS', 'NO. 29 SQN|AGGRESSORS'],
    welcome: ['WELCOME TO MUSHAF', 'THE HOME OF EAGLES'], theme: 'punjab',
  },
};

// Threshold positions (m from the Risalpur threshold) in the ferry world.
export const FERRY_LAYOUT = [
  ['risalpur', 0],
  ['masroor', 6500],
  ['mushaf', 12500],
];

export const ROUTES = [
  { id: 'masroor', label: 'Risalpur → Masroor', km: 6.5, note: 'Coast, sea and the Karachi skyline' },
  { id: 'mushaf', label: 'Risalpur → Mushaf', km: 12.5, note: 'Longer. Refuel stop at Masroor if needed' },
];

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
    mountains: '#a59a92', mountainsHi: 0.18, snow: false,
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
