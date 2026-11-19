// One flight: world layout, mission rules, landing judge, weapons, instructor.
import { Aircraft, KT, FT, G } from './aircraft.js';
import { aircraftById } from '../data/aircraft.js';
import { BASES, ferryLayout, ROUTES_FROM } from '../data/world.js';

const GRADES = ['PERFECT', 'GOOD', 'FIRM', 'HARD'];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);

// Bomb ballistics (same as the Godot Bomb class).
export function bombStep(v, k, dt) {
  const s = Math.hypot(v.x, v.y);
  return { x: v.x + (-v.x * s * k) * dt, y: v.y + (-G - v.y * s * k) * dt };
}
export function predictImpact(pos, vel, k, out) {
  let p = { x: pos.x, y: pos.y }, v = { x: vel.x, y: vel.y }, t = 0;
  const h = 1 / 30;
  if (out) out.length = 0;
  while (p.y > 0 && t < 30) {
    const prev = p;
    v = bombStep(v, k, h);
    p = { x: p.x + v.x * h, y: p.y + v.y * h };
    t += h;
    if (out && out.length < 400) out.push(p);
    if (p.y <= 0) {
      const f = prev.y / Math.max(prev.y - p.y, 1e-4);
      return { x: prev.x + (p.x - prev.x) * f, t: t - h * (1 - f) };
    }
  }
  return { x: p.x, t };
}

export class Flight {
  constructor(opts) {
    this.opts = opts;
    this.data = aircraftById(opts.aircraftId);
    this.mode = opts.mode === 'strike' && this.data.strikeCapable ? 'strike' : 'ferry';
    this.ac = new Aircraft(this.data);
    this.ac.reset(60);
    this.state = 'preflight'; // preflight, flying, rollout, stopover, done
    this.time = 0;
    this.flightTime = 0;
    this.fx = [];        // effects and sounds for the renderer/audio
    this.messages = [];  // instructor lines for the HUD
    this.said = new Set();
    this.weapons = [];
    this.targets = [];
    this.result = null;
    this.worstFpm = 0;
    this.noseFirst = false;
    this.overran = false;
    this.airborneOnce = false;
    this.refuel = null;
    this.fuelStart = this.data.fuelKg;
    this.extraFuel = 0;
    this.revealed = true;
    this.seeker = { target: null, t: 0 }; // missile seeker: candidate target and time on it
    this.buildWorld();
    this.say(`${this.callsign()}! Engine start: E. Then throttle up. Move it!`);
  }

  callsign() {
    const n = (this.opts.name || 'Shaheen').trim();
    return `${this.data.rankCall} ${n}`;
  }

  buildWorld() {
    // Every flight starts at the aircraft's home base (x = 0).
    const home = BASES[this.data.homeBase] ? this.data.homeBase : 'risalpur';
    this.home = home;
    if (this.mode === 'ferry') {
      this.bases = ferryLayout(home).map(([id, x]) => ({ ...BASES[id], x, visible: true }));
      this.dest = this.bases.slice(1).find((b) => b.id === this.opts.dest) || this.bases[1];
      this.themeStops = [];
      for (const b of this.bases) this.themeStops.push({ x: b.x - 900, theme: b.theme }, { x: b.x + b.runwayM + 900, theme: b.theme });
    } else {
      this.ac.bombsLeft = this.data.bombCount;
      const kinds = ['sam', 'radar', 'fuel', 'bunker'].sort(() => Math.random() - 0.5);
      const n = Math.random() < 0.5 ? 2 : 3;
      let x = this.data.strikeAreaStartM;
      for (let i = 0; i < n; i++) {
        this.targets.push({ x, kind: kinds[i], alive: true, w: kinds[i] === 'fuel' ? 26 : 18, deadAt: 0 });
        x += rand(700, 1300);
      }
      const lastT = this.targets[this.targets.length - 1].x;
      // Landing base: one of the other two bases, at random.
      const others = ROUTES_FROM[home];
      const recId = others[Math.random() < 0.5 ? 0 : 1];
      this.bases = [
        { ...BASES[home], x: 0, visible: true },
        { ...BASES[recId], x: lastT + 3000, visible: false },
      ];
      this.dest = this.bases[1];
      this.revealed = false;
      this.themeStops = [
        { x: -900, theme: BASES[home].theme }, { x: 2100, theme: BASES[home].theme },
        { x: 3800, theme: 'desert' }, { x: lastT + 600, theme: 'desert' },
        { x: this.dest.x - 900, theme: this.dest.theme }, { x: this.dest.x + this.dest.runwayM + 900, theme: this.dest.theme },
      ];
    }
    this.lastX = Math.max(...this.bases.map((b) => b.x + b.runwayM));
  }

