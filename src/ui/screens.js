// Start menu, pause menu and result screen (HTML).
import { AIRCRAFT } from '../data/aircraft.js';
import { BASES, routesFrom, TIMES } from '../data/world.js';
import { KEY_HELP } from '../input.js';

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
  { id: 'strike', label: 'Air to ground', note: 'Jets only. Destroy 2-3 ground targets, then land at the base that appears.' },
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
              <div class="acimg"><img src="${base}sprites/${a.sprite}.png" alt="" /></div>
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
        <div class="keypop">${KEY_HELP.map(([k, t]) => `<div><kbd>${k}</kbd><span>${t}</span></div>`).join('')}<p>Gamepad: left stick pitch, triggers throttle, A drop, B brake, X flaps, Y gear, LB engine.</p></div>
      </div>`;
    const name = $('.pname', root);
    name.value = settings.name;
    name.addEventListener('input', () => { this.s.name = name.value; saveSettings(this.s); });
    for (const b of root.querySelectorAll('.accard')) b.addEventListener('click', () => { if (b.disabled) return; this.pick('aircraft', b.dataset.id); });
    for (const [cls, key] of [['mode', 'mode'], ['time', 'time']]) {
      for (const b of root.querySelectorAll(`.seg.${cls} button`)) b.addEventListener('click', () => this.pick(key, b.dataset.v));
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
    if (id === 'aircraft') opts = AIRCRAFT.filter((a) => this.s.mode !== 'strike' || a.strikeCapable).map((a) => a.id);
    else if (id === 'mode') opts = MODES.map((m) => m.id);
    else if (id === 'dest') opts = this.routes().map((r) => r.id);
    else if (id === 'time') opts = Object.keys(TIMES);
    else return;
    const key = id === 'aircraft' ? 'aircraft' : id;
    const i = opts.indexOf(this.s[key]);
    this.pick(key, opts[(i + dir + opts.length) % opts.length]);
  }

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
    if (this.s.mode === 'strike' && !a.strikeCapable) { this.s.aircraft = 'f16a'; visual = true; }
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
      const ac = AIRCRAFT.find((x) => x.id === b.dataset.id);
      b.classList.toggle('sel', b.dataset.id === s.aircraft);
      b.disabled = s.mode === 'strike' && !ac.strikeCapable;
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

export class Result {
  constructor(root, { onRetry, onMenu }) {
    this.root = root;
    this.onRetry = onRetry;
    this.onMenu = onMenu;
  }
  show(r, opts, newBest, best) {
    const stars = { PERFECT: 3, GOOD: 2, FIRM: 1 }[r.grade] || 0;
    const crash = r.grade === 'CRASH';
    const mm = Math.floor(r.timeS / 60), ss = Math.floor(r.timeS % 60);
    this.root.innerHTML = `
      <div class="modal result ${crash ? 'crash' : ''}">
        <div class="rgrade">${esc(r.title)}</div>
        <div class="stars">${[0, 1, 2].map((i) => `<span class="${i < stars ? 'on' : ''}" style="--i:${i}">★</span>`).join('')}</div>
        <div class="rgrid">
          <div><label>TOUCHDOWN</label><b>${r.fpm ? Math.round(r.fpm) : '—'}</b><small>ft/min</small></div>
          <div><label>FLIGHT TIME</label><b>${mm}:${String(ss).padStart(2, '0')}</b><small>min</small></div>
          <div><label>FUEL USED</label><b>${Math.round(r.fuelUsedKg)}</b><small>kg</small></div>
          ${r.targets ? `<div><label>TARGETS</label><b>${r.targets.hit}/${r.targets.total}</b><small>destroyed</small></div>` : ''}
        </div>
        ${r.reasons.length ? `<ul class="reasons">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        <div class="rscore">SCORE <b>${r.score}</b> ${newBest ? '<span class="nb">NEW BEST</span>' : best ? `<small>best ${best}</small>` : ''}</div>
        <div class="mbtns">
          <button class="retry">Fly again <kbd>Enter</kbd></button>
          <button class="tomenu ghost">Main menu <kbd>Esc</kbd></button>
        </div>
      </div>`;
    $('.retry', this.root).onclick = this.onRetry;
    $('.tomenu', this.root).onclick = this.onMenu;
    this.root.classList.add('show');
    void opts;
  }
  hide() { this.root.classList.remove('show'); }
  get open() { return this.root.classList.contains('show'); }
}
