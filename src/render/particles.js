// Pooled particles in world metres. Drawn with soft sprites.
import { SOFT } from './assets.js';

const MAX = 2500;

export class Particles {
  constructor() {
    this.pool = [];
    this.live = [];
    for (let i = 0; i < MAX; i++) this.pool.push({});
  }

  // kind: smoke | dark | dust | fire | glow | spark | white
  spawn(kind, x, y, vx, vy, size, life, opts = {}) {
    const p = this.pool.pop();
    if (!p) return null;
    p.kind = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.size = size; p.grow = opts.grow ?? 1.5; p.life = life; p.age = 0;
    p.alpha = opts.alpha ?? 1; p.drag = opts.drag ?? 0.6; p.lift = opts.lift ?? 0;
    p.add = opts.add ?? (kind === 'fire' || kind === 'glow' || kind === 'spark');
    p.ground = opts.ground ?? true;
    this.live.push(p);
    return p;
  }

  update(dt) {
    const L = this.live;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) {
        L[i] = L[L.length - 1]; L.pop(); this.pool.push(p);
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy = p.vy * k + p.lift * dt;
      if (p.kind === 'spark') p.vy -= 9.8 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.ground && p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy) * 0.2; p.vx *= 0.7; }
    }
  }

  // view: {sx(x), sy(y), S}; light: ambient multiplier for non-additive particles
  draw(ctx, view, nightBoost) {
    const L = this.live;
    // Normal blend first, then additive on top.
    for (let pass = 0; pass < 2; pass++) {
      ctx.globalCompositeOperation = pass ? 'lighter' : 'source-over';
      for (let i = 0; i < L.length; i++) {
        const p = L[i];
        if (p.add !== !!pass) continue;
        const t = p.age / p.life;
        const s = p.size * (1 + (p.grow - 1) * t) * view.S;
        const x = view.sx(p.x), y = view.sy(p.y);
        if (x < -s || y < -s || x > view.W + s || y > view.H + s) continue;
        let a = p.alpha * (1 - t);
        if (p.kind === 'fire') a = p.alpha * (1 - t * t);
        if (!p.add) a *= nightBoost;
        if (a <= 0.01) continue;
        ctx.globalAlpha = Math.min(1, a);
        const img = p.kind === 'spark' ? SOFT.warm : p.kind === 'white' ? SOFT.smoke : SOFT[p.kind] || SOFT.smoke;
        ctx.drawImage(img, x - s / 2, y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
