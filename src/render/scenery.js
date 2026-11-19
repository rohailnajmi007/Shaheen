// Scenery built once per flight into cached canvases: parallax tiles,
// clouds, stars, base buildings and ground targets.
import { makeCanvas, shade, rng, periodicNoise, images, tinted, hexToRgb } from './assets.js';
import { THEMES } from '../data/world.js';

export const TILE_W = 2048; // logical px (at 720p)

// Parallax layers, far to near. speed = screen px (at 720p) per metre the camera moves.
export const LAYERS = [
  { slot: 'mountains', speed: 0.22, h: 320, haze: 0.62, lift: 0.04 },
  { slot: 'city', speed: 0.4, h: 230, haze: 0.42, lift: 0.07 },
  { slot: 'mid', speed: 0.9, h: 170, haze: 0.3, lift: 0.12 },
  { slot: 'trees', speed: 2.4, h: 110, haze: 0.12, lift: 0.3 },
];

function fbm(noises, x) {
  let v = 0, a = 0.5, f = 1, tot = 0;
  for (const n of noises) { v += n(x * f) * a; tot += a; a *= 0.5; f *= 2; }
  return v / tot;
}

// One seamless tile for a layer slot of a theme. Returns {canvas, bottomColor} or null.
export function buildLayer(slot, themeId, time, res) {
  const th = THEMES[themeId];
  const L = LAYERS.find((l) => l.slot === slot);
  if (slot === 'city' && !th.city) return null;
  if (slot === 'mountains' && !th.mountains) return null;
  const W = Math.round(TILE_W * res), H = Math.round(L.h * res);
  const c = makeCanvas(W, H);
  const x = c.getContext('2d');
  const light = time.light;
  const seed = [...themeId + slot].reduce((s, ch) => s * 31 + ch.charCodeAt(0), 7);
  const r = rng(seed);
  let bottom;

  if (slot === 'mountains') {
    const ns = [16, 32, 64, 128].map((p, i) => periodicNoise(seed + i, p));
    const amp = H * (0.25 + th.mountainsHi);
    const prof = [];
    for (let px = 0; px <= W; px += 2) prof.push([px, H - Math.pow(fbm(ns, (px / W) * 16), 1.6) * amp * 1.7 - H * 0.08]);
    const path = (dx = 0, dy = 0) => {
      x.beginPath(); x.moveTo(dx, H);
      for (const [px, py] of prof) x.lineTo(px + dx, py + dy);
      x.lineTo(W + dx, H); x.closePath();
    };
    const top = H - amp * 1.7;
    const g = x.createLinearGradient(0, top, 0, H);
    g.addColorStop(0, shade(th.mountains, light.map((v) => Math.min(1, v * 1.1)), time.haze, L.haze * 0.85));
    g.addColorStop(1, shade(th.mountains, light, time.haze, L.haze + 0.18));
    path(); x.fillStyle = g; x.fill();
    // Shadowed faces: the silhouette shifted toward the light, cut out of the original.
    x.save(); path(); x.clip();
    x.globalAlpha = 0.22;
    x.fillStyle = shade(th.mountains, light.map((v) => v * 0.55), null, 0);
    path(14 * res, 10 * res); x.fill();
    x.globalAlpha = 1;
    if (th.snow) {
      const snowY = H - amp * 1.7 * 0.62;
      const sg = x.createLinearGradient(0, top, 0, snowY + 18 * res);
      sg.addColorStop(0, shade('#f4f7fb', light, time.haze, L.haze * 0.5));
      sg.addColorStop(0.75, shade('#e6edf5', light, time.haze, L.haze * 0.7));
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = sg; x.fillRect(0, top - 2, W, snowY + 18 * res - top);
    }
    // Haze pooling at the foot of the range.
    const hz = x.createLinearGradient(0, H * 0.55, 0, H);
    hz.addColorStop(0, 'rgba(0,0,0,0)');
    hz.addColorStop(1, shade(time.haze, [1, 1, 1]).replace('rgb', 'rgba').replace(')', ',0.55)'));
    x.fillStyle = hz; x.fillRect(0, H * 0.55, W, H * 0.45);
    x.restore();
    bottom = shade(th.mountains, light, time.haze, L.haze + 0.4);
  } else if (slot === 'city') {
    const sil = shade('#8a8f99', light, time.haze, L.haze);
    const sil2 = shade('#9aa0aa', light, time.haze, L.haze + 0.1);
    const win = time.lights ? 'rgba(255,214,140,0.9)' : null;
    // Low town band, then towers.
    for (let px = 0; px < W;) {
      const w = (14 + r() * 40) * res, h = (20 + r() * 50) * res;
      x.fillStyle = r() < 0.5 ? sil : sil2;
      x.fillRect(px, H - h, w, h);
      if (win) drawWindows(x, px, H - h, w, h, res, r, win, 0.25);
      px += w + r() * 6 * res;
    }
    for (let i = 0; i < 18; i++) {
      const px = r() * W, w = (16 + r() * 26) * res, h = (70 + r() * 120) * res;
      x.fillStyle = sil;
      x.fillRect(px, H - h, w, h);
      if (r() < 0.4) { x.fillRect(px + w * 0.45, H - h - 22 * res, 2 * res, 22 * res); }
      if (win) drawWindows(x, px, H - h, w, h, res, r, win, 0.35);
    }
    // Karachi landmarks (Mazar-e-Quaid, Teen Talwar, Bahria Icon, port...) are drawn
    // by landmarks.js near Masroor; this tile is only the generic skyline.
    bottom = sil;
  } else if (slot === 'mid') {
    if (th.sea) {
      const top = H * 0.62;
      const g = x.createLinearGradient(0, top, 0, H);
      g.addColorStop(0, shade('#5f9fb8', light, time.haze, 0.45));
      g.addColorStop(1, shade('#2f6f8c', light, time.haze, 0.25));
      x.fillStyle = g;
      x.fillRect(0, top, W, H - top);
      x.fillStyle = time.lights ? 'rgba(255,230,180,0.35)' : 'rgba(255,255,255,0.45)';
      for (let i = 0; i < 260; i++) {
        const gy = top + Math.pow(r(), 1.6) * (H - top);
        x.fillRect(r() * W, gy, (3 + r() * 12) * res, 1 * res);
      }
      // Far shore line under the city.
      x.fillStyle = shade(th.hills, light, time.haze, 0.4);
      x.fillRect(0, top - 3 * res, W, 3 * res);
      bottom = shade('#2f6f8c', light, time.haze, 0.25);
    } else {
      const ns = [8, 16, 32].map((p, i) => periodicNoise(seed + 10 + i, p));
      const amp = H * (0.35 + th.hillsHi * 2.2);
      const g = x.createLinearGradient(0, H - amp, 0, H);
      g.addColorStop(0, shade(th.hills, light, time.haze, L.haze));
      g.addColorStop(1, shade(th.hills, light.map((v) => v * 0.85), time.haze, L.haze * 0.6));
      x.fillStyle = g;
      x.beginPath(); x.moveTo(0, H);
      for (let px = 0; px <= W; px += 4) x.lineTo(px, H - fbm(ns, (px / W) * 8) * amp - 10 * res);
      x.lineTo(W, H); x.fill();
      // Fields and bush dots.
      x.fillStyle = shade(th.trees, light, time.haze, L.haze);
      for (let i = 0; i < 500; i++) {
        const px = r() * W;
        const top = H - fbm(ns, (px / W) * 8) * amp - 10 * res;
        const py = top + r() * (H - top);
        x.beginPath(); x.arc(px, py, (1 + r() * 2.5) * res, 0, Math.PI * 2); x.fill();
      }
      bottom = shade(th.hills, light.map((v) => v * 0.85), time.haze, L.haze * 0.6);
    }
  } else if (slot === 'trees') {
    const dark = shade(th.trees, light.map((v) => v * 0.85), time.haze, L.haze);
    const lit = shade(th.trees, light.map((v) => Math.min(1, v * 1.15)), time.haze, L.haze);
    const trunk = shade('#4a3a2a', light, time.haze, L.haze);
    const count = themeId === 'desert' ? 40 : themeId === 'coast' ? 70 : 170;
    for (let i = 0; i < count; i++) {
      const px = r() * W;
      const kind = r();
      const s = (0.6 + r() * 0.8) * res;
      if (themeId === 'coast' && kind < 0.45) drawPalm(x, px, H, s * 1.2, dark, trunk);
      else if (themeId === 'kpk' && kind < 0.3) drawPoplar(x, px, H, s, dark, lit);
      else if (themeId === 'punjab' && kind < 0.25) drawBanyan(x, px, H, s * 1.3, dark, lit, trunk);
      else drawBush(x, px, H, s * (themeId === 'desert' ? 0.6 : 1), dark, lit, trunk, r);
    }
    bottom = shade(th.groundDark, light, time.haze, 0.3);
  }
  return { canvas: c, bottom, w: W, h: H };
}

