// Síntese de todos os sons da biblioteca. Cada som é renderizado uma vez num
// AudioBuffer (OfflineAudioContext) e depois tocado como um sample comum, então
// afinação, start/end, reverse e exportação funcionam igual para sons e samples.

export const SR = 44100;
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const T0 = 0.002; // pequeno respiro no início do render

function noiseBuffer(ctx, dur) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function noise(ctx, dur) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx, dur);
  return s;
}
function osc(ctx, type, freq) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  return o;
}
function gain(ctx, v = 1) {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}
function filt(ctx, type, freq, q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}
const curves = new Map();
function shaper(ctx, k) {
  const key = Math.round(k * 100);
  if (!curves.has(key)) {
    const n = 2048, c = new Float32Array(n), a = 1 + k * 24;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(x * a) / Math.tanh(a);
    }
    curves.set(key, c);
  }
  const w = ctx.createWaveShaper();
  w.curve = curves.get(key);
  w.oversample = '2x';
  return w;
}
// envelope percussivo: ataque linear e queda exponencial
function perc(param, t, peak, attack, decay) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + Math.max(0.0005, attack));
  param.exponentialRampToValueAtTime(Math.max(peak * 0.0005, 1e-5), t + attack + decay);
  param.setValueAtTime(0, t + attack + decay + 0.001);
}
function chain(...nodes) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
}
function start(nodes, t, stop) {
  for (const n of nodes) { n.start(t); n.stop(stop); }
}

// ---------------------------------------------------------------- tipos de som
const V = {};

V.kick = {
  d: { f0: 160, f1: 48, pd: 0.07, decay: 0.45, click: 0.4, drive: 0.15, lp: 9000 },
  dur: (p) => p.decay + 0.05,
  build(ctx, out, p) {
    const t = T0, end = t + p.decay + 0.04;
    const o = osc(ctx, 'sine', p.f0);
    o.frequency.setValueAtTime(p.f0, t);
    o.frequency.exponentialRampToValueAtTime(p.f1, t + p.pd);
    const g = gain(ctx, 0);
    perc(g.gain, t, 1, 0.001, p.decay);
    const lp = filt(ctx, 'lowpass', p.lp);
    chain(o, g, shaper(ctx, p.drive), lp, out);
    const n = noise(ctx, 0.03), ng = gain(ctx, 0);
    perc(ng.gain, t, p.click, 0.0005, 0.012);
    chain(n, filt(ctx, 'highpass', 1800), ng, out);
    start([o, n], t, end);
  },
};

V.k808 = {
  d: { note: 33, decay: 1.4, drive: 0.35, punch: 2.4, pd: 0.045, glide: 0, lp: 5000 },
  dur: (p) => p.decay + 0.06,
  build(ctx, out, p) {
    const t = T0, f = mtof(p.note), end = t + p.decay + 0.05;
    const o = osc(ctx, 'sine', f);
    o.frequency.setValueAtTime(f * p.punch, t);
    o.frequency.exponentialRampToValueAtTime(f, t + p.pd);
    if (p.glide) o.frequency.exponentialRampToValueAtTime(f * Math.pow(2, p.glide / 12), t + p.decay * 0.85);
    const g = gain(ctx, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 0.002);
    g.gain.setValueAtTime(1, t + p.decay * 0.25);
    g.gain.exponentialRampToValueAtTime(0.001, t + p.decay);
    chain(o, g, shaper(ctx, p.drive), filt(ctx, 'lowpass', p.lp), out);
    start([o], t, end);
  },
};

