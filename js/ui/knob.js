// Knob giratório: arrastar para cima/baixo (Shift = ajuste fino), roda do mouse,
// toque duplo volta ao valor padrão. Bipolar desenha o arco a partir do centro.
const A0 = -135, A1 = 135;
const rad = (d) => ((d - 90) * Math.PI) / 180;
function arc(r, a, b) {
  const [s, e] = a <= b ? [a, b] : [b, a];
  const x1 = 30 + r * Math.cos(rad(s)), y1 = 30 + r * Math.sin(rad(s));
  const x2 = 30 + r * Math.cos(rad(e)), y2 = 30 + r * Math.sin(rad(e));
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${e - s > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export function knob({ label, min = 0, max = 1, value = 0, def = value, step = 0, bipolar = false, big = false, color, format, onChange, detent = false }) {
  const el = document.createElement('div');
  el.className = 'knob' + (big ? ' big' : '');
  if (color) el.style.setProperty('--kc', color);
  el.innerHTML = `<svg viewBox="0 0 60 60" aria-hidden="true">
    <path class="track" d="${arc(26, A0, A1)}" fill="none" stroke-width="4" stroke-linecap="round"/>
    <path class="val" fill="none" stroke-width="4" stroke-linecap="round"/>
    <circle class="cap" cx="30" cy="30" r="19"/>
    <line class="ptr" x1="30" y1="30" x2="30" y2="14" stroke-width="3" stroke-linecap="round"/>
  </svg><div class="kv"></div><div class="kl">${label}</div>`;
  el.tabIndex = 0;
  el.setAttribute('role', 'slider');
  el.setAttribute('aria-label', label);
  const valPath = el.querySelector('.val'), ptr = el.querySelector('.ptr'), kv = el.querySelector('.kv');
  let v = value;

  const norm = (x) => (x - min) / (max - min);
  function draw() {
    const a = A0 + norm(v) * (A1 - A0);
    const from = bipolar ? 0 : A0;
    valPath.setAttribute('d', Math.abs(a - from) < 0.5 ? '' : arc(26, from, a));
    ptr.setAttribute('transform', `rotate(${a} 30 30)`);
    kv.textContent = format ? format(v) : (Math.round(v * 100) / 100).toString();
    el.setAttribute('aria-valuenow', String(v));
  }
  function set(x, emit = true) {
    x = Math.max(min, Math.min(max, x));
    if (step) x = Math.round(x / step) * step;
    if (detent && bipolar && Math.abs(x - (min + max) / 2) < (max - min) * 0.025) x = (min + max) / 2;
    if (x === v) return;
    v = x;
    draw();
    if (emit && onChange) onChange(v);
  }

  let startY = 0, startV = 0, lastTap = 0;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const now = performance.now();
    if (now - lastTap < 300) { set(def); lastTap = 0; return; }
    lastTap = now;
    el.setPointerCapture(e.pointerId);
    startY = e.clientY;
    startV = v;
    el.focus({ preventScroll: true });
  });
  el.addEventListener('pointermove', (e) => {
    if (!el.hasPointerCapture(e.pointerId)) return;
    const range = max - min, k = e.shiftKey ? 600 : 160;
    set(startV + ((startY - e.clientY) / k) * range);
  });
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    set(v - Math.sign(e.deltaY) * (step || (max - min) / 100));
  }, { passive: false });
  el.addEventListener('keydown', (e) => {
    const d = step || (max - min) / 50;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { set(v + d); e.preventDefault(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { set(v - d); e.preventDefault(); }
  });
  draw();
  return { el, set: (x) => set(x, false), get value() { return v; } };
}
