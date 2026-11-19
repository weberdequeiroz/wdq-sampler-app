// Piano roll: edita as notas de UM pad no pattern atual com altura (semitons
// em relação ao som original) e duração (em passos). Toque num espaço vazio
// para criar a nota e arraste para o lado para esticar; toque numa nota para
// apagar ou arraste para mudar a duração. Usa as camadas tun/len do pattern,
// que o sequenciador toca (sequencer.js → playStep).
import { h, toast } from './ui/dom.js';
import { padLabel, PATTERN_NAMES } from './project.js';

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK = new Set([1, 3, 6, 8, 10]);
const ROWS = 25; // duas oitavas e a nota de cima
const LENS = [[0, 'Inteira'], [1, '1/16'], [2, '1/8'], [4, '1/4'], [8, '1/2'], [16, '1 compasso']];
const noteName = (t) => NOTES[((t % 12) + 12) % 12] + (4 + Math.floor(t / 12)) + (t ? ` (${t > 0 ? '+' : ''}${t})` : ' (original)');

function row(pat, map, pad) {
  if (!pat[map]) pat[map] = {};
  return pat[map][pad] || (pat[map][pad] = new Array(64).fill(0));
}

export function viewRoll(app, v) {
  const pat = app.pat;
  let pad = app.sel;
  if (app.rollBase == null) app.rollBase = -12;
  if (app.rollLen == null) app.rollLen = 1;
  if (app.rollVel == null) app.rollVel = 100;
  const top = app.rollBase + ROWS - 1;

  const padSel = h('select', { class: 'input', 'aria-label': 'Pad' },
    ...app.p.pads.map((p, i) => (p ? h('option', { value: i, selected: i === pad }, `${padLabel(i)} · ${p.name}`) : null)));
  padSel.onchange = () => { app.sel = Number(padSel.value); app.renderPads(); app.renderPadInfo(); app.renderView(); };
  const lenSel = h('select', { class: 'input', 'aria-label': 'Duração das notas novas' },
    ...LENS.map(([n, t]) => h('option', { value: n, selected: n === app.rollLen }, t)));
  lenSel.onchange = () => { app.rollLen = Number(lenSel.value); };
  const vel = h('input', { type: 'range', min: 20, max: 127, step: 1, value: app.rollVel, 'aria-label': 'Força das notas novas', style: { width: '90px' } });
  vel.oninput = () => { app.rollVel = Number(vel.value); };
  const oct = (d) => () => { app.rollBase = Math.max(-24, Math.min(0, app.rollBase + d)); app.renderView(); };

  v.append(h('div', { class: 'toolbar' },
    h('span', { class: 'pill on' }, 'PIANO ROLL · PATTERN ' + PATTERN_NAMES[app.seq.pattern]), padSel,
    h('label', { class: 'inline' }, 'Duração', lenSel),
    h('label', { class: 'inline' }, 'Força', vel),
    h('button', { class: 'btn small', onclick: oct(-12), disabled: app.rollBase <= -24 }, 'Oitava ▼'),
    h('button', { class: 'btn small', onclick: oct(12), disabled: app.rollBase >= 0 }, 'Oitava ▲'),
    h('span', { class: 'sep' }),
    h('button', { class: 'btn small danger', onclick: () => {
      for (const m of ['steps', 'rat', 'tun', 'len']) if (pat[m]) delete pat[m][pad];
      app.markDirty(); app.renderPatternBtns(); app.renderView();
    } }, 'Limpar notas do pad'),
    h('button', { class: 'btn small', onclick: () => app.go('seq', true) }, 'Voltar à sequência')));

  if (!app.p.pads[pad]) {
    v.append(h('div', { class: 'empty' }, 'Este pad está vazio. Escolha um pad com som acima.'));
    return;
  }
  v.append(h('p', { class: 'roll-hint' }, 'Toque num espaço para criar a nota e arraste para o lado para esticar. Toque numa nota para apagar ou arraste para mudar a duração. Cada passo guarda uma nota por pad.'));

  const keys = h('div', { class: 'roll-keys' });
  const grid = h('div', { class: 'roll-grid', style: { '--cols': pat.length, '--rows': ROWS } });
  for (let r = 0; r < ROWS; r++) {
    const t = top - r;
    const black = BLACK.has(((t % 12) + 12) % 12);
    keys.append(h('button', {
      class: 'roll-key' + (black ? ' black' : '') + (t === 0 ? ' root' : ''), title: noteName(t),
      onclick: () => app.engine.trigger(pad, app.rollVel, app.ctx.currentTime, { tune: t }),
    }, NOTES[((t % 12) + 12) % 12] + (((t % 12) + 12) % 12 === 0 ? 4 + Math.floor(t / 12) : '')));
    grid.append(h('div', { class: 'roll-row' + (black ? ' black' : '') + (t === 0 ? ' root' : ''), style: { top: `calc(${r} * var(--rh))` } }));
  }
  const ph = h('div', { class: 'roll-ph' });
  grid.append(ph);

  const draw = () => {
    grid.querySelectorAll('.rn').forEach((n) => n.remove());
    const st = pat.steps[pad];
    if (!st) return;
    for (let s = 0; s < pat.length; s++) {
      if (!st[s]) continue;
      const t = (pat.tun && pat.tun[pad] && pat.tun[pad][s]) || 0;
      const len = (pat.len && pat.len[pad] && pat.len[pad][s]) || 0;
      if (t > top || t < app.rollBase) {
        grid.append(h('div', { class: 'rn out', style: { left: `calc(${s} * var(--cw))`, top: t > top ? '0' : `calc(${ROWS - 1} * var(--rh))` }, title: 'Nota fora da oitava visível: ' + noteName(t) }));
        continue;
      }
      grid.append(h('div', {
        class: 'rn' + (len ? '' : ' full'), 'data-s': s,
        style: { left: `calc(${s} * var(--cw))`, top: `calc(${top - t} * var(--rh))`, width: `calc(${Math.min(len || 1, pat.length - s)} * var(--cw) - 2px)`, opacity: 0.45 + (st[s] / 127) * 0.55, background: app.p.pads[pad].color },
        title: `${noteName(t)} · ${len ? len + ' passo(s)' : 'som inteiro'} · força ${st[s]}`,
      }));
    }
  };
  draw();

  const cell = (e) => {
    const r = grid.getBoundingClientRect();
    const cw = r.width / pat.length, rh = r.height / ROWS;
    return { s: Math.max(0, Math.min(pat.length - 1, Math.floor((e.clientX - r.left) / cw))), t: top - Math.max(0, Math.min(ROWS - 1, Math.floor((e.clientY - r.top) / rh))) };
  };
  let drag = null;
  grid.addEventListener('pointerdown', (e) => {
    if (app.ctx.state !== 'running') app.ctx.resume();
    e.preventDefault();
    grid.setPointerCapture(e.pointerId);
    const c = cell(e);
    const note = e.target.closest('.rn:not(.out)');
    if (note) {
      drag = { s: Number(note.dataset.s), moved: false, existing: true };
      return;
    }
    // nota nova (um passo guarda uma nota por pad: substitui a que houver ali)
    row(pat, 'steps', pad)[c.s] = app.rollVel;
    row(pat, 'tun', pad)[c.s] = c.t;
    row(pat, 'len', pad)[c.s] = app.rollLen;
    if (pat.rat[pad]) pat.rat[pad][c.s] = 0;
    drag = { s: c.s, moved: false, existing: false };
    app.engine.trigger(pad, app.rollVel, app.ctx.currentTime, { tune: c.t, gate: app.rollLen ? app.rollLen * app.seq.stepDur : 0 });
    draw();
    app.markDirty();
    app.renderPatternBtns();
  });
  grid.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const c = cell(e);
    const len = c.s - drag.s + 1;
    if (len < 1 || (!drag.moved && len === 1)) return;
    drag.moved = true;
    row(pat, 'len', pad)[drag.s] = Math.min(len, 64);
    draw();
  });
  const end = () => {
    if (!drag) return;
    if (drag.existing && !drag.moved) {
      for (const m of ['steps', 'rat', 'tun', 'len']) if (pat[m] && pat[m][pad]) pat[m][pad][drag.s] = 0;
      if (!pat.steps[pad].some((x) => x)) for (const m of ['steps', 'rat', 'tun', 'len']) if (pat[m]) delete pat[m][pad];
      draw();
      app.renderPatternBtns();
    }
    if (drag.moved || drag.existing) app.markDirty();
    drag = null;
  };
  grid.addEventListener('pointerup', end);
  grid.addEventListener('pointercancel', end);

  v.append(h('div', { class: 'roll-wrap' }, keys, h('div', { class: 'roll-scroll' }, grid)));
  app.roll = {
    playhead(s) {
      if (s < 0) { ph.style.display = 'none'; return; }
      ph.style.display = 'block';
      ph.style.left = `calc(${s % pat.length} * var(--cw))`;
    },
  };
  if (!app.rollTip) app.rollTip = toast('Dica: escolha um som melódico (baixo 808, stab, sintetizador) para fazer melodias.');
}
