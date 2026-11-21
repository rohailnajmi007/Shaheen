// Draws the world, the aircraft and effects on one canvas.
import { images, tinted, SOFT, makeCanvas, rng } from './assets.js';
import { LAYERS, TILE_W, buildLayer, buildGround, buildClouds, buildStars, buildBase, buildTarget, buildFuelTruck } from './scenery.js';
import { Particles } from './particles.js';
import { buildLandmarks, LANDMARKS } from './landmarks.js';
import { THEMES, TIMES, REFUEL } from '../data/world.js';
import { GROUND_UNITS, AIR_DEFENCE, DAMAGE } from '../data/combat.js';
import { KT } from '../sim/aircraft.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const LAYER_ZOOM = { mountains: 0.12, city: 0.25, mid: 0.4, trees: 0.7 };
// Air-to-ground attack-run camera (see updateCamera). At zoom 0.4 the ground stays in
// view up to ~125 m (~400 ft) on a 720p screen; climb higher and it leaves the frame.
export const ATTACK_CAM = {
  zoom: 0.4,        // camera zoom during the attack run (1 = normal)
  lookFactor: 0.5,  // look-ahead x this, so the ground behind (where bombs land) stays in view
  leadFactor: 0.5,  // vertical lead x this, so climbs and dives show as movement on screen
};
// Air-to-ground combat drawing (owner, 2026-11-19).
export const COMBAT_FX = {
  tracerS: 0.03,        // tracer streak length = speed x this (s)
  tracerMinPx: 1.6,     // tracer line width floor (px)
  missileMinW: 0.018,   // enemy missile drawn at least this share of the screen width
  missileLenM: 3.2,     // ... true length (m), drawn x weaponScale like our weapons
  weaponScale: 1.6,
  arrowMarginPx: 34,    // incoming-missile arrows this far inside the screen edge
};
// Dogfight camera and bandit look (owner 2026-11-21: both jets always on screen).
export const DOGFIGHT_CAM = {
  fillW: 0.6, fillH: 0.5,     // the two jets span at most this share of the screen
  smallH: 520, smallFillW: 0.42, smallFillH: 0.22, // phones (height under smallH px): HUD covers the edges...
  smallDrop: 0.13,            // ... and the instructor strip the middle: jets sit this share of the height lower
  minZoom: 0.08, maxZoom: 0.9,
  zoomRate: 3, panRate: 4,    // how fast the framing follows (1/s)
  banditTint: null,           // multiply on the bandit's sprite ([r,g,b]); null: the owner's art as is
  markerPx: 9,                // bandit marker size (x screen height / 720)
};
// Battle-damage smoke (owner 2026-11-21): starts after fromDamage (a couple of hits),
// always dark (light grey vanished against white clouds): thin and faint at first,
// [light, heavy] ranges for puffs per second, size (m), life (s), alpha; grey turns
// black past blackFrom and fire appears past fireFrom (shares of the way to destroyed).
export const DAMAGE_SMOKE = { fromDamage: 0.03, ratePerS: [10, 60], size: [2, 6], life: [1.2, 3.2], alpha: [0.24, 0.7], blackFrom: 0, fireFrom: 0.7, solidFrom: 0.25, spacing: 0.7 };
// The camera keeps a shot-down bandit in frame this long (to see it break up).
const WATCH_KILL_S = 5;
// Pieces off a bandit going down: count on the kill, extra while falling, chip size (tex px),
// fling speed (m/s), air drag (1/s), how long they stay, and a cap.
export const DEBRIS = { onKill: 12, fallingChipsPerS: 1, chipPx: [16, 40], flingMs: 18, airDrag: 0.6, lifeS: 30, max: 80,
  // Each round that hits any jet (you or a bandit) may knock off a small bit near the hit.
  hitChance: 0.7, hitChips: [1, 2], hitChipPx: [4, 10], hitFlingMs: 12 };
