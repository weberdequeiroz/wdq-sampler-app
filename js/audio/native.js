// Ponte com o motor de áudio nativo do APK (Android): pads, sequenciador,
// metrônomo e efeitos tocam pelo áudio de baixa latência do sistema em vez do
// Web Audio do WebView, que no Android costuma atrasar 50–150 ms.
import { f32ToB64 } from '../project.js';
import { COLOR_TYPES, BEAT_TYPES } from './fx.js';

const FTYPE = { off: 0, lowpass: 1, highpass: 2, bandpass: 3 };
const PREF = 'wdq.nativeAudio';

export class NativeAudio {
  static detect() {
    try {
      const b = window.WDQAndroid;
      if (!b || typeof b.audioInfo !== 'function') return null;
      return JSON.parse(b.audioInfo());
    } catch (e) {
      return null;
    }
  }

  static enabledPref() {
    try { return localStorage.getItem(PREF) !== '0'; } catch (e) { return true; }
  }

  static setEnabledPref(on) {
    try { localStorage.setItem(PREF, on ? '1' : '0'); } catch (e) { /* sem armazenamento */ }
  }

  constructor(info) {
    this.b = window.WDQAndroid;
    this.info = info;
    this.tokens = new Array(64).fill(0);
    this.resampled = new WeakMap();
  }

  /** Estado atual: latência, modo de estabilidade e engasgos (underruns). */
  status() {
    try { return JSON.parse(this.b.audioInfo()); } catch (e) { return this.info; }
  }

  get latencyMs() { return this.status().latencyMs; }

  setMode(mode) { if (this.b.audioSetMode) this.b.audioSetMode(mode); }

  // Converte uma vez para a taxa do aparelho (ex.: 48 kHz) com o reamostrador
  // de alta qualidade do navegador, para o motor nativo não ter de interpolar.
  async toDeviceRate(buf) {
    const sr = this.info.sr;
    if (!sr || buf.sampleRate === sr) return buf;
    if (this.resampled.has(buf)) return this.resampled.get(buf);
    const len = Math.max(1, Math.ceil((buf.length * sr) / buf.sampleRate));
    const off = new OfflineAudioContext(buf.numberOfChannels, len, sr);
    const src = new AudioBufferSourceNode(off, { buffer: buf });
    src.connect(off.destination);
    src.start();
    const out = await off.startRendering();
    this.resampled.set(buf, out);
    return out;
  }

  async setBuffer(i, buf) {
    const tok = ++this.tokens[i];
    if (!buf) { this.b.audioSetBuffer(i, 44100, '', ''); return; }
    let b = buf;
    try { b = await this.toDeviceRate(buf); } catch (e) { b = buf; }
    if (tok !== this.tokens[i]) return; // chegou um som mais novo para este pad
    const l = f32ToB64(b.getChannelData(0));
    const r = b.numberOfChannels > 1 ? f32ToB64(b.getChannelData(1)) : '';
    this.b.audioSetBuffer(i, b.sampleRate, l, r);
  }

  hit(i, vel, delay, tune, P, gain) {
    const csv = [gain, P.pan, P.tune, P.fine, P.attack, P.decay, FTYPE[P.ftype] || 0, P.cutoff, P.res,
      P.start, P.end, P.reverse ? 1 : 0, P.choke || 0, P.poly ? 0 : 1].join(','); // último campo: corta o próprio pad
    this.b.audioHit(i, vel, delay, tune, csv);
  }

  click(delay, accent) { this.b.audioClick(delay, !!accent); }
  stopAll() { this.b.audioStopAll(); }

  fx(fx, bpm, on) {
    this.b.audioFx([
      Math.max(0, COLOR_TYPES.indexOf(fx.color.type)), fx.color.v,
      Math.max(0, BEAT_TYPES.indexOf(fx.beat.type)), fx.beat.frac, fx.beat.level, on ? 1 : 0, bpm,
      fx.eq.low, fx.eq.mid, fx.eq.high, fx.master,
    ].join(','));
  }

  /** [master L, master R, pad 0..63] — pico desde a última leitura. */
  meters() {
    try { return this.b.audioMeters().split(',').map(Number); } catch (e) { return null; }
  }

  recStart() { this.b.audioRecStart(); }

  /** Para a gravação e devolve um AudioBuffer (para resample). */
  recTakeBuffer() {
    const [sr, b64] = this.b.audioRecStop('take', '').split(';');
    const bin = atob(b64 || '');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const pcm = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
    const frames = Math.floor(pcm.length / 2);
    const buf = new AudioBuffer({ length: Math.max(1, frames), numberOfChannels: 2, sampleRate: Number(sr) || 48000 });
    const l = buf.getChannelData(0), r = buf.getChannelData(1);
    for (let i = 0; i < frames; i++) { l[i] = pcm[i * 2] / 32767; r[i] = pcm[i * 2 + 1] / 32767; }
    return buf;
  }

  /** Para a gravação e salva o WAV direto em Downloads/WDQ Sampler. */
  recSaveFile(name) { return this.b.audioRecStop('file', name); }
}
