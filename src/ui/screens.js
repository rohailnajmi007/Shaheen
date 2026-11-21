// Start menu, pause menu and result screen (HTML).
import { AIRCRAFT } from '../data/aircraft.js';
import { BASES, routesFrom, TIMES } from '../data/world.js';
import { KEY_HELP } from '../input.js';
import { AAMS } from '../data/combat.js';
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

// Start screen (owner 2026-11-21 revamp): full screen, military report style, one
// question per page and nothing else on it. NAME (wings appear) -> MISSION (three boxes)
// -> AIRCRAFT (those that can fly it) -> ROUTE (ferry) / OPPONENT (air to air) -> TIME
// -> the sortie order (wings, name, aircraft, mission, time) -> FLY.
// Enter = next, Esc = back, left / right = change the choice.
const STEPS = [
  { id: 'pilot', title: 'Enter your name' },
  { id: 'mode', title: 'Choose your mission' },
  { id: 'aircraft', title: 'Choose your aircraft' },
  { id: 'dest', title: 'Choose your destination' },
  { id: 'opponent', title: 'Choose your opponent' },
  { id: 'time', title: 'Time of day' },
  { id: 'report', title: 'Sortie order' },
];
// Simple line icons (stroke = currentColor).
// Map pin before the home base on the aircraft cards (owner 2026-11-21).
const PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.6A2.6 2.6 0 1 1 12 6.4a2.6 2.6 0 0 1 0 5.2z" fill="currentColor"/></svg>';
const ICON = {
  // A jet on a dashed route from one base to another.
  ferry: '<svg viewBox="0 0 96 64"><path d="M10 50 Q48 4 86 50" fill="none" stroke-dasharray="5 5"/><circle cx="10" cy="52" r="4"/><circle cx="86" cy="52" r="4"/><path d="M38 24 l16 0 l8 -6 l3 0 l-4 7 l7 1 l0 3 l-7 1 l4 7 l-3 0 l-8 -6 l-16 0 z" fill="currentColor" stroke="none"/></svg>',
  // A bomb falling on a target on the ground.
  strike: '<svg viewBox="0 0 96 64"><path d="M48 6 c6 0 9 6 9 14 c0 8 -4 14 -9 18 c-5 -4 -9 -10 -9 -18 c0 -8 3 -14 9 -14 z" fill="currentColor" stroke="none"/><path d="M42 8 l-5 -5 h22 l-5 5"/><path d="M14 58 h68"/><path d="M30 52 l6 -8 M66 52 l-6 -8 M48 50 v-6"/></svg>',
  // A gunsight on an enemy jet.
  dogfight: '<svg viewBox="0 0 96 64"><circle cx="48" cy="32" r="22"/><path d="M48 4 v12 M48 48 v12 M20 32 h12 M64 32 h12"/><path d="M36 33 l14 0 l6 -5 l3 0 l-3 6 l6 1 l0 2 l-6 1 l3 6 l-3 0 l-6 -5 l-14 0 z" fill="currentColor" stroke="none"/></svg>',
};
const TIME_ICON = {
  dawn: '<svg viewBox="0 0 96 64"><path d="M8 48 h80"/><path d="M28 48 a20 20 0 0 1 40 0" fill="none"/><path d="M48 14 v8 M24 24 l5 5 M72 24 l-5 5"/></svg>',
  day: '<svg viewBox="0 0 96 64"><circle cx="48" cy="32" r="12"/><path d="M48 6 v8 M48 50 v8 M22 32 h8 M66 32 h8 M30 14 l5 5 M66 14 l-5 5 M30 50 l5 -5 M66 50 l-5 -5"/></svg>',
  dusk: '<svg viewBox="0 0 96 64"><path d="M8 48 h80 M20 56 h56"/><path d="M30 48 a18 18 0 0 1 36 0" fill="currentColor" stroke="none" opacity="0.5"/><path d="M30 48 a18 18 0 0 1 36 0"/></svg>',
  night: '<svg viewBox="0 0 96 64"><path d="M54 10 a22 22 0 1 0 18 34 a18 18 0 0 1 -18 -34 z"/><path d="M22 14 l1 3 3 1 -3 1 -1 3 -1 -3 -3 -1 3 -1 z M78 16 l1 2 2 1 -2 1 -1 2 -1 -2 -2 -1 2 -1 z" fill="currentColor"/></svg>',
};
const MODES = [
  { id: 'ferry', label: 'Ferry', note: 'Take off from your home base and deliver the jet to another PAF base.' },
  { id: 'strike', label: 'Air to ground', note: 'Destroy the enemy ground targets past their SAMs, then land.' },
  { id: 'dogfight', label: 'Air to air', note: 'Shoot down the enemy fighters with your gun, then land.' },
];
// Name length (owner 2026-11-21): only what fits on the flying name tag (HUD .nameplate:
// 168 px wide, 10 px padding each side; .tagname 20 px bold, 0.22em spacing plus a
// 0.22em left pad). Measured in the tag's own font, so wide letters count for more.
const TAG = { font: '700 20px "Chakra Petch", sans-serif', px: 20, spacingEm: 0.22, innerPx: 148 };
let tagCtx = null;
function fitsTag(s) {
  tagCtx = tagCtx || document.createElement('canvas').getContext('2d');
  tagCtx.font = TAG.font;
  const t = s.trim().toUpperCase();
  return tagCtx.measureText(t).width + (t.length + 1) * TAG.spacingEm * TAG.px <= TAG.innerPx;
}
function fitName(s) { let t = s; while (t && !fitsTag(t)) t = t.slice(0, -1); return t; }
const MODE_NAME = { ferry: 'FERRY FLIGHT', strike: 'AIR TO GROUND', dogfight: 'AIR TO AIR' };
// Which missions an aircraft can fly.
const modeOk = (m, a) => (a.modes || ['ferry']).includes(m);
// What it carries, by kind, one line each (owner 2026-11-21): "4 laser guided bombs", "20 mm cannon".
// Per mission (owner 2026-11-21): air to ground lists the strike weapon, air to air the
// missiles; the gun goes on both; ferry lists everything the jet can carry.
function armament(a, mode = 'ferry') {
  const out = [];
  if (mode !== 'dogfight' && a.strikeCapable && a.weaponLabel) out.push(`${a.bombCount} ${a.weaponLabel.toLowerCase()}s`);
  if (mode !== 'strike' && a.aam) out.push(`${a.aam.count} ${AAMS[a.aam.type].short} missiles`);
  const cal = a.gun && /(\d+)\s*MM/i.exec(a.gun.name);
  if (a.gun) out.push(cal ? `${cal[1]} mm cannon` : 'cannon');
  return (out.length ? out : ['Unarmed']).map((l) => `<span>${l}</span>`).join('');
}

