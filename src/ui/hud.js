// In-flight display: HTML over the game canvas.
import { FLAP_NAMES, KT } from '../sim/aircraft.js';
import { KEY_HELP } from '../input.js';

const $ = (sel, root = document) => root.querySelector(sel);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

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
        <div class="card panel">
          <div class="readouts">
            <div class="ro"><label>SPEED</label><b class="spd">0</b><small>KT</small><div class="spdbar"><i class="stallmark"></i><i class="spdfill"></i></div></div>
            <div class="ro"><label>ALTITUDE</label><b class="alt">0</b><small>FT</small></div>
            <div class="ro"><label>V/S</label><b class="vs">0</b><small>FT/MIN</small></div>
            <div class="ro gro"><label>G</label><b class="gl">1.0</b></div>
          </div>
          <div class="levers">
            <div class="lever"><label>THR</label><div class="vbar thr"><i class="abzone"></i><i class="fill"></i></div><span class="thrv">0%</span></div>
            <div class="lever"><label>FUEL</label><div class="vbar fuel"><i class="fill"></i></div><span class="fuelv">100%</span></div>
            <div class="chips">
              <span class="chip eng">ENG OFF</span>
              <span class="chip flaps">FLAPS TO</span>
              <span class="chip gear"><span class="gd"></span><span class="gd"></span><span class="gd"></span> GEAR</span>
              <span class="chip brk">BRAKE</span>
              <span class="chip wpn"></span>
            </div>
          </div>
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
      <div class="card weapon"><div class="wname"></div><div class="wstate"></div></div>
      <div class="card refuel"><label>REFUELLING</label><div class="rbar"><i></i></div></div>
      <div class="nameplate"><img class="wings" alt="" /><div><div class="rank"></div><div class="pname"></div></div></div>
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
            <button data-act="pause">II</button>
          </div>
          <input class="tthr" type="range" min="0" max="100" value="0" orient="vertical" aria-label="Throttle" />
        </div>
      </div>`;
    this.el = {};
    for (const k of ['itext', 'phase', 'togo', 'spd', 'alt', 'vs', 'gl', 'thrv', 'fuelv', 'warnings', 'callout', 'guide', 'weapon', 'refuel', 'keys', 'touch', 'instructor', 'gro', 'spdfill', 'stallmark', 'wname', 'wstate', 'gl1', 'gl2'])
      this.el[k] = $(`.${k}`, root);
    this.el.thrFill = $('.thr .fill', root);
    this.el.abzone = $('.abzone', root);
    this.el.fuelFill = $('.fuel .fill', root);
    this.el.eng = $('.chip.eng', root); this.el.flaps = $('.chip.flaps', root);
    this.el.gear = $('.chip.gear', root); this.el.gds = [...root.querySelectorAll('.gd')];
    this.el.brk = $('.chip.brk', root); this.el.wpn = $('.chip.wpn', root);
    this.el.gsDia = $('.gs-dia', root); this.el.sinkPtr = $('.sink-ptr', root); this.el.sinkScale = $('.sink-scale', root);
    this.el.rfill = $('.rbar i', root);
    this.radar = $('.radar-cv', root);
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
    $('.wings', this.root).src = `${import.meta.env.BASE_URL}sprites/paf_pilot_wings.png`;
    $('.rank', this.root).textContent = d.rank;
    $('.pname', this.root).textContent = (opts.name || 'Shaheen').toUpperCase();
    this.el.abzone.style.display = d.afterburnerN > 0 ? '' : 'none';
    this.el.abzone.style.height = `${(1 - d.afterburnerThreshold) * 100}%`;
    this.el.gro.style.display = d.gEffects ? '' : 'none';
    this.el.stallmark.style.left = `${clamp(d.stallKt / d.maxSpeedKt, 0, 1) * 100}%`;
    this.el.weapon.classList.toggle('show', flight.mode === 'strike');
    this.el.wpn.style.display = flight.mode === 'strike' ? '' : 'none';
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

    const spd = Math.round(a.speedKt);
    this.set('spd', this.el.spd, String(spd));
    this.set('alt', this.el.alt, Math.round(a.altFt / 10) * 10 >= 1000 ? Math.round(a.altFt / 10) * 10 + '' : String(Math.round(a.altFt)));
    const vs = Math.round(a.vsFpm / 10) * 10;
    this.set('vs', this.el.vs, (vs > 0 ? '+' : '') + vs);
    this.set('gl', this.el.gl, a.gLoad.toFixed(1));
    this.set('spdfill', this.el.spdfill, `${clamp(a.speedKt / d.maxSpeedKt, 0, 1) * 100}%`, 'width');
    this.cls('spd', this.el.spd, 'warn', !a.onGround && a.speedKt < d.stallKt * 1.08);
    this.set('thr', this.el.thrFill, `${Math.round(a.throttle * 100)}%`, 'height');
    this.cls('thr', this.el.thrFill, 'ab', a.afterburner > 0);
    this.set('thrv', this.el.thrv, a.afterburner > 0 ? 'A/B' : `${Math.round(a.throttle * 100)}%`);
    this.set('fuel', this.el.fuelFill, `${a.fuelFraction * 100}%`, 'height');
    this.cls('fuel', this.el.fuelFill, 'low', a.lowFuel);
    this.set('fuelv', this.el.fuelv, `${Math.round(a.fuelFraction * 100)}%`);
    if (this.el.tthr && document.activeElement !== this.el.tthr) this.el.tthr.value = Math.round(a.throttle * 100);

    const engTxt = a.engineOn ? (a.rpm < 0.95 ? `SPOOL ${Math.round(a.rpm * 100)}%` : 'ENG ON') : a.rpm > 0 ? 'ENG STOP' : 'ENG OFF';
    this.set('eng', this.el.eng, engTxt);
    this.cls('eng', this.el.eng, 'on', a.engineOn && a.rpm >= 0.95);
    this.cls('eng', this.el.eng, 'amber', a.engineOn !== (a.rpm >= 0.95));
    this.set('flaps', this.el.flaps, `FLAPS ${FLAP_NAMES[a.flapSetting]}`);
    this.cls('flaps', this.el.flaps, 'amber', Math.abs(a.flapPos - a.flapSetting) > 0.01);
    const gs = a.gearPos >= 1 ? 'down' : a.gearPos <= 0 ? 'up' : 'transit';
    if (this.cache.get('gear') !== gs) {
      this.cache.set('gear', gs);
      for (const g of this.el.gds) g.className = `gd ${gs}`;
      this.el.gear.classList.toggle('fixed', !d.retractableGear);
    }
    this.cls('brk', this.el.brk, 'on', a.braking);
    if (f.mode === 'strike') {
      this.set('wpn', this.el.wpn, `${d.weaponIsMissile ? 'MSL' : 'BOMB'} ${a.bombsLeft}`);
      let state = a.bombsLeft === 0 ? 'EMPTY' : 'ARMED';
      let hot = false;
      if (a.bombsLeft > 0 && d.weaponIsMissile) {
        const t = f.missileTarget();
        state = t ? `LOCKED ${(Math.abs(t.x - a.pos.x) / 1000).toFixed(1)} KM · SPACE` : 'NO LOCK';
        hot = !!t;
      } else if (a.bombsLeft > 0) {
        const imp = f.bombImpact();
        if (imp && imp.onTarget) { state = 'RELEASE · SPACE'; hot = true; }
        else if (imp && imp.target) state = `TARGET ${Math.round(imp.target.x - imp.x)} M ${imp.target.x > imp.x ? 'AHEAD' : 'BEHIND'}`;
      }
      this.set('wstate', this.el.wstate, `${state}`);
      this.cls('wstate', this.el.weapon, 'hot', hot);
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
    const wk = w.map((x) => x.join(':')).join('|');
    if (this.cache.get('warn') !== wk) {
      this.cache.set('warn', wk);
      this.el.warnings.innerHTML = w.map(([t, c]) => `<span class="w ${c}">${t}</span>`).join('');
    }

    // Phase and distance.
    this.set('phase', this.el.phase, f.phase);
    const toGo = f.dest.x - a.pos.x;
    const tgt = f.mode === 'strike' && !f.revealed ? f.targets.find((t) => t.alive && t.x > a.pos.x) : null;
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
    this.drawRadar(f);
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
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
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
      x.fillStyle = t.alive ? '#ff6a4d' : 'rgba(255,106,77,0.3)';
      x.beginPath(); x.moveTo(px(t.x), py(0) - 7); x.lineTo(px(t.x) + 4, py(0) - 1); x.lineTo(px(t.x) - 4, py(0) - 1); x.fill();
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
