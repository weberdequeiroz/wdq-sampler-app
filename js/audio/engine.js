// Motor de áudio: 64 pads (4 bancos x 16), canais com volume/pan/mute/solo,
// cadeia master COLOR FX -> BEAT FX -> EQ -> limitador. Funciona tanto com
// AudioContext (tempo real) quanto com OfflineAudioContext (exportar WAV).
// No APK, com `native` definido, as notas e os efeitos vão para o motor nativo
// de baixa latência do Android; este grafo segue servindo de relógio e para a
// exportação.
import { ColorFX, BeatFX, DJEQ } from './fx.js';

export const PAD_COUNT = 64;

export class Engine {
  constructor(ctx, { realtime = true } = {}) {
    this.ctx = ctx;
    this.realtime = realtime;
    this.project = null;
    this.buffers = new Array(PAD_COUNT).fill(null);
    this.reversed = new Array(PAD_COUNT).fill(null);
    this.voices = new Set();
    this.onTrigger = null;

    this.bus = ctx.createGain();
    this.color = new ColorFX(ctx);
    this.beat = new BeatFX(ctx);
    this.eq = new DJEQ(ctx);
    this.limiter = new DynamicsCompressorNode(ctx, { threshold: -4, knee: 2, ratio: 20, attack: 0.002, release: 0.12 });
    this.master = new GainNode(ctx, { gain: 0.85 });
    this.bus.connect(this.color.input);
    this.color.output.connect(this.beat.input);
    this.beat.output.connect(this.eq.input);
    this.eq.output.connect(this.limiter).connect(this.master);
    this.master.connect(ctx.destination);
    if (realtime) {
      this.analyserL = new AnalyserNode(ctx, { fftSize: 1024 });
      this.analyserR = new AnalyserNode(ctx, { fftSize: 1024 });
      const split = new ChannelSplitterNode(ctx, { numberOfOutputs: 2 });
      this.master.connect(split);
      split.connect(this.analyserL, 0);
      split.connect(this.analyserR, 1);
    }
    this.channels = new Array(PAD_COUNT).fill(null);
    this.metro = new GainNode(ctx, { gain: 0.5 });
    this.metro.connect(ctx.destination);

    this.native = null;
    // qualquer mudança de efeito também vai para o motor nativo
    const wrap = (obj, names) => names.forEach((n) => {
      const f = obj[n].bind(obj);
      obj[n] = (...a) => { const r = f(...a); this.pushFx(); return r; };
    });
    wrap(this.color, ['set']);
    wrap(this.beat, ['setType', 'setFrac', 'setLevel', 'setBpm', 'setOn']);
    wrap(this.eq, ['set']);
  }

  pushFx() {
    if (this.native && this.project) this.native.fx(this.project.fx, this.project.bpm, this.beat.on);
  }

  setProject(project) {
    this.project = project;
    this.applyMix();
    this.applyFx();
  }

  channel(i) {
    if (!this.channels[i]) {
      const g = new GainNode(this.ctx, { gain: 0.8 });
      const p = new StereoPannerNode(this.ctx, { pan: 0 });
      g.connect(p).connect(this.bus);
      const ch = { gain: g, pan: p, meter: null };
      if (this.realtime) {
        ch.meter = new AnalyserNode(this.ctx, { fftSize: 256 });
        p.connect(ch.meter);
      }
      this.channels[i] = ch;
    }
    return this.channels[i];
  }

  applyMix() {
    if (!this.project) return;
    const pads = this.project.pads;
    const anySolo = pads.some((p) => p && p.params.solo);
    pads.forEach((pad, i) => {
      if (!pad) return;
      const ch = this.channel(i), P = pad.params;
      const audible = !P.mute && (!anySolo || P.solo);
      ch.gain.gain.setTargetAtTime(audible ? P.vol : 0, this.ctx.currentTime, 0.01);
      ch.pan.pan.setTargetAtTime(P.pan, this.ctx.currentTime, 0.01);
    });
  }

  applyFx() {
    const fx = this.project && this.project.fx;
    if (!fx) return;
    this.color.set(fx.color.type, fx.color.v);
    this.beat.setBpm(this.project.bpm);
    if (this.beat.type !== fx.beat.type) this.beat.setType(fx.beat.type);
    this.beat.setFrac(fx.beat.frac);
    this.beat.setLevel(fx.beat.level);
    this.eq.set('low', fx.eq.low);
    this.eq.set('mid', fx.eq.mid);
    this.eq.set('high', fx.eq.high);
    this.master.gain.setTargetAtTime(fx.master, this.ctx.currentTime, 0.01);
  }

  setBuffer(i, buffer) {
    this.buffers[i] = buffer;
    this.reversed[i] = null;
    if (this.native) this.native.setBuffer(i, buffer).catch((e) => console.warn(e));
  }

