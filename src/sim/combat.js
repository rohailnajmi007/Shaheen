// Air-to-ground combat (owner, 2026-11-19): the jet's gun, air defences that shoot
// back (AAA guns and SAMs), enemy missiles, flares and chaff, damage to the jet.
// No DOM: runs in Node tests. Numbers in src/data/combat.js and src/data/aircraft.js.
//
// Ballistics: every round and shell is simulated (gravity + quadratic air drag,
// decel = k * v^2). Rounds leave the gun port along the nose (pitch + small
// dispersion) with the jet's own velocity added, so where they go depends on the
// jet's position, attitude and speed, nothing else.
import { G } from './aircraft.js';
import { AIR_DEFENCE, COUNTERMEASURES, DAMAGE, GROUND_UNITS, STRIKE } from '../data/combat.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2; // ~N(0, 1), in [-3, 3]
const D2R = Math.PI / 180;
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

// Move a round/shell one step: gravity and drag. Keeps the previous point for hit tests.
export function shellStep(s, dt) {
  const v = Math.hypot(s.vx, s.vy);
  s.vx += -s.k * v * s.vx * dt;
  s.vy += (-G - s.k * v * s.vy) * dt;
  s.px = s.x; s.py = s.y;
  s.x += s.vx * dt; s.y += s.vy * dt;
  s.t += dt;
}

// Closest distance from point (cx, cy) to the segment (ax, ay)-(bx, by).
export function segDist(ax, ay, bx, by, cx, cy) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? clamp(((cx - ax) * dx + (cy - ay) * dy) / l2, 0, 1) : 0;
  return Math.hypot(ax + dx * t - cx, ay + dy * t - cy);
}

// Does the segment cross the box [x0, x1] x [y0, y1]? (Liang-Barsky clip.)
export function segBox(ax, ay, bx, by, x0, x1, y0, y1) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}

// Seconds for a round fired at v0 with drag k to cover s metres (no gravity).
const timeToCover = (s, v0, k) => (Math.exp(Math.min(k * s, 20)) - 1) / (k * v0);

export class Combat {
  constructor(flight) {
    this.f = flight;
    const d = flight.data;
    this.hp = d.airframeHp;
    this.ammo = d.gun ? d.gun.rounds : 0;
    this.cm = d.countermeasures; // flare + chaff cartridges
    this.rounds = [];   // the jet's gun rounds
    this.shells = [];   // AAA shells
    this.threats = [];  // enemy missiles in flight
    this.decoys = [];   // flares and chaff
    this.gunAcc = 0;
    this.firing = false;
    this.radarLock = false; // a radar SAM is locked on (RWR)
    this.killer = null;
    this.shotDownT = 0;
    this.lastHitSay = -9;
    this.stats = { roundsFired: 0, damage: 0, evaded: 0, cmUsed: 0 };
  }

  // Centre of the jet's hit circle.
  hitCentre() {
    const a = this.f.ac;
    const u = this.f.data.hitCenterUpM;
    return { x: a.pos.x - Math.sin(a.pitch) * u, y: a.pos.y + Math.cos(a.pitch) * u };
  }

  airborne() {
    const a = this.f.ac;
    return !a.onGround && !a.crashed && !a.shotDown && this.f.state === 'flying';
  }

  step(dt, input) {
    this.stepGun(dt, input && input.gun);
    this.stepRounds(dt);
    this.stepDefences(dt);
    this.stepShells(dt);
    this.stepThreats(dt);
    this.stepDecoys(dt);
    const a = this.f.ac;
    if (a.shotDown && !a.crashed) {
      this.shotDownT += dt;
      if (this.shotDownT > DAMAGE.shotDownCrashS) this.f.crash(this.killer ? `Shot down by ${this.killer}.` : 'The pilot ejected; the jet flew into the ground.', -1);
    }
  }

  // --- the jet's gun ---
  stepGun(dt, want) {
    const g = this.f.data.gun;
    this.firing = !!(g && want && this.ammo > 0 && this.airborne() && this.f.ac.controls);
    if (!this.firing) { this.gunAcc = 0; return; }
    this.gunAcc += g.rps * dt;
    while (this.gunAcc >= 1 && this.ammo > 0) {
      this.gunAcc -= 1;
      this.fireRound(g, Math.random() * dt);
    }
  }