V.snare = {
  d: { tone: 190, toneDecay: 0.11, noiseDecay: 0.2, hp: 1200, noiseLevel: 0.75, toneLevel: 0.6, drive: 0.1, lp: 12000 },
  dur: (p) => Math.max(p.toneDecay, p.noiseDecay) + 0.05,
  build(ctx, out, p) {
    const t = T0, end = t + Math.max(p.toneDecay, p.noiseDecay) + 0.04;
    const o = osc(ctx, 'triangle', p.tone);
    o.frequency.setValueAtTime(p.tone * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(p.tone, t + 0.02);
    const og = gain(ctx, 0);
    perc(og.gain, t, p.toneLevel, 0.001, p.toneDecay);
    const n = noise(ctx, p.noiseDecay + 0.05), ng = gain(ctx, 0);
    perc(ng.gain, t, p.noiseLevel, 0.001, p.noiseDecay);
    const inBus = gain(ctx, 1);
    chain(inBus, shaper(ctx, p.drive), filt(ctx, 'lowpass', p.lp), out);
    chain(o, og, inBus);
    chain(n, filt(ctx, 'highpass', p.hp), filt(ctx, 'peaking', 5000, 0.8), ng, inBus);
    start([o, n], t, end);
  },
};

V.clap = {
  d: { decay: 0.22, freq: 1150, q: 1.1, spread: 0.011, bursts: 3, level: 1 },
  dur: (p) => p.bursts * p.spread + p.decay + 0.05,
  build(ctx, out, p) {
    const t = T0, total = p.bursts * p.spread + p.decay;
    const n = noise(ctx, total + 0.05), g = gain(ctx, 0);
    for (let i = 0; i < p.bursts; i++) {
      const s = t + i * p.spread;
      g.gain.setValueAtTime(p.level, s);
      g.gain.exponentialRampToValueAtTime(p.level * 0.08, s + p.spread * 0.95);
    }
    const s = t + p.bursts * p.spread;
    g.gain.setValueAtTime(p.level, s);
    g.gain.exponentialRampToValueAtTime(0.0005, s + p.decay);
    g.gain.setValueAtTime(0, s + p.decay + 0.001);
    chain(n, filt(ctx, 'bandpass', p.freq, p.q), filt(ctx, 'highpass', 500), g, out);
    start([n], t, t + total + 0.04);
  },
};

const HAT_RATIOS = [205.3, 304.4, 369.6, 522.7, 540, 800];
V.hat = {
  d: { decay: 0.05, hp: 7500, tune: 1, noise: 0.4, bp: 10000, level: 1 },
  dur: (p) => p.decay + 0.03,
  build(ctx, out, p) {
    const t = T0, end = t + p.decay + 0.02;
    const sum = gain(ctx, 0.16), g = gain(ctx, 0);
    const srcs = HAT_RATIOS.map((f) => { const o = osc(ctx, 'square', f * p.tune); o.connect(sum); return o; });
    const n = noise(ctx, p.decay + 0.05), nG = gain(ctx, p.noise);
    chain(n, nG, sum);
    perc(g.gain, t, p.level, 0.0008, p.decay);
    chain(sum, filt(ctx, 'bandpass', p.bp, 0.6), filt(ctx, 'highpass', p.hp), g, out);
    start([...srcs, n], t, end);
  },
};

V.cymbal = {
  d: { decay: 1.6, hp: 4500, tune: 1.4, noise: 0.8, bell: 0, level: 0.9 },
  dur: (p) => p.decay + 0.05,
  build(ctx, out, p) {
    const t = T0, end = t + p.decay + 0.04;
    const sum = gain(ctx, 0.14), g = gain(ctx, 0);
    const srcs = HAT_RATIOS.map((f) => { const o = osc(ctx, 'square', f * p.tune); o.connect(sum); return o; });
    const n = noise(ctx, p.decay + 0.05), nG = gain(ctx, p.noise);
    chain(n, nG, sum);
    perc(g.gain, t, p.level, 0.002, p.decay);
    chain(sum, filt(ctx, 'highpass', p.hp), filt(ctx, 'peaking', 8000, 1, 4), g, out);
    if (p.bell) {
      for (const f of [2280, 3420, 5100]) {
        const o = osc(ctx, 'sine', f), bg = gain(ctx, 0);
        perc(bg.gain, t, p.bell * 0.25, 0.001, p.decay * 0.6);
        chain(o, bg, out);
        srcs.push(o);
      }
    }
    start([...srcs, n], t, end);
  },
};

V.tom = {
  d: { f0: 210, f1: 120, decay: 0.38, noise: 0.08, drive: 0.1 },
  dur: (p) => p.decay + 0.05,
  build(ctx, out, p) {
    const t = T0, end = t + p.decay + 0.04;
    const o = osc(ctx, 'sine', p.f0);
    o.frequency.setValueAtTime(p.f0, t);
    o.frequency.exponentialRampToValueAtTime(p.f1, t + p.decay * 0.7);
    const g = gain(ctx, 0);
    perc(g.gain, t, 1, 0.001, p.decay);
    chain(o, g, shaper(ctx, p.drive), out);
    const n = noise(ctx, 0.05), ng = gain(ctx, 0);
    perc(ng.gain, t, p.noise, 0.0005, 0.03);
    chain(n, filt(ctx, 'bandpass', 3000, 0.8), ng, out);
    start([o, n], t, end);
  },
};

V.rim = {
  d: { freq: 1700, decay: 0.035, noise: 0.5, hp: 400 },
  dur: (p) => p.decay + 0.03,
  build(ctx, out, p) {
    const t = T0, end = t + p.decay + 0.02;
    const o = osc(ctx, 'triangle', p.freq), g = gain(ctx, 0);
    perc(g.gain, t, 1, 0.0005, p.decay);
    const n = noise(ctx, 0.04), ng = gain(ctx, 0);
    perc(ng.gain, t, p.noise, 0.0005, p.decay * 0.6);
    const hp = filt(ctx, 'highpass', p.hp);
    chain(o, g, hp);
    chain(n, filt(ctx, 'bandpass', p.freq * 1.8, 1.5), ng, hp);
    hp.connect(out);
    start([o, n], t, end);
  },
};

V.clave = {
  d: { freq: 2500, decay: 0.06 },
  dur: (p) => p.decay + 0.03,
  build(ctx, out, p) {
    const t = T0, o = osc(ctx, 'sine', p.freq), g = gain(ctx, 0);
    perc(g.gain, t, 1, 0.0005, p.decay);
    chain(o, g, out);
    start([o], t, t + p.decay + 0.02);
  },
};

V.cowbell = {
  d: { f1: 540, f2: 800, decay: 0.3, bp: 1400 },
  dur: (p) => p.decay + 0.04,
  build(ctx, out, p) {
    const t = T0, end = t + p.decay + 0.03;
    const sum = gain(ctx, 0.3), g = gain(ctx, 0);
    const a = osc(ctx, 'square', p.f1), b = osc(ctx, 'square', p.f2);
    a.connect(sum); b.connect(sum);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + p.decay);
    chain(sum, filt(ctx, 'bandpass', p.bp, 1.2), g, out);
    start([a, b], t, end);
  },
};

