// Start menu, pause menu and result screen (HTML).
import { AIRCRAFT } from '../data/aircraft.js';
import { BASES, routesFrom, TIMES } from '../data/world.js';
import { KEY_HELP } from '../input.js';
import { GROUND_UNITS } from '../data/combat.js';
import { isTouch } from './touch.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function loadSettings() {
  try {
    return { name: '', aircraft: 'mushshak', mode: 'ferry', dest: 'masroor', time: 'day', quality: 'high', vol: { master: 0.8, engine: 0.7, effects: 0.8 }, ...JSON.parse(localStorage.getItem('shaheen.settings') || '{}') };
  } catch { return { name: '', aircraft: 'mushshak', mode: 'ferry', dest: 'masroor', time: 'day', quality: 'high', vol: { master: 0.8, engine: 0.7, effects: 0.8 } }; }
}
export function saveSettings(s) { localStorage.setItem('shaheen.settings', JSON.stringify(s)); }
const bestKey = (s) => `${s.aircraft}|${s.mode}|${s.mode === 'ferry' ? s.dest : 'strike'}`;
export function getBest(s) { try { return JSON.parse(localStorage.getItem('shaheen.best') || '{}')[bestKey(s)] || 0; } catch { return 0; } }
export function setBest(s, v) {
  let all = {};
  try { all = JSON.parse(localStorage.getItem('shaheen.best') || '{}'); } catch { /* reset */ }
  if (v > (all[bestKey(s)] || 0)) { all[bestKey(s)] = v; localStorage.setItem('shaheen.best', JSON.stringify(all)); return true; }
  return false;
}

// Start screen in sequential steps (owner, like the Godot start screen): one question
// per page, BACK / NEXT (Esc / Enter), left / right arrows change the choice.
// PILOT -> AIRCRAFT -> MISSION -> ROUTE (ferry only) -> TIME OF DAY (+ FLY).
const STEPS = [
  { id: 'pilot', title: 'Enter your name' },
  { id: 'aircraft', title: 'Choose your aircraft' },
  { id: 'mode', title: 'Choose your mission' },
  { id: 'dest', title: 'Choose your route' },
  { id: 'time', title: 'Time of day' },
];
const MODES = [
  { id: 'ferry', label: 'Ferry flight', note: 'Take off from your home base, fly to the base you pick, land and stop on the runway.' },
  { id: 'strike', label: 'Air to ground', note: 'Jets only. Destroy 4-5 ground targets past SAMs, then land at the base that appears.' },
];

