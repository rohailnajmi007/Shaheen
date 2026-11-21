import { SONIC } from './data/aircraft.js';
import { MACH_KT } from './sim/aircraft.js';
// All sound is made in code with Web Audio (no sound files), except the crash song.

// Crash song (owner 2026-11-21): plays in the background after a crash. The owner
// supplies the file (it is a commercial recording: not bundled); no file = no song.
// Rounds hitting metal: volume, ring base frequency, partials [ratio, level, decay s],
// and at most one hit sound per minGapS (a burst sounds like a rattle, not a buzz).
export const METAL_HIT = {
  vol: 0.55, minGapS: 0.05,
  crack: { hz: 3500, q: 0.7, dur: 0.018 },        // supersonic snap of the impact
  body: { hz: [900, 1500, 2300], q: 9, dur: 0.045 }, // sheet metal: narrow noise bands, very short (no ringing tone)
  thud: { hz: 260, dur: 0.07 },                     // the structure taking it (low, dull)
};
export const CRASH_SONG = { url: '/audio/crash_song.mp3', vol: 0.55, fadeInS: 2.5, fadeOutS: 1.2 };

export class Sound {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.8, engine: 0.7, effects: 0.8 };
    this.muted = false;
    this.nodes = null;
  }

  // Must run from a user gesture (browser rule).
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const c = new C();
    this.ctx = c;
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    this.master.connect(comp).connect(c.destination);
    // Engine sound through a low-pass: wide open, closed down when supersonic (SONIC).
    this.muffle = c.createBiquadFilter(); this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000;
    this.muffleG = c.createGain();
    // Supersonic (owner 2026-11-21): engine AND effects are muffled; the boom itself
    // goes on its own bus (boomBus) straight to the master, so it stays loud and clear.
    this.muffle.connect(this.muffleG).connect(this.master);
    this.engineBus = c.createGain(); this.engineBus.connect(this.muffle);
    this.fxBus = c.createGain(); this.fxBus.connect(this.muffle);
    this.boomBus = c.createGain(); this.boomBus.connect(this.master);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
  }

  setVolumes(v) { Object.assign(this.vol, v); this.applyVolumes(); }
  toggleMute() { this.muted = !this.muted; this.applyVolumes(); return this.muted; }
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol.master, t, 0.05);
    this.engineBus.gain.setTargetAtTime(this.vol.engine, t, 0.05);
    this.fxBus.gain.setTargetAtTime(this.vol.effects, t, 0.05);
    this.boomBus.gain.setTargetAtTime(this.vol.effects, t, 0.05);
  }

  noiseSrc() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise; s.loop = true;
    s.loopStart = Math.random(); // decorrelate loops
    return s;
  }

  gain(v, to) { const g = this.ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; }
  filter(type, f, q = 0.7) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  osc(type, f) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }

  startFlight(data) {
    this.stopFlight();
    if (!this.ctx) return;
    const c = this.ctx;
    const n = { srcs: [] };
    const start = (s) => { s.start(); n.srcs.push(s); return s; };
    if (data.sound === 'prop') {
      n.prop = start(this.osc('sawtooth', 40));
      n.prop2 = start(this.osc('square', 80));
      n.propF = this.filter('lowpass', 500, 2);
      n.propG = this.gain(0, this.engineBus);
      n.prop.connect(n.propF); n.prop2.connect(this.gain(0.25, n.propF)); n.propF.connect(n.propG);
      // Engine "chop" from a tremolo.
      n.lfo = start(this.osc('sine', 20));
      n.lfoG = this.gain(0.25); n.lfo.connect(n.lfoG); n.lfoG.connect(n.propG.gain);
    } else {
      n.roar = start(this.noiseSrc());
      n.roarF = this.filter('bandpass', 400, 0.8);
      n.roarG = this.gain(0, this.engineBus);
      n.roar.connect(n.roarF).connect(n.roarG);
      n.whine = start(this.osc('sine', 800));
      n.whineG = this.gain(0, this.engineBus);
      n.whine.connect(n.whineG);
      n.ab = start(this.noiseSrc());
      n.abF = this.filter('lowpass', 160, 0.9);
      n.abG = this.gain(0, this.engineBus);
      n.ab.connect(n.abF).connect(n.abG);
    }
    n.wind = start(this.noiseSrc());
    n.windF = this.filter('bandpass', 700, 0.5);
    n.windG = this.gain(0, this.fxBus);
    n.wind.connect(n.windF).connect(n.windG);
    n.rumble = start(this.noiseSrc());
    n.rumbleF = this.filter('lowpass', 110, 1);
    n.rumbleG = this.gain(0, this.fxBus);
    n.rumble.connect(n.rumbleF).connect(n.rumbleG);
    n.horn = start(this.osc('square', 420));
    n.hornG = this.gain(0, this.fxBus);
    n.horn.connect(this.filter('lowpass', 1800)).connect(n.hornG);
    n.warn = start(this.osc('triangle', 1000));
    n.warnG = this.gain(0, this.fxBus);
    n.warn.connect(n.warnG);
    // Gun: band-passed noise chopped at the gun's fire rate ("brrrt").
    n.gun = start(this.noiseSrc());
    n.gunF = this.filter('bandpass', 420, 0.9);
    n.gunG = this.gain(0, this.fxBus);
    n.gun.connect(n.gunF).connect(n.gunG);
    n.gunLfo = start(this.osc('sawtooth', data.gun ? data.gun.rps : 50));
    n.gunAm = this.gain(0);
    n.gunLfo.connect(n.gunAm); n.gunAm.connect(n.gunG.gain);
    // Radar warning receiver: lock beeps, missile-launch warble.
    // Missile seeker (owner 2026-11-21): the growl sounded comical, so no tone while it
    // searches; a short soft double beep when it locks (lockBeep, from main.js).
    n.rwr = start(this.osc('square', 1100));
    n.rwrG = this.gain(0, this.fxBus);
    n.rwr.connect(this.filter('lowpass', 2500)).connect(n.rwrG);
    this.nodes = n;
    this.lastSet = null;
    this.data = data;
    void c;
  }

  // The song runs through the master bus, so mute and the master volume apply.
  playCrashSong() {
    if (!this.ctx || this.song) return;
    const el = new Audio(CRASH_SONG.url);
    el.loop = true;
    const g = this.gain(0, this.master);
    this.ctx.createMediaElementSource(el).connect(g);
    g.gain.setTargetAtTime(CRASH_SONG.vol, this.ctx.currentTime, CRASH_SONG.fadeInS / 3);
    el.play().catch(() => { /* file missing or blocked: stay silent */ });
    this.song = { el, g };
  }
  stopCrashSong() {
    const s = this.song;
    if (!s) return;
    this.song = null;
    s.g.gain.setTargetAtTime(0, this.ctx.currentTime, CRASH_SONG.fadeOutS / 3);
    setTimeout(() => { s.el.pause(); s.g.disconnect(); }, CRASH_SONG.fadeOutS * 1000 + 200);
  }
  pauseSong(on) { if (this.song) { if (on) this.song.el.pause(); else this.song.el.play().catch(() => {}); } }

  stopFlight() {
    this.stopCrashSong();
    // Never leave the menu muffled after a supersonic flight.
    if (this.muffle) { const t = this.ctx.currentTime; this.muffle.frequency.setTargetAtTime(20000, t, 0.05); this.muffleG.gain.setTargetAtTime(1, t, 0.05); }
    if (!this.nodes) return;
    for (const s of this.nodes.srcs) { try { s.stop(); } catch { /* already stopped */ } }
    this.nodes = null;
    this.lastSet = null;
  }

  update(ac, onGround, alarms) {
    const n = this.nodes;
    if (!n || !this.ctx) return;
    const t = this.ctx.currentTime;
    // Only re-aim a parameter when its target moved (calling setTargetAtTime on ~18
    // parameters every frame was a measurable cost, owner 2026-11-21 dogfight lag).
    const last = this.lastSet || (this.lastSet = new Map());
    const set = (p, v, k = 0.06) => {
      const o = last.get(p);
      if (o !== undefined && Math.abs(o - v) <= Math.max(0.002, Math.abs(v) * 0.004)) return;
      last.set(p, v);
      p.setTargetAtTime(v, t, k);
    };
    const off = !!alarms.engineOff;
    const rpm = off ? 0 : ac.rpm, thr = off ? 0 : ac.throttle;
    const spd = ac.speed;
    if (this.data.sound === 'prop') {
      const f = 28 + rpm * (32 + thr * 50);
      set(n.prop.frequency, f); set(n.prop2.frequency, f * 2.01);
      set(n.lfo.frequency, f * 0.5);
      set(n.propF.frequency, 300 + rpm * (300 + thr * 900));
      set(n.propG.gain, rpm > 0.02 ? 0.12 + rpm * (0.12 + thr * 0.2) : 0, off ? 0.35 : 0.06);
    } else {
      set(n.roarF.frequency, 200 + rpm * (300 + thr * 700));
      set(n.roarG.gain, rpm * (0.15 + thr * 0.45), off ? 0.35 : 0.06); // off: a short spool-down fade
      set(n.whine.frequency, 300 + rpm * (900 + thr * 700) * (this.data.id === 'mirage5' ? 0.8 : 1));
      set(n.whineG.gain, rpm * 0.025 * (1 - thr * 0.5), off ? 0.35 : 0.06);
      set(n.abG.gain, off ? 0 : ac.afterburner * 1.2, off ? 0.2 : 0.06);
    }
    const sup = ac.speedKt / MACH_KT >= SONIC.muffleFrom;
    set(this.muffle.frequency, sup ? SONIC.muffleHz : 20000, 0.25);
    set(this.muffleG.gain, sup ? SONIC.muffleGain : 1, 0.25);
    set(n.windG.gain, Math.min(0.5, (spd / 150) ** 2 * 0.4) * (ac.airbrakeOut ? 1.8 : 1));
    set(n.windF.frequency, 400 + spd * 4);
    set(n.rumbleG.gain, onGround ? Math.min(0.8, spd / 60) : 0, 0.03);
    const beat = (t * 4) % 1 < 0.5;
    set(n.hornG.gain, alarms.stall ? 0.08 : 0, 0.01);
    set(n.warnG.gain, alarms.gear && beat ? 0.06 : 0, 0.01);
    set(n.gunG.gain, alarms.gun ? 0.22 : 0, 0.01);
    set(n.gunAm.gain, alarms.gun ? 0.2 : 0, 0.01);
    if (alarms.missile) {
      const hi = (t * 8) % 1 < 0.5;
      set(n.rwr.frequency, hi ? 1450 : 950, 0.005);
      set(n.rwrG.gain, 0.05, 0.01);
    } else if (alarms.lock) {
      set(n.rwr.frequency, 1100, 0.01);
      set(n.rwrG.gain, (t * 5) % 1 < 0.45 ? 0.04 : 0, 0.005);
    } else set(n.rwrG.gain, 0, 0.01);
  }

  // --- one-shots ---
  burst({ freq = 400, type = 'lowpass', q = 0.7, dur = 0.3, vol = 0.5, sweep = 0, bus = this.fxBus } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const s = this.noiseSrc();
    const f = this.filter(type, freq, q);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(30, freq * sweep), t + dur);
    const g = this.gain(0, bus);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g);
    s.start(t); s.stop(t + dur + 0.05);
  }
  tone(freq, dur, vol = 0.2, type = 'sine', slide = 1, bus = this.fxBus) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = this.osc(type, freq);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = this.gain(0, bus);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); o.start(t); o.stop(t + dur + 0.05);
  }

  thump(strength) {
    this.tone(90, 0.25, 0.3 + strength * 0.4, 'sine', 0.4);
    this.burst({ freq: 300, dur: 0.18, vol: 0.2 + strength * 0.3 });
    if (strength > 0.15) this.tone(1800, 0.25, 0.05, 'triangle', 0.7);
  }
  explosion(power = 1) {
    this.burst({ freq: 1400, dur: 2.2 * power, vol: 0.9 * power, sweep: 0.05 });
    this.tone(60, 1.2, 0.6 * power, 'sine', 0.4);
  }
  // Crossing Mach 1: a deep double "ba-boom" (the shock waves off the nose and the tail).
  sonicBoom() {
    const B = SONIC.boom, bus = this.boomBus;
    const one = (v) => {
      this.burst({ freq: 140, type: 'lowpass', q: 0.8, dur: 1.6, vol: B.vol * v, bus });
      this.burst({ freq: 1100, type: 'lowpass', q: 0.7, dur: 0.14, vol: B.vol * 0.85 * v, bus });
      this.tone(50, 0.8, B.vol * 0.45 * v, 'sine', 0.55, bus);
    };
    one(1);
    setTimeout(() => one(0.85), B.gapMs);
  }

  clunk() { this.tone(160, 0.12, 0.25, 'square', 0.5); this.burst({ freq: 900, dur: 0.08, vol: 0.2 }); }
  gearMotor(dur) { this.burst({ freq: 220, type: 'bandpass', q: 3, dur, vol: 0.12 }); }
  whoosh() { this.burst({ freq: 3000, type: 'bandpass', q: 0.8, dur: 1.5, vol: 0.4, sweep: 0.2 }); }
  click() { this.tone(1400, 0.05, 0.08, 'triangle', 0.8); }
  // Combat one-shots.
  aaaThud(near) { this.tone(70, 0.12, 0.12 * near, 'sine', 0.6); this.burst({ freq: 500, dur: 0.1, vol: 0.12 * near }); }
  launch() { this.whoosh(); this.burst({ freq: 160, dur: 1.2, vol: 0.35, sweep: 0.5 }); }
  pop() { this.tone(900, 0.04, 0.08, 'square', 0.5); this.burst({ freq: 2500, type: 'bandpass', dur: 0.12, vol: 0.12 }); }
  // A round hitting metal (owner 2026-11-21: "like proper bullets hitting metal"): a hard
  // crack, a short inharmonic metallic ring and a dull body thunk. near: 1 = your own
  // airframe (loud, heavy), less = hits you put on a bandit (lighter, further off).
  metalHit(near = 1) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - (this.lastHitT || 0) < METAL_HIT.minGapS) return; // a burst: not one per round
    this.lastHitT = now;
    const M = METAL_HIT, v = M.vol * near, r = () => 0.85 + Math.random() * 0.3;
    // Only noise through filters: a dry, hard "tchk", no musical pitch.
    this.burst({ freq: M.crack.hz * r(), type: 'highpass', q: M.crack.q, dur: M.crack.dur, vol: v });
    for (const hz of M.body.hz) this.burst({ freq: hz * r(), type: 'bandpass', q: M.body.q, dur: M.body.dur * r(), vol: v * 0.9 });
    this.burst({ freq: M.thud.hz * r(), type: 'lowpass', q: 0.7, dur: M.thud.dur, vol: v * (0.3 + 0.7 * near) });
  }

  clank() { this.tone(700, 0.08, 0.12, 'square', 0.6); this.burst({ freq: 3000, type: 'bandpass', q: 2, dur: 0.1, vol: 0.25 }); }
  // Missile lock made: two short soft sine beeps.
  lockBeep() { this.tone(1046, 0.07, 0.035, 'sine'); setTimeout(() => this.tone(1046, 0.09, 0.035, 'sine'), 120); }
  chime(up = true) { this.tone(up ? 660 : 520, 0.15, 0.08); setTimeout(() => this.tone(up ? 990 : 390, 0.2, 0.08), 110); }
}
