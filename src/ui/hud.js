// In-flight display: HTML over the game canvas.
import { KT } from '../sim/aircraft.js';
import { KEY_HELP } from '../input.js';
import { Cockpit } from './cockpit.js';
import { TouchControls } from './touch.js';
import { drawBombSight, ReleaseCue } from './weapon_aids.js';
import { REFUEL } from '../data/world.js';
import { predictImpact } from '../sim/flight.js';

const $ = (sel, root = document) => root.querySelector(sel);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// Flying name tag: largest name size (px) and the width the name may fill (px).
const NAMETAG_FONT_PX = 20;
const NAMETAG_TEXT_W = 148;
// Touch EJECT button: second tap must come within this many seconds.
const EJECT_ARM_S = 2.5;
// Touch screens: the instructor's line shows this long, then hides (the sight keeps his spot).
const INSTRUCTOR_LIVE_S = 4;
// GUNS cue when the nose is this close to the lead point (air to air).
const GUN_SOLUTION = { rangeM: 900, coneDeg: 1.5 };
// Radar (owner 2026-11-21): while your weapons, SAMs or a bandit are in the air it zooms
// to a window around you (behindM behind, aheadM ahead; air to air: dogfightM each way)
// and draws their trails and where they're going. zoomRate: how fast it switches (1/s).
export const RADAR = { behindM: 800, aheadM: 2500, maxAheadM: 9000, marginM: 500, dogfightM: 2500, minAltM: 300, zoomRate: 3, trailEveryS: 0.08, trailMax: 120 };

const HELMET = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <defs><linearGradient id="hv" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5d7da8"/><stop offset="1" stop-color="#0d1626"/></linearGradient></defs>
  <rect width="64" height="64" rx="12" fill="#1d2a1f"/>
  <path d="M10 62c2-12 10-17 22-17s20 5 22 17z" fill="#3e5a34"/>
  <path d="M14 34c0-14 8-24 18-24s18 10 18 24v6c0 4-3 7-7 7H21c-4 0-7-3-7-7z" fill="#15171a"/>
  <path d="M17 30c1-8 7-13 15-13s14 5 15 13l-2 6H19z" fill="url(#hv)"/>
  <path d="M20 22c3-3 7-4 12-4" stroke="#9fc3ff" stroke-width="2" fill="none" opacity=".6"/>
  <rect x="24" y="40" width="16" height="6" rx="3" fill="#2a2d31"/>
  <g class="mouth"><rect x="28" y="42" width="8" height="2" rx="1" fill="#0a0a0a"/></g>
