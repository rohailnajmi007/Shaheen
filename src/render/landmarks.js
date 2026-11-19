// Background landmarks near a base (scenery only), ported from the Godot landmarks.gd.
// A parallax band between the hills and the trees, so the city slides past slower than
// the ground and reads as being in the distance.
//
// Each landmark is placed by an offset: where the CAMERA is (metres from the base's
// runway threshold) when the landmark is centred on screen. Negative = passed on the way
// in (seen on the approach). Kinds come from BASES[id].landmarks (src/data/world.js):
//   Karachi (Masroor): port_cranes, teen_talwar, bahria_icon, mazar_e_quaid, masjid_e_tooba, skyline
//   Sargodha plains (Mushaf): fields, orchard (kinnow), banyan, village
// Drawn in Godot px (the old 640x360 screen, base on y = 0, growing up), each kind once
// into an offscreen canvas when the world is set up; frames only drawImage them.
import { makeCanvas, rng } from './assets.js';

export const LANDMARKS = {
  speed: 1.6,        // parallax: screen px (at 720p) per metre the camera moves
  offsetScale: 1.5,  // Godot offsets x this (its band moved at 2.4 px/m), keeps the spacing on screen
  lift: 34,          // px (at 720p) above the band's base line, so the tree layer doesn't hide them
  haze: 0.25,        // colours blended this much toward the time of day's haze
};

// Each kind drawn this much larger than its base drawing (owner: bigger and clearer).
const SCALE = {
  sea: 1.0, port_cranes: 1.5, teen_talwar: 1.8, bahria_icon: 1.3, mazar_e_quaid: 1.7, masjid_e_tooba: 1.7,
  skyline: 1.4, fields: 1.0, orchard: 1.4, banyan: 1.6, village: 1.5,
};

// [kind, camera offset m]
const LAYOUT = {
  port_cranes: [['port_cranes', -1150]],
  teen_talwar: [['teen_talwar', -800]],
  bahria_icon: [['bahria_icon', -550]],
  mazar_e_quaid: [['mazar_e_quaid', -150]],
  masjid_e_tooba: [['masjid_e_tooba', 450]],
  skyline: [['skyline', -950], ['skyline', -650], ['skyline', -350], ['skyline', 150], ['skyline', 750]],
  fields: [['fields', -800], ['fields', 100], ['fields', 900]],
  orchard: [['orchard', -480], ['orchard', 520]],
  banyan: [['banyan', -1000], ['banyan', -820], ['banyan', -560], ['banyan', -250], ['banyan', 0], ['banyan', 300], ['banyan', 700]],
  village: [['village', -700], ['village', -100], ['village', 820]],
};

// Drawing bounds per kind in Godot px: [left, right, height].
const BOUNDS = {
  port_cranes: [-76, 72, 52], teen_talwar: [-15, 15, 52], bahria_icon: [-10, 26, 130], mazar_e_quaid: [-47, 47, 60],
  masjid_e_tooba: [-35, 52, 76], skyline: [-62, 116, 50], fields: [-422, 502, 12], orchard: [-74, 76, 16],
  banyan: [-36, 36, 38], village: [-86, 112, 46],
};

// --- a tiny Godot-style pen (colours are [r, g, b, a?] in 0..1) ---
const lighten = (c, a) => [c[0] + (1 - c[0]) * a, c[1] + (1 - c[1]) * a, c[2] + (1 - c[2]) * a, c[3] ?? 1];
const darken = (c, a) => [c[0] * (1 - a), c[1] * (1 - a), c[2] * (1 - a), c[3] ?? 1];