function drawWindows(x, x0, y0, w, h, res, r, col, density) {
  x.fillStyle = col;
  const step = 6 * res;
  for (let yy = y0 + 4 * res; yy < y0 + h - 4 * res; yy += step) {
    for (let xx = x0 + 3 * res; xx < x0 + w - 3 * res; xx += 5 * res) {
      if (r() < density) x.fillRect(xx, yy, 2 * res, 2.5 * res);
    }
  }
}
function drawBush(x, px, H, s, dark, lit, trunk, r) {
  const h = (18 + r() * 26) * s;
  x.fillStyle = trunk;
  x.fillRect(px - 1.2 * s, H - h * 0.5, 2.4 * s, h * 0.5);
  x.fillStyle = dark;
  for (let k = 0; k < 4; k++) {
    x.beginPath(); x.arc(px + (r() - 0.5) * 14 * s, H - h * 0.55 - r() * h * 0.4, (6 + r() * 7) * s, 0, Math.PI * 2); x.fill();
  }
  x.fillStyle = lit;
  x.beginPath(); x.arc(px + 3 * s, H - h * 0.8, 5 * s, 0, Math.PI * 2); x.fill();
}
function drawPoplar(x, px, H, s, dark, lit) {
  x.fillStyle = dark;
  x.beginPath(); x.ellipse(px, H - 34 * s, 6 * s, 34 * s, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = lit;
  x.beginPath(); x.ellipse(px + 2 * s, H - 40 * s, 3 * s, 24 * s, 0, 0, Math.PI * 2); x.fill();
}
function drawBanyan(x, px, H, s, dark, lit, trunk) {
  x.fillStyle = trunk;
  x.fillRect(px - 3 * s, H - 22 * s, 6 * s, 22 * s);
  x.fillStyle = dark;
  x.beginPath(); x.ellipse(px, H - 30 * s, 28 * s, 14 * s, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = lit;
  x.beginPath(); x.ellipse(px + 6 * s, H - 36 * s, 16 * s, 7 * s, 0, 0, Math.PI * 2); x.fill();
}
function drawPalm(x, px, H, s, dark, trunk) {
  x.strokeStyle = trunk; x.lineWidth = 2 * s;
  x.beginPath(); x.moveTo(px, H); x.quadraticCurveTo(px + 4 * s, H - 20 * s, px + 2 * s, H - 36 * s); x.stroke();
  x.strokeStyle = dark; x.lineWidth = 2.2 * s;
  for (let k = 0; k < 6; k++) {
    const a = -Math.PI / 2 + (k - 2.5) * 0.55;
    x.beginPath(); x.moveTo(px + 2 * s, H - 36 * s);
    x.quadraticCurveTo(px + 2 * s + Math.cos(a) * 10 * s, H - 36 * s + Math.sin(a) * 6 * s, px + 2 * s + Math.cos(a) * 16 * s, H - 30 * s + Math.sin(a) * 2 * s);
    x.stroke();
  }
}

// Near ground band, drawn at world scale. 2048 px = 256 m at 8 px/m.
export function buildGround(themeId, time, res) {
  const th = THEMES[themeId];
  const W = Math.round(TILE_W * res), H = Math.round(140 * res);
  const c = makeCanvas(W, H);
  const x = c.getContext('2d');
  const r = rng(themeId.length * 977);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, shade(th.ground, time.light));
  g.addColorStop(1, shade(th.groundDark, time.light.map((v) => v * 0.8)));
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  // Soil bands and specks give depth.
  for (let i = 0; i < 900; i++) {
    const y = Math.pow(r(), 1.5) * H;
    x.fillStyle = r() < 0.5 ? shade(th.groundDark, time.light, null, 0) : shade(th.ground, time.light.map((v) => Math.min(1, v * 1.12)));
    x.globalAlpha = 0.35 + r() * 0.4;
    x.fillRect(r() * W, y, (2 + r() * 10 * (1 - y / H + 0.3)) * res, (1 + r()) * res);
  }
  x.globalAlpha = 1;
  // Grass tufts along the top edge.
  x.fillStyle = shade(th.groundDark, time.light);
  for (let px = 0; px < W; px += (2 + r() * 5) * res) {
    const h = (1 + r() * 4) * res;
    x.fillRect(px, 0, 1.2 * res, h);
  }
  return { canvas: c, w: W, h: H, bottom: shade(th.groundDark, time.light.map((v) => v * 0.8)) };
}

// Soft clouds: overlapping soft puffs, lit on top and shaded underneath.
export function buildClouds(time, res, count = 7) {
  const out = [];
  const r = rng(4242);
  for (let i = 0; i < count; i++) {
    const W = Math.round((360 + r() * 360) * res), H = Math.round(W * (0.32 + r() * 0.12));
    const c = makeCanvas(W, H);
    const x = c.getContext('2d');
    const puffs = 14 + Math.floor(r() * 12);
    for (let k = 0; k < puffs; k++) {
      const t = k / puffs;
      const rad = H * (0.18 + r() * 0.26) * (1 - Math.abs(t - 0.5) * 0.9);
      const px = Math.min(W - rad - 1, Math.max(rad + 1, W * (0.12 + 0.76 * t + (r() - 0.5) * 0.08)));
      const py = Math.max(rad + 1, H * 0.72 - rad * (0.4 + r() * 0.5));
      const g = x.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.7, 'rgba(0,0,0,0.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.beginPath(); x.arc(px, py, rad, 0, Math.PI * 2); x.fill();
    }
    x.globalCompositeOperation = 'source-in';
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, time.cloud); g.addColorStop(0.55, time.cloud); g.addColorStop(1, time.cloudShade);
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    out.push({ canvas: c, w: W, h: H });
  }
  return out;
}