  reversedBuffer(i) {
    if (!this.reversed[i] && this.buffers[i]) {
      const b = this.buffers[i];
      const r = new AudioBuffer({ length: b.length, numberOfChannels: b.numberOfChannels, sampleRate: b.sampleRate });
      for (let c = 0; c < b.numberOfChannels; c++) {
        const src = b.getChannelData(c), dst = r.getChannelData(c);
        for (let k = 0, n = src.length; k < n; k++) dst[k] = src[n - 1 - k];
      }
      this.reversed[i] = r;
    }
    return this.reversed[i];
  }

  stopVoice(v, time) {
    const t = Math.max(time, this.ctx.currentTime);
    try {
      v.env.gain.cancelScheduledValues(t);
      v.env.gain.setTargetAtTime(0, t, 0.006);
      v.src.stop(t + 0.05);
    } catch (e) { /* voz já terminou */ }
    this.voices.delete(v);
  }

  stopAll() {
    if (this.native) this.native.stopAll();
    for (const v of [...this.voices]) this.stopVoice(v, this.ctx.currentTime);
  }

  trigger(i, vel = 100, time = this.ctx.currentTime, opt = {}) {
    const pad = this.project && this.project.pads[i];
    const buf = this.buffers[i];
    if (!pad || !buf) return null;
    const P = pad.params, ctx = this.ctx;
    time = Math.max(time, ctx.currentTime);
    if (this.native) {
      const anySolo = this.project.pads.some((p) => p && p.params.solo);
      const gain = !P.mute && (!anySolo || P.solo) ? P.vol : 0;
      this.native.hit(i, vel, time - ctx.currentTime, opt.tune || 0, P, gain);
      if (this.onTrigger) this.onTrigger(i, vel, time);
      return {};
    }

    for (const v of [...this.voices]) {
      if (v.end < time) { this.voices.delete(v); continue; }
      if ((P.choke && v.choke === P.choke && v.pad !== i) || (!P.poly && v.pad === i)) this.stopVoice(v, time);
    }

    const src = ctx.createBufferSource();
    src.buffer = P.reverse ? this.reversedBuffer(i) : buf;
    const rate = Math.pow(2, (P.tune + (opt.tune || 0)) / 12 + P.fine / 1200);
    src.playbackRate.value = rate;
    const dur = buf.duration;
    let s = Math.min(P.start, P.end), e = Math.max(P.start, P.end);
    if (P.reverse) [s, e] = [1 - e, 1 - s];
    const offset = s * dur, span = Math.max(0.005, (e - s) * dur);
    const playLen = (span / rate) * Math.max(0.02, P.decay);

    const env = ctx.createGain();
    const amp = Math.pow(Math.max(1, vel) / 127, 1.4);
    const atk = Math.min(P.attack, playLen * 0.9);
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(amp, time + Math.max(0.001, atk));
    const holdEnd = time + Math.max(atk + 0.001, P.decay < 0.999 ? playLen * 0.4 : playLen - Math.min(0.03, playLen * 0.3));
    env.gain.setValueAtTime(amp, holdEnd);
    if (P.decay < 0.999) env.gain.exponentialRampToValueAtTime(Math.max(amp * 0.001, 1e-5), time + playLen);
    env.gain.linearRampToValueAtTime(0, time + playLen + 0.005);

    let head = src;
    if (P.ftype && P.ftype !== 'off') {
      const f = new BiquadFilterNode(ctx, { type: P.ftype, frequency: P.cutoff, Q: P.res });
      src.connect(f);
      head = f;
    }
    head.connect(env).connect(this.channel(i).gain);
    src.start(time, offset, span);
    src.stop(time + playLen + 0.02);
    const v = { src, env, pad: i, choke: P.choke, end: time + playLen + 0.02 };
    this.voices.add(v);
    src.onended = () => this.voices.delete(v);
    if (this.onTrigger) this.onTrigger(i, vel, time);
    return v;
  }

  dispose() {
    this.stopAll();
    try { this.color.noise.stop(); this.beat.lfo.stop(); } catch (e) { /* já parado */ }
    try { this.master.disconnect(); this.metro.disconnect(); } catch (e) { /* já desligado */ }
  }

  click(time, accent) {
    if (this.native) { this.native.click(Math.max(0, time - this.ctx.currentTime), accent); return; }
    const o = new OscillatorNode(this.ctx, { type: 'sine', frequency: accent ? 1800 : 1200 });
    const g = new GainNode(this.ctx, { gain: 0 });
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(accent ? 0.6 : 0.35, time + 0.001);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    o.connect(g).connect(this.metro);
    o.start(time);
    o.stop(time + 0.06);
  }

  meterLevel(analyser) {
    if (!analyser) return 0;
    const a = this._tmp && this._tmp.length === analyser.fftSize ? this._tmp : (this._tmp = new Float32Array(analyser.fftSize));
    analyser.getFloatTimeDomainData(a);
    let peak = 0;
    for (let k = 0; k < a.length; k++) { const x = Math.abs(a[k]); if (x > peak) peak = x; }
    return peak;
  }
}
