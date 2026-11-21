// Air-to-air opponents (owner 2026-11-21): the bandits you fight in the air-to-air
// mission, one type per mission = the difficulty. MiG-21 worst, Su-30 middle,
// Rafale best: flight performance, toughness, gun and how well it flies (ai = overrides
// of DOGFIGHT in src/data/combat.js). Art: tools/make_aircraft_sprites.py (mig21,
// su30, rafale), owner's pictures in docs/reference/*_opponent_source.png.
// Sprite numbers are texture px (nose right), like src/data/aircraft.js.
import { COMMON } from './aircraft.js';

export const OPPONENTS = [
  {
    ...COMMON,
    id: 'mig21',
    name: 'MiG-21',
    difficulty: 'EASY',
    note: 'Old and slow to react. Turns badly, shoots wild.',
    massKg: 8000, maxThrustN: 42000, afterburnerN: 26000, dragCoef: 1.15,
    stallKt: 150, rotateKt: 165, maxSpeedKt: 560, pitchRateDeg: 22, pitchAccelDeg: 200,
    fuelKg: 900, burnFullKgS: 2.6,
    sprite: 'mig21_body', pivot: [236, 112], nozzle: [40, 86], flameLength: 200, flameWidth: 24,
    hitRadiusM: 5, hitCenterUpM: 2.2, airframeHp: 70,
    gun: { name: 'GSH-23', rps: 55, muzzleMs: 715, dragK: 0.0004, spreadMrad: 7, dmg: 4, rounds: 200, port: [330, 96], tracerEvery: 4 },
    ai: {
      reactionS: 0.6, aimErrDeg: 2.1, fireConeDeg: 1.8, fireRangeM: 650, burstGapS: [1.2, 2.4],
      banditDmgMult: 0.07, overshootPerS: 0.2, jinkAltM: 110, jinkEveryS: [2.4, 4.2], speedReadS: 3.2, pitchGain: 2.6,
    },
  },
  {
    ...COMMON,
    id: 'su30',
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
      reactionS: 0.4, aimErrDeg: 1.3, fireConeDeg: 2.2, fireRangeM: 800, burstGapS: [0.8, 1.6],
      banditDmgMult: 0.09, overshootPerS: 0.4, jinkAltM: 160, speedReadS: 2.5,
    },
  },
  {
    ...COMMON,
    id: 'rafale',
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
      banditDmgMult: 0.12, overshootPerS: 0.6, jinkAltM: 200, jinkEveryS: [1.2, 2.4], speedReadS: 1.9, pitchGain: 4,
      throttleLagS: 0.8,
    },
  },
];

export const opponentById = (id) => OPPONENTS.find((o) => o.id === id) || OPPONENTS[0];