  runwayAt(x) {
    return this.bases.find((b) => b.visible && x >= b.x && x <= b.x + b.runwayM) || null;
  }

  // Instructor line. urgent lines replace the current one at once.
  say(text, urgent = false, key = null) {
    if (key) {
      if (this.said.has(key)) return;
      this.said.add(key);
    }
    this.messages.push({ text, urgent, t: this.time });
  }

  emit(type, extra = {}) { this.fx.push({ type, ...extra }); }

  approachKt() { return Math.round(this.data.stallKt * 1.18); }

  // Glide path to the destination aim point (300 m past the threshold).
  glide() {
    const aim = this.dest.x + 300;
    const dist = aim - this.ac.pos.x;
    if (!this.revealed || dist < 150 || dist > 6000) return null;
    const angle = Math.atan2(this.ac.pos.y, dist) * 180 / Math.PI;
    return { dist, angle, dev: angle - 3 };
  }

  get phase() {
    const a = this.ac;
    if (this.state === 'done') return this.result?.grade === 'CRASH' ? 'CRASHED' : 'COMPLETE';
    if (this.state === 'stopover') return 'REFUEL STOP';
    if (this.state === 'rollout') return 'LANDED';
    if (a.onGround) return a.speed > 1 ? 'TAKE OFF ROLL' : 'PRE-FLIGHT';
    if (this.mode === 'strike' && !this.revealed) return a.bombsLeft > 0 ? 'ATTACK RUN' : 'EGRESS';
    const toGo = this.dest.x - a.pos.x;
    if (toGo > 0 && toGo < 3000 && a.altFt < 3000) return 'APPROACH';
    if (a.vsFpm > 300) return 'CLIMB';
    if (a.vsFpm < -300) return 'DESCENT';
    return 'CRUISE';
  }

  // --- player actions ---
  action(name) {
    if (this.state === 'done') return;
    const a = this.ac;
    switch (name) {
      case 'engine': a.toggleEngine(); break;
      case 'flaps': a.cycleFlaps(); break;
      case 'gear': a.toggleGear(); break;
      case 'drop': this.dropStore(); break;
      case 'refuel': this.requestRefuel(); break;
    }
  }

  dropStore() {
    const a = this.ac;
    const r = a.releaseStore();
    if (!r) return;
    const d = this.data;
    const w = {
      pos: r.pos, vel: r.vel, t: 0, missile: d.weaponIsMissile, sprite: d.weaponSprite,
      guideX: null, trail: [], k: d.bombDrag,
    };
    if (d.bombScatterMs > 0) w.vel.x += rand(-d.bombScatterMs, d.bombScatterMs);
    if (d.weaponIsMissile) {
      const tgt = this.missileTarget();
      if (tgt) w.guideX = tgt.x;
      this.seeker = { target: null, t: 0 };
    } else {
      w.predX = predictImpact(r.pos, r.vel, w.k).x;
      if (d.bombGuided) {
        const tgt = this.guidedTargetNear(w.predX);
        if (tgt) w.guideX = tgt.x;
      }
    }
    this.weapons.push(w);
    this.emit(w.missile ? 'missileLaunch' : 'bombRelease', { x: r.pos.x, y: r.pos.y });
    if (a.bombsLeft === 0) this.say(w.guideX != null ? 'Weapon away, guided. Now get out of there!' : 'Last one gone. Egress, head for home!', false);
  }

  // --- targeting (ported from the Godot strike_mission.gd) ---

  // True if a weapon already in the air will take this target out (guided onto it,
  // or an unguided bomb predicted to land on it), so the aids move on to the next.
  claimed(t) {
    const r = this.data.blastRadiusM + t.w / 2;
    return this.weapons.some((w) => (w.guideX != null ? w.guideX === t.x : !w.missile && Math.abs(w.predX - t.x) <= r));
  }

  // Missile can lock: airborne, gear fully up, still flying the mission.
  missileArmed() {
    const a = this.ac;
    return this.mode === 'strike' && !a.onGround && !a.crashed && a.gearPos <= 0 && a.bombsLeft > 0 && this.state === 'flying';
  }

