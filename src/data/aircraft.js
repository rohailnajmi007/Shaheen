// Aircraft data, ported from the Godot project's .tres files.
// Physics in SI units. Sprite numbers are texture pixels (nose points right).

// Going supersonic (owner 2026-11-21): a sonic boom when Mach 1 is crossed (again only
// after dropping below resetBelow), the vapour cone from coneFrom, strongest at conePeak,
// gone by coneTo; above muffleFrom every sound but the boom (engine, wind, guns...) is
// muffled to muffleHz at muffleGain. boom: loudness and the gap of the double boom.
export const SONIC = { boomAt: 1, resetBelow: 0.96, coneFrom: 0.92, conePeak: 0.995, coneTo: 1.05, coneAlpha: 0.75,
  muffleFrom: 1, muffleHz: 260, muffleGain: 0.35, boom: { vol: 2.2, gapMs: 130 } };

export const COMMON = {
  thrustZeroSpeedKt: 0,
  speedResponse: 1.2,
  engineSpoolS: 4,
  hasPropeller: false,
  afterburnerN: 0,
  afterburnerThreshold: 0.85,
  afterburnerBurnMult: 3,
  // Ram air (owner 2026-11-21: every fighter can go supersonic, each at its own rate):
  // in afterburner the thrust grows through the transonic range: x (1 + ramGain * A/B * k),
  // k rising smoothly from 0 at ramMach[0] to 1 at ramMach[1] (subsonic feel unchanged).
  ramGain: 1.1, ramMach: [0.72, 1.0],
  idleBurnFraction: 0.12,
  lowFuelFraction: 0.15,
  inducedDrag: 2,
  pitchRateDrag: 0.05,
  stallAoaDeg: 18,
  // Past stallAoaDeg the wing holds full lift (buffet, no stall) for this many more
  // degrees; only beyond that it stalls (owner 2026-11-21: stalling was far too easy).
  stallMarginDeg: 8,
  zeroAoaLift: 0.1,
  postStallLift: 0.35,
  minStallTimeS: 1,
  flapLift: [0, 0.12, 0.25],
  flapDrag: [0, 0.1, 0.25],
  flapMoveS: 1,
  defaultFlap: 1,
  retractableGear: true,
  gearDrag: 0.15,
  gearTransitS: 3,
  airbrakeDrag: 1.2,
  pitchRateDeg: 30,
  pitchAccelDeg: 300,
  rotateStartFraction: 0.7,
  autoRotateDeg: 4,
  noseDownFraction: 0.75,
  derotateDeg: 5,
  maxGroundPitchDeg: 12,
  tailStrikeDeg: 15,
  rollingFriction: 0.02,
  brakeStrength: 1.2,
  perfectFpm: 120,
  goodFpm: 250,
  firmFpm: 400,
  hardFpm: 900,
  bounceFromFpm: 400,
  bounceMinM: 0.2,
  bounceMaxM: 0.6,
  maxNoseDownTouchdownDeg: 1,
  noseFirstCrashDeg: 5,
  overrunCrashKt: 40,
  serviceCeilingM: 6000,
  ceilingFadeM: 2000,
  elevatorMaxDeg: 20,
  elevatorSpeed: 6,
  // Cockpit panel: 'analog' (grey, round dials), 'darkAnalog' (Mirage), 'glass' (F-16 green MFDs),
  // 'colorGlass' (JF-17: colour PFD with horizon, engine page).
  cockpitStyle: 'analog',
  gaugeVsiMaxFpm: 6000,
  gEffects: true,
  gEffectMinKt: 250,
  blackoutStartG: 7, // owner 2026-11-21: was 5/9 and -1.5/-4, came on too easily
  blackoutFullG: 11,
  redoutStartG: -2.5,
  redoutFullG: -5.5,
  // Instructor lines (owner 2026-11-20): 'full' coaching (trainer) or 'minimal'
  // (fighters: urgent lines only: stall, pull up, gear, SAM, hits, results).
  instructorLines: 'minimal',
  // Missions this jet flies (owner 2026-11-21): 'ferry', 'strike' (air to ground),
  // 'dogfight' (air to air). Cards for the others are shown greyed out.
  modes: ['ferry', 'strike', 'dogfight'],
  // Weapons
  strikeCapable: false,
  bombCount: 0,
  bombDrag: 0.0002,
  bombEjectMs: 2,
  blastRadiusM: 18,
  bombGuided: false,
  guidanceReachM: 250,
  guidanceAccel: 15,
  bombScatterMs: 0,
  weaponIsMissile: false,
  // Weight of the stores (owner 2026-11-21: loaded = heftier, lighter and more agile as
  // they go): each weapon weighs storeMassKg; fully loaded the pitch rate is down by
  // pitchLoss and drag up by dragAdd (both shrink with each weapon gone). The extra
  // mass also raises the stall speed a little (lift is sized for the empty jet).
  storeMassKg: 0,
  stores: { pitchLoss: 0.15, dragAdd: 0.12 },
  // Gun (air to ground): null = none. rps rounds/s, muzzleMs m/s, dragK air drag
  // (decel = dragK * v^2), spreadMrad dispersion, dmg per round (src/data/combat.js hp),
  // port = muzzle on the sprite (texture px), tracerEvery = one tracer in N rounds.
  gun: null,
  // Countermeasure cartridges, flares and chaff together (src/data/combat.js COUNTERMEASURES).
  countermeasures: 0,
  // Damage: hit points, and the hit circle (m) centred hitCenterUpM above the wheels.
  airframeHp: 100,
  hitRadiusM: 5,
  hitCenterUpM: 2.5,
  // Stores drawn under the jet: one per hardpoint, so at most hardpoints.length show
  // even when bombCount is larger (owner: 4 carried, 2 drawn).
  // Strike mission: first ground target this far (m) from the departure threshold.
  strikeAreaStartM: 6000, // owner 2026-11-21: 8000 too far (was 4500 before that: too soon)
  // Missile lock: only airborne with the gear up; the seeker needs lockS seconds on a
  // target between rangeMin and rangeMax ahead before it reads LOCKED.
  missile: { rangeMin: 500, rangeMax: 4000, lockS: 1.5, dropS: 0.35, burnS: 8, speed: 420, accel: 140, turnDeg: 35, loft: 0.25, loftMax: 250 },
  // Sprite: 1 texture px = 1/16 m (the art is drawn about 2x true size so it reads well).
  texM: 1 / 16,
  gearX: null, gearTopY: null, gearWheel: null,
  // Moving foreplane layer (J-10C canards): sprite, hinge (texture px), max deflection.
  canardSprite: null, canardHinge: null, canardMaxDeg: 15,
  sound: 'jet',
  // Smoky engine trail (renderer): kind 'smoke' grey / 'dark' black, puffs per frame and
  // chance each, size (m), life (s), alpha, grow, from this throttle, dryOnly = not in afterburner.
  engineSmoke: null,
  // Display smoke (aerobatic trainer, owner 2026-11-21): Space switches it on and off in
  // ferry flights; each time it comes on it takes the next colour. null = none.
  smoke: null,
  // Gear layer drawn in front of the body while fully down (F-7PG: the main wheel
  // stands in front of the stores); behind it while moving, so it hides as it retracts.
  gearFrontWhenDown: false,
};