export class Menu {
  constructor(root, settings, { onFly, onChange, sound }) {
    this.root = root;
    this.s = settings;
    this.onFly = onFly;
    this.onChange = onChange;
    this.sound = sound;
    this.step = 0;
    const base = import.meta.env.BASE_URL;
    root.innerHTML = `
      <div class="menu-wrap">
        <header class="brand"><div class="logo"><span>SHAHEEN</span></div></header>
        <nav class="steps">${STEPS.map((st, i) => `<button class="stepdot" data-i="${i}"><b>${i + 1}</b><span>${st.id === 'dest' ? 'Route' : st.id === 'mode' ? 'Mission' : st.id === 'time' ? 'Time' : st.id[0].toUpperCase() + st.id.slice(1)}</span></button>`).join('')}</nav>
        <h2 class="steptitle"></h2>
        <section class="page" data-step="pilot">
          <input class="pname" maxlength="16" placeholder="Your name" spellcheck="false" autocomplete="off" />
        </section>
        <section class="page" data-step="aircraft">
          <div class="acgrid">${AIRCRAFT.map((a) => `
            <button class="accard" data-id="${a.id}">
              <div class="acimg"><img src="${base}sprites/${a.sprite}.png" alt="" />${[a.elevatorSprite, a.canardSprite].filter(Boolean).map((l) => `<img src="${base}sprites/${l}.png" alt="" />`).join('')}</div>
              <div class="acname">${a.name}</div>
              <div class="acrole">${a.role}</div>
              <div class="acwpn">${a.weaponLabel || 'No weapons'}</div>
            </button>`).join('')}
          </div>
          <p class="hint achint"></p>
        </section>
        <section class="page" data-step="mode">
          <div class="seg big mode">${MODES.map((m) => `<button data-v="${m.id}">${m.label}<small>${m.note}</small></button>`).join('')}</div>
        </section>
        <section class="page" data-step="dest">
          <div class="seg big dest"></div>
        </section>
        <section class="page" data-step="time">
          <div class="seg time">${Object.entries(TIMES).map(([k, t]) => `<button data-v="${k}">${t.label}</button>`).join('')}</div>
          <p class="summary"></p>
          <div class="best"></div>
        </section>
        <footer class="mfoot">
          <button class="ghost back">Back <kbd>Esc</kbd></button>
          <button class="fly next">Next <kbd>Enter</kbd></button>
          <button class="ghost keysbtn">Controls</button>
        </footer>
        <div class="keypop">${KEY_HELP.map(([k, t]) => `<div><kbd>${k}</kbd><span>${t}</span></div>`).join('')}<p>Gamepad: left stick pitch, triggers throttle, A fire, B brake, X flares, Y gear, LB engine.</p></div>
      </div>`;
    const name = $('.pname', root);
    name.value = settings.name;
    name.addEventListener('input', () => { this.s.name = name.value; saveSettings(this.s); });
    for (const b of root.querySelectorAll('.accard')) b.addEventListener('click', () => this.pick('aircraft', b.dataset.id));
    for (const [cls, key] of [['mode', 'mode'], ['time', 'time']]) {
      for (const b of root.querySelectorAll(`.seg.${cls} button`)) b.addEventListener('click', () => { if (!b.disabled) this.pick(key, b.dataset.v); });
    }
    // Route buttons depend on the aircraft's home base: rebuilt in refresh().
    $('.seg.dest', root).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) this.pick('dest', b.dataset.v); });
    for (const b of root.querySelectorAll('.stepdot')) b.addEventListener('click', () => { const i = +b.dataset.i; if (i < this.step) this.go(i); });
    $('.next', root).addEventListener('click', () => this.next());
    $('.back', root).addEventListener('click', () => this.back());
    $('.keysbtn', root).addEventListener('click', () => root.querySelector('.keypop').classList.toggle('show'));
    this.keyHandler = (e) => {
      if (!this.root.classList.contains('show')) return;
      if (e.code === 'Enter') { e.preventDefault(); this.next(); }
      else if (e.code === 'Escape') { e.preventDefault(); this.back(); }
      else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault(); this.cycle(e.code === 'ArrowRight' ? 1 : -1);
      }
    };
    addEventListener('keydown', this.keyHandler);
    this.refresh();
  }

  // Steps that apply (no route step on an air-to-ground mission).
  steps() { return STEPS.filter((st) => !(st.id === 'dest' && this.s.mode === 'strike')); }
  current() { return this.steps()[Math.min(this.step, this.steps().length - 1)]; }

  go(i) {
    this.step = Math.max(0, Math.min(i, this.steps().length - 1));
    this.sound.click();
    this.refresh();
    if (this.current().id === 'pilot') setTimeout(() => $('.pname', this.root).focus(), 0);
  }
  next() {
    if (this.step >= this.steps().length - 1) { this.fly(); return; }
    this.go(this.step + 1);
  }
  back() { if (this.step > 0) this.go(this.step - 1); }

  // Left / right on a choice page.
  cycle(dir) {
    const id = this.current().id;
    let opts;
    if (id === 'aircraft') opts = AIRCRAFT.map((a) => a.id);
    else if (id === 'mode') opts = MODES.filter((m) => m.id !== 'strike' || this.ac().strikeCapable).map((m) => m.id);
    else if (id === 'dest') opts = this.routes().map((r) => r.id);
    else if (id === 'time') opts = Object.keys(TIMES);
    else return;
    const key = id === 'aircraft' ? 'aircraft' : id;
    const i = opts.indexOf(this.s[key]);
    this.pick(key, opts[(i + dir + opts.length) % opts.length]);
  }

  ac() { return AIRCRAFT.find((x) => x.id === this.s.aircraft); }

  // Ferry routes from the selected aircraft's home base.
  routes() {
    const a = AIRCRAFT.find((x) => x.id === this.s.aircraft);
    return routesFrom(a.homeBase);
  }

  pick(key, v) {
    this.s[key] = v;
    this.changed(key === 'aircraft' || key === 'time');
  }

  fly() {
    this.sound.click();
    this.onFly({ ...this.s });
  }

  changed(visual) {
    this.sound.click();
    const a = AIRCRAFT.find((x) => x.id === this.s.aircraft);
    // The aircraft is picked first: one without weapons just can't fly air to ground.
    if (this.s.mode === 'strike' && !a.strikeCapable) this.s.mode = 'ferry';
    this.fixDest();
    saveSettings(this.s);
    this.refresh();
    if (visual) this.onChange(this.s);
  }

  // Keep the route valid for the current home base (default: the near one).
  fixDest() {
    const routes = this.routes();
    if (!routes.some((r) => r.id === this.s.dest)) this.s.dest = routes[0].id;
  }

  refresh() {
    this.fixDest();
    const s = this.s;
    const r = this.root;
    const steps = this.steps();
    const cur = this.current();
    const a = AIRCRAFT.find((x) => x.id === s.aircraft);
    for (const p of r.querySelectorAll('.page')) p.classList.toggle('on', p.dataset.step === cur.id);
    $('.steptitle', r).textContent = cur.title;
    for (const b of r.querySelectorAll('.stepdot')) {
      const st = STEPS[+b.dataset.i];
      const idx = steps.indexOf(st);
      b.classList.toggle('skip', idx < 0);
      b.classList.toggle('done', idx >= 0 && idx < this.step);
      b.classList.toggle('cur', st === cur);
    }
    for (const b of r.querySelectorAll('.accard')) {
      b.classList.toggle('sel', b.dataset.id === s.aircraft);
    }
    const name = (s.name || 'Shaheen').trim().toUpperCase();
    $('.achint', r).textContent = `You fly as ${a.rank} ${name} from ${BASES[a.homeBase].name}.`;
    const routes = this.routes();
    const rk = routes.map((x) => x.id).join();
    if (this.routeKey !== rk) {
      this.routeKey = rk;
      $('.seg.dest', r).innerHTML = routes.map((x) => `<button data-v="${x.id}">${x.label}<small>${x.km} km · ${x.note}</small></button>`).join('');
    }
    for (const [cls, key] of [['mode', 'mode'], ['dest', 'dest'], ['time', 'time']]) {
      for (const b of r.querySelectorAll(`.seg.${cls} button`)) b.classList.toggle('sel', b.dataset.v === s[key]);
    }
    // Air to ground needs a strike-capable aircraft.
    const sb = $('.seg.mode button[data-v="strike"]', r);
    sb.disabled = !a.strikeCapable;
    sb.querySelector('small').textContent = a.strikeCapable ? MODES[1].note : `Not available: the ${a.name} carries no weapons yet.`;
    const route = routes.find((x) => x.id === s.dest);
    $('.summary', r).textContent = `${a.rank} ${name} · ${a.name} · ${s.mode === 'strike' ? 'Air to ground' : route ? route.label : ''}`;
    const best = getBest(s);
    $('.best', r).textContent = best ? `Best score: ${best}` : '';
    const last = this.step >= steps.length - 1;
    $('.next', r).innerHTML = last ? 'FLY <kbd>Enter</kbd>' : 'Next <kbd>Enter</kbd>';
    $('.next', r).classList.toggle('go', last);
    $('.back', r).style.visibility = this.step > 0 ? 'visible' : 'hidden';
  }

  show() {
    this.root.classList.add('show');
    this.refresh();
    if (this.current().id === 'pilot') setTimeout(() => $('.pname', this.root).focus(), 0);
  }
  hide() { this.root.classList.remove('show'); }
}