  // Nearest live, unclaimed target between the missile's min and max range ahead.
  missileCandidate() {
    if (!this.missileArmed()) return null;
    const a = this.ac;
    const m = this.data.missile;
    let best = null;
    for (const t of this.targets) {
      const dx = t.x - a.pos.x;
      if (t.alive && dx >= m.rangeMin && dx <= m.rangeMax && !this.claimed(t) && (!best || t.x < best.x)) best = t;
    }
    return best;
  }

  // The seeker must stay on one candidate for lockS seconds (run every step).
  stepSeeker(dt) {
    const c = this.data.weaponIsMissile ? this.missileCandidate() : null;
    if (c && c === this.seeker.target) this.seeker.t += dt;
    else this.seeker = { target: c, t: 0 };
  }

  // Locked target, or null. Fired with no lock, the missile flies on unguided.
  missileTarget() {
    const s = this.seeker;
    return s.target && s.t >= this.data.missile.lockS && s.target.alive ? s.target : null;
  }

  // For the HUD: 'safe' (gear down / on the ground), 'search', 'seeking', 'locked', 'empty'.
  missileState() {
    const a = this.ac;
    if (a.bombsLeft <= 0) return 'empty';
    if (!this.missileArmed()) return 'safe';
    if (this.missileTarget()) return 'locked';
    return this.seeker.target ? 'seeking' : 'search';
  }

  // Guided bombs: the live, unclaimed target nearest x within the guidance reach.
  guidedTargetNear(x) {
    const reach = this.data.guidanceReachM;
    let best = null;
    for (const t of this.targets) {
      if (t.alive && Math.abs(t.x - x) <= reach && !this.claimed(t) && (!best || Math.abs(t.x - x) < Math.abs(best.x - x))) best = t;
    }
    return best;
  }

  // The live target a bomb hitting x would destroy, or null.
  targetAt(x) {
    const r = this.data.blastRadiusM;
    return this.targets.find((t) => t.alive && Math.abs(x - t.x) <= r + t.w / 2) || null;
  }

  // Metres to the next live target ahead (Infinity if none).
  distanceToNextTarget() {
    const a = this.ac;
    let best = Infinity;
    for (const t of this.targets) if (t.alive && t.x > a.pos.x - 50) best = Math.min(best, t.x - a.pos.x);
    return best;
  }

  // Where the weapons already in the air will hit (bomb sight white bars).
  fallingImpacts() {
    const out = [];
    for (const w of this.weapons) {
      if (w.missile) { if (w.guideX != null) out.push(w.guideX); } else out.push(w.predX);
    }
    return out;
  }

  // Guided-weapon bomb sight wanted (F-16s): airborne on the target run with weapons left or in the air.
  sightWanted() {
    const a = this.ac;
    return this.mode === 'strike' && !this.revealed && this.data.bombGuided && !a.crashed && !a.onGround
      && (a.bombsLeft > 0 || this.weapons.length > 0);
  }

  // Unguided release cue (Mirage) for the next live target ahead: seconds until a bomb
  // released now would land on its middle (negative = late), window = +- seconds that
  // still hit it. null if there is none.
  nextRelease() {
    const a = this.ac;
    const aim = this.bombImpact();
    if (!aim || a.vel.x < 1) return null;
    let out = null;
    for (const t of this.targets) {
      if (!t.alive || this.claimed(t)) continue;
      const window = (this.data.blastRadiusM + t.w / 2) / a.vel.x;
      const s = (t.x - aim.x) / a.vel.x;
      if (s > -window - 1.5 && (!out || s < out.seconds)) out = { seconds: s, window, target: t };
    }
    return out;
  }

  requestRefuel() {
    const a = this.ac;
    if (this.state !== 'stopover' || this.refuel) return;
    if (a.engineOn || a.rpm > 0.05) { this.say('Engine OFF first! E! You want to blow us up?', true); return; }
    this.refuel = { t: 0, dur: 5 };
    this.emit('refuelStart');
    this.say('Fuel truck coming. Sit still.');
  }

  // --- simulation step (fixed dt) ---
  snap() {
    const a = this.ac;
    return { x: a.pos.x, y: a.pos.y, pitch: a.pitch, vx: a.vel.x, vy: a.vel.y, gearPos: a.gearPos, elevator: a.elevator };
  }

