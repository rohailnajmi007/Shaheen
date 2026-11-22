// Background music (owner 2026-11-22): plays from the first click / key press (browsers
// block sound before that), through the menus and the flight, one track after another,
// round and round. Player in the bottom right (src/ui/music.js): title, play / pause, next.
// Add a song: put the file in public/audio/ and add a line here (title as shown).
// vol: music volume (0-1, under the master volume); fadeS: fade in / out when it starts,
// stops, or changes track; duck: music level while the crash song plays (0 = silent).
export const MUSIC = {
  vol: 0.4,
  fadeS: 1.2,
  duck: 0,
  tracks: [
    { title: 'Aasmaan', file: '/audio/aasmaan.mp4' },
  ],
};
