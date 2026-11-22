// Background music (owner 2026-11-22): plays from the first click / key press (browsers
// block sound before that), through the menus and the flight, one track after another,
// round and round, always starting with the era's first one (modern: Aasmaan). Player in the bottom right (src/ui/music.js):
// title, play / pause, next.
// Add a song: put the file in public/audio/ and add a line here (title as shown; start =
// seconds into the file where it begins playing; era = which era's playlist it is in:
// 'modern' (default) or '1965' (owner 2026-11-22: the 1965 songs play only when the 1965
// era is picked on the start screen or a 1965 jet is flying; each playlist starts at its first song).
// vol: louder in the menus, the pre-flight briefing and the debrief; flightVol: quieter in
// the background while flying (owner). The song keeps playing when the mission starts
// (owner 2026-11-22: the change of song there was dropped). fadeS: fade in / out (starts,
// stops, track changes, louder / quieter); duck: music level while the crash song plays (0 = silent).
export const MUSIC = {
  vol: 0.6,
  flightVol: 0.2,
  fadeS: 1.2,
  duck: 0,
  tracks: [
    { title: 'Aasmaan', file: '/audio/aasmaan.mp4', start: 0 },
    { title: 'Sher Dil', file: '/audio/sherdil.mp4', start: 24 },
    { title: 'Jazba', file: '/audio/jazba.mp4', start: 23 },
    { title: 'Main Urra', file: '/audio/mainurra.mp4', start: 0 },
    { title: 'Aesay Hum Jiyen', file: '/audio/aesayhumjiyen.mp4', start: 65, era: '1965' },
    { title: 'In Fizaon Se Aagay', file: '/audio/fizaonseaagay.mp4', start: 78, era: '1965' },
  ],
};