export class Pause {
  constructor(root, settings, { onResume, onRestart, onMenu, onVolume, onQuality }) {
    this.root = root;
    root.innerHTML = `
      <div class="modal">
        <h2>PAUSED</h2>
        <div class="mbtns">
          <button class="resume">Resume <kbd>Esc</kbd></button>
          <button class="restart">Restart <kbd>R</kbd></button>
          <button class="tomenu ghost">Main menu</button>
        </div>
        <div class="sliders">
          ${['master', 'engine', 'effects'].map((k) => `<label>${k[0].toUpperCase() + k.slice(1)}<input type="range" min="0" max="100" data-k="${k}" value="${Math.round(settings.vol[k] * 100)}"></label>`).join('')}
          <label>Graphics<select class="quality"><option value="high">High (sharpest)</option><option value="medium">Medium</option><option value="low">Low (fastest)</option></select></label>
        </div>
        <div class="klist">${KEY_HELP.map(([k, t]) => `<div><kbd>${k}</kbd><span>${t}</span></div>`).join('')}</div>
      </div>`;
    $('.resume', root).onclick = onResume;
    $('.restart', root).onclick = onRestart;
    $('.tomenu', root).onclick = onMenu;
    for (const inp of root.querySelectorAll('input[type=range]')) inp.oninput = () => onVolume(inp.dataset.k, inp.value / 100);
    const q = $('.quality', root);
    q.value = settings.quality;
    q.onchange = () => onQuality(q.value);
  }
  show() { this.root.classList.add('show'); }
  hide() { this.root.classList.remove('show'); }
  get open() { return this.root.classList.contains('show'); }
}