  // Aircraft state between the last two physics steps, for smooth drawing.
  renderState(alpha) {
    const a = this.ac;
    const p = this.prev || this.snap();
    const c = this.snap();
    const l = (k) => p[k] + (c[k] - p[k]) * alpha;
    let dp = c.pitch - p.pitch;
    if (dp > Math.PI) dp -= Math.PI * 2;
    if (dp < -Math.PI) dp += Math.PI * 2;
    return {
      x: l('x'), y: l('y'), pitch: p.pitch + dp * alpha, vx: l('vx'), vy: l('vy'), gearPos: l('gearPos'), elevator: l('elevator'),
      onGround: a.onGround, afterburner: a.afterburner, rpm: a.rpm, propAngle: a.propAngle,
      bombsLeft: a.bombsLeft, engineOn: a.engineOn,
    };
  }

  step(dt, input) {
    this.prev = this.snap();
    this.time += dt;
    const a = this.ac;
    if (this.state !== 'done') this.flightTime += dt;
    a.step(dt, input);
    for (const e of a.events) this.onAircraftEvent(e);
    a.events.length = 0;
    this.stepWeapons(dt);
    for (const t of this.targets) if (!t.alive) t.deadAt += dt;
    if (this.state === 'done') return;

    if (a.onGround && (this.state === 'rollout' || this.state === 'stopover' || this.state === 'preflight')) this.checkGroundRoll();
    if (this.state === 'preflight' && !a.onGround) this.state = 'flying';
    if (this.state === 'stopover') this.stepRefuel(dt);
    this.instructor();
    if (this.mode === 'strike') { this.stepSeeker(dt); this.stepStrike(); }
    // Too far past everything: fuel or not, end the misery.
    if (a.pos.x > this.lastX + 9000) this.crash('Lost. You flew right past the base.', -1);
  }

  onAircraftEvent(e) {
    const a = this.ac;
    switch (e.type) {
      case 'liftoff':
        if (!this.airborneOnce) this.emit('liftoff');
        this.airborneOnce = true;
        if (this.state === 'stopover' || this.state === 'rollout' || this.state === 'preflight') {
          this.state = 'flying';
          this.worstFpm = 0; this.noseFirst = false; this.overran = false;
        }
        break;
      case 'touchdown': this.onTouchdown(e.vy); a.maybeBounce(); break;
      case 'tailStrike':
        this.crash('Tail strike: you over-rotated near the ground.', Math.max(-a.vel.y, 0) * FT * 60);
        break;
      case 'stall':
        if (!a.onGround) this.say('STALL! Nose DOWN, d*mn it! Get your speed back!', true);
        this.emit('stall');
        break;
      case 'flameout': this.say('Flamed out! No fuel! Glide it in, gently!', true); this.emit('flameout'); break;
      default: this.emit(e.type, e);
    }
  }

  onTouchdown(vy) {
    const a = this.ac;
    const d = this.data;
    const fpm = Math.abs(vy) * FT * 60;
    this.emit('touchdown', { fpm, x: a.pos.x });
    if (this.state !== 'flying') return;
    this.worstFpm = Math.max(this.worstFpm, fpm);
    const where = this.runwayAt(a.pos.x);
    const p = a.touchdownPitch * 180 / Math.PI;
    if (!where) this.crash(fpm > d.hardFpm || p < -d.noseFirstCrashDeg ? 'Flew into the ground.' : 'Touched down off the runway.', fpm);
    else if (a.gearPos < 0.95) this.crash('The gear was up: belly landing.', fpm);
    else if (Math.abs(p) > 90) this.crash('Hit the ground upside down.', fpm);
    else if (p > d.tailStrikeDeg) this.crash('Tail strike: the nose was far too high.', fpm);
    else if (p < -d.noseFirstCrashDeg) this.crash('Slammed it onto the nose wheel. Flare first!', fpm);
    else if (fpm > d.hardFpm) this.crash(`Far too hard: ${Math.round(fpm)} ft/min. The gear collapsed.`, fpm);
    else {
      if (p < -d.maxNoseDownTouchdownDeg) {
        this.noseFirst = true;
        this.say('NOSE WHEEL FIRST?! Main wheels first, raise the nose!', true);
      } else if (fpm <= d.goodFpm) this.say('Smooth. Now brakes! Hold B!', false);
      else this.say('Firm! Brakes, hold B!', false);
      this.state = 'rollout';
      this.landedOn = where;
    }
  }

