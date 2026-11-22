// Air-to-air opponents (owner 2026-11-21): the bandits you fight in the air-to-air
// mission, one type per mission = the difficulty. MiG-21 worst, Su-30 middle,
// Rafale best: flight performance, toughness, gun and how well it flies (ai = overrides
// of DOGFIGHT in src/data/combat.js). Art: tools/make_aircraft_sprites.py (mig21,
// su30, rafale), owner's pictures in docs/reference/*_opponent_source.png.
// Sprite numbers are texture px (nose right), like src/data/aircraft.js.
// aam: the bandit's missiles (BANDIT_AAMS in src/data/combat.js) and how many it carries
// (none on the MiG-21: EASY). breakup: sprite size (px), for placing the debris of a
// missile kill (DOGFIGHT.breakup in src/data/combat.js).
// eras: which era's opponent screen lists it (1965 / modern). byEra: fields that change in
// that era (owner 2026-11-22: 1965 = Gnat EASY, Hunter MEDIUM, the same MiG-21 HARD).
import { COMMON } from './aircraft.js';

export const OPPONENTS = [
  {
    ...COMMON,
    id: 'mig21',
    name: 'MiG-21',
    eras: ['modern', '1965'],
    difficulty: 'EASY',
    byEra: { 1965: { difficulty: 'HARD', note: 'Fast, with afterburner. The best they have.' } },
    note: 'Old and slow to react. Turns badly, shoots wild.',
    massKg: 8000, maxThrustN: 42000, afterburnerN: 26000, dragCoef: 1.15,
    stallKt: 150, rotateKt: 165, maxSpeedKt: 560, pitchRateDeg: 22, pitchAccelDeg: 200,
    fuelKg: 900, burnFullKgS: 2.6,
    sprite: 'mig21_body', pivot: [236, 112], nozzle: [40, 86], flameLength: 200, flameWidth: 24,
    hitRadiusM: 5, hitCenterUpM: 2.2, airframeHp: 70,
    breakup: { sizePx: [472, 129] },
    gun: { name: 'GSH-23', rps: 55, muzzleMs: 715, dragK: 0.0004, spreadMrad: 7, dmg: 4, rounds: 200, port: [330, 96], tracerEvery: 4 },
    ai: {
      reactionS: 0.6, aimErrDeg: 2.1, fireConeDeg: 1.8, fireRangeM: 650, burstGapS: [1.2, 2.4],
      banditDmgMult: 0.07, overshootPerS: 0.2, jinkAltM: 110, jinkEveryS: [2.4, 4.2], speedReadS: 3.2, pitchGain: 2.6,
    },
  },
  {
    ...COMMON,
    id: 'su30', eras: ['modern'],
    name: 'Su-30',
    difficulty: 'MEDIUM',
    note: 'Big, powerful and tough. Takes a lot of hits.',
    massKg: 18000, maxThrustN: 112000, afterburnerN: 76000, dragCoef: 2.05,
    stallKt: 125, rotateKt: 145, maxSpeedKt: 600, pitchRateDeg: 30, pitchAccelDeg: 260,
    fuelKg: 2000, burnFullKgS: 4.5,
    sprite: 'su30_body', pivot: [330, 150], nozzle: [29, 129], flameLength: 300, flameWidth: 34,
    hitRadiusM: 6.5, hitCenterUpM: 2.6, airframeHp: 130,
    gun: { name: 'GSH-30-1', rps: 25, muzzleMs: 860, dragK: 0.0003, spreadMrad: 5, dmg: 8, rounds: 150, port: [470, 112], tracerEvery: 3 },
    ai: {
      reactionS: 0.35, aimErrDeg: 1.1, fireConeDeg: 2.2, fireRangeM: 800, burstGapS: [0.7, 1.4],
      banditDmgMult: 0.09, overshootPerS: 0.75, overshootRangeM: 700, jinkAltM: 240, jinkEveryS: [1.1, 2.2],
      speedReadS: 2.5, yoyoPerS: 0.3, speedJinkChance: 0.45, jinkVsMs: 95,
    },
    aam: { type: 'r73', count: 2 },
    breakup: { sizePx: [640, 185] },
  },
  {
    ...COMMON,
    id: 'rafale', eras: ['modern'],
    name: 'Rafale',
    difficulty: 'HARD',
    note: 'Agile, quick and accurate. Hard to shake off.',
    massKg: 11000, maxThrustN: 80000, afterburnerN: 58000, dragCoef: 1.3,
    stallKt: 115, rotateKt: 135, maxSpeedKt: 620, pitchRateDeg: 36, pitchAccelDeg: 340,
    fuelKg: 1300, burnFullKgS: 3,
    sprite: 'rafale_body', pivot: [236, 128], nozzle: [36, 106], flameLength: 250, flameWidth: 28,
    hitRadiusM: 5, hitCenterUpM: 2.3, airframeHp: 100,
    gun: { name: 'GIAT 30M791', rps: 40, muzzleMs: 1025, dragK: 0.0003, spreadMrad: 4, dmg: 7, rounds: 125, port: [330, 104], tracerEvery: 3 },
    ai: {
      reactionS: 0.26, aimErrDeg: 0.9, fireConeDeg: 2.5, fireRangeM: 900, burstGapS: [0.5, 1.1],
      reactionS: 0.22, aimErrDeg: 0.75, fireConeDeg: 2.5, fireRangeM: 900, burstGapS: [0.45, 1],
      banditDmgMult: 0.12, overshootPerS: 1, overshootRangeM: 750, jinkAltM: 290, jinkEveryS: [0.8, 1.7],
      speedReadS: 1.9, pitchGain: 4.3, throttleLagS: 0.8, yoyoPerS: 0.45, speedJinkChance: 0.6, jinkVsMs: 115,
    },
    aam: { type: 'mica', count: 2 },
    breakup: { sizePx: [464, 144] },
  },
  // 1965 (owner 2026-11-22; owner's art, tools/make_aircraft_sprites.py gnat / hunter).
  // No afterburner on either. Slower than the MiG-21 and fly worse.
  {
    ...COMMON,
    id: 'gnat', eras: ['1965'],
    name: 'Gnat',
    difficulty: 'EASY',
    note: 'Tiny and light, but slow and poorly flown.',
    massKg: 3500, maxThrustN: 20000, afterburnerN: 0, dragCoef: 0.52,
    stallKt: 115, rotateKt: 130, maxSpeedKt: 450, pitchRateDeg: 24, pitchAccelDeg: 220,
    fuelKg: 600, burnFullKgS: 1.8,
    sprite: 'gnat_body', pivot: [140, 58], nozzle: [14, 49], flameLength: 70, flameWidth: 12,
    hitRadiusM: 3.4, hitCenterUpM: 1.3, airframeHp: 45,
    breakup: { sizePx: [280, 65] },
    gun: { name: 'ADEN 30MM', rps: 22, muzzleMs: 790, dragK: 0.0004, spreadMrad: 9, dmg: 5, rounds: 115, port: [210, 52], tracerEvery: 3 },
    ai: {
      reactionS: 0.85, aimErrDeg: 3, fireConeDeg: 1.5, fireRangeM: 550, burstGapS: [1.6, 3],
      banditDmgMult: 0.06, overshootPerS: 0.1, jinkAltM: 90, jinkEveryS: [3, 5], speedReadS: 3.6, pitchGain: 2.3,
    },
  },
  {
    ...COMMON,
    id: 'hunter', eras: ['1965'],
    name: 'Hunter',
    difficulty: 'MEDIUM',
    note: 'Sturdy, with four 30 mm cannon. Hits hard.',
    massKg: 8000, maxThrustN: 40000, afterburnerN: 0, dragCoef: 0.78,
    stallKt: 120, rotateKt: 135, maxSpeedKt: 470, pitchRateDeg: 24, pitchAccelDeg: 220,
    fuelKg: 1200, burnFullKgS: 2.6,
    sprite: 'hunter_body', pivot: [208, 92], nozzle: [6, 74], flameLength: 100, flameWidth: 18,
    hitRadiusM: 4.6, hitCenterUpM: 2.3, airframeHp: 85,
    breakup: { sizePx: [416, 103] },
    gun: { name: 'ADEN 30MM X4', rps: 40, muzzleMs: 790, dragK: 0.0004, spreadMrad: 7, dmg: 5, rounds: 150, port: [350, 88], tracerEvery: 3 },
    ai: {
      reactionS: 0.7, aimErrDeg: 2.4, fireConeDeg: 1.7, fireRangeM: 600, burstGapS: [1.3, 2.6],
      banditDmgMult: 0.07, overshootPerS: 0.15, jinkAltM: 100, jinkEveryS: [2.8, 4.6], speedReadS: 3.4, pitchGain: 2.4,
    },
  },
];

const RANK = { EASY: 0, MEDIUM: 1, HARD: 2 };
// The opponent as flown in that era (byEra merged in).
export const opponentFor = (o, era = 'modern') => ({ ...o, ...(o.byEra?.[era === '1965' ? 1965 : 'modern'] || {}) });
// The era's opponents, easy first.
export const opponentsOf = (era = 'modern') => OPPONENTS.filter((o) => (o.eras || ['modern']).includes(era === '1965' ? '1965' : 'modern'))
  .map((o) => opponentFor(o, era)).sort((a, b) => RANK[a.difficulty] - RANK[b.difficulty]);
export const opponentById = (id, era = 'modern') => {
  const l = opponentsOf(era);
  return l.find((o) => o.id === id) || l[0];
};