// Pre-flight pop-up in the debrief's style. Strike missions in a fighter first get
// three short pages of pilot's notes, then the briefing; everything else goes
// straight to the briefing. Enter = next / start, Esc = back to the menu. The flight waits.
export class Briefing {
  constructor(root, { onStart, onMenu }) {
    this.root = root;
    this.onStart = onStart;
    this.onMenu = onMenu;
    this.shownAt = 0;
  }

  show(f, opts) {
    this.f = f;
    this.opts = opts;
    this.steps = f.mode === 'strike' && f.data.instructorLines !== 'full' ? guideSteps(f, isTouch()) : [];
    this.page = 0;
    this.render();
    this.root.classList.add('show');
  }

  // Enter / the main button: next guide page, then the briefing, then start.
  next() {
    if (this.page < this.steps.length) { this.page++; this.render(); } else this.onStart();
  }
  back() { if (this.page > 0) { this.page--; this.render(); } }
  skip() { this.page = this.steps.length; this.render(); }

  render() {
    if (this.page < this.steps.length) this.renderStep(); else this.renderBrief();
    this.shownAt = performance.now();
  }

  renderStep() {
    const s = this.steps[this.page];
    const n = this.steps.length;
    const last = this.page === n - 1;
    this.root.innerHTML = `
      <div class="modal debrief brief pnotes ok">
        <div class="dhead"><span>PAKISTAN AIR FORCE</span><span>PILOT'S NOTES</span></div>
        <div class="gdots">${this.steps.map((_, i) => `<i class="${i === this.page ? 'on' : i < this.page ? 'done' : ''}"></i>`).join('')}</div>
        <div class="gstep">STEP ${this.page + 1} OF ${n}</div>
        <div class="gtitle2">${esc(s.title)}</div>
        <ul class="glines">${s.lines.map((l) => `<li>${l}</li>`).join('')}</ul>
        <div class="dfoot">
          <div class="mbtns">
            <button class="go">${last ? 'Mission briefing' : 'Next'} <kbd>Enter</kbd></button>
            ${this.page > 0 ? '<button class="gback ghost">Back</button>' : ''}
            <button class="gskip ghost">Skip</button>
          </div>
        </div>
      </div>`;
    $('.go', this.root).onclick = () => this.next();
    const b = $('.gback', this.root); if (b) b.onclick = () => this.back();
    $('.gskip', this.root).onclick = () => this.skip();
  }

