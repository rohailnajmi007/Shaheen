// Cockpit instrument panel (top right), ported from the Godot instrument_panel.gd.
// One look per aircraft (data field cockpitStyle), four tiers (owner 2026-11-21):
//  - 'analog'     (trainers: Super Mushshak, K-8): basic grey plate, round dials.
//  - 'darkAnalog' (old fighters: Mirage V, F-7PG): fighter-style round dials on a
//                 black-green plate, amber lettering, amber Mach / G strip.
//  - 'glass'      (modern: JF-17, F-16A): two monochrome green MFDs (speed tape + Mach +
//                 G, altitude tape + vertical speed bar), gear lights, flap box.
//  - 'colorGlass' (top of the line: F-16D, J-10C): colour PFD with artificial horizon,
//                 engine page.
// Drawn in the Godot panel's own 266 x 114 units, scaled to the canvas size.
// Performance: everything that never moves (plate, dial faces, scales, labels,
// screen bezels) is drawn ONCE to an offscreen layer (rebuilt only when the
// aircraft or the size changes); each frame copies it and draws the moving parts.

const W = 266, H = 114;

const rgb = (r, g, b, a = 1) => `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;

// Colours (the Godot exports).
export const COCKPIT_COLORS = {
  plate: rgb(0.55, 0.57, 0.6), plateDark: rgb(0.34, 0.36, 0.39), plateLight: rgb(0.74, 0.76, 0.78),
  face: rgb(0.08, 0.09, 0.1), marking: rgb(0.9, 0.9, 0.86), needle: rgb(1, 0.6, 0.15),
  label: rgb(0.12, 0.13, 0.14), lampOff: rgb(0.22, 0.23, 0.24), green: rgb(0.3, 0.95, 0.35),
  amber: rgb(1, 0.72, 0.15), red: rgb(1, 0.22, 0.18), abLamp: rgb(1, 0.55, 0.15),
  // Glass cockpit
  glassPlate: rgb(0.17, 0.18, 0.2), glassPlateLight: rgb(0.3, 0.31, 0.34), glassPlateDark: rgb(0.08, 0.08, 0.09),
  glassLabel: rgb(0.7, 0.72, 0.74), mfdGreen: rgb(0.35, 1, 0.45), mfdDim: rgb(0.12, 0.42, 0.18),
  mfdDimLight: rgb(0.12 + 0.88 * 0.3, 0.42 + 0.58 * 0.3, 0.18 + 0.82 * 0.3), mfdBg: rgb(0.02, 0.05, 0.03),
  // Dark analog cockpit
  darkPlate: rgb(0.14, 0.16, 0.14), darkPlateLight: rgb(0.27, 0.3, 0.27), darkPlateDark: rgb(0.05, 0.06, 0.05),
  amberText: rgb(1, 0.7, 0.25),
};
const C = COCKPIT_COLORS;
// Weapon cue lamp (in the old flap box's place): text, colour, blinks.
const CUE_LOOK = {
  none: ['NONE', rgb(0.42, 0.42, 0.42), false], safe: ['SAFE', rgb(0.6, 0.6, 0.6), false],
  arm: ['ARM', C.amber, false], fire: ['FIRE', C.green, true], gun: ['GUN', C.amber, false],
  empty: ['EMPTY', rgb(0.42, 0.42, 0.42), false], eject: ['EJECT', C.red, true],
};

// Colour glass cockpit (JF-17) layout: PFD, ENGINE page, status column x.
const CG_PFD = [5, 5, 132, 85];
const CG_ENG = [141, 5, 84, 85];
const CG_STAT_X = 230;
Object.assign(COCKPIT_COLORS, {
  cgPlate: rgb(0.2, 0.21, 0.23), cgPlateLight: rgb(0.34, 0.35, 0.38), cgPlateDark: rgb(0.07, 0.07, 0.08),
  cgBezel: rgb(0.13, 0.13, 0.14), cgKey: rgb(0.45, 0.46, 0.48), cgScreen: rgb(0.02, 0.03, 0.06),
  cgSky: rgb(0.16, 0.45, 0.85), cgGround: rgb(0.55, 0.36, 0.18), cgYellow: rgb(1, 0.86, 0.1),
  cgCyan: rgb(0.35, 0.88, 1), cgGreen: rgb(0.3, 1, 0.45), cgDim: rgb(0.16, 0.3, 0.2),
  cgRedDim: rgb(0.45, 0.12, 0.1), cgTrack: rgb(0.16, 0.17, 0.2), cgAbZone: rgb(0.45, 0.2, 0.08),
});
const GAUGE_R = 25;
const GAUGE_CENTRES = [[33, 36], [92, 36], [151, 36]];
const SPEED_MFD = [6, 6, 80, 82];
const ALT_MFD = [92, 6, 80, 82];
const FONT = '600 8px "Chakra Petch", sans-serif';
const MACH_KT = 661.5;
const rad = (d) => (d * Math.PI) / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const grow = (r, g) => [r[0] - g, r[1] - g, r[2] + 2 * g, r[3] + 2 * g];

export class Cockpit {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.layer = document.createElement('canvas');
    this.time = 0;
    this.key = '';
  }

  // Style of the current aircraft ('analog' if the data doesn't say).
  get style() { return this.data?.cockpitStyle || 'analog'; }

  setAircraft(data) { this.data = data; this.key = ''; }

  // CSS width, cached by a ResizeObserver: reading clientWidth every frame forced a
  // layout after each HUD text change (lag, 2026-11-20).
  cssW() {
    if (!this.ro) {
      this.ro = new ResizeObserver(() => { this.cw = this.canvas.clientWidth; });
      this.ro.observe(this.canvas);
      this.cw = this.canvas.clientWidth;
    }
    return this.cw;
  }

  // Canvas size follows its CSS size; returns the draw scale.
  fit() {
    const cv = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.cssW() * dpr);
    const h = Math.round(w * H / W);
    if (w > 0 && (cv.width !== w || cv.height !== h)) { cv.width = w; cv.height = h; }
    return cv.width / W;
  }

  draw(a, dt) {
    if (!this.data) return;
    this.time += dt;
    const k = this.fit();
    if (!this.canvas.width) return;
    const key = `${this.data.id}:${this.canvas.width}`;
    if (key !== this.key) {
      this.key = key;
      this.layer.width = this.canvas.width; this.layer.height = this.canvas.height;
      const lc = this.layer.getContext('2d');
      lc.setTransform(k, 0, 0, k, 0, 0);
      this.c = lc;
      this.drawStatic();
    }
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.drawImage(this.layer, 0, 0);
    c.setTransform(k, 0, 0, k, 0, 0);
    this.c = c;
    this.a = a;
    this.drawMoving();
  }

  // --- drawing helpers (Godot-style: rects, lines, circles, 8 px text) ---
  rect(x, y, w, h, col) { this.c.fillStyle = col; this.c.fillRect(x, y, w, h); }
  frame(x, y, w, h, col) { this.c.strokeStyle = col; this.c.lineWidth = 1; this.c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
  circle(cx, cy, r, col) { const c = this.c; c.fillStyle = col; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill(); }
  line(x0, y0, x1, y1, col, w = 1) { const c = this.c; c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'butt'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
  arcLine(cx, cy, r, a0, a1, col, w) { const c = this.c; c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.arc(cx, cy, r, a0, a1); c.stroke(); }
  poly(pts, col) { const c = this.c; c.fillStyle = col; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill(); }
  text(x, y, s, col, align = 'left') { const c = this.c; c.font = FONT; c.textAlign = align; c.textBaseline = 'alphabetic'; c.fillStyle = col; c.fillText(s, x, y); }
  textC(x, y, s, col) { this.text(x, y, s, col, 'center'); }
  textR(x, y, s, col) { this.text(x, y, s, col, 'right'); }
  // Label colour for this panel (dark on grey, light on glass, amber on dark).
  lc() { return this.style === 'glass' ? C.glassLabel : this.style === 'darkAnalog' ? C.amberText : C.label; }

  // --- static layer ---
  drawStatic() {
    const d = this.data;
    if (this.style === 'colorGlass') { this.colorStatic(); return; }
    if (this.style === 'glass') {
      this.rect(0, 0, W, H, C.glassPlateDark);
      this.rect(1, 1, W - 2, H - 2, C.glassPlateLight);
      this.rect(2, 2, W - 3, H - 3, C.glassPlate);
      this.mfdFrame(SPEED_MFD);
      this.mfdFrame(ALT_MFD);
      this.throttleStatic(180, 8);
      this.fuelStatic(200, 8);
      return;
    }
    const dark = this.style === 'darkAnalog';
    if (dark) this.plate(C.darkPlate, C.darkPlateLight, C.darkPlateDark);
    else this.plate(C.plate, C.plateLight, C.plateDark);
    this.airspeedScale(...GAUGE_CENTRES[0]);
    this.altimeterScale(...GAUGE_CENTRES[1]);
    this.vsiScale(...GAUGE_CENTRES[2]);
    if (dark) { this.rect(8, 76, 170, 12, '#000'); this.frame(8, 76, 170, 12, C.darkPlateLight); }
    this.throttleStatic(190, 8);
    this.fuelStatic(211, 8);
    this.statusStatic(226, 8);
    void d;
  }

  plate(fill, light, dark) {
    this.rect(0, 0, W, H, dark);
    this.rect(1, 1, W - 2, H - 2, light);
    this.rect(2, 2, W - 3, H - 3, fill);
    for (const [x, y] of [[4, 4], [W - 5, 4], [4, H - 5], [W - 5, H - 5]]) {
      this.rect(x, y, 2, 2, dark);
      this.rect(x, y, 1, 1, light);
    }
  }

  // --- moving parts ---
  drawMoving() {
    if (this.style === 'colorGlass') { this.colorMoving(); return; }
    if (this.style === 'glass') {
      this.speedTape(grow(SPEED_MFD, -4));
      this.altTape(grow(ALT_MFD, -4));
      this.throttle(180, 8);
      this.fuel(200, 8);
      this.glassStatus(218, 8);
      this.warnings(6, H - 20);
      return;
    }
    this.airspeed(...GAUGE_CENTRES[0]);
    this.altimeter(...GAUGE_CENTRES[1]);
    this.vsi(...GAUGE_CENTRES[2]);
    if (this.style === 'darkAnalog') {
      const a = this.a;
      this.text(12, 85, `MACH ${(a.speedKt / MACH_KT).toFixed(2)}`, C.amberText);
      this.textR(174, 85, `G ${a.gLoad >= 0 ? '+' : ''}${a.gLoad.toFixed(1)}`, C.amberText);
    }
    this.throttle(190, 8);
    this.fuel(211, 8);
    this.status(226, 8);
    this.warnings(6, H - 20);
  }

  // --- round gauges ---
  gaugeFace(cx, cy, label) {
    this.circle(cx, cy, GAUGE_R + 2, C.plateDark);
    this.circle(cx, cy, GAUGE_R + 1, rgb(0.16, 0.16, 0.17));
    this.circle(cx, cy, GAUGE_R - 1, C.face);
    this.textC(cx, cy + GAUGE_R + 10, label, this.lc());
  }
  tick(cx, cy, ang, rIn, rOut, col, w = 1) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    this.line(cx + dx * rIn, cy + dy * rIn, cx + dx * rOut, cy + dy * rOut, col, w);
  }
  needle(cx, cy, ang, len, w = 1) {
    this.line(cx, cy, cx + Math.cos(ang) * len, cy + Math.sin(ang) * len, C.needle, w);
    this.circle(cx, cy, 2, rgb(0.3, 0.3, 0.3));
  }
  readout(cx, cy, s, w = 26) {
    const x = cx - w * 0.5, y = cy + 6;
    this.rect(x, y, w, 9, '#000');
    this.frame(x, y, w, 9, rgb(0.3, 0.3, 0.3));
    this.textC(cx, cy + 13.5, s, C.marking);
  }

  // Airspeed: 0..max over a 270 degree sweep from bottom-left, green/yellow arcs.
  asAngle(kt) { return rad(135 + 270 * clamp(kt / this.data.maxSpeedKt, 0, 1)); }
  airspeedScale(cx, cy) {
    const d = this.data;
    this.gaugeFace(cx, cy, 'KNOTS');
    const r = GAUGE_R - 3;
    this.arcLine(cx, cy, r, this.asAngle(d.stallKt), this.asAngle(d.maxSpeedKt * 0.85), C.green, 2);
    this.arcLine(cx, cy, r, this.asAngle(d.maxSpeedKt * 0.85), this.asAngle(d.maxSpeedKt), C.amber, 2);
    this.tick(cx, cy, this.asAngle(d.maxSpeedKt), r - 5, r + 1, C.red, 2);
    for (let kt = 0; kt <= d.maxSpeedKt; kt += 20) {
      this.tick(cx, cy, this.asAngle(kt), r - (kt % 40 === 0 ? 5 : 3), r - 1, C.marking);
    }
  }
  airspeed(cx, cy) {
    this.readout(cx, cy, String(Math.round(this.a.speedKt)));
    this.needle(cx, cy, this.asAngle(this.a.speedKt), GAUGE_R - 5);
  }

  // Altimeter: long needle = 1,000 ft per turn, short needle = 10,000 ft per turn.
  altimeterScale(cx, cy) {
    this.gaugeFace(cx, cy, 'ALT FT');
    const r = GAUGE_R - 3;
    for (let i = 0; i < 10; i++) this.tick(cx, cy, rad(-90 + 36 * i), r - (i === 0 ? 5 : 3), r, C.marking);
  }
  altimeter(cx, cy) {
    const r = GAUGE_R - 3;
    const alt = Math.max(this.a.altFt, 0);
    this.readout(cx, cy, String(Math.round(alt / 10) * 10), 30);
    this.needle(cx, cy, rad(-90 + 360 * alt / 10000), r - 11, 2);
    this.needle(cx, cy, rad(-90 + 360 * (alt % 1000) / 1000), r - 2);
  }

  // Vertical speed: zero at 9 o'clock, climb clockwise (up), descent anticlockwise.
  vsAngle(fpm) { return rad(180 + 160 * clamp(fpm / this.data.gaugeVsiMaxFpm, -1, 1)); }
  vsiScale(cx, cy) {
    const max = this.data.gaugeVsiMaxFpm;
    this.gaugeFace(cx, cy, 'V/S');
    const r = GAUGE_R - 3;
    for (let i = -4; i <= 4; i++) this.tick(cx, cy, this.vsAngle(max * i / 4), r - (i === 0 ? 5 : 3), r, C.marking);
    this.textC(cx - 9, cy - 6, 'UP', C.marking);
  }
  vsi(cx, cy) {
    const vs = this.a.vsFpm;
    const v = Math.round(vs / 10) * 10;
    this.readout(cx, cy, `${v >= 0 ? '+' : ''}${v}`, 32);
    this.needle(cx, cy, this.vsAngle(vs), GAUGE_R - 5);
  }

  // --- throttle and fuel ---
  throttleStatic(x, y) {
    const h = 58;
    this.rect(x, y, 8, h, C.plateDark);
    this.rect(x + 3, y + 2, 2, h - 4, '#000');
    if (this.data.afterburnerN > 0) {
      // Afterburner detent: everything above this mark lights the afterburner.
      const dy = y + (h - 6) * (1 - this.data.afterburnerThreshold) + 3;
      this.rect(x - 4, dy, 16, 1, C.red);
    }
    this.textC(x + 4, y + h + 10, 'THR', this.lc());
  }
  throttle(x, y) {
    const h = 58;
    const hy = y + (h - 6) * (1 - this.a.throttle);
    this.rect(x - 3, hy, 14, 6, rgb(0.12, 0.12, 0.12));
    this.rect(x - 2, hy + 1, 12, 1, rgb(0.4, 0.4, 0.4));
    this.textC(x + 4, y + h + 18, String(Math.round(this.a.throttle * 100)), this.lc());
  }
  fuelStatic(x, y) {
    this.rect(x, y, 8, 58, '#000');
    this.textC(x + 4, y + 68, 'FUEL', this.lc());
  }
  fuel(x, y) {
    const h = 58;
    const f = clamp(this.a.fuelFraction, 0, 1);
    this.rect(x + 1, y + 1 + (h - 2) * (1 - f), 6, (h - 2) * f, this.a.lowFuel ? C.amber : C.green);
    for (let i = 1; i < 4; i++) this.rect(x, y + h * i / 4, 3, 1, C.plateLight);
  }

  // --- status lamps (analog) ---
  engineCol() {
    const a = this.a;
    if (a.engineOn) return a.rpm >= 0.995 ? C.green : C.amber;
    return a.rpm > 0 ? C.amber : C.lampOff;
  }
  gearCol() {
    const a = this.a;
    if (!this.data.retractableGear) return C.green;
    if (a.gearPos > 0 && a.gearPos < 1) return C.amber;
    return a.gearPos >= 1 ? C.green : C.lampOff;
  }
  statusStatic(x, y) {
    for (const dy of [0, 12]) this.rect(x, y + dy, 7, 6, '#000');
    this.text(x + 10, y + 6, 'ENG', this.lc());
    this.text(x + 10, y + 18, 'GEAR', this.lc());
    this.text(x, y + 32, 'WPN', this.lc());
  }
  lampFill(x, y, col) { this.rect(x + 1, y + 1, 5, 4, col); }
  status(x, y) {
    const a = this.a;
    this.lampFill(x, y, this.engineCol());
    this.lampFill(x, y + 12, this.gearCol());
    this.cueBox(x, y + 38, 34, 12, '#000', C.lampOff);
  }

  // Weapon cue box: FIRE (blinking green) when the weapon will hit, EJECT when shot down.
  cueBox(x, y, w, h, bg, edge) {
    const [t, col, blink] = CUE_LOOK[this.cue] || CUE_LOOK.none;
    const lit = !blink || this.time % 0.5 < 0.3;
    this.rect(x, y, w, h, bg);
    this.frame(x, y, w, h, edge);
    if (lit) this.textC(x + w / 2, y + h / 2 + 3, t, col);
  }

  // --- warning light row (all styles) ---
  warnings(x, y) {
    const a = this.a;
    const blink = this.time % 0.5 < 0.3;
    const items = [
      ['STALL', a.stalled && blink, C.red],
      ['GEAR', a.gearWarning && blink, C.red],
      [a.fuel <= 0 ? 'NO FUEL' : 'FUEL', a.lowFuel, C.amber],
      ['BRAKE', a.braking, C.amber],
    ];
    if (this.data.afterburnerN > 0) items.push(['A/B', a.afterburner > 0, C.abLamp]);
    const w = (W - 12 - 3 * (items.length - 1)) / items.length;
    items.forEach(([label, lit, col], i) => {
      const rx = x + i * (w + 3);
      this.rect(rx, y, w, 14, '#000');
      this.rect(rx + 1, y + 1, w - 2, 12, lit ? col : C.lampOff);
      this.textC(rx + w / 2, y + 10, label, lit ? '#000' : rgb(0.42, 0.42, 0.42));
    });
  }

  // --- glass cockpit (F-16) ---
  // Screen bezel with the row of push buttons above and below (like an MFD).
  mfdFrame(m) {
    const [x, y, w, h] = m;
    this.rect(x, y, w, h, C.glassPlateDark);
    this.rect(x + 1, y + 1, w - 2, h - 2, rgb(0.24, 0.25, 0.27));
    for (let i = 0; i < 5; i++) {
      const bx = x + 8 + i * (w - 16) / 4 - 3;
      this.rect(bx, y, 6, 2, rgb(0.42, 0.43, 0.45));
      this.rect(bx, y + h - 2, 6, 2, rgb(0.42, 0.43, 0.45));
    }
    const s = grow(m, -4);
    this.rect(s[0], s[1], s[2], s[3], C.mfdBg);
  }

  // A vertical tape: ticks scroll past a fixed box showing the current value.
  // step = value between small ticks, every = small ticks per label.
  tape(s, value, unitsPerPx, step, every, boxText) {
    const [sx, sy, sw, sh] = s;
    const cy = sy + sh / 2;
    const x = sx + 4;
    const span = (sh / 2) * unitsPerPx;
    for (let v = Math.floor((value - span) / step) * step; v <= value + span; v += step) {
      const y = Math.round(cy - (v - value) / unitsPerPx);
      if (y > sy + 1 && y < sy + sh - 1 && v >= 0) {
        const major = Math.round(v / step) % every === 0;
        this.rect(x, y, major ? 6 : 3, 1, major ? C.mfdGreen : C.mfdDim);
        if (major && Math.abs(y - cy) > 7) this.text(x + 9, y + 3, String(Math.round(v)), C.mfdDimLight);
      }
    }
    // Current value box with a pointer.
    const bx = sx + 1, by = cy - 6, bw = sw - 14;
    this.rect(bx, by, bw, 12, C.mfdBg);
    this.frame(bx, by, bw, 12, C.mfdGreen);
    this.poly([[bx + bw, by + 3], [bx + bw + 4, by + 6], [bx + bw, by + 9]], C.mfdGreen);
    this.text(bx + 4, cy + 3, boxText, C.mfdGreen);
  }

  speedTape(s) {
    const [sx, sy, sw, sh] = s;
    const kt = this.a.speedKt;
    this.text(sx + 2, sy + 7, 'KTS', C.mfdGreen);
    const tape = [sx, sy + 9, sw, sh - 20];
    this.tape(tape, kt, 2, 10, 5, String(Math.round(kt)));
    // Stall speed: red bar on the tape edge below stall speed.
    const cy = tape[1] + tape[3] / 2;
    const top = clamp(cy - (this.data.stallKt - kt) / 2, tape[1], tape[1] + tape[3]);
    if (top < tape[1] + tape[3]) this.rect(tape[0] + 1, top, 2, tape[1] + tape[3] - top, C.red);
    this.text(sx + 2, sy + sh - 2, `M ${(kt / MACH_KT).toFixed(2)}`, C.mfdGreen);
    this.textR(sx + sw - 2, sy + 7, `G ${this.a.gLoad.toFixed(1)}`, C.mfdGreen);
  }

  altTape(s) {
    const [sx, sy, sw, sh] = s;
    const alt = Math.max(this.a.altFt, 0);
    this.text(sx + 2, sy + 7, 'ALT', C.mfdGreen);
    const tape = [sx, sy + 9, sw - 8, sh - 20];
    this.tape(tape, alt, 20, 100, 5, String(Math.round(alt / 10) * 10));
    // Vertical speed bar on the right edge: up for climb, down for descent.
    const vs = this.a.vsFpm;
    const barX = sx + sw - 4;
    const cy = tape[1] + tape[3] / 2;
    const half = tape[3] / 2;
    this.rect(barX, tape[1], 1, tape[3], C.mfdDim);
    this.rect(barX - 2, cy, 5, 1, C.mfdDim);
    const len = clamp(vs / this.data.gaugeVsiMaxFpm, -1, 1) * half;
    this.rect(barX - 1, Math.min(cy, cy - len), 3, Math.abs(len), C.mfdGreen);
    const v = Math.round(vs / 10) * 10;
    this.text(sx + 2, sy + sh - 2, `VS ${v >= 0 ? '+' : ''}${v}`, C.mfdGreen);
  }

  // --- colour glass cockpit (JF-17): big colour MFDs ---
  // PFD (artificial horizon + speed/alt boxes) | ENGINE page (RPM arc, throttle, fuel) |
  // status column (gear, flaps, engine), cyan lettering.
  colorStatic() {
    this.rect(0, 0, W, H, C.cgPlateDark);
    this.rect(1, 1, W - 2, H - 2, C.cgPlateLight);
    this.rect(2, 2, W - 3, H - 3, C.cgPlate);
    for (const m of [CG_PFD, CG_ENG]) {
      const [x, y, w, h] = m;
      this.rect(x, y, w, h, '#000');
      this.rect(x + 1, y + 1, w - 2, h - 2, C.cgBezel);
      // Soft-key nubs down both sides, like the real MFD bezels.
      for (let i = 0; i < 4; i++) {
        const by = y + 12 + i * (h - 24) / 3 - 2;
        this.rect(x, by, 2, 5, C.cgKey);
        this.rect(x + w - 2, by, 2, 5, C.cgKey);
      }
      this.rect(x + 4, y + 4, w - 8, h - 8, C.cgScreen);
    }
    const [ex, ey, ew] = CG_ENG;
    this.text(ex + 7, ey + 12, 'ENG', C.cgCyan);
    this.text(ex + 7, ey + 74, 'FUEL', C.cgCyan);
    // RPM arc scale (static part).
    const cx = ex + 27, cy = ey + 34, rr = 14;
    this.arcLine(cx, cy, rr, rad(135), rad(135 + 270 * 0.85), C.cgDim, 3);
    this.arcLine(cx, cy, rr, rad(135 + 270 * 0.85), rad(405), C.cgRedDim, 3);
    // Throttle track with the afterburner zone.
    const tx = ex + ew - 16, ty = ey + 10, th = 52;
    this.rect(tx, ty, 6, th, C.cgTrack);
    if (this.data.afterburnerN > 0) this.rect(tx, ty, 6, th * (1 - this.data.afterburnerThreshold), C.cgAbZone);
    this.textC(tx + 3, ty + th + 9, 'THR', C.cgCyan);
    // Status column labels.
    const sx = CG_STAT_X;
    this.text(sx, 14, 'ENG', C.cgCyan);
    this.text(sx, 32, 'GEAR', C.cgCyan);
    this.text(sx, 58, 'WPN', C.cgCyan);
  }

  colorMoving() {
    const a = this.a, d = this.data;
    const c = this.c;
    // PFD: horizon rolls with pitch (side view: pitch only), ladder every 10 deg.
    const [px, py, pw, ph] = CG_PFD;
    const sx = px + 4, sy = py + 4, sw = pw - 8, sh = ph - 8;
    const mx = sx + sw / 2, my = sy + sh / 2;
    const pxPerDeg = 1.6;
    let pdeg = a.pitch * 180 / Math.PI;
    if (pdeg > 180) pdeg -= 360;
    if (pdeg < -180) pdeg += 360;
    c.save();
    c.beginPath(); c.rect(sx, sy, sw, sh); c.clip();
    const hy = my + pdeg * pxPerDeg;
    this.rect(sx, sy, sw, Math.max(0, Math.min(sh, hy - sy)), C.cgSky);
    this.rect(sx, Math.max(sy, hy), sw, Math.max(0, sy + sh - Math.max(sy, hy)), C.cgGround);
    this.rect(sx, hy - 0.5, sw, 1, '#ffffff');
    for (let k = -30; k <= 30; k += 10) {
      if (k === 0) continue;
      const ly = hy - k * pxPerDeg;
      if (ly < sy + 4 || ly > sy + sh - 4) continue;
      this.rect(mx - 9, ly, 18, 1, 'rgba(255,255,255,0.85)');
      this.textR(mx - 11, ly + 3, String(Math.abs(k)), 'rgba(255,255,255,0.85)');
    }
    c.restore();
    // Aircraft symbol (yellow W).
    this.rect(mx - 16, my - 0.5, 10, 2, C.cgYellow);
    this.rect(mx + 6, my - 0.5, 10, 2, C.cgYellow);
    this.rect(mx - 1.5, my - 1, 3, 3, C.cgYellow);
    // Speed box (left), altitude box (right), VS and G.
    const box = (x, y, w, s) => { this.rect(x, y, w, 11, 'rgba(0,0,0,0.75)'); this.frame(x, y, w, 11, '#ffffff'); this.textC(x + w / 2, y + 8.5, s, '#ffffff'); };
    box(sx + 2, my - 5.5, 24, String(Math.round(a.speedKt)));
    box(sx + sw - 30, my - 5.5, 28, String(Math.round(Math.max(a.altFt, 0) / 10) * 10));
    this.text(sx + 3, sy + 9, 'KT', '#ffffff');
    this.textR(sx + sw - 3, sy + 9, 'FT', '#ffffff');
    const v = Math.round(a.vsFpm / 10) * 10;
    this.text(sx + 3, sy + sh - 3, `VS ${v >= 0 ? '+' : ''}${v}`, '#ffffff');
    this.textR(sx + sw - 3, sy + sh - 3, `G ${a.gLoad.toFixed(1)}  M ${(a.speedKt / MACH_KT).toFixed(2)}`, '#ffffff');
    // Stall warning: speed box red under stall speed in the air.
    if (!a.onGround && a.speedKt < d.stallKt * 1.08) this.frame(sx + 2, my - 5.5, 24, 11, C.red);
    // ENGINE page: RPM arc and %, throttle handle, fuel.
    const [ex, ey, ew] = CG_ENG;
    const cx = ex + 27, cy = ey + 34, rr = 14;
    const rpm = clamp(a.rpm, 0, 1);
    if (rpm > 0.005) this.arcLine(cx, cy, rr, rad(135), rad(135 + 270 * rpm), a.afterburner > 0 ? C.amber : C.cgGreen, 3);
    this.textC(cx, cy + 3, `${Math.round(rpm * 100)}`, '#ffffff');
    this.textC(cx, cy + 22, a.afterburner > 0 ? 'A/B' : 'RPM %', a.afterburner > 0 ? C.amber : C.cgCyan);
    const tx = ex + ew - 16, ty = ey + 10, th = 52;
    const hy2 = ty + th * (1 - a.throttle);
    this.rect(tx - 2, hy2 - 1.5, 10, 3, '#ffffff');
    this.textC(tx + 3, ty + th + 17, String(Math.round(a.throttle * 100)), '#ffffff');
    const f = clamp(a.fuelFraction, 0, 1);
    this.rect(ex + 7, ey + 77, 40, 4, C.cgTrack);
    this.rect(ex + 7, ey + 77, 40 * f, 4, a.lowFuel ? C.amber : C.cgGreen);
    this.text(ex + 28, ey + 74, `${Math.round(a.fuel)}`, '#ffffff');
    // Status column: engine lamp, three gear lights, flap box.
    const sxs = CG_STAT_X;
    this.rect(sxs + 22, 9, 7, 6, '#000');
    this.lampFill(sxs + 22, 9, this.engineCol());
    const gc = this.gearCol();
    for (let i = 0; i < 3; i++) {
      const gx = sxs + i * 9, gy = 38 - (i === 1 ? 3 : 0);
      this.rect(gx, gy, 7, 6, '#000');
      this.rect(gx + 1, gy + 1, 5, 4, gc);
    }
    this.cueBox(sxs, 61, 30, 11, C.cgScreen, C.cgKey);
    this.warnings(6, H - 20);
  }

  glassStatus(x, y) {
    const a = this.a;
    this.rect(x, y, 7, 6, '#000');
    this.lampFill(x, y, this.engineCol());
    this.text(x + 10, y + 6, 'ENG', C.glassLabel);
    this.text(x + 10, y + 14, `${Math.round(a.rpm * 100)}%`, C.glassLabel);
    // Landing gear: three lights (nose, left, right) like a real jet.
    this.text(x, y + 26, 'GEAR', C.glassLabel);
    const gc = this.gearCol();
    for (let i = 0; i < 3; i++) {
      const gx = x + i * 9, gy = y + 32 - (i === 1 ? 3 : 0);
      this.rect(gx, gy, 7, 6, '#000');
      this.rect(gx + 1, gy + 1, 5, 4, gc);
    }
    this.text(x, y + 50, 'WPN', C.glassLabel);
    this.cueBox(x, y + 53, 30, 10, C.mfdBg, C.glassPlateLight);
  }
}