export function buildStars(res) {
  const W = Math.round(1600 * res), H = Math.round(700 * res);
  const c = makeCanvas(W, H);
  const x = c.getContext('2d');
  const r = rng(99);
  for (let i = 0; i < 700; i++) {
    const b = Math.pow(r(), 3);
    x.fillStyle = `rgba(${220 + r() * 35},${225 + r() * 30},255,${0.3 + b * 0.7})`;
    const s = (0.6 + b * 1.6) * res;
    x.fillRect(r() * W, Math.pow(r(), 1.3) * H, s, s);
  }
  return { canvas: c, w: W, h: H };
}

// --- Buildings (drawn at R px per metre; y up from the ground line) ---

function sprite(wM, hM, R, draw) {
  const c = makeCanvas(wM * R, hM * R);
  const x = c.getContext('2d');
  draw(x, c.width, c.height, R);
  return { canvas: c, wM, hM };
}

function hangar(time, R, col) {
  return sprite(64, 22, R, (x, W, H, R) => {
    const body = shade(col, time.light), roof = shade('#6c7178', time.light), dark = shade('#3a3f45', time.light);
    x.fillStyle = roof;
    x.beginPath(); x.moveTo(0, H); x.lineTo(0, 9 * R); x.quadraticCurveTo(W / 2, -4 * R, W, 9 * R); x.lineTo(W, H); x.fill();
    x.fillStyle = body;
    x.fillRect(2 * R, 9 * R, W - 4 * R, H - 9 * R);
    x.fillStyle = dark;
    x.fillRect(6 * R, 12 * R, W - 12 * R, H - 12 * R);
    x.fillStyle = shade('#80868d', time.light);
    for (let i = 0; i < 6; i++) x.fillRect(6 * R + i * (W - 12 * R) / 6, 12 * R, (W - 12 * R) / 6 - 0.4 * R, H - 12 * R);
    if (time.lights) { x.fillStyle = 'rgba(255,220,150,0.95)'; x.fillRect(W / 2 - 14 * R, H - 9 * R, 28 * R, 9 * R); }
  });
}
function tower(time, R, hM) {
  return sprite(12, hM + 2, R, (x, W, H, R) => {
    const body = shade('#e3dccb', time.light), glass = time.lights ? '#ffd88a' : shade('#3c5a73', time.light);
    x.fillStyle = body; x.fillRect(3.5 * R, 7 * R, 5 * R, H - 7 * R);
    x.fillStyle = shade('#c9c1ae', time.light); x.fillRect(3.5 * R, 7 * R, 1.4 * R, H - 7 * R);
    x.fillStyle = shade('#5b5f66', time.light); x.fillRect(0.5 * R, 1.5 * R, 11 * R, 1.4 * R); x.fillRect(1 * R, 6 * R, 10 * R, 1.6 * R);
    x.fillStyle = glass; x.fillRect(1.3 * R, 2.9 * R, 9.4 * R, 3.1 * R);
    x.fillStyle = shade('#d9442e', time.light); x.fillRect(5.6 * R, 0, 0.8 * R, 1.5 * R);
  });
}
function admin(time, R, floors, col) {
  const hM = floors * 4 + 1.5;
  return sprite(70, hM, R, (x, W, H, R) => {
    x.fillStyle = shade(col, time.light); x.fillRect(0, 1.5 * R, W, H - 1.5 * R);
    x.fillStyle = shade('#8b6f5a', time.light); x.fillRect(-1, 0, W + 2, 1.5 * R);
    const lit = time.lights;
    const r = rng(floors * 13);
    for (let f = 0; f < floors; f++) {
      for (let i = 0; i < 16; i++) {
        x.fillStyle = lit && r() < 0.55 ? '#ffd27a' : shade('#38506a', time.light);
        x.fillRect((2 + i * 4.2) * R, (2.6 + f * 4) * R, 2.4 * R, 2 * R);
      }
    }
  });
}
function shelter(time, R) {
  return sprite(28, 10, R, (x, W, H, R) => {
    x.fillStyle = shade('#8c8d7d', time.light);
    x.beginPath(); x.moveTo(0, H); x.quadraticCurveTo(0, 0, W / 2, 0); x.quadraticCurveTo(W, 0, W, H); x.fill();
    x.fillStyle = shade('#2f3236', time.light);
    x.beginPath(); x.moveTo(4 * R, H); x.quadraticCurveTo(4 * R, 3 * R, W / 2, 3 * R); x.quadraticCurveTo(W - 4 * R, 3 * R, W - 4 * R, H); x.fill();
  });
}
function board(time, R, text, bg = '#16365c', trim = '#e8c25a') {
  const [l1, l2] = text.split('|');
  return sprite(14, 7, R, (x, W, H, R) => {
    x.fillStyle = shade('#666', time.light); x.fillRect(2 * R, 3 * R, 0.6 * R, 4 * R); x.fillRect(W - 2.6 * R, 3 * R, 0.6 * R, 4 * R);
    x.fillStyle = shade(trim, time.light); x.fillRect(0, 0, W, 3.8 * R);
    x.fillStyle = shade(bg, time.light); x.fillRect(0.25 * R, 0.25 * R, W - 0.5 * R, 3.3 * R);
    x.fillStyle = shade('#ffffff', time.light); x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `600 ${1.0 * R}px "Chakra Petch", sans-serif`; x.fillText(l1, W / 2, 1.2 * R);
    x.font = `700 ${1.25 * R}px "Chakra Petch", sans-serif`; x.fillStyle = shade(trim, time.light); x.fillText(l2 || '', W / 2, 2.55 * R);
  });
}
function welcome(time, R, lines) {
  return sprite(30, 9, R, (x, W, H, R) => {
    x.fillStyle = shade('#c8c3b5', time.light); x.fillRect(1 * R, 5.5 * R, 1 * R, 3.5 * R); x.fillRect(W - 2 * R, 5.5 * R, 1 * R, 3.5 * R);
    x.fillStyle = shade('#0b5d2e', time.light); x.fillRect(0, 0, W, 5.6 * R);
    x.fillStyle = shade('#ffffff', time.light); x.fillRect(0, 0, 4 * R, 5.6 * R);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `700 ${1.5 * R}px "Chakra Petch", sans-serif`; x.fillText(lines[0], W / 2 + 2 * R, 1.9 * R);
    x.fillStyle = shade('#e8c25a', time.light);
    x.font = `600 ${1.1 * R}px "Chakra Petch", sans-serif`; x.fillText(lines[1] || '', W / 2 + 2 * R, 3.9 * R);
    // Star and crescent on the white band.
    x.fillStyle = shade('#0b5d2e', time.light);
    x.beginPath(); x.arc(2 * R, 2.8 * R, 1.4 * R, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff';
    x.beginPath(); x.arc(2.4 * R, 2.6 * R, 1.15 * R, 0, Math.PI * 2); x.fill();
  });
}

// --- Godot-unit base objects (ported from base.gd: 4 Godot px per metre) ---
// Drawn centred on x = 0 with the ground at y = 0 (y up is negative), like Godot.
const GPX = 4; // Godot px per metre
// Signs and trophies were sized for Godot's double-size aircraft: drawn at this many
// Godot px per metre instead (smaller), so they sit right next to the parked jets.
const SIGN_GPX = 6;
function godotSprite(wPx, hPx, R, draw, ppm = GPX) {
  return sprite(wPx / ppm, hPx / ppm, R, (x) => {
    x.scale(R / ppm, R / ppm);
    x.translate(wPx / 2, hPx);
    draw(x);
  });
}
const c01 = (c, a = 1) => `rgba(${Math.round(Math.min(1, c[0]) * 255)},${Math.round(Math.min(1, c[1]) * 255)},${Math.round(Math.min(1, c[2]) * 255)},${a})`;
const lit01 = (c, L) => [c[0] * L[0], c[1] * L[1], c[2] * L[2]];
const lighter = (c, a) => [c[0] + (1 - c[0]) * a, c[1] + (1 - c[1]) * a, c[2] + (1 - c[2]) * a];
const darker = (c, a) => [c[0] * (1 - a), c[1] * (1 - a), c[2] * (1 - a)];
function gfx(x) {
  return {
    rect: (rx, ry, w, h, s) => { x.fillStyle = s; x.fillRect(rx, ry, w, h); },
    poly: (pts, s) => { x.fillStyle = s; x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.fill(); },
    line: (pts, s, w = 1) => { x.strokeStyle = s; x.lineWidth = w; x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke(); },
    circle: (cx, cy, r, s) => { x.fillStyle = s; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); },
    ellipse: (cx, cy, rx, ry, s) => { x.fillStyle = s; x.beginPath(); x.ellipse(cx, cy, Math.max(rx, 0.1), Math.max(ry, 0.1), 0, 0, Math.PI * 2); x.fill(); },
    text: (s, tx, ty, size, col, align = 'center') => { x.font = `600 ${size}px "Chakra Petch", sans-serif`; x.textAlign = align; x.textBaseline = 'alphabetic'; x.fillStyle = col; x.fillText(s, tx, ty); },
  };
}
function textW(s, size) {
  const x = makeCanvas(4, 4).getContext('2d');
  x.font = `600 ${size}px "Chakra Petch", sans-serif`;
  return x.measureText(s).width;
}

