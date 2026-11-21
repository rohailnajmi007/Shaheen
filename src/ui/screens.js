// Start menu, pause menu and result screen (HTML).
import { AIRCRAFT } from '../data/aircraft.js';
import { BASES, routesFrom, TIMES } from '../data/world.js';
import { KEY_HELP } from '../input.js';
import { OPPONENTS, opponentById } from '../data/opponents.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function loadSettings() {
  try {
    return { name: '', aircraft: 'mushshak', mode: 'ferry', dest: 'masroor', opponent: 'mig21', time: 'day', quality: 'high', vol: { master: 0.8, engine: 0.7, effects: 0.8 }, ...JSON.parse(localStorage.getItem('shaheen.settings') || '{}') };
  } catch { return { name: '', aircraft: 'mushshak', mode: 'ferry', dest: 'masroor', opponent: 'mig21', time: 'day', quality: 'high', vol: { master: 0.8, engine: 0.7, effects: 0.8 } }; }
}
export function saveSettings(s) { localStorage.setItem('shaheen.settings', JSON.stringify(s)); }
const bestKey = (s) => `${s.aircraft}|${s.mode}|${s.mode === 'ferry' ? s.dest : s.mode === 'dogfight' ? s.opponent : s.mode}`;
export function getBest(s) { try { return JSON.parse(localStorage.getItem('shaheen.best') || '{}')[bestKey(s)] || 0; } catch { return 0; } }
export function setBest(s, v) {
  let all = {};
  try { all = JSON.parse(localStorage.getItem('shaheen.best') || '{}'); } catch { /* reset */ }
  if (v > (all[bestKey(s)] || 0)) { all[bestKey(s)] = v; localStorage.setItem('shaheen.best', JSON.stringify(all)); return true; }
  return false;
}

