// Image loading, tinting and small generated sprites.

const SPRITES = [
  'super_mushshak_body', 'super_mushshak_gear', 'super_mushshak_prop',
  'mirage5_body', 'mirage5_gear',
  'f16a_body', 'f16a_elevator', 'f16_body', 'f16_elevator', 'f16_gear',
  'mk82_body', 'gbu12_body', 'agm88_body',
  'k8_front_body', 'jf17_front_body', 'f16_front_body', 'paf_pilot_wings',
];

export const images = {};

export async function loadImages() {
  const base = import.meta.env.BASE_URL || '/';
  await Promise.all(SPRITES.map((name) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { images[name] = img; resolve(); };
    img.onerror = () => { console.warn('missing sprite', name); resolve(); };
    img.src = `${base}sprites/${name}.png`;
  })));
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

// Multiply an image by a light colour [r,g,b] (0..1), keeping its alpha.
const tintCache = new Map();
export function tinted(img, light, key) {
  if (!img) return null;
  if (light[0] === 1 && light[1] === 1 && light[2] === 1) return img;
  const k = `${key || img.src}|${light.join(',')}`;
  let c = tintCache.get(k);
  if (c) return c;
  c = makeCanvas(img.width, img.height);
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'multiply';
  x.fillStyle = rgb(light);
  x.fillRect(0, 0, c.width, c.height);
  x.globalCompositeOperation = 'destination-in';
  x.drawImage(img, 0, 0);
  tintCache.set(k, c);
  return c;
}

export const rgb = (l) => `rgb(${Math.round(l[0] * 255)},${Math.round(l[1] * 255)},${Math.round(l[2] * 255)})`;

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mixHex(a, b, t) {
  const p = hexToRgb(a), q = hexToRgb(b);
  return `rgb(${Math.round(p[0] + (q[0] - p[0]) * t)},${Math.round(p[1] + (q[1] - p[1]) * t)},${Math.round(p[2] + (q[2] - p[2]) * t)})`;
}
// Colour lit by the time-of-day light and pulled toward the haze.
export function shade(hex, light, haze = null, h = 0) {
  const p = hexToRgb(hex);
  let r = p[0] * light[0], g = p[1] * light[1], b = p[2] * light[2];
  if (haze && h > 0) {
    const q = hexToRgb(haze);
    r += (q[0] - r) * h; g += (q[1] - g) * h; b += (q[2] - b) * h;
  }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

// Soft round sprites for particles and glows.
export function softSprite(size, stops) {
  const c = makeCanvas(size, size);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return c;
}

export const SOFT = {};
export function buildSoftSprites() {
  SOFT.smoke = softSprite(64, [[0, 'rgba(235,235,235,0.9)'], [0.5, 'rgba(220,220,220,0.5)'], [1, 'rgba(210,210,210,0)']]);
  SOFT.dark = softSprite(64, [[0, 'rgba(40,36,34,0.9)'], [0.5, 'rgba(45,40,38,0.55)'], [1, 'rgba(50,45,40,0)']]);
  SOFT.dust = softSprite(64, [[0, 'rgba(190,165,120,0.8)'], [0.55, 'rgba(180,155,110,0.4)'], [1, 'rgba(170,150,110,0)']]);
  SOFT.fire = softSprite(64, [[0, 'rgba(255,250,220,1)'], [0.25, 'rgba(255,200,80,0.9)'], [0.6, 'rgba(255,100,20,0.45)'], [1, 'rgba(200,40,0,0)']]);
  SOFT.glow = softSprite(64, [[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]);
  SOFT.warm = softSprite(64, [[0, 'rgba(255,220,160,0.9)'], [0.3, 'rgba(255,170,80,0.35)'], [1, 'rgba(255,120,40,0)']]);
  SOFT.red = softSprite(32, [[0, 'rgba(255,90,80,1)'], [0.3, 'rgba(255,40,30,0.5)'], [1, 'rgba(255,0,0,0)']]);
  SOFT.green = softSprite(32, [[0, 'rgba(120,255,140,1)'], [0.3, 'rgba(40,255,90,0.5)'], [1, 'rgba(0,255,60,0)']]);
  SOFT.white = softSprite(32, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(230,240,255,0.5)'], [1, 'rgba(200,220,255,0)']]);
  SOFT.amber = softSprite(32, [[0, 'rgba(255,230,150,1)'], [0.3, 'rgba(255,190,60,0.5)'], [1, 'rgba(255,160,0,0)']]);
  SOFT.blue = softSprite(32, [[0, 'rgba(160,200,255,1)'], [0.3, 'rgba(80,140,255,0.5)'], [1, 'rgba(40,90,255,0)']]);
}

// Seeded random and periodic 1D noise (for seamless scenery tiles).
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function periodicNoise(seed, period) {
  const r = rng(seed);
  const v = Array.from({ length: period }, () => r());
  return (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = v[((i % period) + period) % period];
    const b = v[(((i + 1) % period) + period) % period];
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  };
}
