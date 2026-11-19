// In-flight display: HTML over the game canvas.
import { FLAP_NAMES, KT } from '../sim/aircraft.js';
import { KEY_HELP } from '../input.js';
import { Cockpit } from './cockpit.js';
import { drawBombSight, ReleaseCue } from './weapon_aids.js';
import { GROUND_UNITS } from '../data/combat.js';

const $ = (sel, root = document) => root.querySelector(sel);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// Flying name tag: largest name size (px) and the width the name may fill (px).
const NAMETAG_FONT_PX = 20;
const NAMETAG_TEXT_W = 148;

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
        </div>
      </div>
      <div class="warnings"></div>
      <div class="callout"></div>
      <div class="card guide">
        <div class="gtitle">LANDING GUIDE</div>
        <div class="grow2">
          <div class="gs"><div class="gs-scale"><i></i><i></i><i class="mid"></i><i></i><i></i></div><div class="gs-dia"></div><label>PATH</label></div>
          <div class="sink"><div class="sink-scale"></div><div class="sink-ptr"></div><label>SINK</label></div>
          <div class="gtext"><div class="gl1"></div><div class="gl2"></div></div>
        </div>
      </div>
      <canvas class="cue-cv"></canvas>
      <div class="card refuel"><label>REFUELLING</label><div class="rbar"><i></i></div></div>
      <div class="nameplate"><div class="rank"></div><img class="wings" alt="" /><div class="tagname"></div></div>
      <div class="keys"></div>
      <div class="touch">
        <div class="tleft">
          <button data-hold="pitchUp" class="tbig">NOSE<br>UP</button>
          <button data-hold="pitchDown" class="tbig">NOSE<br>DOWN</button>
        </div>
        <div class="tright">
          <div class="tbtns">
            <button data-act="engine">ENG</button><button data-act="flaps">FLAP</button><button data-act="gear">GEAR</button>
            <button data-hold="brake">BRK</button><button data-act="drop">DROP</button><button data-act="refuel">FUEL</button>
            <button data-hold="gun" class="strike-only">GUN</button><button data-act="target" class="strike-only">TGT</button>
            <button data-act="countermeasure" class="strike-only">FLR</button>
            <button data-act="pause">II</button>
            <button data-act="engine" class="ejectbtn">EJECT</button>
          </div>
          <input class="tthr" type="range" min="0" max="100" value="0" orient="vertical" aria-label="Throttle" />
        </div>
      </div>`;
    this.el = {};
    for (const k of ['itext', 'phase', 'togo', 'warnings', 'callout', 'guide', 'weapon', 'refuel', 'keys', 'touch', 'instructor', 'wname', 'wstate', 'wsub', 'gl1', 'gl2'])
      this.el[k] = $(`.${k}`, root);
    this.cockpit = new Cockpit($('.cockpit-cv', root));
    this.cue = new ReleaseCue($('.cue-cv', root));
    this.time = 0;
    this.el.gsDia = $('.gs-dia', root); this.el.sinkPtr = $('.sink-ptr', root); this.el.sinkScale = $('.sink-scale', root);
    this.el.rfill = $('.rbar i', root);
    this.el.whp = $('.whp i', root);
    this.radar = $('.radar-cv', root);
    this.el.radarCard = $('.card.radar', root);
    this.cache = new Map();
    this.msgQueue = [];
    this.msgT = 0;
    this.lastCallout = null;
    this.trail = [];
    this.el.keys.innerHTML = KEY_HELP.slice(0, 9).map(([k, t]) => `<span><kbd>${k}</kbd>${t}</span>`).join('');
    this.setupTouch();
  }

  setupTouch() {
    const inp = this.input;
    const t = this.el.touch;
    const coarse = matchMedia('(pointer: coarse)').matches;
    t.classList.toggle('on', coarse);
    for (const b of t.querySelectorAll('[data-hold]')) {
      const a = b.dataset.hold;
      const on = (v) => (e) => {
        e.preventDefault();
        if (a === 'brake') inp.touch.brake = v;
        else if (a === 'gun') inp.touch.gun = v;
        else inp.touch.pitch = v ? (a === 'pitchUp' ? 1 : -1) : 0;
        b.classList.toggle('active', v);
      };
      b.addEventListener('pointerdown', on(true));
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, on(false));
    }
    for (const b of t.querySelectorAll('[data-act]')) b.addEventListener('pointerdown', (e) => { e.preventDefault(); inp.press(b.dataset.act); });
    const thr = $('.tthr', t);
    thr.addEventListener('input', () => { inp.touch.throttleSet = thr.value / 100; });
    this.el.tthr = thr;
  }

  start(flight, opts) {
    this.flight = flight;
    const d = flight.data;
    // Embroidered name tag: rank top right, wings (crescent colour = rank), name.
    $('.wings', this.root).src = `${import.meta.env.BASE_URL}sprites/paf_pilot_wings_${d.rankBadge}.png`;
    $('.rank', this.root).textContent = d.rankFull.toUpperCase();
    const tag = $('.tagname', this.root);
    tag.textContent = (opts.name || 'Shaheen').toUpperCase();
    // Long names get smaller thread so they stay on the patch.
    tag.style.fontSize = `${Math.min(NAMETAG_FONT_PX, NAMETAG_TEXT_W / (tag.textContent.length * 0.97))}px`;
    this.cockpit.setAircraft(d);
    this.cue.hide();
    this.cache.clear();
    this.el.weapon.classList.toggle('show', flight.mode === 'strike');
    this.el.touch.classList.toggle('strike', flight.mode === 'strike');
    this.el.wname.textContent = d.weaponName || '';
    // Sink-rate scale zones from this aircraft's landing limits.
    const max = d.hardFpm * 1.2;
    const z = (a, b, c) => `<i style="bottom:${(a / max) * 100}%;height:${((b - a) / max) * 100}%" class="${c}"></i>`;
    this.el.sinkScale.innerHTML = z(0, d.goodFpm, 'ok') + z(d.goodFpm, d.firmFpm, 'firm') + z(d.firmFpm, d.hardFpm, 'hard') + z(d.hardFpm, max, 'bad');
    this.sinkMax = max;
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
    if (this.msgQueue.length > 1 && this.msgT > 3.2) { this.msgQueue.shift(); this.msgT = 0; this.showMsg(this.msgQueue[0]); }

    this.time += dt;
    this.cockpit.draw(a, dt);
    this.cue.update(f, dt);
    if (this.el.tthr && document.activeElement !== this.el.tthr) this.el.tthr.value = Math.round(a.throttle * 100);

    if (f.mode === 'strike') {
      this.set('wname', this.el.wname, `${d.weaponName || 'WEAPON'}  x${a.bombsLeft}`);
      let state = 'EMPTY';
      let hot = false;
      if (a.bombsLeft > 0 && d.weaponIsMissile) {
        const ms = f.missileState();
        const t = f.missileTarget();
        state = ms === 'safe' ? 'SAFE · GEAR UP TO ARM'
          : ms === 'seeking' ? 'SEEKING…'
          : ms === 'locked' ? `LOCKED ${(Math.abs(t.x - a.pos.x) / 1000).toFixed(1)} KM · SPACE`
          : 'NO TARGET IN RANGE';
        hot = ms === 'locked';
      } else if (a.bombsLeft > 0) {
        const imp = a.onGround ? null : f.bombImpact();
        if (a.onGround) state = 'ARMED';
        else if (imp && imp.onTarget) { state = d.bombGuided ? 'IN RANGE · SPACE' : 'ON TARGET · SPACE'; hot = true; }
        else state = d.bombGuided ? 'PUT TARGET IN THE BRACKET' : 'WATCH THE RELEASE CUE';
      }
      this.set('wstate', this.el.wstate, state);
      this.cls('wstate', this.el.weapon, 'hot', hot);
      // Gun rounds, flares/chaff, the picked target, airframe health.
      const cb = f.cb;
      const pick = f.manualTarget();
      const sub = [d.gun ? `GUN ${cb.ammo}` : null, `FLR/CHF ${cb.cm}`, pick ? `TGT ${GROUND_UNITS[pick.kind].label}` : 'TGT AUTO (Q)'].filter(Boolean).join(' · ');
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
      if (a.shotDown && !f.eject) w.push(['EJECT · PRESS E', 'red']);
    }
    const wk = w.map((x) => x.join(':')).join('|');
    if (this.cache.get('warn') !== wk) {
      this.cache.set('warn', wk);
      this.el.warnings.innerHTML = w.map(([t, c]) => `<span class="w ${c}">${t}</span>`).join('');
    }

    // Phase and distance.
    this.set('phase', this.el.phase, f.phase);
    this.cls('eject', this.el.touch, 'ejecting', !!a.shotDown && !f.eject);
    const toGo = f.dest.x - a.pos.x;
    const tgt = f.mode === 'strike' && !f.revealed ? f.targets.find((t) => t.objective && t.alive && t.x > a.pos.x) : null;
    const togo = tgt ? `TARGET ${((tgt.x - a.pos.x) / 1000).toFixed(1)} KM` : f.revealed ? `${f.dest.short} ${toGo > 0 ? (toGo / 1000).toFixed(1) + ' KM' : 'BEHIND'}` : 'LANDING BASE: AFTER ATTACK';
    this.set('togo', this.el.togo, togo);

    // Landing guide on short final.
    const glide = f.glide();
    const showGuide = !!glide && f.state === 'flying' && glide.dist < 4500 && a.altFt < 2500 && a.vel.x > 0;
    this.cls('guide', this.el.guide, 'show', showGuide || f.state === 'rollout');
    if (showGuide) {
      this.set('gs', this.el.gsDia, `${50 - clamp(glide.dev / 1.5, -1, 1) * 45}%`, 'top');
      const sink = Math.max(0, -a.vsFpm);
      this.set('sink', this.el.sinkPtr, `${clamp(sink / this.sinkMax, 0, 1) * 100}%`, 'bottom');
      const appKt = f.approachKt();
      const dv = a.speedKt - appKt;
      const l1 = Math.abs(glide.dev) < 0.5 ? 'ON PATH' : glide.dev > 0 ? 'HIGH · DESCEND' : 'LOW · CLIMB';
      const l2 = dv > 15 ? `FAST +${Math.round(dv)} KT` : dv < -10 ? `SLOW ${Math.round(dv)} KT` : `SPEED OK ${appKt} KT`;
      this.set('gl1', this.el.gl1, a.gearPos < 1 ? 'GEAR UP!' : l1);
      this.set('gl2', this.el.gl2, l2);
    } else if (f.state === 'rollout') {
      this.set('gl1', this.el.gl1, 'BRAKE · HOLD B');
      this.set('gl2', this.el.gl2, `${Math.round(a.speedKt)} KT`);
    }
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
    if (f.refuel) this.set('rf', this.el.rfill, `${(f.refuel.t / f.refuel.dur) * 100}%`, 'width');

    if (f.airborneOnce && !this.keysAuto && f.flightTime > 25) { this.keysAuto = true; if (!this.keysHidden) this.toggleKeys(); }
    // Guided weapons: the bomb sight takes the radar's place during the target run.
    const sight = f.sightWanted();
    this.cls('radar', this.el.radarCard, 'sight', sight);
    this.sizeRadar();
    if (sight) drawBombSight(this.radar, f, this.time);
    else this.drawRadar(f);
  }

  sizeRadar() {
    const cv = this.radar;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
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

  drawRadar(f) {
    const cv = this.radar;
    const dpr = cv.width / Math.max(cv.clientWidth, 1);
    const w = cv.clientWidth, h = cv.clientHeight;
    const x = cv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, w, h);
    const a = f.ac;
    const visBases = f.bases.filter((b) => b.visible);
    const x0 = -600, x1 = Math.max(f.revealed ? f.dest.x + f.dest.runwayM + 800 : 0, ...(f.targets.length ? [f.targets[f.targets.length - 1].x + 1500] : []), ...visBases.map((b) => b.x + b.runwayM + 800));
    const maxAlt = Math.max(800, Math.ceil(a.pos.y / 500 + 0.6) * 500);
    const px = (m) => 8 + ((m - x0) / (x1 - x0)) * (w - 16);
    const py = (m) => h - 12 - (m / maxAlt) * (h - 22);
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
    if (f.mode === 'strike') {
      x.fillStyle = '#ff3b30';
      for (const m of f.cb.threats) { x.beginPath(); x.arc(px(m.x), py(m.y), 2.2, 0, Math.PI * 2); x.fill(); }
    }
    // Ideal 3 degree path into the destination.
    if (f.revealed) {
      x.setLineDash([3, 3]); x.strokeStyle = 'rgba(125,255,181,0.35)';
      x.beginPath(); x.moveTo(px(f.dest.x + 300), py(0)); x.lineTo(px(f.dest.x + 300 - 4000), py(4000 * Math.tan(3 * Math.PI / 180))); x.stroke();
      x.setLineDash([]);
    }
    // Trail and blip.
    const tr = this.trail;
    if (!tr.length || Math.abs(tr[tr.length - 1][0] - a.pos.x) > (x1 - x0) / 300) { tr.push([a.pos.x, a.pos.y]); if (tr.length > 300) tr.shift(); }
    x.strokeStyle = 'rgba(125,255,181,0.4)';
    x.beginPath(); tr.forEach(([m, al], i) => (i ? x.lineTo(px(m), py(al)) : x.moveTo(px(m), py(al)))); x.stroke();
    const bx = px(a.pos.x), by = py(a.pos.y);
    x.fillStyle = '#ffffff';
    x.save(); x.translate(bx, by); x.rotate(-a.pitch);
    x.beginPath(); x.moveTo(6, 0); x.lineTo(-5, -3.5); x.lineTo(-3, 0); x.lineTo(-5, 3.5); x.closePath(); x.fill();
    x.restore();
    x.fillStyle = 'rgba(170,220,200,0.7)'; x.textAlign = 'left';
    x.fillText(`${Math.round(maxAlt * 3.28084 / 100) * 100} FT`, 4, 10);
  }
}

export { KT };
