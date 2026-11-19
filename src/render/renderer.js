// Draws the world, the aircraft and effects on one canvas.
import { images, tinted, SOFT, makeCanvas, rng } from './assets.js';
import { LAYERS, TILE_W, buildLayer, buildGround, buildClouds, buildStars, buildBase, buildTarget } from './scenery.js';
import { Particles } from './particles.js';
import { THEMES, TIMES } from '../data/world.js';
import { KT } from '../sim/aircraft.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const LAYER_ZOOM = { mountains: 0.12, city: 0.25, mid: 0.4, trees: 0.7 };
const LAYER_DROP = { mountains: 0.07, city: 0.1, mid: 0.14, trees: 0.2 };

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.quality = 'high';
    this.particles = new Particles();
    this.cam = { x: 0, y: 0, zoom: 1, look: 0, lead: 0, shake: 0, userZoom: 1 };
    this.rings = [];
    this.shards = [];
    this.flash = 0;
    this.time = 0;
    this.view = { W: 1, H: 1, S: 1, sx: null, sy: null };
    this.resize();
  }

  get dpr() {
    const cap = this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1;
    return Math.min(window.devicePixelRatio || 1, cap);
  }

  resize() {
    const d = this.dpr;
    const w = Math.round(innerWidth * d), h = Math.round(innerHeight * d);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
      const old = this.res;
      this.res = clamp(h / 720, 1, 2);
      if (this.world && Math.abs(old - this.res) > 0.2) this.setupWorld(this.world);
    }
  }

  // world: {bases, themeStops, targets, timeId}
  setupWorld(world) {
    this.world = world;
    const time = TIMES[world.timeId];
    this.timeData = time;
    const res = this.res;
    const themes = [...new Set(world.themeStops.map((s) => s.theme))];
    this.tiles = {};
    for (const th of themes) {
      this.tiles[th] = { ground: buildGround(th, time, res) };
      for (const L of LAYERS) this.tiles[th][L.slot] = buildLayer(L.slot, th, time, res);
    }
    this.clouds = buildClouds(time, res);
    this.stars = time.stars > 0 ? buildStars(res) : null;
    const R = Math.round(10 * res);
    this.baseGfx = world.bases.map((b) => ({ base: b, ...buildBase(b, time, R) }));
    this.targetGfx = {};
    for (const k of ['sam', 'radar', 'fuel', 'bunker']) {
      this.targetGfx[k] = [buildTarget(k, time, R, false), buildTarget(k, time, R, true)];
    }
    // Cloud field: far (slow parallax) and near (world) clouds.
    const r = rng(7);
    this.cloudField = [];
    const span = 60000;
    for (let i = 0; i < 70; i++) {
      const near = i % 3 === 0;
      this.cloudField.push({
        img: this.clouds[i % this.clouds.length], x: r() * span - 3000,
        y: near ? 500 + r() * 2600 : 900 + r() * 3000,
        par: near ? 1 : 0.25 + r() * 0.35, scale: near ? 0.18 + r() * 0.3 : 0.1 + r() * 0.12,
        front: near && r() < 0.35, alpha: near ? 0.9 : 0.75 + r() * 0.25,
      });
    }
    this.lightBody = time.lights ? time.light.map((v) => Math.min(1, v * 1.9 + 0.12)) : time.light;
    this.particles = new Particles();
    this.rings = []; this.shards = []; this.flash = 0;
  }

  themeAt(x) {
    const st = this.world.themeStops;
    if (x <= st[0].x) return [st[0].theme, st[0].theme, 0];
    for (let i = 0; i < st.length - 1; i++) {
      if (x >= st[i].x && x <= st[i + 1].x) {
        const t = (x - st[i].x) / Math.max(st[i + 1].x - st[i].x, 1);
        return [st[i].theme, st[i + 1].theme, st[i].theme === st[i + 1].theme ? 0 : t * t * (3 - 2 * t)];
      }
    }
    const l = st[st.length - 1];
    return [l.theme, l.theme, 0];
  }

  // --- camera ---
  updateCamera(dt, st, flight) {
    const v = this.view;
    const c = this.cam;
    const speedKt = Math.hypot(st.vx, st.vy) * KT;
    let z = lerp(1.08, 0.74, clamp((speedKt - 40) / 450, 0, 1));
    // Attack run: zoom out far enough to keep the plane and the ground (targets, bombs) in view.
    const attack = flight && flight.mode === 'strike' && (!flight.revealed || this.watchT > 0) && st.y > 25 && flight.state === 'flying';
    if (flight && flight.revealed) this.watchT = Math.max(0, (this.watchT ?? 3) - dt); else this.watchT = 3;
    if (attack) z = clamp(42 / Math.max(st.y, 40), 0.1, 0.6);
    if (flight) {
      if (flight.revealed && flight.state === 'flying') {
        const toGo = flight.dest.x - st.x;
        if (toGo > -200 && toGo < 2500 && st.y < 250) z = Math.max(z, 0.95);
      }
      if (flight.state === 'done') z = Math.max(z, 0.9);
    }
    if (!attack) z *= c.userZoom;
    const k = 1 - Math.exp(-dt * 1.6);
    c.zoom += (z - c.zoom) * k;
    v.S = (v.H / 720) * 7.2 * c.zoom;
    const lookPx = clamp(st.vx / 240, -0.3, 1) * 0.2 * v.W * (attack ? 0.5 : 1);
    c.look += (lookPx - c.look) * (1 - Math.exp(-dt * 1.2));
    c.lead += (clamp(st.vy * 0.5, -40, 40) - c.lead) * (1 - Math.exp(-dt * 1.5));
    c.x = st.x + c.look / v.S;
    const minY = (0.24 * v.H) / v.S;
    const fitY = (0.28 * v.H) / v.S;
    c.fit = lerp(c.fit ?? 0, attack ? 1 : 0, 1 - Math.exp(-dt * 1.6));
    c.y = lerp(Math.max(st.y + c.lead, minY), fitY, c.fit);
    c.shake = Math.max(0, c.shake - dt * 1.8);
  }

  makeView() {
    const v = this.view;
    v.W = this.canvas.width; v.H = this.canvas.height;
    const c = this.cam;
    const sh = c.shake * c.shake * v.H * 0.02;
    const ox = (Math.random() - 0.5) * sh, oy = (Math.random() - 0.5) * sh;
    const cx = c.x, cy = c.y, W2 = v.W / 2 + ox, H2 = v.H / 2 + oy;
    v.sx = (x) => (x - cx) * v.S + W2;
    v.sy = (y) => H2 - (y - cy) * v.S;
    v.groundY = v.sy(0);
    v.restY = 0.74 * v.H;
    return v;
  }

  // --- main entry points ---
  renderFlight(flight, alpha, dt) {
    this.time += dt;
    this.dt = dt;
    this.resize();
    const st = flight.renderState(alpha);
    this.updateCamera(dt, st, flight);
    const v = this.makeView();
    this.handleFx(flight);
    this.emitContinuous(flight, st, dt);
    this.particles.update(dt);
    this.updateShards(dt);
    const ctx = this.ctx;
    this.drawBackdrop(ctx, v);
    this.drawGround(ctx, v);
    this.drawBases(ctx, v, flight);
    this.drawTargets(ctx, v, flight);
    this.drawAids(ctx, v, flight, st);
    if (!flight.ac.crashed) this.drawShadow(ctx, v, st, flight.data);
    this.particles.draw(ctx, v, this.timeData.lights ? 0.6 : 1);
    this.drawWeapons(ctx, v, flight);
    if (!flight.ac.crashed) this.drawAircraft(ctx, v, flight.data, st);
    this.drawShards(ctx, v);
    this.drawRings(ctx, v);
    this.drawClouds(ctx, v, true);
    this.drawScreenFx(ctx, v, flight.ac);
  }

  // Menu backdrop: slow flypast of a formation over the start base.
  renderDemo(t, dt, planes) {
    this.time += dt;
    this.resize();
    const x = 200 + t * 55;
    const st = { x, y: 60 + Math.sin(t * 0.2) * 10, vx: 55, vy: 0 };
    this.updateCamera(dt, st, null);
    this.cam.zoom = 0.9;
    this.cam.look = 0;
    this.cam.y = Math.max(this.cam.y, 50);
    const v = this.makeView();
    const ctx = this.ctx;
    this.drawBackdrop(ctx, v);
    this.drawGround(ctx, v);
    this.drawBases(ctx, v, null);
    planes.forEach((p, i) => {
      const s = {
        x: x + 70 - i * 40 + Math.sin(t * 0.4 + i) * 3, y: 70 + i * 14 + Math.sin(t * 0.7 + i * 2) * 2,
        pitch: 0.02 + Math.sin(t * 0.5 + i) * 0.015, gearPos: 0, onGround: false, afterburner: 0,
        elevator: 0, rpm: 1, propAngle: t * 30, bombsLeft: 0, engineOn: true, t, vx: 120, vy: 0,
      };
      this.drawAircraft(ctx, v, p, s);
    });
    this.drawClouds(ctx, v, true);
  }

  // --- backdrop ---
  drawBackdrop(ctx, v) {
    const T = this.timeData;
    const alt = this.cam.y;
    const hi = clamp(alt / 6000, 0, 1);
    const g = ctx.createLinearGradient(0, 0, 0, v.H);
    g.addColorStop(0, T.skyTop);
    g.addColorStop(0.5 - hi * 0.2, T.skyMid);
    g.addColorStop(0.92, T.skyHorizon);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, v.W, v.H);
    if (hi > 0.05) {
      ctx.fillStyle = `rgba(5,12,40,${hi * 0.35})`;
      ctx.fillRect(0, 0, v.W, v.H * 0.6);
    }
    if (this.stars) {
      const s = this.stars;
      ctx.globalAlpha = T.stars * (0.7 + hi * 0.3);
      const sc = v.H / 720 / this.res;
      const w = s.w * sc;
      let ox = -((this.cam.x * 0.02 * sc) % w);
      for (; ox < v.W; ox += w) ctx.drawImage(s.canvas, ox, 0, w, s.h * sc);
      ctx.globalAlpha = 1;
    }
    // Sun or moon with glow.
    const sun = T.sun;
    const sx = sun.x * v.W, sy = sun.y * v.H + clamp(this.cam.y * 0.01, 0, 60) * (v.H / 720);
    const r = v.H * 0.035 * sun.size;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = sun.moon ? 0.35 : 0.55;
    ctx.drawImage(SOFT.warm, sx - r * 9, sy - r * 9, r * 18, r * 18);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = sun.color;
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
    if (sun.moon) {
      ctx.fillStyle = 'rgba(160,170,190,0.35)';
      ctx.beginPath(); ctx.arc(sx - r * 0.3, sy - r * 0.2, r * 0.25, 0, Math.PI * 2); ctx.arc(sx + r * 0.35, sy + r * 0.3, r * 0.18, 0, Math.PI * 2); ctx.fill();
    }
    this.drawClouds(ctx, v, false, true);
    // Parallax layers.
    const [ta, tb, t] = this.themeAt(this.cam.x);
    for (const L of LAYERS) {
      const zf = lerp(1, this.cam.zoom, LAYER_ZOOM[L.slot]);
      const yBase = v.restY + Math.min((v.groundY - v.restY) * L.lift, v.H * LAYER_DROP[L.slot]);
      const A = this.tiles[ta][L.slot], B = this.tiles[tb][L.slot];
      const aA = ta === tb ? 1 : Math.min(1, 2 * (1 - t));
      const aB = ta === tb ? 0 : Math.min(1, 2 * t);
      if (A && aA > 0) this.drawTile(ctx, v, A, L, zf, yBase, aA);
      if (B && aB > 0) this.drawTile(ctx, v, B, L, zf, yBase, aB);
    }
  }

  drawTile(ctx, v, tile, L, zf, baseY, alpha) {
    const sc = (v.H / 720) / this.res * zf;
    const w = tile.w * sc, h = tile.h * sc;
    const off = (this.cam.x * L.speed * (v.H / 720) * zf) % w;
    ctx.globalAlpha = alpha;
    for (let x = -off - (off < 0 ? w : 0); x < v.W; x += w) ctx.drawImage(tile.canvas, x, baseY - h, w + 1, h);
    if (baseY < v.H) { ctx.fillStyle = tile.bottom; ctx.fillRect(0, baseY - 1, v.W, v.H - baseY + 1); }
    ctx.globalAlpha = 1;
  }

  drawClouds(ctx, v, front, far = false) {
    const u = v.H / 720;
    for (const c of this.cloudField) {
      if (far !== (c.par < 1)) continue;
      if (!far && c.front !== front) continue;
      let x, y, w, h;
      if (far) {
        const sc = u * c.scale * 5 / this.res;
        w = c.img.w * sc; h = c.img.h * sc;
        const span = v.W + w * 2 + 400 * u;
        x = (((c.x * 0.05 - this.cam.x * c.par * 0.35) * u) % span + span) % span - w;
        y = v.H * (0.1 + ((c.y - 900) / 3000) * 0.42) + clamp(this.cam.y * 0.03, 0, 200) * u;
      } else {
        const sc = v.S * c.scale / this.res;
        w = c.img.w * sc; h = c.img.h * sc;
        x = v.sx(c.x) - w / 2; y = v.sy(c.y) - h / 2;
      }
      if (x > v.W || x + w < 0 || y > v.H || y + h < 0) continue;
      ctx.globalAlpha = c.alpha * (front ? 0.85 : 1);
      ctx.drawImage(c.img.canvas, x, y, w, h);
    }
    ctx.globalAlpha = 1;
  }

  drawGround(ctx, v) {
    if (v.groundY > v.H + 2) return;
    const [ta, tb, t] = this.themeAt(this.cam.x);
    const draw = (tile, a) => {
      const mPerPx = 256 / tile.w;
      const w = tile.w * mPerPx * v.S, h = tile.h * mPerPx * v.S * 0.55;
      const off = ((this.cam.x * v.S) % w + w) % w;
      ctx.globalAlpha = a;
      for (let x = -off; x < v.W; x += w) ctx.drawImage(tile.canvas, x, v.groundY, w + 1, h);
      ctx.fillStyle = tile.bottom;
      if (v.groundY + h < v.H) ctx.fillRect(0, v.groundY + h - 1, v.W, v.H - v.groundY - h + 1);
      ctx.globalAlpha = 1;
    };
    draw(this.tiles[ta].ground, 1);
    if (tb !== ta && t > 0) draw(this.tiles[tb].ground, t);
  }

  // --- bases ---
  drawBases(ctx, v, flight) {
    const night = this.timeData.lights;
    const L = this.timeData.light;
    const S = v.S;
    for (const bg of this.baseGfx) {
      const b = bg.base;
      if (!b.visible) continue;
      const x0 = v.sx(b.x), x1 = v.sx(b.x + b.runwayM);
      if (x1 < -2000 * S / 8 || x0 > v.W + 2000 * S / 8) continue;
      // Buildings and parked aircraft.
      for (const o of bg.objs) {
        const ox = v.sx(o.x);
        const w = o.wM * S, h = o.hM * S;
        if (ox > v.W || ox + w < 0) continue;
        ctx.drawImage(o.canvas, ox, v.groundY - h, w, h);
      }
      // Apron and runway.
      const g = v.groundY;
      ctx.fillStyle = `rgb(${92 * L[0] | 0},${94 * L[1] | 0},${98 * L[2] | 0})`;
      ctx.fillRect(x0 - 40 * S, g, x1 - x0 + 80 * S, 2.6 * S);
      ctx.fillStyle = `rgb(${52 * L[0] | 0},${54 * L[1] | 0},${58 * L[2] | 0})`;
      ctx.fillRect(x0, g, x1 - x0, 2.2 * S);
      ctx.fillStyle = `rgba(255,255,255,${0.25 * L[0]})`;
      ctx.fillRect(x0, g, x1 - x0, Math.max(1, 0.2 * S));
      ctx.fillStyle = `rgba(240,240,235,${0.85 * L[0] + 0.1})`;
      for (let m = 60; m < b.runwayM - 60; m += 50) ctx.fillRect(v.sx(b.x + m), g + 0.9 * S, 28 * S, 0.35 * S);
      for (const end of [b.x + 6, b.x + b.runwayM - 36]) for (let k = 0; k < 6; k++) ctx.fillRect(v.sx(end + k * 5), g + 0.3 * S, 3 * S, 1.6 * S);
      ctx.fillStyle = `rgba(250,210,60,${0.8 * L[0] + 0.1})`;
      for (let k = 1; k <= 4; k++) {
        ctx.fillRect(v.sx(b.x - k * 18), g + 0.9 * S, 9 * S, 0.4 * S);
        ctx.fillRect(v.sx(b.x + b.runwayM + k * 18 - 9), g + 0.9 * S, 9 * S, 0.4 * S);
      }
      this.drawWindsock(ctx, v, b.x + b.runwayM * 0.12);
      if (flight && b === flight.dest) this.drawPapi(ctx, v, b, flight);
      if (night) this.drawBaseLights(ctx, v, b, bg);
      else this.drawApproachPoles(ctx, v, b);
    }
  }

  drawApproachPoles(ctx, v, b) {
    ctx.fillStyle = '#3c3f44';
    for (let k = 1; k <= 8; k++) ctx.fillRect(v.sx(b.x - k * 30), v.groundY - 2 * v.S, Math.max(1, 0.25 * v.S), 2 * v.S);
  }

  drawWindsock(ctx, v, xM) {
    const S = v.S, x = v.sx(xM), y = v.groundY;
    if (x < -50 || x > v.W + 50) return;
    ctx.fillStyle = '#7d8085';
    ctx.fillRect(x, y - 7 * S, Math.max(1, 0.3 * S), 7 * S);
    const t = this.time;
    for (let i = 0; i < 4; i++) {
      const sx = x + i * 0.9 * S + 0.3 * S;
      const sy = y - 6.8 * S + i * 0.18 * S + Math.sin(t * 6 + i) * 0.12 * S;
      ctx.fillStyle = i % 2 ? '#f4f4f4' : '#f06a1b';
      ctx.fillRect(sx, sy, 0.95 * S, (0.9 - i * 0.12) * S);
    }
  }

  // PAPI: four lights left of the aim point, white above the path, red below.
  drawPapi(ctx, v, b, flight) {
    const aim = b.x + 300;
    const glide = flight.glide();
    const ang = glide ? glide.angle : 0;
    const limits = [3.5, 3.17, 2.83, 2.5];
    const S = v.S;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const lx = v.sx(aim - 30 - i * 9), ly = v.groundY - 0.8 * S;
      if (lx < -40 || lx > v.W + 40) continue;
      const white = ang > limits[i];
      const s = Math.max(10, 3.6 * S);
      ctx.drawImage(white ? SOFT.white : SOFT.red, lx - s / 2, ly - s / 2, s, s);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawBaseLights(ctx, v, b, bg) {
    const S = v.S, g = v.groundY - 0.4 * S;
    const t = this.time;
    const s = Math.max(6, 2.2 * S);
    ctx.globalCompositeOperation = 'lighter';
    const dot = (img, xM, y, sz = s) => {
      const x = v.sx(xM);
      if (x < -sz || x > v.W + sz) return;
      ctx.drawImage(img, x - sz / 2, y - sz / 2, sz, sz);
    };
    for (let m = 0; m <= b.runwayM; m += 60) dot(SOFT.white, b.x + m, g);
    dot(SOFT.green, b.x, g, s * 1.4);
    dot(SOFT.red, b.x + b.runwayM, g, s * 1.4);
    // Sequenced approach lights ("the rabbit").
    const phase = (t * 2) % 1;
    for (let k = 1; k <= 10; k++) {
      dot(SOFT.amber, b.x - k * 30, g - 1.6 * S, s * 0.9);
      if (Math.abs((1 - phase) * 10 - k) < 0.6) dot(SOFT.white, b.x - k * 30, g - 1.6 * S, s * 3);
    }
    // Tower beacon.
    if (Math.sin(t * 4) > 0.6) dot(SOFT.green, bg.towerX, v.sy(bg.towerH + 1), s * 3);
    // Pools of light on the apron.
    ctx.globalAlpha = 0.25;
    for (let m = 120; m < 120 + b.hangars * 72; m += 72) {
      const x = v.sx(b.x + m + 32);
      ctx.drawImage(SOFT.warm, x - 30 * S, v.groundY - 16 * S, 60 * S, 24 * S);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // --- strike targets ---
  drawTargets(ctx, v, flight) {
    if (!flight.targets.length) return;
    const S = v.S;
    for (const tg of flight.targets) {
      const spr = this.targetGfx[tg.kind][tg.alive ? 0 : 1];
      const x = v.sx(tg.x - spr.wM / 2);
      const w = spr.wM * S, h = spr.hM * S;
      if (x > v.W + 100 || x + w < -100) continue;
      ctx.drawImage(spr.canvas, x, v.groundY - h, w, h);
      if (tg.alive) {
        // Floating marker so targets read at the wide zoom.
        const mx = x + w / 2, my = v.groundY - h - Math.max(18, 6 * S);
        ctx.strokeStyle = 'rgba(255,90,60,0.95)'; ctx.lineWidth = Math.max(2, 0.3 * S);
        ctx.beginPath(); ctx.moveTo(mx - 7, my - 9); ctx.lineTo(mx, my); ctx.lineTo(mx + 7, my - 9); ctx.stroke();
      }
    }
  }

  // --- aiming aids in the world ---
  drawAids(ctx, v, flight, st) {
    if (flight.mode !== 'strike' || flight.state === 'done') return;
    const S = v.S;
    const imp = flight.bombImpact();
    if (imp) {
      ctx.fillStyle = imp.onTarget ? 'rgba(255,90,60,0.9)' : 'rgba(120,255,140,0.75)';
      const arc = flight.aimArc;
      for (let i = 0; i < arc.length; i += 4) {
        const p = arc[i];
        ctx.beginPath(); ctx.arc(v.sx(p.x), v.sy(p.y), Math.max(1.5, 0.25 * S), 0, Math.PI * 2); ctx.fill();
      }
      const x = v.sx(imp.x), y = v.groundY;
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 2;
      const r = Math.max(8, 3 * S);
      ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y - r * 2.4); ctx.lineTo(x, y - r * 1.2); ctx.stroke();
    }
    if (flight.data.weaponIsMissile && flight.ac.bombsLeft > 0) {
      const tg = flight.missileTarget();
      if (tg) {
        const x = v.sx(tg.x), y = v.groundY - 4 * S, r = Math.max(14, 6 * S) * (1 + 0.1 * Math.sin(this.time * 10));
        ctx.strokeStyle = 'rgba(255,70,50,0.95)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,70,50,0.95)'; ctx.font = `700 ${Math.max(12, 3 * S)}px "Chakra Petch"`; ctx.textAlign = 'center';
        ctx.fillText('LOCK', x, y - r - 6);
      }
    }
  }

  drawShadow(ctx, v, st, d) {
    const alt = st.y;
    if (alt > 80) return;
    const a = 0.35 * (1 - alt / 80);
    const len = d.pivot[0] * d.texM * 1.6 * v.S;
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.beginPath();
    ctx.ellipse(v.sx(st.x), v.groundY + 0.6 * v.S, len * (1 - alt / 200), 0.7 * v.S, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- aircraft ---
  drawAircraft(ctx, v, d, s) {
    const body = images[d.sprite];
    if (!body) return;
    let k = v.S * d.texM;
    k = Math.max(k, (0.07 * v.W) / body.width);
    ctx.save();
    ctx.translate(v.sx(s.x), v.sy(s.y));
    ctx.rotate(-s.pitch);
    ctx.scale(k, k);
    const gearTravel = d.gearSprite ? d.gearTravel : d.gearTopY ? d.pivot[1] - Math.max(...d.gearTopY) : 0;
    const sink = s.onGround ? (1 - s.gearPos) * gearTravel : 0;
    ctx.translate(-d.pivot[0], -d.pivot[1] + sink);
    const light = this.lightBody;
    if (s.gearPos > 0.05) {
      if (d.gearSprite && images[d.gearSprite]) ctx.drawImage(tinted(images[d.gearSprite], light), 0, -(1 - s.gearPos) * d.gearTravel);
      else if (d.gearX) this.drawCodeGear(ctx, d, s.gearPos, light);
    }
    if (s.afterburner > 0) this.drawAfterburner(ctx, d, s.afterburner);
    else if (d.nozzle && s.rpm > 0.3) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25 * s.rpm;
      const n = d.nozzle, r = d.flameWidth * 0.9;
      ctx.drawImage(SOFT.warm, n[0] - r, n[1] - r, r * 2, r * 2);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(tinted(body, light), 0, 0);
    if (d.weaponSprite && s.bombsLeft > 0) {
      const w = images[d.weaponSprite];
      for (let i = 0; i < Math.min(s.bombsLeft, d.hardpoints.length); i++) {
        const hp = d.hardpoints[i];
        ctx.fillStyle = '#33363a'; ctx.fillRect(hp[0] - 7, hp[1] - 4, 14, 5);
        if (w) ctx.drawImage(tinted(w, light), hp[0] - w.width / 2, hp[1]);
      }
    }
    if (d.elevatorSprite && images[d.elevatorSprite]) {
      const h = d.elevatorHinge;
      ctx.save();
      ctx.translate(h[0], h[1]);
      ctx.rotate(d.elevatorMaxDeg * Math.PI / 180 * s.elevator);
      ctx.drawImage(tinted(images[d.elevatorSprite], light), -h[0], -h[1]);
      ctx.restore();
    }
    if (d.hasPropeller) {
      const pc = d.propCenter;
      if (s.rpm > 0.6 && images[d.propSprite]) {
        ctx.globalAlpha = 0.75 + 0.25 * Math.sin(s.propAngle * 3);
        ctx.drawImage(tinted(images[d.propSprite], light), 0, 0);
        ctx.globalAlpha = 1;
      } else {
        const span = d.propRadius * Math.abs(Math.cos(s.propAngle));
        ctx.fillStyle = '#2a2a2e'; ctx.fillRect(pc[0] - 2, pc[1] - span, 4, span * 2);
      }
    }
    if (this.timeData.lights && s.engineOn) this.drawLights(ctx, d, s);
    ctx.restore();
  }

  drawCodeGear(ctx, d, gearPos, light) {
    for (let i = 0; i < d.gearX.length; i++) {
      const gx = d.gearX[i], top = d.gearTopY[i], r = d.gearWheel[i] / 2;
      const wy = lerp(top - r, d.pivot[1] - r, gearPos);
      ctx.fillStyle = `rgb(${110 * light[0] | 0},${114 * light[1] | 0},${118 * light[2] | 0})`;
      ctx.fillRect(gx - 2.5, top, 5, wy - top);
      ctx.fillStyle = '#121214';
      ctx.beginPath(); ctx.arc(gx, wy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgb(${150 * light[0] | 0},${155 * light[1] | 0},${165 * light[2] | 0})`;
      ctx.beginPath(); ctx.arc(gx, wy, r * 0.45, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawAfterburner(ctx, d, strength) {
    const n = d.nozzle;
    const t = this.time;
    const flicker = 0.88 + 0.08 * Math.sin(t * 47) + 0.04 * Math.sin(t * 113);
    const len = d.flameLength * (0.55 + 0.45 * strength) * flicker;
    const h = d.flameWidth;
    const wob = 1.5 * Math.sin(t * 71);
    ctx.globalCompositeOperation = 'lighter';
    const layers = [[1.3, 1, 'rgba(255,70,20,0.35)'], [1, 0.85, 'rgba(255,130,30,0.75)'], [0.7, 0.62, 'rgba(255,210,90,0.85)'], [0.38, 0.35, 'rgba(255,250,220,1)']];
    for (const [wf, lf, col] of layers) {
      const hw = h * 0.5 * wf, fl = len * lf;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(n[0] + 6, n[1] - hw);
      ctx.quadraticCurveTo(n[0] - fl * 0.35, n[1] - hw * 1.15 + wob, n[0] - fl, n[1] + wob * 2);
      ctx.quadraticCurveTo(n[0] - fl * 0.35, n[1] + hw * 1.15 + wob, n[0] + 6, n[1] + hw);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(160,210,255,0.8)';
    for (let k = 0; k < 4; k++) {
      const dx = n[0] - len * (0.12 + 0.13 * k), s = h * 0.22 * (1 - 0.15 * k);
      ctx.beginPath(); ctx.moveTo(dx + s * 1.4, n[1]); ctx.lineTo(dx, n[1] - s); ctx.lineTo(dx - s * 1.4, n[1]); ctx.lineTo(dx, n[1] + s); ctx.fill();
    }
    ctx.globalAlpha = 0.5 + 0.3 * strength;
    const r = h * 2.2;
    ctx.drawImage(SOFT.warm, n[0] - r, n[1] - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawLights(ctx, d, s) {
    const L = d.lights;
    const t = this.time;
    ctx.globalCompositeOperation = 'lighter';
    const dot = (img, p, r) => ctx.drawImage(img, p[0] - r, p[1] - r, r * 2, r * 2);
    dot(SOFT.green, L.navNear, 26);
    dot(SOFT.red, L.navFar, 20);
    dot(SOFT.white, L.tail, 22);
    if ((t % 1.2) < 0.12) dot(SOFT.red, L.beacon, 44);
    if ((t % 1.5) < 0.06) dot(SOFT.white, L.navNear, 60);
    if (s.gearPos > 0.5) {
      const p = L.landing;
      const g = ctx.createLinearGradient(p[0], p[1], p[0] + 520, p[1]);
      g.addColorStop(0, 'rgba(255,250,220,0.35)'); g.addColorStop(1, 'rgba(255,250,220,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + 520, p[1] - 10); ctx.lineTo(p[0] + 520, p[1] + 90); ctx.fill();
      dot(SOFT.white, p, 30);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawWeapons(ctx, v, flight) {
    const sc = flight.mode === 'strike' ? 1.6 : 1;
    for (const w of flight.weapons) {
      const img = images[w.sprite];
      if (!img) continue;
      const k = Math.max(v.S * flight.data.texM * sc, (0.022 * v.W) / img.width);
      ctx.save();
      ctx.translate(v.sx(w.pos.x), v.sy(w.pos.y));
      ctx.rotate(-Math.atan2(w.vel.y, w.vel.x));
      ctx.scale(k, k);
      ctx.drawImage(tinted(img, this.lightBody), -img.width / 2, -img.height / 2);
      if (w.motor) {
        ctx.globalCompositeOperation = 'lighter';
        const l = img.height * 2.2 * (0.85 + 0.15 * Math.sin(this.time * 60));
        ctx.fillStyle = 'rgba(255,160,50,0.9)';
        ctx.beginPath(); ctx.moveTo(-img.width / 2, -img.height * 0.25); ctx.lineTo(-img.width / 2 - l, 0); ctx.lineTo(-img.width / 2, img.height * 0.25); ctx.fill();
        ctx.drawImage(SOFT.warm, -img.width / 2 - 30, -30, 60, 60);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
    }
  }

  // --- effects ---
  handleFx(flight) {
    for (const e of flight.fx) {
      if (e.type === 'touchdown') this.puffs(e.x, 0.3, Math.min(14, 2 + e.fpm / 60), 'smoke', 2.5);
      else if (e.type === 'explosion') this.explode(e.x, 0.5, e.big ? 1.4 : 0.8, e.kind === 'fuel');
      else if (e.type === 'crash') this.crashFx(e, flight);
      else if (e.type === 'missileLaunch') this.puffs(e.x, e.y, 6, 'smoke', 2);
    }
  }

  puffs(x, y, n, kind, size) {
    for (let i = 0; i < n; i++) {
      this.particles.spawn(kind, x + (Math.random() - 0.5) * 3, y + Math.random(), -4 - Math.random() * 6, 1 + Math.random() * 2, size * (0.7 + Math.random() * 0.6), 1.2 + Math.random(), { grow: 2.5, alpha: 0.6 });
    }
  }

  explode(x, y, power, secondary = false) {
    const P = this.particles;
    this.flash = Math.max(this.flash, 0.5 * power);
    this.cam.shake = Math.min(1.2, this.cam.shake + 0.6 * power);
    this.rings.push({ x, y, age: 0, life: 0.6, r: 40 * power });
    P.spawn('glow', x, y + 4, 0, 0, 60 * power, 0.35, { grow: 1.3 });
    for (let i = 0; i < 26 * power; i++) {
      const a = Math.random() * Math.PI, s = (10 + Math.random() * 30) * power;
      P.spawn('fire', x, y + 2, Math.cos(a) * s, Math.sin(a) * s * 0.8 + 6, (6 + Math.random() * 10) * power, 0.5 + Math.random() * 0.8, { grow: 2, drag: 2.5, lift: 6 });
    }
    for (let i = 0; i < 22 * power; i++) {
      const a = Math.random() * Math.PI;
      P.spawn('dark', x + (Math.random() - 0.5) * 8, y + Math.random() * 6, Math.cos(a) * 8, 4 + Math.random() * 10, (8 + Math.random() * 10) * power, 3 + Math.random() * 3, { grow: 3, drag: 0.8, lift: 3, alpha: 0.75 });
    }
    for (let i = 0; i < 30 * power; i++) {
      const a = Math.random() * Math.PI, s = 25 + Math.random() * 45;
      P.spawn('spark', x, y + 1, Math.cos(a) * s, Math.sin(a) * s, 1.2, 0.8 + Math.random() * 0.8, { grow: 0.5, drag: 0.4 });
    }
    for (let i = 0; i < 12 * power; i++) P.spawn('dust', x + (Math.random() - 0.5) * 20, 1, (Math.random() - 0.5) * 30, 2 + Math.random() * 4, 10 + Math.random() * 8, 2 + Math.random() * 2, { grow: 2, drag: 1, alpha: 0.6 });
    if (secondary) setTimeout(() => this.explode(x + 8, y, power * 0.7), 450);
  }

  crashFx(e, flight) {
    const d = flight.data;
    const big = e.severity >= 0.6;
    if (big) this.explode(e.x, 1, 1.3);
    else {
      this.cam.shake = 0.7;
      for (let i = 0; i < 30; i++) this.particles.spawn('dust', e.x + (Math.random() - 0.5) * 10, 1, e.vx * 0.3 + (Math.random() - 0.5) * 10, 2 + Math.random() * 3, 6 + Math.random() * 6, 2 + Math.random() * 2, { grow: 2.5, alpha: 0.7 });
    }
    this.makeShards(d, e, big);
    this.burnX = e.x; this.burnT = 0;
  }

  makeShards(d, e, big) {
    const img = images[d.sprite];
    if (!img) return;
    const cols = big ? 6 : 5, rows = big ? 3 : 2;
    const W = img.width, H = img.height;
    const r = Math.random;
    const pts = [];
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const jx = i === 0 || i === cols ? 0 : (r() - 0.5) * W / cols * 0.7;
      const jy = j === 0 || j === rows ? 0 : (r() - 0.5) * H / rows * 0.7;
      pts.push([i * W / cols + jx, j * H / rows + jy]);
    }
    const probe = makeCanvas(W, H).getContext('2d', { willReadFrequently: true });
    probe.drawImage(img, 0, 0);
    const data = probe.getImageData(0, 0, W, H).data;
    const c = Math.cos(e.pitch), s = Math.sin(e.pitch);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const q = [pts[j * (cols + 1) + i], pts[j * (cols + 1) + i + 1], pts[(j + 1) * (cols + 1) + i + 1], pts[(j + 1) * (cols + 1) + i]];
      const cx = q.reduce((a, p) => a + p[0], 0) / 4, cy = q.reduce((a, p) => a + p[1], 0) / 4;
      let filled = 0;
      for (const [px, py] of [[cx, cy], ...q.map((p) => [(p[0] + cx) / 2, (p[1] + cy) / 2])]) {
        if (data[(Math.floor(py) * W + Math.floor(px)) * 4 + 3] > 40) filled++;
      }
      if (filled < 2) continue;
      const minX = Math.min(...q.map((p) => p[0])), minY = Math.min(...q.map((p) => p[1]));
      const maxX = Math.max(...q.map((p) => p[0])), maxY = Math.max(...q.map((p) => p[1]));
      const cv = makeCanvas(maxX - minX + 2, maxY - minY + 2);
      const x = cv.getContext('2d');
      x.beginPath(); q.forEach((p, n) => (n ? x.lineTo(p[0] - minX, p[1] - minY) : x.moveTo(p[0] - minX, p[1] - minY))); x.closePath(); x.clip();
      x.drawImage(tinted(img, this.lightBody), -minX, -minY);
      const lx = (cx - d.pivot[0]) * d.texM, ly = -(cy - d.pivot[1]) * d.texM;
      const wx = e.x + lx * c - ly * s, wy = Math.max(0.3, e.y + lx * s + ly * c);
      const blast = big ? 18 : 4;
      this.shards.push({
        cv, ox: (cx - minX), oy: (cy - minY), x: wx, y: wy,
        vx: e.vx * (big ? 0.35 : 0.6) + (r() - 0.5) * blast, vy: Math.abs(e.vy) * 0.15 + r() * blast * 0.7,
        rot: -e.pitch, spin: (r() - 0.5) * (big ? 10 : 4), texM: d.texM, rest: false, smoke: big || r() < 0.3,
      });
    }
  }

  updateShards(dt) {
    for (const s of this.shards) {
      if (s.rest) continue;
      s.vy -= 9.81 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.rot += s.spin * dt;
      if (s.y <= 0.3) {
        s.y = 0.3;
        s.vy = Math.abs(s.vy) * 0.15;
        const f = Math.exp(-dt * 2.2);
        s.vx *= f; s.spin *= f;
        if (Math.abs(s.vx) > 3 && Math.random() < 0.3) this.particles.spawn('dust', s.x, 0.5, s.vx * 0.2, 1, 3, 1, { grow: 2, alpha: 0.5 });
        if (Math.abs(s.vx) < 0.3 && s.vy < 0.5) s.rest = true;
      }
      if (s.smoke && Math.random() < dt * 8) this.particles.spawn('dark', s.x, s.y, 0, 2, 3, 2, { grow: 3, lift: 2, alpha: 0.5 });
    }
  }

  drawShards(ctx, v) {
    for (const s of this.shards) {
      const k = v.S * s.texM;
      ctx.save();
      ctx.translate(v.sx(s.x), v.sy(s.y));
      ctx.rotate(s.rot);
      ctx.scale(k, k);
      ctx.drawImage(s.cv, -s.ox, -s.oy);
      ctx.restore();
    }
  }

  drawRings(ctx, v) {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += this.dt || 1 / 60;
      if (r.age > r.life) { this.rings.splice(i, 1); continue; }
      const t = r.age / r.life;
      ctx.strokeStyle = `rgba(255,240,210,${0.6 * (1 - t)})`;
      ctx.lineWidth = Math.max(2, 1.5 * v.S * (1 - t));
      ctx.beginPath(); ctx.ellipse(v.sx(r.x), v.sy(r.y), r.r * t * v.S, r.r * t * v.S * 0.5, 0, Math.PI, 0); ctx.stroke();
    }
  }

  emitContinuous(flight, st, dt) {
    const P = this.particles;
    const d = flight.data;
    const a = flight.ac;
    if (!a.crashed) {
      // Contrails high up, wingtip vapour under high G, smoky old engine on the Mirage.
      if (d.nozzle && st.y > 3500 && a.rpm > 0.5 && Math.random() < 0.9) {
        const p = a.pointM(d.nozzle[0], d.nozzle[1]);
        P.spawn('white', p.x, p.y, a.vel.x * 0.05, 0, 2, 3.5, { grow: 4, alpha: 0.5, drag: 0.1, ground: false });
      }
      if (Math.abs(a.gLoad) > 4 && a.speedKt > 200 && Math.random() < 0.8) {
        const p = a.pointM(d.pivot[0] + 20, d.pivot[1] - 50);
        P.spawn('white', p.x, p.y, a.vel.x * 0.3, a.vel.y * 0.3, 1.5, 0.4, { grow: 3, alpha: 0.45, ground: false });
      }
      if (d.id === 'mirage5' && a.rpm > 0.5 && a.throttle > 0.5 && a.afterburner === 0 && Math.random() < 0.6) {
        const p = a.pointM(d.nozzle[0], d.nozzle[1]);
        P.spawn('smoke', p.x, p.y, a.vel.x * 0.1, 0, 1.6, 1.6, { grow: 3, alpha: 0.18, ground: false });
      }
      if (a.onGround && a.braking && a.speedKt > 30 && Math.random() < 0.3) P.spawn('smoke', a.pos.x, 0.3, -2, 0.5, 1.5, 0.8, { grow: 2, alpha: 0.3 });
      if (d.hasPropeller && a.onGround && a.rpm > 0.8 && a.throttle > 0.6 && Math.random() < 0.3) P.spawn('dust', a.pos.x - 6, 0.3, -12, 0.5, 2, 1, { grow: 2, alpha: 0.35 });
    }
    for (const w of flight.weapons) {
      if (w.motor) P.spawn('smoke', w.pos.x, w.pos.y, w.vel.x * 0.05, 0, 1.2, 2.5, { grow: 4, alpha: 0.55, ground: false, drag: 0.3 });
    }
    // Burning targets and wreck.
    for (const t of flight.targets) {
      if (!t.alive && t.deadAt < 60 && Math.random() < dt * 14) {
        P.spawn('dark', t.x + (Math.random() - 0.5) * t.w * 0.6, 2, 2, 5, 6, 4, { grow: 3.5, lift: 3, alpha: 0.6 });
        if (Math.random() < 0.6) P.spawn('fire', t.x + (Math.random() - 0.5) * t.w * 0.5, 1, 0, 3, 4, 0.6, { lift: 4, alpha: 0.8 });
      }
    }
    if (this.burnX != null && (this.burnT += dt) < 40 && Math.random() < dt * 12) {
      P.spawn('dark', this.burnX + (Math.random() - 0.5) * 10, 1, 1, 4, 5, 4, { grow: 3.5, lift: 3, alpha: 0.6 });
      if (Math.random() < 0.5) P.spawn('fire', this.burnX + (Math.random() - 0.5) * 8, 0.5, 0, 2, 3.5, 0.6, { lift: 4 });
    }
  }

  drawScreenFx(ctx, v, ac) {
    // Vignette.
    const g = ctx.createRadialGradient(v.W / 2, v.H / 2, v.H * 0.45, v.W / 2, v.H / 2, v.H * 1.05);
    const night = this.timeData.lights;
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${night ? 0.55 : 0.3})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, v.W, v.H);
    if (ac.blackout > 0.01 || ac.redout > 0.01) {
      const col = ac.blackout > ac.redout ? '0,0,0' : '150,0,0';
      const f = Math.max(ac.blackout, ac.redout);
      const gg = ctx.createRadialGradient(v.W / 2, v.H / 2, v.H * (0.6 - f * 0.55), v.W / 2, v.H / 2, v.H * 0.9);
      gg.addColorStop(0, `rgba(${col},${f * 0.4})`);
      gg.addColorStop(1, `rgba(${col},${Math.min(1, f * 1.2)})`);
      ctx.fillStyle = gg;
      ctx.fillRect(0, 0, v.W, v.H);
    }
    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(255,236,200,${this.flash * 0.6})`;
      ctx.fillRect(0, 0, v.W, v.H);
      this.flash *= 0.85;
    }
  }
}
