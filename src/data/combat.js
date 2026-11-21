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
  engineBelow: 45,    // hp: ENGINE DAMAGE warning
  // Battle damage takes performance away gradually (owner 2026-11-21, you and bandits):
  // at 0 hp left the engine gives thrustAtZero and the jet pitches at controlAtZero.
  thrustAtZero: 0.5,
  controlAtZero: 0.55,
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

// Air to air (owner 2026-11-21): guns only. Take off as usual; past fightStartM the
// bandits come one at a time (2-3, all of the type picked on the start screen:
// src/data/opponents.js, whose `ai` blocks override the numbers below). Both jets fly
// right. Dodge his bursts by climbing, diving, or changing speed so he overshoots.
// When the fight is over the landing base appears recoveryGapM ahead. Missiles later.
// Air-to-air missiles (owner 2026-11-21: within visual range, Space to fire after a lock).
// Lock: keep the bandit inside coneDeg of your nose, between rangeM[0] and rangeM[1], for
// lockS seconds (the box closes in, the growl turns to a steady tone). Launch: 'rail' =
// motor lights on the rail; 'drop' = ejected clear, falls dropS, then the motor lights.
// Flight: +speedMs over the launch speed (accel m/s2) while the motor burns (burnS), then
// it slows by dragMs2; it turns at most turnDegS toward the intercept point; proximity
// fuse fuseM; dmg against the bandit's hit points; flareChance: the bandit's flares (IR)
// or chaff and notching (radar) pull it off; it self-destructs after lifeS.
export const AAMS = {
  aim9: { name: 'AIM-9M SIDEWINDER', short: 'AIM-9M', fox: 'FOX TWO', sprite: 'aim9_body', launch: 'rail',
    rangeM: [300, 2800], coneDeg: 22, lockS: 0.9, dropS: 0, speedMs: 620, accel: 420, burnS: 2.2, dragMs2: 70,
    turnDegS: 42, fuseM: 9, dmg: 90, flareChance: 0.3, lifeS: 9, smoke: 0.9 },
  aim120: { name: 'AIM-120 AMRAAM', short: 'AIM-120', fox: 'FOX THREE', sprite: 'aim120_body', launch: 'drop',
    rangeM: [500, 4000], coneDeg: 30, lockS: 1.4, dropS: 0.45, speedMs: 800, accel: 330, burnS: 3.5, dragMs2: 55,
    turnDegS: 32, fuseM: 12, dmg: 115, flareChance: 0.15, lifeS: 11, smoke: 1 },
  pl15: { name: 'PL-15', short: 'PL-15', fox: 'FOX THREE', sprite: 'pl15_body', launch: 'drop',
    rangeM: [500, 4000], coneDeg: 30, lockS: 1.5, dropS: 0.5, speedMs: 850, accel: 340, burnS: 4, dragMs2: 55,
    turnDegS: 30, fuseM: 12, dmg: 125, flareChance: 0.15, lifeS: 12, smoke: 1 },
};

export const DOGFIGHT = {
  bandits: [2, 3],         // bandits per mission (random in this range), one after another
  fightStartM: 4000,       // the first one comes once you're this far from your home base (owner 2026-11-21: 4 km max; was 9)
  nextBanditS: 7,          // the next one comes this long after the last one went
  spawnGapM: [450, 750],   // a bandit starts this far ahead of or behind you
  spawnAltM: [-60, 120],   // ... this much higher than you
  spawnMinAltM: 450,       // ... but at least this high
  spawnMinKt: 380,         // ... at your speed, at least this
  recoveryGapM: 4000,      // landing base this far ahead of you when the fight is over (owner 2026-11-21: max 4 km)
  burnScale: 0.5,          // fuel burn x this on this mission (afterburner fights empty the tanks)
  hitRadiusMult: 2.4,      // jets' hit circles x this (rounds vs jets, both ways): the jets are drawn
                           // bigger than life when zoomed out, so a visual hit should count
  banditAmmoMult: 1.5,     // bandit rounds = its gun's rounds x this
  banditDmgMult: 0.12,     // his rounds hurt you this much x the gun's dmg...
  playerDmgMult: 0.8,      // ... and yours hurt him this much (a kill takes a few good bursts)
  playerAmmoMult: 2.5,     // your gun carries this many times its rounds (2-3 bandits per load)
  holdFireS: 3,            // a new bandit doesn't shoot in its first seconds
  // Bandit AI.
  reactionS: 0.35,         // aims at where you were this long ago (dodging works)
  aimErrDeg: 1.3,          // slow wandering aim error
  fireConeDeg: 2.2,        // fires when its nose is this close to the aim point...
  fireRangeM: 800,         // ... and you are this close
  burstS: [0.35, 0.8],     // burst length
  burstGapS: [0.7, 1.6],   // pause between bursts
  aoaLimit: 0.8,           // it pulls at most this share of the stall angle of attack
  pitchGain: 3.5,          // pitch-rate wanted per radian of pitch error (1/s)
  chaseGapM: 160,          // when chasing, it wants to sit this far behind you
  throttleLagS: 1.1,       // its throttle follows what it wants this slowly (so it can overshoot)
  chaseBrakeMs: 80,        // uses the air brake only when closing faster than this
  speedReadS: 2.5,         // it notices your speed changes this late
  waitGapM: 1300,          // in front of you and further ahead than this: it eases off
  jinkAltM: 170,           // when you're behind it: climbs/dives up to this much...
  jinkEveryS: [1.6, 3.2],  // ... changing its mind this often
  jinkBaseMinM: 500,       // ... around halfway between its height and yours, at least this
  overshootPerS: 0.45,     // chance per s it chops throttle + air brake while you're close behind
  overshootS: [1.4, 2.6],
  overshootRangeM: 550,
  floorM: 160,             // it pulls up below this
  ceilingM: 3200,          // ... and noses down above this
  catchUpM: 1100,          // further apart than this: it gets extra thrust to close up
  catchUpThrust: 1.3,
  // Rules.
  maxFallS: 40,            // a shot-down bandit is dropped after falling this long
  noAmmoEndS: 5,           // your gun empty this long: fight over, he leaves, you go home
  fleeGoneM: 3500,         // ... gone once this far away
  outOfRangeM: 4000,       // further apart than this for outOfRangeS: he got away (next one comes)
  outOfRangeS: 12,
};
