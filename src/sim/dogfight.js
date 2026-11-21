// Air to air (owner 2026-11-21): 1 v 1 guns-only dogfight against one bandit of the
// same type. Both jets fly right. Whoever is behind can shoot (guns fire along the
// nose); the one in front dodges by climbing, diving, or changing speed so the
// chaser overshoots and the roles swap. Numbers: DOGFIGHT in src/data/combat.js.
// No DOM: runs in Node tests.
import { Aircraft, KT, G } from './aircraft.js';
import { DOGFIGHT } from '../data/combat.js';
import { shellStep, segDist } from './combat.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;
const D2R = Math.PI / 180;
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class Dogfight {
  constructor(flight) {
    const D = DOGFIGHT;
    this.f = flight;
    const d = flight.data;
    const a = flight.ac;
    const x0 = flight.bases[0].x + flight.bases[0].runwayM + D.homeGapM;
    const v0 = D.startKt / KT;
    a.setAirborne(x0, D.startAltM, v0, D.startThrottle);
    a.burnScale = D.burnScale;
    // Bandit: same type, ahead of you or on your six.
    this.ahead = Math.random() < 0.5;
    const gap = rand(D.spawnGapM[0], D.spawnGapM[1]);
    const b = new Aircraft(d);
    b.setAirborne(x0 + (this.ahead ? gap : -gap), D.startAltM + rand(D.spawnAltM[0], D.spawnAltM[1]), v0, D.startThrottle);
    b.burnScale = D.burnScale;
    this.b = b;
    this.hp = D.banditHp;
    this.ammo = d.gun ? Math.round(d.gun.rounds * D.banditAmmoMult) : 0;
    this.rounds = [];      // the bandit's rounds
    this.firing = false;
    this.wantFire = false;
    this.prevDx = 0;
    this.thr = DOGFIGHT.startThrottle;
    this.estVx = v0;
    this.wasShotAt = false;
    this.gunAcc = 0;
    this.burstT = 0;       // > 0: in a burst; < 0: pause
    this.hist = [];        // your recent positions (the bandit reacts late)
    this.aimErr = 0;
    this.jinkT = 0; this.jinkAlt = b.pos.y;
    this.overshootT = 0;
    this.down = false;     // bandit shot down (falling)
    this.downT = 0;
    this.wrecked = false;  // ... and hit the ground
    this.noAmmoT = 0;
    this.farT = 0;
    this.hitsOnBandit = 0;
    this.prev = this.snap();
  }

  snap() {
    const b = this.b;
    return { x: b.pos.x, y: b.pos.y, pitch: b.pitch, vx: b.vel.x, vy: b.vel.y, elevator: b.elevator };
  }

  // Bandit state between the last two physics steps (same as Flight.renderState).
  renderState(alpha) {
    const b = this.b;
    const p = this.prev, c = this.snap();
    const l = (k) => p[k] + (c[k] - p[k]) * alpha;
    let dp = c.pitch - p.pitch;
    if (dp > Math.PI) dp -= Math.PI * 2;
    if (dp < -Math.PI) dp += Math.PI * 2;
    return {
      x: l('x'), y: l('y'), pitch: p.pitch + dp * alpha, vx: l('vx'), vy: l('vy'), elevator: l('elevator'),
      gearPos: b.gearPos, onGround: false, afterburner: b.afterburner, rpm: b.rpm, propAngle: b.propAngle,
      bombsLeft: 0, engineOn: b.engineOn,
    };
  }

  get alive() { return !this.down; }
  get dx() { return this.b.pos.x - this.f.ac.pos.x; }   // + = bandit ahead of you
  get range() { const a = this.f.ac, b = this.b; return Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y); }

  centre(ac) {
    const u = this.f.data.hitCenterUpM;
    return { x: ac.pos.x - Math.sin(ac.pitch) * u, y: ac.pos.y + Math.cos(ac.pitch) * u };
  }
  get hitR() { return this.f.data.hitRadiusM * DOGFIGHT.hitRadiusMult; }

  // One of your rounds: did it hit the bandit? (Called by Combat.stepRounds.)
  roundHits(r) {
    if (this.down) return false;
    const c = this.centre(this.b);
    if (Math.abs(r.x - c.x) > 60 || segDist(r.px, r.py, r.x, r.y, c.x, c.y) > this.hitR) return false;
    this.f.emit('acHit', { x: r.x, y: r.y });
    this.hitsOnBandit += 1;
    this.hp -= r.dmg * DOGFIGHT.playerDmgMult;
    if (this.hp <= 0) this.shootDown();
    return true;
  }

  shootDown() {
    const b = this.b;
    this.down = true;
    this.hp = 0;
    b.shotDown = true; b.controls = false; b.engineOn = false;
    this.firing = false;
    this.f.emit('airBurst', { x: b.pos.x, y: b.pos.y, power: 1.3 });
    this.f.emit('banditDown', { x: b.pos.x, y: b.pos.y });
    this.f.say('SPLASH ONE! He\'s going down! Shabash, good kill!', true);
  }

  step(dt) {
    const D = DOGFIGHT;
    const f = this.f;
    const a = f.ac;
    const b = this.b;
    this.prev = this.snap();
    this.hist.push({ t: f.time, x: a.pos.x, y: a.pos.y, vx: a.vel.x, vy: a.vel.y });
    while (this.hist.length > 2 && this.hist[1].t < f.time - D.reactionS) this.hist.shift();
    if (!this.wrecked) {
      b.step(dt, this.down ? { pitch: 0, throttle: 0, brake: false } : this.think(dt));
      b.events.length = 0;
      if (this.down && b.pos.y <= 0.5) {
        this.wrecked = true;
        b.crashed = true;
        f.emit('explosion', { x: b.pos.x, y: 0, big: true });
        f.emit('banditWreck', { x: b.pos.x });
      } else if (!this.down && b.pos.y <= 0.5) {
        // Flew into the ground (shouldn't, it pulls up): counts as your kill.
        this.shootDown();
        this.wrecked = true; b.crashed = true;
        f.emit('explosion', { x: b.pos.x, y: 0, big: true });
      }
    }
    if (this.down) this.downT += dt;
    this.stepGun(dt);
    this.stepRounds(dt);
    this.rules(dt);
  }

  // The bandit's stick, throttle, brake and trigger.
  think(dt) {
    const D = DOGFIGHT;
    const f = this.f;
    const a = f.ac;
    const b = this.b;
    const d = f.data;
    const q = this.hist[0];                    // where you were reactionS ago
    const relX = q.x - b.pos.x, relY = q.y - b.pos.y;
    const playerDead = a.shotDown || a.crashed;
    const attack = relX > 0 && !playerDead;    // you're in front of its nose
    const speed = b.speed;
    let targetPitch;
    let throttle = 1, brake = false;
    this.wantFire = false;
    this.estVx += (a.vel.x - this.estVx) * Math.min(1, dt / D.speedReadS);
    this.aimErr += (gauss() * D.aimErrDeg * D2R - this.aimErr) * Math.min(1, dt * 1.5);

    if (attack) {
      // Lead the shot: rounds inherit the bandit's velocity, fly at muzzle speed, drop.
      const g = d.gun;
      const dist = Math.hypot(relX, relY);
      const t = dist / ((g ? g.muzzleMs : 900) + 1);
      const ax = relX + (q.vx - b.vel.x) * t;
      const ay = relY + (q.vy - b.vel.y) * t + 0.5 * G * t * t;
      const aimAng = Math.atan2(ay, ax);
      targetPitch = aimAng + this.aimErr;
      // Speed: sit chaseGapM behind you. It reads your speed late (estVx), so a sudden
      // throttle chop + air brake makes it run up on you and overshoot.
      const vErr = (relX - D.chaseGapM) * 0.12 + (this.estVx - b.vel.x);
      throttle = clamp(0.7 + vErr * 0.04, 0, 1);
      brake = this.estVx - b.vel.x < -D.chaseBrakeMs;
      this.wantFire = !!g && f.time > D.holdFireS && dist < D.fireRangeM && Math.abs(wrap(b.pitch - aimAng)) < D.fireConeDeg * D2R;
    } else {
      // You're behind it: jink up and down, sometimes chop the throttle so you overshoot.
      this.jinkT -= dt;
      // Your gun opens up: it breaks the other way at once.
      if (f.cb.firing && !this.wasShotAt) this.jinkT = 0;
      this.wasShotAt = f.cb.firing;
      if (this.jinkT <= 0) {
        this.jinkT = rand(D.jinkEveryS[0], D.jinkEveryS[1]);
        const dir = this.jinkAlt > b.pos.y ? -1 : 1; // alternate up / down
        const base = Math.max((b.pos.y + a.pos.y) / 2, D.jinkBaseMinM); // stays near your height
        this.jinkAlt = clamp(base + dir * rand(0.4, 1) * D.jinkAltM, D.floorM + 120, D.ceilingM - 200);
      }
      const close = !playerDead && -relX < D.overshootRangeM && Math.abs(relY) < 150;
      if (this.overshootT > 0) this.overshootT -= dt;
      else if (close && Math.random() < D.overshootPerS * dt) this.overshootT = rand(D.overshootS[0], D.overshootS[1]);
      if (this.overshootT > 0) { throttle = 0; brake = true; }
      // Too far ahead: ease off so you can close (it wants the fight).
      else if (-relX > D.waitGapM) throttle = clamp(0.5 + (this.estVx - 20 - b.vel.x) * 0.05, 0, 1);
      const wantVs = clamp((this.jinkAlt - b.pos.y) * 0.8, -70, 70);
      targetPitch = Math.asin(clamp(wantVs / Math.max(speed, 1), -0.7, 0.7)) + this.trimAoa(speed);
    }

    // Safety: ground, ceiling, stall.
    const sinkTo = b.pos.y + Math.min(b.vel.y, 0) * 3.5;
    if (b.pos.y < D.floorM || sinkTo < D.floorM) { targetPitch = Math.max(targetPitch, 18 * D2R); this.overshootT = 0; throttle = 1; brake = false; }
    if (b.pos.y > D.ceilingM) targetPitch = Math.min(targetPitch, -5 * D2R);
    if (speed * KT < d.stallKt * 1.35) {
      targetPitch = Math.min(targetPitch, Math.atan2(b.vel.y, b.vel.x));
      throttle = 1; brake = false; this.overshootT = 0;
    }
    // Angle-of-attack limit: never pulls (or pushes) into a stall.
    const path = Math.atan2(b.vel.y, b.vel.x);
    const lim = d.stallAoaDeg * D2R * D.aoaLimit;
    targetPitch = path + clamp(wrap(targetPitch - path), -lim, lim);
    // Far behind you: extra thrust so it can close up.
    b.thrustFactor = relX > D.catchUpM ? D.catchUpThrust : 1;

    // Pitch controller: wanted pitch rate from the error, as a stick deflection.
    const err = wrap(targetPitch - b.pitch);
    const authority = clamp(speed / (d.rotateKt / KT), 0.25, 1);
    const pitch = clamp((err * D.pitchGain) / (d.pitchRateDeg * D2R * authority), -1, 1);
    // Throttle lag: chop yours suddenly and it closes in before it slows (overshoot).
    this.thr += (throttle - this.thr) * Math.min(1, dt / D.throttleLagS);
    if (throttle === 1 && this.thr < 1) this.thr = Math.min(1, this.thr + dt * 0.8); // safety: power up quicker
    return { pitch, throttle: 0, throttleSet: this.thr, brake, gun: this.wantFire };
  }

  // Angle of attack for 1 G level flight at this speed (same lift model as Aircraft).
  trimAoa(speed) {
    const d = this.f.data;
    const cl = ((d.stallKt / KT) / Math.max(speed, 1)) ** 2;
    return clamp((cl - d.zeroAoaLift) / (1 - d.zeroAoaLift), 0, 0.8) * d.stallAoaDeg * D2R;
  }

  // Bandit gun: bursts with pauses while its nose is on you.
  stepGun(dt) {
    const D = DOGFIGHT;
    const g = this.f.data.gun;
    // burstT > 0: in a burst; < 0: pausing; 0: ready.
    if (this.burstT > 0) { this.burstT -= dt; if (this.burstT <= 0) this.burstT = -rand(D.burstGapS[0], D.burstGapS[1]); }
    else if (this.burstT < 0) this.burstT = Math.min(0, this.burstT + dt);
    else if (this.wantFire && !this.down) this.burstT = rand(D.burstS[0], D.burstS[1]);
    this.firing = !!g && !this.down && this.burstT > 0 && this.ammo > 0 && this.wantFire;
    if (!this.firing) { this.gunAcc = 0; return; }
    const b = this.b;
    this.gunAcc += g.rps * dt;
    while (this.gunAcc >= 1 && this.ammo > 0) {
      this.gunAcc -= 1;
      const p = b.pointM(g.port[0], g.port[1]);
      const ang = b.pitch + gauss() * g.spreadMrad / 1000;
      const lead = Math.random() * dt;
      const r = {
        x: p.x, y: p.y, px: p.x, py: p.y, t: 0, k: g.dragK, dmg: g.dmg,
        vx: b.vel.x + Math.cos(ang) * g.muzzleMs, vy: b.vel.y + Math.sin(ang) * g.muzzleMs,
        tracer: this.ammo % g.tracerEvery === 0,
      };
      r.x += r.vx * lead; r.y += r.vy * lead;
      this.rounds.push(r);
      this.ammo -= 1;
      if (this.ammo % 6 === 0) this.f.emit('banditGun', { dist: this.range });
    }
  }

  stepRounds(dt) {
    const f = this.f;
    const cb = f.cb;
    const live = cb.airborne();
    const c = this.centre(f.ac);
    const R = this.hitR;
    for (let i = this.rounds.length - 1; i >= 0; i--) {
      const r = this.rounds[i];
      shellStep(r, dt);
      let gone = r.t > 4;
      if (live && Math.abs(r.x - c.x) < 60 && segDist(r.px, r.py, r.x, r.y, c.x, c.y) <= R) {
        f.emit('acHit', { x: r.x, y: r.y });
        cb.damage(r.dmg * DOGFIGHT.banditDmgMult, 'the bandit');
        gone = true;
      } else if (r.y <= 0) {
        f.emit('roundGround', { x: r.px });
        gone = true;
      }
      if (gone) this.rounds.splice(i, 1);
    }
  }

  // Win, lose, or a draw.
  rules(dt) {
    const D = DOGFIGHT;
    const f = this.f;
    if (f.state === 'done') return;
    const a = f.ac;
    if (a.shotDown || a.crashed) return; // Flight.crash ends it
    if (this.down && this.downT > D.endAfterKillS) { f.finishDogfight('KILL'); return; }
    if (this.down) return;
    const out = f.cb.ammo <= 0 && f.cb.rounds.length === 0;
    this.noAmmoT = out ? this.noAmmoT + dt : 0;
    if (this.noAmmoT > D.noAmmoEndS) { f.finishDogfight('WINCHESTER'); return; }
    this.farT = this.range > D.outOfRangeM ? this.farT + dt : 0;
    if (this.farT > D.outOfRangeS) f.finishDogfight('DISENGAGED');
  }
}
