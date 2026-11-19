// Pequenos utilitários de DOM, avisos (toasts) e diálogos.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function toast(msg, kind = '', action) {
  const box = $('#toasts');
  const t = h('div', { class: 'toast ' + kind }, h('span', {}, msg));
  if (action) t.append(h('button', { onclick: () => { action.fn(); t.remove(); } }, action.label));
  box.append(t);
  setTimeout(() => t.remove(), action ? 9000 : 3200);
  return t;
}

export function modal(build, opts = {}) {
  const m = $('#modal');
  return new Promise((resolve) => {
    const close = (v) => { m.hidden = true; m.innerHTML = ''; document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
    m.innerHTML = '';
    const d = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' });
    build(d, close);
    m.append(d);
    m.hidden = false;
    m.onclick = (e) => { if (e.target === m) close(null); };
    document.addEventListener('keydown', onKey, true);
    const f = opts.autofocus === false ? null : d.querySelector('input, select, button.primary');
    if (f) setTimeout(() => f.focus(), 30);
  });
}

export function confirmDialog(title, text, ok = 'Confirmar', danger = false) {
  return modal((d, close) => {
    d.append(h('h2', {}, title), h('p', {}, text),
      h('div', { class: 'acts' },
        h('button', { class: 'btn', onclick: () => close(false) }, 'Cancelar'),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => close(true) }, ok)));
  });
}

export function promptDialog(title, value = '', label = '', ok = 'Salvar') {
  return modal((d, close) => {
    const inp = h('input', { class: 'input', value, style: { width: '100%' }, maxlength: 80 });
    const form = h('form', { onsubmit: (e) => { e.preventDefault(); close(inp.value.trim() || null); } },
      h('h2', {}, title), label ? h('p', {}, label) : null, inp,
      h('div', { class: 'acts' },
        h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancelar'),
        h('button', { class: 'btn primary', type: 'submit' }, ok)));
    d.append(form);
    setTimeout(() => inp.select(), 40);
  });
}

export function choiceDialog(title, text, choices) {
  return modal((d, close) => {
    d.append(h('h2', {}, title), text ? h('p', {}, text) : null,
      h('div', { class: 'acts', style: { justifyContent: 'stretch', flexDirection: 'column' } },
        ...choices.map((c) => h('button', { class: 'btn ' + (c.primary ? 'primary' : ''), onclick: () => close(c.value) }, c.label)),
        h('button', { class: 'btn', onclick: () => close(null) }, 'Cancelar')));
  });
}

export const fmtTime = (s) => {
  s = Math.max(0, Math.round(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};
export const fmtDate = (t) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