  checkGroundRoll() {
    const a = this.ac;
    const onRunway = !!this.runwayAt(a.pos.x);
    if (!onRunway && a.speedKt > this.data.overrunCrashKt) {
      this.crash('Ran off the end of the runway.', this.state === 'rollout' ? this.worstFpm : -1);
      return;
    }
    if (!onRunway && this.state === 'rollout') this.overran = true;
    if (this.state === 'rollout' && a.speedKt < 1) {
      if (this.landedOn && this.landedOn !== this.dest && this.landedOn.x > 0 && this.landedOn.x < this.dest.x) this.beginStopover();
      else this.finishLanding();
    }
  }

  beginStopover() {
    this.state = 'stopover';
    this.say(`Stopped at ${this.landedOn.short}. Engine off (E), then T for fuel.`, true);
  }

  stepRefuel(dt) {
    const r = this.refuel;
    if (!r) return;
    r.t += dt;
    const a = this.ac;
    const add = (this.data.fuelKg / r.dur) * dt;
    const before = a.fuel;
    a.fuel = Math.min(this.data.fuelKg, a.fuel + add);
    this.extraFuel += a.fuel - before;
    if (r.t >= r.dur) {
      this.refuel = null;
      this.emit('refuelDone');
      this.say(`Tanks full. Start up and get to ${this.dest.short}!`, true);
    }
  }

  stepStrike() {
    const a = this.ac;
    const d = this.data;
    const live = this.targets.filter((t) => t.alive);
    const dist = this.distanceToNextTarget();
    if (!this.revealed && !a.onGround && !a.crashed && dist < 3000) {
      const km = (dist / 1000).toFixed(1);
      if (d.weaponIsMissile) this.say(`Targets ${km} km! Wait for LOCK on the sight, then SPACE to fire!`, false, 'targets');
      else if (d.bombGuided) this.say(`Targets ${km} km! Down to 300 ft. Target in the bracket, then SPACE!`, false, 'targets');
      else this.say(`Targets ${km} km! Down to 300 ft. Watch the RELEASE CUE, drop on DROP!`, false, 'targets');
    }
    if (d.weaponIsMissile && !this.revealed && !a.onGround && a.gearPos > 0 && a.bombsLeft > 0
      && this.targets.some((t) => t.alive && t.x - a.pos.x <= d.missile.rangeMax && t.x > a.pos.x)) {
      this.say(`Gear UP! The ${d.weaponName} stays SAFE with the wheels hanging out!`, true, 'armgear');
    }
    if (!this.revealed) {
      const last = this.targets[this.targets.length - 1].x;
      const over = live.length === 0 || (a.bombsLeft === 0 && this.weapons.length === 0) || a.pos.x > last + 300;
      if (over && this.weapons.length === 0) {
        this.revealed = true;
        this.dest.visible = true;
        const hit = this.targets.length - live.length;
        this.say(`${hit}/${this.targets.length} targets down. Recover at ${this.dest.short}. Go!`, true);
        this.emit('revealed');
      }
    }
  }

  stepWeapons(dt) {
    const d = this.data;
    for (let i = this.weapons.length - 1; i >= 0; i--) {
      const w = this.weapons[i];
      w.t += dt;
      if (w.missile) {
        const m = d.missile;
        if (w.t < m.dropS || w.guideX == null) {
          w.vel = bombStep(w.vel, w.k, dt);
          if (w.t >= m.dropS && w.t < m.dropS + m.burnS) {
            const s = Math.hypot(w.vel.x, w.vel.y) || 1;
            w.vel.x += w.vel.x / s * m.accel * dt; w.vel.y += w.vel.y / s * m.accel * dt;
          }
        } else {
          const dist = w.guideX - w.pos.x;
          // Cruise missile: hold cruiseAltM, dive in the last diveM. Others: loft.
          const aimY = m.cruiseAltM != null ? (dist > m.diveM ? m.cruiseAltM : 0) : clamp(dist * m.loft, 0, m.loftMax);
          const want = Math.atan2(aimY - w.pos.y, w.guideX - w.pos.x);
          let heading = Math.atan2(w.vel.y, w.vel.x);
          let diff = want - heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const turn = m.turnDeg * Math.PI / 180 * dt;
          heading += clamp(diff, -turn, turn);
          let s = Math.hypot(w.vel.x, w.vel.y);
          if (w.t < m.dropS + m.burnS) s += clamp(m.speed - s, -m.accel * dt, m.accel * dt);
          w.vel = { x: Math.cos(heading) * s, y: Math.sin(heading) * s };
        }
        w.motor = w.t >= m.dropS && w.t < m.dropS + m.burnS;
      } else {
        if (w.guideX != null) {
          const hit = predictImpact(w.pos, w.vel, w.k);
          w.predX = hit.x;
          const need = (w.guideX - hit.x) / Math.max(hit.t, 0.3);
          w.vel.x += clamp(need, -d.guidanceAccel * dt, d.guidanceAccel * dt);
        }
        w.vel = bombStep(w.vel, w.k, dt);
      }
      w.pos = { x: w.pos.x + w.vel.x * dt, y: w.pos.y + w.vel.y * dt };
      if (w.pos.y <= 0) {
        this.weapons.splice(i, 1);
        this.impact(w.pos.x);
      }
    }
  }