  // The briefing: short rows in the official format, one line of orders.
  renderBrief() {
    const f = this.f, opts = this.opts, d = f.data;
    const strike = f.mode === 'strike';
    const pilot = `${d.rank} ${(opts.name || 'Shaheen').toUpperCase()}`;
    const row = (k, v) => `<div class="drow"><span>${k}</span><i></i><b>${esc(v)}</b></div>`;
    const dep = f.bases[0];
    let rows, order, head, sub;
    if (strike) {
      const objs = f.objectives;
      const sams = f.defences.filter((t) => t.role === 'sam').length;
      const kinds = [...new Set(objs.map((t) => GROUND_UNITS[t.kind].label))].join(', ');
      head = 'STRIKE MISSION';
      sub = `${objs.length} GROUND TARGETS`;
      rows = [
        row('TAKE OFF FROM', dep.short),
        row('TARGETS', `${objs.length}: ${kinds}`),
        row('DISTANCE', `${Math.round(objs[0].x / 1000)} KM AHEAD`),
        row('THREATS', sams ? `${sams} SAM SITE${sams > 1 ? 'S' : ''}` : 'NONE KNOWN'),
        row('WEAPONS', `${d.bombCount} x ${d.weaponName}${d.gun ? ' + GUN' : ''}`),
        row('LAND AT', 'SHOWN AFTER THE ATTACK'),
      ];
      order = 'Take off, destroy the targets, land at the base that appears.';
    } else {
      const far = f.dest !== f.bases[1] && f.bases.length > 2;
      head = 'FERRY FLIGHT';
      sub = `${dep.short} TO ${f.dest.short}`;
      rows = [
        row('TAKE OFF FROM', dep.short),
        row('LAND AT', f.dest.short),
        row('DISTANCE', `${Math.round(f.dest.x / 1000)} KM`),
        far && row('FUEL STOP', `${f.bases[1].short} (IF LOW)`),
      ];
      order = `Take off, fly to ${f.dest.short}, land and stop on the runway.`;
    }
    this.root.innerHTML = `
      <div class="modal debrief brief ${strike ? 'warn' : 'ok'}">
        <div class="dhead"><span>PAKISTAN AIR FORCE</span><span>${strike ? 'MISSION BRIEFING' : 'FLIGHT ORDERS'}</span></div>
        <div class="dmeta">${esc(`${pilot} · ${d.name}`.toUpperCase())}</div>
        <div class="stamp"><div class="shead">${head}</div><div class="ssub">${esc(sub)}</div></div>
        <div class="drows">${rows.filter(Boolean).join('')}</div>
        <ul class="bnotes"><li>${esc(order)}</li></ul>
        <div class="dfoot">
          <div class="mbtns">
            <button class="go">Start mission <kbd>Enter</kbd></button>
            ${this.steps.length ? '<button class="gback ghost">How to</button>' : ''}
            <button class="tomenu ghost">Main menu <kbd>Esc</kbd></button>
          </div>
        </div>
      </div>`;
    $('.go', this.root).onclick = () => this.onStart();
    const b = $('.gback', this.root); if (b) b.onclick = () => { this.page = 0; this.render(); };
    $('.tomenu', this.root).onclick = () => this.onMenu();
  }

  // Ignore the Enter that opened it (menu FLY / Fly again fire on the same key press).
  get fresh() { return performance.now() - this.shownAt < 300; }
  hide() { this.root.classList.remove('show'); }
  get open() { return this.root.classList.contains('show'); }
}

// Pilot's notes: three short pages, strike missions in a fighter only (owner
// 2026-11-20: "not 7 pages"). Keyboard or touch wording.
function guideSteps(f, touch) {
  const d = f.data;
  const K = (kb, tc) => `<kbd>${touch ? tc : kb}</kbd>`;
  const find = d.weaponIsMissile ? 'Fly at the targets until a red <b>LOCK</b> box appears on one.'
    : d.bombGuided ? 'Fly at about 300 ft until the target sits in the bracket on the sight.'
    : 'Fly level at about 300 ft and watch the RELEASE CUE.';
  return [
    { title: 'TAKE OFF', lines: [
      `Engine ${K('E', 'ENGINE')}, full throttle ${K('hold ↑', 'slider up')}, nose up at ${d.rotateKt} kt ${K('hold ←', 'pitch up')}.`,
      `Gear up ${K('G', 'GEAR UP')}: weapons stay SAFE until it is.`,
    ] },
    { title: 'ATTACK', lines: [
      find,
      `When it says <b>FIRE</b>: ${K('Space', 'tap FIRE')}. Extra targets: gun ${K('hold V', 'hold GUN')}.`,
    ] },
    { title: 'SURVIVE AND LAND', lines: [
      `<b>MISSILE</b>: flares ${K('X', 'FLARES')} AND turn hard. Shot down: eject ${K('E', 'EJECT')}.`,
      'Then land at the base that appears: gear down, slow, brake.',
    ] },
  ];
}