  fireRound(g, lead) {
    const a = this.f.ac;
    const p = a.pointM(g.port[0], g.port[1]);
    const ang = a.pitch + gauss() * g.spreadMrad / 1000;
    const r = {
      x: p.x, y: p.y, px: p.x, py: p.y, t: 0, k: g.dragK, dmg: g.dmg,
      vx: a.vel.x + Math.cos(ang) * g.muzzleMs, vy: a.vel.y + Math.sin(ang) * g.muzzleMs,
      tracer: this.stats.roundsFired % g.tracerEvery === 0,
    };
    // Spread rounds fired in one physics step along their path (no clumping).
    r.x += r.vx * lead; r.y += r.vy * lead;
    this.rounds.push(r);
    this.ammo -= 1;
    this.stats.roundsFired += 1;
  }

  stepRounds(dt) {
    const T = this.f.targets;
    for (let i = this.rounds.length - 1; i >= 0; i--) {
      const r = this.rounds[i];
      shellStep(r, dt);
      let gone = r.t > 4;
      for (const t of T) {
        if (!t.alive || Math.abs(t.x - r.x) > t.w / 2 + 12) continue;
        if (segBox(r.px, r.py, r.x, r.y, t.x - t.w / 2, t.x + t.w / 2, 0, t.h)) {
          this.f.emit('roundHit', { x: r.x, y: Math.max(0.5, Math.min(r.y, t.h)), hard: t.armour < 0.5 });
          this.damageUnit(t, r.dmg * t.armour, 'gun');
          gone = true;
          break;
        }
      }
      if (!gone && r.y <= 0) {
        const f = r.py / Math.max(r.py - r.y, 1e-4);
        this.f.emit('roundGround', { x: r.px + (r.x - r.px) * f });
        gone = true;
      }
      if (gone) this.rounds.splice(i, 1);
    }
  }

  damageUnit(t, n, how) {
    t.hp -= n;
    if (t.hp <= 0 && t.alive) this.f.destroyUnit(t, how);
  }

  // Where a round fired now would hit the ground (gun pipper), or null past 3 s.
  // Cached per physics step.
  gunImpact() {
    const f = this.f;
    if (this.impT === f.time) return this.imp;
    this.impT = f.time;
    this.imp = null;
    const g = f.data.gun;
    const a = f.ac;
    if (!g || this.ammo <= 0 || !this.airborne()) return null;
    const p = a.pointM(g.port[0], g.port[1]);
    const s = { x: p.x, y: p.y, vx: a.vel.x + Math.cos(a.pitch) * g.muzzleMs, vy: a.vel.y + Math.sin(a.pitch) * g.muzzleMs, k: g.dragK, t: 0 };
    const h = 1 / 30;
    while (s.t < 3) {
      shellStep(s, h);
      if (s.y <= 0) {
        const fr = s.py / Math.max(s.py - s.y, 1e-4);
        this.imp = { x: s.px + (s.x - s.px) * fr, t: s.t, rangeM: Math.hypot(s.x - p.x, p.y) };
        break;
      }
    }
    return this.imp;
  }

  // --- air defences ---
  // A defence can engage the jet: alive, jet flying in its envelope, not too far past it.
  canEngage(t, P, dist) {
    const a = this.f.ac;
    return t.alive && this.airborne() && dist < P.rangeM && a.pos.y < P.maxAltM && a.pos.y > (P.minAltM ?? 3)
      && a.pos.x - t.x < AIR_DEFENCE.pastM;
  }

  stepDefences(dt) {
    this.radarLock = false;
    const c = this.hitCentre();
    for (const t of this.f.targets) {
      if (t.role === 'objective') continue;
      const ox = t.x, oy = t.h * 0.8;
      const dist = Math.hypot(c.x - ox, c.y - oy);
      if (t.role === 'aaa') this.stepAaa(t, dt, c, ox, oy, dist);
      else this.stepSam(t, dt, c, dist);
    }
  }

