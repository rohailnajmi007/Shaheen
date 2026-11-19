// All sound is made in code with Web Audio (no sound files).

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
    this.engineBus = c.createGain(); this.engineBus.connect(this.master);
    this.fxBus = c.createGain(); this.fxBus.connect(this.master);
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
    this.nodes = n;
    this.data = data;
    void c;
  }

  stopFlight() {
    if (!this.nodes) return;
    for (const s of this.nodes.srcs) { try { s.stop(); } catch { /* already stopped */ } }
    this.nodes = null;
  }

  update(ac, onGround, alarms) {
    const n = this.nodes;
    if (!n || !this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (p, v, k = 0.06) => p.setTargetAtTime(v, t, k);
    const rpm = ac.rpm, thr = ac.throttle;
    const spd = ac.speed;
    if (this.data.sound === 'prop') {
      const f = 28 + rpm * (32 + thr * 50);
      set(n.prop.frequency, f); set(n.prop2.frequency, f * 2.01);
      set(n.lfo.frequency, f * 0.5);
      set(n.propF.frequency, 300 + rpm * (300 + thr * 900));
      set(n.propG.gain, rpm > 0.02 ? 0.12 + rpm * (0.12 + thr * 0.2) : 0);
    } else {
      set(n.roarF.frequency, 200 + rpm * (300 + thr * 700));
      set(n.roarG.gain, rpm * (0.15 + thr * 0.45));
      set(n.whine.frequency, 300 + rpm * (900 + thr * 700) * (this.data.id === 'mirage5' ? 0.8 : 1));
      set(n.whineG.gain, rpm * 0.025 * (1 - thr * 0.5));
      set(n.abG.gain, ac.afterburner * 1.2);
    }
    set(n.windG.gain, Math.min(0.5, (spd / 150) ** 2 * 0.4) * (ac.airbrakeOut ? 1.8 : 1));
    set(n.windF.frequency, 400 + spd * 4);
    set(n.rumbleG.gain, onGround ? Math.min(0.8, spd / 60) : 0, 0.03);
    const beat = (t * 4) % 1 < 0.5;
    set(n.hornG.gain, alarms.stall ? 0.08 : 0, 0.01);
    set(n.warnG.gain, alarms.gear && beat ? 0.06 : 0, 0.01);
  }

  // --- one-shots ---
  burst({ freq = 400, type = 'lowpass', q = 0.7, dur = 0.3, vol = 0.5, sweep = 0 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const s = this.noiseSrc();
    const f = this.filter(type, freq, q);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(30, freq * sweep), t + dur);
    const g = this.gain(0, this.fxBus);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g);
    s.start(t); s.stop(t + dur + 0.05);
  }
  tone(freq, dur, vol = 0.2, type = 'sine', slide = 1) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = this.osc(type, freq);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = this.gain(0, this.fxBus);
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
  clunk() { this.tone(160, 0.12, 0.25, 'square', 0.5); this.burst({ freq: 900, dur: 0.08, vol: 0.2 }); }
  gearMotor(dur) { this.burst({ freq: 220, type: 'bandpass', q: 3, dur, vol: 0.12 }); }
  whoosh() { this.burst({ freq: 3000, type: 'bandpass', q: 0.8, dur: 1.5, vol: 0.4, sweep: 0.2 }); }
  click() { this.tone(1400, 0.05, 0.08, 'triangle', 0.8); }
  chime(up = true) { this.tone(up ? 660 : 520, 0.15, 0.08); setTimeout(() => this.tone(up ? 990 : 390, 0.2, 0.08), 110); }
}
