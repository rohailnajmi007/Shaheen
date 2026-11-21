// Air to air (owner 2026-11-21). Take off as usual; past DOGFIGHT.fightStartM the
// bandits come, one at a time (2-3 per mission, all of the type picked on the start
// screen = the difficulty: src/data/opponents.js). Each one starts ahead of you or on
// your six; both jets fly right. Whoever is behind can shoot (guns fire along the
// nose); the one in front dodges by climbing, diving, or changing speed so the chaser
// overshoots and the roles swap. When the fight is over (all bandits down or gone, or
// you're out of rounds) the landing base appears and you land as usual.
// Numbers: DOGFIGHT in src/data/combat.js, per-opponent `ai` overrides. No DOM.
import { Aircraft, KT, G } from './aircraft.js';
import { DOGFIGHT, DAMAGE, AAMS, BANDIT_AAMS, COUNTERMEASURES, AAM_SEEKER } from '../data/combat.js';
import { shellStep, segDist } from './combat.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;
const D2R = Math.PI / 180;
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class Dogfight {
  constructor(flight, opp) {
    this.f = flight;
    this.opp = opp;
    this.D = { ...DOGFIGHT, ...(opp.ai || {}) };
    this.total = randInt(this.D.bandits);
    this.kills = 0;
    this.escaped = 0;
    this.phase = 'inbound';   // inbound (before the fight), fight, gap (next one coming), over
    this.fightX = this.D.fightStartM;
    this.gapT = 0;
    this.b = null;            // the bandit in the air now
    this.rounds = [];         // its rounds (stay alive after it goes)
    this.falling = [];        // shot-down bandits still falling: { ac, prev, t }
    this.firing = false;
    this.hitsOnBandit = 0;
    this.prevDx = 0;
    this.noAmmoT = 0;
    this.result = null;       // why the fight ended: 'done', 'winchester'
    // Your air-to-air missiles (owner 2026-11-21): stock, seeker lock, the ones in the air.
    const am = flight.data.aam;
    this.aamType = am ? AAMS[am.type] : null;
    this.missiles = am ? am.count : 0;
    this.lockT = 0;           // seconds the bandit has been in the seeker
    this.aams = [];           // missiles in the air
    this.noLockT = -9;        // when Space was pressed without a lock (HUD flash)
  }

  get locked() { return !!this.aamType && this.lockT >= this.aamType.lockS; }
  // 'none' (no bandit / no missiles), 'search' (not in the seeker), 'seek' (closing in), 'lock'.
  get seeker() {
    if (!this.aamType || this.missiles <= 0 || !this.fighting || this.f.ac.onGround) return 'none';
    return this.locked ? 'lock' : this.lockT > 0 ? 'seek' : 'search';
  }
  get lockFrac() { return this.aamType ? Math.min(1, this.lockT / this.aamType.lockS) : 0; }

  // Seeker: the bandit inside the cone ahead of your nose and within range builds the lock.
  stepSeeker(dt) {
    const M = this.aamType, a = this.f.ac, b = this.b;
    this.seekWhy = null;
    if (!M || this.missiles <= 0 || !b || this.fleeing || a.onGround || a.shotDown || a.crashed) { this.lockT = 0; return; }
    const c = this.centre(b);
    const dx = c.x - a.pos.x, dy = c.y - a.pos.y, dist = Math.hypot(dx, dy);
    const off = Math.abs(wrap(Math.atan2(dy, dx) - a.pitch));
    const was = this.locked, K = AAM_SEEKER;
    // Already tracking: a wider cone and a little more range keep it (a jinking bandit
    // slipping out for a moment doesn't throw the lock away).
    const cone = M.coneDeg * D2R * (this.lockT > 0 ? K.holdConeMult : 1);
    const maxR = M.rangeM[1] * (this.lockT > 0 ? K.holdRangeMult : 1);
    const inCone = off <= cone;
    const inside = dist >= M.rangeM[0] && dist <= maxR && inCone;
    // Why it can't lock (HUD): 'close' / 'far' with the bandit in the cone.
    this.seekWhy = inCone && !inside ? (dist < M.rangeM[0] ? 'close' : 'far') : null;
    this.lockT = inside ? Math.min(M.lockS, this.lockT + dt) : Math.max(0, this.lockT - dt * K.decayPerS);
    if (!was && this.locked) this.f.emit('aamLocked');
  }

  // Space: fire one missile at the locked bandit.
  fireAam() {
    const M = this.aamType, f = this.f, a = f.ac;
    if (!M || a.onGround || a.shotDown || a.crashed) return;
    if (this.missiles <= 0) { f.say('Missiles gone! Guns, guns!', true, null); this.noLockT = f.time; return; }
    if (!this.locked || !this.b) { this.noLockT = f.time; f.emit('aamNoLock'); return; }
    const d = f.data, pts = d.aam.points || d.hardpoints || [[d.pivot[0], d.pivot[1] - 20]];
    const hp = pts[(this.missiles - 1) % pts.length];
    const p = a.pointM(hp[0], hp[1] + 4);
    const drop = M.launch === 'drop';
    // The missile leaves lined up with the jet's body (ang = its attitude, drawn by the
    // renderer). A rail shot goes off along the nose; a drop keeps that attitude while it
    // falls clear (owner 2026-11-21: it spun comically when climbing or diving).
    const ang = a.pitch, spd = Math.hypot(a.vel.x, a.vel.y), ej = M.ejectMs ?? 5;
    const m = {
      M, x: p.x, y: p.y, px: p.x, py: p.y, t: 0, ang,
      vx: drop ? a.vel.x + Math.sin(ang) * ej : Math.cos(ang) * spd, vy: drop ? a.vel.y - Math.cos(ang) * ej : Math.sin(ang) * spd,
      motor: !drop, target: this.b, decoyAt: Math.random() < M.flareChance ? 0.6 + Math.random() * 0.8 : null,
      decoy: null, // a flare / chaff point it went for instead
    };
    this.aams.push(m);
    this.missiles -= 1;
    this.lockT = 0; // the seeker looks again for the next one
    this.jinkT = 0; // the bandit sees it coming: breaks at once
    f.emit('aamLaunch', { x: p.x, y: p.y, rail: !drop });
    f.say(`${M.fox}! ${M.short} away!`, true);
  }

  // A missile is gone: its smoke trail stays a few seconds, fading (renderer).
  dropAam(i) {
    const m = this.aams.splice(i, 1)[0];
    if (m.trail && m.trail.length > 1) (this.oldTrails || (this.oldTrails = [])).push({ pts: m.trail, at: m.trail[m.trail.length - 1].at });
  }

  // Missiles in flight: motor, guidance to the intercept point, proximity fuse.
  stepAams(dt) {
    const f = this.f;
    for (let i = this.aams.length - 1; i >= 0; i--) {
      const m = this.aams[i], M = m.M;
      m.t += dt; m.px = m.x; m.py = m.y;
      const drop = M.launch === 'drop';
      const burnFrom = drop ? M.dropS : 0;
      if (!m.motor && drop && m.t >= M.dropS && m.t < M.dropS + M.burnS) {
        m.motor = true; f.emit('aamIgnite', { x: m.x, y: m.y });
        // Thrust along the body: the path straightens out along where it points.
        const sp0 = Math.hypot(m.vx, m.vy);
        m.vx = Math.cos(m.ang) * sp0; m.vy = Math.sin(m.ang) * sp0;
      }
      if (m.motor && m.t >= burnFrom + M.burnS) m.motor = false;
      let sp = Math.hypot(m.vx, m.vy), hd = Math.atan2(m.vy, m.vx);
      if (m.t < burnFrom) {
        m.vy -= G * dt; // falling clear of the jet
      } else {
        if (m.motor) sp = Math.min(sp + M.accel * dt, (m.v0 ?? (m.v0 = sp)) + M.speedMs);
        else sp = Math.max(0, sp - M.dragMs2 * dt);
        // The bandit's flares / chaff: it goes for the decoy instead.
        if (m.decoyAt != null && !m.decoy && m.target && m.t > m.decoyAt + burnFrom && m.target === this.b) {
          const b = m.target;
          m.decoy = { x: b.pos.x - b.vel.x * 0.15, y: b.pos.y - 6, vx: b.vel.x * 0.5, vy: -8 };
          f.emit('countermeasure', { x: m.decoy.x, y: m.decoy.y, bandit: true });
          f.emit('aamDecoyed');
        }
        let aim = null;
        if (m.decoy) { m.decoy.x += m.decoy.vx * dt; m.decoy.y += m.decoy.vy * dt; aim = m.decoy; }
        else if (m.target && m.target === this.b && !m.target.shotDown) {
          const b = m.target, c = this.centre(b);
          const dist = Math.hypot(c.x - m.x, c.y - m.y);
          const tgo = dist / Math.max(sp, 50);
          aim = { x: c.x + b.vel.x * tgo, y: c.y + b.vel.y * tgo };
        }
        if (aim && sp > 120) {
          const want = Math.atan2(aim.y - m.y, aim.x - m.x);
          hd += clamp(wrap(want - hd), -M.turnDegS * D2R * dt, M.turnDegS * D2R * dt);
        } else hd -= 0.15 * dt * Math.cos(hd); // no target: noses over slowly
        m.vx = Math.cos(hd) * sp; m.vy = Math.sin(hd) * sp;
        m.ang = hd;
      }
      m.x += m.vx * dt; m.y += m.vy * dt;
      // Smoke trail points while the motor burns (drawn as billowing puffs by the renderer).
      if (m.motor && (!m.trail || m.t - m.trail[m.trail.length - 1].t > 0.04)) (m.trail || (m.trail = [])).push({ x: m.x, y: m.y, t: m.t, at: f.time });
      // Fuse: passes within fuseM of the bandit it was fired at (and not decoyed).
      const b = this.b;
      if (b && m.target === b && !m.decoy && m.t > burnFrom) {
        const c = this.centre(b);
        if (segDist(m.px, m.py, m.x, m.y, c.x, c.y) <= M.fuseM) {
          f.emit('airBurst', { x: m.x, y: m.y, power: 1.1 });
          f.emit('acHit', { x: c.x, y: c.y, bandit: true });
          this.hp -= M.dmg * this.D.playerDmgMult;
          b.controlFactor = 1 - (1 - DAMAGE.controlAtZero) * this.damage;
          this.dropAam(i);
          if (this.hp <= 0) this.shootDown(true);
          else f.say(`Hit! The ${this.opp.name} is still flying! Finish him!`, true);
          continue;
        }
      }
      if (m.y <= 0) { f.emit('explosion', { x: m.x, y: 0 }); this.dropAam(i); continue; }
      if (m.t > M.lifeS || (m.decoy && Math.hypot(m.decoy.x - m.x, m.decoy.y - m.y) < 15)) {
        f.emit('airBurst', { x: m.x, y: m.y, power: 0.5 });
        this.dropAam(i);
      }
    }
  }

  get active() { return !!this.b; }
  get damage() { return this.b ? 1 - Math.max(0, this.hp) / this.opp.airframeHp : 0; } // 0 = intact, 1 = destroyed
  get number() { return this.kills + this.escaped + 1; } // which bandit this is (1-based)

  // A new bandit, ahead of you or on your six, near your height and speed.
  spawn() {
    const D = this.D;
    const f = this.f;
    const a = f.ac;
    this.ahead = Math.random() < 0.5;
    const gap = rand(D.spawnGapM[0], D.spawnGapM[1]);
    const v = Math.max(a.speed, D.spawnMinKt / KT);
    const b = new Aircraft(this.opp);
    b.setAirborne(a.pos.x + (this.ahead ? gap : -gap), clamp(a.pos.y + rand(D.spawnAltM[0], D.spawnAltM[1]), D.spawnMinAltM, D.ceilingM - 300), v, 0.85);
    b.burnScale = D.burnScale;
    this.b = b;
    this.hp = this.opp.airframeHp;
    this.ammo = Math.round(this.opp.gun.rounds * D.banditAmmoMult);
    this.wantFire = false;
    this.firing = false;
    this.thr = 0.85;
    this.estVx = v;
    this.wasShotAt = false;
    this.gunAcc = 0;
    this.burstT = 0;       // > 0: in a burst; < 0: pause
    this.hist = [];        // your recent positions (the bandit reacts late)
    this.aimErr = 0;
    this.jinkT = 0; this.jinkAlt = b.pos.y;
    this.overshootT = 0;
    this.yoyoT = 0;
    this.jinkThr = null;   // speed jink: throttle it holds until the next jink (null: normal)
    // Its missiles (owner 2026-11-21): seeker lock on you, launches.
    this.bm = this.opp.aam ? BANDIT_AAMS[this.opp.aam.type] : null;
    this.bmLeft = this.bm ? this.opp.aam.count : 0;
    this.bmLockT = 0;
    this.bmLastT = -99;
    this.fleeing = false;  // you're out of rounds: it leaves
    this.farT = 0;
    this.spawnT = f.time;
    this.prevDx = b.pos.x - a.pos.x;
    this.prev = this.snap();
    this.phase = 'fight';
    const n = this.total > 1 ? ` ${this.number} of ${this.total}` : '';
    f.say(this.ahead ? `Bandit${n}! ${this.opp.name} dead ahead! Get your nose on him! Guns!`
      : `Bandit${n}! ${this.opp.name} on your SIX! Break! Climb, dive, make him overshoot!`, true);
    f.emit('banditSpawn', { x: b.pos.x, y: b.pos.y });
  }

  snap(b = this.b) {
    return { x: b.pos.x, y: b.pos.y, pitch: b.pitch, vx: b.vel.x, vy: b.vel.y, elevator: b.elevator };
  }

  // Bandit state between the last two physics steps (same as Flight.renderState).
  // No lights at night (blacked out).
  renderState(alpha, b = this.b, prev = this.prev) {
    const p = prev, c = this.snap(b);
    const l = (k) => p[k] + (c[k] - p[k]) * alpha;
    let dp = c.pitch - p.pitch;
    if (dp > Math.PI) dp -= Math.PI * 2;
    if (dp < -Math.PI) dp += Math.PI * 2;
    return {
      x: l('x'), y: l('y'), pitch: p.pitch + dp * alpha, vx: l('vx'), vy: l('vy'), elevator: l('elevator'),
      gearPos: 0, onGround: false, afterburner: b.afterburner, rpm: b.rpm, propAngle: 0,
      bombsLeft: 0, engineOn: false,
    };
  }

  get dx() { return this.b ? this.b.pos.x - this.f.ac.pos.x : 0; }   // + = bandit ahead of you
  get range() { const a = this.f.ac, b = this.b; return b ? Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y) : Infinity; }
  get fighting() { return !!this.b && !this.fleeing; }

  centre(ac) {
    const u = ac.data.hitCenterUpM;
    return { x: ac.pos.x - Math.sin(ac.pitch) * u, y: ac.pos.y + Math.cos(ac.pitch) * u };
  }
  hitR(ac) { return ac.data.hitRadiusM * this.D.hitRadiusMult; }

  // One of your rounds: did it hit the bandit? (Called by Combat.stepRounds.)
  roundHits(r) {
    const b = this.b;
    if (!b) return false;
    const c = this.centre(b);
    if (Math.abs(r.x - c.x) > 80 || segDist(r.px, r.py, r.x, r.y, c.x, c.y) > this.hitR(b)) return false;
    this.f.emit('acHit', { x: r.x, y: r.y, bandit: true });
    this.hitsOnBandit += 1;
    this.hp -= r.dmg * this.D.playerDmgMult;
    b.controlFactor = 1 - (1 - DAMAGE.controlAtZero) * this.damage;
    if (this.hp <= 0) this.shootDown();
    return true;
  }

  // Killed: it falls (burning) on its own list; the next one can come meanwhile.
  // byMissile: a missile made the kill, so it breaks up into sections (owner 2026-11-21).
  shootDown(byMissile = false) {
    const b = this.b;
    this.hp = 0;
    this.bmLockT = 0;
    b.shotDown = true; b.controls = false; b.engineOn = false;
    const pieces = byMissile && this.opp.breakup && b.pos.y > 30 ? this.breakUp(b) : null;
    this.f.emit('airBurst', { x: b.pos.x, y: b.pos.y, power: pieces ? 1.7 : 1.3 });
    this.f.emit('banditDown', { x: b.pos.x, y: b.pos.y, vx: b.vel.x, vy: b.vel.y, pitch: b.pitch, broken: !!pieces });
    const left = this.total - this.kills - this.escaped - 1;
    this.f.say(left > 0 ? `SPLASH ONE! ${this.opp.name} going down! ${left} more coming, stay sharp!` : "SPLASH! That's the last of them! Shabash!", true);
    this.falling.push({ ac: b, prev: this.prev, t: 0, pieces });
    this.endBandit(true);
  }

  // The sections a missile kill tears the bandit into: 2 or 3, cut across the fuselage at
  // random points inside the opponent's `breakup.cuts` ranges. Each piece is a rigid body
  // (x, y in m, rot = its pitch) holding the strip [u0, u1] of the sprite (fractions of
  // the width from the tail); the renderer cuts its picture once and draws it there.
  breakUp(b) {
    const B = this.opp.breakup, K = this.D.breakup, d = this.opp;
    const three = Math.random() < K.threeChance;
    const cuts = three ? [rand(...B.cuts[0]), rand(...B.cuts[1])] : [rand(B.cuts[0][0], B.cuts[1][1])];
    const us = [0, ...cuts, 1];
    const [W, H] = B.sizePx;
    const cosP = Math.cos(b.pitch), sinP = Math.sin(b.pitch);
    const pieces = [];
    for (let i = 0; i < us.length - 1; i++) {
      const u0 = us[i], u1 = us[i + 1];
      const ox = (u0 + u1) / 2 * W, oy = H * 0.5;            // piece origin (texture px)
      const lx = (ox - d.pivot[0]) * d.texM, ly = -(oy - d.pivot[1]) * d.texM;
      // Pushed apart along the body (tail back, nose on), a kick up from the blast.
      const along = (i - (us.length - 2) / 2) * rand(...K.sepMs);
      const up = rand(...K.upMs);
      const x = b.pos.x + lx * cosP - ly * sinP, y = b.pos.y + lx * sinP + ly * cosP;
      pieces.push({
        i, u0, u1, ox, oy, x, y, px: x, py: y, rot: b.pitch, prot: b.pitch,
        vx: b.vel.x + along * cosP - up * sinP + rand(-1.5, 1.5), vy: b.vel.y + along * sinP + up * cosP,
        spin: (Math.random() < 0.5 ? -1 : 1) * rand(...K.spinDegS) * D2R * (1.2 - (u1 - u0)),
        mass: u1 - u0, landed: false,
      });
    }
    return pieces;
  }

  // Pieces fall: gravity, air drag (no lift), tumbling. The biggest drives the camera.
  stepPieces(w, dt) {
    const K = this.D.breakup, f = this.f;
    const biggest = w.pieces.reduce((m, q) => (q.mass > m.mass ? q : m));
    let main = null;
    for (const p of w.pieces) {
      p.px = p.x; p.py = p.y; p.prot = p.rot;
      if (p.landed) continue;
      p.vy -= G * dt;
      p.vx *= Math.exp(-K.dragX * dt / (0.4 + p.mass));
      p.vy *= Math.exp(-K.dragY * dt);
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
      if (p.y <= 0.5) {
        p.landed = true; p.y = 0.5;
        const big = p === biggest;
        f.emit('explosion', { x: p.x, y: 0, big });
        if (big) f.emit('banditWreck', { x: p.x });
        continue;
      }
      if (!main || p.mass > main.mass) main = p;
    }
    if (main) {
      const a = w.ac;
      a.pos.x = main.x; a.pos.y = main.y; a.vel.x = main.vx; a.vel.y = main.vy; a.pitch = main.rot;
    }
    return !main; // all down
  }


  step(dt) {
    const D = this.D;
    const f = this.f;
    const a = f.ac;
    if (this.phase === 'inbound' && f.state === 'flying' && !a.onGround && a.pos.x > this.fightX && a.altFt > 300) this.spawn();
    else if (this.phase === 'gap' && (this.gapT -= dt) <= 0 && f.state === 'flying' && !a.shotDown) this.spawn();
    const b = this.b;
    if (b) {
      this.prev = this.snap();
      this.hist.push({ t: f.time, x: a.pos.x, y: a.pos.y, vx: a.vel.x, vy: a.vel.y });
      while (this.hist.length > 2 && this.hist[1].t < f.time - D.reactionS) this.hist.shift();
      b.step(dt, this.fleeing ? this.flee() : this.think(dt));
      b.events.length = 0;
      if (b.pos.y <= 0.5) this.shootDown(); // flew into the ground: your kill
      else { this.stepGun(dt); this.stepBanditAam(dt); }
    }
    // Shot-down bandits fall until they hit the ground (or for maxFallS at most).
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const w = this.falling[i];
      w.prev = this.snap(w.ac);
      if (w.pieces) {
        w.t += dt;
        if (this.stepPieces(w, dt) || w.t > D.maxFallS) this.falling.splice(i, 1);
        continue;
      }
      w.ac.step(dt, { pitch: 0, throttle: 0, brake: false });
      w.ac.events.length = 0;
      w.t += dt;
      if (w.ac.pos.y <= 0.5 || w.t > D.maxFallS) {
        if (w.ac.pos.y <= 0.5) { f.emit('explosion', { x: w.ac.pos.x, y: 0, big: true }); f.emit('banditWreck', { x: w.ac.pos.x }); }
        this.falling.splice(i, 1);
      }
    }
    this.stepSeeker(dt);
    this.stepAams(dt);
    this.stepRounds(dt);
    this.rules(dt);
  }

  // This bandit is finished with (killed, or got away): the next one, or the end.
  endBandit(killed) {
    if (killed) this.kills += 1; else this.escaped += 1;
    this.b = null;
    this.firing = false;
    if (this.kills + this.escaped >= this.total) this.over('done');
    else { this.phase = 'gap'; this.gapT = this.D.nextBanditS; }
  }

  over(why) {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.result = why;
    this.f.dogfightOver(why);
  }

  rules(dt) {
    const D = this.D;
    const f = this.f;
    const a = f.ac;
    if (f.state === 'done' || a.shotDown || a.crashed) return;
    const b = this.b;
    if (!b) return;
    if (this.fleeing) { if (this.range > D.fleeGoneM) { this.b = null; this.escaped += 1; } return; }
    // Out of rounds: the fight's over, the bandit leaves, you go home.
    const out = f.cb.ammo <= 0 && f.cb.rounds.length === 0 && this.missiles <= 0 && this.aams.length === 0;
    this.noAmmoT = out ? this.noAmmoT + dt : 0;
    if (this.noAmmoT > D.noAmmoEndS) { this.fleeing = true; this.firing = false; this.over('winchester'); return; }
    this.farT = this.range > D.outOfRangeM ? this.farT + dt : 0;
    if (this.farT > D.outOfRangeS) { f.say(`The ${this.opp.name} got away!`, true); this.endBandit(false); }
  }

  // Leaving: climb away at full power, no shooting.
  flee() {
    const b = this.b;
    this.wantFire = false;
    const err = wrap(10 * D2R - b.pitch);
    return { pitch: clamp(err * 3, -1, 1), throttle: 0, throttleSet: 1, brake: false, gun: false };
  }

  // The bandit's stick, throttle, brake and trigger.
  think(dt) {
    const D = this.D;
    const f = this.f;
    const a = f.ac;
    const b = this.b;
    const d = b.data;
    const q = this.hist[0];                    // where you were reactionS ago
    const relX = q.x - b.pos.x, relY = q.y - b.pos.y;
    const playerDead = a.shotDown || a.crashed || a.onGround;
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
      const t = dist / (g.muzzleMs + 1);
      const ax = relX + (q.vx - b.vel.x) * t;
      const ay = relY + (q.vy - b.vel.y) * t + 0.5 * G * t * t;
      const aimAng = Math.atan2(ay, ax);
      targetPitch = aimAng + this.aimErr;
      // Speed: sit chaseGapM behind you. It reads your speed late (estVx), so a sudden
      // throttle chop + air brake makes it run up on you and overshoot.
      const vErr = (relX - D.chaseGapM) * 0.12 + (this.estVx - b.vel.x);
      throttle = clamp(0.7 + vErr * 0.04, 0, 1);
      brake = this.estVx - b.vel.x < -D.chaseBrakeMs;
      this.wantFire = f.time - this.spawnT > D.holdFireS && dist < D.fireRangeM && Math.abs(wrap(b.pitch - aimAng)) < D.fireConeDeg * D2R;
    } else {
      // You're behind it: jink up and down, sometimes chop the throttle so you overshoot.
      this.jinkT -= dt;
      // Your gun opens up: it breaks the other way at once, hard.
      const shotAt = f.cb.firing && !this.wasShotAt;
      if (shotAt) this.jinkT = 0;
      this.wasShotAt = f.cb.firing;
      if (this.jinkT <= 0) {
        this.jinkT = rand(D.jinkEveryS[0], D.jinkEveryS[1]);
        const dir = this.jinkAlt > b.pos.y ? -1 : 1; // alternate up / down
        const base = Math.max((b.pos.y + a.pos.y) / 2, D.jinkBaseMinM); // stays near your height
        this.jinkAlt = clamp(base + dir * rand(shotAt ? D.breakJink : 0.4, 1) * D.jinkAltM, D.floorM + 120, D.ceilingM - 200);
        // Speed jink: surge or chop with it, so you can't just sit on its speed.
        this.jinkThr = Math.random() < D.speedJinkChance ? (Math.random() < 0.5 ? 1 : D.chopThrottle) : null;
      }
      const close = !playerDead && -relX < D.overshootRangeM && Math.abs(relY) < 150;
      if (this.overshootT > 0) this.overshootT -= dt;
      else if (close && Math.random() < D.overshootPerS * dt) this.overshootT = rand(D.overshootS[0], D.overshootS[1]);
      // Yo-yo: nose up hard with the power back; you fly on underneath and past it.
      if (this.yoyoT > 0) this.yoyoT -= dt;
      else if (close && this.overshootT <= 0 && speed * KT > d.stallKt * 2 && Math.random() < D.yoyoPerS * dt) {
        this.yoyoT = rand(D.yoyoS[0], D.yoyoS[1]); this.yoyoDeg = rand(D.yoyoDeg[0], D.yoyoDeg[1]);
      }
      if (this.overshootT > 0 || this.yoyoT > 0) { throttle = this.yoyoT > 0 ? 0.25 : 0; brake = true; }
      // Too far ahead: ease off so you can close (it wants the fight).
      else if (-relX > D.waitGapM) throttle = clamp(0.5 + (this.estVx - 20 - b.vel.x) * 0.05, 0, 1);
      else if (this.jinkThr != null) throttle = this.jinkThr;
      const wantVs = clamp((this.jinkAlt - b.pos.y) * 0.8, -D.jinkVsMs, D.jinkVsMs);
      targetPitch = this.yoyoT > 0 ? this.yoyoDeg * D2R
        : Math.asin(clamp(wantVs / Math.max(speed, 1), -0.7, 0.7)) + this.trimAoa(speed);
    }

    // Safety: ground, ceiling, stall.
    const sinkTo = b.pos.y + Math.min(b.vel.y, 0) * 3.5;
    if (b.pos.y < D.floorM || sinkTo < D.floorM) { targetPitch = Math.max(targetPitch, 18 * D2R); this.overshootT = 0; this.yoyoT = 0; throttle = 1; brake = false; }
    if (b.pos.y > D.ceilingM) targetPitch = Math.min(targetPitch, -5 * D2R);
    if (speed * KT < d.stallKt * 1.35) {
      targetPitch = Math.min(targetPitch, Math.atan2(b.vel.y, b.vel.x));
      throttle = 1; brake = false; this.overshootT = 0; this.yoyoT = 0;
    }
    // Angle-of-attack limit: never pulls (or pushes) into a stall.
    const path = Math.atan2(b.vel.y, b.vel.x);
    const lim = d.stallAoaDeg * D2R * D.aoaLimit;
    targetPitch = path + clamp(wrap(targetPitch - path), -lim, lim);
    // Far behind you: extra thrust so it can close up.
    b.thrustFactor = (relX > D.catchUpM ? D.catchUpThrust : 1) * (1 - (1 - DAMAGE.thrustAtZero) * this.damage);

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
    const d = this.opp;
    const cl = ((d.stallKt / KT) / Math.max(speed, 1)) ** 2;
    return clamp((cl - d.zeroAoaLift) / (1 - d.zeroAoaLift), 0, 0.8) * d.stallAoaDeg * D2R;
  }

  // Bandit missiles (owner 2026-11-21): its seeker needs you inside coneDeg of its nose and
  // within range for lockS (MISSILE LOCK warning, RWR tone), then it fires one into
  // Combat.threats, where it flies like a SAM missile and your flares work on it.
  stepBanditAam(dt) {
    const M = this.bm, f = this.f, cb = f.cb, b = this.b, a = f.ac;
    if (!M || this.bmLeft <= 0 || this.fleeing || !cb.airborne()) { this.bmLockT = 0; return; }
    const c = cb.hitCentre();
    const dx = c.x - b.pos.x, dy = c.y - b.pos.y, dist = Math.hypot(dx, dy);
    const off = Math.abs(wrap(Math.atan2(dy, dx) - b.pitch));
    const ready = f.time - this.spawnT > M.holdS && f.time - this.bmLastT > M.gapS
      && !cb.threats.some((m) => m.src === this);
    const inside = ready && dist >= M.rangeM[0] && dist <= M.rangeM[1] && off <= M.coneDeg * D2R && !a.shotDown;
    this.bmLockT = inside ? this.bmLockT + dt : Math.max(0, this.bmLockT - dt * 2);
    if (this.bmLockT > 0) {
      cb.radarLock = true;
      f.say(`He's locking you up! ${this.opp.name} has you in his nose! Get out of it!`, true, `bmlock${this.number}`);
    }
    if (this.bmLockT < M.lockS) return;
    // Launch: off its rail along the nose, the motor lit.
    const p = b.pointM(this.opp.pivot[0], this.opp.pivot[1] - 18);
    cb.threats.push({
      x: p.x, y: p.y, vx: b.vel.x + Math.cos(b.pitch) * 25, vy: b.vel.y + Math.sin(b.pitch) * 25, t: 0,
      M, src: this, target: 'ac', alive: true, closest: Infinity, by: `a ${this.opp.name}'s ${M.short}`,
    });
    this.bmLeft -= 1;
    this.bmLastT = f.time;
    this.bmLockT = 0;
    f.emit('banditAam', { x: p.x, y: p.y });
    f.say(`MISSILE LAUNCH! ${M.short} in the air! FLARES, X, and BREAK hard! NOW!`, true);
  }

  // A flare salvo from you may spoil its seeker before it fires.
  flaresOut() {
    if (this.bmLockT > 0 && Math.random() < COUNTERMEASURES.breaksLock) this.bmLockT = 0;
  }

  // Bandit gun: bursts with pauses while its nose is on you.
  stepGun(dt) {
    const D = this.D;
    const g = this.opp.gun;
    // burstT > 0: in a burst; < 0: pausing; 0: ready.
    if (this.burstT > 0) { this.burstT -= dt; if (this.burstT <= 0) this.burstT = -rand(D.burstGapS[0], D.burstGapS[1]); }
    else if (this.burstT < 0) this.burstT = Math.min(0, this.burstT + dt);
    else if (this.wantFire) this.burstT = rand(D.burstS[0], D.burstS[1]);
    this.firing = !this.fleeing && this.burstT > 0 && this.ammo > 0 && this.wantFire;
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
    const R = this.hitR(f.ac);
    for (let i = this.rounds.length - 1; i >= 0; i--) {
      const r = this.rounds[i];
      shellStep(r, dt);
      let gone = r.t > 4;
      if (live && Math.abs(r.x - c.x) < 60 && segDist(r.px, r.py, r.x, r.y, c.x, c.y) <= R) {
        f.emit('acHit', { x: r.x, y: r.y });
        cb.damage(r.dmg * this.D.banditDmgMult, `a ${this.opp.name}`);
        gone = true;
      } else if (r.y <= 0) {
        f.emit('roundGround', { x: r.px });
        gone = true;
      }
      if (gone) this.rounds.splice(i, 1);
    }
  }
}