V.shaker = {
  d: { decay: 0.09, freq: 6500, attack: 0.02, q: 1.4, level: 1 },
  dur: (p) => p.attack + p.decay + 0.03,
  build(ctx, out, p) {
    const t = T0, n = noise(ctx, p.attack + p.decay + 0.05), g = gain(ctx, 0);
    perc(g.gain, t, p.level, p.attack, p.decay);
    chain(n, filt(ctx, 'bandpass', p.freq, p.q), filt(ctx, 'highpass', 2500), g, out);
    start([n], t, t + p.attack + p.decay + 0.02);
  },
};

V.conga = {
  d: { freq: 200, decay: 0.28, slap: 0.2, bend: 1.15, drive: 0.05 },
  dur: (p) => p.decay + 0.04,
  build(ctx, out, p) {
    const t = T0, end = t + p.decay + 0.03;
    const o = osc(ctx, 'sine', p.freq);
    o.frequency.setValueAtTime(p.freq * p.bend, t);
    o.frequency.exponentialRampToValueAtTime(p.freq, t + 0.035);
    const g = gain(ctx, 0);
    perc(g.gain, t, 1, 0.001, p.decay);
    chain(o, g, shaper(ctx, p.drive), out);
    const n = noise(ctx, 0.05), ng = gain(ctx, 0);
    perc(ng.gain, t, p.slap, 0.0005, 0.025);
    chain(n, filt(ctx, 'bandpass', 1800, 1), ng, out);
    start([o, n], t, end);
  },
};

V.cuica = {
  d: { f0: 420, f1: 880, dur: 0.32, down: false },
  dur: (p) => p.dur + 0.05,
  build(ctx, out, p) {
    const t = T0, e = t + p.dur;
    const o = osc(ctx, 'sine', p.f0);
    const [a, b] = p.down ? [p.f1, p.f0] : [p.f0, p.f1];
    o.frequency.setValueAtTime(a, t);
    o.frequency.exponentialRampToValueAtTime(b, t + p.dur * 0.45);
    o.frequency.exponentialRampToValueAtTime(b * 0.92, e);
    const o2 = osc(ctx, 'triangle', a * 2);
    o2.frequency.setValueAtTime(a * 2, t);
    o2.frequency.exponentialRampToValueAtTime(b * 2, t + p.dur * 0.45);
    const g = gain(ctx, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 0.03);
    g.gain.setValueAtTime(0.8, e - 0.08);
    g.gain.linearRampToValueAtTime(0, e);
    const g2 = gain(ctx, 0.25);
    o.connect(g);
    chain(o2, g2, g);
    chain(g, filt(ctx, 'peaking', 1200, 2, 6), out);
    start([o, o2], t, e + 0.02);
  },
};