// Start screen in sequential steps (owner, like the Godot start screen): one question
// per page, BACK / NEXT (Esc / Enter), left / right arrows change the choice.
// PILOT -> AIRCRAFT -> MISSION -> ROUTE (ferry) / OPPONENT (air to air) -> TIME OF DAY (+ FLY).
const STEPS = [
  { id: 'pilot', title: 'Enter your name', tab: 'Pilot' },
  { id: 'aircraft', title: 'Choose your aircraft', tab: 'Aircraft' },
  { id: 'mode', title: 'Choose your mission', tab: 'Mission' },
  { id: 'dest', title: 'Choose your route', tab: 'Route' },
  { id: 'opponent', title: 'Choose your opponent', tab: 'Opponent' },
  { id: 'time', title: 'Time of day', tab: 'Time' },
];
const MODES = [
  { id: 'ferry', label: 'Ferry flight', note: 'Take off from your home base, fly to the base you pick, land and stop on the runway.' },
  { id: 'strike', label: 'Air to ground', note: 'Jets only. Destroy 4-5 ground targets past SAMs, then land at the base that appears.' },
  { id: 'dogfight', label: 'Air to air', note: 'Jets with a gun. Take off, shoot down 2-3 bandits with the gun, then land at the base that appears.' },
];
// Which missions an aircraft can fly.
const modeOk = (m, a) => m === 'ferry' || (m === 'strike' ? a.strikeCapable : !!a.gun);

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
      <div class="menu-wrap sheet">
        <div class="dhead"><span>PAKISTAN AIR FORCE</span><span>RESTRICTED</span></div>
        <div class="mbody">
        <header class="brand"><div class="logo"><span>SHAHEEN</span><small>FLIGHT AUTHORISATION · SORTIE ORDER</small></div></header>
        <nav class="steps">${STEPS.map((st, i) => `<button class="stepdot" data-i="${i}"><b>${String(i + 1).padStart(2, '0')}</b><span>${st.tab}</span></button>`).join('')}</nav>
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
        <section class="page" data-step="opponent">
          <div class="acgrid oppgrid">${OPPONENTS.map((o) => `
            <button class="accard opcard" data-id="${o.id}">
              <div class="acimg"><img src="${base}sprites/${o.sprite}.png" alt="" /></div>
              <div class="acname">${o.name}</div>
              <div class="acrole diff ${o.difficulty.toLowerCase()}">${o.difficulty}</div>
              <div class="acwpn">${o.note}</div>
            </button>`).join('')}
          </div>
          <p class="hint">2-3 of them, one after another. Guns only, both sides.</p>
        </section>
        <section class="page" data-step="time">
          <div class="seg time">${Object.entries(TIMES).map(([k, t]) => `<button data-v="${k}">${t.label}</button>`).join('')}</div>
        </section>
        <div class="drows mlog"></div>
        <footer class="mfoot">
          <button class="ghost back">Back <kbd>Esc</kbd></button>
          <button class="fly next">Next <kbd>Enter</kbd></button>
          <button class="ghost keysbtn">Controls</button>
        </footer>
        <div class="keypop">${KEY_HELP.map(([k, t]) => `<div><kbd>${k}</kbd><span>${t}</span></div>`).join('')}<p>Gamepad: left stick pitch, triggers throttle, A fire, B brake, X flares, Y gear, LB engine.</p></div>
        </div>
      </div>`;
    const name = $('.pname', root);
    name.value = settings.name;
    name.addEventListener('input', () => { this.s.name = name.value; saveSettings(this.s); });
    for (const b of root.querySelectorAll('.accard:not(.opcard)')) b.addEventListener('click', () => this.pick('aircraft', b.dataset.id));
    for (const b of root.querySelectorAll('.opcard')) b.addEventListener('click', () => this.pick('opponent', b.dataset.id));
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

  // Steps that apply: route for a ferry flight, opponent for air to air.
  steps() { return STEPS.filter((st) => !(st.id === 'dest' && this.s.mode !== 'ferry') && !(st.id === 'opponent' && this.s.mode !== 'dogfight')); }
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
    else if (id === 'mode') opts = MODES.filter((m) => modeOk(m.id, this.ac())).map((m) => m.id);
    else if (id === 'dest') opts = this.routes().map((r) => r.id);
    else if (id === 'opponent') opts = OPPONENTS.map((o) => o.id);
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
    if (!modeOk(this.s.mode, a)) this.s.mode = 'ferry';
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
    $('.steptitle', r).textContent = `SECTION ${String(this.step + 1).padStart(2, '0')} · ${cur.title}`;
    // Tabs: ROUTE or OPPONENT (whichever this mission has; air to ground: ROUTE struck out).
    let n = 0;
    for (const b of r.querySelectorAll('.stepdot')) {
      const st = STEPS[+b.dataset.i];
      const idx = steps.indexOf(st);
      const hide = (st.id === 'opponent' && s.mode !== 'dogfight') || (st.id === 'dest' && s.mode === 'dogfight');
      b.hidden = hide;
      if (!hide) b.firstElementChild.textContent = String(++n).padStart(2, '0');
      b.classList.toggle('skip', idx < 0);
      b.classList.toggle('done', idx >= 0 && idx < this.step);
      b.classList.toggle('cur', st === cur);
    }
    for (const b of r.querySelectorAll('.accard:not(.opcard)')) b.classList.toggle('sel', b.dataset.id === s.aircraft);
    for (const b of r.querySelectorAll('.opcard')) b.classList.toggle('sel', b.dataset.id === s.opponent);
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
    const db = $('.seg.mode button[data-v="dogfight"]', r);
    db.disabled = !a.gun;
    db.querySelector('small').textContent = a.gun ? MODES[2].note : `Not available: the ${a.name} has no gun.`;
    // The order sheet fills in as you go: sections not reached yet read PENDING.
    const route = routes.find((x) => x.id === s.dest);
    const best = getBest(s);
    const reached = (id) => steps.findIndex((st) => st.id === id) <= this.step;
    const row = (k, id, v) => `<div class="drow${reached(id) ? '' : ' pend'}"><span>${k}</span><i></i><b>${esc(reached(id) ? v : 'PENDING')}</b></div>`;
    $('.mlog', r).innerHTML = [
      row('PILOT', 'pilot', `${a.rank} ${name}`),
      row('AIRCRAFT', 'aircraft', a.name.toUpperCase()),
      row('MISSION', 'mode', s.mode === 'strike' ? 'AIR TO GROUND' : s.mode === 'dogfight' ? 'AIR TO AIR' : 'FERRY FLIGHT'),
      s.mode === 'ferry' && row('ROUTE', 'dest', route ? route.label.toUpperCase() : ''),
      s.mode === 'dogfight' && row('OPPONENT', 'opponent', `${opponentById(s.opponent).name} · ${opponentById(s.opponent).difficulty}`.toUpperCase()),
      row('TIME OF DAY', 'time', TIMES[s.time].label.toUpperCase()),
      best && `<div class="drow"><span>BEST SCORE</span><i></i><b>${best}</b></div>`,
    ].filter(Boolean).join('');
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

// Pre-flight pop-up in the debrief's style: the briefing. Enter = start, Esc = back
// to the menu. The flight waits. (Owner 2026-11-20: no pilot's-notes pages before it.)
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
    this.renderBrief();
    this.shownAt = performance.now();
    this.root.classList.add('show');
  }

  next() { this.onStart(); }

  // The briefing: short rows in the official format, one line of orders.
  // The briefing (owner 2026-11-21: simple, report-like, no weapon names, no how-to):
  // a few short rows, the loadout by kind ("4 GUIDED BOMBS + GUN").
  renderBrief() {
    const f = this.f, opts = this.opts, d = f.data;
    const strike = f.mode === 'strike';
    const air = f.mode === 'dogfight';
    const pilot = `${d.rank} ${(opts.name || 'Shaheen').toUpperCase()}`;
    const row = (k, v) => `<div class="drow"><span>${k}</span><i></i><b>${esc(v)}</b></div>`;
    const dep = f.bases[0];
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 'S'}`;
    let rows, head, sub;
    if (air) {
      const df = f.df, o = df.opp;
      head = 'AIR COMBAT';
      sub = `${df.total} x ${o.name.toUpperCase()}`;
      rows = [
        row('DEPART', dep.short),
        row('OBJECTIVE', `DESTROY ${plural(df.total, 'BANDIT')}`),
        row('BANDIT', `${o.name.toUpperCase()} · ${o.difficulty}`),
        row('LOADOUT', 'GUN'),
        row('RECOVERY', 'AFTER THE FIGHT'),
      ];
    } else if (strike) {
      const objs = f.objectives;
      const sams = f.defences.filter((t) => t.role === 'sam').length;
      head = 'STRIKE MISSION';
      sub = plural(objs.length, 'GROUND TARGET');
      rows = [
        row('DEPART', dep.short),
        row('OBJECTIVE', `DESTROY ${plural(objs.length, 'TARGET')}`),
        row('THREAT', sams ? plural(sams, 'SAM SITE') : 'NONE KNOWN'),
        row('LOADOUT', `${plural(d.bombCount, (d.weaponLabel || 'weapon').toUpperCase().replace('LASER GUIDED', 'GUIDED').replace('AIR TO GROUND ', ''))}${d.gun ? ' + GUN' : ''}`),
        row('RECOVERY', 'AFTER THE STRIKE'),
      ];
    } else {
      const far = f.dest !== f.bases[1] && f.bases.length > 2;
      head = 'FERRY FLIGHT';
      sub = `${dep.short} TO ${f.dest.short}`;
      rows = [
        row('DEPART', dep.short),
        row('DESTINATION', f.dest.short),
        row('DISTANCE', `${Math.round(f.dest.x / 1000)} KM`),
        far && row('FUEL STOP', `${f.bases[1].short} IF LOW`),
      ];
    }
    const now = new Date();
    const ref = `SORTIE ${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
    this.root.innerHTML = `
      <div class="modal debrief brief ${strike || air ? 'warn' : 'ok'}">
        <div class="dhead"><span>PAKISTAN AIR FORCE</span><span>${strike || air ? 'MISSION BRIEFING' : 'FLIGHT ORDERS'}</span></div>
        <div class="dmeta"><span>${esc(`${pilot} · ${d.name}`.toUpperCase())}</span><span>${ref}</span></div>
        <div class="stamp"><div class="shead">${head}</div><div class="ssub">${esc(sub)}</div></div>
        <div class="drows">${rows.filter(Boolean).join('')}</div>
        <div class="dfoot">
          <div class="mbtns">
            <button class="go">Start mission <kbd>Enter</kbd></button>
            <button class="tomenu ghost">Main menu <kbd>Esc</kbd></button>
          </div>
        </div>
      </div>`;
    $('.go', this.root).onclick = () => this.onStart();
    $('.tomenu', this.root).onclick = () => this.onMenu();
  }


  // Ignore the Enter that opened it (menu FLY / Fly again fire on the same key press).
  get fresh() { return performance.now() - this.shownAt < 300; }
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
    const a = AIRCRAFT.find((x) => x.id === opts.aircraft) || AIRCRAFT[0];
    const pilot = `${a.rank} ${(opts.name || 'Shaheen').toUpperCase()}`;
    const strike = r.mode === 'strike';
    const crash = r.grade === 'CRASH';
    const wrongBase = r.grade === 'WRONG BASE';
    const mm = Math.floor(r.timeS / 60), ss = Math.floor(r.timeS % 60);
    // Headline stamp: what happened to the mission (strike) or the delivery (ferry).
    let head, sub = '', tone;
    const shot = crash && r.reasons.some((x) => x.startsWith('Shot down'));
    const air = r.mode === 'dogfight';
    if (air) {
      const { kills, total } = r.dogfight;
      if (crash) { head = 'MISSION FAILED'; sub = shot ? (r.ejected ? 'SHOT DOWN · PILOT EJECTED' : 'SHOT DOWN · PILOT LOST') : r.ejected ? 'AIRCRAFT LOST · PILOT EJECTED' : 'AIRCRAFT LOST'; tone = 'bad'; }
      else if (kills === total) { head = 'MISSION SUCCESSFUL'; sub = 'ALL BANDITS DESTROYED'; tone = 'ok'; }
      else if (kills > 0) { head = 'PARTIAL SUCCESS'; sub = `${total - kills} BANDIT${total - kills > 1 ? 'S' : ''} GOT AWAY`; tone = 'warn'; }
      else { head = 'MISSION FAILED'; sub = 'NO KILLS'; tone = 'bad'; }
    } else if (strike) {
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
    const dfr = r.dogfight;
    const rows = air ? [
      row('BANDITS DESTROYED', `${dfr.kills} / ${dfr.total} ${dfr.opponent.toUpperCase()}`, dfr.kills === dfr.total ? 'ok' : dfr.kills ? 'warn' : 'bad'),
      row('OPPONENT', `${dfr.opponent} · ${dfr.difficulty}`.toUpperCase()),
      row('HITS ON BANDITS', String(dfr.hits)),
      r.gun && row('GUN ROUNDS FIRED', `${r.gun.fired} / ${r.gun.total}`),
      row('BATTLE DAMAGE', `${r.damage}%`, r.damage >= 100 ? 'bad' : r.damage >= 50 ? 'warn' : r.damage > 0 ? '' : 'ok'),
      row('RECOVERY', !crash ? `${r.dest.toUpperCase()} · ${landing}` : landing, crash ? 'bad' : ''),
      row('FLIGHT TIME', `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`),
      row('FUEL USED', `${Math.round(r.fuelUsedKg)} KG`),
    ].filter(Boolean).join('') : [
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
        <div class="dhead"><span>PAKISTAN AIR FORCE</span><span>${strike || air ? 'MISSION DEBRIEF' : 'FERRY FLIGHT REPORT'}</span></div>
        <div class="dmeta">${esc(`${pilot} · ${a.name} · ${air ? 'AIR TO AIR' : strike ? 'AIR TO GROUND' : 'FERRY'}`.toUpperCase())}</div>
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
