// Modelo de dados de um projeto do WDQ Sampler e conversões de arquivo (.wdq).
import { PAD_COUNT } from './audio/engine.js';
import { categoryOf, CATEGORY_COLOR } from './audio/voices.js';

export const BANKS = ['A', 'B', 'C', 'D'];
export const PATTERN_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
export const MAX_STEPS = 64;

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2));

export const defaultParams = () => ({
  vol: 0.8, pan: 0, tune: 0, fine: 0, attack: 0, decay: 1,
  ftype: 'off', cutoff: 18000, res: 0.7, start: 0, end: 1,
  reverse: false, choke: 0, poly: false, mute: false, solo: false,
});

export const emptyPattern = (i) => ({ name: 'Pattern ' + PATTERN_NAMES[i], length: 16, steps: {}, rat: {} });

export function newProject(name = 'Projeto sem título') {
  const now = Date.now();
  return {
    id: uid(), name, created: now, updated: now, format: 1,
    bpm: 120, swing: 50,
    pads: new Array(PAD_COUNT).fill(null),
    kitNames: ['', '', '', ''],
    patterns: PATTERN_NAMES.map((_, i) => emptyPattern(i)),
    song: [0], songMode: false,
    fx: {
      color: { type: 'FILTER', v: 0 },
      beat: { type: 'ECHO', frac: 0.5, level: 0.5 },
      eq: { low: 0, mid: 0, high: 0 },
      master: 0.85,
    },
    samples: {},
    midiMap: {},
  };
}

export function padFromSound(sound) {
  const params = defaultParams();
  if (sound.v != null) params.vol = sound.v;
  if (sound.choke) params.choke = sound.choke;
  const def = { t: sound.t, p: sound.p };
  if (sound.cat) def.cat = sound.cat;
  return { name: sound.n, color: CATEGORY_COLOR[categoryOf(def)] || '#ff2d3d', src: { kind: 'synth', def }, params };
}

export function padFromSample(name, sampleId, color) {
  return { name, color: color || '#ffa31a', src: { kind: 'sample', sampleId }, params: defaultParams() };
}

export const padLabel = (i) => BANKS[Math.floor(i / 16)] + String((i % 16) + 1).padStart(2, '0');

// garante que projetos antigos ou importados tenham todos os campos
export function migrate(p) {
  const base = newProject(p.name);
  const out = { ...base, ...p };
  out.fx = { ...base.fx, ...(p.fx || {}) };
  out.fx.color = { ...base.fx.color, ...(p.fx?.color || {}) };
  out.fx.beat = { ...base.fx.beat, ...(p.fx?.beat || {}) };
  out.fx.eq = { ...base.fx.eq, ...(p.fx?.eq || {}) };
  out.pads = new Array(PAD_COUNT).fill(null).map((_, i) => {
    const pad = p.pads && p.pads[i];
    return pad ? { ...pad, params: { ...defaultParams(), ...pad.params } } : null;
  });
  out.patterns = PATTERN_NAMES.map((_, i) => ({ ...emptyPattern(i), ...(p.patterns && p.patterns[i]) }));
  out.samples = p.samples || {};
  return out;
}

// --------------------------------------------------- arquivo .wdq (exportar)
export function f32ToB64(f32) {
  const i16 = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) i16[i] = Math.max(-32768, Math.min(32767, Math.round(f32[i] * 32767)));
  const bytes = new Uint8Array(i16.buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToF32(b64) {
  const s = atob(b64), bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  const i16 = new Int16Array(bytes.buffer);
  const f = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) f[i] = i16[i] / 32767;
  return f;
}

export async function projectToFile(project) {
  const samples = {};
  for (const [id, s] of Object.entries(project.samples)) {
    samples[id] = { name: s.name, sr: s.sr, channels: s.channels.map(f32ToB64) };
  }
  const json = JSON.stringify({ app: 'WDQ Sampler', format: 1, project: { ...project, samples } });
  const blob = new Blob([json], { type: 'application/json' });
  if (typeof CompressionStream !== 'undefined') {
    return new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
  }
  return blob;
}

export async function projectFromFile(blob) {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  let text;
  if (head[0] === 0x1f && head[1] === 0x8b) {
    text = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  } else {
    text = await blob.text();
  }
  const data = JSON.parse(text);
  if (!data || data.app !== 'WDQ Sampler' || !data.project) throw new Error('Arquivo não é um projeto do WDQ Sampler.');
  const p = data.project;
  const samples = {};
  for (const [id, s] of Object.entries(p.samples || {})) {
    samples[id] = { name: s.name, sr: s.sr, channels: s.channels.map(b64ToF32) };
  }
  return migrate({ ...p, samples });
}

export function cloneProject(p) {
  return migrate(structuredClone(p));
}
