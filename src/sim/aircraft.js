// Arcade flight model, ported from the Godot Aircraft node.
// pos.x = metres along the route, pos.y = altitude of the main wheels.
// Forces: thrust along the nose, lift across the flight path, drag against it,
// gravity; on the ground: normal force, rolling friction and brakes.

export const KT = 1.94384;
export const FT = 3.28084;
export const G = 9.81;
const D2R = Math.PI / 180;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const moveToward = (v, to, d) => (Math.abs(to - v) <= d ? to : v + Math.sign(to - v) * d);
const wrapAngle = (a) => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};

export const FLAP_NAMES = ['UP', 'TO', 'LDG'];

export class Aircraft {
  constructor(data) {
    this.data = data;
    this.throttleRate = 1.6;
    this.gearWarningFt = 1000;
    this.events = []; // {type, ...} drained by the flight controller each step
    this.reset(60);
  }

  reset(x = 60) {
    const d = this.data;
    this.pos = { x, y: 0 };
    this.vel = { x: 0, y: 0 };
    this.pitch = 0;
    this.pitchRate = 0;
    this.aoa = 0;
    this.throttle = 0;
    this.onGround = true;
    this.braking = false;
    this.stalled = false;
    this.stallTimer = 0;
    this.liftRatio = 0;
    this.engineOn = false;
    this.rpm = 0;
    this.fuel = d.fuelKg;
    this.flapSetting = d.defaultFlap;
    this.flapDir = -1;
    this.flapPos = d.defaultFlap;
    this.gearDown = true;
    this.gearPos = 1;
    this.controls = true;
    this.crashed = false;
    this.bombsLeft = 0;
    this.touchdownPitch = 0;
    this.elevator = 0;
    this.landingRoll = false;
    this.bounced = false;
    this.gLoad = 1;
    this.blackout = 0;
    this.redout = 0;
    this.prevVel = { x: 0, y: 0 };
    this.propAngle = 0;
    this.time = 0;
    this.stick = 0;
  }

  get speed() { return Math.hypot(this.vel.x, this.vel.y); }
  get speedKt() { return this.speed * KT; }
  get altFt() { return this.pos.y * FT; }
  get vsFpm() { return this.vel.y * FT * 60; }
  get fuelFraction() { return this.fuel / this.data.fuelKg; }
  get lowFuel() { return this.fuelFraction < this.data.lowFuelFraction; }
  get gearInTransit() { return this.gearPos > 0 && this.gearPos < 1; }
  get airbrakeOut() { return this.braking && !this.onGround; }
  get gearWarning() {
    const d = this.data;
    return d.retractableGear && !this.onGround && this.gearPos < 1 && this.altFt < this.gearWarningFt
      && this.speedKt < d.stallKt * 1.5 && this.vsFpm < 0;
  }
  get afterburner() {
    const d = this.data;
    if (d.afterburnerN <= 0 || this.rpm < 0.95) return 0;
    return clamp((this.throttle - d.afterburnerThreshold) / (1 - d.afterburnerThreshold), 0, 1);
  }

  // --- one-shot controls ---
  toggleEngine() {
    if (!this.controls) return;
    this.engineOn = !this.engineOn && this.fuel > 0;
    this.events.push({ type: this.engineOn ? 'engineStart' : 'engineStop' });
  }
  cycleFlaps() {
    if (!this.controls) return;
    if (this.flapSetting + this.flapDir < 0 || this.flapSetting + this.flapDir >= FLAP_NAMES.length) this.flapDir = -this.flapDir;
    this.flapSetting += this.flapDir;
    this.events.push({ type: 'flaps', setting: this.flapSetting });
  }
  toggleGear() {
    if (!this.controls || !this.data.retractableGear) return;
    if (this.onGround && this.gearDown) return;
    this.gearDown = !this.gearDown;
    this.events.push({ type: 'gear', down: this.gearDown });
  }

  step(dt, input) {
    this.time += dt;
    if (this.crashed) return;
    this.stallTimer = Math.max(0, this.stallTimer - dt);
    this.propAngle = (this.propAngle + this.rpm * 30 * dt) % (Math.PI * 2);
    this.readControls(dt, input);
    this.updateSystems(dt);
    this.updatePitch(dt);
    this.integrate(dt);
    this.updateG(dt);
  }

