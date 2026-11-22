// Background music player (owner 2026-11-22): bottom right, the song's title with play /
// pause and next. Plays its own <audio> element (not through the Web Audio graph), so the
// pause screen (which suspends that graph) does not cut the music; mute (M) silences it.
// Tracks and volumes: MUSIC in src/data/music.js.
import { MUSIC } from '../data/music.js';

const ICON = {
  note: '<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.6" fill="currentColor"/><circle cx="17.5" cy="16" r="2.6" fill="currentColor"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M5 5l9 7-9 7zM16 5h3v14h-3z" fill="currentColor"/></svg>',
};

export class MusicPlayer {
  constructor(root) {
    this.root = root;
    this.tracks = MUSIC.tracks;
    this.i = 0;
    this.el = new Audio();
    this.el.preload = 'auto';
    this.el.addEventListener('ended', () => this.next(true));
    this.el.addEventListener('error', () => { this.failed = true; this.render(); });
    this.wanted = false;  // the player wants music (play pressed, or the automatic start)
    this.started = false; // the first click / key press has happened
    this.muted = false;
    this.ducked = false;  // the crash song is playing
    this.level = 0;       // current fade level 0..1
    this.fadeTo = 0;
    this.timer = null;
    if (!this.tracks.length) { root.style.display = 'none'; return; }
    root.innerHTML = `
      <span class="mnote">${ICON.note}</span>
      <span class="mtitle"></span>
      <button class="mbtn mplay" tabindex="-1" aria-label="Play or pause"></button>
      <button class="mbtn mnext" tabindex="-1" aria-label="Next song">${ICON.next}</button>`;
    // Buttons never keep the keyboard focus (Space fires the weapon, not the button).
    for (const b of root.querySelectorAll('button')) b.addEventListener('mousedown', (e) => e.preventDefault());
    root.querySelector('.mplay').addEventListener('click', () => this.toggle());
    root.querySelector('.mnext').addEventListener('click', () => this.next());
    this.load(0);
    this.render();
  }

  // The first click or key press: start playing (browsers allow sound only after one).
  start() {
    if (this.started || !this.tracks.length) return;
    this.started = true;
    this.wanted = true;
    this.play();
  }

  load(i) {
    this.i = (i + this.tracks.length) % this.tracks.length;
    this.failed = false;
    this.el.src = this.tracks[this.i].file;
    this.render();
  }

  play() {
    this.started = true;
    this.el.play().then(() => this.fade(this.target())).catch(() => { /* blocked or missing: stays quiet */ });
    this.render();
  }

  toggle() {
    if (!this.started) { this.start(); return; }
    this.wanted = !this.wanted;
    if (this.wanted) this.play();
    else this.fade(0, () => this.el.pause());
    this.render();
  }

  // Next track (auto: the last one ended, so no fade-out needed).
  next(auto = false) {
    const go = () => { this.load(this.i + 1); if (this.wanted) this.play(); };
    if (auto || !this.wanted || this.el.paused) { this.level = 0; this.apply(); go(); } else this.fade(0, go);
  }

  setMuted(m) { this.muted = m; this.apply(); }
  // Crash song on / off: the music makes room for it.
  duck(on) { this.ducked = on; if (this.wanted && !this.el.paused) this.fade(this.target()); }

  target() { return this.ducked ? MUSIC.duck : 1; }
  apply() { this.el.volume = this.muted ? 0 : Math.max(0, Math.min(1, this.level * MUSIC.vol)); }

  fade(to, done) {
    clearInterval(this.timer);
    const from = this.level, t0 = performance.now(), ms = MUSIC.fadeS * 1000;
    this.timer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      this.level = from + (to - from) * k;
      this.apply();
      if (k >= 1) { clearInterval(this.timer); if (done) done(); }
    }, 40);
  }

  render() {
    if (!this.tracks.length) return;
    const t = this.tracks[this.i];
    this.root.querySelector('.mtitle').textContent = this.failed ? `${t.title} (missing)` : t.title;
    this.root.querySelector('.mplay').innerHTML = this.wanted ? ICON.pause : ICON.play;
    this.root.classList.toggle('on', this.wanted && this.started);
  }
}
