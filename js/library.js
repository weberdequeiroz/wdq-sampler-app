// Biblioteca de fábrica do WDQ Sampler: kits por estilo, cada um com 16 sons
// sintetizados e bases (beats) prontas.
// Notação das bases: '.' vazio, 'o' suave (60), 'x' normal (100), 'X' acento (127),
// 'r' / 't' / 'q' = repetição de 2 / 3 / 4 notas dentro do passo (rolls de trap).
// Uma linha mais curta que o pattern se repete até preencher.

const S = (n, t, p = {}, o = {}) => ({ n, t, p, ...o });
const HAT = (n = 'Chimbal', decay = 0.045, extra = {}) => S(n, 'hat', { decay, ...extra }, { choke: 1 });
const OHAT = (n = 'Chimbal Aberto', decay = 0.3, extra = {}) => S(n, 'hat', { decay, hp: 6500, ...extra }, { choke: 1 });

export const KITS = [
  {
    id: 'funk-rio', genre: 'Funk Rio', name: 'Tamborzão Rio', bpm: 130, swing: 52, color: '#ff2d55',
    desc: 'O baile carioca: atabaques do tamborzão, 808 grave, apito e laser.',
    pads: [
      S('Kick Funk', 'kick', { f0: 190, f1: 52, pd: 0.05, decay: 0.32, click: 0.5, drive: 0.45 }),
      S('808 Funk', 'k808', { note: 31, decay: 0.8, drive: 0.55, punch: 2.8 }),
      S('Caixa Funk', 'snare', { tone: 210, noiseDecay: 0.16, toneDecay: 0.09, drive: 0.3 }),
      S('Palma Rio', 'clap', { decay: 0.18, freq: 1300 }),
      S('Atabaque Grave', 'conga', { freq: 110, decay: 0.32, slap: 0.15, bend: 1.3, drive: 0.25 }),
      S('Atabaque Médio', 'conga', { freq: 165, decay: 0.26, slap: 0.3, bend: 1.2, drive: 0.2 }),
      S('Atabaque Agudo', 'conga', { freq: 245, decay: 0.2, slap: 0.45, drive: 0.15 }),
      HAT('Chimbal', 0.04),
      OHAT('Chimbal Aberto', 0.28),
      S('Shaker', 'shaker', {}),
      S('Apito Fiu-Fiu', 'whistle', { hits: [[0, 0.12], [0.16, 0.28]] }),
      S('Laser Funk', 'zap', { f0: 4200, f1: 120, dur: 0.18 }),
      S('Vox Hey!', 'vox', { vowels: 'ei', f0: 230, f1: 200, dur: 0.28, h: true }),
      S('Tambor de Mão', 'tom', { f0: 180, f1: 120, decay: 0.25, drive: 0.3 }),
      S('Stab Funk', 'stab', { notes: [50, 53, 57], cutoff: 1200, env: 4000, decay: 0.3, drive: 0.3 }),
      S('Sub Drop', 'impact', { f0: 110, f1: 30, dur: 1.6, noise: 0.2 }),
    ],
    beats: [
      { name: 'Tamborzão', tracks: { 0: 'X..x..X...x..x..', 1: 'X.........x.....', 2: '....X.......X...', 3: '....x.......x..x', 4: 'x.....x.x.....x.', 5: '...x..x....x.x..', 6: '..o.......o....o', 7: 'o.o.o.o.o.o.o.o.' } },
      { name: 'Tamborzão + Apito', from: 0, len: 32, tracks: { 10: '........................x.......', 12: 'X...............................', 11: '..............x.................' } },
      { name: 'Montagem', tracks: { 0: 'X..x..X...x..x..', 1: 'X..x......x..x..', 2: '....X.......X...', 14: 'x.....x.....x...', 11: '..........x.....', 8: '..x...x...x...x.' } },
      { name: 'Virada', tracks: { 0: 'X...............', 4: 'x.x.x.x.x.x.xxxx', 5: '.x.x.x.x.x.x....', 2: '........x.x.XXXX', 15: 'X...............' } },
      { name: 'Break 808', tracks: { 1: 'X.....X...X.....', 12: 'X...............', 7: '..x...x...x...x.' } },
    ],
  },
  {
    id: 'funk-150', genre: 'Funk 150', name: 'Mandelão 150', bpm: 150, swing: 50, color: '#ff6b00',
    desc: 'Funk 150 BPM estilo SP/BH: tuim, 808 saturado e beat metálico.',
    pads: [
      S('Kick 150', 'kick', { f0: 220, f1: 55, pd: 0.04, decay: 0.28, drive: 0.6, click: 0.5 }),
      S('808 Mandelão', 'k808', { note: 29, decay: 0.6, drive: 0.8, punch: 3 }),
      S('Caixa Seca', 'snare', { tone: 240, noiseDecay: 0.1, toneDecay: 0.07, drive: 0.4 }),
      S('Palma 150', 'clap', { decay: 0.15, freq: 1400 }),
      S('Tuim', 'bell', { note: 88, ratio: 3.5, index: 6, decay: 0.35 }),
      S('Tuim Grave', 'bell', { note: 76, ratio: 3.5, index: 5, decay: 0.4 }),
      S('Beat Metal', 'metal', { f: 1200, decay: 0.25 }),
      HAT('Chimbal', 0.035),
      OHAT('Chimbal Aberto', 0.22),
      S('Atabaque Sujo', 'conga', { freq: 150, decay: 0.22, slap: 0.35, drive: 0.35 }),
      S('Bumbo Seco', 'kick', { f0: 140, f1: 60, decay: 0.15, drive: 0.7 }),
      S('Vox Ah', 'vox', { vowels: 'a', f0: 210, dur: 0.3 }),
      S('Vox Oh', 'vox', { vowels: 'o', f0: 180, dur: 0.3, h: true }),
      S('Laser 150', 'zap', { f0: 3000, f1: 100, dur: 0.15 }),
      S('Sirene Curta', 'siren', { dur: 1.2, rate: 2 }),
      S('Riser', 'riser', { dur: 1.6 }),
    ],
    beats: [
      { name: 'Mandelão', tracks: { 0: 'X..x..x.X..x..x.', 1: 'X.......X.......', 2: '....X.......X...', 4: '..x...x...x.x...', 9: 'x...........x...', 7: 'x.x.x.x.x.x.x.x.' } },
      { name: 'Tuim Total', from: 0, tracks: { 4: 'x.x.x..x.x.x..x.', 5: '...x.......x....', 6: '.x.......x......' } },
      { name: 'Virada 150', tracks: { 0: 'X.X.X.X.XXXXXXXX', 2: '....x...x.x.xxxx', 1: 'X...............', 13: '............x...' } },
      { name: 'Drop', tracks: { 1: 'X...X...X..X.X..', 11: 'X...............', 13: '........X.......' } },
    ],
  },
  {
    id: 'brega-funk', genre: 'Brega Funk', name: 'Brega Funk Recife', bpm: 160, swing: 50, color: '#ff3ea5',
    desc: 'O brega funk pernambucano: synth marcante, palmas e 808.',
    pads: [
      S('Kick Brega', 'kick', { f0: 180, f1: 50, decay: 0.3, drive: 0.5 }),
      S('808 Brega', 'k808', { note: 33, decay: 0.7, drive: 0.5 }),
      S('Caixa Brega', 'snare', { tone: 200, noiseDecay: 0.14 }),
      S('Palma Brega', 'clap', { decay: 0.2 }),
      HAT(), OHAT(),
      S('Shaker', 'shaker', {}),
      S('Conga', 'conga', { freq: 220 }),
      S('Synth Brega', 'stab', { notes: [64, 67, 71], wave: 'square', cutoff: 2500, env: 3000, decay: 0.25, detune: 12 }),
      S('Synth Lead', 'stab', { notes: [76], wave: 'sawtooth', cutoff: 3000, decay: 0.2 }),
      S('Piano Brega', 'keys', { notes: [60, 64, 67] }),
      S('Vox Hey!', 'vox', { vowels: 'ei', f0: 240, dur: 0.25, h: true }),
      S('Laser', 'zap', {}),
      S('Riser', 'riser', { dur: 1.5 }),
      S('Crash', 'cymbal', {}),
      S('Tom', 'tom', {}),
    ],
    beats: [
      { name: 'Brega Funk', tracks: { 0: 'X..x..x...x.x...', 1: 'X.........x.....', 2: '....X.......X...', 3: '....x.......x..x', 4: 'x.x.x.x.x.x.x.x.', 8: '..x..x..x..x..x.' } },
      { name: 'Brega + Lead', from: 0, tracks: { 9: 'x..x..x.x..x.x..' } },
      { name: 'Virada', tracks: { 0: 'X...............', 15: '........xx.xx.xx', 2: '....x...x.x.XXXX', 14: 'X...............' } },
    ],
  },
  {
    id: 'boom-bap', genre: 'Rap', name: 'Rap Boom Bap', bpm: 90, swing: 58, color: '#ffb000',
    desc: 'Rap nacional e anos 90: batida empoeirada, piano, scratch e vinil.',
    pads: [
      S('Kick Empoeirado', 'kick', { f0: 120, f1: 45, decay: 0.4, click: 0.2, lp: 3500, drive: 0.2 }),
      S('Caixa Boom Bap', 'snare', { tone: 180, noiseDecay: 0.22, hp: 900, lp: 7000, drive: 0.2 }),
      S('Rimshot', 'rim', {}),
      HAT('Chimbal Vinil', 0.045, { hp: 6000, bp: 8000 }),
      OHAT('Chimbal Aberto', 0.25),
      S('Shaker', 'shaker', {}),
      S('Palma', 'clap', {}),
      S('Crash', 'cymbal', { decay: 1.4 }),
      S('Baixo Boom Bap', 'stab', { notes: [33], wave: 'triangle', cutoff: 400, env: 600, decay: 0.5, detune: 3 }, { cat: '808 & Baixo' }),
      S('Piano Am7', 'keys', { notes: [57, 60, 64, 67], decay: 1.4 }),
      S('Piano Dm9', 'keys', { notes: [50, 53, 57, 60, 64], decay: 1.4 }),
      S('Horn Stab', 'stab', { notes: [58, 62, 65], cutoff: 600, env: 3000, fattack: 0.04, attack: 0.01, decay: 0.35 }),
      S('Scratch', 'scratch', {}),
      S('Scratch Rápido', 'scratch', { dur: 0.25, moves: 6 }),
      S('Vox Yeah', 'vox', { vowels: 'ea', f0: 150, f1: 130, dur: 0.35 }),
      S('Vinil Chiado', 'vinyl', {}),
    ],
    beats: [
      { name: 'Boom Bap Clássico', tracks: { 0: 'X......x..X.....', 1: '....X.......X...', 3: 'x.x.x.x.x.x.x.x.', 8: 'x.........x.....' } },
      { name: 'Boom Bap + Piano', from: 0, len: 32, tracks: { 9: 'x...............................', 10: '................x...............', 15: 'X...............................' } },
      { name: 'Boom Bap Pesado', tracks: { 0: 'X..x....X.x.....', 1: '....X..o....X..o', 3: 'x.xxx.x.x.xxx.x.', 4: '..............x.', 8: 'x..x....x.x.....' } },
      { name: 'Scratch Break', tracks: { 0: 'X.......X.......', 1: '....X.......X...', 12: 'x...x...x.x.x...', 13: '..x.......x...x.' } },
    ],
  },
  {
    id: 'trap', genre: 'Trap', name: 'Trap 140', bpm: 140, swing: 50, color: '#a64dff',
    desc: 'Trap e drill: 808 com glide, rolls de chimbal e clima escuro.',
    pads: [
      S('808 Trap', 'k808', { note: 31, decay: 1.6, drive: 0.45 }),
      S('808 Glide', 'k808', { note: 36, decay: 1.2, glide: -5 }),
      S('Kick Trap', 'kick', { f0: 170, f1: 50, decay: 0.3, drive: 0.3 }),
      S('Caixa Trap', 'snare', { tone: 220, noiseDecay: 0.18, drive: 0.25 }),
      S('Palma Trap', 'clap', { decay: 0.25, bursts: 4 }),
      HAT('Chimbal Trap', 0.035),
      OHAT('Chimbal Aberto', 0.3),
      S('Perc Trap', 'rim', { freq: 900, decay: 0.05 }),
      S('Bell Trap', 'bell', { note: 79, ratio: 2, index: 3, decay: 1 }),
      S('Pluck Dark', 'pluck', { notes: [57, 60, 64], damp: 0.7 }),
      S('Pad Escuro', 'stab', { notes: [45, 52, 57, 60], attack: 0.3, decay: 1.8, sustain: 0.6, release: 0.5, cutoff: 900, env: 400 }),
      S('Vox Ah', 'vox', { vowels: 'a', f0: 180, dur: 0.4 }),
      S('Vox Uh', 'vox', { vowels: 'u', f0: 140, dur: 0.4 }),
      S('Riser', 'riser', { dur: 2 }),
      S('Impacto', 'impact', {}),
      S('Crash', 'cymbal', {}),
    ],
    beats: [
      { name: 'Trap 140', len: 32, tracks: { 2: 'X.........X.....X.....X...X.....', 0: 'X.........X.....X.....X...X.....', 3: '........X...............X.......', 4: '........X...............X.......', 5: 'x.x.x.x.x.x.r.x.x.x.x.t.x.x.q.x.' } },
      { name: 'Trap Rolls', len: 32, tracks: { 2: 'X.........X.....X.....X...X.....', 0: 'X.........X.....X......x..X.....', 3: '........X...............X.......', 5: 'xxrxxxtxxxrxqxxxxxrxxxtxxxrxqqqq', 6: '......x...............x.........' } },
      { name: 'Drill', len: 32, tracks: { 2: 'X.....x...........X.....x.......', 1: 'X.....x.....x.....X...........x.', 3: '........X..x............X.....x.', 5: 'x..x..x.x..x..x.x..x..x...x..x..', 7: '...x...........x...x.......x....' } },
      { name: 'Intro Escura', len: 32, tracks: { 10: 'X...............................', 8: 'x..x..x...x.....x..x..x...x..x..', 0: 'X...............X...............' } },
    ],
  },
  {
    id: 'rock', genre: 'Rock', name: 'Rock Garage', bpm: 120, swing: 50, color: '#ff3b30',
    desc: 'Bateria acústica com ride e crash, guitarras power chord e baixo.',
    pads: [
      S('Bumbo Rock', 'kick', { f0: 120, f1: 55, decay: 0.35, click: 0.6, drive: 0.1, lp: 7000 }),
      S('Caixa Rock', 'snare', { tone: 200, toneDecay: 0.14, noiseDecay: 0.28, noiseLevel: 0.8, hp: 800 }),
      HAT('Chimbal Fechado', 0.06, { hp: 6000, noise: 0.6 }),
      OHAT('Chimbal Aberto', 0.4),
      S('Ride', 'cymbal', { decay: 1.2, hp: 3500, bell: 0.6, noise: 0.4 }),
      S('Crash', 'cymbal', { decay: 2, hp: 4000 }),
      S('Tom 1', 'tom', { f0: 240, f1: 180, decay: 0.35 }),
      S('Tom 2', 'tom', { f0: 180, f1: 130, decay: 0.4 }),
      S('Surdo', 'tom', { f0: 120, f1: 80, decay: 0.5 }),
      S('Guitarra E5', 'guitar', { notes: [40, 47, 52] }),
      S('Guitarra A5', 'guitar', { notes: [45, 52, 57] }),
      S('Guitarra D5', 'guitar', { notes: [38, 45, 50] }),
      S('Guitarra Abafada', 'guitar', { notes: [40, 47], mute: true }),
      S('Guitarra G5', 'guitar', { notes: [43, 50, 55] }),
      S('Baixo Rock', 'stab', { notes: [28], wave: 'sawtooth', cutoff: 700, env: 900, decay: 0.4, drive: 0.3 }, { cat: '808 & Baixo' }),
      S('Aro da Caixa', 'rim', { freq: 600, decay: 0.05 }),
    ],
    beats: [
      { name: 'Rock Básico', tracks: { 0: 'X.......X.x.....', 1: '....X.......X...', 2: 'x.x.x.x.x.x.x.x.' } },
      { name: 'Rock Ride', tracks: { 0: 'X.....x.X.......', 1: '....X.......X...', 4: 'x.x.x.x.x.x.x.x.', 5: 'X...............' } },
      { name: 'Riff Pesado', from: 0, tracks: { 12: 'x.xx.x..x.xx.x..', 9: '......x.......x.', 14: 'x.xx.xx.x.xx.xx.' } },
      { name: 'Virada', tracks: { 0: 'X...........X...', 1: '....X...........', 6: '........xx......', 7: '..........xx....', 8: '............xxx.', 5: 'X...............' } },
    ],
  },
  {
    id: 'house', genre: 'House', name: 'House Club', bpm: 124, swing: 54, color: '#00c2ff',
    desc: 'Four-on-the-floor clássico: palma, chimbal no contratempo, órgão e piano.',
    pads: [
      S('Kick House', 'kick', { f0: 150, f1: 50, decay: 0.45, click: 0.3, drive: 0.1 }),
      S('Palma House', 'clap', {}),
      S('Caixa', 'snare', {}),
      HAT('Chimbal', 0.04), OHAT('Chimbal Aberto', 0.22),
      S('Shaker', 'shaker', {}),
      S('Ride', 'cymbal', { decay: 1, bell: 0.5, hp: 3000 }),
      S('Rim', 'rim', {}),
      S('Conga', 'conga', {}),
      S('Wood', 'clave', {}),
      S('Baixo House', 'stab', { notes: [33], wave: 'square', cutoff: 500, env: 1500, decay: 0.25, q: 4 }, { cat: '808 & Baixo' }),
      S('Acorde Órgão', 'stab', { notes: [60, 64, 67, 71], wave: 'square', cutoff: 3000, env: 1000, decay: 0.4, detune: 4 }),
      S('Stab M7', 'stab', { notes: [57, 61, 64, 68], cutoff: 1500, env: 3000, decay: 0.25 }),
      S('Piano House', 'keys', { notes: [60, 64, 67, 72], decay: 0.8, index: 3 }),
      S('Vox Oh', 'vox', { vowels: 'o', f0: 220, dur: 0.4 }),
      S('Riser', 'riser', { dur: 2 }),
    ],
    beats: [
      { name: 'House 4x4', tracks: { 0: 'X...X...X...X...', 1: '....X.......X...', 4: '..x...x...x...x.', 5: 'oxoxoxoxoxoxoxox', 10: '..x...x...x...x.' } },
      { name: 'Deep House', from: 0, tracks: { 11: '..x.....x.....x.', 7: '...x.....x..x...' } },
      { name: 'House Piano', from: 0, tracks: { 13: '..x..x....x..x..', 8: 'x..x..x.........' } },
      { name: 'Break', tracks: { 1: '....X.......X...', 5: 'oxoxoxoxoxoxoxox', 14: 'X...............' } },
    ],
  },
  {
    id: 'techno', genre: 'Techno', name: 'Techno Warehouse', bpm: 130, swing: 50, color: '#7cff4f',
    desc: 'Kick com rumble, acid 303 e percussão metálica para pista.',
    pads: [
      S('Kick Techno', 'kick', { f0: 140, f1: 45, decay: 0.5, drive: 0.35, click: 0.3 }),
      S('Rumble', 'k808', { note: 33, decay: 0.4, drive: 0.6, punch: 1.5, lp: 400 }, { cat: '808 & Baixo' }),
      S('Palma', 'clap', {}),
      HAT('Chimbal', 0.03, { hp: 8000 }), OHAT('Chimbal Aberto', 0.18),
      S('Ride Techno', 'cymbal', { decay: 0.7, hp: 6000, bell: 0.3 }),
      S('Rim', 'rim', {}),
      S('Clave', 'clave', {}),
      S('Perc Metal', 'metal', { f: 800, decay: 0.2 }),
      S('Acid 303', 'stab', { notes: [36], wave: 'sawtooth', cutoff: 250, env: 2500, q: 14, decay: 0.25, drive: 0.4, detune: 0 }, { cat: '808 & Baixo' }),
      S('Acid Agudo', 'stab', { notes: [48], wave: 'sawtooth', cutoff: 300, env: 3000, q: 14, decay: 0.2, drive: 0.4, detune: 0 }, { cat: '808 & Baixo' }),
      S('Stab Techno', 'stab', { notes: [48, 55, 60, 63], cutoff: 800, env: 4000, q: 6, decay: 0.2 }),
      S('Noise Hit', 'shaker', { decay: 0.3, freq: 2000, q: 0.5 }),
      S('Riser', 'riser', { dur: 2 }),
      S('Impacto', 'impact', {}),
      S('Tom Techno', 'tom', { f0: 150, f1: 100 }),
    ],
    beats: [
      { name: 'Techno Pesado', tracks: { 0: 'X...X...X...X...', 1: '..x.x.x...x.x.xx', 2: '....X.......X...', 3: 'x.x.x.x.x.x.x.x.', 4: '..x...x...x...x.', 5: '.o.o.o.o.o.o.o.o' } },
      { name: 'Acid', from: 0, tracks: { 9: 'x.xx.x.xx.x.x.xx', 10: '...x.......x....' } },
      { name: 'Hipnótico', tracks: { 0: 'X...X...X...X...', 8: 'x..x..x..x..x.x.', 6: '...x.......x....', 4: '..x...x...x...x.' } },
    ],
  },
  {
    id: 'reggaeton', genre: 'Reggaeton', name: 'Dembow Perreo', bpm: 95, swing: 50, color: '#ffd60a',
    desc: 'O dembow clássico com timbales, güiro e 808 de perreo.',
    pads: [
      S('Kick Dembow', 'kick', { f0: 150, f1: 50, decay: 0.35, drive: 0.25 }),
      S('Caixa Dembow', 'snare', { tone: 230, noiseDecay: 0.12, toneDecay: 0.08, drive: 0.2 }),
      S('Rim Dembow', 'rim', { freq: 1200 }),
      HAT(), OHAT(),
      S('Palma', 'clap', {}),
      S('Shaker', 'shaker', {}),
      S('808 Perreo', 'k808', { note: 33, decay: 0.9, drive: 0.4 }),
      S('Timbale', 'tom', { f0: 520, f1: 480, decay: 0.15, noise: 0.3 }),
      S('Timbale Grave', 'tom', { f0: 380, f1: 350, decay: 0.18, noise: 0.3 }),
      S('Conga', 'conga', {}),
      S('Bongô', 'conga', { freq: 400, decay: 0.12, slap: 0.4 }),
      S('Güiro', 'shaker', { attack: 0.08, decay: 0.05, freq: 4000 }),
      S('Synth Pluck', 'pluck', { notes: [64, 67, 71] }),
      S('Vox Hey!', 'vox', { vowels: 'ei', f0: 230, dur: 0.25, h: true }),
      S('Laser', 'zap', {}),
    ],
    beats: [
      { name: 'Dembow', tracks: { 0: 'X...X...X...X...', 1: '...x..x....x..x.', 3: 'x.x.x.x.x.x.x.x.', 7: 'X.......X.......' } },
      { name: 'Perreo', from: 0, tracks: { 12: 'x.x.x.x.x.x.x.x.', 13: 'x.....x.x.....x.' } },
      { name: 'Virada Timbal', tracks: { 0: 'X...............', 8: '..xx..xx..xxxxxx', 9: 'xx..xx..xx......' } },
    ],
  },
  {
    id: 'dnb', genre: 'Drum & Bass', name: 'Drum & Bass 174', bpm: 174, swing: 50, color: '#00e5a0',
    desc: 'Two-step rápido, caixas fantasma, reese bass e atmosferas.',
    pads: [
      S('Kick DnB', 'kick', { f0: 180, f1: 55, decay: 0.25, drive: 0.2, click: 0.6 }),
      S('Caixa DnB', 'snare', { tone: 230, noiseDecay: 0.18, drive: 0.3 }),
      S('Caixa Fantasma', 'snare', { tone: 230, noiseDecay: 0.08 }, { v: 0.4 }),
      HAT('Chimbal', 0.035), OHAT('Chimbal Aberto', 0.2),
      S('Ride', 'cymbal', { decay: 1, bell: 0.5, hp: 4000 }),
      S('Shaker', 'shaker', {}),
      S('Reese Bass', 'stab', { notes: [28], detune: 30, cutoff: 500, env: 300, attack: 0.01, decay: 1, sustain: 0.7, release: 0.2 }, { cat: '808 & Baixo' }),
      S('Sub', 'k808', { note: 28, decay: 1, punch: 1.2, drive: 0.1 }),
      S('Pad Atmos', 'stab', { notes: [57, 64, 69, 72], attack: 0.6, decay: 2.5, sustain: 0.8, release: 1, cutoff: 1200, env: 600 }),
      S('Stab DnB', 'stab', { notes: [57, 60, 64], cutoff: 900, env: 3000, decay: 0.2, q: 4 }),
      S('Riser', 'riser', { dur: 2 }),
      S('Impacto', 'impact', {}),
      S('Vox Ah', 'vox', { vowels: 'a', f0: 220, dur: 0.4 }),
      S('Sirene', 'siren', {}),
      S('Crash', 'cymbal', {}),
    ],
    beats: [
      { name: 'Two-Step', tracks: { 0: 'X.........X.....', 1: '....X.......X...', 2: '.......o.o....o.', 3: 'x.x.x.x.x.x.x.x.' } },
      { name: 'Liquid', from: 0, tracks: { 5: 'x.x.x.x.x.x.x.x.', 9: 'X...............', 8: 'X.........x.....' } },
      { name: 'Roller', tracks: { 0: 'X.........X..x..', 1: '....X.......X...', 2: '..o....o.o..o.oo', 6: 'xoxoxoxoxoxoxoxo', 7: 'X.....x...x.....' } },
    ],
  },
  {
    id: 'lofi', genre: 'Lo-Fi', name: 'Lo-Fi Chill', bpm: 80, swing: 60, color: '#ff9f7a',
    desc: 'Batidas relaxadas com Rhodes, guitarra nylon e chiado de vinil.',
    pads: [
      S('Kick Lo-Fi', 'kick', { f0: 110, f1: 45, decay: 0.35, click: 0.1, lp: 2000, drive: 0.1 }),
      S('Caixa Lo-Fi', 'snare', { tone: 170, noiseDecay: 0.18, lp: 5000, hp: 700 }),
      S('Rim Lo-Fi', 'rim', { freq: 1300, decay: 0.04, hp: 300 }),
      HAT('Chimbal Lo-Fi', 0.04, { hp: 5000, bp: 7000 }),
      S('Shaker Suave', 'shaker', { decay: 0.12, freq: 5000 }),
      S('Palma Suave', 'clap', { freq: 900, decay: 0.15 }),
      S('Rhodes Cmaj9', 'keys', { notes: [48, 52, 55, 59, 62], decay: 2, index: 1.5 }),
      S('Rhodes Am9', 'keys', { notes: [45, 48, 52, 55, 59], decay: 2, index: 1.5 }),
      S('Rhodes Fmaj7', 'keys', { notes: [41, 45, 48, 52], decay: 2, index: 1.5 }),
      S('Rhodes Em7', 'keys', { notes: [40, 43, 47, 50], decay: 2, index: 1.5 }),
      S('Baixo Lo-Fi', 'stab', { notes: [36], wave: 'triangle', cutoff: 300, env: 300, decay: 0.6 }, { cat: '808 & Baixo' }),
      S('Guitarra Nylon', 'pluck', { notes: [52, 56, 59, 64], damp: 0.8 }),
      S('Pluck Suave', 'pluck', { notes: [64, 67, 71, 74], damp: 0.6 }),
      S('Vinil Chiado', 'vinyl', {}),
      S('Bell Lo-Fi', 'bell', { note: 84, ratio: 2, index: 2, decay: 1.2 }),
      S('Vox Uh', 'vox', { vowels: 'u', f0: 160, dur: 0.5 }),
    ],
    beats: [
      { name: 'Lo-Fi Chill', len: 32, tracks: { 0: 'X......x..X.....', 1: '....X.......X...', 3: 'x.x.x.x.x.x.x.x.', 13: 'X...............................', 6: 'X...............................', 7: '................X...............' } },
      { name: 'Lo-Fi Jazz', len: 32, tracks: { 0: 'X.....x...x.....', 2: '....x.......x..o', 4: 'xoxoxoxoxoxoxoxo', 8: 'X...............................', 9: '................X...............', 10: 'x.....x...x.....' } },
      { name: 'Só Batida', tracks: { 0: 'X......x..X.....', 1: '....X.......X...', 3: 'x.x.x.xox.x.x.xo' } },
    ],
  },
  {
    id: 'samba', genre: 'Samba & Pagode', name: 'Roda de Samba', bpm: 100, swing: 54, color: '#34c759',
    desc: 'Surdos, tamborim, pandeiro, cuíca, agogô e cavaco.',
    pads: [
      S('Surdo Grave', 'tom', { f0: 85, f1: 60, decay: 0.7, drive: 0.1 }),
      S('Surdo Resposta', 'tom', { f0: 100, f1: 75, decay: 0.6 }),
      S('Surdo Abafado', 'tom', { f0: 90, f1: 65, decay: 0.15 }),
      S('Caixa Samba', 'snare', { tone: 260, noiseDecay: 0.12, hp: 2500 }),
      S('Repique', 'tom', { f0: 380, f1: 330, decay: 0.12, noise: 0.4 }),
      S('Tamborim', 'rim', { freq: 750, decay: 0.06, noise: 0.3 }),
      S('Pandeiro', 'shaker', { decay: 0.14, freq: 7000, attack: 0.005 }),
      S('Pandeiro Grave', 'conga', { freq: 140, decay: 0.2, slap: 0.1 }),
      S('Agogô Agudo', 'cowbell', { f1: 1050, f2: 1580, decay: 0.35, bp: 2400 }),
      S('Agogô Grave', 'cowbell', { f1: 780, f2: 1170, decay: 0.35, bp: 1800 }),
      S('Cuíca', 'cuica', {}),
      S('Cuíca Grave', 'cuica', { f0: 260, f1: 520, down: true }),
      S('Chocalho', 'shaker', { decay: 0.07, freq: 8000, attack: 0.01 }),
      S('Tantã', 'conga', { freq: 95, decay: 0.4, slap: 0.05, bend: 1.4 }),
      S('Cavaco', 'pluck', { notes: [62, 66, 69, 74], damp: 0.35, strum: 0.006, decay: 0.7 }),
      S('Apito de Samba', 'whistle', { freq: 3200, hits: [[0, 0.1], [0.15, 0.1], [0.3, 0.25]] }),
    ],
    beats: [
      { name: 'Samba Enredo', tracks: { 0: '....X.......X...', 1: 'X.......X.......', 3: 'xoxxxoxxxoxxxoxx', 5: 'x.xx.x.xx.x.x.x.', 12: 'xoooxoooxoooxooo', 8: 'x.x...x.x.x...x.' } },
      { name: 'Pagode', tracks: { 13: 'x..x.....x..x...', 6: 'x.xxx.xxx.xxx.xx', 7: '....x.......x...', 14: 'x.x..x.x..x.x...', 5: '..x...x...x...x.' } },
      { name: 'Partido Alto', tracks: { 6: 'x.xxx.xxx.xxx.xx', 13: 'x..x.....x..x...', 2: '....x.......x...', 10: '......x.......x.' } },
      { name: 'Virada de Bateria', tracks: { 4: 'x.x.x.x.xxxxxxxx', 0: 'X...............', 15: '............x...', 3: 'xxxxxxxxxxxxXXXX' } },
    ],
  },
  {
    id: 'piseiro', genre: 'Piseiro & Forró', name: 'Piseiro Paredão', bpm: 150, swing: 50, color: '#ff8a00',
    desc: 'Zabumba, triângulo, sanfona e o teclado do piseiro.',
    pads: [
      S('Zabumba', 'kick', { f0: 110, f1: 55, decay: 0.35, drive: 0.15, click: 0.5 }),
      S('Zabumba Aberta', 'tom', { f0: 95, f1: 70, decay: 0.5 }),
      S('Bacalhau', 'rim', { freq: 1100, decay: 0.04, noise: 0.7 }),
      S('Triângulo Aberto', 'metal', { f: 1700, decay: 1 }, { choke: 2 }),
      S('Triângulo Fechado', 'metal', { f: 1700, decay: 0.08 }, { choke: 2 }),
      S('Kick Piseiro', 'kick', { f0: 170, f1: 50, decay: 0.3, drive: 0.4 }),
      S('Caixa Piseiro', 'snare', { tone: 220, noiseDecay: 0.14 }),
      S('Palma Piseiro', 'clap', {}),
      HAT(),
      S('Shaker', 'shaker', {}),
      S('Teclado Piseiro', 'stab', { notes: [67, 71, 74], wave: 'square', cutoff: 3500, env: 2000, decay: 0.25, detune: 6 }),
      S('Sanfona', 'stab', { notes: [60, 64, 67], wave: 'sawtooth', cutoff: 2200, env: 800, attack: 0.02, decay: 0.6, sustain: 0.7, release: 0.1, detune: 14 }),
      S('Sanfona Grave', 'stab', { notes: [53, 57, 60], wave: 'sawtooth', cutoff: 2000, env: 800, attack: 0.02, decay: 0.6, sustain: 0.7, release: 0.1, detune: 14 }),
      S('Baixo Piseiro', 'stab', { notes: [31], wave: 'square', cutoff: 500, env: 800, decay: 0.25 }, { cat: '808 & Baixo' }),
      S('Vox Ei!', 'vox', { vowels: 'ei', f0: 250, dur: 0.25, h: true }),
      S('Laser', 'zap', {}),
    ],
    beats: [
      { name: 'Piseiro', tracks: { 5: 'X...X..xX...X..x', 6: '....X.......X...', 4: 'x.x.x.x.x.x.x.x.', 3: '.x.x.x.x.x.x.x.x', 10: '..x...x...x...x.', 13: 'x..x....x..x....' } },
      { name: 'Forró Pé de Serra', tracks: { 0: 'X..x....X..x....', 2: '....x.......x...', 4: 'x.xxx.xxx.xxx.xx', 3: '.x...x...x...x..', 11: 'x.......x.......' } },
      { name: 'Xote', tracks: { 0: 'X.......X..x....', 1: '....x.......x...', 4: 'x.x.x.x.x.x.x.x.', 12: 'x.......x.......' } },
    ],
  },
  {
    id: 'amapiano', genre: 'Amapiano', name: 'Amapiano Joburg', bpm: 113, swing: 56, color: '#ffcc00',
    desc: 'Log drums, shakers e piano jazzístico do amapiano.',
    pads: [
      S('Log Drum', 'k808', { note: 45, decay: 0.5, punch: 1.6, drive: 0.7, pd: 0.02 }, { cat: '808 & Baixo' }),
      S('Log Drum Agudo', 'k808', { note: 52, decay: 0.4, punch: 1.5, drive: 0.7, pd: 0.02 }, { cat: '808 & Baixo' }),
      S('Log Drum Grave', 'k808', { note: 40, decay: 0.6, punch: 1.6, drive: 0.7, pd: 0.02 }, { cat: '808 & Baixo' }),
      S('Kick Amapiano', 'kick', { f0: 140, f1: 48, decay: 0.5, drive: 0.1, click: 0.2 }),
      S('Shaker Amapiano', 'shaker', { decay: 0.08 }),
      HAT(), OHAT(),
      S('Palma', 'clap', {}),
      S('Rim Amapiano', 'rim', { freq: 1500 }),
      S('Perc Madeira', 'clave', { freq: 1800, decay: 0.08 }),
      S('Conga', 'conga', {}),
      S('Piano M9', 'keys', { notes: [57, 61, 64, 68, 71], decay: 1.3 }),
      S('Pad Quente', 'stab', { notes: [57, 61, 64, 68], attack: 0.4, decay: 2, sustain: 0.7, release: 0.6, cutoff: 1500, env: 400, wave: 'triangle' }),
      S('Vox Oh', 'vox', { vowels: 'o', f0: 200, dur: 0.4 }),
      S('Bell', 'bell', { note: 81 }),
      S('Sax Stab', 'stab', { notes: [65, 69, 72], attack: 0.03, fattack: 0.05, decay: 0.35, cutoff: 700, env: 2500 }),
    ],
    beats: [
      { name: 'Amapiano', tracks: { 3: 'X...X...X...X...', 4: 'xoxoxoxoxoxoxoxo', 7: '....x.......x...', 0: '..x...x.x..x..x.', 1: '.....x.........x', 8: '...x..x....x..x.' } },
      { name: 'Amapiano Piano', from: 0, len: 32, tracks: { 11: 'x.....x.........x.....x...x.....', 12: 'X...............................' } },
      { name: 'Log Drum Solo', tracks: { 0: 'x..x..x.x.x..x..', 2: 'x.......x.......', 1: '......x......x..', 4: 'xoxoxoxoxoxoxoxo' } },
    ],
  },
  {
    id: 'fx-dj', genre: 'FX & Vocais DJ', name: 'Kit de Efeitos DJ', bpm: 128, swing: 50, color: '#5ac8fa',
    desc: 'Airhorn, sirenes, risers, impactos, scratch e vocais para o set.',
    pads: [
      S('Airhorn', 'airhorn', {}),
      S('Airhorn Longo', 'airhorn', { hits: [[0, 1.2]] }),
      S('Sirene', 'siren', {}),
      S('Sirene Rápida', 'siren', { rate: 4 }),
      S('Riser 2s', 'riser', { dur: 2 }),
      S('Riser 4s', 'riser', { dur: 4 }),
      S('Downlifter', 'riser', { dur: 2, down: true }),
      S('Impacto', 'impact', {}),
      S('Sub Drop', 'impact', { f0: 90, f1: 25, dur: 2.5, noise: 0.1 }),
      S('Laser', 'zap', {}),
      S('Scratch', 'scratch', {}),
      S('Rewind', 'scratch', { dur: 1, moves: 10, f: 400 }),
      S('Vinyl Stop', 'vinylstop', {}),
      S('Vox Hey!', 'vox', { vowels: 'ei', f0: 230, dur: 0.28, h: true }),
      S('Vox Ho!', 'vox', { vowels: 'o', f0: 170, dur: 0.3, h: true }),
      S('Apito', 'whistle', {}),
    ],
    beats: [],
  },
];