</svg>`;

export class Hud {
  constructor(root, input) {
    this.root = root;
    this.input = input;
    root.innerHTML = `
      <div class="hud-top">
        <div class="card instructor">
          <div class="avatar">${HELMET}</div>
          <div class="ibody"><div class="iname">INSTRUCTOR</div><div class="itext"></div></div>
        </div>
        <div class="card radar">
          <canvas class="radar-cv"></canvas>
          <div class="radar-foot"><span class="phase">PRE-FLIGHT</span><span class="togo"></span></div>
        </div>
        <div class="rcol">
          <div class="card panel"><canvas class="cockpit-cv"></canvas></div>
          <div class="card weapon"><div class="wname"></div><div class="wstate"></div><div class="wsub"></div><div class="whp"><i></i></div></div>
          <button class="tejectbtn"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V8M6 13l6-6 6 6M5 3h14"/></svg><span>EJECT</span></button>
        </div>
      </div>
      <div class="warnings"></div>
      <div class="callout"></div>
      <div class="taxicue"><b></b><small></small></div>
      <canvas class="cue-cv"></canvas>
      <button class="ejectcue">EJECT<small>PRESS E</small></button>
      <div class="card refuel"><label>FUEL TRUCK</label><div class="rbar"><i></i></div></div>
      <div class="nameplate"><div class="rank"></div><img class="wings" alt="" /><div class="tagname"></div></div>
      <div class="keys"></div>
      <div class="touch"></div>`;
    this.el = {};
    for (const k of ['itext', 'phase', 'togo', 'warnings', 'callout', 'weapon', 'refuel', 'keys', 'touch', 'ejectcue', 'tejectbtn', 'instructor', 'wname', 'wstate', 'wsub'])
      this.el[k] = $(`.${k}`, root);
    this.cockpit = new Cockpit($('.cockpit-cv', root));
    this.cue = new ReleaseCue($('.cue-cv', root));
    this.time = 0;
    this.el.rfill = $('.rbar i', root);
    this.el.whp = $('.whp i', root);
    this.radar = $('.radar-cv', root);
    // Radar CSS size cached (reading it every frame forced a layout: lag).
    this.radarCss = { w: 0, h: 0 };
    new ResizeObserver(() => { this.radarCss = { w: this.radar.clientWidth, h: this.radar.clientHeight }; }).observe(this.radar);
    this.el.radarCard = $('.card.radar', root);
    this.cache = new Map();
    this.msgQueue = [];
    this.msgT = 0;
    this.lastCallout = null;
    this.trail = [];
    this.setupTouch();
  }

  setupTouch() {
    this.touch = new TouchControls(this.el.touch, this.input);
    this.el.ejectcue.addEventListener('pointerdown', (e) => { e.preventDefault(); this.input.press('engine'); });
    // Touch EJECT (under the cockpit panel): two taps while the jet still flies (tap,
    // then TAP AGAIN within EJECT_ARM_S), one tap once shot down.
    const ej = this.el.tejectbtn;
    this.ejectArmedT = -1;
    ej.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const f = this.flight;
      if (f?.ac.shotDown || this.ejectArmedT >= 0) { this.input.press('eject'); this.ejectArmedT = -1; }
      else this.ejectArmedT = 0;
    });
  }

  start(flight, opts) {
    this.flight = flight;
    const d = flight.data;
    // Embroidered name tag: rank top right, wings (crescent colour = rank), name.
    $('.wings', this.root).src = `${import.meta.env.BASE_URL}sprites/paf_pilot_wings_${d.rankBadge}.png`;
    $('.rank', this.root).textContent = d.rank; // abbreviation only (owner 2026-11-21): AVN CDT, FLT LT, SQN LDR, WG CDR
    const tag = $('.tagname', this.root);
    tag.textContent = (opts.name || 'Shaheen').toUpperCase();
    // Long names get smaller thread so they stay on the patch.
    tag.style.fontSize = `${Math.min(NAMETAG_FONT_PX, NAMETAG_TEXT_W / (tag.textContent.length * 0.97))}px`;
    this.cockpit.setAircraft(d);
    this.cue.hide();
    this.cache.clear();
    this.el.weapon.classList.toggle('show', flight.armed);
    this.el.wname.textContent = d.weaponName || '';
    const strike = flight.mode === 'strike';
    this.el.keys.innerHTML = KEY_HELP.filter((k) => !k[2] || (k[2] === 'strike' ? strike : k[2] === 'smoke' ? !!(flight.data.smoke && flight.mode === 'ferry') : flight.armed)).map(([k, t]) => `<span><kbd>${k}</kbd>${t}</span>`).join('');
    this.msgQueue = []; this.msgT = 0; this.trail = [];
    this.el.itext.textContent = '';
    this.el.keys.classList.remove('hide');
    this.root.classList.add('show');
    this.keysHidden = false;
  }

  hide() { this.root.classList.remove('show'); }
  toggleKeys() { this.keysHidden = !this.keysHidden; this.el.keys.classList.toggle('hide', this.keysHidden); }

  set(key, el, val, prop = 'textContent') {
    if (this.cache.get(key) === val) return;
    this.cache.set(key, val);
    if (prop === 'textContent') el.textContent = val;
    else el.style[prop] = val;
  }
  cls(key, el, name, on) {
    const k = `${key}:${name}`;
    if (this.cache.get(k) === on) return;
    this.cache.set(k, on);
    el.classList.toggle(name, on);
  }

  update(dt, sound) {
    const f = this.flight;
    const a = f.ac;
    const d = f.data;
    // Messages: urgent ones jump the queue.
    for (const m of f.messages) {
      if (m.urgent) { this.msgQueue = [m]; this.msgT = 0; this.showMsg(m); }
      else { this.msgQueue.push(m); if (this.msgQueue.length === 1) { this.msgT = 0; this.showMsg(m); } }
    }
    f.messages.length = 0;
    this.msgT += dt;
    this.cls('live', this.el.instructor, 'live', this.msgQueue.length > 0 && this.msgT < INSTRUCTOR_LIVE_S);
    if (this.msgQueue.length > 1 && this.msgT > 3.2) { this.msgQueue.shift(); this.msgT = 0; this.showMsg(this.msgQueue[0]); }

    this.time += dt;
    this.cockpit.cue = this.fireCue(f);
    this.cockpit.draw(a, dt);
    this.cue.update(f, dt);
    this.touch.update(f, dt);

    if (f.df) {
      // Air-to-air card: gun, the bandit (where, how far, his damage), kills, your airframe.
      const df = f.df, cb = f.cb, b = df.b;
      const name = df.opp.name.toUpperCase();
      // Calibre only (owner 2026-11-21): "20 MM CANNON", not the gun's model name.
      const cal = d.gun && /(\d+)\s*MM/i.exec(d.gun.name);
      this.set('wname', this.el.wname, cal ? `${cal[1]} MM CANNON` : 'CANNON');
      const r = df.range;
      const rs = r < 1000 ? `${Math.round(r)} M` : `${(r / 1000).toFixed(1)} KM`;
      const sol = this.gunSolution(f);
      const state = f.revealed ? `RTB · ${f.dest.short}`
        : b ? (df.fleeing ? `${name} LEAVING` : cb.ammo <= 0 ? 'WINCHESTER · NO ROUNDS' : df.dx > 0 ? (sol ? `IN RANGE ${rs} · GUNS` : `${name} AHEAD ${rs}`) : `${name} ON YOUR SIX ${rs}`)
          : df.phase === 'inbound' ? `${df.total} x ${name} AHEAD` : 'NEXT BANDIT INBOUND';
      this.set('wstate', this.el.wstate, state);
      this.cls('wstate', this.el.weapon, 'hot', sol);
      const bd = b ? ` · ${name} DMG ${Math.round(100 - Math.max(0, df.hp) / df.opp.airframeHp * 100)}%` : '';
      this.set('wsub', this.el.wsub, `GUN ${cb.ammo} · KILLS ${df.kills}/${df.total}${bd}`);
      const hp = Math.round(cb.hp);
      this.set('whp', this.el.whp, `${hp}%`, 'width');
      this.cls('whp', this.el.weapon, 'dmg', hp < 60);
      this.cls('whp2', this.el.weapon, 'crit', hp < 30);
    } else if (f.mode === 'strike') {
      this.set('wname', this.el.wname, `${d.weaponName || 'WEAPON'}  x${a.bombsLeft}`);
      let state = 'EMPTY';
      let hot = false;
      if (a.bombsLeft > 0 && d.weaponIsMissile) {
        const ms = f.missileState();
        const t = f.missileTarget();
        state = ms === 'safe' ? 'SAFE · GEAR UP TO ARM'
          : ms === 'seeking' ? 'SEEKING…'
          : ms === 'locked' ? `LOCKED ${(Math.abs(t.x - a.pos.x) / 1000).toFixed(1)} KM · FIRE`
          : 'NO TARGET IN RANGE';
        hot = ms === 'locked';
      } else if (a.bombsLeft > 0) {
        const imp = a.onGround ? null : f.bombImpact();
        if (a.onGround) state = 'ARMED';
        else if (imp && imp.onTarget) { state = d.bombGuided ? 'IN RANGE · FIRE' : 'ON TARGET · FIRE'; hot = true; }
        else state = d.bombGuided ? 'PUT TARGET IN THE BRACKET' : 'WATCH THE RELEASE CUE';
      }
      this.set('wstate', this.el.wstate, state);
      this.cls('wstate', this.el.weapon, 'hot', hot);
      // Gun rounds, flares/chaff, airframe health.
      const cb = f.cb;
      const sub = [d.gun ? `GUN ${cb.ammo}` : null, `FLR/CHF ${cb.cm}`].filter(Boolean).join(' · ');
      this.set('wsub', this.el.wsub, sub);
      const hp = Math.round(cb.hp);
      this.set('whp', this.el.whp, `${hp}%`, 'width');
      this.cls('whp', this.el.weapon, 'dmg', hp < 60);
      this.cls('whp2', this.el.weapon, 'crit', hp < 30);
    }

    // Warnings.
    const w = [];
    if (a.stalled) w.push(['STALL', 'red']);
    if (!a.onGround && a.pos.y < 60 && a.vsFpm < -1500 && !a.crashed) w.push(['PULL UP', 'red']);
    if (a.gearWarning) w.push(['GEAR', 'red']);
    if (a.onGround && a.pitch * 57.3 > d.tailStrikeDeg - 3) w.push(['NOSE HIGH', 'amber']);
    else if (!a.onGround && a.pos.y < 8 && a.pitch * 57.3 > d.tailStrikeDeg - 3 && a.pitch < 1.5) w.push(['NOSE HIGH', 'amber']);
    if (a.lowFuel) w.push([a.fuel <= 0 ? 'NO FUEL' : 'LOW FUEL', 'amber']);
    if (a.speedKt > d.maxSpeedKt * 1.02) w.push(['OVERSPEED', 'amber']);
    if (f.mode === 'strike' && !a.crashed) {
      const inc = f.cb.incoming();
      if (inc.length) w.push(['MISSILE · FLARES X + BREAK', 'red']);
      else if (f.cb.radarLock) w.push(['SAM LOCK', 'amber']);
      if (f.cb.hp < 45 && f.cb.hp > 0) w.push(['ENGINE DAMAGE', 'amber']);
    }
    if (f.df && f.df.fighting && !a.crashed && !a.shotDown) {
      if (f.df.firing && f.df.dx < 0) w.push(['GUNS · BREAK', 'red']);
      else if (f.df.dx < 0 && f.df.range < 900) w.push(['BANDIT SIX', 'amber']);
    }
    const wk = w.map((x) => x.join(':')).join('|');
    if (this.cache.get('warn') !== wk) {
      this.cache.set('warn', wk);
      this.el.warnings.innerHTML = w.map(([t, c]) => `<span class="w ${c}">${t}</span>`).join('');
    }

    // Phase and distance.
    this.set('phase', this.el.phase, f.phase);
    // Taxi prompt (owner 2026-11-21): taxi to the holding point, stop, cleared.
    const tc = f.taxiCue;
    const tq = this.taxiEl || (this.taxiEl = this.root.querySelector('.taxicue'));
    this.set('taxiOn', tq, tc ? 'flex' : 'none', 'display');
    if (tc) {
      this.set('taxiT', tq.firstElementChild, tc.t);
      this.set('taxiS', tq.lastElementChild, tc.s);
      tq.classList.toggle('go', !!tc.go);
    }
    this.cls('eject', this.el.ejectcue, 'show', !!a.shotDown && !f.eject && !a.crashed);
    const canEject = this.touch.on && f.armed && f.state === 'flying' && !a.onGround && !a.crashed && !f.eject;
    this.cls('ejbtn', this.el.tejectbtn, 'show', canEject);
    if (this.ejectArmedT >= 0) { this.ejectArmedT += dt; if (this.ejectArmedT > EJECT_ARM_S || !canEject) this.ejectArmedT = -1; }
    const armed = this.ejectArmedT >= 0;
    this.cls('ejbtn', this.el.tejectbtn, 'armed', armed);
    this.set('ejtxt', this.el.tejectbtn.lastElementChild, armed ? 'TAP AGAIN' : 'EJECT');
    const toGo = f.dest.x - a.pos.x;
    const tgt = f.mode === 'strike' && !f.revealed ? f.targets.find((t) => t.objective && t.alive && t.x > a.pos.x) : null;
    const df = f.df && !f.revealed ? f.df : null;
    const togo = df ? (df.b ? `${df.opp.name.toUpperCase()} ${df.dx > 0 ? 'AHEAD' : 'BEHIND'} · ${(df.range / 1000).toFixed(1)} KM`
      : df.phase === 'inbound' ? `BANDITS ${(Math.max(0, df.fightX - a.pos.x) / 1000).toFixed(1)} KM` : 'NEXT BANDIT INBOUND') : tgt ? `TARGET ${((tgt.x - a.pos.x) / 1000).toFixed(1)} KM` : f.revealed ? `${f.dest.short} ${toGo > 0 ? (toGo / 1000).toFixed(1) + ' KM' : 'BEHIND'}` : 'LANDING BASE: AFTER ATTACK';
    this.set('togo', this.el.togo, togo);

    // Height callouts near the ground.
    if (!a.onGround && a.vsFpm < -100 && f.revealed && toGo < 600 && toGo > -f.dest.runwayM) {
      const ft = a.altFt;
      const marks = [100, 50, 30, 20, 10];
      const m = marks.find((x) => ft <= x && ft > x - 8);
      if (m && this.lastCallout !== m) {
        this.lastCallout = m;
        this.flashCallout(m === 10 ? '10 · FLARE' : String(m));
        sound?.tone(m === 10 ? 880 : 660, 0.08, 0.05);
      }
    } else if (a.onGround) this.lastCallout = null;

    // Refuel bar.
    this.cls('refuel', this.el.refuel, 'show', !!f.refuel);
    if (f.refuel) this.set('rf', this.el.rfill, `${clamp((f.refuel.t - REFUEL.driveS) / REFUEL.pumpS, 0, 1) * 100}%`, 'width');

    if (f.airborneOnce && !this.keysAuto && f.flightTime > 25) { this.keysAuto = true; if (!this.keysHidden) this.toggleKeys(); }
    // Guided weapons: the bomb sight takes the radar's place during the target run, and
    // stays after you fire (owner 2026-11-21; it marks where your weapons will land).
    // Also with a SAM in the air (its arrow and warning are on the screen).
    const sight = f.sightWanted();
    this.cls('radar', this.el.radarCard, 'sight', sight);
    this.sizeRadar();
    if (sight) drawBombSight(this.radar, f, this.time);
    else this.drawRadar(f, dt);
  }

  // Weapon cue lamp in the cockpit panel (took the flap box's place, owner 2026-11-20).
  fireCue(f) {
    const a = f.ac;
    if (a.shotDown) return f.eject || a.crashed ? 'none' : 'eject';
    if (f.df) return !f.data.gun || f.cb.ammo <= 0 ? 'empty' : this.gunSolution(f) ? 'fire' : 'gun';
    if (f.mode !== 'strike') return 'none';
    if (a.bombsLeft > 0) {
      if (f.data.weaponIsMissile) {
        const ms = f.missileState();
        return ms === 'locked' ? 'fire' : ms === 'safe' ? 'safe' : 'arm';
      }
      if (a.onGround) return 'safe';
      const imp = f.bombImpact();
      return imp && imp.onTarget ? 'fire' : 'arm';
    }
    return f.data.gun && f.cb.ammo > 0 ? 'gun' : 'empty';
  }

  // Your nose is on the bandit, in gun range (same test the bandit uses on you).
  gunSolution(f) {
    const df = f.df, a = f.ac, b = df.b;
    if (!df.b || df.fleeing || df.dx <= 0 || !f.data.gun || f.cb.ammo <= 0 || df.range > GUN_SOLUTION.rangeM) return false;
    const t = df.range / f.data.gun.muzzleMs;
    const ang = Math.atan2(b.pos.y - a.pos.y + (b.vel.y - a.vel.y) * t + 4.9 * t * t, b.pos.x - a.pos.x + (b.vel.x - a.vel.x) * t);
    let e = ang - a.pitch;
    while (e > Math.PI) e -= Math.PI * 2;
    while (e < -Math.PI) e += Math.PI * 2;
    return Math.abs(e) < GUN_SOLUTION.coneDeg * Math.PI / 180;
  }

  sizeRadar() {
    const cv = this.radar;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(this.radarCss.w * dpr), h = Math.round(this.radarCss.h * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  }

  showMsg(m) {
    const el = this.el.itext;
    el.textContent = m.text;
    this.el.instructor.classList.remove('talk', 'urgent');
    void this.el.instructor.offsetWidth;
    this.el.instructor.classList.add('talk');
    if (m.urgent) this.el.instructor.classList.add('urgent');
  }

  flashCallout(t) {
    const el = this.el.callout;
    el.textContent = t;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }

  // Side-view radar (top centre). Normally the whole route; while your weapons, SAMs
  // or a bandit are in the air, a window around you with their tracks.
  drawRadar(f, dt) {
    const cv = this.radar;
    const w = this.radarCss.w, h = this.radarCss.h;
    const dpr = cv.width / Math.max(w, 1);
    const x = cv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, w, h);
    const a = f.ac;
    const df = f.df;
    const threats = f.armed ? f.cb.threats : [];
    const visBases = f.bases.filter((b) => b.visible);
    // Window: tactical (around you) or the whole route; eased between the two.
    const tactical = f.weapons.length > 0 || threats.length > 0 || !!(df && (df.b || df.falling.length));
    let t0, t1;
    if (tactical && df && !f.weapons.length && !threats.length) { t0 = a.pos.x - RADAR.dogfightM; t1 = a.pos.x + RADAR.dogfightM; }
    else if (tactical) {
      // Just wide enough for you, your weapons' impact points and the SAMs.
      t0 = a.pos.x - RADAR.behindM; t1 = a.pos.x + RADAR.aheadM;
      const reach = (xx) => { t0 = Math.min(t0, xx - RADAR.marginM); t1 = Math.max(t1, xx + RADAR.marginM); };
      for (const wp of f.weapons) { reach(wp.pos.x); reach(wp.guideX != null ? wp.guideX : wp.predX ?? wp.pos.x); }
      for (const m of threats) reach(m.x);
      t0 = Math.max(t0, a.pos.x - RADAR.maxAheadM); t1 = Math.min(t1, a.pos.x + RADAR.maxAheadM);
    } else {
      t0 = -600;
      t1 = Math.max(f.revealed ? f.dest.x + f.dest.runwayM + 800 : 0, ...(f.targets.length ? [f.targets[f.targets.length - 1].x + 1500] : []),
        ...visBases.map((b) => b.x + b.runwayM + 800), df && !f.revealed ? df.fightX + 3000 : 0, a.pos.x + 1500);
    }
    if (this.rx0 == null || this.radarFlight !== f) { this.rx0 = t0; this.rx1 = t1; this.radarFlight = f; this.objTrails = new WeakMap(); }
    const k = 1 - Math.exp(-(dt || 0.016) * RADAR.zoomRate);
    this.rx0 += (t0 - this.rx0) * k; this.rx1 += (t1 - this.rx1) * k;
    const x0 = this.rx0, x1 = this.rx1;
    let top = a.pos.y;
    if (df && df.b) top = Math.max(top, df.b.pos.y);
    for (const m of threats) top = Math.max(top, m.y);
    for (const wp of f.weapons) top = Math.max(top, wp.pos.y);
    const maxAlt = tactical ? Math.max(RADAR.minAltM, Math.ceil(top * 1.3 / 100) * 100) : Math.max(800, Math.ceil(top / 500 + 0.6) * 500);
    const px = (m) => 8 + ((m - x0) / (x1 - x0)) * (w - 16);
    const py = (m) => h - 12 - (Math.max(0, m) / maxAlt) * (h - 22);
    const line = (pts, col, dash, lw = 1) => {
      if (pts.length < 2) return;
      x.setLineDash(dash || []); x.strokeStyle = col; x.lineWidth = lw;
      x.beginPath(); pts.forEach(([m, al], i) => (i ? x.lineTo(px(m), py(al)) : x.moveTo(px(m), py(al)))); x.stroke();
      x.setLineDash([]); x.lineWidth = 1;
    };
    // Trail of a moving object (weapon, SAM, bandit): sampled every trailEveryS.
    const trail = (o, X, Y) => {
      let t = this.objTrails.get(o);
      if (!t) { t = { pts: [], acc: 0 }; this.objTrails.set(o, t); }
      t.acc += dt || 0.016;
      if (t.acc >= RADAR.trailEveryS || !t.pts.length) { t.acc = 0; t.pts.push([X, Y]); if (t.pts.length > RADAR.trailMax) t.pts.shift(); }
      return [...t.pts, [X, Y]];
    };
    // Grid.
    x.strokeStyle = 'rgba(120,255,190,0.08)'; x.lineWidth = 1;
    for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(0, py(maxAlt * i / 4)); x.lineTo(w, py(maxAlt * i / 4)); x.stroke(); }
    x.strokeStyle = 'rgba(120,255,190,0.45)';
    x.beginPath(); x.moveTo(0, py(0)); x.lineTo(w, py(0)); x.stroke();
    x.font = '600 9px "Chakra Petch", sans-serif';
    x.textAlign = 'center';
    for (const b of visBases) {
      const isDest = b === f.dest;
      x.fillStyle = isDest ? '#7dffb5' : 'rgba(170,220,200,0.7)';
      x.fillRect(px(b.x), py(0) - 1, Math.max(3, px(b.x + b.runwayM) - px(b.x)), 3);
      x.fillText(b.short, (px(b.x) + px(b.x + b.runwayM)) / 2, py(0) + 11);
    }
    for (const t of f.targets) {
      if (t.objective) {
        x.fillStyle = t.alive ? '#ff6a4d' : 'rgba(255,106,77,0.3)';
        x.beginPath(); x.moveTo(px(t.x), py(0) - 7); x.lineTo(px(t.x) + 4, py(0) - 1); x.lineTo(px(t.x) - 4, py(0) - 1); x.fill();
      } else {
        // Air defence: amber diamond (SAM) or square (AAA).
        x.fillStyle = t.alive ? '#ffbe3c' : 'rgba(255,190,60,0.3)';
        const cx = px(t.x), cy = py(0) - 4;
        if (t.role === 'sam') { x.beginPath(); x.moveTo(cx, cy - 4); x.lineTo(cx + 3.5, cy); x.lineTo(cx, cy + 4); x.lineTo(cx - 3.5, cy); x.fill(); }
        else x.fillRect(cx - 2.5, cy - 2.5, 5, 5);
      }
    }
    // Your weapons: trail (solid) and where they're going (dashed) with the impact mark.
    for (const wp of f.weapons) {
      line(trail(wp, wp.pos.x, wp.pos.y), 'rgba(255,214,90,0.75)');
      let pts, ix;
      if (wp.missile && wp.guideX != null) { ix = wp.guideX; pts = [[wp.pos.x, wp.pos.y], [ix, 0]]; }
      else {
        const out = [];
        const hit = predictImpact(wp.pos, wp.vel, wp.k, out);
        ix = wp.guideX != null ? wp.guideX : hit.x;
        pts = [[wp.pos.x, wp.pos.y], ...out.filter((_, i) => i % 3 === 0).map((q) => [q.x, q.y]), [hit.x, 0]];
        if (wp.guideX != null) pts.push([ix, 0]);
      }
      line(pts, 'rgba(255,214,90,0.6)', [3, 3]);
      x.strokeStyle = '#ffd65a';
      x.beginPath(); x.arc(px(ix), py(0) - 1, 4, 0, Math.PI * 2); x.stroke();
      x.fillStyle = '#ffd65a';
      x.beginPath(); x.arc(px(wp.pos.x), py(wp.pos.y), 2.2, 0, Math.PI * 2); x.fill();
    }
    // SAMs: trail and the line to what they're chasing (you, a decoy, or straight on).
    for (const m of threats) {
      line(trail(m, m.x, m.y), 'rgba(255,80,60,0.75)');
      let tx, ty;
      if (m.target === 'ac') { tx = a.pos.x; ty = a.pos.y; }
      else if (m.target && m.target.x != null) { tx = m.target.x; ty = m.target.y; }
      else { tx = m.x + m.vx * 2; ty = m.y + m.vy * 2; }
      line([[m.x, m.y], [tx, ty]], 'rgba(255,80,60,0.6)', [3, 3]);
      x.fillStyle = '#ff3b30';
      x.beginPath(); x.arc(px(m.x), py(m.y), 2.4, 0, Math.PI * 2); x.fill();
    }
    // Ideal 3 degree path into the destination.
    if (f.revealed) {
      x.setLineDash([3, 3]); x.strokeStyle = 'rgba(125,255,181,0.35)';
      x.beginPath(); x.moveTo(px(f.dest.x + 300), py(0)); x.lineTo(px(f.dest.x + 300 - 4000), py(4000 * Math.tan(3 * Math.PI / 180))); x.stroke();
      x.setLineDash([]);
    }
    // Bandits: the live one (red arrow, trail) and any still falling (dim).
    const arrow = (o, col) => {
      x.fillStyle = col;
      x.save(); x.translate(px(clamp(o.pos.x, x0, x1)), py(o.pos.y)); x.rotate(-o.pitch);
      x.beginPath(); x.moveTo(6, 0); x.lineTo(-5, -3.5); x.lineTo(-3, 0); x.lineTo(-5, 3.5); x.closePath(); x.fill();
      x.restore();
    };
    if (df) {
      for (const fw of df.falling) arrow(fw.ac, 'rgba(255,90,70,0.4)');
      if (df.b) {
        line(trail(df.b, df.b.pos.x, df.b.pos.y), 'rgba(255,80,60,0.45)');
        arrow(df.b, '#ff4a3a');
        x.fillStyle = 'rgba(255,120,100,0.9)';
        x.fillText(df.opp.name.toUpperCase(), px(clamp(df.b.pos.x, x0, x1)), py(df.b.pos.y) - 7);
      }
    }
    // Your trail and blip.
    const tr = this.trail;
    if (!tr.length || Math.abs(tr[tr.length - 1][0] - a.pos.x) > 25) { tr.push([a.pos.x, a.pos.y]); if (tr.length > 600) tr.shift(); }
    line([...tr.filter(([m]) => m >= x0 - 50), [a.pos.x, a.pos.y]], 'rgba(125,255,181,0.4)');
    arrow({ pos: a.pos, pitch: a.pitch }, '#ffffff');
    x.fillStyle = 'rgba(170,220,200,0.7)'; x.textAlign = 'left';
    x.fillText(`${Math.round(maxAlt * 3.28084 / 100) * 100} FT`, 4, 10);
    if (tactical) { x.textAlign = 'right'; x.fillText(`${((x1 - x0) / 1000).toFixed(1)} KM`, w - 4, 10); }
  }

}

export { KT };