// Welcome monument (Mushaf): dark-blue stone slab with a gold key-pattern frame,
// round crest, a gold calligraphy line and the two lines of text. Floodlit at night.
function monument(time, R, lines) {
  const [l1, l2 = ''] = lines;
  const w1 = textW(l1, 16), w2 = textW(l2, 8);
  const w = Math.max(w1, w2) + 28;
  const night = !!time.lights;
  const L = time.light;
  const gold = night ? c01([0.95, 0.8, 0.45]) : c01(lit01([0.93, 0.78, 0.42], L));
  const navy = [0.1, 0.16, 0.3], stone = [0.45, 0.44, 0.42], outline = [0.18, 0.18, 0.2];
  return godotSprite(w + 20, 78, R, (x) => {
    const g = gfx(x);
    g.rect(-w / 2 - 6, -6, w + 12, 6, c01(lit01(stone, L)));
    g.rect(-w / 2 - 6, -6, w + 12, 1, c01(lit01(lighter(stone, 0.2), L)));
    const top = -60, bottom = -6;
    g.poly([[-w / 2, bottom], [w / 2, bottom], [w / 2 - 3, top], [-w / 2 + 3, top]], c01(lit01(outline, L)));
    g.poly([[-w / 2 + 1, bottom], [w / 2 - 1, bottom], [w / 2 - 4, top + 1], [-w / 2 + 4, top + 1]], c01(lit01(navy, L)));
    g.rect(-w / 2 + 4, top + 1, w - 8, 2, c01(lit01(lighter(navy, 0.12), L)));
    // Gold frame with key-pattern corners.
    const fx = -w / 2 + 7, fy = top + 6, fw = w - 14, fh = bottom - top - 10;
    x.strokeStyle = gold; x.lineWidth = 1; x.strokeRect(fx + 0.5, fy + 0.5, fw - 1, fh - 1);
    const key = [[0, 0], [8, 0], [8, 6], [3, 6], [3, 3], [6, 3]];
    for (const [px, py, sx, sy] of [[fx, fy, 1, 1], [fx + fw, fy, -1, 1], [fx, fy + fh, 1, -1], [fx + fw, fy + fh, -1, -1]]) {
      g.line(key.map(([a, b]) => [px + a * sx, py + b * sy]), gold);
      g.line(key.map(([a, b]) => [px + b * sx, py + a * sy]), gold);
    }
    // Crest: gold ring, blue disc, white centre, green dot, star above.
    g.circle(0, top + 4, 8, gold);
    g.circle(0, top + 4, 6.5, c01(lit01([0.12, 0.3, 0.62], L)));
    g.circle(0, top + 4, 3.5, night ? c01([0.92, 0.94, 0.95]) : c01(lit01([0.92, 0.94, 0.95], L)));
    g.circle(0, top + 4, 1.5, c01(lit01([0.1, 0.4, 0.22], L)));
    const star = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + Math.PI * i / 5; const r = i % 2 === 0 ? 3 : 1.35; star.push([Math.cos(a) * r, top - 7 + Math.sin(a) * r]); }
    g.poly(star, gold);
    // Calligraphy line: short gold strokes and dots.
    const r = rng(77);
    for (let lx = -w1 * 0.4; lx < w1 * 0.4;) {
      const sw = 2 + Math.floor(r() * 5);
      g.rect(lx, top + 17, sw, 1, gold);
      if (r() < 0.5) g.rect(lx + Math.floor(r() * sw), top + 14 - Math.floor(r() * 3), 1, 3, gold);
      if (r() < 0.3) g.rect(lx + 1, top + 19, 1, 1, gold);
      lx += sw + 1 + Math.floor(r() * 3);
    }
    g.text(l1, 0, top + 36, 16, gold);
    g.text(l2, 0, top + 47, 8, gold);
    if (night) for (const fxl of [-w * 0.3, w * 0.3]) { g.rect(fxl - 2, -3, 4, 3, '#333'); g.circle(fxl, -4, 1.5, 'rgb(255,230,150)'); }
  }, SIGN_GPX);
}