class Pen {
  constructor(x, time, seed) {
    this.x = x;
    this.time = time;
    this.night = !!time.lights;
    this.haze = hexTo01(time.haze);
    this.r = rng(seed);
  }
  // Scenery colour: hazed, lit by the time of day.
  c(col) {
    const h = LANDMARKS.haze, L = this.time.light;
    const m = [0, 1, 2].map((i) => (col[i] + (this.haze[i] - col[i]) * h) * L[i]);
    return css(m, col[3] ?? 1);
  }
  // A lamp: full brightness at night.
  lamp(col) { return this.night ? css(col, col[3] ?? 1) : this.c(col); }
  rect(x, y, w, h, style) { this.x.fillStyle = style; this.x.fillRect(x, y, w, h); }
  poly(pts, style) { const x = this.x; x.fillStyle = style; x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.fill(); }
  circle(cx, cy, r, style) { const x = this.x; x.fillStyle = style; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); }
  ellipse(cx, cy, rx, ry, style) { const x = this.x; x.fillStyle = style; x.beginPath(); x.ellipse(cx, cy, Math.max(rx, 0.1), Math.max(ry, 0.1), 0, 0, Math.PI * 2); x.fill(); }
  rand(a, b) { return a + this.r() * (b - a); }
  randi(n) { return Math.floor(this.r() * n); }
}
function hexTo01(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}
const css = (c, a = 1) => `rgba(${Math.round(Math.min(1, c[0]) * 255)},${Math.round(Math.min(1, c[1]) * 255)},${Math.round(Math.min(1, c[2]) * 255)},${a})`;

// --- Karachi (PAF Base Masroor) ---

// Karachi port: gantry cranes over stacked containers.
function port(p) {
  const cols = [[0.75, 0.3, 0.22], [0.25, 0.42, 0.62], [0.8, 0.62, 0.2], [0.35, 0.55, 0.35]];
  for (let row = 0; row < 3; row++) for (let k = 0; k < 12; k++) p.rect(-70 + k * 11, -4 - row * 4, 10, 3, p.c(cols[(k + row * 3) % 4]));
  for (let k = 0; k < 3; k++) {
    const cx = -55 + k * 50;
    const col = p.c(k % 2 === 0 ? [0.85, 0.35, 0.2] : [0.9, 0.85, 0.3]);
    p.rect(cx - 10, -46, 2, 46, col);
    p.rect(cx + 8, -46, 2, 46, col);
    p.rect(cx - 16, -48, 40, 3, col); // boom
    p.rect(cx - 3, -45, 6, 5, col); // trolley
    if (p.night) p.circle(cx + 22, -49, 2, p.lamp([1, 0.2, 0.15]));
  }
}

// Teen Talwar (Clifton): three tall white swords on a round base.
function teenTalwar(p) {
  const white = p.c([0.93, 0.93, 0.9]), shade = p.c([0.75, 0.76, 0.75]);
  p.rect(-14, -5, 28, 5, shade);
  for (let k = 0; k < 3; k++) {
    const sx = -7 + k * 7;
    const h = 42 + (k === 1 ? 4 : 0);
    p.poly([[sx - 2, -5], [sx + 2, -5], [sx + 1.5, -h], [sx, -h - 4], [sx - 1.5, -h]], white);
    p.rect(sx - 3, -h * 0.25, 6, 1, shade); // hilt guard
  }
}

// Bahria Icon Tower: a slim glass tower with a slanted top and its shorter twin.
function bahriaIcon(p) {
  const glass = p.c([0.42, 0.52, 0.62]), edge = p.c([0.62, 0.7, 0.78]);
  p.poly([[-9, 0], [9, 0], [9, -112], [-9, -122]], glass);
  p.rect(-9, -112, 1, 112, edge);
  p.rect(1, -125, 1, 8, edge); // mast
  p.poly([[12, 0], [24, 0], [24, -62], [12, -68]], p.c([0.5, 0.58, 0.66]));
  for (let fy = -108; fy < -4; fy += 6) {
    const lit = p.night && ((fy * 7) % 5 !== 0);
    p.rect(-7, fy, 14, 1, lit ? p.lamp([1, 0.85, 0.55]) : edge);
  }
  if (p.night) p.circle(1.5, -126, 2.5, p.lamp([1, 0.15, 0.1]));
}