export class Menu {
  constructor(root, settings, { onFly, onChange, sound }) {
    this.root = root;
    this.s = settings;
    this.onFly = onFly;
    this.onChange = onChange;
    this.sound = sound;
    this.step = 0;
    const base = import.meta.env.BASE_URL;
    const wings = (c) => `${base}sprites/paf_pilot_wings_${c}.png`;
    this.wingsSrc = wings;
    root.innerHTML = `
      <div class="menu-wrap sheet full">
        <div class="dhead"><span>PAKISTAN AIR FORCE</span><span class="mform"></span><span>RESTRICTED</span></div>
        <div class="mbody">
          <h2 class="steptitle"></h2>
          <section class="page" data-step="pilot">
            <input class="pname" maxlength="16" placeholder="YOUR NAME" spellcheck="false" autocomplete="off" />
            <div class="nameplate mplate"><div class="rank"></div><img class="wings" src="${wings('white')}" alt="" /><div class="tagname"></div></div>
          </section>
          <section class="page" data-step="mode">
            <div class="mcards">${MODES.map((m) => `
              <button class="mcard" data-v="${m.id}"><div class="micon">${ICON[m.id]}</div><b>${m.label}</b><small>${m.note}</small></button>`).join('')}
            </div>
          </section>
          <section class="page" data-step="aircraft">
            <div class="mcards acs">${AIRCRAFT.map((a) => `
              <button class="mcard accard" data-id="${a.id}">
                <div class="acimg"><img src="${base}sprites/${a.sprite}.png" alt="" />${[a.elevatorSprite, a.canardSprite].filter(Boolean).map((l) => `<img src="${base}sprites/${l}.png" alt="" />`).join('')}</div>
                <b>${a.name}</b>
                <span class="acrole">${a.role}</span>
                <small class="acwpn">${armament(a)}</small>
                <small class="achome">${PIN}${BASES[a.homeBase]?.name || ''}</small>
              </button>`).join('')}
            </div>
          </section>
          <section class="page" data-step="dest"><div class="mcards dest"></div></section>
          <section class="page" data-step="opponent">
            <div class="mcards">${OPPONENTS.map((o) => `
              <button class="mcard opcard" data-id="${o.id}">
                <div class="acimg"><img src="${base}sprites/${o.sprite}.png" alt="" /></div>
                <b>${o.name}</b>
                <span class="acrole diff ${o.difficulty.toLowerCase()}">${o.difficulty}</span>
              </button>`).join('')}
            </div>
          </section>
          <section class="page" data-step="time">
            <div class="mcards times">${Object.entries(TIMES).map(([k, t]) => `
              <button class="mcard" data-v="${k}"><div class="micon">${TIME_ICON[k] || ''}</div><b>${t.label}</b></button>`).join('')}
            </div>
          </section>
          <section class="page" data-step="report">
            <div class="order">
              <div class="odmeta"></div>
              <div class="stamp"><div class="shead">SORTIE AUTHORISED</div><div class="ssub"></div></div>
              <div class="obody">
                <div class="nameplate mplate on"><div class="rank"></div><img class="wings" alt="" /><div class="tagname"></div></div>
                <div class="drows olog"></div>
              </div>
              <div class="osign"><span>AUTHORISED</span><i></i><span>OC FLYING WING</span></div>
            </div>
          </section>
        </div>
        <footer class="mfoot">
          <button class="ghost back">Back <kbd>Esc</kbd></button>
          <button class="fly next">Next <kbd>Enter</kbd></button>
        </footer>
      </div>`;
    const name = $('.pname', root);
    name.value = settings.name;
    name.addEventListener('input', () => {
      // Refuse what wouldn't fit on the wings tag.
      const fit = fitName(name.value);
      if (fit !== name.value) { const p = Math.min(name.selectionStart ?? fit.length, fit.length); name.value = fit; name.setSelectionRange(p, p); this.flashFull(); }
      this.s.name = name.value; saveSettings(this.s); this.refresh();
    });
    for (const b of root.querySelectorAll('.accard')) b.addEventListener('click', () => { if (!b.disabled) this.pick('aircraft', b.dataset.id); });
    for (const b of root.querySelectorAll('.opcard')) b.addEventListener('click', () => this.pick('opponent', b.dataset.id));
    for (const [sel, key] of [['[data-step="mode"] .mcard', 'mode'], ['.times .mcard', 'time']]) {
      for (const b of root.querySelectorAll(sel)) b.addEventListener('click', () => { if (!b.disabled) this.pick(key, b.dataset.v); });
    }
    // Route boxes depend on the aircraft's home base: rebuilt in refresh().
    $('.mcards.dest', root).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) this.pick('dest', b.dataset.v); });
    // Double click / second tap on the chosen box = next.
    root.addEventListener('dblclick', (e) => { if (e.target.closest('.mcard')) this.next(); });
    $('.next', root).addEventListener('click', () => this.next());
    $('.back', root).addEventListener('click', () => this.back());
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

  // Name too long: the box shakes and says FULL for a moment.
  flashFull() {
    const n = $('.pname', this.root);
    n.classList.remove('full'); void n.offsetWidth; n.classList.add('full');
  }

  // Steps that apply: destination for a ferry flight, opponent for air to air.
  steps() { return STEPS.filter((st) => !(st.id === 'dest' && this.s.mode !== 'ferry') && !(st.id === 'opponent' && this.s.mode !== 'dogfight')); }
  current() { return this.steps()[Math.min(this.step, this.steps().length - 1)]; }
  named() { return !!(this.s.name || '').trim(); }

  go(i) {
    this.step = Math.max(0, Math.min(i, this.steps().length - 1));
    this.sound.click();
    this.refresh();
    if (this.current().id === 'pilot') setTimeout(() => $('.pname', this.root).focus(), 0);
  }
  next() {
    if (this.current().id === 'pilot' && !this.named()) { $('.pname', this.root).focus(); return; }
    if (this.step >= this.steps().length - 1) { this.fly(); return; }
    this.go(this.step + 1);
  }
  back() { if (this.step > 0) this.go(this.step - 1); }

  // Aircraft that can fly the chosen mission.
  fleet() { return AIRCRAFT.filter((a) => modeOk(this.s.mode, a)); }

  // Left / right on a choice page.
  cycle(dir) {
    const id = this.current().id;
    let opts;
    if (id === 'aircraft') opts = this.fleet().map((a) => a.id);
    else if (id === 'mode') opts = MODES.map((m) => m.id);
    else if (id === 'dest') opts = this.routes().map((r) => r.id);
    else if (id === 'opponent') opts = OPPONENTS.map((o) => o.id);
    else if (id === 'time') opts = Object.keys(TIMES);
    else return;
    const i = opts.indexOf(this.s[id]);
    this.pick(id, opts[(i + dir + opts.length) % opts.length]);
  }

  ac() { return AIRCRAFT.find((x) => x.id === this.s.aircraft); }

  // Ferry routes from the selected aircraft's home base.
  routes() { return routesFrom(this.ac().homeBase); }

  pick(key, v) {
    this.s[key] = v;
    let visual = key === 'aircraft' || key === 'time';
    // The mission comes first now: keep the aircraft one that can fly it.
    if (!modeOk(this.s.mode, this.ac())) { this.s.aircraft = this.fleet()[0].id; visual = true; }
    this.changed(visual);
  }

  fly() {
    this.sound.click();
    this.onFly({ ...this.s });
  }

  changed(visual) {
    this.sound.click();
    if (!modeOk(this.s.mode, this.ac())) this.s.aircraft = this.fleet()[0].id;
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
    if (!modeOk(this.s.mode, this.ac())) this.s.aircraft = this.fleet()[0].id;
    this.fixDest();
    const s = this.s;
    const r = this.root;
    const steps = this.steps();
    const cur = this.current();
    const a = this.ac();
    for (const p of r.querySelectorAll('.page')) p.classList.toggle('on', p.dataset.step === cur.id);
    $('.steptitle', r).textContent = cur.title;
    $('.mform', r).textContent = `FORM ${String(this.step + 1).padStart(2, '0')} / ${String(steps.length).padStart(2, '0')}`;
    const name = (s.name || '').trim().toUpperCase();
    // Name page: the wings appear once there is a name.
    const np = $('[data-step="pilot"] .mplate', r);
    np.classList.toggle('on', !!name);
    $('.tagname', np).textContent = name;
    for (const b of r.querySelectorAll('[data-step="mode"] .mcard')) b.classList.toggle('sel', b.dataset.v === s.mode);
    for (const b of r.querySelectorAll('.accard')) {
      // Every jet is listed; the ones that don't fly this mission are greyed out.
      const acd = AIRCRAFT.find((x) => x.id === b.dataset.id);
      b.disabled = !modeOk(s.mode, acd);
      const wl = armament(acd, s.mode);
      if (b._wpn !== wl) { b._wpn = wl; b.querySelector('.acwpn').innerHTML = wl; }
      b.classList.toggle('sel', b.dataset.id === s.aircraft);
    }
    for (const b of r.querySelectorAll('.opcard')) b.classList.toggle('sel', b.dataset.id === s.opponent);
    for (const b of r.querySelectorAll('.times .mcard')) b.classList.toggle('sel', b.dataset.v === s.time);
    const routes = this.routes();
    const rk = routes.map((x) => x.id).join();
    if (this.routeKey !== rk) {
      this.routeKey = rk;
      $('.mcards.dest', r).innerHTML = routes.map((x) => `<button class="mcard" data-v="${x.id}"><div class="micon">${ICON.ferry}</div><b>${BASES[x.id].name}</b><small>${x.km} km</small></button>`).join('');
    }
    for (const b of r.querySelectorAll('.mcards.dest .mcard')) b.classList.toggle('sel', b.dataset.v === s.dest);
    // The sortie order.
    if (cur.id === 'report') {
      const now = new Date();
      const p2 = (n) => String(n).padStart(2, '0');
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      $('.odmeta', r).innerHTML = `<span>SORTIE NO. ${p2(now.getHours())}${p2(now.getMinutes())}/${p2(now.getDate())}</span><span>${p2(now.getDate())} ${months[now.getMonth()]} ${now.getFullYear()}</span>`;
      $('.ssub', r).textContent = MODE_NAME[s.mode];
      const op = $('[data-step="report"] .mplate', r);
      $('.rank', op).textContent = a.rank;
      $('.wings', op).src = this.wingsSrc(a.rankBadge);
      $('.tagname', op).textContent = name;
      const route = routes.find((x) => x.id === s.dest);
      const o = opponentById(s.opponent);
      const best = getBest(s);
      const row = (k, v) => `<div class="drow"><span>${k}</span><i></i><b>${esc(v)}</b></div>`;
      $('.olog', r).innerHTML = [
        row('PILOT', `${a.rankFull} ${name}`.toUpperCase()),
        row('AIRCRAFT', a.name.toUpperCase()),
        row('MISSION', MODE_NAME[s.mode]),
        s.mode === 'ferry' && route && row('DESTINATION', BASES[route.id].name.toUpperCase()),
        s.mode === 'dogfight' && row('OPPONENT', `${o.name} · ${o.difficulty}`.toUpperCase()),
        row('TIME OF DAY', TIMES[s.time].label.toUpperCase()),
        best && row('BEST SCORE', String(best)),
      ].filter(Boolean).join('');
    }
    const last = this.step >= steps.length - 1;
    const nx = $('.next', r);
    nx.innerHTML = last ? 'FLY <kbd>Enter</kbd>' : 'Next <kbd>Enter</kbd>';
    nx.classList.toggle('go', last);
    nx.disabled = cur.id === 'pilot' && !name;
    $('.back', r).style.visibility = this.step > 0 ? 'visible' : 'hidden';
  }

  show() {
    // A saved name from before the limit: trim it to the tag (fonts are loaded by now).
    const fit = fitName(this.s.name || '');
    if (fit !== this.s.name) { this.s.name = fit; $('.pname', this.root).value = fit; saveSettings(this.s); }
    this.root.classList.add('show');
    this.refresh();
    if (this.current().id === 'pilot') setTimeout(() => $('.pname', this.root).focus(), 0);
  }
  hide() { this.root.classList.remove('show'); }
}