  stepAaa(t, dt, c, ox, oy, dist) {
    const P = AIR_DEFENCE.aaa;
    const a = this.f.ac;
    const on = this.canEngage(t, P, dist);
    t.track = on ? (t.track ?? 0) + dt : Math.max(0, (t.track ?? 0) - dt * 2);
    t.firing = false;
    if (!t.alive) return;
    // Lead: time of flight to the predicted point, then gravity drop, twice over.
    let tof = timeToCover(dist, P.muzzleMs, P.dragK);
    let ax = c.x, ay = c.y;
    for (let i = 0; i < 2; i++) {
      ax = c.x + a.vel.x * tof; ay = c.y + a.vel.y * tof;
      tof = timeToCover(Math.hypot(ax - ox, ay - oy), P.muzzleMs, P.dragK);
    }
    ay += 0.5 * G * tof * tof;
    // Aim error: each burst he misjudges the lead by a random amount (1 sigma = err,
    // held for the burst) plus a small wander; err shrinks while he tracks a steady jet.
    t.wander = clamp((t.wander ?? 0) + gauss() * dt / P.wanderS, -1, 1);
    const err = lerp(P.errStartMrad, P.errMinMrad, clamp(t.track / P.settleS, 0, 1)) / 1000;
    const want = Math.atan2(ay - oy, ax - ox) + ((t.burstErr ?? 0) + t.wander * 0.3) * err;
    const slew = P.slewDegS * D2R * dt;
    t.aim = (t.aim ?? Math.PI / 2) + clamp(wrap(want - (t.aim ?? Math.PI / 2)), -slew, slew);
    // Spoiled solution: a jet changing its pitch fast throws his lead off; he re-settles.
    if (Math.abs(a.pitchRate) > 0.25) t.track = Math.max(0, t.track - dt * 3);
    // He holds fire until the barrel is on his lead point (a jet passing close overhead
    // crosses faster than he can crank the gun round).
    const onAim = Math.abs(wrap(want - t.aim)) < P.fireWithinMrad / 1000;
    if (!on || t.track < 0.6) { t.cycle = 0; return; }
    if (!onAim) return;
    const ph = (t.cycle ?? 0) % (P.burstS + P.pauseS);
    t.cycle = (t.cycle ?? 0) + dt;
    if (ph < dt) t.burstErr = gauss();
    if (t.cycle % (P.burstS + P.pauseS) > P.burstS) return;
    t.firing = true;
    t.acc = (t.acc ?? 0) + P.rps * dt;
    while (t.acc >= 1) {
      t.acc -= 1;
      const ang = t.aim + gauss() * P.spreadMrad / 1000;
      const lead = Math.random() * dt;
      const s = {
        x: ox + Math.cos(ang) * 2, y: oy + Math.sin(ang) * 2, t: 0, k: P.dragK,
        vx: Math.cos(ang) * P.muzzleMs, vy: Math.sin(ang) * P.muzzleMs,
        tracer: (t.shots = (t.shots ?? 0) + 1) % P.tracerEvery === 0,
      };
      s.px = s.x; s.py = s.y; s.x += s.vx * lead; s.y += s.vy * lead;
      this.shells.push(s);
    }
    if (!t.soundT || this.f.time - t.soundT > 0.2) { t.soundT = this.f.time; this.f.emit('aaaFire', { x: ox, dist }); }
    this.f.say('TRIPLE-A! Tracers! Jink, don\'t fly straight and level!', true, 'aaa');
  }

