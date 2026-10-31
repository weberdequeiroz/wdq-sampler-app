// Sequenciador com agendamento antecipado (lookahead) sobre o relógio do áudio.
// Faz: patterns A–H de 16/32/64 passos, swing, ratchet, troca de pattern no fim
// do compasso, modo song, gravação ao vivo quantizada e note repeat.

export const NR_RATES = [
  { id: '1/4', beats: 1 }, { id: '1/8', beats: 0.5 }, { id: '1/8T', beats: 1 / 3 },
  { id: '1/16', beats: 0.25 }, { id: '1/16T', beats: 1 / 6 }, { id: '1/32', beats: 0.125 },
];

// dispara as notas de um passo (usado ao vivo e na exportação WAV)
export function playStep(engine, pat, s, time, sd) {
  for (const key in pat.steps) {
    const v = pat.steps[key][s];
    if (!v) continue;
    const pad = Number(key);
    const r = (pat.rat[key] && pat.rat[key][s]) || 1;
    for (let k = 0; k < r; k++) engine.trigger(pad, k ? v * 0.8 : v, time + (k * sd) / r);
  }
}

export const swingOffset = (s, swing, sd) => (s % 2 === 1 ? ((swing - 50) / 50) * sd : 0);

export class Sequencer {
  constructor(engine, hooks = {}) {
    this.engine = engine;
    this.hooks = hooks;
    this.playing = false;
    this.recording = false;
    this.metronome = false;
    this.step = 0;
    this.nextTime = 0;
    this.pattern = 0;
    this.queued = null;
    this.songPos = 0;
    this.held = new Map(); // pad -> { next, vel, tune }
    this.nrRate = NR_RATES[3];
    this.timer = setInterval(() => this.tick(), 20);
  }

  get project() { return this.engine.project; }
  get ctx() { return this.engine.ctx; }
  get stepDur() { return 60 / this.project.bpm / 4; }
  get pat() { return this.project.patterns[this.pattern]; }

  destroy() { clearInterval(this.timer); }

  // PLAY continua de `fromStep` (onde parou); PLAY START passa 0
  start(fromStep = 0) {
    if (this.playing) return;
    if (this.project.songMode && this.project.song.length && !fromStep) {
      this.songPos = 0;
      this.pattern = this.project.song[0];
    }
    this.step = fromStep > 0 && fromStep < this.pat.length ? fromStep : 0;
    this.nextTime = this.ctx.currentTime + 0.06;
    this.playing = true;
    this.hooks.onState && this.hooks.onState();
    this.tick();
  }

  stop() {
    // guarda a posição que estava soando, para o PLAY continuar dali
    if (this.playing) this.pausedStep = Math.floor(this.positionAt(this.ctx.currentTime));
    this.playing = false;
    this.replacePass = false;
    this.step = 0;
    this.queued = null;
    this.hooks.onState && this.hooks.onState();
    this.hooks.onStep && this.hooks.onStep(-1);
  }

  queuePattern(i) {
    if (!this.playing) { this.pattern = i; this.queued = null; this.pausedStep = 0; }
    else this.queued = i;
    this.hooks.onPattern && this.hooks.onPattern();
  }

  tick() {
    if (!this.project) return;
    const ahead = this.ctx.currentTime + 0.12;
    while (this.playing && this.nextTime < ahead) {
      this.scheduleStep(this.step, this.nextTime);
      this.advance();
    }
    // note repeat
    for (const h of this.held.values()) {
      const iv = (60 / this.project.bpm) * this.nrRate.beats;
      while (h.next < ahead) {
        this.engine.trigger(h.pad, h.vel, h.next, { tune: h.tune });
        this.record(h.pad, h.vel, h.next);
        h.next += iv;
      }
    }
  }

  swingOffset(s) { return swingOffset(s, this.project.swing, this.stepDur); }

  scheduleStep(s, t) {
    // REC (como na MPC): na primeira volta apaga o que havia no passo e grava por cima
    if (this.replacePass && this.recording) {
      const pat = this.pat;
      for (const key in pat.steps) pat.steps[key][s] = 0;
      for (const key in pat.rat) pat.rat[key][s] = 0;
      if (this.hooks.onReplace) this.hooks.onReplace(s);
    }
    playStep(this.engine, this.pat, s, t + this.swingOffset(s), this.stepDur);
    if (this.metronome && s % 4 === 0) this.engine.click(t, s === 0);
    if (this.hooks.onStep) {
      const delay = Math.max(0, (t - this.ctx.currentTime) * 1000);
      const pi = this.pattern;
      setTimeout(() => this.playing && this.hooks.onStep(s, pi), delay);
    }
  }

  advance() {
    this.nextTime += this.stepDur;
    this.step++;
    if (this.step >= this.pat.length) {
      this.step = 0;
      if (this.replacePass) {
        // depois de uma volta inteira o REC vira OVERDUB, como na MPC
        this.replacePass = false;
        if (this.hooks.onState) setTimeout(() => this.hooks.onState(), Math.max(0, (this.nextTime - this.ctx.currentTime) * 1000));
      }
      const p = this.project;
      if (p.songMode && p.song.length) {
        this.songPos = (this.songPos + 1) % p.song.length;
        this.pattern = p.song[this.songPos];
      } else if (this.queued != null) {
        this.pattern = this.queued;
        this.queued = null;
      }
      if (this.hooks.onPattern) {
        const delay = Math.max(0, (this.nextTime - this.ctx.currentTime) * 1000);
        setTimeout(() => this.hooks.onPattern(), delay);
      }
    }
  }

  // posição (em passos, fracionária) que está tocando no instante `time`
  positionAt(time) {
    const len = this.pat.length;
    const pos = this.step - (this.nextTime - time) / this.stepDur;
    return ((pos % len) + len) % len;
  }

  record(pad, vel, time = this.ctx.currentTime) {
    if (!this.playing || !this.recording) return;
    const len = this.pat.length;
    const s = Math.round(this.positionAt(time)) % len;
    const pat = this.pat;
    if (!pat.steps[pad]) pat.steps[pad] = new Array(64).fill(0);
    pat.steps[pad][s] = Math.max(1, Math.min(127, Math.round(vel)));
    this.hooks.onRecord && this.hooks.onRecord(pad, s);
  }

  // key = botão físico/tecla segurado; pad = som que ele dispara
  hold(key, pad, vel, opts = {}) {
    const now = this.ctx.currentTime;
    const iv = (60 / this.project.bpm) * this.nrRate.beats;
    this.engine.trigger(pad, vel, now, { tune: opts.tune });
    this.record(pad, vel, now);
    let next = now + iv;
    if (this.playing) {
      // alinha as repetições à grade do compasso
      const origin = this.nextTime - this.step * this.stepDur;
      next = origin + Math.ceil((now + 0.01 - origin) / iv) * iv;
    }
    this.held.set(key, { pad, next, vel, tune: opts.tune });
  }

  release(key) { this.held.delete(key); }
}
