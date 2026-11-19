// Efeitos no estilo de mixer de DJ: COLOR FX (um knob bipolar) e BEAT FX
// (efeito sincronizado ao BPM com seletor de batida, LEVEL/DEPTH e botão ON).

export function makeIR(ctx, seconds = 2.8, decay = 3) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return ir;
}

function crushCurve(bits) {
  const n = 4096, c = new Float32Array(n), steps = Math.pow(2, bits) / 2;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.round(x * steps) / steps;
  }
  return c;
}

const smooth = (param, v, ctx, tc = 0.015) => param.setTargetAtTime(v, ctx.currentTime, tc);

export const COLOR_TYPES = ['FILTER', 'SPACE', 'CRUSH', 'NOISE'];

export class ColorFX {
  constructor(ctx) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 22000, Q: 0.7 });
    this.hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 10, Q: 0.7 });
    this.crush = ctx.createWaveShaper();
    this.input.connect(this.lp).connect(this.hp).connect(this.crush).connect(this.output);

    // ruído (NOISE)
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = new AudioBufferSourceNode(ctx, { buffer: nb, loop: true });
    this.noiseFilter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 2000, Q: 1 });
    this.noiseGain = new GainNode(ctx, { gain: 0 });
    this.noise.connect(this.noiseFilter).connect(this.noiseGain).connect(this.output);
    this.noise.start();

    // reverb (SPACE)
    this.spaceSend = new GainNode(ctx, { gain: 0 });
    this.spaceConv = new ConvolverNode(ctx, { buffer: makeIR(ctx, 3.2, 2.5) });
    this.spaceFilter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 20000 });
    this.hp.connect(this.spaceSend).connect(this.spaceConv).connect(this.spaceFilter).connect(this.output);

    this.type = 'FILTER';
    this.value = 0;
  }

  set(type, v) {
    const ctx = this.ctx;
    this.type = type;
    this.value = v;
    const a = Math.abs(v);
    let lp = 22000, hp = 10, q = 0.7, noise = 0, space = 0, sf = 20000, sft = 'lowpass', crushBits = 0;
    if (a > 0.02) {
      if (type === 'FILTER') {
        if (v < 0) lp = 22000 * Math.pow(160 / 22000, a);
        else hp = 20 * Math.pow(9000 / 20, a);
        q = 0.7 + a * 5;
      } else if (type === 'CRUSH') {
        crushBits = Math.round(14 - a * 11);
        if (v < 0) lp = 22000 * Math.pow(1800 / 22000, a * 0.6);
        else hp = 20 * Math.pow(1500 / 20, a * 0.6);
      } else if (type === 'NOISE') {
        noise = a * 0.22;
        if (v < 0) { this.noiseFilter.type = 'lowpass'; smooth(this.noiseFilter.frequency, 8000 * Math.pow(0.04, a), ctx); }
        else { this.noiseFilter.type = 'highpass'; smooth(this.noiseFilter.frequency, 300 * Math.pow(30, a), ctx); }
        if (v < 0) lp = 22000 * Math.pow(0.3, a); else hp = 20 * Math.pow(15, a);
      } else if (type === 'SPACE') {
        space = Math.min(1, a * 1.4);
        if (v < 0) { sft = 'lowpass'; sf = 12000 * Math.pow(0.05, a); }
        else { sft = 'highpass'; sf = 100 * Math.pow(20, a); }
      }
    }
    smooth(this.lp.frequency, lp, ctx);
    smooth(this.hp.frequency, hp, ctx);
    smooth(this.lp.Q, type === 'FILTER' && v < 0 ? q : 0.7, ctx);
    smooth(this.hp.Q, type === 'FILTER' && v > 0 ? q : 0.7, ctx);
    smooth(this.noiseGain.gain, noise, ctx);
    smooth(this.spaceSend.gain, space, ctx);
    this.spaceFilter.type = sft;
    smooth(this.spaceFilter.frequency, sf, ctx);
    this.crush.curve = crushBits ? crushCurve(crushBits) : null;
  }
}