// Mazar-e-Quaid: terraced platform, square white marble block (front lit, side in
// shade) with a tall pointed arch and copper grille, cornice, drum, tall dome, finial.
function mazar(p) {
  let marble = p.c([0.96, 0.96, 0.93]), side = p.c([0.8, 0.82, 0.82]), recess = p.c([0.86, 0.87, 0.86]);
  let grille = [0.36, 0.33, 0.28];
  const stone = [0.78, 0.76, 0.72];
  if (p.night) {
    marble = p.lamp([0.92, 0.93, 0.9]); side = p.lamp([0.66, 0.69, 0.7]); recess = p.lamp([0.8, 0.82, 0.8]);
    grille = [0.2, 0.2, 0.18];
  }
  const g = p.night ? css(grille) : p.c(grille);
  const gl = p.night ? css(lighten(grille, 0.15)) : p.c(lighten(grille, 0.15));
  p.rect(-46, -3, 92, 3, p.c(stone));
  p.rect(-38, -6, 76, 3, p.c(lighten(stone, 0.08)));
  for (let k = 0; k < 3; k++) p.rect(-8 + k, -3 - k, 16 - 2 * k, 1, p.c(darken(stone, 0.12)));
  const top = -32;
  p.rect(-26, top, 40, 26, marble);
  p.poly([[14, -6], [22, -8], [22, top + 1], [14, top]], side);
  const cx = -6;
  p.rect(cx - 12, top + 3, 24, 23, recess);
  const arch = [[cx - 8, -6]];
  for (let k = 0; k < 9; k++) { const a = Math.PI * 0.5 * k / 8; arch.push([cx - 8 + 8 * (1 - Math.cos(a)) * 0.92, top + 12 - 7 * Math.sin(a)]); }
  arch.push([cx, top + 4]);
  for (let k = 8; k >= 0; k--) { const a = Math.PI * 0.5 * k / 8; arch.push([cx + 8 - 8 * (1 - Math.cos(a)) * 0.92, top + 12 - 7 * Math.sin(a)]); }
  arch.push([cx + 8, -6]);
  p.poly(arch, g);
  for (let gy = top + 9; gy < -6; gy += 3) p.rect(cx - 7, gy, 14, 1, gl);
  p.rect(cx - 0.5, top + 7, 1, 19, gl);
  const dx = -2;
  p.rect(-28, top - 2, 52, 2, side);
  p.rect(dx - 18, top - 5, 36, 3, marble);
  const baseY = top - 5;
  const dome = [], shadeP = [[dx + 4, baseY], [dx + 4, baseY - 20.5]];
  for (let k = 0; k <= 24; k++) {
    const a = k / 24 * Math.PI;
    const hw = -Math.cos(a) * 17, s = Math.sin(a);
    const h = Math.pow(s, 0.75) * 19 + 3 * Math.pow(s, 16);
    dome.push([dx + hw, baseY - h]);
    if (hw >= 4) shadeP.push([dx + hw, baseY - h]);
  }
  p.poly(dome, marble);
  p.poly(shadeP, side);
  p.rect(dx - 0.5, baseY - 27, 1, 5, p.c(darken(stone, 0.2))); // finial
}

// Masjid-e-Tooba: one wide, low dome and a single tall minaret.
function tooba(p) {
  const white = p.c([0.92, 0.92, 0.9]), shade = p.c([0.75, 0.77, 0.77]);
  p.rect(-34, -10, 68, 10, shade);
  const dome = [];
  for (let k = 0; k <= 16; k++) { const a = Math.PI * k / 16; dome.push([-Math.cos(a) * 32, -10 - Math.sin(a) * 16]); }
  p.poly(dome, white);
  p.rect(44, -64, 5, 64, white);
  p.rect(43, -50, 7, 2, shade);
  p.poly([[43, -64], [50, -64], [46.5, -72]], shade);
  if (p.night) p.circle(46.5, -73, 1.5, p.lamp([0.4, 1, 0.5]));
}

