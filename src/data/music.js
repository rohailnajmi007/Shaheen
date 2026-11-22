// Background music (owner 2026-11-22): plays from the first click / key press (browsers
// block sound before that), through the menus and the flight, one track after another,
// round and round, starting on a random one. Player in the bottom right (src/ui/music.js):
// title, play / pause, next.
// Add a song: put the file in public/audio/ and add a line here (title as shown; start =
// seconds into the file where it begins playing).
// vol: louder in the menus, the pre-flight briefing and the debrief; flightVol: quieter in
// the background while flying (owner). nextOnMission: change to the next song when the
// mission starts (the briefing closes). fadeS: fade in / out (starts, stops, track
// changes, louder / quieter); duck: music level while the crash song plays (0 = silent).
export const MUSIC = {
  vol: 0.6,
  flightVol: 0.2,
  nextOnMission: true,
  fadeS: 1.2,
  duck: 0,
  tracks: [
    { title: 'Aasmaan', file: '/audio/aasmaan.mp4', start: 0 },
    { title: 'Sher Dil', file: '/audio/sherdil.mp4', start: 23 },
    { title: 'Jazba', file: '/audio/jazba.mp4', start: 23 },
  ],
};