export const BEAT_TYPES = ['DELAY', 'ECHO', 'PING PONG', 'REVERB', 'FLANGER', 'TRANS', 'ROLL'];
export const BEAT_FRACS = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 3 / 4, 1, 2, 4];
export const fracLabel = (f) => ({ 0.0625: '1/16', 0.125: '1/8', 0.25: '1/4', 0.5: '1/2', 0.75: '3/4', 1: '1', 2: '2', 4: '4' })[f] || String(f);

export class BeatFX {
  constructor(ctx) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dry = new GainNode(ctx, { gain: 1 });
    this.trans = new GainNode(ctx, { gain: 1 });
    this.input.connect(this.dry).connect(this.trans).connect(this.output);

    this.send = new GainNode(ctx, { gain: 0 });
    this.input.connect(this.send);
    this.wet = new GainNode(ctx, { gain: 0 });
    this.wet.connect(this.output);

    // DELAY / ECHO / ROLL
    this.d = new DelayNode(ctx, { maxDelayTime: 8, delayTime: 0.25 });
    this.fb = new GainNode(ctx, { gain: 0 });
    this.d.connect(this.fb).connect(this.d);
    // PING PONG
    this.dl = new DelayNode(ctx, { maxDelayTime: 8, delayTime: 0.25 });
    this.dr = new DelayNode(ctx, { maxDelayTime: 8, delayTime: 0.25 });
    this.pfb = new GainNode(ctx, { gain: 0.5 });
    this.merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
    this.pingIn = new GainNode(ctx, { channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
    this.pingIn.connect(this.dl);
    this.dl.connect(this.dr);
    this.dr.connect(this.pfb).connect(this.dl);
    this.dl.connect(this.merger, 0, 0);
    this.dr.connect(this.merger, 0, 1);
    // REVERB
    this.conv = new ConvolverNode(ctx, { buffer: makeIR(ctx, 3.5, 2.2) });
    // FLANGER
    this.fd = new DelayNode(ctx, { maxDelayTime: 0.05, delayTime: 0.006 });
    this.ffb = new GainNode(ctx, { gain: 0.6 });
    this.fd.connect(this.ffb).connect(this.fd);
    this.lfo = new OscillatorNode(ctx, { type: 'triangle', frequency: 0.25 });
    this.lfoGain = new GainNode(ctx, { gain: 0.0025 });
    this.lfo.connect(this.lfoGain).connect(this.fd.delayTime);
    this.lfo.start();
    // TRANS
    this.transDepth = new GainNode(ctx, { gain: 0 });
    this.transDepth.connect(this.trans.gain);
    this.transOsc = null;

    this.type = 'ECHO';
    this.frac = 1 / 2;
    this.level = 0.5;
    this.on = false;
    this.bpm = 120;
    this._route();
  }

  get time() { return (60 / this.bpm) * this.frac; }

  _chainIn() {
    switch (this.type) {
      case 'PING PONG': return this.pingIn;
      case 'REVERB': return this.conv;
      case 'FLANGER': return this.fd;
      case 'TRANS': return null;
      default: return this.d;
    }
  }
  _chainOut() {
    switch (this.type) {
      case 'PING PONG': return this.merger;
      case 'REVERB': return this.conv;
      case 'FLANGER': return this.fd;
      case 'TRANS': return null;
      default: return this.d;
    }
  }

  _route() {
    try { this.send.disconnect(); } catch (e) { /* sem conexões */ }
    for (const n of [this.d, this.merger, this.conv, this.fd]) {
      try { n.disconnect(this.wet); } catch (e) { /* não estava ligado */ }
    }
    const a = this._chainIn(), b = this._chainOut();
    if (a) this.send.connect(a);
    if (b) b.connect(this.wet);
    this._params();
  }

  _params() {
    const ctx = this.ctx, t = this.time, L = this.level;
    smooth(this.d.delayTime, Math.min(8, t), ctx, 0.03);
    smooth(this.dl.delayTime, Math.min(8, t), ctx, 0.03);
    smooth(this.dr.delayTime, Math.min(8, t), ctx, 0.03);
    if (this.type === 'ROLL') return;
    let fb = 0, wet = L;
    if (this.type === 'DELAY') fb = 0.3;
    if (this.type === 'ECHO') fb = 0.62;
    if (this.type === 'PING PONG') this.pfb.gain.value = 0.55;
    if (this.type === 'FLANGER') {
      this.lfo.frequency.value = 1 / Math.max(0.05, t * 4);
      wet = this.on ? L : 0;
    }
    if (this.type === 'REVERB') wet = L * 1.2;
    smooth(this.fb.gain, fb, ctx);
    smooth(this.wet.gain, wet, ctx);
    if (this.type === 'TRANS' && this.on) {
      this.trans.gain.value = 1 - L * 0.5;
      this.transDepth.gain.value = L * 0.5;
      if (this.transOsc) this.transOsc.frequency.value = 1 / t;
    }
  }

  setType(type) {
    const was = this.on;
    if (was) this.setOn(false);
    this.type = type;
    this._route();
    if (was) this.setOn(true);
  }
  setFrac(f) { this.frac = f; this._params(); if (this.on && this.type === 'ROLL') { this.setOn(false); this.setOn(true); } }
  setLevel(l) { this.level = l; this._params(); }
  setBpm(bpm) { this.bpm = bpm; this._params(); }

  setOn(on, when) {
    const ctx = this.ctx, now = when ?? ctx.currentTime;
    this.on = on;
    const t = this.time;
    if (this.type === 'ROLL') {
      for (const p of [this.send.gain, this.fb.gain, this.dry.gain, this.wet.gain]) p.cancelScheduledValues(now);
      if (on) {
        // captura um pedaço do tamanho da batida e repete em loop
        this.d.delayTime.setValueAtTime(t, now);
        this.send.gain.setValueAtTime(1, now);
        this.fb.gain.setValueAtTime(0, now);
        this.wet.gain.setValueAtTime(0, now);
        this.send.gain.setValueAtTime(0, now + t);
        this.fb.gain.setValueAtTime(1, now + t);
        this.wet.gain.setValueAtTime(1, now + t);
        this.dry.gain.setValueAtTime(1, now + t - 0.004);
        this.dry.gain.linearRampToValueAtTime(1 - this.level, now + t);
      } else {
        this.send.gain.setValueAtTime(0, now);
        this.fb.gain.setTargetAtTime(0, now, 0.01);
        this.wet.gain.setTargetAtTime(0, now, 0.01);
        this.dry.gain.setTargetAtTime(1, now, 0.005);
      }
      return;
    }
    if (this.type === 'TRANS') {
      if (this.transOsc) { try { this.transOsc.stop(); } catch (e) { /* já parado */ } this.transOsc.disconnect(); this.transOsc = null; }
      if (on) {
        this.transOsc = new OscillatorNode(ctx, { type: 'square', frequency: 1 / t });
        this.transOsc.connect(this.transDepth);
        this.transOsc.start(now);
        this.trans.gain.value = 1 - this.level * 0.5;
        this.transDepth.gain.value = this.level * 0.5;
      } else {
        this.transDepth.gain.value = 0;
        this.trans.gain.value = 1;
      }
      return;
    }
    // demais: corta só a entrada; a cauda do eco/delay/reverb continua soando
    this.send.gain.setTargetAtTime(on ? 1 : 0, now, 0.008);
    if (this.type === 'FLANGER') this.wet.gain.setTargetAtTime(on ? this.level : 0, now, 0.02);
  }
}

// Equalizador de 3 bandas tipo mixer de DJ (quase isolador no corte)
export class DJEQ {
  constructor(ctx) {
    this.low = new BiquadFilterNode(ctx, { type: 'lowshelf', frequency: 220 });
    this.mid = new BiquadFilterNode(ctx, { type: 'peaking', frequency: 1000, Q: 0.6 });
    this.high = new BiquadFilterNode(ctx, { type: 'highshelf', frequency: 3800 });
    this.low.connect(this.mid).connect(this.high);
    this.input = this.low;
    this.output = this.high;
  }
  set(band, v) {
    const db = v < 0 ? v * 30 : v * 6;
    this[band].gain.value = db;
  }
}
