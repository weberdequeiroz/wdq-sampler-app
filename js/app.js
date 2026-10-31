// Controlador principal do WDQ Sampler: liga motor de áudio, sequenciador,
// biblioteca, pasta de projetos e toda a interface.
import { Engine } from './audio/engine.js';
import { renderSound, normalize, categoryOf, SR } from './audio/voices.js';
import { COLOR_TYPES, BEAT_TYPES, BEAT_FRACS, fracLabel } from './audio/fx.js';
import { Sequencer, NR_RATES, playStep, swingOffset } from './sequencer.js';
import { KITS, beatToPattern, allSounds } from './library.js';
import {
  BANKS, PATTERN_NAMES, newProject, padFromSound, padFromSample, padLabel, uid,
  projectToFile, projectFromFile, cloneProject, migrate, defaultParams,
} from './project.js';
import * as store from './storage.js';
import { Cloud } from './cloud.js';
import { Midi } from './midi.js';
import { bufferToWav, deliverFile } from './wav.js';
import { knob } from './ui/knob.js';
import { $, $$, h, toast, confirmDialog, promptDialog, choiceDialog, modal, fmtTime, fmtDate } from './ui/dom.js';
import { CONFIG } from './config.js';
import { startTour } from './ui/tour.js';
import { shareApp } from './ui/share.js';
import { AdminPanel } from './admin.js';
import { Usage } from './usage.js';
import { localId } from './auth.js';
import { NativeAudio } from './audio/native.js';

// telas pequenas: celular em pé (até 900 px) ou deitado (pouca altura)
export const COMPACT = '(max-width: 900px), (orientation: landscape) and (max-height: 560px)';
const PAD_ORDER = [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3];
const KEYMAP = {
  KeyZ: 0, KeyX: 1, KeyC: 2, KeyV: 3, KeyA: 4, KeyS: 5, KeyD: 6, KeyF: 7,
  KeyQ: 8, KeyW: 9, KeyE: 10, KeyR: 11, Digit1: 12, Digit2: 13, Digit3: 14, Digit4: 15,
};
const KEYLABEL = ['Z', 'X', 'C', 'V', 'A', 'S', 'D', 'F', 'Q', 'W', 'E', 'R', '1', '2', '3', '4'];
const PAD_COLORS = ['#ff2d3d', '#ff6b00', '#ffb000', '#ffd60a', '#7cff4f', '#2bdc6b', '#00e5a0', '#00c2ff', '#3d7bff', '#a64dff', '#ff3ea5', '#ececf1'];
const MAX_SAMPLE_SEC = 90;
const LONG_PRESS_MS = 2000; // segurar 2 s abre o menu do item
const ICON_EXPAND = '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
const ICON_SHRINK = '<svg viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M7 5v14l12-7z"/></svg>';
const ICON_STOP = '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12"/></svg>';

export class App {
  constructor(auth, ctx, hooks = {}) {
    this.auth = auth;
    this.ctx = ctx;
    this.hooks = hooks;
    this.cloud = new Cloud(auth);
    this.usage = new Usage(auth);
    this.engine = new Engine(ctx);
    const nativeInfo = NativeAudio.detect();
    this.nativeAvailable = !!nativeInfo;
    if (nativeInfo && NativeAudio.enabledPref()) this.engine.native = new NativeAudio(nativeInfo);
    this.engine.onTrigger = (i, vel, time) => this.flash(i, vel, time);
    this.seq = new Sequencer(this.engine, {
      onStep: (s, pi) => this.onStep(s, pi),
      onPattern: () => { this.renderPatternBtns(); if (this.view === 'seq') this.renderView(); this.updateLcd(); },
      onState: () => this.renderTransport(),
      onRecord: (pad, s) => { if (this.view === 'seq') this.updateCell(pad, s); this.markDirty(); },
      onReplace: (s) => {
        const delay = Math.max(0, (this.seq.nextTime - this.ctx.currentTime) * 1000);
        setTimeout(() => { if (this.view === 'seq') for (let r = 0; r < 16; r++) this.updateCell(this.bank * 16 + r, s); }, delay);
        this.markDirty();
      },
    });
    this.preview = null;
    this.bank = 0;
    this.sel = 0;
    this.view = 'seq';
    this.fullLevel = false;
    this.levels = 'off';
    this.levelsPad = 0;
    this.nr = false;
    this.tool = 'draw';
    this.seqPage = 0;
    this.lib = 'kits';
    this.libQuery = '';
    this.openKit = 'funk-rio';
    this.held = new Map();
    this.taps = [];
    this.saveTimer = null;
    this.cloudTimer = null;
    this.dirty = false;
    this.clipboard = null;
    this.recorder = null;
    this.midi = new Midi({
      onNoteOn: (n, v) => this.midiNote(n, v, true),
      onNoteOff: (n) => this.midiNote(n, 0, false),
      onLearn: (n, pad) => { this.p.midiMap[n] = pad; this.markDirty(); toast(`Nota ${n} ligada ao pad ${padLabel(pad)}`, 'ok'); if (this.view === 'settings') this.renderView(); },
      onDevices: () => { if (this.view === 'settings') this.renderView(); },
      onStart: () => this.play(),
      onStop: () => this.stop(),
    });
  }

  get user() { return this.auth.user; }
  get pat() { return this.p.patterns[this.seq.pattern]; }