// Filler city blocks: a few mid-rise buildings of different heights.
function skyline(p) {
  let bx = -60;
  for (let k = 0; k < 6; k++) {
    const w = p.rand(10, 20), h = p.rand(14, 48), sh = p.rand(0.7, 0.9);
    const col = [sh, sh * 0.97, sh * 0.9];
    p.rect(bx, -h, w, h, p.c(col));
    for (let fy = Math.floor(-h + 4); fy < -3; fy += 5) {
      for (let wx = Math.floor(bx + 2); wx < bx + w - 2; wx += 4) {
        const lit = p.night && p.r() < 0.45;
        p.rect(wx, fy, 2, 2, lit ? p.lamp([1, 0.85, 0.5]) : p.c(darken(col, 0.25)));
      }
    }
    bx += w + p.rand(2, 8);
  }
}

// --- Sargodha plains (PAF Base Mushaf) ---

// Patchwork of crop fields: wheat, sugarcane, mustard, ploughed earth, bunds, tube-well huts.
function fields(p) {
  const cols = [[0.5, 0.66, 0.3], [0.38, 0.56, 0.26], [0.82, 0.76, 0.32], [0.62, 0.52, 0.36], [0.45, 0.62, 0.34], [0.88, 0.8, 0.25]];
  let fx = -420;
  while (fx < 420) {
    const w = p.rand(30, 80);
    const col = cols[p.randi(cols.length)];
    p.rect(fx, -5, w, 5, p.c(col));
    p.rect(fx, -5, w, 1, p.c(lighten(col, 0.12)));
    p.rect(fx + w - 1, -5, 1, 5, p.c(darken(col, 0.2)));
    if (p.r() < 0.18) {
      p.rect(fx + w * 0.5, -10, 7, 5, p.c([0.72, 0.5, 0.38]));
      p.rect(fx + w * 0.5 - 1, -11, 9, 1, p.c([0.55, 0.4, 0.32]));
    }
    fx += w;
  }
}

// Kinnow (citrus) orchard: rows of small round trees with orange fruit.
function orchard(p) {
  const leaf = p.c([0.22, 0.42, 0.2]), light = p.c([0.32, 0.52, 0.26]), fruit = p.c([0.98, 0.6, 0.12]);
  for (let row = 0; row < 2; row++) {
    for (let k = 0; k < 14; k++) {
      const tx = -70 + k * 10 + row * 5, ty = -4 - row * 3;
      p.rect(tx - 0.5, ty - 2, 1, 2, p.c([0.35, 0.28, 0.2]));
      p.circle(tx, ty - 5, 4.5, row === 0 ? leaf : light);
      for (let f = 0; f < 3; f++) p.rect(tx + p.rand(-3, 2), ty - 5 + p.rand(-3, 2), 1, 1, fruit);
    }
  }
}

// Banyan tree in the distance: very wide, low crown with prop-roots under it.
function banyan(p) {
  const w = p.rand(44, 62), h = p.rand(24, 32);
  const leaf = [0.2, 0.38, 0.18];
  const root = p.c([0.42, 0.36, 0.3]);
  for (let k = 0; k < 9; k++) {
    const rx = p.rand(-w * 0.4, w * 0.4);
    p.rect(rx, -h * 0.55, 1, h * 0.55 - (p.r() < 0.6 ? 0 : h * 0.2), root);
  }
  p.rect(-3, -h * 0.6, 6, h * 0.6, p.c([0.38, 0.31, 0.25]));
  p.ellipse(0, -h * 0.6, w * 0.5, h * 0.16, p.c(darken(leaf, 0.25)));
  for (let k = 0; k < 7; k++) {
    const t = k / 6;
    p.ellipse((t - 0.5) * w * 0.8, -h * 0.68 - Math.sin(t * Math.PI) * h * 0.18, w * 0.14, h * 0.2, p.c(lighten(leaf, p.rand(-0.05, 0.12))));
  }
}

