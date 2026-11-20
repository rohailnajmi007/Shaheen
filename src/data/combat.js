// Air-to-ground mission: ground units, air defences, countermeasures (owner, 2026-11-19).
// All tunable numbers for src/sim/combat.js live here. Distances in m, times in s.

// Ground units. w/h = drawn size in m (src/render/scenery.js draws them this size and
// rounds hit this box). hp = damage points against gun rounds; armour = share of gun
// damage that gets through (bombs and missiles destroy anything in their blast).
// role: 'objective' (mission target) or 'aaa' / 'sam' (air defence, shoots back).
export const GROUND_UNITS = {
  satcom: { label: 'SATCOM STATION', role: 'objective', w: 18, h: 14, hp: 60, armour: 1 },
  radar: { label: 'RADAR', role: 'objective', w: 14, h: 12, hp: 40, armour: 1 },
  fuel: { label: 'FUEL DEPOT', role: 'objective', w: 26, h: 9, hp: 60, armour: 1 },
  bunker: { label: 'BUNKER', role: 'objective', w: 16, h: 6, hp: 250, armour: 0.08 },
  launcher: { label: 'MISSILE LAUNCHER', role: 'objective', w: 16, h: 7, hp: 70, armour: 0.8 },
  tank: { label: 'TANK', role: 'objective', w: 11, h: 5, hp: 140, armour: 0.2 },
  apc: { label: 'APC', role: 'objective', w: 10, h: 4.5, hp: 80, armour: 0.55 },
  aaa: { label: 'AAA', role: 'aaa', w: 11, h: 5, hp: 35, armour: 0.8 },
  sam: { label: 'SAM', role: 'sam', w: 14, h: 7, hp: 50, armour: 0.8 },
};

// Mission layout.
export const STRIKE = {
  objectives: [4, 5],                 // mission targets: random count in this range
  objectiveKinds: ['satcom', 'radar', 'fuel', 'bunker', 'launcher', 'tank', 'apc'],
  gapM: [450, 850],                   // between mission targets
  aaa: [0, 0],                        // AAA guns near mission targets (owner 2026-11-20: none; code kept)
  aaaOffsetM: [-260, 220],            // ... this far from it
  sams: [1, 2],                       // SAM batteries (one type, owner 2026-11-20)
  samBeforeM: 1200,                   // first SAM this far before the first target
  maxSamLaunches: 1,                  // SAM missiles fired at the jet in the whole run, all sites (owner 2026-11-20)
  recoveryGapM: 4500,                 // landing base this far past the last target
};

// Air defences.
export const AIR_DEFENCE = {
  pastM: 1200,      // they stop engaging once the jet is this far past them
  // Twin 23 mm gun. Shells fly real ballistics (gravity + air drag); the gunner leads
  // the jet (time of flight, gravity drop) and gets more accurate the longer he tracks
  // a steady target: his lead error per burst (1 sigma) shrinks from errStartMrad to
  // errMinMrad over settleS. spreadMrad = shell dispersion (1 sigma).
  // Changing pitch spoils his solution (it assumes the jet keeps its velocity).
  aaa: {
    rangeM: 2300, maxAltM: 1500, muzzleMs: 970, dragK: 0.0007, rps: 24,
    burstS: 1.5, pauseS: 1.8, spreadMrad: 5, errStartMrad: 60, errMinMrad: 30, settleS: 6,
    wanderS: 1.2,   // how fast the aim error drifts
    slewDegS: 35,   // barrel traverse (hand-cranked)
    fireWithinMrad: 40, // fires only with the barrel this close to his lead point
    shellLifeS: 5,  // self-destruct (small black flak puff)
    tracerEvery: 3, dmg: 2,
  },
  // SAM battery (one type, owner 2026-11-20): locks on first (SAM LOCK warning), blind
  // below minAltM (ground clutter). Fires `missiles` (1, owner 2026-11-20) in all, never reloads.
  sam: {
    rangeM: 6000, minAltM: 45, maxAltM: 5500, lockS: 2.5, reloadS: 8, missiles: 1,
    missile: { boostS: 3, boostAcc: 240, maxSpeed: 760, dragK: 0.00022, navN: 4, maxG: 26, lifeS: 15,
      gimbalDeg: 60, fuseM: 14, dmgMax: 75, dmgMin: 30, decoyChance: 0.9 },
  },
};

// Countermeasures: flares and chaff go out together on one key (owner 2026-11-20);
// aircraft carry `countermeasures` salvoes' worth of cartridges (src/data/aircraft.js).
// A decoy alone rarely works (owner): the chance a salvo pulls a missile off is
// decoyChance x geometry, geometry = base + beam x (how square the jet flies across
// the missile's line of sight: 0 flying straight at/away from it, 1 at right angles)
// + g x (how hard it pulls, full at gFull). And a seduced missile whose seeker still
// sees the jet within reacquireDeg of the decoy (jet flying on in line with it)
// re-acquires the jet at reacquirePerS. So: decoys AND break across the missile.
export const COUNTERMEASURES = {
  geomBase: 0.35, beamWeight: 0.5, gWeight: 0.35, gFull: 5, // owner 2026-11-20: was 0.12/0.6, SAMs near impossible
  reacquireDeg: 2.5, reacquirePerS: 1, // was 2.5 reacquireAfterS: 0.6, // ... checked once the decoy is this old
  perPress: 2,      // cartridges per press (a salvo)
  rangeM: 3500,     // a missile further than this from the jet ignores them (too early)
  minRangeM: 120,   // ... closer than this it is too late
  flareLifeS: 3.5, flareDrag: 0.9,  // the decoys a missile can chase
  breaksLock: 0.5,  // chance a salvo breaks a SAM's lock before launch
};

// The jet: damage and how hits show.
export const DAMAGE = {
  smokeBelow: 60,     // hp: trails smoke
  fireBelow: 30,      // hp: on fire
  engineBelow: 45,    // hp: engine damaged, thrust x engineThrust
  engineThrust: 0.7,
  shotDownCrashS: 20, // a shot-down jet that keeps gliding hits the ground after this
};

// Ejection (owner, 2026-11-20): only once the jet is shot down (beyond saving), E.
// The seat fires up out of the jet (seat axis = the jet's "up"), then the chute opens.
export const EJECT = {
  seatMs: 45,         // seat rocket: speed added along the jet's up axis
  seatDrag: 0.004,    // seat + pilot drag (decel = k v^2) before the chute
  chuteAfterS: 1.6,   // chute opens after this
  chuteSinkMs: 6,     // descent under the canopy
  chuteSlow: 1.2,     // how fast the chute kills horizontal speed (1/s)
  minAltM: 0,         // can eject at any height (zero-zero seat)
  resultWaitS: 14,    // the debrief waits at most this long for the pilot to land
};