  // ================================================================ início
  async start() {
    this.buildStatic();
    await this.adoptLocalProjects();
    const last = await store.getMeta('last:' + this.user.id);
    let p = last ? await store.loadProject(this.user.id, last) : null;
    if (!p) {
      const list = await store.listProjects(this.user.id);
      if (list.length) p = await store.loadProject(this.user.id, list[0].id);
    }
    if (!p) p = await this.starterProject();
    await this.setProject(migrate(p));
    this.bindKeys();
    this.meterLoop();
    this.usage.start();
    window.addEventListener('beforeunload', () => { if (this.dirty) this.saveNow(); });
    if (!(await store.getMeta('tour:' + this.user.id))) setTimeout(() => this.tour(), 600);
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.dirty) this.saveNow(); });
  }

  // Quem usava conta só neste aparelho e passou a usar a conta na nuvem com o
  // mesmo e-mail continua com os projetos, o último aberto e o tutorial visto.
  async adoptLocalProjects() {
    if (this.auth.mode !== 'cloud') return;
    const old = await localId(this.user.email);
    if (await store.getMeta('adopted:' + old)) return;
    const list = await store.listProjects(old);
    for (const it of list) {
      const p = await store.loadProject(old, it.id);
      if (p) await store.saveProject(this.user.id, p);
    }
    for (const k of ['last:', 'tour:']) {
      const v = await store.getMeta(k + old);
      if (v !== undefined && (await store.getMeta(k + this.user.id)) === undefined) await store.setMeta(k + this.user.id, v);
    }
    await store.setMeta('adopted:' + old, true);
    if (list.length) toast(`${list.length} projeto(s) deste aparelho agora estão na sua conta`, 'ok');
  }

  async starterProject() {
    const p = newProject('Meu primeiro beat');
    const funk = KITS.find((k) => k.id === 'funk-rio');
    const fx = KITS.find((k) => k.id === 'fx-dj');
    this.fillBank(p, funk, 0, true);
    this.fillBank(p, fx, 1, false);
    await store.saveProject(this.user.id, p);
    return p;
  }

  fillBank(p, kit, bank, withBeats) {
    kit.pads.forEach((s, i) => { p.pads[bank * 16 + i] = padFromSound(s); });
    p.kitNames[bank] = kit.name;
    if (withBeats && kit.beats.length) {
      kit.beats.forEach((_, bi) => { if (bi < 8) p.patterns[bi] = beatToPattern(kit, bi, bank * 16); });
      p.bpm = kit.bpm;
      p.swing = kit.swing;
    }
  }

  async setProject(p) {
    this.seq.stop();
    this.engine.stopAll();
    this.p = p;
    this.engine.setProject(p);
    this.seq.pattern = 0;
    this.seq.queued = null;
    this.seq.metronome = !!p.metronome;
    await this.loadAllBuffers();
    this.syncDjm();
    this.renderAll();
    this.resetHistory();
    store.setMeta('last:' + this.user.id, p.id);
  }

  // ================================================== desfazer / refazer
  // Fotografias do projeto (sem os samples, que só crescem). Mudanças em
  // sequência rápida, como girar um knob, viram um passo só.
  snapshot() {
    const { samples, updated, ...rest } = this.p;
    return structuredClone(rest);
  }

  resetHistory() {
    clearTimeout(this.histTimer);
    this.histTimer = null;
    this.undoStack = [];
    this.redoStack = [];
    this.histBase = this.snapshot();
    this.histKey = JSON.stringify(this.histBase);
    this.renderUndo();
  }

  commitHistory() {
    clearTimeout(this.histTimer);
    this.histTimer = null;
    const now = this.snapshot(), key = JSON.stringify(now);
    if (key === this.histKey) return;
    this.undoStack.push(this.histBase);
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
    this.histBase = now;
    this.histKey = key;
    this.renderUndo();
  }

  async undo() { await this.stepHistory(this.undoStack, this.redoStack, 'Desfeito'); }
  async redo() { await this.stepHistory(this.redoStack, this.undoStack, 'Refeito'); }

  async stepHistory(from, to, msg) {
    if (this.histTimer) this.commitHistory();
    if (!from.length) return;
    to.push(this.snapshot());
    const s = from.pop();
    const oldSrc = this.p.pads.map((pd) => (pd ? JSON.stringify(pd.src) : ''));
    this.restoring = true;
    for (const [k, v] of Object.entries(s)) if (k !== 'id' && k !== 'created') this.p[k] = structuredClone(v);
    await Promise.all(this.p.pads.map((pd, i) => ((pd ? JSON.stringify(pd.src) : '') !== oldSrc[i] ? this.loadPadBuffer(i) : null)));
    this.engine.applyMix();
    this.seq.metronome = !!this.p.metronome;
    this.syncDjm();
    this.renderAll();
    this.markDirty();
    this.restoring = false;
    this.histBase = s;
    this.histKey = JSON.stringify(s);
    this.renderUndo();
    toast(msg);
  }

  renderUndo() {
    $$('.undo-btn').forEach((b) => (b.disabled = !this.undoStack || !this.undoStack.length));
    $$('.redo-btn').forEach((b) => (b.disabled = !this.redoStack || !this.redoStack.length));
  }

  async loadAllBuffers() {
    await Promise.all(this.p.pads.map((_, i) => this.loadPadBuffer(i)));
  }

  async loadPadBuffer(i) {
    const pad = this.p.pads[i];
    if (!pad) { this.engine.setBuffer(i, null); return; }
    try {
      if (pad.src.kind === 'synth') this.engine.setBuffer(i, await renderSound(pad.src.def));
      else {
        const s = this.p.samples[pad.src.sampleId];
        if (!s) { this.engine.setBuffer(i, null); return; }
        if (!s._buf) {
          const b = new AudioBuffer({ length: s.channels[0].length, numberOfChannels: s.channels.length, sampleRate: s.sr });
          s.channels.forEach((c, k) => b.copyToChannel(c, k));
          Object.defineProperty(s, '_buf', { value: b, writable: true, enumerable: false, configurable: true });
        }
        this.engine.setBuffer(i, s._buf);
      }
    } catch (e) {
      console.error(e);
      this.engine.setBuffer(i, null);
    }
    this.engine.applyMix();
  }

  // ======================================================== estrutura fixa
  buildStatic() {
    const banks = $('#banks');
    BANKS.forEach((b, i) => {
      const el = h('button', { onclick: () => this.setBank(i), title: 'Banco ' + b + ' (segure para mais opções)' }, b);
      this.attachLongPress(el, () => this.bankMenu(i));
      banks.append(el);
    });
    const pb = $('#patBtns');
    PATTERN_NAMES.forEach((n, i) => {
      const el = h('button', { onclick: () => this.choosePattern(i), title: 'Pattern ' + n + ' (segure para mais opções)' }, n);
      this.attachLongPress(el, () => this.patternMenu(i));
      pb.append(el);
    });
    const nr = $('#nrRates');
    NR_RATES.forEach((r) => nr.append(h('button', { onclick: () => { this.seq.nrRate = r; this.renderPadModes(); } }, r.id)));

    const pads = $('#pads');
    for (const phys of PAD_ORDER) {
      // --o8: posição na grade 8x2 da tela cheia deitada (9–16 em cima, 1–8 embaixo)
      const el = h('div', { class: 'pad', 'data-phys': phys, role: 'button', tabindex: -1, style: {
        '--o8': phys >= 8 ? phys - 8 : phys + 8,
        // grade 6x3: 1–6 embaixo, 7–12 no meio e 13–16 centralizados em cima
        '--r3': 3 - Math.floor(phys / 6), '--c3': (phys % 6) + (phys >= 12 ? 2 : 1),
      } },
        h('span', { class: 'num' }), h('span', { class: 'pn' }));
      el.addEventListener('pointerdown', (e) => this.padDown(e, phys, el));
      el.addEventListener('pointerup', (e) => this.padUp('p' + e.pointerId));
      el.addEventListener('pointercancel', (e) => this.padUp('p' + e.pointerId));
      el.addEventListener('lostpointercapture', (e) => this.padUp('p' + e.pointerId));
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        // botão direito do mouse abre o menu na hora; no toque vale o toque longo
        if (this.lastPointerType === 'mouse') this.padMenu(this.levels !== 'off' ? this.levelsPad : this.bank * 16 + phys);
      });
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drop'); });
      el.addEventListener('dragleave', () => el.classList.remove('drop'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drop');
        if (e.dataTransfer.files.length) this.importAudioFiles([...e.dataTransfer.files], this.bank * 16 + phys);
      });
      pads.append(el);
    }

    $('#btnFull').onclick = () => { this.fullLevel = !this.fullLevel; this.renderPadModes(); };
    $('#btn16').onclick = () => {
      this.levels = { off: 'vel', vel: 'tune', tune: 'off' }[this.levels];
      if (this.levels !== 'off' && this.levels === 'vel') this.levelsPad = this.sel;
      this.renderPadModes();
      this.renderPads();
    };
    $('#btnNR').onclick = () => { this.nr = !this.nr; this.renderPadModes(); };
    $('#btnPadMute').onclick = () => { this.padMode = this.padMode === 'mute' ? 'play' : 'mute'; this.renderPadModes(); this.renderPads(); };
    $('#btnErase').onclick = () => { this.padMode = this.padMode === 'erase' ? 'play' : 'erase'; this.renderPadModes(); };
    $('#btnTapPads').onclick = () => this.tap();
    $('#btnEditPad').onclick = () => this.go('pad');

    $('#btnPlay').onclick = () => (this.seq.playing ? this.stop() : this.play());
    $('#btnPlayStart').onclick = () => this.playStart();
    $('#btnOverdub').onclick = () => this.toggleRec();
    $('#btnStop').onclick = () => this.stop();
    $('#btnRec').onclick = () => this.recReplace();
    $('#btnTap').onclick = () => this.tap();
    $('#btnSong').onclick = () => { this.p.songMode = !this.p.songMode; this.renderTransport(); this.markDirty(); if (this.view === 'song') this.renderView(); };
    $('#btnUndo').onclick = () => this.undo();
    $('#btnRedo').onclick = () => this.redo();
    $('#btnMetro').onclick = () => { this.seq.metronome = this.p.metronome = !this.seq.metronome; this.renderTransport(); this.markDirty(); };
    $('#btnProj').onclick = () => this.renameProject();
    $('#btnUser').onclick = (e) => this.userMenu(e.currentTarget);
    $('#btnDrawer').onclick = () => $('#app').classList.toggle('show-browser');
    $('#btnInstall').onclick = () => this.hooks.install && this.hooks.install();
    this.bindBpmDrag();

    $$('#tabs button').forEach((b) => (b.onclick = () => this.go(b.dataset.view)));
    $$('#mnav button').forEach((b) => (b.onclick = () => {
      if (this.full) this.toggleFull(this.full);
      $('#app').dataset.m = b.dataset.m;
      if (b.dataset.v) this.go(b.dataset.v, true);
      this.renderMnav();
    }));
    $$('#libTabs button').forEach((b) => (b.onclick = () => { this.lib = b.dataset.lib; this.renderLibrary(); }));
    $('#libSearch').oninput = (e) => { this.libQuery = e.target.value.trim().toLowerCase(); this.renderLibrary(); };
    $('#fileAudio').onchange = (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) this.importAudioFiles(f, this.sel); };
    $('#fileProject').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) this.importProjectFile(f); };
    this.buildDjm();

    // botão de tela cheia em cada parte do app
    const fullBtn = (target, cls = 'fullbtn') => {
      const b = h('button', { class: cls, title: 'Tela cheia', 'aria-label': 'Tela cheia', 'data-full-btn': target, html: ICON_EXPAND });
      b.onclick = () => this.toggleFull(target);
      return b;
    };
    $('.screen').append(fullBtn('screen'));
    $('#browser').append(fullBtn('browser'));
    $('#djm').append(fullBtn('djm'));
    $('#btnEditPad').before(fullBtn('pads', 'fullbtn inline'));
    addEventListener('resize', () => { this.layoutFull(); this.placeQLink(); });
    this.placeQLink();
  }

  renderAll() {
    this.renderBanks();
    this.renderPads();
    this.renderPadModes();
    this.renderPatternBtns();
    this.renderTransport();
    this.renderLibrary();
    this.renderView();
    this.renderProjName();
    this.renderMnav();
    this.updateLcd();
    const n = (this.user.name || this.user.email || 'W').trim()[0].toUpperCase();
    $('#btnUser').textContent = n;
  }

  // Tela cheia de um item: ele passa a cobrir tudo entre a barra de cima e o
  // rodapé (e o trilho de navegação, quando houver).
  toggleFull(target) {
    const app = $('#app');
    this.full = this.full === target ? null : target;
    $$('.is-full').forEach((el) => el.classList.remove('is-full'));
    if (this.full) {
      const el = { screen: '.screen', browser: '#browser', djm: '#djm', pads: '.padzone' }[this.full];
      $(el).classList.add('is-full');
      app.dataset.full = this.full;
    } else { delete app.dataset.full; delete app.dataset.pl; }
    $$('[data-full-btn]').forEach((b) => {
      const on = b.dataset.fullBtn === this.full;
      b.innerHTML = on ? ICON_SHRINK : ICON_EXPAND;
      b.title = on ? 'Sair da tela cheia' : 'Tela cheia';
      b.classList.toggle('on', on);
    });
    this.layoutFull();
    if (this.view === 'seq' || this.view === 'mixer') this.renderView();
  }

  layoutFull() {
    if (!this.full) return;
    const app = $('#app');
    const top = $('.topbar').getBoundingClientRect().bottom;
    const credit = $('.credit').getBoundingClientRect();
    const nav = $('#mnav').getBoundingClientRect();
    const left = nav.width && nav.height > nav.width ? nav.right : 0;
    app.style.setProperty('--ft', top + 'px');
    app.style.setProperty('--fb', Math.max(0, innerHeight - credit.top) + 'px');
    app.style.setProperty('--fl', left + 'px');
    this.layoutPadsFull(top, Math.max(0, innerHeight - credit.top), left);
  }

  // Pads em tela cheia deitada: testa 4x4, 6x3 e 8x2, com os controles do lado
  // ou embaixo, e fica com a arrumação que dá o maior pad quadrado (o 6x3, de
  // três linhas, ganha os empates).
  layoutPadsFull(top, bottom, left) {
    const app = $('#app');
    if (this.full !== 'pads' || !matchMedia('(orientation: landscape) and (max-height: 560px)').matches) {
      delete app.dataset.pl; return;
    }
    const gap = 6, pad = 8, side = 176 + 8, strip = 2 * 28 + 4 + 8;
    const w = innerWidth - left - pad * 2 - 6, hgt = innerHeight - top - bottom - pad * 2;
    const fit = (c, r, W, H) => Math.floor(Math.min((W - (c - 1) * gap) / c, (H - (r - 1) * gap) / r));
    const s6 = fit(6, 3, w - side, hgt);
    const best = [['s4', fit(4, 4, w - side, hgt)], ['s8', fit(8, 2, w - side, hgt)], ['b8', fit(8, 2, w, hgt - strip)]]
      .reduce((a, b) => (b[1] > a[1] ? b : a));
    const [pl, ps] = s6 + 3 >= best[1] ? ['s6', s6] : best;
    app.dataset.pl = pl;
    app.style.setProperty('--ps', ps + 'px');
  }

  renderMnav() {
    let m = $('#app').dataset.m;
    // deitado, os pads ficam sempre visíveis e o painel do meio mostra a sequência
    if (m === 'pads' && matchMedia('(orientation: landscape) and (max-height: 560px)').matches) m = 'screen';
    $$('#mnav button').forEach((b) => b.classList.toggle('on', b.dataset.m === m && (!b.dataset.v || b.dataset.v === this.view)));
  }

  go(view, fromNav) {
    this.view = view;
    $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
    if (!fromNav && matchMedia(COMPACT).matches) $('#app').dataset.m = 'screen';
    this.renderMnav();
    this.renderView();
  }

  tour() {
    startTour(this, () => store.setMeta('tour:' + this.user.id, true));
  }

  // ============================================================ transporte
  // PLAY continua de onde parou; PLAY START sempre do início
  async play(fromStart = false) {
    this.usage.count('plays');
    if (this.ctx.state !== 'running') await this.ctx.resume();
    this.stopPreview();
    this.seq.start(fromStart ? 0 : this.seq.pausedStep || 0);
  }
  async playStart() {
    if (this.seq.playing) this.seq.stop();
    this.seq.pausedStep = 0;
    await this.play(true);
  }
  // STOP: a primeira vez para e guarda a posição; a segunda volta ao início e corta os sons
  stop() {
    if (!this.seq.playing) { this.engine.stopAll(); this.seq.pausedStep = 0; }
    this.seq.stop();
    this.updateLcd();
  }
  // OVERDUB: grava somando ao que já existe
  toggleRec() {
    const on = !(this.seq.recording && !this.seq.replacePass);
    this.seq.recording = on;
    this.seq.replacePass = false;
    if (on && !this.seq.playing) this.play();
    this.renderTransport();
  }
  // REC: na primeira volta substitui o que havia; depois vira overdub (como na MPC)
  recReplace() {
    if (this.seq.recording && this.seq.replacePass) { this.seq.recording = false; this.seq.replacePass = false; this.renderTransport(); return; }
    this.seq.recording = true;
    this.seq.replacePass = true;
    if (!this.seq.playing) this.play();
    this.renderTransport();
    toast('REC: a primeira volta substitui o pattern; depois continua em overdub. Desfazer volta tudo.');
  }

  renderTransport() {
    if (!this.p) return;
    $('#btnPlay').classList.toggle('on', this.seq.playing);
    const rec = this.seq.recording && this.seq.replacePass, dub = this.seq.recording && !this.seq.replacePass;
    for (const [id, on] of [['#btnRec', rec], ['#btnOverdub', dub]]) {
      const r = $(id);
      r.classList.toggle('on', on);
      r.classList.toggle('blink', on && this.seq.playing);
    }
    $('#btnSong').classList.toggle('on', !!this.p.songMode);
    $('#btnMetro').classList.toggle('on', this.seq.metronome);
    this.renderPatternBtns();
  }

  renderPatternBtns() {
    if (!this.p) return;
    $$('#patBtns button').forEach((b, i) => {
      b.classList.toggle('on', i === this.seq.pattern);
      b.classList.toggle('queued', i === this.seq.queued);
      b.classList.toggle('has', Object.keys(this.p.patterns[i].steps).length > 0);
    });
    this.updateLcd();
  }

  choosePattern(i) {
    this.seq.queuePattern(i);
    this.seqPage = 0;
    if (!this.seq.playing && this.view === 'seq') this.renderView();
    this.renderPatternBtns();
  }

  setBpm(v) {
    this.p.bpm = Math.max(40, Math.min(250, Math.round(v * 10) / 10));
    this.engine.beat.setBpm(this.p.bpm);
    this.updateLcd();
    this.markDirty();
  }

  bindBpmDrag() {
    const el = $('#lcdBpm');
    let y0 = 0, b0 = 0, last = 0;
    el.addEventListener('pointerdown', async (e) => {
      const now = performance.now();
      if (now - last < 320) {
        const v = await promptDialog('Andamento (BPM)', String(this.p.bpm), 'Entre 40 e 250.');
        if (v && !isNaN(parseFloat(v.replace(',', '.')))) this.setBpm(parseFloat(v.replace(',', '.')));
        return;
      }
      last = now;
      el.setPointerCapture(e.pointerId);
      y0 = e.clientY;
      b0 = this.p.bpm;
    });
    el.addEventListener('pointermove', (e) => {
      if (!el.hasPointerCapture(e.pointerId)) return;
      this.setBpm(b0 + (y0 - e.clientY) * (e.shiftKey ? 0.02 : 0.25));
    });
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.setBpm(this.p.bpm - Math.sign(e.deltaY) * (e.shiftKey ? 0.1 : 1)); }, { passive: false });
  }

  tap() {
    const now = performance.now();
    if (this.taps.length && now - this.taps[this.taps.length - 1] > 2000) this.taps = [];
    this.taps.push(now);
    if (this.taps.length > 5) this.taps.shift();
    if (this.taps.length >= 2) {
      const d = (this.taps[this.taps.length - 1] - this.taps[0]) / (this.taps.length - 1);
      this.setBpm(60000 / d);
    }
  }

  updateLcd(step = this.seq.playing ? this.lastStep : (this.seq.pausedStep || -1)) {
    if (!this.p) return;
    $('#bpmVal').textContent = this.p.bpm.toFixed(1);
    $('#swingVal').textContent = Math.round(this.p.swing) + '%';
    const pat = this.pat;
    $('#patVal').textContent = PATTERN_NAMES[this.seq.pattern] + ' · ' + pat.name + (this.p.songMode ? ' (SONG)' : '');
    if (step >= 0) {
      $('#posVal').textContent = `${Math.floor(step / 16) + 1}.${Math.floor((step % 16) / 4) + 1}.${(step % 4) + 1}`;
      const beat = Math.floor((step % 16) / 4);
      $$('#beats4 i').forEach((b, i) => { b.classList.toggle('on', i === beat); b.classList.toggle('first', i === 0); });
    } else {
      $('#posVal').textContent = '1.1.1';
      $$('#beats4 i').forEach((b) => b.classList.remove('on'));
    }
    document.documentElement.style.setProperty('--beat', (60 / this.p.bpm) + 's');
  }

  onStep(s, pi) {
    if (!this.p) return;
    this.lastStep = s;
    this.updateLcd(s);
    if (this.view !== 'seq' || !this.seqCols) return;
    if (s < 0) { this.setPlayhead(-1); return; }
    if (pi !== this.seq.pattern) return;
    const page = Math.floor(s / 16);
    if (page !== this.seqPage && this.seq.playing) { this.seqPage = page; this.renderView(); return; }
    this.setPlayhead(s % 16);
  }

  setPlayhead(col) {
    if (this.phCol != null && this.seqCols[this.phCol]) this.seqCols[this.phCol].forEach((c) => c.classList.remove('ph'));
    this.phCol = col;
    if (col >= 0 && this.seqCols[col]) this.seqCols[col].forEach((c) => c.classList.add('ph'));
  }

  // ================================================================= pads
  setBank(b) {
    this.bank = b;
    if (this.levels === 'off') this.sel = b * 16 + (this.sel % 16);
    this.renderBanks();
    this.renderPads();
    this.renderPadInfo();
    if (['seq', 'mixer', 'pad'].includes(this.view)) this.renderView();
  }

  renderBanks() {
    $$('#banks button').forEach((b, i) => {
      b.classList.toggle('on', i === this.bank);
      b.title = 'Banco ' + BANKS[i] + (this.p.kitNames[i] ? ' — ' + this.p.kitNames[i] : '');
    });
  }

  renderPads() {
    $$('#pads .pad').forEach((el) => {
      const phys = Number(el.dataset.phys);
      let i = this.bank * 16 + phys, label = padLabel(i), name;
      if (this.levels !== 'off') {
        i = this.levelsPad;
        label = this.levels === 'vel' ? 'VEL ' + this.levelVel(phys) : 'TUNE ' + (phys - 8 > 0 ? '+' : '') + (phys - 8);
      }
      const pad = this.p.pads[i];
      name = pad ? pad.name : '— vazio —';
      el.querySelector('.num').replaceChildren(label, h('i', {}, '  ·  ' + KEYLABEL[phys]));
      el.querySelector('.pn').textContent = name;
      el.style.setProperty('--c', pad ? pad.color : '#444');
      el.classList.toggle('empty', !pad);
      el.classList.toggle('muted', !!(pad && pad.params.mute));
      el.classList.toggle('sel', this.levels === 'off' && i === this.sel);
    });
    this.renderPadInfo();
  }

  renderPadInfo() {
    const pad = this.p.pads[this.sel];
    $('#padInfo').innerHTML = '';
    $('#padInfo').append(h('b', {}, padLabel(this.sel) + ' · ' + (pad ? pad.name : 'vazio')));
    if (this.p.kitNames[this.bank]) $('#padInfo').append(h('span', {}, '  ' + this.p.kitNames[this.bank]));
    this.renderQLink();
  }

  // Em telas grandes os Q-LINK ficam na faixa do mixer (como os knobs ao lado da
  // tela da MPC); no celular ficam junto dos pads.
  placeQLink() {
    const q = $('#qlink'), compact = matchMedia(COMPACT).matches;
    if (compact && q.parentElement.id !== 'nrRates' && q.previousElementSibling !== $('#nrRates')) {
      $('#nrRates').after(q);
      q.classList.remove('djm-sec');
    } else if (!compact && q.parentElement !== $('#djm')) {
      $('#djm').insertBefore(q, $('#djm').children[1] || null);
      q.classList.add('djm-sec');
    }
  }

  // Q-LINK: 4 knobs rápidos para o pad selecionado, como os da MPC
  renderQLink() {
    const box = $('#qlink');
    if (!box) return;
    box.innerHTML = '';
    const i = this.sel, pad = this.p.pads[i];
    box.append(h('div', { class: 'ql-title' }, 'Q-LINK · ' + padLabel(i)));
    if (!pad) return;
    const P = pad.params;
    const toCut = (x) => 40 * Math.pow(18000 / 40, x), fromCut = (f) => Math.log(f / 40) / Math.log(18000 / 40);
    const defs = [
      { label: 'Tune', min: -24, max: 24, step: 1, value: P.tune, def: 0, bipolar: true, format: (x) => (x > 0 ? '+' : '') + x, set: (x) => (P.tune = x) },
      { label: 'Filtro', min: 0, max: 1, value: P.ftype === 'off' ? 1 : fromCut(P.cutoff), def: 1, format: (x) => (x >= 0.999 ? 'aberto' : (toCut(x) >= 1000 ? (toCut(x) / 1000).toFixed(1) + 'k' : Math.round(toCut(x)) + '')),
        set: (x) => { if (x >= 0.999) { P.ftype = 'off'; P.cutoff = 18000; } else { if (P.ftype === 'off') P.ftype = 'lowpass'; P.cutoff = toCut(x); } } },
      { label: 'Decay', min: 0.02, max: 1, value: P.decay, def: 1, format: (x) => Math.round(x * 100) + '%', set: (x) => (P.decay = x) },
      { label: 'Volume', min: 0, max: 1.2, value: P.vol, def: 0.8, format: (x) => Math.round(x * 100) + '%', set: (x) => { P.vol = x; this.engine.applyMix(); } },
    ];
    const row = h('div', { class: 'ql-knobs' });
    for (const d of defs) {
      const k = knob({ ...d, color: '#ffa31a', onChange: (x) => { d.set(x); this.markDirty(); } });
      row.append(k.el);
    }
    box.append(row);
  }

  renderPadModes() {
    $('#btnFull').classList.toggle('on', this.fullLevel);
    const b16 = $('#btn16');
    b16.classList.toggle('on', this.levels !== 'off');
    b16.textContent = this.levels === 'off' ? '16 LEVELS' : this.levels === 'vel' ? '16 LV: VEL' : '16 LV: TUNE';
    $('#btnNR').classList.toggle('on', this.nr);
    $('#btnPadMute').classList.toggle('on', this.padMode === 'mute');
    $('#btnErase').classList.toggle('on', this.padMode === 'erase');
    $('#pads').dataset.mode = this.padMode || 'play';
    $$('#nrRates button').forEach((b) => b.classList.toggle('on', b.textContent === this.seq.nrRate.id));
  }

  levelVel(phys) { return Math.round(8 + (phys * 119) / 15); }

  padVelocity(e, el) {
    if (this.fullLevel) return 127;
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      if (e.pressure > 0 && e.pressure < 1 && e.pressure !== 0.5) return Math.round(40 + e.pressure * 87);
    }
    const r = el.getBoundingClientRect();
    const fy = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    return Math.round(127 - fy * 70);
  }

  padDown(e, phys, el) {
    e.preventDefault();
    if (this.ctx.state !== 'running') this.ctx.resume();
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* sem captura */ }
    this.lastPointerType = e.pointerType;
    this.hit(phys, this.padVelocity(e, el), 'p' + e.pointerId);
    // segurar o pad abre o menu (fora do note repeat e da gravação, onde segurar é tocar)
    if (e.button === 0 && !this.nr && !this.seq.recording) {
      const key = 'p' + e.pointerId;
      this.armLongPress(el, e, () => {
        this.padUp(key);
        this.padMenu(this.levels !== 'off' ? this.levelsPad : this.bank * 16 + phys);
      });
    }
  }

  // ---------------------------------------------------------- toque longo
  armLongPress(el, e, fn) {
    this.cancelLongPress();
    const x0 = e.clientX, y0 = e.clientY;
    const move = (ev) => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 14) this.cancelLongPress(); };
    const end = () => this.cancelLongPress();
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.classList.add('lp');
    const t = setTimeout(() => {
      this.cancelLongPress();
      this.lpFired = performance.now();
      try { navigator.vibrate && navigator.vibrate(30); } catch (err) { /* sem vibração */ }
      fn();
    }, LONG_PRESS_MS);
    this.lp = { el, t, move, end };
  }

  cancelLongPress() {
    const lp = this.lp;
    if (!lp) return;
    clearTimeout(lp.t);
    lp.el.classList.remove('lp');
    lp.el.removeEventListener('pointermove', lp.move);
    lp.el.removeEventListener('pointerup', lp.end);
    lp.el.removeEventListener('pointercancel', lp.end);
    this.lp = null;
  }

  // botões com toque longo: o clique que vem ao soltar o dedo é ignorado
  attachLongPress(el, fn) {
    el.addEventListener('pointerdown', (e) => {
      this.lastPointerType = e.pointerType;
      if (e.button === 0) this.armLongPress(el, e, fn);
    });
    el.addEventListener('click', (e) => {
      if (this.lpFired && performance.now() - this.lpFired < 1500) { e.stopImmediatePropagation(); e.preventDefault(); this.lpFired = 0; }
    }, true);
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); if (this.lastPointerType === 'mouse') fn(); });
  }

  padUp(key) {
    if (!this.held.has(key)) return;
    this.held.delete(key);
    this.seq.release(key);
  }

  hit(phys, vel, key) {
    this.usage.count('hits');
    let pad = this.bank * 16 + phys, tune = 0;
    if (this.levels !== 'off') {
      pad = this.levelsPad;
      if (this.levels === 'vel') vel = this.levelVel(phys);
      else tune = phys - 8;
    }
    // PAD MUTE e ERASE: o toque no pad vira um comando, sem som
    if (this.padMode === 'mute' && this.p.pads[pad]) {
      const P = this.p.pads[pad].params;
      P.mute = !P.mute;
      this.engine.applyMix();
      this.markDirty();
      this.renderPads();
      if (this.view === 'seq' || this.view === 'mixer') this.renderView();
      return;
    }
    if (this.padMode === 'erase') {
      const pat = this.pat;
      if (pat.steps[pad]) {
        delete pat.steps[pad];
        delete pat.rat[pad];
        this.markDirty();
        this.renderPatternBtns();
        if (this.view === 'seq') this.renderView();
        toast(`Notas de ${padLabel(pad)} apagadas do pattern ${PATTERN_NAMES[this.seq.pattern]}`);
      }
      return;
    }
    // o som sai antes de qualquer atualização de tela
    if (this.p.pads[pad]) {
      this.held.set(key, pad);
      if (this.nr) this.seq.hold(key, pad, vel, { tune });
      else {
        this.engine.trigger(pad, vel, this.ctx.currentTime, { tune });
        this.seq.record(pad, vel);
      }
    }
    if (this.levels === 'off' && pad !== this.sel) {
      this.sel = pad;
      requestAnimationFrame(() => {
        this.renderPads();
        if (this.view === 'pad') this.renderView();
        if (this.view === 'seq') this.highlightSeqRow();
      });
    }
  }

  flash(i, vel, time) {
    const phys = this.levels !== 'off' ? null : i - this.bank * 16;
    if (this.levels === 'off' && (phys < 0 || phys > 15)) return;
    const delay = Math.max(0, (time - this.ctx.currentTime) * 1000);
    setTimeout(() => {
      const els = this.levels !== 'off'
        ? (i === this.levelsPad ? $$('#pads .pad') : [])
        : [$(`#pads .pad[data-phys="${phys}"]`)];
      for (const el of els) {
        if (!el) continue;
        el.style.setProperty('--lv', Math.max(0.35, vel / 127));
        el.classList.add('hit');
        clearTimeout(el._t);
        el._t = setTimeout(() => { el.classList.remove('hit'); el.style.setProperty('--lv', 0); }, 90);
      }
    }, delay);
  }

  bindKeys() {
    const typing = () => {
      const a = document.activeElement;
      return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
    };
    document.addEventListener('keydown', (e) => {
      if (!$('#modal').hidden || typing()) return;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); this.saveNow(true); return; }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); this.redo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code in KEYMAP) {
        e.preventDefault();
        if (e.repeat) return;
        if (this.ctx.state !== 'running') this.ctx.resume();
        this.hit(KEYMAP[e.code], this.fullLevel ? 127 : 110, 'k' + e.code);
        return;
      }
      if (e.repeat) return;
      if (e.code === 'Space') { e.preventDefault(); this.seq.playing ? this.stop() : this.play(); }
      else if (e.code === 'Escape') { if (this.full) this.toggleFull(this.full); else this.stop(); }
      else if (e.code === 'Enter') { e.preventDefault(); if (e.shiftKey) this.recReplace(); else this.toggleRec(); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); this.choosePattern((this.seq.pattern + 1) % 8); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); this.choosePattern((this.seq.pattern + 7) % 8); }
      else if (e.code === 'ArrowUp') { e.preventDefault(); this.setBank((this.bank + 1) % 4); }
      else if (e.code === 'ArrowDown') { e.preventDefault(); this.setBank((this.bank + 3) % 4); }
    });
    document.addEventListener('keyup', (e) => { if (e.code in KEYMAP) this.padUp('k' + e.code); });
    window.addEventListener('blur', () => { for (const k of [...this.held.keys()]) this.padUp(k); });
  }

  midiNote(note, vel, on) {
    const key = 'm' + note;
    if (!on) { this.padUp(key); return; }
    if (this.ctx.state !== 'running') this.ctx.resume();
    if (note in this.p.midiMap) {
      const pad = this.p.midiMap[note];
      const b = Math.floor(pad / 16);
      if (b !== this.bank) this.setBank(b);
      this.hit(pad % 16, this.fullLevel ? 127 : vel, key);
    } else if (note >= 36 && note < 52) this.hit(note - 36, this.fullLevel ? 127 : vel, key);
  }

  // ============================================================= telas
  renderView() {
    const v = $('#view');
    this.seqCols = null;
    this.meterEls = null;
    v.innerHTML = '';
    v.scrollTop = 0;
    const fn = {
      seq: this.viewSeq, pad: this.viewPad, mixer: this.viewMixer, song: this.viewSong,
      folder: this.viewFolder, settings: this.viewSettings,
      admin: (el) => (this.admin || (this.admin = new AdminPanel(this))).render(el),
    }[this.view];
    fn.call(this, v);
  }

  // ------------------------------------------------------------ SEQUÊNCIA
  viewSeq(v) {
    const pat = this.pat, pi = this.seq.pattern;
    const pages = Math.ceil(pat.length / 16);
    if (this.seqPage >= pages) this.seqPage = 0;

    const nameIn = h('input', { class: 'input', value: pat.name, style: { width: '150px' }, maxlength: 30, 'aria-label': 'Nome do pattern' });
    nameIn.onchange = () => { pat.name = nameIn.value.trim() || 'Pattern ' + PATTERN_NAMES[pi]; this.markDirty(); this.updateLcd(); };
    const lenSel = h('select', { class: 'input', 'aria-label': 'Tamanho' }, ...[16, 32, 48, 64].map((n) => h('option', { value: n, selected: n === pat.length }, n + ' passos')));
    lenSel.onchange = () => { pat.length = Number(lenSel.value); this.markDirty(); this.renderView(); };
    const swing = h('input', { type: 'range', min: 50, max: 75, step: 1, value: this.p.swing, style: { width: '90px' }, 'aria-label': 'Swing' });
    const swingLbl = h('span', {}, Math.round(this.p.swing) + '%');
    swing.oninput = () => { this.p.swing = Number(swing.value); swingLbl.textContent = swing.value + '%'; this.updateLcd(); this.markDirty(); };

    const tools = [['draw', 'Desenhar'], ['accent', 'Acento'], ['soft', 'Suave'], ['ratchet', 'Ratchet'], ['erase', 'Apagar']];
    v.append(h('div', { class: 'toolbar' },
      h('span', { class: 'pill on' }, 'PATTERN ' + PATTERN_NAMES[pi]), nameIn, lenSel,
      h('label', { class: 'inline' }, 'Swing', swing, swingLbl),
      h('button', { class: 'pill', title: 'Tap tempo', onclick: () => this.tap() }, 'TAP'),
      h('span', { class: 'sep' }),
      ...tools.map(([id, label]) => h('button', { class: 'pill' + (this.tool === id ? ' on' : ''), onclick: () => { this.tool = id; this.renderView(); } }, label)),
      h('span', { class: 'sep' }),
      h('button', { class: 'btn small', onclick: () => this.copyPattern() }, 'Copiar para…'),
      h('button', { class: 'btn small', onclick: () => this.doublePattern() }, 'Dobrar'),
      h('button', { class: 'btn small danger', onclick: () => this.clearPattern() }, 'Limpar'),
      h('span', { class: 'sep' }),
      h('button', { class: 'btn small undo-btn', title: 'Desfazer (Ctrl+Z)', disabled: !this.undoStack || !this.undoStack.length, onclick: () => this.undo() }, '↶ Desfazer'),
      h('button', { class: 'btn small redo-btn', title: 'Refazer (Ctrl+Shift+Z)', disabled: !this.redoStack || !this.redoStack.length, onclick: () => this.redo() }, '↷ Refazer'),
    ));
    if (pages > 1) {
      v.append(h('div', { class: 'toolbar' }, h('span', { style: { color: 'var(--muted)', fontSize: '12px' } }, 'Página:'),
        ...[...Array(pages)].map((_, k) => h('button', { class: 'pill' + (k === this.seqPage ? ' on' : ''), onclick: () => { this.seqPage = k; this.renderView(); } }, `${k * 16 + 1}–${k * 16 + 16}`))));
    }

    const grid = h('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(64px, 170px) repeat(16, minmax(14px, 1fr))' } });
    grid.append(h('div', { class: 'colh' }));
    const off = this.seqPage * 16;
    for (let c = 0; c < 16; c++) grid.append(h('div', { class: 'colh' + (c % 4 === 0 ? ' beat' : '') }, off + c + 1 <= pat.length ? String(off + c + 1) : ''));
    this.seqCols = [...Array(16)].map(() => []);
    this.seqCells = {};
    for (let r = 0; r < 16; r++) {
      const pi2 = this.bank * 16 + r, pad = this.p.pads[pi2];
      const P = pad ? pad.params : defaultParams();
      const nm = h('div', { class: 'nm' + (pi2 === this.sel ? ' sel' : ''), style: { '--c': pad ? pad.color : '#333' }, title: 'Ouvir / selecionar' }, padLabel(pi2) + ' ' + (pad ? pad.name : '—'));
      nm.onclick = () => { this.sel = pi2; if (pad) this.engine.trigger(pi2, 110); this.renderPads(); this.highlightSeqRow(); };
      this.attachLongPress(nm, () => this.padMenu(pi2));
      const m = h('button', { class: 'ms m' + (P.mute ? ' on' : ''), title: 'Mute' }, 'M');
      const s = h('button', { class: 'ms s' + (P.solo ? ' on' : ''), title: 'Solo' }, 'S');
      if (pad) {
        m.onclick = () => { P.mute = !P.mute; m.classList.toggle('on', P.mute); this.engine.applyMix(); this.markDirty(); };
        s.onclick = () => { P.solo = !P.solo; s.classList.toggle('on', P.solo); this.engine.applyMix(); this.markDirty(); };
      }
      grid.append(h('div', { class: 'rowh', 'data-row': pi2 }, nm, m, s));
      for (let c = 0; c < 16; c++) {
        const step = off + c;
        const cell = h('div', { class: 'stp' + (Math.floor(c / 4) % 2 ? ' q' : ''), 'data-pad': pi2, 'data-step': step });
        if (step >= pat.length) cell.style.visibility = 'hidden';
        cell.style.setProperty('--c', pad ? pad.color : '#666');
        this.paintCell(cell, pat, pi2, step);
        this.seqCols[c].push(cell);
        this.seqCells[pi2 + ':' + step] = cell;
        grid.append(cell);
      }
    }
    this.bindGridPaint(grid);
    v.append(grid);
    v.append(h('p', { style: { color: 'var(--dim)', fontSize: '11.5px', marginTop: '12px' } },
      'Dica: toque nos passos para ligar/desligar e arraste para pintar vários. Com REC ligado, o que você toca nos pads é gravado no pattern em tempo real (quantizado em 1/16). Ratchet repete a nota 2, 3 ou 4 vezes dentro do passo — ideal para os rolls de chimbal do trap.'));
    if (this.seq.playing && this.lastStep != null) this.setPlayhead(this.lastStep - off >= 0 && this.lastStep - off < 16 ? this.lastStep - off : -1);
  }

  highlightSeqRow() {
    $$('#view .rowh .nm').forEach((n) => n.classList.toggle('sel', Number(n.parentElement.dataset.row) === this.sel));
  }

  paintCell(cell, pat, pad, step) {
    const v = pat.steps[pad] ? pat.steps[pad][step] : 0;
    const r = pat.rat[pad] ? pat.rat[pad][step] : 0;
    cell.classList.toggle('on', v > 0);
    cell.style.setProperty('--v', v ? (0.35 + (v / 127) * 0.65).toFixed(2) : 0);
    cell.innerHTML = r > 1 ? '<span class="rat">' + '<i></i>'.repeat(r) + '</span>' : '';
  }

  updateCell(pad, step) {
    const cell = this.seqCells && this.seqCells[pad + ':' + step];
    if (cell) this.paintCell(cell, this.pat, pad, step);
  }

  bindGridPaint(grid) {
    let mode = null, visited = null;
    const apply = (cell) => {
      if (!cell || !cell.classList.contains('stp') || visited.has(cell)) return;
      visited.add(cell);
      const pad = Number(cell.dataset.pad), step = Number(cell.dataset.step), pat = this.pat;
      if (step >= pat.length || !this.p.pads[pad]) return;
      const row = pat.steps[pad] || (pat.steps[pad] = new Array(64).fill(0));
      const cur = row[step];
      if (mode === null) {
        if (this.tool === 'erase') mode = { v: 0 };
        else if (this.tool === 'ratchet') mode = { v: cur || 100, r: ((pat.rat[pad] && pat.rat[pad][step]) || 1) % 4 + 1 };
        else {
          const target = { draw: 100, accent: 127, soft: 60 }[this.tool];
          mode = { v: cur === target || (this.tool === 'draw' && cur) ? 0 : target };
        }
      }
      row[step] = mode.v;
      if (mode.r != null) {
        const rr = pat.rat[pad] || (pat.rat[pad] = new Array(64).fill(0));
        rr[step] = mode.r === 1 ? 0 : mode.r;
      }
      if (!mode.v && pat.rat[pad]) pat.rat[pad][step] = 0;
      if (!row.some((x) => x)) delete pat.steps[pad];
      this.paintCell(cell, pat, pad, step);
      if (mode.v && !this.seq.playing) this.engine.trigger(pad, mode.v);
      this.markDirty();
      this.renderPatternBtns();
    };
    grid.addEventListener('pointerdown', (e) => {
      const cell = e.target.closest('.stp');
      if (!cell) return;
      e.preventDefault();
      if (this.ctx.state !== 'running') this.ctx.resume();
      mode = null;
      visited = new Set();
      grid.setPointerCapture(e.pointerId);
      apply(cell);
    });
    grid.addEventListener('pointermove', (e) => {
      if (!visited || !grid.hasPointerCapture(e.pointerId)) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      apply(el && el.closest('.stp'));
    });
    const end = () => { visited = null; };
    grid.addEventListener('pointerup', end);
    grid.addEventListener('pointercancel', end);
  }

  async copyPattern(idx = this.seq.pattern) {
    const src = this.p.patterns[idx];
    const to = await choiceDialog('Copiar pattern', `Copiar "${src.name}" para qual pattern?`,
      PATTERN_NAMES.map((n, i) => ({ label: `${n} — ${this.p.patterns[i].name}${Object.keys(this.p.patterns[i].steps).length ? ' (será substituído)' : ''}`, value: String(i) }))
        .filter((c) => Number(c.value) !== idx));
    if (to == null) return;
    const copy = structuredClone(src);
    copy.name = src.name + ' (cópia)';
    this.p.patterns[Number(to)] = copy;
    this.markDirty();
    this.renderPatternBtns();
    toast('Pattern copiado para ' + PATTERN_NAMES[to], 'ok');
  }

  doublePattern(idx = this.seq.pattern) {
    const pat = this.p.patterns[idx];
    if (pat.length * 2 > 64) { toast('O pattern já está no tamanho máximo (64 passos).'); return; }
    for (const map of [pat.steps, pat.rat]) {
      for (const row of Object.values(map)) for (let i = 0; i < pat.length; i++) row[i + pat.length] = row[i];
    }
    pat.length *= 2;
    this.markDirty();
    this.renderView();
  }

  async clearPattern(idx = this.seq.pattern) {
    const pat = this.p.patterns[idx];
    if (!(await confirmDialog('Limpar pattern', `Apagar todas as notas de "${pat.name}"?`, 'Limpar', true))) return;
    pat.steps = {};
    pat.rat = {};
    this.markDirty();
    this.renderView();
    this.renderPatternBtns();
  }

  // ============================================== menus do toque longo
  sheet(build) {
    return modal((d, close) => {
      d.classList.add('sheet');
      build(d, close, (fn) => async () => { close(); await fn(); });
    }, { autofocus: false });
  }

  sheetHead(d, close, tag, title, sub) {
    d.append(h('div', { class: 'sheet-head' }, h('span', { class: 'pill on' }, tag),
      h('div', { class: 'sheet-title' }, h('b', {}, title), sub ? h('span', {}, sub) : null),
      h('button', { class: 'sheet-x', 'aria-label': 'Fechar', onclick: () => close() }, '✕')));
  }

  openSoundLibrary() {
    this.lib = 'sounds';
    this.renderLibrary();
    if (matchMedia(COMPACT).matches) { $('#app').dataset.m = 'browser'; this.renderMnav(); }
    else $('#app').classList.add('show-browser');
    toast(`Toque em "→ ${padLabel(this.sel)}" no som que quiser`);
  }

  async duplicatePad(i) {
    const b = Math.floor(i / 16) * 16;
    for (let k = 1; k < 16; k++) {
      const j = b + ((i % 16) + k) % 16;
      if (!this.p.pads[j]) {
        this.p.pads[j] = structuredClone(this.p.pads[i]);
        this.p.pads[j].name += ' 2';
        await this.loadPadBuffer(j);
        this.markDirty();
        this.renderPads();
        toast(`Pad duplicado em ${padLabel(j)}`, 'ok');
        return;
      }
    }
    toast('Não há pad vazio neste banco para duplicar.', 'err');
  }

  padMenu(i) {
    if (this.ctx.state !== 'running') this.ctx.resume();
    this.sel = i;
    this.renderPads();
    const pad = this.p.pads[i];
    this.sheet((d, close, run) => {
      const A = (label, fn, cls = '') => h('button', { class: 'btn ' + cls, onclick: run(fn) }, label);
      this.sheetHead(d, close, padLabel(i), pad ? pad.name : 'Pad vazio', pad ? (pad.src.kind === 'synth' ? 'Som da biblioteca WDQ' : 'Sample') : 'Escolha um som para este pad');
      if (!pad) {
        d.append(h('div', { class: 'sheet-grid' },
          A('Escolher som na biblioteca', () => this.openSoundLibrary(), 'primary'),
          A('Importar áudio', () => $('#fileAudio').click()),
          A('Gravar microfone', () => this.recordMic()),
          A('Resample (gravar a saída)', () => this.resample()),
          this.clipboard ? A('Colar pad copiado', () => this.pastePad()) : null));
        return;
      }
      const P = pad.params;
      // nome e cor
      const name = h('input', { class: 'input', value: pad.name, maxlength: 40, 'aria-label': 'Nome do pad' });
      name.onchange = () => { pad.name = name.value.trim() || pad.name; this.renderPads(); this.markDirty(); };
      d.append(h('label', { class: 'sheet-label' }, 'RENOMEAR'), name);
      const sw = h('div', { class: 'sheet-colors' });
      for (const c of PAD_COLORS) {
        const b = h('button', { class: 'sw' + (c === pad.color ? ' on' : ''), style: { background: c }, 'aria-label': 'Cor ' + c });
        b.onclick = () => { pad.color = c; this.renderPads(); this.markDirty(); $$('.sw', sw).forEach((x) => x.classList.toggle('on', x === b)); };
        sw.append(b);
      }
      d.append(h('label', { class: 'sheet-label' }, 'COR'), sw);

      // ajustes rápidos
      const vol = h('input', { type: 'range', min: 0, max: 1.2, step: 0.01, value: P.vol, 'aria-label': 'Volume' });
      const volLbl = h('b', {}, Math.round(P.vol * 100) + '%');
      vol.oninput = () => { P.vol = Number(vol.value); volLbl.textContent = Math.round(P.vol * 100) + '%'; this.engine.applyMix(); this.markDirty(); };
      const pan = h('input', { type: 'range', min: -1, max: 1, step: 0.01, value: P.pan, 'aria-label': 'Pan' });
      pan.oninput = () => { P.pan = Number(pan.value); this.engine.applyMix(); this.markDirty(); };
      const tuneLbl = h('b', {}, (P.tune > 0 ? '+' : '') + P.tune + ' st');
      const tb = (dt, l) => h('button', { class: 'btn small', onclick: () => {
        P.tune = Math.max(-24, Math.min(24, P.tune + dt));
        tuneLbl.textContent = (P.tune > 0 ? '+' : '') + P.tune + ' st';
        this.markDirty();
        this.engine.trigger(i, 110);
      } }, l);
      const decay = h('input', { type: 'range', min: 0.02, max: 1, step: 0.01, value: P.decay, 'aria-label': 'Decay' });
      decay.oninput = () => { P.decay = Number(decay.value); this.markDirty(); };
      decay.onchange = () => this.engine.trigger(i, 110);
      d.append(h('div', { class: 'sheet-sec' }, 'AJUSTES RÁPIDOS'),
        h('div', { class: 'sheet-row' }, h('span', {}, 'Volume'), vol, volLbl),
        h('div', { class: 'sheet-row' }, h('span', {}, 'Pan'), pan),
        h('div', { class: 'sheet-row' }, h('span', {}, 'Decay'), decay),
        h('div', { class: 'sheet-row' }, h('span', {}, 'Afinação'), tb(-12, '−12'), tb(-1, '−1'), tuneLbl, tb(1, '+1'), tb(12, '+12')));
      const tog = (label, key, after) => {
        const b = h('button', { class: 'pill' + (P[key] ? ' on' : '') }, label);
        b.onclick = () => { P[key] = !P[key]; b.classList.toggle('on', P[key]); this.markDirty(); if (after) after(); };
        return b;
      };
      const choke = h('select', { class: 'input', 'aria-label': 'Grupo de corte' }, ...[...Array(9)].map((_, n) => h('option', { value: n, selected: P.choke === n }, n ? 'Choke ' + n : 'Sem choke')));
      choke.onchange = () => { P.choke = Number(choke.value); this.markDirty(); };
      d.append(h('div', { class: 'sheet-row wrap' },
        tog('MUTE', 'mute', () => this.engine.applyMix()), tog('SOLO', 'solo', () => this.engine.applyMix()),
        tog('REVERSE', 'reverse'), tog('POLY', 'poly'), choke));

      // ações
      d.append(h('div', { class: 'sheet-sec' }, 'SOM'),
        h('div', { class: 'sheet-grid' },
          h('button', { class: 'btn primary', onclick: () => this.engine.trigger(i, 120) }, '▶ Ouvir'),
          A('Trocar som (biblioteca)', () => this.openSoundLibrary()),
          A('Importar áudio', () => $('#fileAudio').click()),
          A('Gravar microfone', () => this.recordMic()),
          A('Resample (gravar a saída)', () => this.resample()),
          A('Fatiar em 16 (Chop)', () => this.chop()),
          A('Editar pad completo', () => this.go('pad'))),
        h('div', { class: 'sheet-sec' }, 'ORGANIZAR'),
        h('div', { class: 'sheet-grid' },
          A('Copiar pad', () => { this.clipboard = structuredClone(pad); toast('Pad copiado'); }),
          this.clipboard ? A('Colar aqui', () => this.pastePad()) : null,
          A('Duplicar no próximo vazio', () => this.duplicatePad(i)),
          this.midi.access ? A('Aprender nota MIDI', () => { this.midi.learn = i; toast('Aperte uma nota no controlador…'); }) : null,
          A('Limpar pad', () => this.clearPad(), 'danger')));
    });
  }

  patternMenu(i) {
    const pat = this.p.patterns[i];
    const used = Object.keys(pat.steps).length > 0;
    this.sheet((d, close, run) => {
      const A = (label, fn, cls = '') => h('button', { class: 'btn ' + cls, onclick: run(fn) }, label);
      this.sheetHead(d, close, 'PATTERN ' + PATTERN_NAMES[i], pat.name, `${pat.length} passos${used ? '' : ' · vazio'}`);
      const name = h('input', { class: 'input', value: pat.name, maxlength: 30, 'aria-label': 'Nome do pattern' });
      name.onchange = () => { pat.name = name.value.trim() || 'Pattern ' + PATTERN_NAMES[i]; this.markDirty(); this.updateLcd(); if (this.view === 'seq') this.renderView(); };
      d.append(h('label', { class: 'sheet-label' }, 'RENOMEAR'), name);
      const lens = h('div', { class: 'sheet-row wrap' }, h('span', {}, 'Tamanho'));
      for (const n of [16, 32, 48, 64]) {
        const b = h('button', { class: 'pill' + (pat.length === n ? ' on' : '') }, n + ' passos');
        b.onclick = () => { pat.length = n; $$('.pill', lens).forEach((x) => x.classList.toggle('on', x === b)); this.markDirty(); if (this.view === 'seq') this.renderView(); };
        lens.append(b);
      }
      d.append(lens);
      const empty = PATTERN_NAMES.findIndex((_, k) => k !== i && !Object.keys(this.p.patterns[k].steps).length);
      d.append(h('div', { class: 'sheet-grid' },
        A(this.seq.playing ? 'Tocar no próximo compasso' : 'Selecionar', () => { this.choosePattern(i); this.go('seq', !matchMedia(COMPACT).matches); }, 'primary'),
        A('Copiar para…', () => this.copyPattern(i)),
        empty >= 0 ? A(`Duplicar em ${PATTERN_NAMES[empty]}`, () => {
          const c = structuredClone(pat);
          c.name = pat.name + ' (cópia)';
          this.p.patterns[empty] = c;
          this.markDirty();
          this.renderPatternBtns();
          toast(`Pattern duplicado em ${PATTERN_NAMES[empty]}`, 'ok');
        }) : null,
        A('Dobrar tamanho', () => { this.doublePattern(i); this.renderPatternBtns(); }),
        A('Adicionar à música (Song)', () => { this.p.song.push(i); this.markDirty(); toast(`${PATTERN_NAMES[i]} adicionado ao fim da música`, 'ok'); if (this.view === 'song') this.renderView(); }),
        A('Limpar notas', () => this.clearPattern(i), 'danger')));
    });
  }

  bankMenu(b) {
    const count = [...Array(16)].filter((_, k) => this.p.pads[b * 16 + k]).length;
    this.sheet((d, close, run) => {
      const A = (label, fn, cls = '') => h('button', { class: 'btn ' + cls, onclick: run(fn) }, label);
      this.sheetHead(d, close, 'BANCO ' + BANKS[b], this.p.kitNames[b] || 'Sem nome', `${count} de 16 pads com som`);
      const name = h('input', { class: 'input', value: this.p.kitNames[b] || '', maxlength: 40, placeholder: 'Nome do kit deste banco', 'aria-label': 'Nome do kit' });
      name.onchange = () => { this.p.kitNames[b] = name.value.trim(); this.markDirty(); this.renderBanks(); this.renderPadInfo(); };
      d.append(h('label', { class: 'sheet-label' }, 'RENOMEAR KIT'), name);
      d.append(h('div', { class: 'sheet-grid' },
        A('Usar este banco', () => this.setBank(b), 'primary'),
        A('Carregar kit da biblioteca', () => {
          this.setBank(b);
          this.lib = 'kits';
          this.renderLibrary();
          if (matchMedia(COMPACT).matches) { $('#app').dataset.m = 'browser'; this.renderMnav(); }
          else $('#app').classList.add('show-browser');
          toast(`Escolha um kit e toque em "Só sons → banco ${BANKS[b]}"`);
        }),
        A('Copiar banco para…', async () => {
          const to = await choiceDialog('Copiar banco', `Copiar os 16 pads do banco ${BANKS[b]} para qual banco? (os sons de lá serão substituídos)`,
            BANKS.map((n, k) => ({ label: `Banco ${n}${this.p.kitNames[k] ? ' — ' + this.p.kitNames[k] : ''}`, value: String(k) })).filter((c) => Number(c.value) !== b));
          if (to == null) return;
          const t = Number(to);
          for (let k = 0; k < 16; k++) this.p.pads[t * 16 + k] = this.p.pads[b * 16 + k] ? structuredClone(this.p.pads[b * 16 + k]) : null;
          this.p.kitNames[t] = this.p.kitNames[b];
          await Promise.all([...Array(16)].map((_, k) => this.loadPadBuffer(t * 16 + k)));
          this.markDirty();
          this.renderAll();
          toast(`Banco ${BANKS[b]} copiado para ${BANKS[t]}`, 'ok');
        }),
        A('Limpar banco', async () => {
          if (!(await confirmDialog('Limpar banco', `Remover os sons dos 16 pads do banco ${BANKS[b]}?`, 'Limpar', true))) return;
          for (let k = 0; k < 16; k++) this.p.pads[b * 16 + k] = null;
          this.p.kitNames[b] = '';
          await Promise.all([...Array(16)].map((_, k) => this.loadPadBuffer(b * 16 + k)));
          this.markDirty();
          this.renderAll();
        }, 'danger')));
    });
  }

  // ------------------------------------------------------------ EDITAR PAD
  viewPad(v) {
    const i = this.sel, pad = this.p.pads[i];
    const head = h('div', { class: 'toolbar' }, h('span', { class: 'pill on' }, padLabel(i)));
    v.append(head);
    if (!pad) {
      v.append(h('div', { class: 'empty' },
        h('p', {}, 'Este pad está vazio. Escolha um som na biblioteca (aba SONS), importe um arquivo de áudio ou grave pelo microfone.'),
        h('div', { class: 'row', style: { justifyContent: 'center' } },
          h('button', { class: 'btn primary', onclick: () => $('#fileAudio').click() }, 'Importar áudio'),
          h('button', { class: 'btn', onclick: () => this.recordMic() }, '● Gravar microfone'),
          h('button', { class: 'btn', onclick: () => this.resample() }, 'Resample (gravar a saída)'),
          this.clipboard ? h('button', { class: 'btn', onclick: () => this.pastePad() }, 'Colar pad') : null)));
      return;
    }
    const P = pad.params;
    const nameIn = h('input', { class: 'input', value: pad.name, maxlength: 40, style: { width: '180px' }, 'aria-label': 'Nome do pad' });
    nameIn.onchange = () => { pad.name = nameIn.value.trim() || pad.name; this.renderPads(); this.markDirty(); };
    head.append(nameIn,
      h('span', { class: 'badge' }, pad.src.kind === 'synth' ? 'SOM WDQ · ' + categoryOf(pad.src.def).toUpperCase() : 'SAMPLE'),
      h('span', { class: 'spacer' }),
      ...PAD_COLORS.map((c) => h('button', {
        title: 'Cor', style: { width: '18px', height: '18px', borderRadius: '5px', background: c, outline: c === pad.color ? '2px solid #fff' : 'none' },
        onclick: () => { pad.color = c; this.renderPads(); this.markDirty(); this.renderView(); },
      })));

    const grid = h('div', { class: 'edit-grid' });
    const left = h('div', { class: 'card' });
    const canvas = h('canvas', { class: 'wave', 'aria-label': 'Forma de onda: arraste os marcadores de início e fim' });
    left.append(h('h3', {}, 'SAMPLE · INÍCIO / FIM'), canvas);
    const info = h('div', { style: { fontSize: '11.5px', color: 'var(--muted)', margin: '6px 0 10px', fontFamily: 'var(--mono)' } });
    left.append(info);
    left.append(h('div', { class: 'row' },
      h('button', { class: 'btn small primary', onclick: () => this.engine.trigger(i, 120) }, '▶ Ouvir'),
      h('button', { class: 'btn small', onclick: () => $('#fileAudio').click() }, 'Importar áudio'),
      h('button', { class: 'btn small', onclick: () => this.recordMic() }, '● Gravar mic'),
      h('button', { class: 'btn small', onclick: () => this.resample() }, 'Resample'),
      h('button', { class: 'btn small', onclick: () => this.chop() }, 'Fatiar em 16 (Chop)'),
      h('button', { class: 'btn small', onclick: () => this.cropPad() }, 'Cortar'),
      h('button', { class: 'btn small', onclick: () => this.normalizePad() }, 'Normalizar'),
      h('button', { class: 'btn small', onclick: () => { this.clipboard = structuredClone(pad); toast('Pad copiado'); } }, 'Copiar'),
      this.clipboard ? h('button', { class: 'btn small', onclick: () => this.pastePad() }, 'Colar') : null,
      h('button', { class: 'btn small danger', onclick: () => this.clearPad() }, 'Limpar pad')));
    grid.append(left);

    const right = h('div', { class: 'card' }, h('h3', {}, 'PARÂMETROS'));
    const ks = h('div', { class: 'knobs' });
    const k = (o) => { const kn = knob({ ...o, onChange: (x) => { o.apply(x); this.markDirty(); if (o.mix) this.engine.applyMix(); if (o.redraw) draw(); } }); ks.append(kn.el); return kn; };
    k({ label: 'Volume', min: 0, max: 1.2, value: P.vol, def: 0.8, format: (x) => (x ? (20 * Math.log10(x)).toFixed(1) + 'dB' : '-∞'), apply: (x) => (P.vol = x), mix: true });
    k({ label: 'Pan', min: -1, max: 1, value: P.pan, def: 0, bipolar: true, detent: true, format: (x) => (Math.abs(x) < 0.01 ? 'C' : (x < 0 ? 'L' : 'R') + Math.round(Math.abs(x) * 100)), apply: (x) => (P.pan = x), mix: true });
    k({ label: 'Tune', min: -24, max: 24, step: 1, value: P.tune, def: 0, bipolar: true, format: (x) => (x > 0 ? '+' : '') + x + 'st', apply: (x) => (P.tune = x) });
    k({ label: 'Fine', min: -100, max: 100, step: 1, value: P.fine, def: 0, bipolar: true, format: (x) => (x > 0 ? '+' : '') + x + 'c', apply: (x) => (P.fine = x) });
    k({ label: 'Attack', min: 0, max: 1, value: P.attack, def: 0, format: (x) => Math.round(x * 1000) + 'ms', apply: (x) => (P.attack = x) });
    k({ label: 'Decay', min: 0.02, max: 1, value: P.decay, def: 1, format: (x) => Math.round(x * 100) + '%', apply: (x) => (P.decay = x) });
    const toCut = (x) => 40 * Math.pow(18000 / 40, x), fromCut = (f) => Math.log(f / 40) / Math.log(18000 / 40);
    k({ label: 'Cutoff', min: 0, max: 1, value: fromCut(P.cutoff), def: 1, format: (x) => { const f = toCut(x); return f >= 1000 ? (f / 1000).toFixed(1) + 'k' : Math.round(f) + ''; }, apply: (x) => (P.cutoff = toCut(x)) });
    k({ label: 'Reso', min: 0.5, max: 18, value: P.res, def: 0.7, format: (x) => x.toFixed(1), apply: (x) => (P.res = x) });
    right.append(ks);
    const ftype = h('select', { class: 'input', 'aria-label': 'Filtro' }, ...[['off', 'Filtro: desligado'], ['lowpass', 'Passa-baixa (LPF)'], ['highpass', 'Passa-alta (HPF)'], ['bandpass', 'Passa-banda (BPF)']].map(([val, l]) => h('option', { value: val, selected: P.ftype === val }, l)));
    ftype.onchange = () => { P.ftype = ftype.value; this.markDirty(); };
    const choke = h('select', { class: 'input', 'aria-label': 'Grupo de corte' }, ...[...Array(9)].map((_, n) => h('option', { value: n, selected: P.choke === n }, n ? 'Choke grupo ' + n : 'Sem choke')));
    choke.onchange = () => { P.choke = Number(choke.value); this.markDirty(); };
    const tog = (label, key, after) => {
      const b = h('button', { class: 'pill' + (P[key] ? ' on' : '') }, label);
      b.onclick = () => { P[key] = !P[key]; b.classList.toggle('on', P[key]); this.markDirty(); if (after) after(); };
      return b;
    };
    right.append(h('div', { class: 'row', style: { marginTop: '14px' } }, ftype, choke),
      h('div', { class: 'row', style: { marginTop: '10px' } }, tog('REVERSE', 'reverse', () => draw()), tog('POLY', 'poly'), tog('MUTE', 'mute', () => this.engine.applyMix()), tog('SOLO', 'solo', () => this.engine.applyMix())),
      h('p', { style: { color: 'var(--dim)', fontSize: '11.5px', lineHeight: 1.5, margin: '12px 0 0' } },
        'Choke: pads do mesmo grupo cortam um ao outro (ex.: chimbal fechado corta o aberto). Por padrão, tocar o pad de novo interrompe o som anterior (como na MPC); ligue POLY para os toques se somarem.'));
    grid.append(right);
    v.append(grid);

    const draw = () => this.drawWave(canvas, i, info);
    requestAnimationFrame(draw);
    this.bindWaveDrag(canvas, i, draw);
  }

  drawWave(canvas, i, info) {
    const buf = this.engine.buffers[i], pad = this.p.pads[i];
    if (!pad) return;
    const P = pad.params, dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, hh = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = hh * dpr;
    const g = canvas.getContext('2d');
    g.scale(dpr, dpr);
    g.fillStyle = '#07080a';
    g.fillRect(0, 0, w, hh);
    g.strokeStyle = '#1b1d24';
    for (let x = 0; x < w; x += w / 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, hh); g.stroke(); }
    if (!buf) return;
    const d = buf.getChannelData(0), n = d.length, mid = hh / 2;
    const s = Math.min(P.start, P.end), e = Math.max(P.start, P.end);
    for (let x = 0; x < w; x++) {
      const a = Math.floor((x / w) * n), b = Math.floor(((x + 1) / w) * n);
      let mn = 1, mx = -1;
      for (let k = a; k < b; k += Math.max(1, Math.floor((b - a) / 64))) { const y = P.reverse ? d[n - 1 - k] : d[k]; if (y < mn) mn = y; if (y > mx) mx = y; }
      const inside = x / w >= s && x / w <= e;
      g.fillStyle = inside ? pad.color : '#3a3c46';
      g.fillRect(x, mid - mx * mid * 0.95, 1, Math.max(1, (mx - mn) * mid * 0.95));
    }
    g.fillStyle = 'rgba(0,0,0,.55)';
    g.fillRect(0, 0, s * w, hh);
    g.fillRect(e * w, 0, w - e * w, hh);
    for (const [pos, lbl] of [[s, 'S'], [e, 'E']]) {
      g.fillStyle = '#ffb52e';
      g.fillRect(pos * w - 1, 0, 2, hh);
      g.fillRect(pos * w - (lbl === 'S' ? 0 : 14), 0, 14, 14);
      g.fillStyle = '#000';
      g.font = 'bold 10px sans-serif';
      g.fillText(lbl, pos * w - (lbl === 'S' ? -3 : 11), 11);
    }
    if (info) info.textContent = `Duração ${buf.duration.toFixed(2)}s · ${buf.sampleRate} Hz · início ${(s * buf.duration).toFixed(3)}s · fim ${(e * buf.duration).toFixed(3)}s`;
  }

  bindWaveDrag(canvas, i, draw) {
    let which = null;
    canvas.addEventListener('pointerdown', (e) => {
      const P = this.p.pads[i].params, r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
      which = Math.abs(x - P.start) <= Math.abs(x - P.end) ? 'start' : 'end';
      canvas.setPointerCapture(e.pointerId);
      move(e);
    });
    const move = (e) => {
      if (!which) return;
      const P = this.p.pads[i].params, r = canvas.getBoundingClientRect();
      let x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      if (which === 'start') x = Math.min(x, P.end - 0.002); else x = Math.max(x, P.start + 0.002);
      P[which] = x;
      draw();
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', () => { if (which) { which = null; this.markDirty(); this.engine.trigger(i, 110); } });
  }

  ensureSample(i) {
    // converte um som da biblioteca em sample editável
    const pad = this.p.pads[i];
    if (pad.src.kind === 'sample') return this.p.samples[pad.src.sampleId];
    const buf = this.engine.buffers[i];
    const id = uid();
    this.p.samples[id] = { name: pad.name, sr: buf.sampleRate, channels: [...Array(buf.numberOfChannels)].map((_, c) => buf.getChannelData(c).slice()) };
    pad.src = { kind: 'sample', sampleId: id };
    return this.p.samples[id];
  }

  async cropPad() {
    const i = this.sel, pad = this.p.pads[i], P = pad.params;
    if (P.start <= 0.001 && P.end >= 0.999) { toast('Arraste os marcadores S e E na forma de onda para escolher o trecho.'); return; }
    const s = this.ensureSample(i);
    const n = s.channels[0].length, a = Math.floor(Math.min(P.start, P.end) * n), b = Math.ceil(Math.max(P.start, P.end) * n);
    const id = uid();
    this.p.samples[id] = { name: s.name + ' (corte)', sr: s.sr, channels: s.channels.map((c) => c.slice(a, b)) };
    pad.src = { kind: 'sample', sampleId: id };
    P.start = 0; P.end = 1;
    await this.loadPadBuffer(i);
    this.markDirty();
    this.renderView();
    toast('Trecho cortado', 'ok');
  }

  async normalizePad() {
    const i = this.sel, pad = this.p.pads[i];
    if (pad.src.kind === 'synth') { toast('Os sons da biblioteca WDQ já vêm normalizados.'); return; }
    const s = this.p.samples[pad.src.sampleId];
    const b = new AudioBuffer({ length: s.channels[0].length, numberOfChannels: s.channels.length, sampleRate: s.sr });
    s.channels.forEach((c, k) => b.copyToChannel(c, k));
    normalize(b, 0.98);
    s.channels = [...Array(b.numberOfChannels)].map((_, c) => b.getChannelData(c).slice());
    s._buf = null;
    await this.reloadSampleUsers(pad.src.sampleId);
    this.markDirty();
    this.renderView();
    toast('Sample normalizado', 'ok');
  }

  async reloadSampleUsers(sampleId) {
    const s = this.p.samples[sampleId];
    if (s) s._buf = null;
    await Promise.all(this.p.pads.map((pad, k) => (pad && pad.src.sampleId === sampleId ? this.loadPadBuffer(k) : null)));
  }

  async chop() {
    const i = this.sel, pad = this.p.pads[i];
    const mode = await choiceDialog('Fatiar em 16 (Chop)', `Divide "${pad.name}" em até 16 pedaços e coloca um em cada pad do banco ${BANKS[this.bank]} (os pads atuais do banco serão substituídos).`, [
      { label: 'Fatias iguais', value: 'eq', primary: true },
      { label: 'Detectar batidas (transientes)', value: 'tr' },
    ]);
    if (!mode) return;
    const buf = this.engine.buffers[i];
    const P = pad.params;
    const s0 = Math.min(P.start, P.end), s1 = Math.max(P.start, P.end);
    let cuts;
    if (mode === 'tr') cuts = this.detectOnsets(buf, s0, s1);
    if (!cuts || cuts.length < 2) cuts = [...Array(16)].map((_, k) => s0 + ((s1 - s0) * k) / 16);
    cuts = cuts.slice(0, 16);
    const sample = this.ensureSample(i);
    const sid = pad.src.sampleId, base = pad.name, color = pad.color;
    for (let k = 0; k < 16; k++) {
      const target = this.bank * 16 + k;
      if (k >= cuts.length) { this.p.pads[target] = null; continue; }
      const np = padFromSample(`${base} ${k + 1}`, sid, color);
      np.params.start = cuts[k];
      np.params.end = k + 1 < cuts.length ? cuts[k + 1] : s1;
      np.params.choke = 8;
      this.p.pads[target] = np;
    }
    this.p.kitNames[this.bank] = 'Chop: ' + sample.name;
    await this.loadAllBuffers();
    this.sel = this.bank * 16;
    this.markDirty();
    this.renderPads();
    this.renderView();
    toast(`${cuts.length} fatias criadas no banco ${BANKS[this.bank]}`, 'ok');
  }

  detectOnsets(buf, s0, s1) {
    const d = buf.getChannelData(0), sr = buf.sampleRate;
    const a = Math.floor(s0 * d.length), b = Math.floor(s1 * d.length);
    const win = Math.floor(sr * 0.01), energies = [];
    for (let k = a; k + win < b; k += win) {
      let e = 0;
      for (let j = k; j < k + win; j++) e += d[j] * d[j];
      energies.push(e / win);
    }
    const onsets = [{ pos: a, score: Infinity }];
    const minGap = Math.floor(0.08 / 0.01);
    let lastIdx = -minGap;
    for (let k = 4; k < energies.length; k++) {
      const prev = (energies[k - 1] + energies[k - 2] + energies[k - 3] + energies[k - 4]) / 4 + 1e-7;
      const ratio = energies[k] / prev;
      if (ratio > 2.5 && energies[k] > 0.0005 && k - lastIdx >= minGap) {
        onsets.push({ pos: a + k * win, score: ratio });
        lastIdx = k;
      }
    }
    const best = onsets.sort((x, y) => y.score - x.score).slice(0, 16).sort((x, y) => x.pos - y.pos);
    return best.map((o) => o.pos / d.length);
  }

  async pastePad() {
    if (!this.clipboard) return;
    this.p.pads[this.sel] = structuredClone(this.clipboard);
    await this.loadPadBuffer(this.sel);
    this.markDirty();
    this.renderPads();
    this.renderView();
  }

  async clearPad() {
    if (!(await confirmDialog('Limpar pad', `Remover o som do pad ${padLabel(this.sel)}?`, 'Limpar', true))) return;
    this.p.pads[this.sel] = null;
    await this.loadPadBuffer(this.sel);
    this.markDirty();
    this.renderPads();
    this.renderView();
  }

  // ------------------------------------------------------------- MIXER
  viewMixer(v) {
    v.append(h('div', { class: 'toolbar' }, h('span', { class: 'pill on' }, 'BANCO ' + BANKS[this.bank]),
      h('span', { style: { color: 'var(--muted)', fontSize: '12px' } }, this.p.kitNames[this.bank] || ''),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn small', onclick: () => { this.p.pads.forEach((pd) => { if (pd) { pd.params.mute = false; pd.params.solo = false; } }); this.engine.applyMix(); this.markDirty(); this.renderView(); } }, 'Zerar mute/solo')));
    const mx = h('div', { class: 'mixer' });
    this.meterEls = [];
    for (let r = 0; r < 16; r++) {
      const i = this.bank * 16 + r, pad = this.p.pads[i];
      const P = pad ? pad.params : defaultParams();
      const meter = h('div', { class: 'meter' }, h('i'));
      const fader = h('input', { type: 'range', class: 'vfader', min: 0, max: 1.2, step: 0.01, value: P.vol, disabled: !pad, 'aria-label': 'Volume ' + padLabel(i) });
      const db = h('div', { class: 'db' }, P.vol ? (20 * Math.log10(P.vol)).toFixed(1) : '-∞');
      fader.oninput = () => { P.vol = Number(fader.value); db.textContent = P.vol ? (20 * Math.log10(P.vol)).toFixed(1) : '-∞'; this.engine.applyMix(); this.markDirty(); };
      const pan = knob({ label: 'Pan', min: -1, max: 1, value: P.pan, def: 0, bipolar: true, detent: true, format: (x) => (Math.abs(x) < 0.01 ? 'C' : (x < 0 ? 'L' : 'R') + Math.round(Math.abs(x) * 100)), onChange: (x) => { P.pan = x; this.engine.applyMix(); this.markDirty(); } });
      const m = h('button', { class: 'm' + (P.mute ? ' on' : '') }, 'M');
      const s = h('button', { class: 's' + (P.solo ? ' on' : '') }, 'S');
      if (pad) {
        m.onclick = () => { P.mute = !P.mute; m.classList.toggle('on', P.mute); this.engine.applyMix(); this.markDirty(); };
        s.onclick = () => { P.solo = !P.solo; s.classList.toggle('on', P.solo); this.engine.applyMix(); this.markDirty(); };
      }
      const strip = h('div', { class: 'strip', style: { '--c': pad ? pad.color : '#333', opacity: pad ? 1 : 0.4 } },
        h('div', { class: 'nm', title: pad ? pad.name : '' }, padLabel(i), h('br'), pad ? pad.name : '—'),
        pan.el, h('div', { class: 'fader-wrap' }, fader, meter), db, h('div', { class: 'btns' }, m, s));
      mx.append(strip);
      this.meterEls.push({ i, el: meter.firstChild });
    }
    v.append(mx);
  }

  meterLoop() {
    const loop = () => {
      const e = this.engine;
      const nm = e.native && (this.meterEls || this.vu || this.recorder) ? e.native.meters() : null;
      if (nm) this.lastNativeMeters = nm;
      if (this.meterEls) {
        for (const m of this.meterEls) {
          const ch = e.channels[m.i];
          const lv = nm ? nm[m.i + 2] : ch ? e.meterLevel(ch.meter) : 0;
          m.el.style.height = Math.min(100, Math.pow(lv, 0.6) * 100) + '%';
        }
      }
      if (this.vu) {
        const l = nm ? nm[0] : e.meterLevel(e.analyserL), r = nm ? nm[1] : e.meterLevel(e.analyserR);
        this.vu[0].style.height = Math.min(100, Math.pow(l, 0.6) * 100) + '%';
        this.vu[1].style.height = Math.min(100, Math.pow(r, 0.6) * 100) + '%';
      }
      if (this.recUi && this.recorder) this.recUi.textContent = fmtTime((performance.now() - this.recorder.t0) / 1000);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // -------------------------------------------------------------- SONG
  viewSong(v) {
    const p = this.p;
    const sd = 60 / p.bpm / 4;
    const total = p.song.reduce((a, pi) => a + p.patterns[pi].length * sd, 0);
    v.append(h('div', { class: 'toolbar' },
      h('button', { class: 'pill' + (p.songMode ? ' on' : ''), onclick: () => { p.songMode = !p.songMode; this.renderTransport(); this.markDirty(); this.renderView(); } }, p.songMode ? 'MODO SONG LIGADO' : 'LIGAR MODO SONG'),
      h('span', { style: { color: 'var(--muted)', fontSize: '12px' } }, `${p.song.length} blocos · ${fmtTime(total)}`),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn small', onclick: () => { p.song.pop(); this.markDirty(); this.renderView(); } }, 'Remover último'),
      h('button', { class: 'btn small danger', onclick: () => { p.song = []; this.markDirty(); this.renderView(); } }, 'Limpar')));
    const chain = h('div', { class: 'song-chain' });
    if (!p.song.length) chain.append(h('span', { style: { color: 'var(--dim)' } }, 'Adicione patterns abaixo para montar a música.'));
    p.song.forEach((pi, k) => chain.append(h('button', {
      class: 'blk' + (this.seq.playing && p.songMode && this.seq.songPos === k ? ' now' : ''),
      title: 'Toque para remover', onclick: () => { p.song.splice(k, 1); this.markDirty(); this.renderView(); },
    }, h('small', {}, String(k + 1)), PATTERN_NAMES[pi])));
    v.append(h('div', { class: 'card', style: { marginBottom: '12px' } }, h('h3', {}, 'SEQUÊNCIA DA MÚSICA'), chain));
    v.append(h('div', { class: 'card' }, h('h3', {}, 'ADICIONAR PATTERN'),
      h('div', { class: 'row' }, ...PATTERN_NAMES.map((n, i) => h('button', {
        class: 'btn', onclick: () => { p.song.push(i); this.markDirty(); this.renderView(); },
      }, h('b', {}, n), h('span', { style: { color: 'var(--muted)', fontSize: '11px' } }, ' ' + p.patterns[i].name)))),
      h('p', { style: { color: 'var(--dim)', fontSize: '12px', margin: '12px 0 0' } }, 'No modo song, o PLAY toca os patterns na ordem acima, em loop. Fora dele, os botões A–H trocam de pattern no fim do compasso, como numa MPC.')));
  }

  // -------------------------------------------------------- MINHA PASTA
  async viewFolder(v) {
    const cloudOn = this.cloud.on;
    v.append(h('div', { class: 'toolbar' },
      h('button', { class: 'btn primary', onclick: () => this.newProjectFlow() }, '+ Novo projeto'),
      h('button', { class: 'btn', onclick: () => this.saveNow(true) }, 'Salvar agora'),
      h('button', { class: 'btn', onclick: () => this.saveAs() }, 'Salvar como…'),
      h('span', { class: 'sep' }),
      h('button', { class: 'btn', onclick: () => this.exportWav() }, 'Exportar WAV'),
      h('button', { class: 'btn', onclick: () => this.toggleMixRecord() }, this.recorder && this.recorder.kind === 'mix' ? '■ Parar gravação' : '● Gravar mixagem ao vivo'),
      h('span', { class: 'sep' }),
      h('button', { class: 'btn', onclick: () => this.exportProject(this.p) }, 'Exportar projeto (.wdq)'),
      h('button', { class: 'btn', onclick: () => $('#fileProject').click() }, 'Importar projeto')));
    v.append(h('p', { style: { color: 'var(--muted)', fontSize: '12.5px', margin: '0 0 12px' } },
      cloudOn ? `Seus projetos ficam salvos neste aparelho e sincronizados na nuvem da sua conta (${this.user.email}). Entre de outro aparelho e eles estarão lá.`
        : `Seus projetos ficam salvos automaticamente neste aparelho, na conta ${this.user.email}. Para levar um projeto para outro aparelho, use "Exportar projeto".`));
    const gridEl = h('div', { class: 'folder-grid' }, h('div', { class: 'empty' }, 'Carregando…'));
    v.append(gridEl);

    let local = [], remote = [];
    try { local = await store.listProjects(this.user.id); } catch (e) { console.error(e); }
    if (cloudOn) {
      try { remote = await this.cloud.list(); } catch (e) { toast('Não foi possível acessar a nuvem agora.', 'err'); }
    }
    if (this.view !== 'folder') return;
    const map = new Map();
    for (const r of local) map.set(r.id, { ...r, local: true });
    for (const r of remote) {
      const cur = map.get(r.id);
      if (cur) { cur.cloud = true; cur.cloudNewer = r.updated > cur.updated + 1000; }
      else map.set(r.id, { ...r, cloud: true });
    }
    const items = [...map.values()].sort((a, b) => b.updated - a.updated);
    gridEl.innerHTML = '';
    if (!items.length) gridEl.append(h('div', { class: 'empty' }, 'Nenhum projeto salvo ainda.'));
    for (const it of items) {
      const cur = it.id === this.p.id;
      gridEl.append(h('div', { class: 'pcard' + (cur ? ' cur' : '') },
        h('div', { class: 't' }, h('b', {}, it.name), cur ? h('span', { class: 'badge' }, 'ABERTO') : null,
          it.cloud ? h('span', { class: 'badge cloud' }, 'NUVEM') : null, it.local ? null : h('span', { class: 'badge' }, 'SÓ NA NUVEM')),
        h('div', { class: 'sub' }, `${fmtDate(it.updated)} · ${it.bpm || '—'} BPM`),
        h('div', { class: 'acts' },
          cur ? null : h('button', { class: 'btn small primary', onclick: () => this.openProject(it) }, 'Abrir'),
          h('button', { class: 'btn small', onclick: () => this.renameProject(it) }, 'Renomear'),
          h('button', { class: 'btn small', onclick: () => this.duplicateProject(it) }, 'Duplicar'),
          h('button', { class: 'btn small', onclick: () => this.exportById(it) }, 'Exportar'),
          h('button', { class: 'btn small danger', onclick: () => this.deleteProject(it) }, 'Excluir'))));
    }
  }

  async getProjectData(it) {
    if (it.id === this.p.id) return this.p;
    let p = it.local ? await store.loadProject(this.user.id, it.id) : null;
    if ((!p || it.cloudNewer) && it.cloud) {
      p = await this.cloud.download(it.id);
      await store.saveProject(this.user.id, p);
    }
    return p ? migrate(p) : null;
  }

  async openProject(it) {
    if (this.dirty) await this.saveNow();
    try {
      const p = await this.getProjectData(it);
      if (!p) throw new Error('Projeto não encontrado');
      await this.setProject(p);
      toast(`"${p.name}" aberto`, 'ok');
    } catch (e) {
      console.error(e);
      toast('Não foi possível abrir o projeto: ' + e.message, 'err');
    }
  }

  async newProjectFlow() {
    const choice = await choiceDialog('Novo projeto', 'Como você quer começar?', [
      { label: 'Com um kit da biblioteca (escolher estilo)', value: 'kit', primary: true },
      { label: 'Projeto em branco', value: 'blank' },
    ]);
    if (!choice) return;
    if (this.dirty) await this.saveNow();
    const p = newProject();
    if (choice === 'kit') {
      const kitId = await choiceDialog('Escolha o estilo', '', KITS.filter((k) => k.beats.length).map((k) => ({ label: `${k.genre} — ${k.name} (${k.bpm} BPM)`, value: k.id })));
      if (!kitId) return;
      const kit = KITS.find((k) => k.id === kitId);
      this.fillBank(p, kit, 0, true);
      this.fillBank(p, KITS.find((k) => k.id === 'fx-dj'), 1, false);
      p.name = kit.name + ' — novo';
    }
    const name = await promptDialog('Nome do projeto', p.name);
    if (name) p.name = name;
    await this.setProject(p);
    await this.saveNow();
    if (this.view === 'folder') this.renderView();
  }

  async saveAs() {
    const name = await promptDialog('Salvar como', this.p.name + ' (cópia)');
    if (!name) return;
    const copy = cloneProject(this.p);
    copy.id = uid();
    copy.name = name;
    copy.created = Date.now();
    await this.setProject(copy);
    await this.saveNow(true);
  }

  async renameProject(it) {
    const isCur = !it || it.id === this.p.id;
    const name = await promptDialog('Renomear projeto', isCur ? this.p.name : it.name);
    if (!name) return;
    if (isCur) {
      this.p.name = name;
      this.renderProjName();
      await this.saveNow();
    } else {
      const p = await this.getProjectData(it);
      p.name = name;
      p.updated = Date.now();
      await store.saveProject(this.user.id, p);
      if (this.cloud.on) this.cloud.upload(p).catch(() => {});
    }
    if (this.view === 'folder') this.renderView();
  }

  async duplicateProject(it) {
    const p = await this.getProjectData(it);
    const copy = cloneProject(p);
    copy.id = uid();
    copy.name = p.name + ' (cópia)';
    copy.created = copy.updated = Date.now();
    await store.saveProject(this.user.id, copy);
    if (this.cloud.on) this.cloud.upload(copy).catch(() => {});
    toast('Projeto duplicado', 'ok');
    this.renderView();
  }

  async deleteProject(it) {
    if (!(await confirmDialog('Excluir projeto', `Excluir "${it.name}" ${it.cloud ? 'deste aparelho e da nuvem' : 'deste aparelho'}? Isso não pode ser desfeito.`, 'Excluir', true))) return;
    await store.deleteProject(this.user.id, it.id);
    if (it.cloud) await this.cloud.remove(it.id).catch(() => {});
    if (it.id === this.p.id) {
      const list = await store.listProjects(this.user.id);
      const next = list.length ? await store.loadProject(this.user.id, list[0].id) : newProject();
      this.dirty = false;
      await this.setProject(migrate(next));
    }
    toast('Projeto excluído');
    this.renderView();
  }

  async exportById(it) {
    const p = await this.getProjectData(it);
    if (p) this.exportProject(p);
  }

  async exportProject(p) {
    const blob = await projectToFile(this.gcSamples(p));
    const where = await deliverFile(blob, safeName(p.name) + '.wdq');
    toast('Projeto exportado' + (where ? ' para ' + where : ''), 'ok');
  }

  async importProjectFile(file, rename) {
    try {
      const p = await projectFromFile(file);
      if (rename) p.name = rename;
      p.id = uid();
      p.updated = Date.now();
      await store.saveProject(this.user.id, p);
      if (this.dirty) await this.saveNow();
      await this.setProject(p);
      this.saveNow();
      toast(`Projeto "${p.name}" importado`, 'ok');
    } catch (e) {
      console.error(e);
      toast(e.message || 'Arquivo inválido', 'err');
    }
  }

  // ----------------------------------------------------------- AJUSTES
  viewSettings(v) {
    const u = this.user;
    const wrap = h('div', { class: 'settings' });
    wrap.append(h('div', { class: 'card' }, h('h3', {}, 'SUA CONTA'),
      h('p', {}, h('b', {}, u.name), h('br'), u.email),
      h('p', {}, this.auth.mode === 'cloud'
        ? 'Conta na nuvem: login com e-mail confirmado. Seus projetos sincronizam entre aparelhos.'
        : 'Conta local: guardada só neste aparelho, com senha protegida por criptografia (PBKDF2).'),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: () => this.changePassword() }, 'Trocar senha'),
        h('button', { class: 'btn small danger', onclick: () => this.logout() }, 'Sair da conta'),
        this.auth.mode === 'cloud' ? h('button', { class: 'btn small danger', onclick: () => this.deleteAccount() }, 'Excluir minha conta') : null),
      CONFIG.PRIVACY_URL ? h('p', { class: 'privacy-link' }, h('a', { href: CONFIG.PRIVACY_URL, target: '_blank', rel: 'noopener' }, 'Política de Privacidade')) : null));

    wrap.append(h('div', { class: 'card' }, h('h3', {}, 'APLICATIVO'),
      h('p', {}, `${CONFIG.APP_NAME} versão ${CONFIG.VERSION}. ${this.hooks.isStandalone && this.hooks.isStandalone() ? 'Rodando como app instalado.' : 'Você pode instalar o app na tela inicial e usá-lo sem internet.'}`),
      h('div', { class: 'row' },
        this.hooks.canInstall && this.hooks.canInstall() ? h('button', { class: 'btn small primary', onclick: () => this.hooks.install() }, 'Instalar o app') : null,
        h('button', { class: 'btn small', onclick: () => this.tour() }, 'Ver tutorial'),
        h('button', { class: 'btn small', onclick: () => shareApp(this.user) }, 'Indicar para um amigo'),
        h('button', { class: 'btn small', onclick: () => this.hooks.checkUpdate && this.hooks.checkUpdate(true) }, 'Procurar atualização')),
      h('p', { class: 'credit-inline' }, 'DESENVOLVIDO POR WEBER DE QUEIROZ - WDQ BRASIL')));

    const midiCard = h('div', { class: 'card' }, h('h3', {}, 'CONTROLADOR MIDI'));
    if (!this.midi.supported) midiCard.append(h('p', {}, 'MIDI não é suportado aqui. No computador, abra o WDQ Sampler no Chrome ou Edge para usar controladores como Akai MPD/MPK ou Pioneer DDJ.'));
    else if (!this.midi.access) {
      midiCard.append(h('p', {}, 'Ligue um controlador USB (pads Akai, teclado MIDI, controladora de DJ). As notas 36 a 51 tocam os pads 1 a 16 do banco atual.'),
        h('button', { class: 'btn small primary', onclick: async () => { try { await this.midi.enable(); this.renderView(); } catch (e) { toast(e.message, 'err'); } } }, 'Ativar MIDI'));
    } else {
      const names = this.midi.inputs.map((i) => i.name);
      midiCard.append(h('p', {}, names.length ? 'Conectado: ' + names.join(', ') : 'Nenhum aparelho MIDI encontrado. Conecte e aguarde.'),
        h('p', {}, `Aprender: escolha um pad (selecionado agora: ${padLabel(this.sel)}), toque abaixo e depois aperte a tecla/pad no controlador.`),
        h('div', { class: 'row' },
          h('button', { class: 'btn small primary', onclick: () => { this.midi.learn = this.sel; toast('Aperte uma nota no controlador…'); } }, 'Aprender nota para ' + padLabel(this.sel)),
          h('button', { class: 'btn small', onclick: () => { this.p.midiMap = {}; this.markDirty(); toast('Mapa MIDI zerado'); } }, 'Zerar mapa')));
    }
    wrap.append(midiCard);

    wrap.append(h('div', { class: 'card' }, h('h3', {}, 'TECLADO DO COMPUTADOR'),
      h('p', {}, 'Os pads seguem o desenho físico de uma MPC (pad 1 embaixo à esquerda):'),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 34px)', gap: '6px', marginBottom: '10px' } },
        ...PAD_ORDER.map((p) => h('span', { class: 'kbd' }, KEYLABEL[p]))),
      h('p', {}, h('span', { class: 'kbd' }, 'Espaço'), ' tocar/parar  ', h('span', { class: 'kbd' }, 'Enter'), ' gravar  ', h('span', { class: 'kbd' }, 'Esc'), ' parar  ',
        h('span', { class: 'kbd' }, '← →'), ' pattern  ', h('span', { class: 'kbd' }, '↑ ↓'), ' banco  ', h('span', { class: 'kbd' }, 'Ctrl+S'), ' salvar')));

    const nat = this.engine.native;
    const st = nat ? nat.status() : null;
    let stability = null;
    if (st && nat.b.audioSetMode) {
      const modes = [['Mínima latência', 'Toque mais imediato; pode chiar em aparelhos mais simples.'],
        ['Equilibrado', 'Recomendado: rápido e estável na maioria dos celulares.'],
        ['Máxima estabilidade', 'Use se ouvir chiado ou estalos.']];
      const desc = h('p', { style: { margin: '6px 0 0' } }, modes[st.mode ?? 1][1]);
      const row = h('div', { class: 'row' });
      modes.forEach(([label], k) => {
        const b = h('button', { class: 'pill' + ((st.mode ?? 1) === k ? ' on' : '') }, label);
        b.onclick = () => {
          nat.setMode(k);
          $$('.pill', row).forEach((x) => x.classList.toggle('on', x === b));
          desc.textContent = modes[k][1];
          setTimeout(() => this.view === 'settings' && this.renderView(), 400);
        };
        row.append(b);
      });
      stability = h('div', { style: { margin: '10px 0 12px' } }, h('p', { style: { margin: '0 0 6px' } }, h('b', {}, 'Estabilidade do áudio')), row, desc);
    }
    wrap.append(h('div', { class: 'card' }, h('h3', {}, 'ÁUDIO'),
      this.nativeAvailable ? h('p', {}, nat
        ? h('b', { style: { color: 'var(--green)' } }, `● Áudio nativo de baixa latência ligado (${st.latencyMs} ms de buffer, ${st.sr} Hz).`)
        : h('b', { style: { color: 'var(--amber)' } }, '● Áudio nativo desligado: usando o áudio do navegador (mais atraso).')) : null,
      st && st.underruns != null ? h('p', {}, st.underruns
        ? `Engasgos de áudio desde que o app abriu: ${st.underruns}. O app aumenta o buffer sozinho; se ainda ouvir chiado, escolha "Máxima estabilidade".`
        : 'Nenhum engasgo de áudio desde que o app abriu.') : null,
      stability,
      this.nativeAvailable ? h('button', { class: 'btn small', onclick: async () => {
        if (!(await confirmDialog('Áudio nativo', nat ? 'Desligar o áudio nativo e usar o do navegador? Só faça isso se o som falhar no seu aparelho.' : 'Ligar o áudio nativo de baixa latência?', nat ? 'Desligar' : 'Ligar'))) return;
        NativeAudio.setEnabledPref(!nat);
        await this.saveNow();
        location.reload();
      } }, nat ? 'Desligar áudio nativo' : 'Ligar áudio nativo') : null,
      h('p', {}, `Taxa de amostragem: ${this.ctx.sampleRate} Hz · Latência base: ${Math.round((this.ctx.baseLatency || 0) * 1000)} ms${this.ctx.outputLatency ? ' · saída ' + Math.round(this.ctx.outputLatency * 1000) + ' ms' : ''}.`),
      h('p', {}, 'Para a menor latência, use fones com fio ou interface de áudio. Fones Bluetooth adicionam atraso.')));
    v.append(wrap);
  }

  async changePassword() {
    const pw = await promptDialog('Nova senha', '', 'Mínimo de 8 caracteres, com letras e números.');
    if (!pw) return;
    try { await this.auth.updatePassword(pw); toast('Senha alterada', 'ok'); } catch (e) { toast(e.message, 'err'); }
  }

  async logout() {
    if (!(await confirmDialog('Sair', 'Sair da sua conta neste aparelho? Seu trabalho é salvo antes.', 'Sair'))) return;
    await this.saveNow();
    this.seq.stop();
    this.engine.stopAll();
    await this.auth.signOut();
    location.reload();
  }

  async deleteAccount() {
    const pw = await modal((d, close) => {
      const inp = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', style: { width: '100%' }, 'aria-label': 'Sua senha' });
      d.append(h('h2', {}, 'Excluir minha conta'),
        h('p', {}, `Isto apaga para sempre a conta ${this.user.email}, os projetos guardados na nuvem e os deste aparelho. Não dá para desfazer. Digite sua senha para confirmar:`),
        h('form', { onsubmit: (e) => { e.preventDefault(); close(inp.value || null); } }, inp,
          h('div', { class: 'acts' },
            h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancelar'),
            h('button', { class: 'btn danger', type: 'submit' }, 'Excluir para sempre'))));
      setTimeout(() => inp.focus(), 40);
    }, { autofocus: false });
    if (!pw) return;
    try {
      const id = this.user.id;
      const list = await store.listProjects(id);
      await this.auth.deleteAccount(pw);
      this.dirty = false;
      this.seq.stop();
      this.engine.stopAll();
      for (const it of list) await store.deleteProject(id, it.id);
      location.reload();
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  openAdmin() {
    if (this.full) this.toggleFull(this.full);
    if (matchMedia(COMPACT).matches) $('#app').dataset.m = 'screen';
    this.go('admin', true);
  }

  userMenu(anchor) {
    const old = $('.menu');
    if (old) { old.remove(); return; }
    const r = anchor.getBoundingClientRect();
    const m = h('div', { class: 'menu', style: { top: r.bottom + 8 + 'px', right: Math.max(8, innerWidth - r.right) + 'px' } },
      h('div', { class: 'head' }, h('b', {}, this.user.name), h('span', {}, this.user.email)),
      h('button', { onclick: () => { m.remove(); this.go('folder'); } }, 'Minha Pasta'),
      h('button', { onclick: () => { m.remove(); this.newProjectFlow(); } }, 'Novo projeto'),
      h('button', { onclick: () => { m.remove(); this.exportWav(); } }, 'Exportar WAV'),
      h('button', { onclick: () => { m.remove(); this.go('settings'); } }, 'Ajustes'),
      h('button', { onclick: () => { m.remove(); this.tour(); } }, 'Ver tutorial'),
      h('button', { class: 'menu-share', onclick: () => { m.remove(); shareApp(this.user); } }, 'Indicar para um amigo'),
      this.auth.isAdmin ? h('button', { class: 'menu-admin', onclick: () => { m.remove(); this.openAdmin(); } }, 'Painel do administrador') : null,
      this.hooks.canInstall && this.hooks.canInstall() ? h('button', { onclick: () => { m.remove(); this.hooks.install(); } }, 'Instalar o app') : null,
      h('button', { onclick: () => { m.remove(); this.logout(); } }, 'Sair'));
    document.body.append(m);
    setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('pointerdown', off); } }), 0);
  }

  // ========================================================== biblioteca
  renderLibrary() {
    $$('#libTabs button').forEach((b) => b.classList.toggle('on', b.dataset.lib === this.lib));
    const list = $('#libList');
    list.innerHTML = '';
    const q = this.libQuery;
    if (this.lib === 'kits') {
      const kits = KITS.filter((k) => !q || (k.name + ' ' + k.genre + ' ' + k.desc + ' ' + k.beats.map((b) => b.name).join(' ')).toLowerCase().includes(q));
      $('#libCount').textContent = kits.length + ' kits';
      const byGenre = new Map();
      for (const k of kits) { if (!byGenre.has(k.genre)) byGenre.set(k.genre, []); byGenre.get(k.genre).push(k); }
      for (const [genre, ks] of byGenre) {
        const g = h('div', { class: 'genre' }, h('div', { class: 'genre-h' }, h('i', { style: { background: ks[0].color } }), genre));
        for (const k of ks) g.append(this.kitItem(k));
        list.append(g);
      }
      if (!kits.length) list.append(h('div', { class: 'empty' }, 'Nada encontrado.'));
    } else {
      const sounds = allSounds().filter((s) => !q || (s.n + ' ' + s.kit + ' ' + s.genre + ' ' + categoryOf(s)).toLowerCase().includes(q));
      $('#libCount').textContent = sounds.length + ' sons';
      const byCat = new Map();
      for (const s of sounds) { const c = categoryOf(s); if (!byCat.has(c)) byCat.set(c, []); byCat.get(c).push(s); }
      const order = ['Kicks', '808 & Baixo', 'Caixas', 'Palmas', 'Chimbais', 'Pratos', 'Tons', 'Percussão', 'Instrumentos', 'Vocais', 'FX DJ'];
      for (const cat of order.filter((c) => byCat.has(c))) {
        const g = h('div', { class: 'genre' }, h('div', { class: 'genre-h' }, cat + ' · ' + byCat.get(cat).length));
        for (const s of byCat.get(cat)) {
          const row = h('div', { class: 'snd' }, h('i', { style: { background: s.color } }),
            h('div', { class: 'nm' }, h('b', {}, s.n), h('span', {}, s.genre)),
            h('button', { class: 'to', title: 'Colocar no pad selecionado', onclick: (e) => { e.stopPropagation(); this.assignSound(s, this.sel); } }, '→ ' + padLabel(this.sel)));
          row.onclick = () => this.audition(s);
          g.append(row);
        }
        list.append(g);
      }
    }
  }

  kitItem(k) {
    const open = this.openKit === k.id;
    const el = h('div', { class: 'kit' + (open ? ' open' : '') });
    const row = h('button', { class: 'kit-row', onclick: () => { this.openKit = open ? null : k.id; this.renderLibrary(); } },
      h('span', { class: 'sw', style: { background: k.color } }, k.genre.slice(0, 2).toUpperCase()),
      h('span', { class: 'meta' }, h('b', {}, k.name), h('span', {}, `${k.bpm} BPM · ${k.beats.length ? k.beats.length + ' bases' : '16 efeitos'}`)));
    el.append(row);
    if (!open) return el;
    const body = h('div', { class: 'kit-body' }, h('p', {}, k.desc));
    body.append(h('div', { class: 'kit-actions' },
      k.beats.length ? h('button', { class: 'btn small primary', onclick: () => this.loadKit(k, true) }, 'Kit + bases') : null,
      h('button', { class: 'btn small', onclick: () => this.loadKit(k, false) }, 'Só sons → banco ' + BANKS[this.bank])));
    const mini = h('div', { class: 'mini-pads' });
    [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3].forEach((i) => {
      const s = k.pads[i];
      mini.append(h('button', { title: s.n, onpointerdown: () => this.audition(s) }, s.n));
    });
    body.append(mini);
    k.beats.forEach((b, bi) => {
      const playing = this.preview && this.preview.kit === k.id && this.preview.beat === bi;
      body.append(h('div', { class: 'beat-row' },
        h('button', { class: 'play' + (playing ? ' on' : ''), html: playing ? ICON_STOP : ICON_PLAY, title: 'Ouvir prévia', onclick: () => (playing ? this.stopPreview() : this.previewBeat(k, bi)) }),
        h('span', {}, b.name),
        h('button', { class: 'use', onclick: () => this.useBeat(k, bi) }, 'Usar →')));
    });
    el.append(body);
    return el;
  }

  async audition(sound) {
    if (this.ctx.state !== 'running') await this.ctx.resume();
    const buf = await renderSound({ t: sound.t, p: sound.p });
    const src = new AudioBufferSourceNode(this.ctx, { buffer: buf });
    const g = new GainNode(this.ctx, { gain: 0.8 });
    src.connect(g).connect(this.engine.bus);
    src.start();
  }

  async assignSound(sound, i) {
    const pad = padFromSound(sound);
    this.p.pads[i] = pad;
    await this.loadPadBuffer(i);
    this.engine.applyMix();
    this.engine.trigger(i, 110);
    this.markDirty();
    this.renderPads();
    if (this.view === 'pad' || this.view === 'seq' || this.view === 'mixer') this.renderView();
    toast(`${sound.n} → ${padLabel(i)}`, 'ok');
  }

  async loadKit(kit, withBeats) {
    if (withBeats) {
      const used = this.p.patterns.some((pt) => Object.keys(pt.steps).length);
      if (used && !(await confirmDialog('Carregar kit + bases', `Isso coloca o kit "${kit.name}" no banco ${BANKS[this.bank]} e as ${kit.beats.length} bases nos patterns A–${PATTERN_NAMES[kit.beats.length - 1]} (substituindo os atuais), com BPM ${kit.bpm}. Continuar?`, 'Carregar'))) return;
    }
    this.fillBank(this.p, kit, this.bank, withBeats);
    await Promise.all([...Array(16)].map((_, k) => this.loadPadBuffer(this.bank * 16 + k)));
    this.engine.applyMix();
    this.engine.beat.setBpm(this.p.bpm);
    this.seq.queuePattern(0);
    this.markDirty();
    this.renderAll();
    toast(withBeats ? `${kit.name} carregado com ${kit.beats.length} bases. Aperte PLAY!` : `${kit.name} carregado no banco ${BANKS[this.bank]}`, 'ok');
    if (matchMedia(COMPACT).matches) { $('#app').dataset.m = 'pads'; this.renderMnav(); }
    $('#app').classList.remove('show-browser');
  }

  async useBeat(kit, bi) {
    const target = this.seq.pattern;
    const hasSteps = Object.keys(this.p.patterns[target].steps).length > 0;
    if (!(await confirmDialog('Usar base', `Carregar a base "${kit.beats[bi].name}" no pattern ${PATTERN_NAMES[target]}${hasSteps ? ' (substituindo o atual)' : ''} e o kit "${kit.name}" no banco ${BANKS[this.bank]}?`, 'Usar'))) return;
    this.stopPreview();
    kit.pads.forEach((s, i) => { this.p.pads[this.bank * 16 + i] = padFromSound(s); });
    this.p.kitNames[this.bank] = kit.name;
    this.p.patterns[target] = beatToPattern(kit, bi, this.bank * 16);
    this.p.bpm = kit.bpm;
    this.p.swing = kit.swing;
    await Promise.all([...Array(16)].map((_, k) => this.loadPadBuffer(this.bank * 16 + k)));
    this.engine.applyMix();
    this.engine.beat.setBpm(this.p.bpm);
    this.markDirty();
    this.renderAll();
    toast(`Base "${kit.beats[bi].name}" pronta no pattern ${PATTERN_NAMES[target]}`, 'ok');
  }

  async previewBeat(kit, bi) {
    if (this.ctx.state !== 'running') await this.ctx.resume();
    if (this.seq.playing) this.stop();
    this.stopPreview();
    const eng = new Engine(this.ctx, { realtime: false });
    eng.master.gain.value = 0.85;
    const p = newProject('prévia');
    this.fillBank(p, kit, 0, false);
    p.patterns[0] = beatToPattern(kit, bi, 0);
    p.bpm = kit.bpm;
    p.swing = kit.swing;
    eng.setProject(p);
    await Promise.all(kit.pads.map(async (s, i) => eng.setBuffer(i, await renderSound({ t: s.t, p: s.p }))));
    eng.applyMix();
    const sq = new Sequencer(eng);
    this.preview = { kit: kit.id, beat: bi, eng, sq };
    sq.start();
    this.renderLibrary();
  }

  stopPreview() {
    if (!this.preview) return;
    const { eng, sq } = this.preview;
    sq.stop();
    sq.destroy();
    eng.stopAll();
    setTimeout(() => eng.dispose(), 300);
    this.preview = null;
    this.renderLibrary();
  }

  // ======================================================== áudio externo
  async importAudioFiles(files, startPad) {
    if (this.ctx.state !== 'running') await this.ctx.resume();
    let i = startPad, ok = 0;
    for (const f of files) {
      try {
        const buf = await this.ctx.decodeAudioData(await f.arrayBuffer());
        if (buf.duration > MAX_SAMPLE_SEC) toast(`${f.name}: usando só os primeiros ${MAX_SAMPLE_SEC}s`);
        await this.assignBuffer(buf, f.name.replace(/\.[^.]+$/, ''), i);
        ok++;
        i = this.bank * 16 + ((i % 16) + 1) % 16;
      } catch (e) {
        console.error(e);
        toast(`Não consegui abrir ${f.name}`, 'err');
      }
    }
    if (ok) toast(`${ok} sample(s) importado(s)`, 'ok');
  }

  async assignBuffer(buf, name, i, trim = false) {
    let len = Math.min(buf.length, Math.floor(MAX_SAMPLE_SEC * buf.sampleRate)), start = 0;
    if (trim) {
      const d = buf.getChannelData(0);
      while (start < len && Math.abs(d[start]) < 0.015) start++;
      start = Math.max(0, start - Math.floor(buf.sampleRate * 0.01));
      if (start >= len - 100) start = 0;
    }
    const id = uid();
    this.p.samples[id] = { name, sr: buf.sampleRate, channels: [...Array(Math.min(2, buf.numberOfChannels))].map((_, c) => buf.getChannelData(c).slice(start, len)) };
    const old = this.p.pads[i];
    const pad = padFromSample(name, id, old ? old.color : PAD_COLORS[(i % 16) % PAD_COLORS.length]);
    this.p.pads[i] = pad;
    await this.loadPadBuffer(i);
    this.engine.applyMix();
    this.sel = i;
    this.markDirty();
    this.renderPads();
    if (['pad', 'seq', 'mixer'].includes(this.view)) this.renderView();
  }

  async recordMic() {
    if (this.recorder) { this.recorder.stop(); return; }
    this.usage.count('recs');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) {
      toast('Sem acesso ao microfone. Autorize o microfone para gravar samples.', 'err');
      return;
    }
    const src = this.ctx.createMediaStreamSource(stream);
    const an = new AnalyserNode(this.ctx, { fftSize: 1024 });
    src.connect(an);
    await this.captureStream(stream, 'mic', an, async (buf) => {
      stream.getTracks().forEach((t) => t.stop());
      src.disconnect();
      await this.assignBuffer(buf, 'Gravação ' + new Date().toLocaleTimeString('pt-BR'), this.sel, true);
      toast('Sample gravado no pad ' + padLabel(this.sel), 'ok');
    });
  }

  async resample() {
    if (this.recorder) { this.recorder.stop(); return; }
    if (this.engine.native) {
      await this.nativeCapture('resample', 'Toque os pads ou dê PLAY: tudo que sair do master vira um novo sample no pad ' + padLabel(this.sel) + '.', async (n) => {
        await this.assignBuffer(n.recTakeBuffer(), 'Resample ' + new Date().toLocaleTimeString('pt-BR'), this.sel, true);
        toast('Resample salvo no pad ' + padLabel(this.sel), 'ok');
      });
      return;
    }
    const dest = this.ctx.createMediaStreamDestination();
    this.engine.master.connect(dest);
    await this.captureStream(dest.stream, 'resample', this.engine.analyserL, async (buf) => {
      this.engine.master.disconnect(dest);
      await this.assignBuffer(buf, 'Resample ' + new Date().toLocaleTimeString('pt-BR'), this.sel, true);
      toast('Resample salvo no pad ' + padLabel(this.sel), 'ok');
    }, 'Toque os pads ou dê PLAY: tudo que sair do master vira um novo sample no pad ' + padLabel(this.sel) + '.');
  }

  async toggleMixRecord() {
    if (this.recorder) { this.recorder.stop(); return; }
    this.usage.count('recs');
    if (this.engine.native) {
      const p = this.nativeCapture('mix', 'Gravando tudo o que sai do master (pads, sequência e efeitos de DJ). Toque à vontade!', async (n) => {
        const where = n.recSaveFile(safeName(this.p.name) + ' - mix ao vivo.wav');
        toast('Mixagem salva em ' + where, 'ok');
      });
      if (this.view === 'folder') this.renderView();
      await p;
      return;
    }
    const dest = this.ctx.createMediaStreamDestination();
    this.engine.master.connect(dest);
    await this.captureStream(dest.stream, 'mix', this.engine.analyserL, async (buf) => {
      this.engine.master.disconnect(dest);
      const where = await deliverFile(bufferToWav(buf), safeName(this.p.name) + ' - mix ao vivo.wav');
      toast('Mixagem salva em ' + where, 'ok');
    }, 'Gravando tudo o que sai do master (pads, sequência e efeitos de DJ). Toque à vontade!');
    if (this.view === 'folder') this.renderView();
  }

  // gravação da saída do motor nativo (APK)
  async nativeCapture(kind, text, done) {
    const n = this.engine.native;
    const timeUi = h('b', { style: { fontFamily: 'var(--mono)' } }, '0:00');
    const meter = h('div', { class: 'rec-meter' }, h('i'));
    this.recUi = timeUi;
    let raf;
    const loop = () => {
      const m = this.lastNativeMeters;
      meter.firstChild.style.width = Math.min(100, Math.pow(m ? Math.max(m[0], m[1]) : 0, 0.6) * 100) + '%';
      raf = requestAnimationFrame(loop);
    };
    let stop;
    const stopP = new Promise((res) => { stop = res; });
    this.recorder = { kind, t0: performance.now(), stop: () => stop() };
    n.recStart();
    loop();
    const title = { resample: 'Resample', mix: 'Gravando a mixagem' }[kind];
    const bar = h('div', { class: 'update-bar', role: 'status', style: { borderColor: 'var(--red)' } },
      h('span', { style: { color: 'var(--red)' } }, '●'), h('span', {}, h('b', {}, title), h('br'), h('small', { style: { color: 'var(--muted)' } }, text)),
      timeUi, meter, h('button', { class: 'btn small primary', onclick: () => this.recorder && this.recorder.stop() }, '■ Parar'));
    document.body.append(bar);
    await stopP;
    bar.remove();
    cancelAnimationFrame(raf);
    this.recorder = null;
    this.recUi = null;
    try { await done(n); } catch (e) { console.error(e); toast('Não foi possível processar a gravação.', 'err'); }
    if (this.view === 'folder') this.renderView();
  }

  async captureStream(stream, kind, analyser, done, text) {
    if (typeof MediaRecorder === 'undefined') { toast('Gravação não suportada neste navegador.', 'err'); return; }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 256000 } : {});
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const timeUi = h('b', { style: { fontFamily: 'var(--mono)' } }, '0:00');
    const meter = h('div', { class: 'rec-meter' }, h('i'));
    this.recUi = timeUi;
    let raf;
    const loop = () => { meter.firstChild.style.width = Math.min(100, Math.pow(this.engine.meterLevel(analyser), 0.6) * 100) + '%'; raf = requestAnimationFrame(loop); };
    const stopP = new Promise((res) => { rec.onstop = res; });
    this.recorder = { kind, t0: performance.now(), stop: () => rec.state !== 'inactive' && rec.stop() };
    rec.start(250);
    loop();
    const title = { mic: 'Gravando microfone', resample: 'Resample', mix: 'Gravando a mixagem' }[kind];
    const bar = h('div', { class: 'update-bar', role: 'status', style: { borderColor: 'var(--red)' } },
      h('span', { style: { color: 'var(--red)' } }, '●'), h('span', {}, h('b', {}, title), h('br'), h('small', { style: { color: 'var(--muted)' } }, text || 'Fale, cante ou toque perto do microfone.')),
      timeUi, meter, h('button', { class: 'btn small primary', onclick: () => this.recorder && this.recorder.stop() }, '■ Parar'));
    document.body.append(bar);
    await stopP;
    bar.remove();
    cancelAnimationFrame(raf);
    this.recorder = null;
    this.recUi = null;
    try {
      const blob = new Blob(chunks, { type: rec.mimeType });
      const buf = await this.ctx.decodeAudioData(await blob.arrayBuffer());
      await done(buf);
    } catch (e) {
      console.error(e);
      toast('Não foi possível processar a gravação.', 'err');
    }
    if (this.view === 'folder') this.renderView();
  }

  // ========================================================= exportar WAV
  async exportWav() {
    this.usage.count('exports');
    const songOk = this.p.song.length > 0;
    const choice = await choiceDialog('Exportar WAV', 'Renderiza o áudio em alta qualidade (44,1 kHz, 16 bits) com os efeitos atuais do mixer.', [
      { label: `Pattern ${PATTERN_NAMES[this.seq.pattern]} — 1 vez`, value: '1', primary: true },
      { label: `Pattern ${PATTERN_NAMES[this.seq.pattern]} — 4 vezes`, value: '4' },
      { label: `Pattern ${PATTERN_NAMES[this.seq.pattern]} — 8 vezes`, value: '8' },
      songOk ? { label: `Música inteira (song: ${this.p.song.length} blocos)`, value: 'song' } : null,
    ].filter(Boolean));
    if (!choice) return;
    const t = toast('Renderizando WAV…');
    try {
      const order = choice === 'song' ? this.p.song : Array(Number(choice)).fill(this.seq.pattern);
      const p = this.p, sd = 60 / p.bpm / 4;
      const total = order.reduce((a, pi) => a + p.patterns[pi].length * sd, 0) + 2.5;
      const off = new OfflineAudioContext(2, Math.ceil(SR * total), SR);
      const eng = new Engine(off, { realtime: false });
      eng.setProject(p);
      p.pads.forEach((_, i) => eng.setBuffer(i, this.engine.buffers[i]));
      if (this.engine.beat.on) eng.beat.setOn(true, 0);
      let time = 0.02;
      for (const pi of order) {
        const pat = p.patterns[pi];
        for (let s = 0; s < pat.length; s++) {
          playStep(eng, pat, s, time + swingOffset(s, p.swing, sd), sd);
          time += sd;
        }
      }
      const buf = await off.startRendering();
      const name = safeName(p.name) + (choice === 'song' ? '' : ' - pattern ' + PATTERN_NAMES[this.seq.pattern]) + '.wav';
      const where = await deliverFile(bufferToWav(buf), name);
      t.remove();
      toast(`WAV exportado (${fmtTime(buf.duration)}) para ${where}`, 'ok');
    } catch (e) {
      console.error(e);
      t.remove();
      toast('Falha ao exportar: ' + e.message, 'err');
    }
  }

  // ============================================================ DJ MIXER
  buildDjm() {
    const d = $('#djm');
    const fx = () => this.p.fx;
    const eq = h('div', { class: 'djm-sec' }, h('h4', {}, 'EQ'));
    const eqRow = h('div', { class: 'djm-row' });
    this.eqKnobs = {};
    for (const [band, label] of [['high', 'HI'], ['mid', 'MID'], ['low', 'LOW']]) {
      const k = knob({ label, min: -1, max: 1, value: 0, def: 0, bipolar: true, detent: true, format: (x) => (x < 0 ? (x * 30).toFixed(0) : '+' + (x * 6).toFixed(1)) + 'dB', onChange: (x) => { fx().eq[band] = x; this.engine.eq.set(band, x); this.markDirty(); } });
      this.eqKnobs[band] = k;
      eqRow.append(k.el);
    }
    eq.append(eqRow);

    const cfx = h('div', { class: 'djm-sec' }, h('h4', {}, 'COLOR FX'));
    const cbtns = h('div', { class: 'cfx-btns' });
    this.cfxBtns = COLOR_TYPES.map((t) => {
      const b = h('button', { onclick: () => { fx().color.type = t; this.engine.color.set(t, fx().color.v); this.syncDjm(); this.markDirty(); } }, t);
      cbtns.append(b);
      return b;
    });
    this.colorKnob = knob({ label: 'COLOR', min: -1, max: 1, value: 0, def: 0, bipolar: true, detent: true, big: true, color: '#19c3ff',
      format: (x) => (Math.abs(x) < 0.02 ? 'OFF' : (x < 0 ? '◀ ' : '') + Math.round(Math.abs(x) * 100) + (x > 0 ? ' ▶' : '')),
      onChange: (x) => { fx().color.v = x; this.engine.color.set(fx().color.type, x); } });
    cfx.append(h('div', { class: 'djm-row' }, cbtns, this.colorKnob.el));

    const bfx = h('div', { class: 'djm-sec' }, h('h4', {}, 'BEAT FX'));
    this.bfxName = h('div', { class: 'fxn' });
    this.bfxBeat = h('span');
    this.bfxBpm = h('span');
    const lcd = h('div', { class: 'bfx-lcd' }, this.bfxName, h('div', { class: 'fxs' }, this.bfxBeat, this.bfxBpm));
    const cycle = (arr, cur, dir) => arr[(arr.indexOf(cur) + dir + arr.length) % arr.length];
    const nav = h('div', { class: 'bfx-nav' },
      h('button', { title: 'Efeito anterior', onclick: () => this.setBeatType(cycle(BEAT_TYPES, fx().beat.type, -1)) }, 'FX◀'),
      h('button', { title: 'Próximo efeito', onclick: () => this.setBeatType(cycle(BEAT_TYPES, fx().beat.type, 1)) }, '▶FX'),
      h('button', { title: 'Batida menor', onclick: () => this.setBeatFrac(cycle(BEAT_FRACS, fx().beat.frac, -1)) }, '◀'),
      h('button', { title: 'Batida maior', onclick: () => this.setBeatFrac(cycle(BEAT_FRACS, fx().beat.frac, 1)) }, '▶'));
    this.levelKnob = knob({ label: 'LEVEL/DEPTH', min: 0, max: 1, value: 0.5, def: 0.5, color: '#19c3ff', format: (x) => Math.round(x * 100) + '%',
      onChange: (x) => { fx().beat.level = x; this.engine.beat.setLevel(x); this.markDirty(); } });
    this.onBtn = h('button', { class: 'bfx-on', title: 'Liga/desliga o Beat FX (segure para efeito momentâneo)' }, 'ON');
    let downAt = 0;
    this.onBtn.addEventListener('pointerdown', () => { downAt = performance.now(); this.setBeatOn(!this.engine.beat.on); });
    this.onBtn.addEventListener('pointerup', () => { if (performance.now() - downAt > 450 && this.engine.beat.on) this.setBeatOn(false); });
    bfx.append(h('div', { class: 'djm-row' }, h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, lcd, nav), this.levelKnob.el, this.onBtn));

    const mst = h('div', { class: 'djm-sec' }, h('h4', {}, 'MASTER'));
    this.masterKnob = knob({ label: 'MASTER', min: 0, max: 1, value: 0.85, def: 0.85, big: true, color: '#ff2d3d', format: (x) => (x ? (20 * Math.log10(x)).toFixed(1) + 'dB' : '-∞'),
      onChange: (x) => { fx().master = x; this.engine.master.gain.setTargetAtTime(x, this.ctx.currentTime, 0.01); this.engine.pushFx(); this.markDirty(); } });
    const vl = h('div', { class: 'meter' }, h('i')), vr = h('div', { class: 'meter' }, h('i'));
    this.vu = [vl.firstChild, vr.firstChild];
    mst.append(h('div', { class: 'djm-row' }, this.masterKnob.el, h('div', { class: 'vu' }, vl, vr)));

    const rec = h('div', { class: 'djm-sec' }, h('h4', {}, 'GRAVAR'),
      h('button', { class: 'btn small', onclick: () => this.toggleMixRecord() }, '● Mix ao vivo'),
      h('button', { class: 'btn small', onclick: () => this.exportWav() }, 'Exportar WAV'),
      h('button', { class: 'btn small', onclick: () => this.saveNow(true) }, 'Salvar'));
    d.append(eq, cfx, bfx, mst, rec);
  }

  setBeatType(t) { this.p.fx.beat.type = t; this.engine.beat.setType(t); this.syncDjm(); this.markDirty(); }
  setBeatFrac(f) { this.p.fx.beat.frac = f; this.engine.beat.setFrac(f); this.syncDjm(); this.markDirty(); }
  setBeatOn(on) {
    if (this.ctx.state !== 'running') this.ctx.resume();
    this.engine.beat.setOn(on);
    this.onBtn.classList.toggle('on', on);
  }

  syncDjm() {
    const fx = this.p.fx;
    this.engine.applyFx();
    for (const b of ['high', 'mid', 'low']) this.eqKnobs[b].set(fx.eq[b]);
    this.cfxBtns.forEach((b) => b.classList.toggle('on', b.textContent === fx.color.type));
    this.colorKnob.set(fx.color.v);
    this.bfxName.textContent = fx.beat.type;
    this.bfxBeat.textContent = 'BEAT ' + fracLabel(fx.beat.frac);
    this.bfxBpm.textContent = Math.round((60 / this.p.bpm) * fx.beat.frac * 1000) + 'ms';
    this.levelKnob.set(fx.beat.level);
    this.masterKnob.set(fx.master);
    this.onBtn.classList.toggle('on', this.engine.beat.on);
  }

  // ============================================================ salvar
  renderProjName() {
    $('#projName').textContent = this.p.name;
    const dot = $('#saveDot');
    dot.classList.toggle('dirty', this.dirty);
    dot.classList.toggle('cloud', !this.dirty && this.cloud.on && this.synced);
    dot.title = this.dirty ? 'Alterações não salvas' : this.cloud.on && this.synced ? 'Salvo e sincronizado na nuvem' : 'Salvo neste aparelho';
  }

  markDirty() {
    if (!this.restoring) {
      clearTimeout(this.histTimer);
      this.histTimer = setTimeout(() => this.commitHistory(), 400);
    }
    this.dirty = true;
    this.synced = false;
    this.renderProjName();
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 1500);
  }

  gcSamples(p) {
    const used = new Set(p.pads.filter((x) => x && x.src.kind === 'sample').map((x) => x.src.sampleId));
    // samples que o desfazer/refazer ainda pode trazer de volta também ficam
    if (p === this.p) {
      for (const snap of [...(this.undoStack || []), ...(this.redoStack || [])]) {
        for (const x of snap.pads) if (x && x.src.kind === 'sample') used.add(x.src.sampleId);
      }
    }
    for (const id of Object.keys(p.samples)) if (!used.has(id)) delete p.samples[id];
    return p;
  }

  async saveNow(manual = false) {
    clearTimeout(this.saveTimer);
    const p = this.gcSamples(this.p);
    p.updated = Date.now();
    try {
      await store.saveProject(this.user.id, p);
      await store.setMeta('last:' + this.user.id, p.id);
      this.dirty = false;
      this.renderProjName();
      if (manual) toast('Projeto salvo na sua pasta', 'ok');
      if (this.cloud.on) {
        clearTimeout(this.cloudTimer);
        this.cloudTimer = setTimeout(() => this.syncCloud(manual), manual ? 0 : 6000);
      }
    } catch (e) {
      console.error(e);
      toast('Não foi possível salvar: ' + (e.message || e), 'err');
    }
  }

  async syncCloud(manual) {
    try {
      await this.cloud.upload(this.p);
      this.synced = true;
      this.renderProjName();
      if (manual) toast('Sincronizado na nuvem ☁', 'ok');
    } catch (e) {
      console.warn(e);
      if (manual) toast('Salvo no aparelho. A nuvem será atualizada quando houver conexão.', 'err');
    }
  }
}

function safeName(s) {
  return String(s || 'WDQ Sampler').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80);
}