// Captured-aircraft display (Mushaf): the tail section of an IAF jet on a black stone
// plinth with its name in gold. The tail faces left. Floodlit at night.
const TROPHY_SCALE = 1.5;
function trophy(time, R, kind) {
  const label = kind === 'mig21' ? 'IAF MIG-21 BISON' : 'IAF SU-30MKI';
  const tw = textW(label, 8);
  const w = tw + 14;
  const night = !!time.lights;
  const L = time.light;
  const flood = (c) => (night ? c01([c[0] * 0.75, c[1] * 0.72, c[2] * 0.65].map((v) => Math.min(1, v * 1.25))) : c01(lit01(c, L)));
  const gold = night ? c01([0.95, 0.8, 0.45]) : c01(lit01([0.92, 0.78, 0.42], L));
  return godotSprite(Math.max(w, 70) + 4, 84, R, (x) => {
    const g = gfx(x);
    g.poly([[-w / 2, 0], [w / 2, 0], [w / 2, -17], [-w / 2, -13]], c01(lit01([0.1, 0.1, 0.11], L)));
    g.line([[-w / 2, -13], [w / 2, -17]], c01(lit01([0.32, 0.32, 0.34], L)));
    g.text(label, 0, -3, 8, gold);
    const sc = TROPHY_SCALE;
    g.rect(-10 * sc, -16 - 3 * sc, 2, 3 * sc, c01(lit01([0.18, 0.18, 0.2], L)));
    g.rect(8 * sc, -16 - 3 * sc, 2, 3 * sc, c01(lit01([0.18, 0.18, 0.2], L)));
    x.save();
    x.translate(0, -16 - 3 * sc);
    x.scale(sc, sc);
    const fin = (p, size) => {
      const bw = size[0] / 3;
      g.rect(p[0], p[1], bw, size[1], flood([0.1, 0.5, 0.2]));
      g.rect(p[0] + bw, p[1], bw, size[1], flood([0.95, 0.95, 0.93]));
      g.rect(p[0] + bw * 2, p[1], bw, size[1], flood([0.95, 0.55, 0.15]));
    };
    if (kind === 'mig21') {
      const skin = [0.66, 0.68, 0.7], shade = [0.5, 0.52, 0.55], dark = [0.2, 0.2, 0.22];
      g.rect(-22, -8, 42, 8, flood(shade));
      g.rect(-22, -8, 42, 5, flood(skin));
      g.rect(-22, -8, 42, 1, flood(lighter(skin, 0.15)));
      g.rect(20, -7, 3, 7, flood(dark));
      g.rect(-22, -8, 1, 8, flood(dark));
      const f = [[-14, -8], [6, -31], [13, -31], [17, -8]];
      g.poly(f, flood(skin));
      g.line(f, flood(dark));
      g.poly([[5, -30], [6, -31], [13, -31], [13.3, -28], [7.7, -28]], flood([0.45, 0.6, 0.35]));
      g.line([[9, -27], [15, -10]], flood(shade));
      fin([-1, -22], [9, 6]);
    } else {
      const skin = [0.56, 0.62, 0.68], patch = [0.44, 0.5, 0.58], shade = [0.4, 0.45, 0.5], dark = [0.18, 0.19, 0.22];
      const far = [[-16, -9], [-1, -35], [5, -35], [9, -9]];
      g.poly(far, flood(shade)); g.line([...far, far[0]], flood(dark));
      g.rect(-26, -9, 50, 9, flood(shade));
      g.rect(-26, -9, 50, 6, flood(skin));
      g.rect(-10, -8, 14, 4, flood(patch));
      g.rect(-26, -9, 1, 9, flood(dark));
      g.rect(24, -8, 4, 4, flood(dark));
      g.rect(24, -4, 4, 4, flood(lighter(dark, 0.1)));
      g.poly([[12, -5], [30, -3], [30, -1], [12, -2]], flood(shade));
      const f = [[-10, -9], [6, -37], [12, -37], [17, -9]];
      g.poly(f, flood(skin));
      g.poly([[-2, -20], [6, -32], [10, -24], [4, -16]], flood(patch));
      g.line(f, flood(dark));
      g.rect(7, -40, 1, 3, flood(dark));
      fin([4, -27], [8, 5]);
    }
    x.restore();
    if (night) g.circle(-w / 2 + 3, -1, 1.5, 'rgb(255,230,150)');
  }, SIGN_GPX);
}