export class Result {
  constructor(root, { onRetry, onMenu }) {
    this.root = root;
    this.onRetry = onRetry;
    this.onMenu = onMenu;
  }
  show(r, opts, newBest, best) {
    const a = AIRCRAFT.find((x) => x.id === opts.aircraft) || AIRCRAFT[0];
    const pilot = `${a.rank} ${(opts.name || 'Shaheen').toUpperCase()}`;
    const strike = r.mode === 'strike';
    const crash = r.grade === 'CRASH';
    const wrongBase = r.grade === 'WRONG BASE';
    const mm = Math.floor(r.timeS / 60), ss = Math.floor(r.timeS % 60);
    // Headline stamp: what happened to the mission (strike) or the delivery (ferry).
    let head, sub = '', tone;
    const shot = crash && r.reasons.some((x) => x.startsWith('Shot down'));
    if (strike) {
      const { hit, total } = r.targets;
      if (crash) { head = 'MISSION FAILED'; sub = shot ? (r.ejected ? 'SHOT DOWN · PILOT EJECTED' : 'SHOT DOWN · PILOT LOST') : r.ejected ? 'AIRCRAFT LOST · PILOT EJECTED' : 'AIRCRAFT LOST'; tone = 'bad'; }
      else if (hit === total) { head = 'MISSION SUCCESSFUL'; sub = 'ALL TARGETS DESTROYED'; tone = 'ok'; }
      else if (hit > 0) { head = 'PARTIAL SUCCESS'; sub = `${total - hit} TARGET${total - hit > 1 ? 'S' : ''} SURVIVED`; tone = 'warn'; }
      else { head = 'MISSION FAILED'; sub = 'NO TARGETS DESTROYED'; tone = 'bad'; }
    } else if (crash) { head = 'AIRCRAFT LOST'; sub = 'FERRY FLIGHT NOT COMPLETED'; tone = 'bad'; }
    else if (wrongBase) { head = 'WRONG BASE'; sub = 'AIRCRAFT NOT DELIVERED'; tone = 'warn'; }
    else { head = 'FERRY FLIGHT COMPLETE'; sub = `AIRCRAFT DELIVERED TO ${r.dest.toUpperCase()}`; tone = 'ok'; }
    const landing = crash ? 'CRASHED' : wrongBase ? 'WRONG BASE' : `${r.grade}${r.fpm ? ` · ${Math.round(r.fpm)} FPM` : ''}`;
    const row = (k, v, cls = '') => `<div class="drow ${cls}"><span>${k}</span><i></i><b>${esc(v)}</b></div>`;
    const rows = [
      strike && row('TARGETS DESTROYED', `${r.targets.hit} / ${r.targets.total}`, r.targets.hit === r.targets.total ? 'ok' : r.targets.hit ? 'warn' : 'bad'),
      strike && row('WEAPONS DEPLOYED', `${r.weapons.used} / ${r.weapons.total} ${r.weapons.name}`),
      strike && row('AIR DEFENCES DESTROYED', `${r.defences.hit} / ${r.defences.total}`, r.defences.hit ? 'ok' : ''),
      strike && r.gun && row('GUN ROUNDS FIRED', `${r.gun.fired} / ${r.gun.total}`),
      strike && row('MISSILES EVADED', `${r.countermeasures.evaded} · ${r.countermeasures.used} FLARES / CHAFF`),
      strike && row('BATTLE DAMAGE', `${r.damage}%`, r.damage >= 100 ? 'bad' : r.damage >= 50 ? 'warn' : r.damage > 0 ? '' : 'ok'),
      !strike && row('ROUTE', `${r.from} > ${r.dest}`.toUpperCase()),
      row(strike ? 'RECOVERY' : 'LANDING', strike && !crash ? `${r.dest.toUpperCase()} · ${landing}` : landing, crash ? 'bad' : ''),
      row('FLIGHT TIME', `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`),
      row('FUEL USED', `${Math.round(r.fuelUsedKg)} KG`),
    ].filter(Boolean).join('');
    this.root.innerHTML = `
      <div class="modal debrief ${tone}">
        <div class="dhead"><span>PAKISTAN AIR FORCE</span><span>${strike ? 'MISSION DEBRIEF' : 'FERRY FLIGHT REPORT'}</span></div>
        <div class="dmeta">${esc(`${pilot} · ${a.name} · ${strike ? 'AIR TO GROUND' : 'FERRY'}`.toUpperCase())}</div>
        <div class="stamp"><div class="shead">${head}</div><div class="ssub">${esc(sub)}</div></div>
        <div class="drows">${rows}</div>
        ${r.reasons.length ? `<ul class="reasons">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        <div class="dfoot">
          <div class="rscore">SCORE <b>${r.score}</b> ${newBest ? '<span class="nb">NEW BEST</span>' : best ? `<small>BEST ${best}</small>` : ''}</div>
          <div class="mbtns">
            <button class="retry">Fly again <kbd>Enter</kbd></button>
            <button class="tomenu ghost">Main menu <kbd>Esc</kbd></button>
          </div>
        </div>
      </div>`;
    $('.retry', this.root).onclick = this.onRetry;
    $('.tomenu', this.root).onclick = this.onMenu;
    this.root.classList.add('show');
  }
  hide() { this.root.classList.remove('show'); }
  get open() { return this.root.classList.contains('show'); }
}