// Near clouds are scattered over this much of the route, then repeat.
const CLOUD_SPAN_M = 60000;
// Tail strobe: flash starts (s) within each period.
export const STROBE = { periodS: 1.6, flashes: [0, 0.2], flashS: 0.06 };
// Crash breakup (see crashFx). Shard sizes in aircraft texture px (1/16 m).
export const CRASH = {
  bigSeverity: 0.6,     // from this severity: explosion, debris blasted out
  sectionsSmall: 3,     // big structural sections (nose, centre, tail) in a small crash
  sectionsBig: 5,       // ... in a big crash
  debrisSmall: 22,      // smaller pieces torn off (edges, wingtips, fin, gear)
  debrisBig: 55,
  tearPx: 7,            // how jagged the tears are (texture px)
  sectionReach: 0.4,    // how much of the airframe the big sections keep (more = fewer bits)
  blastMs: 8,           // big crash: outward debris speed (m/s, scaled by severity)
  hotBig: 0.25,         // share of pieces glowing as hot embers (big / small crash)
  hotSmall: 0.08,
  friction: 1.0,        // sliding friction coefficient on the ground
  landKeep: 0.5,        // share of a piece's speed kept when it first hits the ground
  emberCoolS: 4,        // hot shards glow this long
  burningBig: 0.08,     // share of small pieces that also burn (the main wreck always burns)
  burningSmall: 0.03,
  burnS: 45,            // burning / smoking time
};

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
    this.landmarks = buildLandmarks(world.bases, time, res);
    this.baseGfx = world.bases.map((b) => ({ base: b, builtX: b.x, ...buildBase(b, time, R) }));
    this.wrecks = [];
    this.debris = []; // pieces off bandits (not the camera's crash wreck)
    this.truckGfx = buildFuelTruck(time, R);
    this.targetGfx = {};
    for (const k of Object.keys(GROUND_UNITS)) {
      this.targetGfx[k] = [buildTarget(k, time, R, false), buildTarget(k, time, R, true)];
    }
    // Cloud field: far (slow parallax) and near (world) clouds.
    const r = rng(7);
    this.cloudField = [];
    const span = CLOUD_SPAN_M;
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

  // A base moved (air to air: the landing base is placed when the fight is over):
  // build its scenery again, once.
  checkBases() {
    if (this.baseGfx.every((bg) => bg.builtX === bg.base.x)) return;
    const time = this.timeData, R = Math.round(10 * this.res);
    this.baseGfx = this.world.bases.map((b) => ({ base: b, builtX: b.x, ...buildBase(b, time, R) }));
    this.landmarks = buildLandmarks(this.world.bases, time, this.res);
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
    // Fixed zoom (Godot attack_zoom): the jet climbs and dives visibly on screen and the
    // ground leaves the frame when it climbs high (owner, 2026-11-19). The old
    // zoom = 42 / altitude kept the jet at one screen height whatever it did.
    if (attack) z = ATTACK_CAM.zoom;
    // Dogfight: frame both jets (centre between them, zoom to fit).
    const pair = flight && flight.df && !flight.ac.crashed && !flight.eject && this.camB;
    let midX = st.x, midY = st.y;
    if (pair) {
      const b = this.camB, C = DOGFIGHT_CAM;
      const base = (v.H / 720) * 7.2;
      const small = v.H / this.res < C.smallH;
      const fw = small ? C.smallFillW : C.fillW, fh = small ? C.smallFillH : C.fillH;
      const fit = Math.min(fw * v.W / Math.max(Math.abs(b.x - st.x), 1), fh * v.H / Math.max(Math.abs(b.y - st.y), 1)) / base;
      z = clamp(fit, C.minZoom, C.maxZoom);
      midX = (st.x + b.x) / 2; midY = (st.y + b.y) / 2;
      if (small) midY += (C.smallDrop * v.H) / ((v.H / 720) * 7.2 * Math.max(c.zoom, 0.01));
    }
    if (flight) {
      if (flight.revealed && flight.state === 'flying') {
        const toGo = flight.dest.x - st.x;
        if (toGo > -200 && toGo < 2500 && st.y < 250) z = Math.max(z, 0.95);
      }
      if (flight.state === 'done') z = Math.max(z, 0.9);
    }
    if (!attack && !pair) z *= c.userZoom;
    const k = 1 - Math.exp(-dt * (pair ? DOGFIGHT_CAM.zoomRate : 1.6));
    c.zoom += (z - c.zoom) * k;
    v.S = (v.H / 720) * 7.2 * c.zoom;
    // Look-ahead in metres (dogfight: the offset to the midpoint between the jets).
    const lookM = pair ? midX - st.x : clamp(st.vx / 240, -0.3, 1) * 0.2 * v.W * (attack ? ATTACK_CAM.lookFactor : 1) / v.S;
    const leadM = pair ? midY - st.y : clamp(st.vy * 0.5, -40, 40) * (attack ? ATTACK_CAM.leadFactor : 1);
    const pr = pair ? DOGFIGHT_CAM.panRate : 1.2;
    c.look += (lookM * v.S - c.look) * (1 - Math.exp(-dt * pr));
    c.lead += (leadM - c.lead) * (1 - Math.exp(-dt * (pair ? pr : 1.5)));
    c.x = st.x + c.look / v.S;
    // Low: the camera stops so the ground stays at 74% of the screen height and the jet
    // moves on screen; higher up the camera follows the jet and the ground drops away.
    const minY = (0.24 * v.H) / v.S;
    c.y = Math.max(st.y + c.lead, minY);
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
    let st = flight.renderState(alpha);
    // After a crash the camera follows the debris field (its middle), not the impact point.
    if (flight.ac.crashed && this.shards.length) {
      let sx = 0;
      for (const s of this.shards) sx += s.x;
      st = { ...st, x: sx / this.shards.length, y: 0, vx: 0, vy: 0 };
    }
    // Dogfight: the bandit's state (the camera frames both jets).
    const df = flight.df;
    this.bst = df && df.b ? df.renderState(alpha) : null;
    // Camera: the live bandit, or for a few seconds the one just shot down (break-up).
    const fw = df && !df.b && df.falling.length ? df.falling[df.falling.length - 1] : null;
    this.camB = this.bst || (fw && fw.t < WATCH_KILL_S ? df.renderState(alpha, fw.ac, fw.prev) : null);
    if (df) this.checkBases();
    // Ejected: the camera follows the pilot.
    const ej = flight.eject;
    this.updateCamera(dt, ej ? { ...st, x: ej.x, y: ej.y, vx: ej.vx, vy: ej.vy } : st, flight);
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
    this.drawFuelTruck(ctx, v, flight);
    this.drawAids(ctx, v, flight, st);
    if (!flight.ac.crashed) this.drawShadow(ctx, v, st, flight.data);
    this.particles.draw(ctx, v, this.timeData.lights ? 0.6 : 1);
    this.drawWeapons(ctx, v, flight);
    if (flight.armed) this.drawCombat(ctx, v, flight);
    if (df) {
      for (const w of df.falling) this.drawAircraft(ctx, v, df.opp, df.renderState(alpha, w.ac, w.prev), DOGFIGHT_CAM.banditTint);
      if (this.bst) {
        this.drawAircraft(ctx, v, df.opp, this.bst, DOGFIGHT_CAM.banditTint);
        if (df.firing) this.drawMuzzleAt(ctx, v, df.opp, this.bst);
      }
    }
    if (!flight.ac.crashed) this.drawAircraft(ctx, v, flight.data, st);
    if (flight.armed && !flight.ac.crashed && flight.cb.firing) this.drawMuzzleAt(ctx, v, flight.data, st);
    this.drawShards(ctx, v);
    if (this.debris.length) this.drawShards(ctx, v, this.debris);
    if (ej) this.drawEject(ctx, v, ej);
    this.drawRings(ctx, v);
    this.drawClouds(ctx, v, true);
    if (flight.mode === 'strike') this.drawThreatArrows(ctx, v, flight);
    if (this.bst && !df.fleeing) this.drawBanditMarker(ctx, v, flight, this.bst);
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
      // Darker sky high up, fading out toward the horizon (no hard edge).
      const dk = ctx.createLinearGradient(0, 0, 0, v.H * 0.75);
      dk.addColorStop(0, `rgba(5,12,40,${hi * 0.35})`);
      dk.addColorStop(1, 'rgba(5,12,40,0)');
      ctx.fillStyle = dk;
      ctx.fillRect(0, 0, v.W, v.H * 0.75);
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
      // Each layer sinks with the ground at its own parallax rate (L.lift), with no cap:
      // climb and the trees, then hills, then mountains drop out of view (owner 2026-11-20).
      const yBase = v.restY + (v.groundY - v.restY) * L.lift;
      if (yBase - (L.h + 40) * (v.H / 720) * zf > v.H) continue; // whole layer below the screen
      if (L.slot === 'trees') this.drawLandmarks(ctx, v, yBase);
      const A = this.tiles[ta][L.slot], B = this.tiles[tb][L.slot];
      const aA = ta === tb ? 1 : Math.min(1, 2 * (1 - t));
      const aB = ta === tb ? 0 : Math.min(1, 2 * t);
      if (A && aA > 0) this.drawTile(ctx, v, A, L, zf, yBase, aA);
      if (B && aB > 0) this.drawTile(ctx, v, B, L, zf, yBase, aB);
    }
  }

  // Base landmarks (landmarks.js): in front of the hills, behind the tree layer.
  drawLandmarks(ctx, v, treesBaseY) {
    const zf = lerp(1, this.cam.zoom, 0.55);
    const u = v.H / 720;
    const gp = (v.H / 360) * zf; // screen px per Godot px
    const y = treesBaseY - LANDMARKS.lift * u * zf;
    for (const it of this.landmarks) {
      if (!it.base.visible) continue;
      const x = v.W / 2 + (it.camX - this.cam.x) * LANDMARKS.speed * u * zf + it.left * gp;
      const w = it.w * gp;
      if (x > v.W || x + w < 0) continue;
      ctx.drawImage(it.canvas, x, y - it.h * gp, w, it.h * gp);
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
        const wx = c.x + Math.round((this.cam.x - c.x) / CLOUD_SPAN_M) * CLOUD_SPAN_M; // the field repeats (long air-to-air flights)
        x = v.sx(wx) - w / 2; y = v.sy(c.y) - h / 2;
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
    const u = Math.max(1, v.H / 720);
    for (const tg of flight.targets) {
      const spr = this.targetGfx[tg.kind][tg.alive ? 0 : 1];
      const x = v.sx(tg.x - spr.wM / 2);
      const w = spr.wM * S, h = spr.hM * S;
      if (x > v.W + 100 || x + w < -100) continue;
      if (tg.alive && tg.role === 'sam') this.drawSamMissiles(ctx, v, tg);
      ctx.drawImage(spr.canvas, x, v.groundY - h, w, h);
      if (tg.role === 'aaa') this.drawAaaBarrels(ctx, v, tg);
      if (!tg.alive) continue;
      // Floating marker so units read at the wide zoom: red chevron = mission target,
      // amber diamond + label = air defence.
      const mx = x + w / 2, my = v.groundY - h - Math.max(18 * u, 6 * S);
      ctx.lineWidth = Math.max(2 * u, 0.3 * S);
      if (tg.objective) {
        ctx.strokeStyle = 'rgba(255,90,60,0.95)';
        ctx.beginPath(); ctx.moveTo(mx - 7 * u, my - 9 * u); ctx.lineTo(mx, my); ctx.lineTo(mx + 7 * u, my - 9 * u); ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(255,190,60,0.95)';
        ctx.beginPath(); ctx.moveTo(mx, my - 10 * u); ctx.lineTo(mx + 5 * u, my - 5 * u); ctx.lineTo(mx, my); ctx.lineTo(mx - 5 * u, my - 5 * u); ctx.closePath(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,190,60,0.95)'; ctx.font = `700 ${Math.round(11 * u)}px "Chakra Petch"`; ctx.textAlign = 'center';
        ctx.fillText(tg.role === 'aaa' ? 'AAA' : 'SAM', mx, my - 14 * u);
      }
    }
  }

  // Fuel truck at a refuelling stop: drives in from ahead, parks at the nose with a
  // hose to the jet while pumping, then drives off the way it came.
  drawFuelTruck(ctx, v, flight) {
    const r = flight.refuel;
    if (!r || !this.truckGfx) return;
    const T = REFUEL;
    const ease = (k) => k * k * (3 - 2 * k);
    const park = r.x + T.parkAheadM, far = park + T.driveInM;
    const leaving = r.t > T.driveS + T.pumpS;
    let x = park;
    if (r.t < T.driveS) x = far + (park - far) * ease(r.t / T.driveS);
    else if (leaving) x = park + (far - park) * ease(Math.min(1, (r.t - T.driveS - T.pumpS) / T.driveS));
    const spr = this.truckGfx, S = v.S;
    const w = spr.wM * S, h = spr.hM * S, sx = v.sx(x);
    if (sx - w > v.W || sx + w < 0) return;
    if (!leaving && r.t >= T.driveS) {
      ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = Math.max(1.5, 0.25 * S);
      ctx.beginPath(); ctx.moveTo(sx - w / 2 + 0.6 * S, v.groundY - 0.9 * S);
      ctx.quadraticCurveTo((sx + v.sx(r.x)) / 2, v.groundY + 0.2 * S, v.sx(r.x + 2), v.groundY - 1.4 * S); ctx.stroke();
    }
    ctx.save();
    ctx.translate(sx, v.groundY);
    if (leaving) ctx.scale(-1, 1); // cab first on the way out
    ctx.drawImage(spr.canvas, -w / 2, -h, w, h);
    ctx.restore();
  }

  // Ejection: canopy tumbling away, seat with the pilot (rocket flame early), then the
  // parachute. Drawn at aircraft scale (2x true size like the jets), with a size floor.
  drawEject(ctx, v, e) {
    const k = Math.max(v.S * 2, v.H / 80);  // px per (true) metre, drawn 2x (size floor so it reads at the attack zoom)
    const c = e.canopy;
    if (c.y > 0) {
      ctx.save(); ctx.translate(v.sx(c.x), v.sy(c.y)); ctx.rotate(c.rot);
      ctx.fillStyle = 'rgba(140,190,230,0.85)'; ctx.strokeStyle = '#3a4048'; ctx.lineWidth = Math.max(1, k * 0.06);
      ctx.beginPath(); ctx.ellipse(0, 0, k * 0.9, k * 0.35, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    const x = v.sx(e.x), y = v.sy(e.y);
    if (e.chute) {
      // Canopy above, lines down to the pilot.
      const top = y - k * 6, r = k * 3;
      ctx.strokeStyle = 'rgba(60,60,60,0.8)'; ctx.lineWidth = Math.max(1, k * 0.05);
      ctx.beginPath();
      for (const f of [-1, -0.45, 0.45, 1]) { ctx.moveTo(x, y - k * 1.2); ctx.lineTo(x + f * r, top); }
      ctx.stroke();
      const g = ctx.createLinearGradient(x - r, 0, x + r, 0);
      g.addColorStop(0, '#d9822b'); g.addColorStop(0.5, '#f4f1e6'); g.addColorStop(1, '#d9822b');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x, top, r, r * 0.6, 0, Math.PI, 0);
      for (let i = 4; i >= 0; i--) ctx.quadraticCurveTo(x - r + (i + 0.5) * (2 * r / 5), top + r * 0.12, x - r + i * (2 * r / 5), top);
      ctx.fill();
    }
    // Pilot (olive flight suit, helmet), on the seat until the chute opens.
    ctx.save(); ctx.translate(x, y); if (!e.chute) ctx.rotate(-(e.pitch || 0));
    if (!e.chute) {
      ctx.fillStyle = '#2b2d30'; ctx.fillRect(-k * 0.5, -k * 1.3, k * 0.25, k * 1.4); ctx.fillRect(-k * 0.5, -k * 0.05, k * 1, k * 0.25);
      if (e.t < 0.4) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(SOFT.warm, -k * 1.2, k * 0.1, k * 2.4, k * 2.4);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.fillStyle = '#4e5a3a'; ctx.fillRect(-k * 0.25, -k * 1.1, k * 0.5, k * 0.9);
    ctx.fillRect(-k * 0.25, -k * 0.25, k * 0.2, k * 0.6); ctx.fillRect(k * 0.05, -k * 0.25, k * 0.2, k * 0.6);
    ctx.fillStyle = '#e8e6df'; ctx.beginPath(); ctx.arc(0, -k * 1.35, k * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Twin barrels on the AAA mount, pointing where the gunner aims (t.aim).
  drawAaaBarrels(ctx, v, t) {
    const S = v.S;
    const px = v.sx(t.x), py = v.sy(t.h * 0.8);
    const ang = t.alive ? (t.aim ?? Math.PI * 0.75) : Math.PI * 0.92;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-ang);
    ctx.fillStyle = t.alive ? '#2f3326' : '#1c1a18';
    ctx.fillRect(-0.8 * S, -0.75 * S, 6.4 * S, 0.45 * S);
    ctx.fillRect(-0.8 * S, 0.3 * S, 6.4 * S, 0.45 * S);
    if (t.firing && Math.random() < 0.7) {
      ctx.globalCompositeOperation = 'lighter';
      const r = (2 + Math.random() * 1.5) * S;
      ctx.drawImage(SOFT.warm, 5.8 * S - r, -r, r * 2, r * 2);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  // Missiles still on the SAM's rails, pointing up toward the approach (left).
  drawSamMissiles(ctx, v, t) {
    const S = v.S;
    const base = { x: t.x + 0.5, y: 3.6 };
    const len = 5.5, thick = 0.5;
    const ang = Math.PI - 0.6;
    for (let i = 0; i < AIR_DEFENCE[t.kind].missiles; i++) {
      const has = i < t.missiles;
      ctx.save();
      ctx.translate(v.sx(base.x + i * 0.9), v.sy(base.y + i * 0.55));
      ctx.rotate(-ang);
      ctx.fillStyle = '#3b3f33'; ctx.fillRect(-0.5 * S, thick * 0.6 * S, (len + 0.6) * S, 0.22 * S);
      if (has) {
        ctx.fillStyle = '#d6d8d0'; ctx.fillRect(0, -thick / 2 * S, len * S, thick * S);
        ctx.fillStyle = '#b02a1f'; ctx.fillRect((len - 0.5) * S, -thick / 2 * S, 0.5 * S, thick * S);
        ctx.fillStyle = '#7f817a'; ctx.fillRect(0, -thick * S, 0.6 * S, thick * 2 * S);
      }
      ctx.restore();
    }
  }

  // Tracers, enemy missiles, flares and chaff.
  drawCombat(ctx, v, flight) {
    const cb = flight.cb;
    const S = v.S;
    const F = COMBAT_FX;
    const lw = Math.max(F.tracerMinPx, 0.22 * S);
    // Tracers: a coloured streak with a hot core (solid colours: additive blending
    // washes them out to white against a bright sky).
    ctx.lineCap = 'round';
    const streaks = (list, col, core) => {
      for (const [c, w] of [[col, lw * 1.8], [core, lw * 0.8]]) {
        ctx.strokeStyle = c; ctx.lineWidth = w;
        ctx.beginPath();
        for (const r of list) {
          if (!r.tracer) continue;
          const x = v.sx(r.x), y = v.sy(r.y);
          if (x < -200 || x > v.W + 200 || y < -200 || y > v.H + 200) continue;
          ctx.moveTo(x, y); ctx.lineTo(v.sx(r.x - r.vx * F.tracerS), v.sy(r.y - r.vy * F.tracerS));
        }
        ctx.stroke();
      }
    };
    streaks(cb.rounds, 'rgba(255,190,40,0.9)', 'rgba(255,250,210,1)');
    streaks(cb.shells, 'rgba(235,40,25,0.9)', 'rgba(255,170,120,1)');
    if (flight.df) streaks(flight.df.rounds, 'rgba(255,60,40,0.9)', 'rgba(255,200,170,1)');
    ctx.lineCap = 'butt';
    ctx.globalCompositeOperation = 'lighter';
    for (const d of cb.decoys) {
      const x = v.sx(d.x), y = v.sy(d.y);
      if (d.kind === 'flare') {
        const r = (2.4 + Math.random() * 0.8) * Math.max(S, 3);
        ctx.globalAlpha = 1 - (d.t / d.life) * 0.6;
        ctx.drawImage(SOFT.glow, x - r, y - r, r * 2, r * 2);
        ctx.drawImage(SOFT.warm, x - r * 2, y - r * 2, r * 4, r * 4);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    for (const m of cb.threats) {
      const len = Math.max(F.missileLenM * F.weaponScale * S, F.missileMinW * v.W);
      ctx.save();
      ctx.translate(v.sx(m.x), v.sy(m.y));
      ctx.rotate(-Math.atan2(m.vy, m.vx));
      const t = len * 0.09;
      ctx.fillStyle = '#e4e6e0'; ctx.fillRect(-len / 2, -t, len, t * 2);
      ctx.fillStyle = '#b02a1f'; ctx.fillRect(len / 2 - t * 2.2, -t, t * 2.2, t * 2);
      ctx.fillStyle = '#8d8f88';
      ctx.beginPath(); ctx.moveTo(-len / 2, -t); ctx.lineTo(-len / 2 - t, -t * 3); ctx.lineTo(-len / 2 + t * 2.5, -t); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-len / 2, t); ctx.lineTo(-len / 2 - t, t * 3); ctx.lineTo(-len / 2 + t * 2.5, t); ctx.fill();
      if (m.motor) {
        ctx.globalCompositeOperation = 'lighter';
        const fl = len * (0.5 + 0.15 * Math.sin(this.time * 70));
        ctx.fillStyle = 'rgba(255,200,90,0.95)';
        ctx.beginPath(); ctx.moveTo(-len / 2, -t); ctx.lineTo(-len / 2 - fl, 0); ctx.lineTo(-len / 2, t); ctx.fill();
        ctx.drawImage(SOFT.warm, -len / 2 - len * 0.4, -len * 0.4, len * 0.8, len * 0.8);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
    }
  }

  // Bandit marker: red caret, BANDIT and the range, above the jet (fixed screen size).
  drawBanditMarker(ctx, v, flight, b) {
    const u = Math.max(1, v.H / 720);
    const m = DOGFIGHT_CAM.markerPx * u;
    const x = v.sx(b.x), y = v.sy(b.y) - Math.max(10 * v.S, 0.035 * v.W) - m * 1.2;
    const blink = flight.df.firing && this.time % 0.2 < 0.1;
    ctx.fillStyle = blink ? 'rgba(255,230,120,0.95)' : 'rgba(255,70,55,0.92)';
    ctx.beginPath(); ctx.moveTo(x, y + m); ctx.lineTo(x - m, y - m * 0.2); ctx.lineTo(x + m, y - m * 0.2); ctx.closePath(); ctx.fill();
    ctx.font = `700 ${Math.round(12 * u)}px "Chakra Petch"`; ctx.textAlign = 'center';
    const a = flight.ac;
    const r = Math.hypot(b.x - a.pos.x, b.y - a.pos.y);
    ctx.fillText(`${flight.df.opp.name.toUpperCase()} ${r < 1000 ? Math.round(r) + ' M' : (r / 1000).toFixed(1) + ' KM'}`, x, y - m * 0.6);
  }

  // Muzzle flash at the gun port while firing (yours or the bandit's).
  drawMuzzleAt(ctx, v, d, st) {
    const g = d.gun;
    if (!g) return;
    const lx = (g.port[0] - d.pivot[0]) * d.texM, ly = -(g.port[1] - d.pivot[1]) * d.texM;
    const c = Math.cos(st.pitch), s = Math.sin(st.pitch);
    const x = v.sx(st.x + lx * c - ly * s), y = v.sy(st.y + lx * s + ly * c);
    const r = Math.max(10, 1.6 * v.S) * (0.7 + Math.random() * 0.6);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(SOFT.warm, x - r, y - r, r * 2, r * 2);
    ctx.drawImage(SOFT.glow, x - r * 0.4, y - r * 0.4, r * 0.8, r * 0.8);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Red arrows at the screen edge pointing at missiles chasing the jet, with range.
  drawThreatArrows(ctx, v, flight) {
    const inc = flight.cb.incoming();
    if (!inc.length) return;
    const u = Math.max(1, v.H / 720);
    const m0 = COMBAT_FX.arrowMarginPx * u;
    const a = flight.ac;
    const blink = this.time % 0.3 < 0.2;
    for (const m of inc) {
      const x = v.sx(m.x), y = v.sy(m.y);
      if (x > m0 && x < v.W - m0 && y > m0 && y < v.H - m0) continue;
      const cx = v.W / 2, cy = v.H / 2;
      const ang = Math.atan2(y - cy, x - cx);
      const k = Math.min((v.W / 2 - m0) / Math.max(Math.abs(Math.cos(ang)), 1e-3), (v.H / 2 - m0) / Math.max(Math.abs(Math.sin(ang)), 1e-3));
      const ax = cx + Math.cos(ang) * k, ay = cy + Math.sin(ang) * k;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.fillStyle = blink ? 'rgba(255,60,50,0.95)' : 'rgba(255,60,50,0.55)';
      ctx.beginPath(); ctx.moveTo(14 * u, 0); ctx.lineTo(-8 * u, -10 * u); ctx.lineTo(-4 * u, 0); ctx.lineTo(-8 * u, 10 * u); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,90,80,0.95)'; ctx.font = `700 ${Math.round(12 * u)}px "Chakra Petch"`; ctx.textAlign = 'center';
      const dist = Math.hypot(m.x - a.pos.x, m.y - a.pos.y);
      ctx.fillText(`SAM ${(dist / 1000).toFixed(1)}`, ax - Math.cos(ang) * 26 * u, ay - Math.sin(ang) * 22 * u + 4 * u);
    }
  }

  // --- aiming aids in the world ---
  drawAids(ctx, v, flight, st) {
    if (flight.mode !== 'strike' || flight.state === 'done') return;
    const S = v.S;
    // Ground impact marker: a sighting aid for guided bombs only (as in Godot: the
    // Mirage's unguided bombs get just the release cue; the HARM gets the LOCK box).
    const imp = flight.data.bombGuided ? flight.bombImpact() : null;
    if (imp) {
      const col = imp.onTarget ? 'rgba(255,77,51,0.95)' : 'rgba(115,255,115,0.9)';
      const x = v.sx(imp.x), y = v.groundY;
      const u = Math.max(1, v.H / 360);
      ctx.fillStyle = imp.onTarget ? 'rgba(255,77,51,0.35)' : 'rgba(115,255,115,0.35)';
      ctx.strokeStyle = col; ctx.lineWidth = 1.5 * u;
      ctx.beginPath(); ctx.moveTo(x, y - 7 * u); ctx.lineTo(x + 6 * u, y); ctx.lineTo(x, y + 7 * u); ctx.lineTo(x - 6 * u, y); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = col;
      for (let k = 0; k < 6; k++) {
        ctx.globalAlpha = 0.8 - k * 0.12;
        ctx.fillRect(x - 0.5 * u, y - (12 + k * 6) * u - 3 * u, u, 3 * u);
      }
      ctx.globalAlpha = 1;
    }
    // Gun pipper: where rounds fired now would hit the ground (they keep the jet's
    // velocity and follow real ballistics), shown within 3 s of flight.
    const gi = flight.cb.gunImpact();
    if (gi && gi.rangeM < 2500) {
      const u = Math.max(1, v.H / 360);
      const x = v.sx(gi.x), y = v.groundY;
      ctx.strokeStyle = flight.cb.firing ? 'rgba(255,240,160,0.95)' : 'rgba(150,255,170,0.85)';
      ctx.lineWidth = 1.2 * u;
      ctx.beginPath(); ctx.arc(x, y - 6 * u, 5 * u, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(x - 0.6 * u, y - 6.6 * u, 1.2 * u, 1.2 * u);
      ctx.font = `600 ${Math.round(5 * u)}px "Chakra Petch"`; ctx.textAlign = 'center';
      ctx.fillText(`${(gi.rangeM / 1000).toFixed(1)}`, x, y - 13 * u);
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
  drawAircraft(ctx, v, d, s, tint = null) {
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
    const light = tint ? this.lightBody.map((l, i) => l * tint[i]) : this.lightBody;
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
    // Canards (J-10C): leading edge up for nose-up stick, i.e. the opposite way to a tailplane.
    if (d.canardSprite && images[d.canardSprite]) {
      const h = d.canardHinge;
      ctx.save();
      ctx.translate(h[0], h[1]);
      ctx.rotate(d.canardMaxDeg * Math.PI / 180 * s.elevator); // owner 2026-11-20: against the pitch key
      ctx.drawImage(tinted(images[d.canardSprite], light), -h[0], -h[1]);
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
    // White anti-collision strobe on top of the tail (owner): two quick flashes, pause.
    const ph = t % STROBE.periodS;
    if (STROBE.flashes.some((f) => ph >= f && ph < f + STROBE.flashS)) dot(SOFT.white, L.beacon, 56);
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
        // Rocket (HARM): long flame. Turbojet (Ra'ad): small exhaust glow (missile.flame).
        const fl = flight.data.missile.flame ?? 1;
        ctx.globalCompositeOperation = 'lighter';
        const l = img.height * 2.2 * fl * (0.85 + 0.15 * Math.sin(this.time * 60));
        ctx.fillStyle = 'rgba(255,160,50,0.9)';
        ctx.beginPath(); ctx.moveTo(-img.width / 2, -img.height * 0.25); ctx.lineTo(-img.width / 2 - l, 0); ctx.lineTo(-img.width / 2, img.height * 0.25); ctx.fill();
        ctx.drawImage(SOFT.warm, -img.width / 2 - 30 * fl, -30 * fl, 60 * fl, 60 * fl);
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
      else if (e.type === 'roundHit') this.sparks(e.x, e.y, e.hard ? 5 : 3, e.hard);
      else if (e.type === 'roundGround') {
        if (Math.random() < 0.6) this.particles.spawn('dust', e.x, 0.3, (Math.random() - 0.5) * 6, 3 + Math.random() * 4, 1.6 + Math.random(), 0.9 + Math.random() * 0.6, { grow: 2.2, alpha: 0.6, drag: 1.5 });
      } else if (e.type === 'acHit') {
        this.sparks(e.x, e.y, 4, true);
        // Small bits off whichever jet took the round (owner 2026-11-21: only while being hit).
        const df = flight.df;
        const hitB = e.bandit && df && df.b;
        if (Math.random() < DEBRIS.hitChance && (hitB || !flight.ac.crashed)) {
          const n = DEBRIS.hitChips[0] + Math.floor(Math.random() * (DEBRIS.hitChips[1] - DEBRIS.hitChips[0] + 1));
          this.chips(hitB ? df.opp : flight.data, hitB ? df.b : flight.ac, n, 1, { x: e.x, y: e.y });
        }
      }
      else if (e.type === 'flakPuff') this.particles.spawn('dark', e.x, e.y, 0, 0, 3, 2.5, { grow: 2.5, alpha: 0.7, drag: 1, ground: false });
      else if (e.type === 'airBurst') this.airBurst(e.x, e.y, e.power);
      else if (e.type === 'samLaunch') {
        this.puffs(e.x, e.y + 1, 10, 'smoke', 3);
        this.particles.spawn('glow', e.x, e.y + 1, 0, 0, 10, 0.3, { grow: 1.5, ground: false });
      } else if (e.type === 'countermeasure') {
        for (let i = 0; i < 14; i++) this.particles.spawn('white', e.x + (Math.random() - 0.5) * 4, e.y + (Math.random() - 0.5) * 4, flight.ac.vel.x * 0.2 + (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, 1.2, 3 + Math.random() * 2, { grow: 3, alpha: 0.35, drag: 2.5, ground: false });
      } else if (e.type === 'banditDown' && flight.df) this.chips(flight.df.opp, { pos: { x: e.x, y: e.y }, vel: { x: e.vx, y: e.vy }, pitch: e.pitch }, DEBRIS.onKill, 1);
      else if (e.type === 'banditWreck') { this.wrecks.push({ x: e.x, t: 0 }); this.explode(e.x, 1, 1.3); }
      else if (e.type === 'shotDown') this.cam.shake = Math.min(1.2, this.cam.shake + 0.8);
    }
  }

  // Hits: short bright sparks (hard = metal on armour / airframe).
  sparks(x, y, n, hard) {
    const P = this.particles;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 10 + Math.random() * 25;
      P.spawn('spark', x, y, Math.cos(a) * s, Math.sin(a) * s, hard ? 0.9 : 0.6, 0.25 + Math.random() * 0.3, { grow: 0.5, drag: 1, ground: true });
    }
    P.spawn('glow', x, y, 0, 0, hard ? 3 : 2, 0.12, { grow: 1.2, ground: false });
  }

  // Explosion in the air (missile warhead, flak, a jet blown apart): no ground dust.
  airBurst(x, y, power = 1) {
    const P = this.particles;
    this.flash = Math.max(this.flash, 0.25 * power);
    this.cam.shake = Math.min(1.2, this.cam.shake + 0.3 * power);
    P.spawn('glow', x, y, 0, 0, 30 * power, 0.3, { grow: 1.4, ground: false });
    for (let i = 0; i < 18 * power; i++) {
      const a = Math.random() * Math.PI * 2, s = (8 + Math.random() * 22) * power;
      P.spawn('fire', x, y, Math.cos(a) * s, Math.sin(a) * s, (4 + Math.random() * 6) * power, 0.4 + Math.random() * 0.5, { grow: 2, drag: 2.5, ground: false });
    }
    for (let i = 0; i < 14 * power; i++) {
      const a = Math.random() * Math.PI * 2;
      P.spawn('dark', x + Math.cos(a) * 3, y + Math.sin(a) * 3, Math.cos(a) * 6, Math.sin(a) * 6, (5 + Math.random() * 6) * power, 2.5 + Math.random() * 2, { grow: 2.5, drag: 1, alpha: 0.75, ground: false });
    }
    for (let i = 0; i < 20 * power; i++) {
      const a = Math.random() * Math.PI * 2, s = 20 + Math.random() * 50;
      P.spawn('spark', x, y, Math.cos(a) * s, Math.sin(a) * s, 1, 0.6 + Math.random() * 0.6, { grow: 0.5, drag: 0.4 });
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

  // --- crash ---
  // The airframe (body + tailplane + gear) breaks into many small irregular shards
  // (owner: no big "Lego" chunks). Shards keep the aircraft's momentum, land without
  // bouncing and scrape to a stop throwing sparks and dust; each has its own scorch
  // tint, some glow as hot embers, some keep burning or smoking where they stop.
  //  - small crash (severity < CRASH.bigSeverity): debris scrapes forward, dust,
  //    low sparks, thin grey smoke, no fireball.
  //  - big crash: flash, a fireball that rolls forward with the wreck, debris blasted
  //    out, burning pieces across the debris field, thick black smoke.
  crashFx(e, flight) {
    const d = flight.data;
    const big = e.severity >= CRASH.bigSeverity;
    const P = this.particles;
    const x = e.x, y = Math.max(0.5, e.y);
    const vx = e.vx;
    if (big) {
      this.explode(x, y + 1, 1.2 + e.severity * 0.3);
      // Rolling fireball: blobs carried forward with the wreck's momentum.
      for (let i = 0; i < 26; i++) {
        P.spawn('fire', x + (Math.random() - 0.5) * 10, y + 1 + Math.random() * 4, vx * (0.25 + Math.random() * 0.35), 2 + Math.random() * 6,
          8 + Math.random() * 10, 0.7 + Math.random() * 0.9, { grow: 2.2, drag: 1.2, lift: 5 });
      }
    } else {
      this.cam.shake = Math.max(this.cam.shake, 0.6);
      for (let i = 0; i < 36; i++) {
        P.spawn('dust', x + (Math.random() - 0.5) * 12, 0.6, vx * (0.15 + Math.random() * 0.3) + (Math.random() - 0.5) * 6, 1 + Math.random() * 3,
          5 + Math.random() * 7, 1.8 + Math.random() * 2, { grow: 2.6, alpha: 0.7, drag: 1.2 });
      }
    }
    // Sparks: low and forward when scraping, everywhere when it blows up.
    for (let i = 0; i < (big ? 50 : 28); i++) {
      const a = Math.random() * Math.PI;
      const sp = big ? 20 + Math.random() * 50 : 8 + Math.random() * 22;
      P.spawn('spark', x, y, big ? Math.cos(a) * sp + vx * 0.3 : Math.abs(vx) * 0.5 + Math.random() * sp, big ? Math.sin(a) * sp : Math.random() * sp * 0.4,
        big ? 1.1 : 0.8, 0.5 + Math.random() * 0.9, { grow: 0.4, drag: 0.6 });
    }
    this.makeShards(d, e, big, flight.ac);
    this.burnX = big ? x : null; this.burnT = 0;
  }

  // Whole airframe as one texture: gear (if down), body, tailplane.
  wreckTexture(d, ac) {
    const body = images[d.sprite];
    const L = this.lightBody;
    const gear = d.gearSprite && ac.gearPos > 0.5 ? images[d.gearSprite] : null;
    const W = Math.max(body.width, gear ? gear.width : 0);
    const H = Math.max(body.height, gear ? gear.height : 0);
    const c = makeCanvas(W, H);
    const x = c.getContext('2d', { willReadFrequently: true });
    if (gear) x.drawImage(tinted(gear, L), 0, 0);
    x.drawImage(tinted(body, L), 0, 0);
    if (d.elevatorSprite && images[d.elevatorSprite]) x.drawImage(tinted(images[d.elevatorSprite], L), 0, 0);
    if (d.canardSprite && images[d.canardSprite]) x.drawImage(tinted(images[d.canardSprite], L), 0, 0);
    return c;
  }

  // Structural breakup (owner: not "glass", not "Lego"): a few big sections along the
  // fuselage (nose, centre, tail...) that keep most of the airframe recognisable, plus
  // smaller debris torn off the edges, wingtips, fin and gear. Pieces are a weighted
  // Voronoi split of the painted pixels with per-seed noise, so the tears are jagged;
  // pixels along a tear are charred.
  makeShards(d, e, big, ac) {
    if (!images[d.sprite]) return;
    const src = this.wreckTexture(d, ac);
    const W = src.width, H = src.height;
    const data = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const solid = (i) => data[i * 4 + 3] > 40;
    // Painted span and the fuselage line (middle of each painted column).
    let x0 = W, x1 = 0;
    const colMid = new Float32Array(W).fill(-1);
    for (let x = 0; x < W; x++) {
      let a = -1, b = -1;
      for (let y = 0; y < H; y++) if (solid(y * W + x)) { if (a < 0) a = y; b = y; }
      if (a >= 0) { colMid[x] = (a + b) / 2; x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    }
    if (x1 <= x0) return;
    const r = Math.random;
    const span = x1 - x0;
    const seeds = [];
    const nBig = big ? CRASH.sectionsBig : CRASH.sectionsSmall;
    for (let i = 0; i < nBig; i++) {
      const sx = Math.round(x0 + (span * (i + 0.5 + (r() - 0.5) * 0.45)) / nBig);
      const my = colMid[Math.min(x1, Math.max(x0, sx))];
      seeds.push({ x: sx, y: my < 0 ? H / 2 : my, w: (span / nBig) * CRASH.sectionReach });
    }
    const nSmall = big ? CRASH.debrisBig : CRASH.debrisSmall;
    for (let tries = 0, n = 0; n < nSmall && tries < nSmall * 40; tries++) {
      const px = Math.floor(r() * W), py = Math.floor(r() * H);
      if (!solid(py * W + px)) continue;
      seeds.push({ x: px, y: py, w: 5 + r() * 14 });
      n++;
    }
    // Per-seed value noise (coarse grid, bilinear): jagged, torn borders.
    const G = 7, gw = Math.ceil(W / G) + 2, gh = Math.ceil(H / G) + 2;
    const grids = seeds.map(() => { const g = new Float32Array(gw * gh); for (let i = 0; i < g.length; i++) g[i] = (r() - 0.5) * 2 * CRASH.tearPx; return g; });
    const noise = (g, x, y) => {
      const fx = x / G, fy = y / G, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], q = g[(iy + 1) * gw + ix + 1];
      return (a + (b - a) * tx) * (1 - ty) + (c + (q - c) * tx) * ty;
    };
    const label = new Int16Array(W * H).fill(-1);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!solid(i)) continue;
      let best = 0, bd = Infinity;
      for (let s = 0; s < seeds.length; s++) {
        const sd = seeds[s];
        const dd = Math.hypot(x - sd.x, y - sd.y) - sd.w + noise(grids[s], x, y);
        if (dd < bd) { bd = dd; best = s; }
      }
      label[i] = best;
    }
    // Pixels per piece, bounding boxes, centroids.
    const n = seeds.length;
    const cnt = new Int32Array(n), sx = new Float64Array(n), sy = new Float64Array(n);
    const bx0 = new Int32Array(n).fill(W), by0 = new Int32Array(n).fill(H), bx1 = new Int32Array(n).fill(-1), by1 = new Int32Array(n).fill(-1);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const l = label[y * W + x];
      if (l < 0) continue;
      cnt[l]++; sx[l] += x; sy[l] += y;
      if (x < bx0[l]) bx0[l] = x; if (x > bx1[l]) bx1[l] = x; if (y < by0[l]) by0[l] = y; if (y > by1[l]) by1[l] = y;
    }
    let maxA = 1;
    for (let l = 0; l < n; l++) maxA = Math.max(maxA, cnt[l]);
    // Torn edges are charred: darker the closer to another piece.
    const edge = (x, y, l) => {
      for (let k = 1; k <= 2; k++) {
        for (const [ox, oy] of [[k, 0], [-k, 0], [0, k], [0, -k]]) {
          const X = x + ox, Y = y + oy;
          if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          const m = label[Y * W + X];
          if (m >= 0 && m !== l) return k === 1 ? 0.6 : 0.3;
        }
      }
      return 0;
    };
    const cosP = Math.cos(e.pitch), sinP = Math.sin(e.pitch);
    const mx = (x0 + x1) / 2, my = colMid[Math.round(mx)] > 0 ? colMid[Math.round(mx)] : H / 2;
    const power = big ? CRASH.blastMs * (0.6 + e.severity) : 0;
    const bodyW = images[d.sprite].width;
    const order = [...Array(n).keys()].filter((l) => cnt[l] >= 6).sort((a, b) => cnt[b] - cnt[a]);
    order.forEach((l, rank) => {
      const w = bx1[l] - bx0[l] + 1, h = by1[l] - by0[l] + 1;
      const cv = makeCanvas(w, h);
      const g = cv.getContext('2d');
      const out = g.createImageData(w, h);
      const scorch = big ? 0.2 + r() * 0.35 : 0.05 + r() * 0.2;
      for (let y = by0[l]; y <= by1[l]; y++) for (let x = bx0[l]; x <= bx1[l]; x++) {
        if (label[y * W + x] !== l) continue;
        const si = (y * W + x) * 4, oi = ((y - by0[l]) * w + (x - bx0[l])) * 4;
        const k = (1 - scorch) * (1 - edge(x, y, l));
        out.data[oi] = data[si] * k + 18 * (1 - k);
        out.data[oi + 1] = data[si + 1] * k + 12 * (1 - k);
        out.data[oi + 2] = data[si + 2] * k + 8 * (1 - k);
        out.data[oi + 3] = data[si + 3];
      }
      g.putImageData(out, 0, 0);
      const cx = sx[l] / cnt[l], cy = sy[l] / cnt[l];
      // World position of the piece's centre (aircraft frame -> world).
      const lx = (cx - d.pivot[0]) * d.texM, ly = -(cy - d.pivot[1]) * d.texM;
      const wx = e.x + lx * cosP - ly * sinP, wy = Math.max(0.15, e.y + lx * sinP + ly * cosP);
      const m = Math.sqrt(cnt[l] / maxA); // 1 = biggest section, ~0 = small bit
      let vx, vy, spin;
      if (big) {
        const dx = cx - mx, dy = -(cy - my);
        const dl = Math.hypot(dx, dy) || 1;
        const sp = power * (0.3 + r() * 0.7) * (1.2 - m);
        vx = e.vx * (0.2 + 0.3 * m + r() * 0.1) + (dx / dl) * sp;
        vy = Math.abs(dy / dl) * sp * 0.45 + 0.5 + r() * sp * 0.3;
        spin = (r() - 0.5) * (12 * (1 - m) + 1);
      } else {
        // Breaking up while scraping along: sections carry on, bits scatter a little.
        vx = e.vx * (0.5 + 0.35 * m + r() * 0.1) + (r() - 0.5) * 4 * (1 - m);
        vy = 0.2 + r() * 2.2 * (1 - m);
        spin = (r() - 0.5) * (6 * (1 - m) + 0.4);
      }
      this.shards.push({
        cv, ox: cx - bx0[l], oy: cy - by0[l], x: wx, y: wy, vx, vy,
        rot: -e.pitch, spin, texM: d.texM, bodyW,
        mu: CRASH.friction * (0.6 + 1.6 * r() * r()), rest: false,
        heat: m < 0.5 && r() < (big ? CRASH.hotBig : CRASH.hotSmall) ? 0.5 + r() * 0.4 : 0,
        // The main wreck always burns; big crash: the biggest sections and some bits too.
        fire: rank === 0 || (big && (rank < 3 || r() < CRASH.burningBig)) || (!big && r() < CRASH.burningSmall),
        smoke: rank < 3 || r() < (big ? 0.25 : 0.12),
        firePow: 0.8 + 2.2 * m, t: 0,
      });
    });
  }

  updateShards(dt) {
    for (const s of this.shards) this.stepShard(s, dt);
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const s = this.debris[i];
      if (s.air && !s.landed) { s.vx *= Math.exp(-DEBRIS.airDrag * dt); s.vy *= Math.exp(-DEBRIS.airDrag * 0.5 * dt); }
      this.stepShard(s, dt);
      if (s.t > DEBRIS.lifeS) this.debris.splice(i, 1);
    }
  }

  stepShard(s, dt) {
    const P = this.particles;
    {
      s.t += dt;
      s.heat = Math.max(0, s.heat - dt / CRASH.emberCoolS);
      if (!s.rest) {
        if (s.y > 0.15) {
          s.vy -= 9.81 * dt;
          s.vx *= Math.exp(-0.15 * dt);
        }
        s.x += s.vx * dt; s.y += s.vy * dt;
        s.rot += s.spin * dt;
        if (s.y <= 0.15) {
          // Land and slide: no bounce, friction slows it, spin dies quickly. The first
          // contact digs in and takes a share of the speed (keeps the debris field compact).
          if (!s.landed) { s.landed = true; s.vx *= CRASH.landKeep; }
          s.y = 0.15; s.vy = 0;
          const dv = s.mu * 9.81 * dt;
          s.vx = Math.abs(s.vx) <= dv ? 0 : s.vx - Math.sign(s.vx) * dv;
          s.spin *= Math.exp(-dt * 6);
          const sp = Math.abs(s.vx);
          if (sp > 6 && Math.random() < dt * 10) P.spawn('spark', s.x, 0.3, s.vx * 0.4 + (Math.random() - 0.5) * 4, 1 + Math.random() * 3, 0.7, 0.3 + Math.random() * 0.3, { grow: 0.3, drag: 1 });
          if (sp > 2 && Math.random() < dt * 6) P.spawn('dust', s.x, 0.4, s.vx * 0.2, 0.8, 2.5, 1.2, { grow: 2.2, alpha: 0.45 });
          if (sp === 0 && Math.abs(s.spin) < 0.05) s.rest = true;
        }
      }
      // Burning pieces: flames and black smoke for a while; smoking pieces: grey wisps.
      if (s.fire && s.t < CRASH.burnS) {
        const k = 1 - s.t / CRASH.burnS;
        const fp = s.firePow || 1;
        if (Math.random() < dt * 9 * fp * k) P.spawn('fire', s.x + (Math.random() - 0.5) * fp, s.y + 0.3, 0, 1.5, (1.4 + Math.random() * 1.6) * fp, 0.5 + Math.random() * 0.5, { lift: 4, alpha: 0.9, ground: false });
        if (Math.random() < dt * 5 * fp * k) P.spawn('dark', s.x, s.y + 1, 0.8, 2.5, 2.2 * fp, 4 + Math.random() * 2, { grow: 4, lift: 3, alpha: 0.55 });
      } else if (s.smoke && s.t < CRASH.burnS * 0.6 && Math.random() < dt * 2) {
        P.spawn('smoke', s.x, s.y + 0.5, 0.4, 1.5, 1.5, 2.5, { grow: 3, lift: 1.5, alpha: 0.35 });
      }
    }
  }

  drawShards(ctx, v, list = this.shards) {
    for (const s of list) {
      // Same scale the aircraft was drawn at (it never shrinks below a minimum on screen).
      const k = Math.max(v.S * s.texM, (0.07 * v.W) / s.bodyW);
      const x = v.sx(s.x), y = v.sy(s.y);
      if (x < -60 || x > v.W + 60 || y < -60 || y > v.H + 60) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(s.rot);
      ctx.scale(k, k);
      ctx.drawImage(s.cv, -s.ox, -s.oy);
      ctx.restore();
      if (s.heat > 0.02) {
        // Hot ember glow.
        const r = Math.max(3, s.cv.width * k * 0.6);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = s.heat * 0.5;
        ctx.drawImage(SOFT.warm, x - r, y - r, r * 2, r * 2);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
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

  // Battle-damage smoke (owner 2026-11-21): a couple of hits = a thin grey wisp; it
  // grows thicker and blacker with the damage; heavy damage or falling: dense black
  // smoke and fire. dmg: 0 intact .. 1 destroyed. Numbers: DAMAGE_SMOKE.
  damageSmoke(ac, d, dmg, dt, falling) {
    const Z = DAMAGE_SMOKE;
    if (dmg < Z.fromDamage) return;
    const P = this.particles;
    const k = Math.min(1, (dmg - Z.fromDamage) / (1 - Z.fromDamage));
    const rate = Z.ratePerS[0] + (Z.ratePerS[1] - Z.ratePerS[0]) * k;
    const size = Z.size[0] + (Z.size[1] - Z.size[0]) * k;
    let n = rate * dt;
    // Past solidFrom: enough puffs for an unbroken trail at any speed (spacing x size apart).
    if (k > Z.solidFrom) n = Math.max(n, (ac.speed * dt) / (size * Z.spacing));
    const p = ac.pointM(d.pivot[0] - 20, d.pivot[1] - 40);
    const black = k > Z.blackFrom;
    for (let i = 0; n > 0; i++, n -= 1) {
      if (n < 1 && Math.random() > n) break;
      const f = Math.random();
      P.spawn(black ? 'dark' : 'smoke', p.x - ac.vel.x * dt * f, p.y - ac.vel.y * dt * f, ac.vel.x * 0.1, 1,
        size, Z.life[0] + (Z.life[1] - Z.life[0]) * k,
        { grow: 3, alpha: Z.alpha[0] + (Z.alpha[1] - Z.alpha[0]) * k, ground: false, drag: 0.4 });
    }
    if ((falling || k > Z.fireFrom) && Math.random() < (falling ? 0.7 : 0.35)) P.spawn('fire', p.x, p.y, ac.vel.x * 0.3, 0, 3.5, 0.35, { grow: 1.6, alpha: 0.9, ground: false });
  }

  // Pieces torn off a jet in the air (owner 2026-11-21: a bandit going down sheds bits):
  // jagged chips cut from its sprite, charred at the edge, flung off and falling.
  // at: a round's hit point (m) -> small bits cut from the sprite near it, flung from there.
  chips(d, ac, n, power = 1, at = null) {
    const img = images[d.sprite];
    if (!img) return;
    const r = Math.random;
    const L = this.lightBody;
    const src = tinted(img, L);
    const size = at ? DEBRIS.hitChipPx : DEBRIS.chipPx;
    const cosP = Math.cos(ac.pitch), sinP = Math.sin(ac.pitch);
    let hx = 0, hy = 0;
    if (at) {
      // Hit point in texture px (the hit circle is bigger than the jet: clamp onto the body).
      const wx = at.x - ac.pos.x, wy = at.y - ac.pos.y;
      const lx = wx * cosP + wy * sinP, ly = -wx * sinP + wy * cosP;
      hx = Math.min(img.width * 0.9, Math.max(img.width * 0.1, d.pivot[0] + lx / d.texM));
      hy = Math.min(img.height * 0.75, Math.max(img.height * 0.3, d.pivot[1] - ly / d.texM));
    }
    for (let i = 0; i < n; i++) {
      const rad = size[0] + r() * (size[1] - size[0]);
      const cx = at ? hx + (r() - 0.5) * 30 : img.width * (0.15 + r() * 0.7);
      const cy = at ? hy + (r() - 0.5) * 12 : img.height * (0.3 + r() * 0.45);
      const cv = makeCanvas(rad * 2 + 2, rad * 2 + 2);
      const g = cv.getContext('2d');
      g.beginPath();
      const pts = 7 + Math.floor(r() * 4);
      for (let k = 0; k < pts; k++) {
        const a = (k / pts) * Math.PI * 2, rr = rad * (0.45 + r() * 0.55);
        const px = rad + 1 + Math.cos(a) * rr, py = rad + 1 + Math.sin(a) * rr;
        if (k) g.lineTo(px, py); else g.moveTo(px, py);
      }
      g.closePath();
      g.save(); g.clip();
      g.drawImage(src, cx - rad - 1, cy - rad - 1, rad * 2 + 2, rad * 2 + 2, 0, 0, rad * 2 + 2, rad * 2 + 2);
      g.restore();
      g.globalCompositeOperation = 'source-atop';
      g.strokeStyle = 'rgba(25,18,12,0.85)'; g.lineWidth = 3; g.stroke();
      // Empty (transparent) chips aren't worth keeping.
      const lx = (cx - d.pivot[0]) * d.texM, ly = -(cy - d.pivot[1]) * d.texM;
      const sp = (at ? DEBRIS.hitFlingMs : DEBRIS.flingMs) * power * (0.4 + r() * 0.8);
      const ang = r() * Math.PI * 2;
      this.debris.push({
        cv, ox: rad + 1, oy: rad + 1,
        x: ac.pos.x + lx * cosP - ly * sinP, y: Math.max(1, ac.pos.y + lx * sinP + ly * cosP),
        vx: ac.vel.x * (0.55 + r() * 0.3) + Math.cos(ang) * sp, vy: ac.vel.y * 0.5 + Math.sin(ang) * sp,
        rot: -ac.pitch, spin: (r() - 0.5) * 14, texM: d.texM, bodyW: img.width,
        mu: 0.6, rest: false, heat: r() < 0.5 ? 0.6 : 0, fire: false, smoke: r() < 0.5, firePow: 0.5, t: 0, air: true,
      });
    }
    if (this.debris.length > DEBRIS.max) this.debris.splice(0, this.debris.length - DEBRIS.max);
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
      // Smoky engines (data: engineSmoke): Mirage grey when not in afterburner, JF-17 a thin black trail.
      const es = d.engineSmoke;
      if (es && d.nozzle && a.rpm > 0.5 && a.throttle > es.minThrottle && !(es.dryOnly && a.afterburner > 0)) {
        const p = a.pointM(d.nozzle[0], d.nozzle[1]);
        for (let i = 0; i < es.perFrame; i++) {
          if (Math.random() > es.chance) continue;
          const f = i / es.perFrame;
          P.spawn(es.kind, p.x - a.vel.x * dt * f, p.y - a.vel.y * dt * f, a.vel.x * 0.1, 0, es.size, es.life, { grow: es.grow, alpha: es.alpha, ground: false, drag: 0.3 });
        }
      }
      if (a.onGround && a.braking && a.speedKt > 30 && Math.random() < 0.3) P.spawn('smoke', a.pos.x, 0.3, -2, 0.5, 1.5, 0.8, { grow: 2, alpha: 0.3 });
      if (d.hasPropeller && a.onGround && a.rpm > 0.8 && a.throttle > 0.6 && Math.random() < 0.3) P.spawn('dust', a.pos.x - 6, 0.3, -12, 0.5, 2, 1, { grow: 2, alpha: 0.35 });
    }
    for (const w of flight.weapons) {
      if (w.motor) P.spawn('smoke', w.pos.x, w.pos.y, w.vel.x * 0.05, 0, 1.2, 2.5, { grow: 4, alpha: 0.55 * (d.missile.trail ?? 1), ground: false, drag: 0.3 });
    }
    // Bandits: smoke when badly hit, fire while falling; wrecks burn on the ground.
    const df = flight.df;
    if (df) {
      if (df.b) this.damageSmoke(df.b, df.opp, df.damage, dt, false);
      for (const w of df.falling) {
        this.damageSmoke(w.ac, df.opp, 1, dt, true);
        if (Math.random() < dt * DEBRIS.fallingChipsPerS) this.chips(df.opp, w.ac, 1, 0.5);
      }
      for (const w of this.wrecks) {
        if ((w.t += dt) > 40 || Math.random() > dt * 12) continue;
        P.spawn('dark', w.x + (Math.random() - 0.5) * 10, 1, 1, 4, 5, 4, { grow: 3.5, lift: 3, alpha: 0.6 });
        if (Math.random() < 0.5) P.spawn('fire', w.x + (Math.random() - 0.5) * 8, 0.5, 0, 2, 3.5, 0.6, { lift: 4 });
      }
    }
    if (flight.armed) {
      const cb = flight.cb;
      // Enemy missiles: thick white smoke while the motor burns, thin after.
      for (const m of cb.threats) {
        const n = m.motor ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const f = Math.random();
          P.spawn('smoke', m.x - m.vx * dt * f, m.y - m.vy * dt * f, 0, 0.5, m.motor ? 3.5 : 2, m.motor ? 4 : 2, { grow: 3, alpha: m.motor ? 0.6 : 0.25, ground: false, drag: 0.5 });
        }
      }
      for (const dc of cb.decoys) {
        if (dc.kind === 'flare' && Math.random() < 0.8) P.spawn('smoke', dc.x, dc.y, 0, 0.5, 2.5, 1.8, { grow: 3, alpha: 0.4, ground: false, drag: 0.6 });
      }
      // Battle damage on your jet: smoke that grows with the damage, then fire.
      if (!a.crashed) this.damageSmoke(a, d, a.shotDown ? 1 : 1 - cb.hp / d.airframeHp, dt, a.shotDown);
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