// Banyan tree on the base: short thick trunk, prop-roots, huge wide low dome of foliage.
const BANYAN = { heightM: 17, widthM: 34 };
function banyanTree(time, R, index, leafHex) {
  const r = rng(911 + index * 37);
  const L = time.light;
  const h = BANYAN.heightM * GPX * (0.85 + r() * 0.25);
  const w = BANYAN.widthM * GPX * (0.85 + r() * 0.3);
  const lh = hexToRgb(leafHex).map((v) => v / 255);
  const leaf = (k) => c01(lit01(k > 0 ? lighter(lh, k) : darker(lh, -k), L));
  const bark = [0.4, 0.33, 0.26], root = c01(lit01([0.48, 0.42, 0.35], L));
  return godotSprite(w * 1.15, h * 1.08, R, (x) => {
    const g = gfx(x);
    const cy = -h * 0.62;
    for (let k = 0; k < 14; k++) {
      const rx = -w * 0.42 + r() * w * 0.84;
      if (Math.abs(rx) < 8) continue;
      const reach = r() < 0.6 ? 0 : -(h * 0.15 + r() * h * 0.2);
      const thick = reach === 0 && r() < 0.5 ? 2 : 1;
      g.rect(rx, cy + h * 0.12, thick, reach - cy - h * 0.12, root);
    }
    g.poly([[-12, 0], [12, 0], [6, -10], [5, cy + 8], [-5, cy + 8], [-6, -10]], c01(lit01(bark, L)));
    g.line([[-3, cy + 14], [-w * 0.3, cy + 4]], c01(lit01(bark, L)), 3);
    g.line([[3, cy + 12], [w * 0.32, cy + 6]], c01(lit01(bark, L)), 3);
    g.ellipse(0, cy + 2, w * 0.5, h * 0.16, leaf(-0.3));
    for (let k = 0; k <= 10; k++) {
      const t = k / 10, arch = Math.sin(t * Math.PI);
      const bx = (t - 0.5) * w * 0.86, by = cy - h * 0.12 * arch - r() * 4;
      g.ellipse(bx, by, w * (0.11 + r() * 0.04), h * (0.14 + r() * 0.06) * (0.7 + 0.5 * arch), leaf(-r() * 0.15));
    }
    for (let k = 0; k < 6; k++) {
      g.ellipse(-w * 0.3 + r() * w * 0.6, cy - h * 0.22 - r() * h * 0.08, w * 0.09, h * 0.08, leaf(0.06 + r() * 0.1));
    }
  });
}