// Start-screen order (owner 2026-11-21): trainers (Mushshak, K-8), then F-7PG, Mirage V, JF-17, F-16A, F-16D, J-10C.
export const AIRCRAFT = [
  {
    ...COMMON,
    id: 'mushshak',
    modes: ['ferry'],
    name: 'Super Mushshak',
    role: 'Trainer',
    rank: 'AVN CDT', rankCall: 'Cadet', rankFull: 'Aviation Cadet', rankBadge: 'white', homeBase: 'risalpur',
    instructorLines: 'full',
    stats: { speed: 0.25, agility: 0.55, difficulty: 0.15 },
    massKg: 1100, maxThrustN: 8400, thrustZeroSpeedKt: 215, speedResponse: 1.4,
    engineSpoolS: 1.5, hasPropeller: true, sound: 'prop',
    fuelKg: 90, burnFullKgS: 0.25, idleBurnFraction: 0.15,
    dragCoef: 0.7, pitchRateDrag: 0.35,
    stallKt: 55, stallAoaDeg: 15, zeroAoaLift: 0.25, postStallLift: 0.45,
    flapLift: [0, 0.2, 0.45], flapDrag: [0, 0.25, 0.7], flapMoveS: 1.2,
    gearDrag: 0.25, pitchRateDeg: 25, pitchAccelDeg: 150, rotateKt: 60,
    rollingFriction: 0.03, brakeStrength: 0.9,
    perfectFpm: 150, goodFpm: 300, firmFpm: 500, hardFpm: 1000,
    bounceFromFpm: 500, bounceMinM: 0.3, bounceMaxM: 1.2, maxNoseDownTouchdownDeg: 2,
    overrunCrashKt: 30, maxSpeedKt: 160, serviceCeilingM: 3000, ceilingFadeM: 1000,
    gEffects: false, cockpitStyle: 'analog', gaugeVsiMaxFpm: 2000,
    sprite: 'super_mushshak_body', gearSprite: 'super_mushshak_gear', gearTravel: 26,
    propSprite: 'super_mushshak_prop', propCenter: [272, 57], propRadius: 34,
    pivot: [172, 105],
    lights: { navNear: [152, 41], navFar: [142, 38], tail: [5, 46], beacon: [14, 4], landing: [240, 82] },
  },
  {
    ...COMMON,
    id: 'k8',
    modes: ['ferry'],
    // Owner 2026-11-21: jet trainer at Risalpur, more powerful than the Mushshak, well
    // below the fighters; no afterburner; aerobatic display smoke on Space.
    name: 'K-8 Karakoram',
    role: 'Jet trainer',
    rank: 'AVN CDT', rankCall: 'Cadet', rankFull: 'Aviation Cadet', rankBadge: 'white', homeBase: 'risalpur',
    instructorLines: 'full',
    stats: { speed: 0.55, agility: 0.7, difficulty: 0.4 },
    // Small turbofan trainer: T/W about 0.43, top speed about 430 kt, stall about 95 kt.
    massKg: 3800, maxThrustN: 16000, engineSpoolS: 3,
    fuelKg: 450, burnFullKgS: 0.55, dragCoef: 0.31,
    stallKt: 95, rotateKt: 112, maxSpeedKt: 450, pitchRateDeg: 30, pitchAccelDeg: 240,
    cockpitStyle: 'analog', gaugeVsiMaxFpm: 6000,
    // Owner's art (tools/make_aircraft_sprites.py "k8"): gear layer, all-moving tailplane.
    sprite: 'k8_body', gearSprite: 'k8_gear', gearTravel: 30,
    elevatorSprite: 'k8_elevator', elevatorHinge: [24, 80],
    pivot: [143, 150], nozzle: [5, 93], flameLength: 0, flameWidth: 14,
    smoke: { colors: [[40, 170, 70], [245, 245, 245], [225, 50, 40], [50, 110, 230]], perS: 120, size: 3.2, life: 6, grow: 3.5, alpha: 0.9 },
    lights: { navNear: [121, 125], navFar: [115, 123], tail: [1, 80], beacon: [20, 7], landing: [290, 125] },
  },
  {
    ...COMMON,
    id: 'f7pg',
    modes: ['ferry', 'dogfight'],
    // Owner 2026-11-21: air superiority, air to air only (and ferry); light; thrust
    // below the JF-17, about the Mirage's; brittle in a fight (fewer hit points).
    airCombat: { maxThrustN: 46000, afterburnerN: 31000, pitchRateDeg: 32, pitchAccelDeg: 300, stallMarginDeg: 12 }, // T/W 1.03

    name: 'F-7PG Skybolt',
    role: 'Air superiority fighter',
    // Rank and home base: my picks (owner did not say). Real F-7PGs fly from Rafiqui,
    // not in the game yet, so Mushaf for now.
    rank: 'FLT LT', rankCall: 'Flight Lieutenant', rankFull: 'Flight Lieutenant', rankBadge: 'white', homeBase: 'mushaf',
    stats: { speed: 0.88, agility: 0.85, difficulty: 0.75 },
    // MiG-21 family: small and light, a delta with a high landing speed.
    massKg: 7600, maxThrustN: 44000, afterburnerN: 30000,
    fuelKg: 900, burnFullKgS: 2.4, dragCoef: 0.93,
    stallKt: 136, rotateKt: 158, maxSpeedKt: 900, cockpitStyle: 'darkAnalog',
    airframeHp: 65, hitRadiusM: 4.6, hitCenterUpM: 2.2,
    // Owner's art (tools/make_aircraft_sprites.py "f7pg"): gear layer, all-moving tailplane.
    sprite: 'f7pg_body', gearSprite: 'f7pg_gear', gearTravel: 31, gearFrontWhenDown: true,
    elevatorSprite: 'f7pg_elevator', elevatorHinge: [67, 75],
    pivot: [185, 122], nozzle: [43, 76], flameLength: 220, flameWidth: 24,
    strikeCapable: false,
    gun: { name: '2 x TYPE 30-1 30MM', rps: 40, muzzleMs: 780, dragK: 0.0003, spreadMrad: 5, dmg: 7, rounds: 200, port: [310, 89], tracerEvery: 4 },
    countermeasures: 16,
    lights: { navNear: [134, 84], navFar: [128, 82], tail: [41, 53], beacon: [172, 45], landing: [331, 95] },
  },
  {
    ...COMMON,
    id: 'mirage5',
    modes: ['ferry', 'strike'],
    engineSmoke: { kind: 'smoke', perFrame: 1, chance: 0.6, size: 1.6, life: 1.6, alpha: 0.18, grow: 3, minThrottle: 0.5, dryOnly: true },
    // Air to air only (owner 2026-11-21): power (thrust/weight) Mirage < JF-17 < F-16A <
    // F-16D = J-10C; J-10C and F-16s lightest and most agile, JF-17 a bit less, Mirage sluggish.
    airCombat: { maxThrustN: 60000, afterburnerN: 38000, pitchRateDeg: 23, pitchAccelDeg: 160 }, // T/W 1.00

    name: 'Mirage V',
    role: 'Strike fighter',
    rank: 'FLT LT', rankCall: 'Flight Lieutenant', rankFull: 'Flight Lieutenant', rankBadge: 'white', homeBase: 'masroor',
    stats: { speed: 0.85, agility: 0.6, difficulty: 0.8 },
    massKg: 10000, maxThrustN: 58000, afterburnerN: 34000,
    fuelKg: 1000, burnFullKgS: 2.6, dragCoef: 1.15,
    stallKt: 140, rotateKt: 160, maxSpeedKt: 900, cockpitStyle: 'darkAnalog',
    sprite: 'mirage5_body', gearSprite: 'mirage5_gear', gearTravel: 48,
    pivot: [170, 159], nozzle: [16, 89], flameLength: 190, flameWidth: 26,
    strikeCapable: true, bombCount: 4, hardpoints: [[150, 140], [205, 140]],
    weaponSprite: 'mk82_body', weaponName: 'MK 82', weaponLabel: 'Unguided bomb', storeMassKg: 240,
    bombScatterMs: 2.5, blastRadiusM: 26,
    gun: { name: '2 x DEFA 552 30MM', rps: 40, muzzleMs: 815, dragK: 0.0003, spreadMrad: 5, dmg: 7, rounds: 250, port: [300, 118], tracerEvery: 4 },
    countermeasures: 16,
    lights: { navNear: [79, 104], navFar: [94, 101], tail: [16, 64], beacon: [6, 3], landing: [328, 131] },
  },
  {
    ...COMMON,
    id: 'jf17',
    // RD-93: famously smoky (owner 2026-11-21): a thin black trail, noticeable, not heavy.
    // JF-17 (owner 2026-11-21): faint, thick at the nozzle and thinning out behind (grow < 1 shrinks).
    engineSmoke: { kind: 'dark', perFrame: 3, chance: 1, size: 3, life: 1.8, alpha: 0.14, grow: 0.55, minThrottle: 0.3, dryOnly: false },
    airCombat: { maxThrustN: 68000, afterburnerN: 45400, pitchRateDeg: 30, pitchAccelDeg: 280 }, // T/W 1.07

    name: 'JF-17 Thunder',
    role: 'Multirole fighter',
    rank: 'SQN LDR', rankCall: 'Squadron Leader', rankFull: 'Squadron Leader', rankBadge: 'blue', homeBase: 'masroor',
    stats: { speed: 0.92, agility: 0.8, difficulty: 0.72 },
    // Between the Mirage V and the F-16 (owner): better thrust-to-weight and lower
    // stall/rotate speeds than the Mirage, less thrust than the F-16.
    massKg: 10800, maxThrustN: 66000, afterburnerN: 43000,
    fuelKg: 1100, burnFullKgS: 2.8, dragCoef: 1.3,
    stallKt: 132, rotateKt: 152, maxSpeedKt: 900, cockpitStyle: 'glass',
    // Owner's art (tools/make_aircraft_sprites.py "jf17"): gear layer, all-moving tailplane.
    sprite: 'jf17_body', gearSprite: 'jf17_gear', gearTravel: 29,
    elevatorSprite: 'jf17_elevator', elevatorHinge: [55, 124],
    pivot: [160, 170], nozzle: [7, 107], flameLength: 250, flameWidth: 28,
    // Ra'ad (Hatf-VIII) air-launched cruise missile (owner, 2026-11-19): drops clear,
    // turbojet starts, cruises low and level, dives onto the target. Long range, so
    // the targets start further out. Two carried (near and far wing).
    strikeCapable: true, bombCount: 2, hardpoints: [[236, 132], [244, 136]],
    weaponSprite: 'raad_body', weaponName: "RA'AD", weaponLabel: 'Cruise missile', storeMassKg: 550,
    weaponIsMissile: true, bombGuided: true,
    strikeAreaStartM: 11000, // owner 2026-11-21: 15000 too far
    gun: { name: 'GSH-23 23MM', rps: 55, muzzleMs: 715, dragK: 0.0004, spreadMrad: 5, dmg: 4, rounds: 220, port: [318, 128], tracerEvery: 4 },
    countermeasures: 24,
    missile: { rangeMin: 1500, rangeMax: 8000, lockS: 2, dropS: 0.9, burnS: 60, speed: 240, accel: 50, turnDeg: 18,
      loft: 0, loftMax: 0, cruiseAltM: 60, diveM: 900, flame: 0.4, trail: 0.25 },
    lights: { navNear: [177, 119], navFar: [198, 115], tail: [20, 75], beacon: [41, 3], landing: [328, 143] },
  },
  {
    ...COMMON,
    id: 'f16a',
    airCombat: { maxThrustN: 76000, afterburnerN: 56000, pitchRateDeg: 35, pitchAccelDeg: 360, stallMarginDeg: 11 }, // T/W 1.12

    name: 'F-16A Fighting Falcon',
    role: 'Multirole fighter',
    rank: 'SQN LDR', rankCall: 'Squadron Leader', rankFull: 'Squadron Leader', rankBadge: 'blue', homeBase: 'mushaf',
    stats: { speed: 1, agility: 0.9, difficulty: 0.7 },
    massKg: 12000, maxThrustN: 76000, afterburnerN: 53000,
    fuelKg: 1200, burnFullKgS: 3, dragCoef: 1.42,
    stallKt: 125, rotateKt: 145, maxSpeedKt: 900, cockpitStyle: 'glass',
    sprite: 'f16a_body', elevatorSprite: 'f16a_elevator', elevatorHinge: [55, 114],
    gearX: [202, 292], gearTopY: [148, 147], gearWheel: [20, 16],
    pivot: [202, 183], nozzle: [7, 102], flameLength: 320, flameWidth: 30,
    strikeCapable: true, bombCount: 4, hardpoints: [[182, 152], [226, 154]],
    weaponSprite: 'gbu12_body', weaponName: 'GBU-12 PAVEWAY II', weaponLabel: 'Laser guided bomb', storeMassKg: 230,
    bombGuided: true,
    gun: { name: 'M61A1 20MM', rps: 100, muzzleMs: 1050, dragK: 0.00036, spreadMrad: 4, dmg: 3, rounds: 510, port: [312, 95], tracerEvery: 5 },
    countermeasures: 30,
    lights: { navNear: [262, 128], navFar: [248, 122], tail: [23, 72], beacon: [16, 4], landing: [298, 164] },
  },
  {
    ...COMMON,
    id: 'f16d',
    airCombat: { maxThrustN: 80000, afterburnerN: 60400, pitchRateDeg: 35, pitchAccelDeg: 360, stallMarginDeg: 11 }, // T/W 1.19

    name: 'F-16D Fighting Falcon',
    role: 'Multirole fighter',
    rank: 'WG CDR', rankCall: 'Wing Commander', rankFull: 'Wing Commander', rankBadge: 'red', homeBase: 'shahbaz',
    stats: { speed: 1, agility: 0.9, difficulty: 0.7 },
    massKg: 12000, maxThrustN: 76000, afterburnerN: 53000,
    fuelKg: 1200, burnFullKgS: 3, dragCoef: 1.42,
    stallKt: 125, rotateKt: 145, maxSpeedKt: 900, cockpitStyle: 'colorGlass',
    sprite: 'f16_body', elevatorSprite: 'f16_elevator', elevatorHinge: [58, 113],
    gearSprite: 'f16_gear', gearTravel: 33,
    pivot: [169, 175], nozzle: [6, 101], flameLength: 320, flameWidth: 30,
    strikeCapable: true, bombCount: 4, hardpoints: [[192, 128], [206, 134]],
    weaponSprite: 'agm88_body', weaponName: 'AGM-88 HARM', weaponLabel: 'Air to ground missile', storeMassKg: 360,
    weaponIsMissile: true, bombGuided: true,
    // Targets further out than for bombs, so the HARM locks well after take-off.
    strikeAreaStartM: 9000, // owner 2026-11-21: 12000 too far
    gun: { name: 'M61A1 20MM', rps: 100, muzzleMs: 1050, dragK: 0.00036, spreadMrad: 4, dmg: 3, rounds: 510, port: [300, 100], tracerEvery: 5 },
    countermeasures: 30,
    lights: { navNear: [239, 116], navFar: [229, 112], tail: [10, 72], beacon: [16, 4], landing: [291, 153] },
  },
  {
    ...COMMON,
    id: 'j10c',
    modes: ['ferry', 'dogfight'],
    airCombat: { maxThrustN: 84000, afterburnerN: 62250, pitchRateDeg: 35, pitchAccelDeg: 360, stallMarginDeg: 11 }, // T/W 1.19 (= F-16D)

    name: 'J-10C Vigorous Dragon',
    role: 'Air superiority fighter', // owner 2026-11-21
    // Rank: my pick (owner did not say). Home: Kamra (owner 2026-11-21).
    rank: 'WG CDR', rankCall: 'Wing Commander', rankFull: 'Wing Commander', rankBadge: 'red', homeBase: 'kamra',
    stats: { speed: 1, agility: 0.95, difficulty: 0.7 },
    // Delta-canard, AL-31-class engine: F-16-like thrust, a little heavier, lower stall.
    massKg: 12500, maxThrustN: 78000, afterburnerN: 58000,
    fuelKg: 1250, burnFullKgS: 3, dragCoef: 1.4,
    stallKt: 120, rotateKt: 142, maxSpeedKt: 900, cockpitStyle: 'colorGlass',
    // Owner's art (tools/make_aircraft_sprites.py "j10c"): gear up in the art, drawn in
    // code; the canards are their own layer and move with the stick (canardMaxDeg).
    sprite: 'j10c_body', canardSprite: 'j10c_canard', canardHinge: [290, 106], canardMaxDeg: 18,
    gearX: [206, 340], gearTopY: [136, 130], gearWheel: [20, 16],
    pivot: [206, 178], nozzle: [8, 114], flameLength: 320, flameWidth: 30,
    // Air to ground: not yet (owner to pick its weapon). The PL-15 under the wing is part of the art.
    strikeCapable: false,
    gun: { name: 'GSH-23 23MM', rps: 55, muzzleMs: 715, dragK: 0.0004, spreadMrad: 5, dmg: 4, rounds: 200, port: [330, 122], tracerEvery: 4 },
    countermeasures: 30,
    lights: { navNear: [183, 121], navFar: [197, 118], tail: [21, 81], beacon: [24, 2], landing: [340, 135] },
  },
];

export const aircraftById = (id) => AIRCRAFT.find((a) => a.id === id) || AIRCRAFT[0];