  impact(x) {
    const r = this.data.blastRadiusM;
    let hit = null;
    for (const t of this.targets) {
      if (t.alive && Math.abs(t.x - x) <= r + t.w * 0.5) { t.alive = false; hit = t; }
    }
    this.emit('explosion', { x, y: 0, big: !!hit, kind: hit?.kind });
    if (hit) this.say(['SHACK! Direct hit!', 'Target destroyed! Good drop!', 'That one is gone. Next!'][Math.floor(Math.random() * 3)], true);
    else this.say(`Missed by ${Math.round(Math.min(...this.targets.map((t) => Math.abs(t.x - x))))} m. Wake up!`, true);
  }

  // Where a bomb released now would land, from the hardpoint the next bomb leaves
  // (same as Aircraft.releaseStore). target: the target it would get (guided: within
  // reach; unguided: within the blast). Cached per physics step: HUD and renderer share it.
  bombImpact() {
    if (this.aimCacheT === this.time) return this.aimCache;
    this.aimCacheT = this.time;
    this.aimCache = null;
    const a = this.ac;
    const d = this.data;
    if (this.mode !== 'strike' || a.bombsLeft <= 0 || a.onGround || a.crashed || d.weaponIsMissile) return null;
    const hp = d.hardpoints[Math.min(a.bombsLeft - 1, d.hardpoints.length - 1)];
    const p = a.pointM(hp[0], hp[1] + 6);
    const e = d.bombEjectMs;
    const v = { x: a.vel.x + Math.sin(a.pitch) * e, y: a.vel.y - Math.cos(a.pitch) * e };
    const hit = predictImpact(p, v, d.bombDrag);
    const target = d.bombGuided ? this.guidedTargetNear(hit.x) : this.targetAt(hit.x);
    this.aimCache = { x: hit.x, t: hit.t, onTarget: !!target, target };
    return this.aimCache;
  }

  instructor() {
    const a = this.ac;
    const d = this.data;
    if (a.engineOn && a.rpm > 0.9 && a.throttle < 0.3 && a.onGround && this.state === 'preflight') {
      if (this.time > 6) this.say('Throttle UP! Hold the up arrow! Today, please!', false, 'throttle');
    }
    if (a.onGround && this.state === 'preflight' && a.speedKt > d.rotateKt * 0.75) {
      this.say(`Rotate at ${d.rotateKt} kt. Left arrow, gently!`, false, 'rotate');
    }
    if (!a.onGround && a.altFt > 150 && a.gearDown && d.retractableGear && this.state === 'flying' && a.vsFpm > 0 && !this.said.has('gearup2')) {
      this.say('Positive climb. GEAR UP! G!', false, 'gearup');
      if (a.altFt > 900) this.say('Your gear is STILL down! G!', true, 'gearup2');
    }
    if (!a.onGround && a.altFt > 600 && a.flapSetting > 0 && !a.gearDown && this.state === 'flying' && this.dest.x - a.pos.x > 3500) {
      this.say('Flaps up. F. Clean it up!', false, 'flapsup');
    }
    if (d.afterburnerN > 0 && !a.onGround && a.altFt > 1500) this.say('Push past the red mark for afterburner. It drinks fuel.', false, 'ab');
    if (a.lowFuel && a.engineOn) this.say('Fuel is LOW. Land it soon, or glide it.', true, 'lowfuel');
    if (this.revealed && this.state === 'flying') {
      const toGo = this.dest.x - a.pos.x;
      if (toGo > 0 && toGo < 3500) {
        this.say(`${this.dest.short} ahead. Gear down, flaps LDG, about ${this.approachKt()} kt.`, false, 'approach');
      }
      if (toGo > 0 && toGo < 1800 && a.speedKt > this.approachKt() * 1.35 && a.altFt < 1500) this.say('Too FAST! Throttle back, air brake B!', true, 'fast');
    }
    if (a.gearWarning) this.say('GEAR! Are you blind?! GEAR DOWN!', true, 'gearwarn');
    if (!a.onGround && a.pos.y < 40 && a.pos.y > 2 && a.vsFpm < -1500) this.say('PULL UP! PULL UP!', true, `pullup${Math.floor(this.time / 6)}`);
  }