  readControls(dt, input) {
    if (!this.controls) {
      this.throttle = moveToward(this.throttle, 0, this.throttleRate * dt);
      this.braking = this.onGround;
      this.stick = 0;
      return;
    }
    if (input.throttleSet != null) this.throttle = input.throttleSet;
    else this.throttle = clamp(this.throttle + input.throttle * this.throttleRate * dt, 0, 1);
    this.braking = input.brake;
    this.stick = clamp(input.pitch, -1, 1);
  }

  updateSystems(dt) {
    const d = this.data;
    this.rpm = moveToward(this.rpm, this.engineOn ? 1 : 0, dt / Math.max(d.engineSpoolS, 0.01));
    if (this.rpm > 0) {
      let burn = d.burnFullKgS * lerp(d.idleBurnFraction, 1, Math.min(this.throttle, 1));
      burn *= lerp(1, d.afterburnerBurnMult, this.afterburner);
      this.fuel = Math.max(0, this.fuel - burn * this.rpm * dt);
      if (this.fuel <= 0 && this.engineOn) {
        this.engineOn = false;
        this.events.push({ type: 'flameout' });
      }
    }
    this.flapPos = moveToward(this.flapPos, this.flapSetting, dt / Math.max(d.flapMoveS, 0.01));
    if (!d.retractableGear) { this.gearDown = true; this.gearPos = 1; }
    else {
      const before = this.gearPos;
      this.gearPos = moveToward(this.gearPos, this.gearDown ? 1 : 0, dt / Math.max(d.gearTransitS, 0.01));
      if (before !== this.gearPos && (this.gearPos === 0 || this.gearPos === 1)) this.events.push({ type: 'gearLocked', down: this.gearPos === 1 });
    }
  }

  updatePitch(dt) {
    const d = this.data;
    const speed = this.speed;
    const rotateMs = d.rotateKt / KT;
    const authority = clamp(speed / rotateMs, 0.25, 1);
    const stick = this.stick;
    this.elevator = moveToward(this.elevator, stick, d.elevatorSpeed * dt);
    let target = stick * d.pitchRateDeg * D2R * authority;
    if (this.onGround && this.landingRoll && stick <= 0) target = Math.min(target, -d.derotateDeg * D2R);
    const takeoffAttitude = (d.maxGroundPitchDeg - 2) * D2R;
    if (this.onGround && !this.landingRoll && stick >= 0 && this.pitch > D2R && speed >= rotateMs && this.pitch < takeoffAttitude) {
      target = Math.max(target, d.autoRotateDeg * D2R);
    }
    this.pitchRate = moveToward(this.pitchRate, target, d.pitchAccelDeg * D2R * dt);
    const prev = this.pitch;
    this.pitch += this.pitchRate * dt;

    if (this.onGround) {
      let upper;
      let lowerRate = d.pitchRateDeg * D2R;
      if (this.landingRoll) {
        const down = rotateMs * d.noseDownFraction;
        const hold = clamp((speed - down) / Math.max(rotateMs * 0.15, 0.1), 0, 1);
        upper = d.maxGroundPitchDeg * D2R * hold;
        lowerRate = d.derotateDeg * D2R;
        if (hold >= 1) upper = Infinity;
      } else {
        const start = rotateMs * d.rotateStartFraction;
        const allow = clamp((speed - start) / Math.max(rotateMs - start, 0.1), 0, 1);
        upper = speed < rotateMs ? d.maxGroundPitchDeg * D2R * allow : Infinity;
      }
      if (this.pitch > upper) {
        this.pitch = prev > upper ? Math.max(upper, Math.min(this.pitch, prev - lowerRate * dt)) : upper;
        this.pitchRate = Math.min(this.pitchRate, 0);
      }
      if (this.pitch < 0) { this.pitch = 0; this.pitchRate = Math.max(this.pitchRate, 0); }
    } else {
      this.pitch = wrapAngle(this.pitch);
    }
    this.checkTailStrike();
  }