V.metal = {
  d: { f: 1500, decay: 0.9, ratios: [1, 2.76, 5.4, 8.93], level: 0.8 },
  dur: (p) => p.decay + 0.04,
  build(ctx, out, p) {
    const t = T0, srcs = [];
    p.ratios.forEach((r, i) => {
      const o = osc(ctx, 'sine', p.f * r), g = gain(ctx, 0);
      perc(g.gain, t, p.level / (i + 1.4), 0.0005, p.decay / (1 + i * 0.35));
      chain(o, g, out);
      srcs.push(o);
    });
    start(srcs, t, t + p.decay + 0.03);
  },
};

V.bell = {
  d: { note: 84, ratio: 3.5, index: 5, decay: 0.6, level: 0.9 },
  dur: (p) => p.decay + 0.05,
  build(ctx, out, p) {
    const t = T0, f = mtof(p.note), end = t + p.decay + 0.04;
    const c = osc(ctx, 'sine', f), m = osc(ctx, 'sine', f * p.ratio), mg = gain(ctx, 0);
    perc(mg.gain, t, f * p.index, 0.0005, p.decay * 0.4);
    chain(m, mg);
    mg.connect(c.frequency);
    const g = gain(ctx, 0);
    perc(g.gain, t, p.level, 0.001, p.decay);
    chain(c, g, out);
    start([c, m], t, end);
  },
};

V.whistle = {
  d: { freq: 2700, dur: 0.32, trill: 24, depth: 140, breath: 0.12, hits: null },
  dur: (p) => (p.hits ? Math.max(...p.hits.map((h) => h[0] + h[1])) : p.dur) + 0.06,
  build(ctx, out, p) {
    const t = T0, hits = p.hits || [[0, p.dur]];
    const total = Math.max(...hits.map((h) => h[0] + h[1]));
    const o = osc(ctx, 'sine', p.freq), lfo = osc(ctx, 'sine', p.trill), lg = gain(ctx, p.depth);
    chain(lfo, lg);
    lg.connect(o.frequency);
    const g = gain(ctx, 0);
    for (const [s, l] of hits) {
      g.gain.setValueAtTime(0, t + s);
      g.gain.linearRampToValueAtTime(0.8, t + s + 0.012);
      g.gain.setValueAtTime(0.8, t + s + l - 0.03);
      g.gain.linearRampToValueAtTime(0, t + s + l);
    }
    chain(o, g, out);
    const n = noise(ctx, total + 0.05), ng = gain(ctx, p.breath);
    chain(n, filt(ctx, 'bandpass', p.freq, 6), ng, g);
    start([o, lfo, n], t, t + total + 0.04);
  },
};

V.zap = {
  d: { f0: 3500, f1: 90, dur: 0.22, wave: 'square', lp: 7000 },
  dur: (p) => p.dur + 0.04,
  build(ctx, out, p) {
    const t = T0, o = osc(ctx, p.wave, p.f0);
    o.frequency.setValueAtTime(p.f0, t);
    o.frequency.exponentialRampToValueAtTime(p.f1, t + p.dur);
    const g = gain(ctx, 0);
    perc(g.gain, t, 0.6, 0.001, p.dur);
    chain(o, filt(ctx, 'lowpass', p.lp), g, out);
    start([o], t, t + p.dur + 0.02);
  },
};