// All static objects for one base, positions in metres from its threshold.
export function buildBase(base, time, R) {
  const objs = [];
  const add = (spr, x, layer = 0) => objs.push({ ...spr, x: base.x + x, layer });
  // Centred on cx (Godot placement).
  const addC = (spr, cx) => add(spr, cx - spr.wM / 2);
  const col = '#e2d9c3';
  (base.banyanX || []).forEach((bx, i) => addC(banyanTree(time, R, i, THEMES[base.theme].trees), bx));
  for (let i = 0; i < base.hangars; i++) add(hangar(time, R, col), 120 + i * 72);
  add(admin(time, R, base.id === 'risalpur' ? 3 : 2, col), 120 + base.hangars * 72 + 20);
  const tw = tower(time, R, base.towerM);
  add(tw, 120 + base.hangars * 72 + 104);
  // Squadron boards and trophies; parked aircraft keep clear of them.
  const boardX = base.boards.map((_, i) => base.apron[0] + 80 + i * 70);
  const trophies = base.trophies || [];
  const trophySprites = trophies.map((t) => ({ t, spr: trophy(time, R, t.kind) }));
  // [centre, half width] of everything the parked aircraft must keep clear of.
  const blocked = [...boardX.map((x) => [x + 7, 7]), ...trophySprites.map(({ t, spr }) => [t.x, spr.wM / 2])];
  const CLEAR_M = 4;
  // Parked aircraft on the apron, some in shelters.
  const front = images[base.parked];
  if (front) {
    const sh = shelter(time, R);
    const ac = { canvas: tinted(front, time.light, base.parked), wM: front.width / 16, hM: front.height / 16 };
    let n = 0;
    for (let x = base.apron[0]; x < base.apron[1] && n < 12; x += 15) {
      const inShelter = n % 3 === 2;
      const c = inShelter ? x + 8 : x + ac.wM / 2, half = inShelter ? 14 : ac.wM / 2;
      if (blocked.some(([bc, bh]) => Math.abs(c - bc) < half + bh + CLEAR_M)) continue;
      if (inShelter) { add(sh, x - 6, -1); add({ ...ac, wM: ac.wM * 0.8, hM: ac.hM * 0.8 }, x - 6 + 14 - ac.wM * 0.4); }
      else add(ac, x);
      n++;
    }
  }
  base.boards.forEach((t, i) => add(board(time, R, t, base.boardColor || '#16365c', base.boardTrim || '#e8c25a'), boardX[i]));
  for (const { t, spr } of trophySprites) addC(spr, t.x);
  if (base.welcome) {
    for (const wx of base.welcomeX || [base.runwayM + 40]) {
      if (base.welcomeStyle === 'monument') addC(monument(time, R, base.welcome), wx);
      else add(welcome(time, R, base.welcome), wx);
    }
  }
  return { objs, towerX: base.x + 120 + base.hangars * 72 + 110, towerH: base.towerM };
}