  tailArmM() { return this.data.pivot[0] * this.data.texM; }

  checkTailStrike() {
    const s = this.data.tailStrikeDeg * D2R;
    if (this.crashed || this.pitch <= s || this.pitch > Math.PI / 2) return;
    const reach = this.tailArmM() * (Math.sin(this.pitch) - Math.sin(s));
    if (this.pos.y < reach) this.events.push({ type: 'tailStrike' });
  }

  flapValue(arr) {
    const i = clamp(Math.floor(this.flapPos), 0, arr.length - 1);
    const j = Math.min(i + 1, arr.length - 1);
    return lerp(arr[i], arr[j], this.flapPos - i);
  }

  liftFraction(a) {
    const d = this.data;
    const stallA = d.stallAoaDeg * D2R;
    const absA = Math.abs(a);
    if (this.onGround) this.stalled = false;
    else if (absA > stallA) {
      if (!this.stalled) { this.stallTimer = d.minStallTimeS; this.events.push({ type: 'stall' }); }
      this.stalled = true;
    } else if (this.stalled && this.stallTimer <= 0 && absA < stallA - 3 * D2R) this.stalled = false;
    const edge = d.zeroAoaLift + (1 - d.zeroAoaLift) * Math.sign(a);
    if (absA <= stallA) return d.zeroAoaLift + (1 - d.zeroAoaLift) * a / stallA;
    const t = clamp((absA - stallA) / (5 * D2R), 0, 1);
    const cl = lerp(edge, d.postStallLift * Math.sign(a), t);
    return cl * clamp(Math.cos(absA) * 2, 0, 1);
  }

  thrust(speed) {
    const d = this.data;
    let t;
    if (d.afterburnerN > 0) {
      t = (d.maxThrustN * clamp(this.throttle / d.afterburnerThreshold, 0, 1) + d.afterburnerN * this.afterburner) * this.rpm;
    } else t = d.maxThrustN * this.throttle * this.rpm;
    if (d.thrustZeroSpeedKt > 0) t *= Math.max(0, 1 - speed * KT / d.thrustZeroSpeedKt);
    t *= clamp(1 - (this.pos.y - d.serviceCeilingM) / d.ceilingFadeM, 0, 1);
    return t;
  }

  integrate(dt) {
    const d = this.data;
    const weight = d.massKg * G;
    const speed = this.speed;
    const nose = { x: Math.cos(this.pitch), y: Math.sin(this.pitch) };
    const path = speed > 0.5 ? { x: this.vel.x / speed, y: this.vel.y / speed } : nose;

    this.aoa = wrapAngle(this.pitch - Math.atan2(path.y, path.x));
    const cl = this.liftFraction(this.aoa) * (1 + this.flapValue(d.flapLift));
    const vs = d.stallKt / KT;
    const liftMag = weight * (speed / vs) * (speed / vs) * cl;
    this.liftRatio = liftMag / weight;

    const dragMult = 1 + d.inducedDrag * cl * cl + this.flapValue(d.flapDrag) + d.gearDrag * this.gearPos
      + (this.airbrakeOut ? d.airbrakeDrag : 0)
      + (this.onGround ? 0 : d.pitchRateDrag * Math.abs(this.pitchRate / D2R));
    const dragMag = d.dragCoef * speed * speed * dragMult;
    const thrust = this.thrust(speed);
    let fx = -path.y * liftMag - path.x * dragMag + nose.x * thrust;
    let fy = path.x * liftMag - path.y * dragMag + nose.y * thrust - weight;
    const along = (fx * path.x + fy * path.y) * (d.speedResponse - 1);
    fx += path.x * along;
    fy += path.y * along;

    if (this.onGround) {
      if (fy > 0) {
        this.onGround = false;
        this.landingRoll = false;
        this.bounced = false;
        this.events.push({ type: 'liftoff' });
      } else {
        const normal = -fy;
        let v = this.vel.x + fx / d.massKg * dt;
        const resist = d.rollingFriction + (this.braking ? d.brakeStrength : 0);
        const dv = resist * normal / d.massKg * dt;
        v = v <= dv ? 0 : v - dv;
        this.vel.x = v; this.vel.y = 0;
        this.pos.x += v * dt; this.pos.y = 0;
        return;
      }
    }

    this.vel.x += fx / d.massKg * dt;
    this.vel.y += fy / d.massKg * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;

    if (this.pos.y <= 0) {
      const vy = this.vel.y;
      this.pos.y = 0;
      this.vel.y = 0;
      this.onGround = true;
      this.landingRoll = true;
      this.stalled = false;
      this.touchdownPitch = this.pitch;
      if (this.pitch < 0) this.pitch = 0;
      this.events.push({ type: 'touchdown', vy });
      this.pendingBounceVy = vy;
    }
  }