const FORMANTS = {
  a: [800, 1150, 2900], e: [550, 1770, 2490], i: [300, 2300, 3000],
  o: [450, 800, 2830], u: [325, 700, 2530],
};
V.vox = {
  d: { vowels: 'a', f0: 200, f1: 0, dur: 0.35, h: false, level: 1, vib: 5 },
  dur: (p) => p.dur + (p.h ? 0.06 : 0) + 0.08,
  build(ctx, out, p) {
    const t = T0 + (p.h ? 0.05 : 0), e = t + p.dur, srcs = [];
    const src = gain(ctx, 0.5);
    for (const dt of [-6, 6]) {
      const o = osc(ctx, 'sawtooth', p.f0);
      o.detune.value = dt;
      o.frequency.setValueAtTime(p.f0, t);
      if (p.f1) o.frequency.exponentialRampToValueAtTime(p.f1, e);
      o.connect(src);
      srcs.push(o);
    }
    const vib = osc(ctx, 'sine', p.vib), vg = gain(ctx, p.f0 * 0.012);
    chain(vib, vg);
    for (const o of srcs) vg.connect(o.frequency);
    srcs.push(vib);
    const g = gain(ctx, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(p.level, t + 0.025);
    g.gain.setValueAtTime(p.level * 0.85, e - 0.07);
    g.gain.linearRampToValueAtTime(0, e);
    const vs = p.vowels.split('').map((c) => FORMANTS[c] || FORMANTS.a);
    [1, 0.5, 0.28].forEach((amp, k) => {
      const f = filt(ctx, 'bandpass', vs[0][k], 9 + k * 2);
      vs.forEach((v, i) => {
        if (i === 0) return;
        f.frequency.linearRampToValueAtTime(v[k], t + (p.dur * i) / vs.length);
      });
      const fg = gain(ctx, amp * 3);
      chain(src, f, fg, g);
    });
    g.connect(out);
    if (p.h) {
      const n = noise(ctx, 0.12), ng = gain(ctx, 0);
      ng.gain.setValueAtTime(0, T0);
      ng.gain.linearRampToValueAtTime(0.35, T0 + 0.03);
      ng.gain.linearRampToValueAtTime(0, t + 0.04);
      chain(n, filt(ctx, 'bandpass', 1800, 1.2), ng, out);
      n.start(T0); n.stop(t + 0.06);
    }
    start(srcs, t, e + 0.02);
  },
};

// sintetizador subtrativo genérico: stabs, acordes, baixos, brass, pads, acid
V.stab = {
  d: { notes: [57, 60, 64], wave: 'sawtooth', cutoff: 1800, env: 3500, q: 1.5, attack: 0.004, decay: 0.45, sustain: 0, release: 0.1, detune: 9, drive: 0, level: 0.8, fattack: 0.002 },
  dur: (p) => p.attack + p.decay + p.release + 0.05,
  build(ctx, out, p) {
    const t = T0, hold = p.attack + p.decay, end = t + hold + p.release + 0.04, srcs = [];
    const sum = gain(ctx, 1 / Math.sqrt(p.notes.length * 2));
    for (const n of p.notes) {
      for (const dt of [-p.detune, p.detune]) {
        const o = osc(ctx, p.wave, mtof(n));
        o.detune.value = dt;
        o.connect(sum);
        srcs.push(o);
      }
    }
    const f = filt(ctx, 'lowpass', p.cutoff, p.q);
    f.frequency.setValueAtTime(p.cutoff, t);
    f.frequency.linearRampToValueAtTime(Math.min(18000, p.cutoff + p.env), t + p.fattack);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, p.cutoff), t + p.fattack + p.decay * 0.7);
    const g = gain(ctx, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(p.level, t + p.attack);
    if (p.sustain > 0) {
      g.gain.linearRampToValueAtTime(p.level * p.sustain, t + hold);
      g.gain.linearRampToValueAtTime(0, t + hold + p.release);
    } else {
      g.gain.exponentialRampToValueAtTime(0.0008, t + hold);
      g.gain.setValueAtTime(0, t + hold + 0.001);
    }
    let last = chain(sum, f);
    if (p.drive) last = chain(last, shaper(ctx, p.drive));
    chain(last, g, out);
    start(srcs, t, end);
  },
};