// Punjab village: flat-roofed houses, a small mosque with a green dome and minaret,
// a water tank on legs and a brick-kiln chimney.
function village(p) {
  let hx = -60;
  for (let k = 0; k < 8; k++) {
    const w = p.rand(10, 18), h = p.rand(7, 13);
    const col = [[0.72, 0.46, 0.34], [0.86, 0.8, 0.68], [0.78, 0.66, 0.5]][p.randi(3)];
    p.rect(hx, -h, w, h, p.c(col));
    p.rect(hx, -h, w, 1, p.c(darken(col, 0.2)));
    const lit = p.night && p.r() < 0.6;
    p.rect(hx + 3, -h + 4, 2, 3, lit ? p.lamp([1, 0.8, 0.45]) : p.c(darken(col, 0.4)));
    hx += w + p.rand(0, 3);
  }
  const mx = 12;
  p.rect(mx - 9, -12, 18, 12, p.c([0.93, 0.93, 0.9]));
  const dome = [];
  for (let k = 0; k <= 12; k++) { const a = Math.PI * k / 12; dome.push([mx - Math.cos(a) * 6, -12 - Math.sin(a) * 6]); }
  p.poly(dome, p.c([0.3, 0.6, 0.4]));
  p.rect(mx + 11, -26, 3, 26, p.c([0.93, 0.93, 0.9]));
  p.rect(mx + 10, -28, 5, 2, p.c([0.3, 0.6, 0.4]));
  if (p.night) p.circle(mx + 12.5, -30, 1.2, p.lamp([0.4, 1, 0.5]));
  const wx = -78;
  p.rect(wx - 5, -20, 1, 20, p.c([0.5, 0.5, 0.5]));
  p.rect(wx + 4, -20, 1, 20, p.c([0.5, 0.5, 0.5]));
  p.rect(wx - 7, -28, 14, 8, p.c([0.82, 0.82, 0.8]));
  const kx = 58;
  p.poly([[kx - 3, 0], [kx + 3, 0], [kx + 1.5, -34], [kx - 1.5, -34]], p.c([0.6, 0.36, 0.26]));
  for (let k = 0; k < 3; k++) p.circle(kx + 3 + k * 5, -38 - k * 3, 2.5 + k, p.c([0.5, 0.5, 0.52, 0.5 - k * 0.12]));
}

const DRAW = {
  port_cranes: port, teen_talwar: teenTalwar, bahria_icon: bahriaIcon, mazar_e_quaid: mazar,
  masjid_e_tooba: tooba, skyline, fields, orchard, banyan, village,
};

// Build the landmark band for these bases. res: canvas px per (720p) px.
// Returns [{canvas, left, w, h, camX}] with left/w/h in Godot px (already scaled by SCALE).
export function buildLandmarks(bases, time, res) {
  const out = [];
  let i = 0;
  for (const b of bases) {
    for (const k of b.landmarks || []) {
      for (const [kind, off] of LAYOUT[k] || []) {
        const [l, r, h] = BOUNDS[kind];
        const s = SCALE[kind] || 1;
        const ppu = 2 * res * s; // canvas px per Godot px
        const c = makeCanvas(Math.ceil((r - l) * ppu) + 2, Math.ceil(h * ppu) + 2);
        const x = c.getContext('2d');
        x.setTransform(ppu, 0, 0, ppu, -l * ppu + 1, h * ppu + 1);
        DRAW[kind](new Pen(x, time, 31 + i * 17));
        out.push({ base: b, canvas: c, left: l * s, w: (r - l) * s, h: h * s, camX: b.x + off * LANDMARKS.offsetScale, flat: kind === 'fields' });
        i++;
      }
    }
  }
  // Flat things (fields) behind everything else.
  out.sort((a, b) => (b.flat ? 1 : 0) - (a.flat ? 1 : 0));
  return out;
}