export class Pause {
  // Pause menu (owner 2026-11-21: simpler): three big buttons, one volume slider with a
  // mute button, graphics Low / Medium / High, and the controls behind a button.
  constructor(root, settings, { onResume, onRestart, onMenu, onVolume, onQuality }) {
    this.root = root;
    root.innerHTML = `
      <div class="modal debrief pausebox">
        <div class="dhead"><span>PAKISTAN AIR FORCE</span><span>PAUSED</span></div>
        <div class="pbtns">
          <button class="resume">Resume <kbd>Esc</kbd></button>
          <button class="restart">Restart <kbd>R</kbd></button>
          <button class="tomenu">Main menu</button>
        </div>
        <div class="psets">
          <div class="pset"><span>Volume</span>
            <div class="pvol"><button class="pmute" aria-label="Mute"></button><input type="range" min="0" max="100" class="pvolr" value="${Math.round(settings.vol.master * 100)}"></div>
          </div>
          <div class="pset"><span>Graphics</span>
            <div class="pseg">${[['low', 'Low'], ['medium', 'Medium'], ['high', 'High']].map(([v, t]) => `<button data-q="${v}">${t}</button>`).join('')}</div>
          </div>
        </div>
        <button class="pkeysbtn">Controls</button>
        <div class="klist">${KEY_HELP.map(([k, t]) => `<div><kbd>${k}</kbd><span>${t}</span></div>`).join('')}</div>
      </div>`;
    $('.resume', root).onclick = onResume;
    $('.restart', root).onclick = onRestart;
    $('.tomenu', root).onclick = onMenu;
    const vol = $('.pvolr', root), mute = $('.pmute', root);
    let before = settings.vol.master || 0.8;
    const showMute = () => { const off = +vol.value === 0; mute.classList.toggle('off', off); mute.textContent = off ? 'OFF' : 'ON'; };
    vol.oninput = () => { onVolume('master', vol.value / 100); showMute(); };
    mute.onclick = () => {
      if (+vol.value > 0) { before = vol.value / 100; vol.value = 0; } else vol.value = Math.round((before || 0.8) * 100);
      vol.oninput();
    };
    showMute();
    const seg = root.querySelectorAll('.pseg button');
    const showQ = (q) => { for (const b of seg) b.classList.toggle('sel', b.dataset.q === q); };
    for (const b of seg) b.onclick = () => { onQuality(b.dataset.q); showQ(b.dataset.q); };
    showQ(settings.quality);
    $('.pkeysbtn', root).onclick = () => root.querySelector('.pausebox').classList.toggle('showkeys');
  }
  show() { this.root.classList.add('show'); }
  hide() { this.root.classList.remove('show'); this.root.querySelector('.pausebox').classList.remove('showkeys'); }
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