export const GENRES = [...new Set(KITS.map((k) => k.genre))];

const VEL = { '.': 0, o: 60, x: 100, X: 127, r: 100, t: 100, q: 90 };
const RAT = { r: 2, t: 3, q: 4 };

// Converte a base escrita em texto para o formato de pattern do projeto.
export function beatToPattern(kit, beatIndex, padOffset = 0) {
  const beat = kit.beats[beatIndex];
  const base = beat.from != null ? kit.beats[beat.from] : null;
  const len = beat.len || (base && base.len) || 16;
  const tracks = { ...(base ? base.tracks : {}), ...beat.tracks };
  const steps = {}, rat = {};
  for (const [pad, str] of Object.entries(tracks)) {
    const p = Number(pad) + padOffset;
    const row = new Array(64).fill(0);
    let hasRat = false;
    const rrow = new Array(64).fill(0);
    for (let i = 0; i < len; i++) {
      const ch = str[i % str.length];
      row[i] = VEL[ch] ?? 0;
      if (RAT[ch]) { rrow[i] = RAT[ch]; hasRat = true; }
    }
    if (row.some((v) => v)) steps[p] = row;
    if (hasRat) rat[p] = rrow;
  }
  return { name: beat.name, length: len, steps, rat };
}

export function allSounds() {
  const out = [];
  for (const kit of KITS) {
    kit.pads.forEach((s, i) => out.push({ ...s, kit: kit.name, genre: kit.genre, color: kit.color, id: kit.id + ':' + i }));
  }
  return out;
}