// --- Ground targets ---
export function buildTarget(kind, time, R, dead) {
  const L = time.light;
  const burnt = (c) => (dead ? shade('#2b2725', L) : shade(c, L));
  if (kind === 'sam') {
    return sprite(16, 7, R, (x, W, H, R) => {
      x.fillStyle = burnt('#5e6a3c'); x.fillRect(0.5 * R, 3.5 * R, 12 * R, 2.3 * R); x.fillRect(10 * R, 2 * R, 4 * R, 3.8 * R);
      x.fillStyle = shade('#1d1d1d', L);
      for (const wx of [2.5, 5.5, 8.5, 12]) { x.beginPath(); x.arc(wx * R, 6 * R, 1 * R, 0, Math.PI * 2); x.fill(); }
      if (!dead) {
        x.save(); x.translate(4 * R, 3.6 * R); x.rotate(-0.55);
        x.fillStyle = shade('#d8d8d0', L); x.fillRect(0, -2.2 * R, 9 * R, 1.1 * R); x.fillRect(0, -0.8 * R, 9 * R, 1.1 * R);
        x.fillStyle = shade('#b02a1f', L); x.fillRect(8.4 * R, -2.2 * R, 0.6 * R, 2.5 * R);
        x.restore();
      }
    });
  }
  if (kind === 'radar') {
    return sprite(14, 12, R, (x, W, H, R) => {
      x.fillStyle = burnt('#6c7461'); x.fillRect(1 * R, 8 * R, 12 * R, 4 * R);
      x.fillStyle = burnt('#4b4f45'); x.fillRect(6.4 * R, 4 * R, 1.2 * R, 4 * R);
      if (!dead) {
        x.fillStyle = shade('#d8dcd2', L);
        x.beginPath(); x.ellipse(7 * R, 3 * R, 5.5 * R, 2.6 * R, -0.3, 0, Math.PI * 2); x.fill();
        x.fillStyle = shade('#9da397', L);
        x.beginPath(); x.ellipse(7.2 * R, 3.2 * R, 3.5 * R, 1.4 * R, -0.3, 0, Math.PI * 2); x.fill();
      } else { x.fillStyle = shade('#3a3632', L); x.fillRect(3 * R, 6 * R, 8 * R, 2 * R); }
    });
  }
  if (kind === 'fuel') {
    return sprite(26, 9, R, (x, W, H, R) => {
      for (const [cx, w, h] of [[1, 10, 8], [13, 11, 9]]) {
        x.fillStyle = burnt('#c9c6bb'); x.fillRect(cx * R, H - h * R * (dead ? 0.5 : 1), w * R, h * R);
        if (!dead) { x.fillStyle = shade('#a7a49a', L); x.fillRect(cx * R, H - h * R, w * R, 1 * R); x.fillStyle = shade('#c0392b', L); x.fillRect(cx * R, H - h * R * 0.55, w * R, 0.8 * R); }
      }
    });
  }
  return sprite(16, 6, R, (x, W, H, R) => { // bunker
    x.fillStyle = burnt('#7d7a6a');
    x.beginPath(); x.moveTo(0, H); x.lineTo(2 * R, 1 * R); x.lineTo(W - 2 * R, 1 * R); x.lineTo(W, H); x.fill();
    x.fillStyle = shade('#1b1b1b', L); x.fillRect(5 * R, 2.5 * R, 6 * R, 1.2 * R);
    if (dead) { x.fillStyle = shade('#151414', L); x.beginPath(); x.arc(8 * R, 1 * R, 4 * R, 0, Math.PI); x.fill(); }
  });
}

export function themeColorRgb(themeId, key, light) {
  const c = hexToRgb(THEMES[themeId][key]);
  return c.map((v, i) => v * light[i]);
}