V.guitar = {
  d: { notes: [40, 47, 52], drive: 0.85, decay: 0.9, cutoff: 3600, mute: false, level: 0.8 },
  dur: (p) => (p.mute ? 0.18 : p.decay) + 0.06,
  build(ctx, out, p) {
    const t = T0, dec = p.mute ? 0.16 : p.decay, srcs = [];
    const sum = gain(ctx, 0.35);
    p.notes.forEach((n, i) => {
      for (const dt of [-7, 7]) {
        const o = osc(ctx, 'sawtooth', mtof(n));
        o.detune.value = dt;
        const og = gain(ctx, 1);
        // palhetada: cada corda entra alguns ms depois
        og.gain.setValueAtTime(0, t);
        og.gain.setValueAtTime(1, t + i * 0.006);
        chain(o, og, sum);
        srcs.push(o);
      }
    });
    const g = gain(ctx, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(p.level, t + 0.003);
    g.gain.exponentialRampToValueAtTime(p.level * 0.45, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, t + dec);
    g.gain.setValueAtTime(0, t + dec + 0.001);
    chain(sum, filt(ctx, 'highpass', 90), shaper(ctx, p.drive), filt(ctx, 'lowpass', p.mute ? 1600 : p.cutoff, 1),
      filt(ctx, 'peaking', 800, 1, -4), filt(ctx, 'peaking', 2400, 1.2, 4), g, out);
    start(srcs, t, t + dec + 0.04);
  },
};

V.keys = {
  d: { notes: [57, 60, 64, 67], decay: 1.6, index: 2.2, ratio: 1, tine: 0.25, level: 0.7 },
  dur: (p) => p.decay + 0.05,
  build(ctx, out, p) {
    const t = T0, srcs = [], end = t + p.decay + 0.04;
    const sum = gain(ctx, 1 / Math.sqrt(p.notes.length));
    for (const n of p.notes) {
      const f = mtof(n);
      const c = osc(ctx, 'sine', f), m = osc(ctx, 'sine', f * p.ratio), mg = gain(ctx, 0);
      perc(mg.gain, t, f * p.index, 0.001, p.decay * 0.5);
      chain(m, mg);
      mg.connect(c.frequency);
      const tn = osc(ctx, 'sine', f * 14), tg = gain(ctx, 0);
      perc(tg.gain, t, p.tine * 0.2, 0.0005, 0.05);
      chain(tn, tg, sum);
      c.connect(sum);
      srcs.push(c, m, tn);
    }
    const g = gain(ctx, 0);
    perc(g.gain, t, p.level, 0.002, p.decay);
    chain(sum, g, out);
    start(srcs, t, end);
  },
};

V.riser = {
  d: { dur: 2, f0: 200, f1: 5000, noise: 0.7, tone: 0.25, down: false },
  dur: (p) => p.dur + 0.05,
  build(ctx, out, p) {
    const t = T0, e = t + p.dur;
    const [a, b] = p.down ? [p.f1, p.f0] : [p.f0, p.f1];
    const n = noise(ctx, p.dur + 0.05), f = filt(ctx, 'bandpass', a, 3), ng = gain(ctx, p.noise);
    f.frequency.setValueAtTime(a, t);
    f.frequency.exponentialRampToValueAtTime(b, e);
    const o = osc(ctx, 'sawtooth', a / 4), og = gain(ctx, p.tone);
    o.frequency.setValueAtTime(a / 4, t);
    o.frequency.exponentialRampToValueAtTime(b / 4, e);
    const g = gain(ctx, 0);
    if (p.down) {
      g.gain.setValueAtTime(1, t);
      g.gain.exponentialRampToValueAtTime(0.001, e);
    } else {
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(1, e - 0.01);
      g.gain.linearRampToValueAtTime(0, e);
    }
    chain(n, f, ng, g);
    chain(o, filt(ctx, 'lowpass', 3000), og, g);
    g.connect(out);
    start([n, o], t, e + 0.02);
  },
};

V.impact = {
  d: { f0: 140, f1: 28, dur: 2.2, noise: 0.5 },
  dur: (p) => p.dur + 0.05,
  build(ctx, out, p) {
    const t = T0, e = t + p.dur;
    const o = osc(ctx, 'sine', p.f0), g = gain(ctx, 0);
    o.frequency.setValueAtTime(p.f0, t);
    o.frequency.exponentialRampToValueAtTime(p.f1, e);
    perc(g.gain, t, 1, 0.002, p.dur);
    chain(o, shaper(ctx, 0.3), g, out);
    const n = noise(ctx, p.dur), nf = filt(ctx, 'lowpass', 5000), ng = gain(ctx, 0);
    nf.frequency.setValueAtTime(6000, t);
    nf.frequency.exponentialRampToValueAtTime(200, t + p.dur * 0.6);
    perc(ng.gain, t, p.noise, 0.001, p.dur * 0.6);
    chain(n, nf, ng, out);
    start([o, n], t, e + 0.02);
  },
};

V.siren = {
  d: { f0: 650, f1: 1400, rate: 1.4, dur: 2, wave: 'sawtooth' },
  dur: (p) => p.dur + 0.05,
  build(ctx, out, p) {
    const t = T0, e = t + p.dur;
    const o = osc(ctx, p.wave, (p.f0 + p.f1) / 2), lfo = osc(ctx, 'triangle', p.rate), lg = gain(ctx, (p.f1 - p.f0) / 2);
    chain(lfo, lg);
    lg.connect(o.frequency);
    const g = gain(ctx, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.05);
    g.gain.setValueAtTime(0.5, e - 0.15);
    g.gain.linearRampToValueAtTime(0, e);
    chain(o, filt(ctx, 'lowpass', 4000), g, out);
    start([o, lfo], t, e + 0.02);
  },
};

V.airhorn = {
  d: { note: 70, hits: [[0, 0.13], [0.17, 0.13], [0.34, 0.6]], drive: 0.5 },
  dur: (p) => Math.max(...p.hits.map((h) => h[0] + h[1])) + 0.06,
  build(ctx, out, p) {
    const t = T0, f = mtof(p.note), total = Math.max(...p.hits.map((h) => h[0] + h[1])), srcs = [];
    const sum = gain(ctx, 0.25);
    for (const [r, w] of [[1, 'sawtooth'], [1.006, 'sawtooth'], [0.994, 'sawtooth'], [2, 'square'], [1.5, 'sawtooth']]) {
      const o = osc(ctx, w, f * r);
      for (const [s] of p.hits) {
        o.frequency.setValueAtTime(f * r * 0.86, t + s);
        o.frequency.exponentialRampToValueAtTime(f * r, t + s + 0.05);
      }
      o.connect(sum);
      srcs.push(o);
    }
    const g = gain(ctx, 0);
    for (const [s, l] of p.hits) {
      g.gain.setValueAtTime(0, t + s);
      g.gain.linearRampToValueAtTime(0.9, t + s + 0.01);
      g.gain.setValueAtTime(0.85, t + s + l - 0.04);
      g.gain.linearRampToValueAtTime(0, t + s + l);
    }
    chain(sum, filt(ctx, 'highpass', 350), filt(ctx, 'peaking', 1600, 1, 8), shaper(ctx, p.drive), filt(ctx, 'lowpass', 6000), g, out);
    start(srcs, t, t + total + 0.04);
  },
};

V.scratch = {
  d: { dur: 0.5, f: 260, moves: 4 },
  dur: (p) => p.dur + 0.04,
  build(ctx, out, p) {
    const t = T0, e = t + p.dur, N = 256;
    const fc = new Float32Array(N), gc = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const ph = (i / (N - 1)) * p.moves * Math.PI;
      const s = Math.abs(Math.sin(ph));
      fc[i] = p.f * (0.25 + 2.2 * s);
      gc[i] = Math.min(1, s * 3) * 0.8;
    }
    const o = osc(ctx, 'sawtooth', p.f), n = noise(ctx, p.dur + 0.05);
    o.frequency.setValueCurveAtTime(fc, t, p.dur);
    const bp = filt(ctx, 'bandpass', p.f * 4, 1.2);
    const bpc = fc.map((v) => Math.min(12000, v * 4));
    bp.frequency.setValueCurveAtTime(bpc, t, p.dur);
    const g = gain(ctx, 0);
    g.gain.setValueCurveAtTime(gc, t, p.dur);
    const ng = gain(ctx, 0.5);
    o.connect(bp);
    chain(n, ng, bp);
    chain(bp, g, out);
    start([o, n], t, e + 0.02);
  },
};