  gradeFor(fpm) {
    const d = this.data;
    const lim = [d.perfectFpm, d.goodFpm, d.firmFpm];
    for (let i = 0; i < lim.length; i++) if (fpm <= lim[i]) return i;
    return 3;
  }

  baseResult() {
    return {
      timeS: this.flightTime,
      fuelUsedKg: this.fuelStart + this.extraFuel - this.ac.fuel,
      fuelCapKg: this.data.fuelKg,
      fpm: this.worstFpm,
      targets: this.mode === 'strike' ? { hit: this.targets.filter((t) => !t.alive).length, total: this.targets.length } : null,
      weapons: this.mode === 'strike' ? { used: this.data.bombCount - this.ac.bombsLeft, total: this.data.bombCount, name: this.data.weaponName } : null,
      mode: this.mode,
      from: this.bases[0].short,
      aircraft: this.data.name,
      dest: this.dest.short,
      reasons: [],
    };
  }

  finishLanding() {
    const r = this.baseResult();
    if (this.landedOn !== this.dest) {
      r.grade = 'WRONG BASE';
      r.title = 'WRONG BASE';
      r.reasons.push(`You landed at ${this.landedOn.short}. The mission was ${this.dest.short}.`);
      this.say(`${this.landedOn.short}?! Wrong base! Read the briefing!`, true);
    } else {
      let g = this.gradeFor(this.worstFpm);
      if (this.noseFirst) { g = Math.min(g + 1, 3); r.reasons.push('Nose wheel touched first (one grade lower).'); }
      if (this.overran) { g = Math.min(g + 1, 3); r.reasons.push('Rolled past the runway end (one grade lower).'); }
      r.grade = GRADES[g];
      r.title = `${GRADES[g]} LANDING`;
      const lines = ['Shabash! That is how it is done.', 'Good. Not bad at all.', 'Firm. My back hurts. Again.', 'HARD! You nearly broke it!'];
      this.say(lines[g], true);
    }
    r.score = this.score(r);
    this.end(r);
  }

  score(r) {
    if (r.grade === 'CRASH') return 0;
    const base = { PERFECT: 1000, GOOD: 800, FIRM: 550, HARD: 300, 'WRONG BASE': 150 }[r.grade] || 0;
    const fuel = Math.round(300 * clamp(1 - r.fuelUsedKg / r.fuelCapKg, 0, 1));
    const tgt = r.targets ? r.targets.hit * 400 : 0;
    return base + fuel + tgt;
  }

  crash(reason, fpm = -1) {
    if (this.state === 'done') return;
    const a = this.ac;
    const d = this.data;
    const sink = Math.max(fpm, 0);
    const severity = clamp(sink / (3 * d.hardFpm) + Math.max(a.speedKt / d.stallKt - 1, 0) * 0.5, 0, 1);
    this.emit('crash', { severity, x: a.pos.x, y: a.pos.y, pitch: a.pitch, vx: a.vel.x, vy: a.vel.y });
    a.crash();
    const r = this.baseResult();
    r.grade = 'CRASH';
    r.title = 'CRASH';
    r.reasons.push(reason);
    if (fpm >= 0) r.fpm = fpm;
    r.score = 0;
    this.say(`You CRASHED my aircraft! ${reason} Again!`, true);
    this.end(r);
  }

  end(r) {
    this.state = 'done';
    this.ac.controls = false;
    this.result = r;
    this.emit('end', { result: r });
  }
}

export { KT, FT };