  // Called by the flight controller after it judged the touchdown (a crash wins).
  maybeBounce() {
    const d = this.data;
    const vy = this.pendingBounceVy;
    this.pendingBounceVy = null;
    if (vy == null || this.crashed || this.bounced) return;
    const fpm = Math.abs(vy) * FT * 60;
    if (fpm <= d.bounceFromFpm || fpm > d.hardFpm) return;
    const t = clamp((fpm - d.bounceFromFpm) / Math.max(d.hardFpm - d.bounceFromFpm, 1), 0, 1);
    const h = lerp(d.bounceMinM, d.bounceMaxM, t);
    this.vel.y = Math.sqrt(2 * G * h);
    this.pos.y = 0.01;
    this.bounced = true;
    this.onGround = false;
    this.landingRoll = false;
  }

  updateG(dt) {
    const d = this.data;
    const ax = (this.vel.x - this.prevVel.x) / dt;
    const ay = (this.vel.y - this.prevVel.y) / dt + G;
    this.prevVel = { x: this.vel.x, y: this.vel.y };
    // G along the seat axis (perpendicular to the nose).
    const up = { x: -Math.sin(this.pitch), y: Math.cos(this.pitch) };
    const g = (ax * up.x + ay * up.y) / G;
    this.gLoad = lerp(this.gLoad, g, clamp(dt * 8, 0, 1));
    if (!d.gEffects || this.speedKt < d.gEffectMinKt) {
      this.blackout = moveToward(this.blackout, 0, dt * 1.2);
      this.redout = moveToward(this.redout, 0, dt * 1.2);
      return;
    }
    const bt = clamp((this.gLoad - d.blackoutStartG) / (d.blackoutFullG - d.blackoutStartG), 0, 1);
    const rt = clamp((this.gLoad - d.redoutStartG) / (d.redoutFullG - d.redoutStartG), 0, 1);
    this.blackout = moveToward(this.blackout, bt, dt * (bt > this.blackout ? 0.8 : 1.2));
    this.redout = moveToward(this.redout, rt, dt * (rt > this.redout ? 0.8 : 1.2));
  }

  // World position (m) of a point on the sprite (texture px).
  pointM(tx, ty) {
    const d = this.data;
    const lx = (tx - d.pivot[0]) * d.texM;
    const ly = -(ty - d.pivot[1]) * d.texM;
    const c = Math.cos(this.pitch), s = Math.sin(this.pitch);
    return { x: this.pos.x + lx * c - ly * s, y: this.pos.y + lx * s + ly * c };
  }

  // Release the next store. Returns {pos, vel} or null.
  releaseStore() {
    if (this.bombsLeft <= 0 || this.onGround || this.crashed || !this.controls) return null;
    this.bombsLeft -= 1;
    const d = this.data;
    const hp = d.hardpoints[Math.min(this.bombsLeft, d.hardpoints.length - 1)];
    const pos = this.pointM(hp[0], hp[1] + 6);
    const e = d.bombEjectMs;
    return { pos, vel: { x: this.vel.x + Math.sin(this.pitch) * e, y: this.vel.y - Math.cos(this.pitch) * e } };
  }

  crash() {
    this.crashed = true;
    this.controls = false;
    this.blackout = 0; this.redout = 0;
    this.engineOn = false; this.rpm = 0; this.throttle = 0;
    this.stalled = false;
    this.vel = { x: 0, y: 0 };
    this.gLoad = 1;
    this.pos.y = 0;
  }
}