V.vinylstop = {
  d: { notes: [48, 55, 60], dur: 1.2 },
  dur: (p) => p.dur + 0.04,
  build(ctx, out, p) {
    const t = T0, e = t + p.dur, srcs = [];
    const sum = gain(ctx, 0.3), f = filt(ctx, 'lowpass', 4000, 1);
    f.frequency.setValueAtTime(4000, t);
    f.frequency.exponentialRampToValueAtTime(120, e);
    for (const n of p.notes) {
      const o = osc(ctx, 'sawtooth', mtof(n));
      o.frequency.setValueAtTime(mtof(n), t);
      o.frequency.exponentialRampToValueAtTime(mtof(n) * 0.08, e);
      o.connect(sum);
      srcs.push(o);
    }
    const g = gain(ctx, 0.8);
    g.gain.setValueAtTime(0.8, t);
    g.gain.linearRampToValueAtTime(0, e);
    chain(sum, f, g, out);
    start(srcs, t, e + 0.02);
  },
};

// ---- sons calculados direto em amostras (sem grafo de nós)
V.pluck = {
  d: { notes: [52, 59, 64, 68], decay: 1.4, damp: 0.5, strum: 0.012, level: 0.8 },
  dur: (p) => p.decay + p.notes.length * p.strum + 0.05,
  raw(sr, p) {
    const len = Math.floor(sr * (p.decay + p.notes.length * p.strum + 0.05));
    const outL = new Float32Array(len);
    p.notes.forEach((n, k) => {
      const per = Math.max(2, Math.round(sr / mtof(n)));
      const buf = new Float32Array(per);
      for (let i = 0; i < per; i++) buf[i] = Math.random() * 2 - 1;
      const off = Math.floor(k * p.strum * sr);
      const fb = Math.pow(0.001, 1 / (p.decay * mtof(n)));
      // damp 0 = brilhante, 1 = abafado (média de mais amostras vizinhas)
      const s = 0.2 + p.damp * 0.3;
      let idx = 0;
      for (let i = off; i < len; i++) {
        const cur = buf[idx];
        const nx = buf[(idx + 1) % per];
        buf[idx] = (cur * (1 - s) + nx * s) * fb;
        outL[i] += cur * p.level / Math.sqrt(p.notes.length);
        idx = (idx + 1) % per;
      }
    });
    return [outL];
  },
};

