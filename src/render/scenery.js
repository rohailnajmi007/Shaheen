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
      const snowY = H - amp * 1.7 * (th.snowLine ?? 0.62);
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
      // Punjab: a patchwork of fields in bands receding to the horizon, a canal with
      // a tree line along it (owner 2026-11-21).
      if (th.fields) {
        const top0 = H - amp - 10 * res;
        x.save();
        x.beginPath(); x.moveTo(0, H);
        for (let px = 0; px <= W; px += 4) x.lineTo(px, H - fbm(ns, (px / W) * 8) * amp - 10 * res);
        x.lineTo(W, H); x.closePath(); x.clip();
        const rows = 5;
        for (let k = 0; k < rows; k++) {
          const y0 = top0 + (H - top0) * Math.pow(k / rows, 1.3), y1 = top0 + (H - top0) * Math.pow((k + 1) / rows, 1.3);
          for (let px = -40 * res; px < W;) {
            const w = (60 + r() * 140) * res * (0.6 + k * 0.25);
            const col = th.fieldColors[Math.floor(r() * th.fieldColors.length)];
            const sk = (r() - 0.5) * 30 * res;
            x.fillStyle = shade(col, light, time.haze, L.haze * (1.2 - k * 0.15));
            x.beginPath(); x.moveTo(px + sk, y0); x.lineTo(px + w + sk, y0); x.lineTo(px + w, y1); x.lineTo(px, y1); x.fill();
            // Furrows on the nearer fields.
            if (k >= 2 && r() < 0.6) {
              x.strokeStyle = shade(col, light.map((v) => v * 0.82), time.haze, L.haze);
              x.lineWidth = 1 * res;
              for (let fy = y0 + 3 * res; fy < y1; fy += 4 * res) { x.beginPath(); x.moveTo(px + 2, fy); x.lineTo(px + w - 2, fy); x.stroke(); }
            }
            px += w + 2 * res; // the dark bund between fields shows through
          }
          x.fillStyle = shade(th.groundDark, light, time.haze, L.haze);
          x.fillRect(0, y1 - 1 * res, W, 1.2 * res);
        }
        // Canal: a straight water line across the plain with banks and a row of trees.
        const cy = top0 + (H - top0) * 0.42;
        x.fillStyle = shade('#8a7d5c', light, time.haze, L.haze); x.fillRect(0, cy - 2 * res, W, 7 * res);
        x.fillStyle = shade(th.canal, light, time.haze, L.haze * 0.8); x.fillRect(0, cy, W, 3 * res);
        x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(0, cy + 0.5 * res, W, 0.8 * res);
        x.fillStyle = shade(th.trees, light, time.haze, L.haze);
        for (let px = 0; px < W; px += (7 + r() * 9) * res) {
          const rr = (3 + r() * 3) * res;
          x.beginPath(); x.arc(px, cy - 2 * res - rr * 0.6, rr, 0, Math.PI * 2); x.fill();
        }
        x.restore();
      }
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
    const count = themeId === 'desert' ? 40 : themeId === 'coast' ? 70 : th.palms ? 55 : th.fields ? 80 : 170;
    for (let i = 0; i < count; i++) {
      const px = r() * W;
      const kind = r();
      const s = (0.6 + r() * 0.8) * res;
      if ((themeId === 'coast' || th.palms) && kind < (th.palms ? 0.7 : 0.45)) drawPalm(x, px, H, s * 1.2, dark, trunk);
      else if (themeId === 'kpk' && kind < 0.3) drawPoplar(x, px, H, s, dark, lit);
      else if (themeId === 'punjab' && kind < 0.25) drawBanyan(x, px, H, s * 1.3, dark, lit, trunk);
      else if (th.pines) drawPine(x, px, H, s * (0.8 + kind * 0.6), dark, lit, trunk, shade('#f2f5f9', light, time.haze, L.haze));
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
// Snowy pine: stacked dark tiers with snow on each.
function drawPine(x, px, H, s, dark, lit, trunk, snow) {
  x.fillStyle = trunk;
  x.fillRect(px - 1.5 * s, H - 8 * s, 3 * s, 8 * s);
  for (let k = 0; k < 3; k++) {
    const by = H - 6 * s - k * 11 * s, w = (14 - k * 3.5) * s, h = 16 * s;
    x.fillStyle = k === 2 ? lit : dark;
    x.beginPath(); x.moveTo(px - w, by); x.lineTo(px, by - h); x.lineTo(px + w, by); x.fill();
    x.fillStyle = snow;
    x.beginPath(); x.moveTo(px - w * 0.45, by - h * 0.55); x.lineTo(px, by - h); x.lineTo(px + w * 0.45, by - h * 0.55);
    x.lineTo(px + w * 0.15, by - h * 0.62); x.lineTo(px - w * 0.2, by - h * 0.58); x.fill();
  }
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
  // Punjab (owner 2026-11-21): the near ground is farmland: rows of fields (wheat, mustard,
  // green, fallow) split by earth bunds, furrowed, with a canal running across.
  if (th.fields) {
    const rows = [[0.06, 0.26], [0.26, 0.5], [0.62, 1.0]];
    for (const [a, b] of rows) {
      const y0 = a * H, y1 = b * H;
      for (let px = 0; px < W;) {
        const w = (90 + r() * 220) * res;
        const col = th.fieldColors[Math.floor(r() * th.fieldColors.length)];
        x.fillStyle = shade(col, time.light);
        x.fillRect(px, y0, Math.min(w, W - px), y1 - y0);
        x.strokeStyle = shade(col, time.light.map((v) => v * 0.85)); x.lineWidth = 1.2 * res;
        for (let fy = y0 + 4 * res; fy < y1 - 2 * res; fy += 6 * res) { x.beginPath(); x.moveTo(px + 3 * res, fy); x.lineTo(px + w - 3 * res, fy); x.stroke(); }
        px += w;
        x.fillStyle = shade('#7a6a48', time.light); x.fillRect(px - 1.5 * res, y0, 3 * res, y1 - y0); // bund
      }
      x.fillStyle = shade('#7a6a48', time.light); x.fillRect(0, y0 - 1.5 * res, W, 3 * res);
    }
    // Canal between the 2nd and 3rd rows: banks, water, a glint, a few trees on the bank.
    const cy = 0.48 * H, ch = 0.16 * H;
    x.fillStyle = shade('#8c7b55', time.light); x.fillRect(0, cy, W, ch);
    x.fillStyle = shade(th.canal, time.light); x.fillRect(0, cy + 2.5 * res, W, ch - 5 * res);
    x.fillStyle = 'rgba(255,255,255,0.28)'; x.fillRect(0, cy + ch * 0.4, W, 1.2 * res);
  }
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

// Base name stencilled across the top of the hangar front (owner 2026-11-21), in a
// military stencil font (Black Ops One, public/fonts). Band = facade above the doors (m).
const HANGAR_NAME = { font: '"Black Ops One", "Chakra Petch", sans-serif', bandTopM: 9, doorTopM: 13.5, textM: 3.1, maxWidth: 0.62, spacingM: 0.5, color: '#262a2e' };
// A plane inside (owner 2026-11-21: fighter bases, a C-130): the doors stand open (two
// panels pushed to each side), the hangar is lit inside at night, shaded by day, and the
// plane is drawn planeFill x the door height, its fin cut off by the facade above the door.
const HANGAR_PLANE = { planeFill: 1.45, dayShade: [0.5, 0.52, 0.55], nightLight: [1.0, 0.92, 0.78] };
function hangar(time, R, col, name, plane = null) {
  const N = HANGAR_NAME;
  return sprite(64, 22, R, (x, W, H, R) => {
    const body = shade(col, time.light), roof = shade('#6c7178', time.light), dark = shade('#3a3f45', time.light);
    x.fillStyle = roof;
    x.beginPath(); x.moveTo(0, H); x.lineTo(0, 9 * R); x.quadraticCurveTo(W / 2, -4 * R, W, 9 * R); x.lineTo(W, H); x.fill();
    x.fillStyle = body;
    x.fillRect(2 * R, 9 * R, W - 4 * R, H - 9 * R);
    x.fillStyle = dark;
    x.fillRect(6 * R, N.doorTopM * R, W - 12 * R, H - N.doorTopM * R);
    const img = plane && images[plane];
    const dx0 = 6 * R, dw = W - 12 * R, dy0 = N.doorTopM * R, dh = H - dy0, pw = dw / 6;
    if (img) {
      // Inside: lit floor and back wall at night, deep shade by day.
      const g = x.createLinearGradient(0, dy0, 0, H);
      if (time.lights) { g.addColorStop(0, 'rgb(120,104,80)'); g.addColorStop(1, 'rgb(210,186,140)'); }
      else { g.addColorStop(0, shade('#2b2f34', time.light)); g.addColorStop(1, shade('#4a4f56', time.light)); }
      x.fillStyle = g; x.fillRect(dx0, dy0, dw, dh);
      const P = HANGAR_PLANE;
      const ph = dh * P.planeFill, pwid = ph * img.width / img.height;
      const L = time.lights ? P.nightLight : time.light.map((v, i) => v * P.dayShade[i]);
      x.save(); x.beginPath(); x.rect(dx0, dy0, dw, dh); x.clip();
      x.drawImage(tinted(img, L, plane), W / 2 - pwid / 2, H - ph, pwid, ph);
      x.restore();
      // Door panels pushed to the sides (two at each end, slightly offset).
      x.fillStyle = shade('#80868d', time.light);
      for (const [px, k] of [[dx0, 0], [dx0 + 0.7 * R, 1], [dx0 + dw - pw, 0], [dx0 + dw - pw - 0.7 * R, 1]]) {
        x.fillRect(px, dy0, pw - 0.4 * R, dh);
        x.fillStyle = shade(k ? '#737980' : '#80868d', time.light);
      }
    } else {
      x.fillStyle = shade('#80868d', time.light);
      for (let i = 0; i < 6; i++) x.fillRect(dx0 + i * pw, dy0, pw - 0.4 * R, dh);
    }
    if (name) {
      x.save();
      x.font = `${N.textM * R}px ${N.font}`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      if ('letterSpacing' in x) x.letterSpacing = `${N.spacingM * R}px`;
      const tw = x.measureText(name).width, fit = Math.min(1, W * N.maxWidth / tw);
      x.translate(W / 2, (N.bandTopM + N.doorTopM) / 2 * R + 0.15 * R);
      x.scale(fit, 1);
      x.fillStyle = shade(N.color, time.light);
      x.fillText(name, 0, 0);
      x.restore();
    }
    if (time.lights && !img) { x.fillStyle = 'rgba(255,220,150,0.95)'; x.fillRect(W / 2 - 14 * R, H - 9 * R, 28 * R, 9 * R); }
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
    x.textAlign = 'center'; x.textBaseline = 'middle';
    // Owner 2026-11-21: the squadron name only, big (the number is on the billboard).
    const name = l2 || l1;
    x.font = `700 ${1.9 * R}px "Chakra Petch", sans-serif`;
    const fit = Math.min(1, (W - 1.2 * R) / x.measureText(name).width);
    x.save(); x.translate(W / 2, 1.95 * R); x.scale(fit, 1);
    x.fillStyle = shade(trim, time.light); x.fillText(name, 0, 0);
    x.restore();
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
// plinth with its name in gold, cut from the opponent sprites (owner 2026-11-21). Floodlit at night.
const TROPHY_SCALE = 1.5;
// Fins only (owner 2026-11-21: no fuselage), cut from the opponent sprites along an
// outline in texture px, cut straight at the root; h = height on the plinth.
const TROPHY_ART = {
  mig21: { sprite: 'mig21_body', poly: [[0, 0], [66, 0], [150, 56], [150, 60], [30, 60]], h: 27 },
  su30: { sprite: 'su30_body', poly: [[95, 0], [126, 0], [208, 103], [96, 103]], h: 36 },
};
const TROPHY_GAP = 14; // px between the fins on the shared base
const TROPHY_OP = 'OP. SWIFT RETORT'; // on the base (owner 2026-11-21)
// One display: the fins side by side on a single black stone base, each named in gold
// under it (owner 2026-11-21: "next to each other, set on a black base").
function trophy(time, R, kinds) {
  const night = !!time.lights;
  const L = time.light;
  const gold = night ? c01([0.95, 0.8, 0.45]) : c01(lit01([0.92, 0.78, 0.42], L));
  const sc = TROPHY_SCALE;
  const slots = kinds.map((kind) => {
    const art = TROPHY_ART[kind];
    const xs = art.poly.map((p) => p[0]), ys = art.poly.map((p) => p[1]);
    const bx = Math.min(...xs), by = Math.min(...ys), bw = Math.max(...xs) - bx, bh = Math.max(...ys) - by;
    const finW = bw * art.h / bh * sc;
    return { kind, art, bx, by, bw, bh, finW, w: finW };
  });
  // Only the operation's name on the base (owner 2026-11-21: no aircraft names).
  const w = Math.max(slots.reduce((t, sl) => t + sl.w, 0) + TROPHY_GAP * (slots.length + 1), textW(TROPHY_OP, 11) + 28);
  const baseH = 19, plinthTop = -baseH - 3 * sc;
  return godotSprite(w + 4, 100, R, (x) => {
    const g = gfx(x);
    // The black base, slightly raked, a lit edge on top.
    g.poly([[-w / 2, 0], [w / 2, 0], [w / 2, -baseH], [-w / 2, -baseH + 2]], c01(lit01([0.08, 0.08, 0.09], L)));
    g.line([[-w / 2, -baseH + 2], [w / 2, -baseH]], c01(lit01([0.32, 0.32, 0.34], L)));
    g.rect(-w / 2 + 2, -baseH - 3 * sc, w - 4, 3 * sc, c01(lit01([0.13, 0.13, 0.14], L)));
    // The operation, centred on the base.
    g.text(TROPHY_OP, 0, -5, 11, gold);
    let cx = -w / 2 + TROPHY_GAP;
    for (const sl of slots) {
      const mid = cx + sl.w / 2;
      const img = images[sl.art.sprite];
      if (img) {
        const lit = night ? [0.95, 0.88, 0.75] : L;
        const k = sl.art.h * sc / sl.bh;
        x.save();
        x.translate(mid - sl.finW / 2, plinthTop - sl.art.h * sc);
        x.scale(k, k);
        x.translate(-sl.bx, -sl.by);
        x.beginPath();
        sl.art.poly.forEach(([px, py], n) => (n ? x.lineTo(px, py) : x.moveTo(px, py)));
        x.closePath();
        x.clip();
        x.drawImage(tinted(img, lit), 0, 0);
        x.restore();
      }
      if (night) g.circle(mid, -baseH - 1, 1.5, 'rgb(255,230,150)');
      cx += sl.w + TROPHY_GAP;
    }
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

// Floodlit apron (owner 2026-11-21): masts along the parked rows every everyM; at night
// the parked jets are lit by them (warm light instead of the night tint) and the renderer
// adds the pools of light and the lamps (floods). mastM: mast height (m).
export const FLOODLIGHT = { light: [1.0, 0.93, 0.8], shelterLight: [0.75, 0.7, 0.62], everyM: 32, mastM: 13,
  signLight: [1.0, 0.98, 0.92] }; // signs and billboards at night: lit up by their lamps
function floodMast(time, R) {
  const F = FLOODLIGHT;
  return sprite(3, F.mastM, R, (x, W, H, R) => {
    x.fillStyle = shade('#5d6168', time.light);
    x.fillRect(W / 2 - 0.15 * R, 0.8 * R, 0.3 * R, H);
    x.fillStyle = shade('#3d4046', time.light);
    x.fillRect(0.2 * R, 0, W - 0.4 * R, 0.9 * R);
    x.fillStyle = time.lights ? '#fff4d6' : shade('#c9ccd1', time.light);
    x.fillRect(0.35 * R, 0.55 * R, W - 0.7 * R, 0.35 * R);
  });
}

// Base layout (owner 2026-11-21): parked rows at the start; the hangar block (hangars,
// admin, tower) mid-runway, at least HANGAR_GAP_M after the parked rows and ending at
// least BUILDINGS_END_M before the runway end; the gaps filled with smaller buildings
// (FILL: gap between them [min, max] m, margin kept clear at either end of a stretch).
export const BUILDINGS_END_M = 30;
export const HANGAR_GAP_M = 160;
export const FILL = { gapM: [14, 34], marginM: 22, clearM: 22 };
const hangarBlockM = (base) => base.hangars * 72 + 116;
export function hangarsX(base, parkedEnd) {
  const hb = hangarBlockM(base);
  const mid = base.runwayM * 0.5 - hb / 2;
  return Math.min(base.runwayM - BUILDINGS_END_M - hb, Math.max(mid, parkedEnd + HANGAR_GAP_M));
}

// Emblem billboard (owner 2026-11-21): a big panel on two legs, tall enough to stand
// above the parked jets; the emblem fills the panel, a caption strip under it, two lamps.
export const BILLBOARD = { wM: 14, legM: 7, panelM: 12, captionM: 2.3 };
function billboard(time, R, img, caption, lit) {
  const B = BILLBOARD, hM = B.legM + B.panelM;
  return sprite(B.wM, hM, R, (x, W, H, R) => {
    const L = lit || time.light;
    const top = 0.6 * R, ph = B.panelM * R;
    x.fillStyle = shade('#55595f', time.light);
    x.fillRect(W * 0.22, top + ph - R, 0.6 * R, H - ph);
    x.fillRect(W * 0.78 - 0.6 * R, top + ph - R, 0.6 * R, H - ph);
    x.fillStyle = shade('#2b2e33', time.light); x.fillRect(0, top, W, ph);
    x.fillStyle = shade('#f1efe8', L); x.fillRect(0.35 * R, top + 0.35 * R, W - 0.7 * R, ph - 0.7 * R - B.captionM * R);
    x.fillStyle = shade('#0d3b22', L); x.fillRect(0.35 * R, top + ph - 0.35 * R - B.captionM * R, W - 0.7 * R, B.captionM * R);
    if (img) {
      const bw = W - 1.6 * R, bh = ph - 1.6 * R - B.captionM * R;
      const k = Math.min(bw / img.width, bh / img.height);
      const iw = img.width * k, ih = img.height * k;
      x.drawImage(tinted(img, L), (W - iw) / 2, top + 0.8 * R + (bh - ih) / 2, iw, ih);
    }
    x.fillStyle = shade('#ffffff', L); x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `700 ${1.35 * R}px "Chakra Petch", sans-serif`;
    const cf = Math.min(1, (W - 1.4 * R) / x.measureText(caption).width);
    x.save(); x.translate(W / 2, top + ph - 0.35 * R - B.captionM * R / 2); x.scale(cf, 1);
    x.fillText(caption, 0, 0); x.restore();
    // Two lamps on arms over the top edge.
    x.fillStyle = shade('#3d4046', time.light);
    for (const lx of [0.25, 0.75]) { x.fillRect(W * lx - 0.15 * R, 0, 0.3 * R, top + 0.2 * R); x.fillRect(W * lx - 0.6 * R, 0, 1.2 * R, 0.4 * R); }
    if (time.lights) { x.fillStyle = 'rgba(255,240,200,0.95)'; for (const lx of [0.25, 0.75]) x.fillRect(W * lx - 0.5 * R, 0.25 * R, R, 0.2 * R); }
  });
}

// Filler buildings: long barracks, a workshop with a saw-tooth roof, a fuel farm.
function barracks(time, R, col) {
  return sprite(56, 7, R, (x, W, H, R) => {
    x.fillStyle = shade('#8a5a44', time.light);
    x.beginPath(); x.moveTo(-0.5 * R, 2.4 * R); x.lineTo(2 * R, 0); x.lineTo(W - 2 * R, 0); x.lineTo(W + 0.5 * R, 2.4 * R); x.fill();
    x.fillStyle = shade(col, time.light); x.fillRect(0.5 * R, 2.4 * R, W - R, H - 2.4 * R);
    const r = rng(Math.round(W * 7));
    for (let i = 0; i < 13; i++) {
      const wx = (2.2 + i * 4.1) * R;
      x.fillStyle = time.lights && r() < 0.6 ? '#ffd27a' : shade('#3b4f63', time.light);
      x.fillRect(wx, 3.4 * R, 2 * R, 1.6 * R);
    }
    x.fillStyle = shade('#5a4636', time.light); x.fillRect(W / 2 - 1.2 * R, 4 * R, 2.4 * R, H - 4 * R);
  });
}
function workshop(time, R, col) {
  return sprite(40, 11, R, (x, W, H, R) => {
    x.fillStyle = shade('#7d838a', time.light);
    for (let k = 0; k < 4; k++) {
      const x0 = k * 10 * R;
      x.beginPath(); x.moveTo(x0, 3 * R); x.lineTo(x0 + 7.5 * R, 0); x.lineTo(x0 + 7.5 * R, 3 * R); x.lineTo(x0 + 10 * R, 3 * R); x.lineTo(x0 + 10 * R, 3 * R); x.fill();
      x.fillStyle = time.lights ? 'rgba(255,214,140,0.9)' : shade('#9fb4c6', time.light);
      x.fillRect(x0 + 7.6 * R, 0.4 * R, 0.6 * R, 2.6 * R);
      x.fillStyle = shade('#7d838a', time.light);
    }
    x.fillStyle = shade(col, time.light); x.fillRect(0, 3 * R, W, H - 3 * R);
    x.fillStyle = shade('#4b5058', time.light); x.fillRect(4 * R, 5 * R, 13 * R, H - 5 * R);
    x.fillStyle = shade('#6a7078', time.light);
    for (let k = 0; k < 6; k++) x.fillRect(4 * R, (5.6 + k) * R, 13 * R, 0.25 * R);
    x.fillStyle = shade('#c94a2e', time.light); x.fillRect(22 * R, 4.6 * R, 14 * R, 1.6 * R);
    x.fillStyle = shade('#ffffff', time.light); x.font = `700 ${1.2 * R}px "Chakra Petch", sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('MAINTENANCE', 29 * R, 5.45 * R);
  });
}
function fuelFarm(time, R) {
  return sprite(30, 9, R, (x, W, H, R) => {
    x.fillStyle = shade('#6b6f74', time.light); x.fillRect(0, H - 1.2 * R, W, 1.2 * R);
    for (const [cx, w, h] of [[2, 11, 8.2], [15.5, 11, 7.2]]) {
      x.fillStyle = shade('#e9ebe8', time.light);
      x.fillRect(cx * R, H - h * R, w * R, h * R - 1.2 * R);
      x.beginPath(); x.ellipse((cx + w / 2) * R, H - h * R, (w / 2) * R, 0.9 * R, 0, Math.PI, 0); x.fill();
      x.fillStyle = shade('#c9cbc8', time.light); x.fillRect(cx * R, H - h * R, 1.6 * R, h * R - 1.2 * R);
      x.fillStyle = shade('#b83a2a', time.light); x.fillRect(cx * R, H - h * 0.55 * R, w * R, 0.8 * R);
    }
    x.fillStyle = shade('#8a8f96', time.light); x.fillRect(13 * R, H - 3 * R, 2.5 * R, 0.5 * R); x.fillRect(26.5 * R, H - 3 * R, 3.5 * R, 0.5 * R);
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
  const backCount = objs.length; // buildings go in here (behind everything) once placed
  // Squadron boards and trophies; parked aircraft keep clear of them.
  const boardX = base.boards.map((_, i) => (base.apron?.[0] ?? 0) + 80 + i * 70);
  const groups = base.parkedGroups || [];
  const trophies = base.trophies || [];
  const trophySprites = trophies.map((t) => ({ t, spr: trophy(time, R, t.kinds) }));
  // [centre, half width] of everything the parked aircraft must keep clear of.
  const blocked = [...boardX.map((x) => [x + 7, 7]), ...trophySprites.map(({ t, spr }) => [t.x, spr.wM / 2])];
  const CLEAR_M = 4;
  // Floodlight masts behind the parked rows (drawn first, so behind the jets).
  const night = !!time.lights;
  const acLight = night ? FLOODLIGHT.light : time.light;
  const shLight = night ? FLOODLIGHT.shelterLight : time.light;
  const floods = [];
  // Squadron boards are floodlit too (owner 2026-11-21): drawn in the flood light at
  // night, and the renderer adds a pool of light at each (boardSpots, board centres).
  const boardTime = night ? { ...time, light: FLOODLIGHT.signLight } : time;
  const boardSpots = [];
  const boardAt = {}; // board text -> its centre (m from the threshold)
  const addBoard = (text, bx) => {
    add(board(boardTime, R, text, base.boardColor || '#16365c', base.boardTrim || '#e8c25a'), bx);
    boardSpots.push(base.x + bx + 7);
    boardAt[text] = bx + 7;
  };
  // Masts go in behind the jets once the rows' real extent is known (rows: [from, to]).
  const mastAt = objs.length;
  const rows = [];
  // Parked aircraft on the apron, some in shelters.
  const front = images[base.parked];
  if (front) {
    const sh = shelter(time, R);
    const ac = { canvas: tinted(front, acLight, base.parked), wM: front.width / 16, hM: front.height / 16 };
    const acSh = { canvas: tinted(front, shLight, base.parked), wM: ac.wM * 0.8, hM: ac.hM * 0.8 };
    let n = 0, end = base.apron[0];
    for (let x = base.apron[0]; x < base.apron[1] && n < 12; x += 15) {
      const inShelter = n % 3 === 2;
      const c = inShelter ? x + 8 : x + ac.wM / 2, half = inShelter ? 14 : ac.wM / 2;
      if (blocked.some(([bc, bh]) => Math.abs(c - bc) < half + bh + CLEAR_M)) continue;
      if (inShelter) { add(sh, x - 6, -1); add(acSh, x - 6 + 14 - ac.wM * 0.4); end = x + 22; }
      else { add(ac, x); end = x + ac.wM; }
      n++;
    }
    rows.push([base.apron[0], end]);
  }
  // Squadron rows (Kamra): count front-view jets from x = from (every third in a
  // shelter, like above), the squadron's board right after the last one.
  for (const g of groups) {
    const front = images[g.sprite];
    if (!front) continue;
    const sh = shelter(time, R);
    const ac = { canvas: tinted(front, acLight, g.sprite), wM: front.width / 16, hM: front.height / 16 };
    const acSh = { canvas: tinted(front, shLight, g.sprite), wM: ac.wM * 0.8, hM: ac.hM * 0.8 };
    let x = g.from, end = x;
    for (let n = 0; n < g.count; n++, x += 15) {
      if (n % 3 === 2) { add(sh, x - 6, -1); add(acSh, x - 6 + 14 - ac.wM * 0.4); end = x - 6 + 28; }
      else { add(ac, x); end = x + ac.wM; }
    }
    if (g.board) addBoard(g.board, end + 2);
    rows.push([g.from, end]);
  }
  base.boards.forEach((t, i) => addBoard(t, boardX[i]));
  for (const { t, spr } of trophySprites) { addC(spr, t.x); boardSpots.push(base.x + t.x); }
  for (const dc of base.decor || []) {
    const img = images[dc.sprite];
    if (!img) continue;
    const hM = dc.hM, wM = hM * img.width / img.height;
    addC({ canvas: tinted(img, night ? FLOODLIGHT.light : time.light, dc.sprite), wM, hM }, dc.x);
    boardSpots.push(base.x + dc.x);
  }
  // Floodlight masts along the rows actually parked (behind the jets).
  if (rows.length) {
    const mast = floodMast(time, R), masts = [];
    for (const [a, b] of rows) {
      for (let mx = a + 6; mx < b; mx += FLOODLIGHT.everyM) { masts.push({ ...mast, x: base.x + mx - mast.wM / 2, layer: 0 }); floods.push(base.x + mx); }
    }
    objs.splice(mastAt, 0, ...masts);
  }
  // Emblem billboards behind everything at the start, centred on their squadron's board.
  const bills = [];
  const signLamps = [];
  for (const bb of base.billboards || []) {
    const cx = boardAt[bb.board];
    if (cx == null) continue;
    const spr = billboard(time, R, images[bb.sprite], bb.board.split('|')[0], night ? FLOODLIGHT.signLight : null);
    bills.push({ ...spr, x: base.x + cx - spr.wM / 2, layer: 0 });
    signLamps.push(base.x + cx); // the renderer adds the lamp glow on top at night
  }
  objs.splice(backCount, 0, ...bills);
  // Everything at the start (parked rows, boards, trophies, decor) ends here.
  let startEnd = 0;
  for (let k = backCount; k < objs.length; k++) startEnd = Math.max(startEnd, objs[k].x - base.x + objs[k].wM);
  // Hangar block mid-runway, then the gaps either side filled with base buildings.
  const back = [];
  const put = (spr, x) => back.push({ ...spr, x: base.x + x, layer: 0 });
  const hx = hangarsX(base, startEnd), hb = hangarBlockM(base);
  for (let i = 0; i < base.hangars; i++) put(hangar(time, R, col, base.hangarName || base.short, base.hangarPlane), hx + i * 72);
  put(admin(time, R, base.id === 'risalpur' ? 3 : 2, col), hx + base.hangars * 72 + 20);
  put(tower(time, R, base.towerM), hx + base.hangars * 72 + 104);
  const gaps = [[startEnd + FILL.marginM, hx - FILL.marginM], [hx + hb + FILL.marginM, base.runwayM - 10]];
  // Mushaf's welcome monument: the middle of the first gap (owner 2026-11-21).
  const clear = [];
  const welcomes = [];
  if (base.welcome) {
    const xs = base.welcomeMid ? [(gaps[0][0] + gaps[0][1]) / 2] : base.welcomeX || [base.runwayM + 40];
    for (const wx of xs) {
      const spr = base.welcomeStyle === 'monument' ? monument(time, R, base.welcome) : welcome(time, R, base.welcome);
      const x0 = base.welcomeStyle === 'monument' ? wx - spr.wM / 2 : wx;
      welcomes.push([spr, x0]);
      clear.push([x0 - FILL.clearM, x0 + spr.wM + FILL.clearM]);
    }
  }
  const r = rng(base.id.length * 131 + base.runwayM);
  const kinds = [() => barracks(time, R, col), () => workshop(time, R, col), () => fuelFarm(time, R), () => admin(time, R, 1, col)];
  let ki = Math.floor(r() * kinds.length);
  for (const [a, b] of gaps) {
    let x = a;
    while (x < b) {
      const spr = kinds[ki % kinds.length]();
      if (x + spr.wM > b) break;
      const hit = clear.find(([c0, c1]) => x + spr.wM > c0 && x < c1);
      if (hit) { x = hit[1]; continue; }
      put(spr, x); ki++;
      x += spr.wM + FILL.gapM[0] + r() * (FILL.gapM[1] - FILL.gapM[0]);
    }
  }
  objs.splice(backCount, 0, ...back);
  for (const [spr, x0] of welcomes) add(spr, x0);
  return { objs, floods, boardSpots, signLamps, hangarX: base.x + hx, towerX: base.x + hx + base.hangars * 72 + 110, towerH: base.towerM };
}

// --- Ground targets ---
export function buildTarget(kind, time, R, dead) {
  const L = time.light;
  const burnt = (c) => (dead ? shade('#2b2725', L) : shade(c, L));
  if (kind === 'satcom') return satcom(time, R, dead);
  if (kind === 'tank') return tank(time, R, dead);
  if (kind === 'apc') return apc(time, R, dead);
  if (kind === 'aaa') return aaaSite(time, R, dead);
  if (kind === 'sam') return samRadar(time, R, dead);
  if (kind === 'launcher') {
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

// Sizes (m) match GROUND_UNITS in src/data/combat.js (rounds hit that box).
const OLIVE = '#5e6a3c', SAND = '#8a7d55', DARKOLIVE = '#454d2c', TYRE = '#1d1d1d', BURNT = '#2b2725';
function wheel(x, cx, cy, r, L) {
  x.fillStyle = shade(TYRE, L); x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  x.fillStyle = shade('#55574f', L); x.beginPath(); x.arc(cx, cy, r * 0.4, 0, Math.PI * 2); x.fill();
}

// Satellite ground station: control hut and a big dish on a pedestal.
function satcom(time, R, dead) {
  const L = time.light;
  return sprite(18, 14, R, (x, W, H, R) => {
    x.fillStyle = shade(dead ? BURNT : '#b9b4a4', L); x.fillRect(0.5 * R, H - 4.5 * R, 7 * R, 4.5 * R);
    x.fillStyle = shade(dead ? '#1a1817' : '#4d5a66', L); x.fillRect(1.5 * R, H - 3.2 * R, 2 * R, 1.4 * R); x.fillRect(4.3 * R, H - 3.2 * R, 2 * R, 1.4 * R);
    x.fillStyle = shade(dead ? BURNT : '#8d8a80', L); x.fillRect(11.4 * R, H - 6.5 * R, 1.4 * R, 6.5 * R);
    if (!dead) {
      x.save(); x.translate(12.2 * R, H - 8.2 * R); x.rotate(-0.55);
      x.fillStyle = shade('#e6e6df', L); x.beginPath(); x.ellipse(0, 0, 5.6 * R, 2.4 * R, 0, Math.PI, 0); x.fill();
      x.fillStyle = shade('#c5c6be', L); x.beginPath(); x.ellipse(0, 0, 5.6 * R, 1 * R, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = shade('#9a9b94', L); x.lineWidth = 0.3 * R; x.beginPath(); x.moveTo(-3 * R, -0.3 * R); x.lineTo(0, -4.5 * R); x.lineTo(3 * R, -0.3 * R); x.stroke();
      x.fillStyle = shade('#6f706a', L); x.fillRect(-0.4 * R, -5 * R, 0.8 * R, 0.9 * R);
      x.restore();
      x.fillStyle = shade('#c0392b', L); x.fillRect(0.5 * R, H - 4.9 * R, 7 * R, 0.4 * R);
    } else {
      x.save(); x.translate(13.5 * R, H - 1.4 * R); x.rotate(0.35);
      x.fillStyle = shade('#3a3632', L); x.beginPath(); x.ellipse(0, 0, 4.5 * R, 1.5 * R, 0, Math.PI, 0); x.fill();
      x.restore();
    }
  });
}

// Main battle tank, gun pointing left (toward the incoming jet).
function tank(time, R, dead) {
  const L = time.light;
  return sprite(11, 5, R, (x, W, H, R) => {
    const body = shade(dead ? BURNT : SAND, L);
    x.fillStyle = shade(TYRE, L); x.beginPath(); x.roundRect(0.4 * R, H - 1.7 * R, 10.2 * R, 1.6 * R, 0.8 * R); x.fill();
    for (let i = 0; i < 6; i++) wheel(x, (1.3 + i * 1.68) * R, H - 0.9 * R, 0.55 * R, L);
    x.fillStyle = body;
    x.beginPath(); x.moveTo(0.2 * R, H - 1.8 * R); x.lineTo(1.2 * R, H - 2.9 * R); x.lineTo(10.4 * R, H - 2.9 * R); x.lineTo(10.8 * R, H - 1.8 * R); x.fill();
    if (!dead) {
      x.fillStyle = shade('#7b7050', L); x.beginPath(); x.roundRect(4 * R, H - 4.2 * R, 4.6 * R, 1.4 * R, 0.4 * R); x.fill();
      x.fillRect(-0.2 * R + 0.2 * R, H - 3.75 * R, 4.2 * R, 0.4 * R);
      x.fillStyle = shade('#3b3a33', L); x.fillRect(6.8 * R, H - 4.6 * R, 0.9 * R, 0.4 * R);
    } else {
      x.save(); x.translate(7.5 * R, H - 3.1 * R); x.rotate(0.5);
      x.fillStyle = shade('#1f1d1b', L); x.beginPath(); x.roundRect(-2 * R, -1.2 * R, 4.2 * R, 1.2 * R, 0.3 * R); x.fill();
      x.fillRect(-4.5 * R, -0.9 * R, 3 * R, 0.35 * R);
      x.restore();
    }
  });
}

// Eight-wheeled armoured personnel carrier.
function apc(time, R, dead) {
  const L = time.light;
  return sprite(10, 4.5, R, (x, W, H, R) => {
    for (const wx of [1.4, 3.2, 6.4, 8.3]) wheel(x, wx * R, H - 0.8 * R, 0.75 * R, L);
    x.fillStyle = shade(dead ? BURNT : OLIVE, L);
    x.beginPath(); x.moveTo(0.2 * R, H - 1.9 * R); x.lineTo(1.4 * R, H - 3.5 * R); x.lineTo(9.6 * R, H - 3.5 * R); x.lineTo(9.8 * R, H - 1.2 * R); x.lineTo(0.5 * R, H - 1.2 * R); x.fill();
    x.fillStyle = shade(dead ? '#1a1817' : DARKOLIVE, L); x.fillRect(3 * R, H - 2.9 * R, 1 * R, 0.6 * R); x.fillRect(5 * R, H - 2.9 * R, 1 * R, 0.6 * R);
    if (!dead) {
      x.fillStyle = shade(DARKOLIVE, L); x.fillRect(5.5 * R, H - 4.2 * R, 1.8 * R, 0.8 * R);
      x.fillRect(3.4 * R, H - 4 * R, 2.2 * R, 0.25 * R);
    }
  });
}

// Twin 23 mm AAA gun behind sandbags. The barrels are drawn each frame by the
// renderer (they track the jet), pivoting at 80% of the height in the middle.
function aaaSite(time, R, dead) {
  const L = time.light;
  // Drawn in 8 x 3.5 m units, scaled up to the unit's size (owner: easier to see).
  return sprite(11, 5, R, (x, W0, H0, R) => {
    x.scale(11 / 8, 5 / 3.5);
    const H = H0 / (5 / 3.5);
    x.fillStyle = shade(dead ? BURNT : '#a89a72', L);
    for (const [cx, w] of [[1.4, 2.6], [6.6, 2.6]]) { x.beginPath(); x.ellipse(cx * R, H, w / 2 * R, 1.4 * R, 0, Math.PI, 0); x.fill(); }
    x.fillStyle = shade(dead ? '#1f1d1b' : DARKOLIVE, L);
    x.fillRect(3.3 * R, H - 2.8 * R, 1.4 * R, 2.8 * R);
    x.beginPath(); x.arc(4 * R, H - 2.8 * R, 1 * R, Math.PI, 0); x.fill();
    if (!dead) { x.fillStyle = shade('#6f6650', L); x.fillRect(4.6 * R, H - 2.2 * R, 1.2 * R, 0.4 * R); }
  });
}

// SAM battery: six-wheel truck, search radar at the back, two missiles on rails
// (missiles drawn by the renderer: they leave when fired).
function samRadar(time, R, dead) {
  const L = time.light;
  return sprite(14, 7, R, (x, W, H, R) => {
    for (const wx of [1.6, 3.4, 11.6]) wheel(x, wx * R, H - 0.8 * R, 0.8 * R, L);
    x.fillStyle = shade(dead ? BURNT : OLIVE, L);
    x.fillRect(0.4 * R, H - 2.6 * R, 13.2 * R, 1.3 * R);
    x.fillRect(10.4 * R, H - 4.2 * R, 3.2 * R, 2 * R);
    x.fillStyle = shade(dead ? '#1a1817' : '#9bb3c4', L); x.fillRect(12 * R, H - 3.9 * R, 1.3 * R, 0.8 * R);
    x.fillStyle = shade(dead ? '#1f1d1b' : DARKOLIVE, L); x.fillRect(4.5 * R, H - 3.6 * R, 3.6 * R, 1 * R);
    if (!dead) {
      x.fillStyle = shade('#4b4f45', L); x.fillRect(1.6 * R, H - 4.6 * R, 0.5 * R, 2 * R);
      x.fillStyle = shade('#d8dcd2', L); x.beginPath(); x.ellipse(1.85 * R, H - 5.6 * R, 1.6 * R, 0.9 * R, -0.25, 0, Math.PI * 2); x.fill();
      x.fillStyle = shade('#9da397', L); x.fillRect(1.6 * R, H - 6.8 * R, 0.5 * R, 0.6 * R);
    }
  });
}

// Fuel bowser (refuelling stop), 10 x 3.8 m, cab on the left (it drives in leftwards).
export function buildFuelTruck(time, R) {
  const L = time.light;
  return sprite(10, 3.8, R, (x, W, H, R) => {
    for (const wx of [1.6, 6.4, 8.2]) wheel(x, wx * R, H - 0.6 * R, 0.6 * R, L);
    x.fillStyle = shade('#3a3d40', L); x.fillRect(0.4 * R, H - 1.3 * R, 9.4 * R, 0.5 * R);
    x.fillStyle = shade('#d9d4c4', L); x.beginPath(); x.roundRect(3 * R, H - 3.3 * R, 6.8 * R, 2.1 * R, 0.9 * R); x.fill();
    x.fillStyle = shade('#c0392b', L); x.fillRect(3 * R, H - 2.4 * R, 6.8 * R, 0.35 * R);
    x.fillStyle = shade('#5b6b3c', L);
    x.beginPath(); x.moveTo(0.2 * R, H - 1.2 * R); x.lineTo(0.4 * R, H - 2.8 * R); x.lineTo(1.2 * R, H - 3.6 * R); x.lineTo(2.7 * R, H - 3.6 * R); x.lineTo(2.7 * R, H - 1.2 * R); x.fill();
    x.fillStyle = shade('#9bb3c4', L); x.fillRect(0.75 * R, H - 3.2 * R, 1.1 * R, 0.9 * R);
    x.fillStyle = shade('#ffb43a', L); x.fillRect(1.4 * R, H - 3.8 * R, 0.6 * R, 0.25 * R);
  });
}

export function themeColorRgb(themeId, key, light) {
  const c = hexToRgb(THEMES[themeId][key]);
  return c.map((v, i) => v * light[i]);
}