  stepShells(dt) {
    const P = AIR_DEFENCE.aaa;
    const live = this.airborne();
    const c = this.hitCentre();
    const R = this.f.data.hitRadiusM;
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      shellStep(s, dt);
      let gone = false;
      if (live && Math.abs(s.x - c.x) < 40 && segDist(s.px, s.py, s.x, s.y, c.x, c.y) <= R) {
        this.f.emit('acHit', { x: s.x, y: s.y });
        this.damage(P.dmg, 'triple-A');
        gone = true;
      } else if (s.t > P.shellLifeS) { this.f.emit('flakPuff', { x: s.x, y: s.y }); gone = true; }
      else if (s.y <= 0) gone = true;
      if (gone) this.shells.splice(i, 1);
    }
  }

  stepSam(t, dt, c, dist) {
    const P = AIR_DEFENCE[t.kind];
    t.reload = Math.max(0, (t.reload ?? 0) - dt);
    const inFlight = this.threats.some((m) => m.src === t && m.alive);
    const on = this.canEngage(t, P, dist) && t.missiles > 0 && t.reload <= 0 && !inFlight
      && (this.samLaunches || 0) < STRIKE.maxSamLaunches;
    t.lockT = on ? (t.lockT ?? 0) + dt : 0;
    if (on) this.radarLock = true;
    if (on) this.f.say('SAM LOCK! Get LOW under its radar, or flares and BREAK!', true, `samlock${t.x}`);
    if (!on || t.lockT < P.lockS) return;
    // Launch: up out of the tube toward the jet.
    const el = clamp(Math.atan2(c.y - t.h, c.x - t.x), 25 * D2R, 155 * D2R);
    this.threats.push({
      x: t.x, y: t.h + 1, vx: Math.cos(el) * 60, vy: Math.sin(el) * 60, t: 0,
      M: P.missile, src: t, target: 'ac', alive: true, closest: Infinity,
    });
    t.missiles -= 1;
    this.samLaunches = (this.samLaunches || 0) + 1;
    t.reload = P.reloadS;
    t.lockT = 0;
    this.f.emit('samLaunch', { x: t.x, y: t.h });
    this.f.say('SAM LAUNCH! FLARES, X, and BREAK hard across it! Don\'t run straight!', true);
  }

  stepThreats(dt) {
    const c = this.hitCentre();
    const a = this.f.ac;
    for (let i = this.threats.length - 1; i >= 0; i--) {
      const m = this.threats[i];
      const M = m.M;
      m.t += dt;
      // Target: the jet, a decoy, or nothing (seeker lost: flies on ballistic).
      let tx, ty, tvx, tvy;
      if (m.target === 'ac' && this.airborne()) { tx = c.x; ty = c.y; tvx = a.vel.x; tvy = a.vel.y; }
      else if (m.target && m.target !== 'ac' && m.target.t < m.target.life) {
        tx = m.target.x; ty = m.target.y; tvx = m.target.vx; tvy = m.target.vy;
        // Jet still in line with the decoy as the seeker sees it: it may pick the jet back up.
        if (this.airborne() && m.target.t > COUNTERMEASURES.reacquireAfterS) {
          const sep = Math.abs(wrap(Math.atan2(c.y - m.y, c.x - m.x) - Math.atan2(ty - m.y, tx - m.x)));
          if (sep < COUNTERMEASURES.reacquireDeg * D2R && Math.random() < COUNTERMEASURES.reacquirePerS * dt) {
            m.target = 'ac'; tx = c.x; ty = c.y; tvx = a.vel.x; tvy = a.vel.y;
          }
        }
      } else m.target = null;
      let s = Math.hypot(m.vx, m.vy) || 1;
      if (m.target && m.t > 0.3) {
        const rx = tx - m.x, ry = ty - m.y;
        const r2 = rx * rx + ry * ry;
        // Seeker gimbal: if the target is too far off the nose (overshoot), lock is lost.
        const off = Math.abs(wrap(Math.atan2(ry, rx) - Math.atan2(m.vy, m.vx)));
        if (off > M.gimbalDeg * D2R) m.target = null;
        else {
          // Proportional navigation: turn rate = N x line-of-sight rate, limited by maxG.
          const rvx = tvx - m.vx, rvy = tvy - m.vy;
          const losRate = (rx * rvy - ry * rvx) / r2;
          const close = Math.max(-(rx * rvx + ry * rvy) / Math.sqrt(r2), 150);
          const acc = clamp(M.navN * close * losRate, -M.maxG * G, M.maxG * G);
          const nx = -m.vy / s, ny = m.vx / s;
          m.vx += nx * acc * dt;
          m.vy += ny * acc * dt + G * dt; // + gravity compensation
        }
      }
      // Motor, drag, gravity.
      if (m.t < M.boostS) { m.vx += m.vx / s * M.boostAcc * dt; m.vy += m.vy / s * M.boostAcc * dt; }
      s = Math.hypot(m.vx, m.vy);
      if (s > M.maxSpeed) { m.vx *= M.maxSpeed / s; m.vy *= M.maxSpeed / s; s = M.maxSpeed; }
      m.vx += -M.dragK * s * m.vx * dt;
      m.vy += (-G - M.dragK * s * m.vy) * dt;
      m.px = m.x; m.py = m.y;
      m.x += m.vx * dt; m.y += m.vy * dt;
      m.motor = m.t < M.boostS;
      // Fuse: proximity to the jet (whatever it is chasing), or to its decoy.
      let boom = null;
      // A missile chasing a decoy fuses on the decoy only (flares leave right next to
      // the jet: fusing on the jet too made decoys useless, owner 2026-11-20).
      if (this.airborne() && (m.target === 'ac' || m.target === null)) {
        const dJet = segDist(m.px, m.py, m.x, m.y, c.x, c.y);
        m.closest = Math.min(m.closest, dJet);
        if (dJet <= M.fuseM) boom = { hit: true, d: dJet };
      }
      if (!boom && m.target && m.target !== 'ac' && segDist(m.px, m.py, m.x, m.y, m.target.x, m.target.y) < 6) boom = { hit: false };
      if (boom) {
        m.alive = false;
        this.threats.splice(i, 1);
        this.f.emit('airBurst', { x: m.x, y: m.y, power: 0.7 });
        if (boom.hit) this.damage(lerp(M.dmgMax, M.dmgMin, boom.d / M.fuseM), 'a SAM');
        else this.evaded(m);
        continue;
      }
      if (m.y <= 0 || m.t > M.lifeS || (m.t > M.boostS + 1 && s < 160)) {
        m.alive = false;
        this.threats.splice(i, 1);
        if (m.y <= 0) this.f.emit('explosion', { x: m.x, y: 0, big: false });
        else this.f.emit('airBurst', { x: m.x, y: m.y, power: 0.5 });
        this.evaded(m);
      }
    }
  }

  evaded(m) {
    if (!this.airborne()) return;
    this.stats.evaded += 1;
    this.f.say(m.closest < 80 ? 'That was CLOSE! Missile defeated. Keep your eyes open!' : 'Missile defeated! Good. Now press on!', true);
  }

  // --- countermeasures ---
  // One salvo of flares and chaff together.
  dispense() {
    const a = this.f.ac;
    if (this.cm <= 0 || !this.airborne()) return;
    const C = COUNTERMEASURES;
    const n = Math.min(C.perPress, this.cm);
    this.cm -= n;
    this.stats.cmUsed += n;
    const d = this.f.data;
    const tail = a.pointM(d.pivot[0] - 40, d.pivot[1] - 20);
    const made = [];
    for (let i = 0; i < n; i++) {
      const dec = {
        kind: 'flare', x: tail.x, y: tail.y, t: 0, life: C.flareLifeS,
        vx: a.vel.x * 0.85 + rand(-6, 6), vy: a.vel.y * 0.85 - rand(10, 22) - i * 6,
        drag: C.flareDrag,
      };
      this.decoys.push(dec);
      made.push(dec);
    }
    this.f.emit('countermeasure', { x: tail.x, y: tail.y });
    // Seduce missiles in the decoy window.
    const c = this.hitCentre();
    for (const m of this.threats) {
      if (m.target !== 'ac') continue;
      const dist = Math.hypot(m.x - c.x, m.y - c.y);
      if (dist > C.rangeM || dist < C.minRangeM) continue;
      if (Math.random() < m.M.decoyChance * this.decoyGeometry(m)) m.target = made[Math.floor(Math.random() * made.length)];
    }
    for (const t of this.f.targets) {
      if (t.role === 'sam' && t.lockT > 0 && Math.random() < C.breaksLock) t.lockT = 0;
    }
  }

  // How well the jet's flight helps a decoy against missile m (0..1): flying across
  // the missile's line of sight and pulling G separate the jet from its decoys.
  decoyGeometry(m) {
    const C = COUNTERMEASURES;
    const a = this.f.ac;
    const c = this.hitCentre();
    const lx = c.x - m.x, ly = c.y - m.y;
    const l = Math.hypot(lx, ly) || 1, s = a.speed || 1;
    const beam = Math.abs((lx * a.vel.y - ly * a.vel.x) / (l * s));
    const g = clamp(Math.abs(a.gLoad - 1) / C.gFull, 0, 1);
    return clamp(C.geomBase + C.beamWeight * beam + C.gWeight * g, 0, 1);
  }

  stepDecoys(dt) {
    for (let i = this.decoys.length - 1; i >= 0; i--) {
      const d = this.decoys[i];
      d.t += dt;
      const k = Math.exp(-d.drag * dt);
      d.vx *= k;
      d.vy = d.vy * k - G * dt;
      d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.t > d.life || d.y <= 0) this.decoys.splice(i, 1);
    }
  }

  // --- damage to the jet ---
  damage(n, cause) {
    const f = this.f;
    const a = f.ac;
    if (this.hp <= 0 || !this.airborne()) return;
    this.hp = Math.max(0, this.hp - n);
    this.stats.damage += n;
    a.thrustFactor = this.hp < DAMAGE.engineBelow ? DAMAGE.engineThrust : 1;
    if (this.hp <= 0) { this.killer = cause; f.shootDown(cause); return; }
    if (f.time - this.lastHitSay > 4) {
      this.lastHitSay = f.time;
      f.say(this.hp < DAMAGE.engineBelow ? `Engine's hit! ${Math.round(this.hp)}% left! Get OUT of there!` : `You're HIT! Airframe ${Math.round(this.hp)}%. Move!`, true);
    }
  }

  // Missiles chasing the jet (HUD warning, edge arrows).
  incoming() { return this.threats.filter((m) => m.target === 'ac'); }
}

export { GROUND_UNITS };