V.vinyl = {
  d: { dur: 2.5, crackle: 18, hiss: 0.04 },
  dur: (p) => p.dur,
  raw(sr, p) {
    const len = Math.floor(sr * p.dur), d = new Float32Array(len);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      lp += ((Math.random() * 2 - 1) - lp) * 0.08;
      d[i] = lp * p.hiss * 4;
      if (Math.random() < p.crackle / sr) {
        const a = (Math.random() * 0.6 + 0.2) * (Math.random() < 0.5 ? -1 : 1);
        for (let k = 0; k < 40 && i + k < len; k++) d[i + k] += a * Math.exp(-k / 6);
      }
    }
    // fade nas pontas para fazer loop sem estalo
    const f = Math.floor(sr * 0.02);
    for (let i = 0; i < f; i++) { d[i] *= i / f; d[len - 1 - i] *= i / f; }
    return [d];
  },
};

export const VOICE_TYPES = V;

const CATEGORY = {
  kick: 'Kicks', k808: '808 & Baixo', snare: 'Caixas', clap: 'Palmas', hat: 'Chimbais', cymbal: 'Pratos',
  tom: 'Tons', rim: 'Percussão', clave: 'Percussão', cowbell: 'Percussão', shaker: 'Percussão', conga: 'Percussão',
  cuica: 'Percussão', metal: 'Percussão', bell: 'Instrumentos', whistle: 'FX DJ', zap: 'FX DJ', vox: 'Vocais',
  stab: 'Instrumentos', guitar: 'Instrumentos', keys: 'Instrumentos', pluck: 'Instrumentos', riser: 'FX DJ',
  impact: 'FX DJ', siren: 'FX DJ', airhorn: 'FX DJ', scratch: 'FX DJ', vinylstop: 'FX DJ', vinyl: 'FX DJ',
};
export const categoryOf = (def) => def.cat || CATEGORY[def.t] || 'Outros';

// cor do pad por tipo de som, como os pads RGB das MPCs
export const CATEGORY_COLOR = {
  Kicks: '#ff2d3d', '808 & Baixo': '#ff6b00', Caixas: '#ffb000', Palmas: '#ffd60a', Chimbais: '#7cff4f',
  Pratos: '#2bdc6b', Tons: '#00e5a0', 'Percussão': '#00c2ff', Instrumentos: '#3d7bff', Vocais: '#a64dff',
  'FX DJ': '#ff3ea5', Outros: '#ececf1',
};

// ------------------------------------------------------------------ render
const cache = new Map();

export function soundKey(def) {
  return def.t + ':' + JSON.stringify(def.p || {});
}

export async function renderSound(def) {
  const key = soundKey(def);
  if (cache.has(key)) return cache.get(key);
  const job = (async () => {
    const type = V[def.t];
    if (!type) throw new Error('Tipo de som desconhecido: ' + def.t);
    const p = { ...type.d, ...(def.p || {}) };
    const len = Math.ceil(SR * (type.dur(p) + T0));
    let buffer;
    if (type.raw) {
      const chans = type.raw(SR, p);
      buffer = new AudioBuffer({ length: chans[0].length, numberOfChannels: chans.length, sampleRate: SR });
      chans.forEach((c, i) => buffer.copyToChannel(c, i));
    } else {
      const ctx = new OfflineAudioContext(1, len, SR);
      const out = ctx.createGain();
      out.connect(ctx.destination);
      type.build(ctx, out, p);
      buffer = await ctx.startRendering();
    }
    normalize(buffer, 0.89);
    return buffer;
  })();
  cache.set(key, job);
  return job;
}

export function normalize(buffer, target = 0.89) {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  }
  if (peak < 1e-6) return buffer;
  const k = target / peak;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= k;
  }
  return buffer;
}
