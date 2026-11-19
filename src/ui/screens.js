// Start menu, pause menu and result screen (HTML).
import { AIRCRAFT } from '../data/aircraft.js';
import { ROUTES, TIMES } from '../data/world.js';
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

export class Menu {
  constructor(root, settings, { onFly, onChange, sound }) {
    this.root = root;
    this.s = settings;
    this.onFly = onFly;
    this.onChange = onChange;
    this.sound = sound;
    const base = import.meta.env.BASE_URL;
    root.innerHTML = `
      <div class="menu-wrap">
        <header class="brand">
          <div class="logo"><span>SHAHEEN</span><em>PAF FLIGHT SCHOOL</em></div>
        </header>
        <section class="msec">
          <h3>Pilot</h3>
          <input class="pname" maxlength="16" placeholder="Your name" spellcheck="false" autocomplete="off" />
        </section>
        <section class="msec">
          <h3>Aircraft</h3>
          <div class="acgrid">${AIRCRAFT.map((a) => `
            <button class="accard" data-id="${a.id}">
              <div class="acimg"><img src="${base}sprites/${a.sprite}.png" alt="" /></div>
              <div class="acname">${a.name}</div>
              <div class="acrole">${a.role}${a.weaponLabel ? ` · ${a.weaponLabel}` : ''}</div>
              <div class="stats">
                <div><label>SPEED</label><i style="--v:${a.stats.speed}"></i></div>
                <div><label>AGILITY</label><i style="--v:${a.stats.agility}"></i></div>
                <div><label>DIFFICULTY</label><i class="d" style="--v:${a.stats.difficulty}"></i></div>
              </div>
            </button>`).join('')}
          </div>
          <p class="blurb"></p>
        </section>
        <section class="msec two">
          <div>
            <h3>Mission</h3>
            <div class="seg mode">
              <button data-v="ferry">Ferry flight</button>
              <button data-v="strike">Air-to-ground strike</button>
            </div>
            <p class="hint modehint"></p>
          </div>
          <div class="routebox">
            <h3>Route</h3>
            <div class="seg dest">${ROUTES.map((r) => `<button data-v="${r.id}">${r.label}<small>${r.km} km</small></button>`).join('')}</div>
            <p class="hint routehint"></p>
          </div>
        </section>
        <section class="msec">
          <h3>Time of day</h3>
          <div class="seg time">${Object.entries(TIMES).map(([k, t]) => `<button data-v="${k}">${t.label}</button>`).join('')}</div>
        </section>
        <footer class="mfoot">
          <button class="fly">FLY <kbd>Enter</kbd></button>
          <div class="best"></div>
          <button class="ghost keysbtn">Controls</button>
        </footer>
        <div class="keypop">${KEY_HELP.map(([k, t]) => `<div><kbd>${k}</kbd><span>${t}</span></div>`).join('')}<p>Gamepad: left stick pitch, triggers throttle, A drop, B brake, X flaps, Y gear, LB engine.</p></div>
      </div>`;
    const name = $('.pname', root);
    name.value = settings.name;
    name.addEventListener('input', () => { this.s.name = name.value; this.changed(false); });
    for (const b of root.querySelectorAll('.accard')) b.addEventListener('click', () => { if (b.disabled) return; this.s.aircraft = b.dataset.id; this.changed(true); });
    const seg = (cls, key) => {
      for (const b of root.querySelectorAll(`.seg.${cls} button`)) b.addEventListener('click', () => { this.s[key] = b.dataset.v; this.changed(key === 'time'); });
    };
    seg('mode', 'mode'); seg('dest', 'dest'); seg('time', 'time');
    $('.fly', root).addEventListener('click', () => this.fly());
    $('.keysbtn', root).addEventListener('click', () => root.querySelector('.keypop').classList.toggle('show'));
    this.keyHandler = (e) => {
      if (!this.root.classList.contains('show')) return;
      if (e.code === 'Enter') { e.preventDefault(); this.fly(); }
    };
    addEventListener('keydown', this.keyHandler);
    this.refresh();
  }

  fly() {
    this.sound.click();
    this.onFly({ ...this.s });
  }

  changed(visual) {
    this.sound.click();
    const a = AIRCRAFT.find((x) => x.id === this.s.aircraft);
    if (this.s.mode === 'strike' && !a.strikeCapable) this.s.aircraft = 'f16a';
    saveSettings(this.s);
    this.refresh();
    if (visual) this.onChange(this.s);
  }

  refresh() {
    const s = this.s;
    const r = this.root;
    const a = AIRCRAFT.find((x) => x.id === s.aircraft);
    for (const b of r.querySelectorAll('.accard')) {
      const ac = AIRCRAFT.find((x) => x.id === b.dataset.id);
      b.classList.toggle('sel', b.dataset.id === s.aircraft);
      b.disabled = s.mode === 'strike' && !ac.strikeCapable;
    }
    $('.blurb', r).textContent = `${a.blurb} You fly as ${a.rank}.`;
    for (const [cls, key] of [['mode', 'mode'], ['dest', 'dest'], ['time', 'time']]) {
      for (const b of r.querySelectorAll(`.seg.${cls} button`)) b.classList.toggle('sel', b.dataset.v === s[key]);
    }
    $('.routebox', r).classList.toggle('off', s.mode === 'strike');
    $('.modehint', r).textContent = s.mode === 'ferry'
      ? 'Take off from Risalpur, fly to the base you pick, land and stop on the runway.'
      : '2–3 ground targets a few km out. Destroy them, then land at the base that appears.';
    const route = ROUTES.find((x) => x.id === s.dest);
    $('.routehint', r).textContent = route ? route.note : '';
    const best = getBest(s);
    $('.best', r).textContent = best ? `Best score: ${best}` : '';
  }

  show() { this.root.classList.add('show'); }
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
