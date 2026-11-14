// Tutorial guiado do primeiro acesso: destaca cada parte do app e explica
// para que serve. Pode ser revisto em Ajustes → "Ver tutorial".
import { h } from './dom.js';

const COMPACT = '(max-width: 900px), (orientation: landscape) and (max-height: 560px)';

const STEPS = [
  { title: 'Bem-vindo ao WDQ Sampler', text: 'Um sampler no estilo das MPC com o mixer de efeitos dos DJs. Em 1 minuto você conhece tudo. Já deixamos um beat de Funk Rio carregado para você testar.' },
  { sel: '#pads', m: 'pads', title: 'Pads', text: 'Toque nos pads para tocar os sons. Quanto mais perto do topo do pad, mais forte a batida. Segure um pad por 2 segundos para abrir o menu dele: renomear, cor, trocar som, volume, afinação e mais. As cores mostram o tipo de som: vermelho kick, laranja 808, amarelo caixa e palma, verde chimbal, azul percussão e instrumentos, roxo vocais, rosa efeitos.' },
  { sel: '#banks', m: 'pads', title: 'Bancos A, B, C e D', text: 'São 4 bancos de 16 pads: 64 sons por projeto. No banco B já vem o kit de efeitos de DJ (airhorn, sirene, scratch).' },
  { sel: '.pz-modes', m: 'pads', title: 'Modos de performance', text: 'PAD MUTE: tocar num pad liga/desliga o mute dele. ERASE: tocar num pad apaga as notas dele no pattern. FULL LEVEL toca sempre no volume máximo. 16 LEVELS espalha o pad escolhido em 16 intensidades ou 16 afinações. NOTE REPEAT repete a nota no ritmo enquanto você segura (escolha 1/8, 1/16, 1/32…).' },
  { sel: '.transport', title: 'Transporte da MPC', text: 'REC grava substituindo o pattern na primeira volta e depois vira overdub; DUB (overdub) grava somando ao que já existe. STOP para (aperte duas vezes para voltar ao início), PLAY continua de onde parou e START toca do início. No computador: Espaço toca/para e Enter grava em overdub.' },
  { sel: '.lcd', title: 'Display', text: 'Mostra BPM, posição e pattern. Arraste o BPM para cima/baixo ou toque duas vezes para digitar. O botão TAP acerta o andamento no toque.' },
  { sel: '#patBtns', title: 'Patterns A a H', text: 'Cada projeto tem 8 patterns. Trocar de pattern enquanto toca espera o fim do compasso, como numa MPC. Segure um pattern (ou um banco) por 2 segundos para renomear, copiar, duplicar e mais. O botão SONG encadeia patterns para montar a música.' },
  { sel: '#browser', m: 'browser', title: 'Biblioteca de sons e bases', text: 'Kits separados por estilo: Funk Rio, Funk 150, Brega Funk, Rap, Trap, Rock, House, Samba, Piseiro e mais. Use ▶ para ouvir a prévia, "Kit + bases" para carregar tudo e a aba SONS para colocar um som no pad selecionado.' },
  { sel: '.screen', m: 'screen', view: 'seq', title: 'Sequência', text: 'Toque nos quadradinhos para ligar os passos e arraste para pintar vários. Acento deixa mais forte, Suave mais fraco e Ratchet repete a nota 2, 3 ou 4 vezes no mesmo passo.' },
  { sel: '#tabs button[data-view="pad"]', msel: '#btnEditPad', mm: 'pads', view: 'pad', m: 'screen', title: 'Editar pad', text: 'Ajuste afinação, volume, filtro e o início/fim do som. Importe seus áudios, grave pelo microfone, faça Resample ou fatie um sample em 16 pads (Chop).' },
  { sel: '#djm', m: 'fx', title: 'Mixer de DJ', text: 'EQ de 3 bandas, COLOR FX (filtro, space, crush, noise) num knob só e BEAT FX sincronizado ao BPM: escolha o efeito, a batida e aperte ON. Segure o ON para efeito momentâneo.' },
  { sel: '#tabs button[data-view="folder"]', msel: '#mnav button[data-v="folder"]', mm: 'pads', view: 'folder', m: 'screen', title: 'Minha Pasta', text: 'Tudo é salvo automaticamente. Aqui você cria e abre projetos, exporta a música em WAV, grava sua mixagem ao vivo e faz backup em arquivo .wdq.' },
  { title: 'Tudo pronto!', text: 'Aperte ▶ e comece a criar. Você pode rever este tutorial quando quiser em Ajustes.' },
];

export function startTour(app, onDone) {
  let i = 0;
  const mobile = () => matchMedia(COMPACT).matches;
  const shade = h('div', { class: 'tour-shade' });
  const ring = h('div', { class: 'tour-ring' });
  const title = h('h3'), text = h('p'), count = h('span', { class: 'tour-count' });
  const back = h('button', { class: 'btn small' }, 'Voltar');
  const next = h('button', { class: 'btn small primary' }, 'Próximo');
  const skip = h('button', { class: 'tour-skip' }, 'Pular tutorial');
  const card = h('div', { class: 'tour-card', role: 'dialog', 'aria-live': 'polite' },
    count, title, text, h('div', { class: 'tour-acts' }, skip, h('span', { class: 'spacer' }), back, next));
  document.body.append(shade, ring, card);

  const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

  function show() {
    const s = STEPS[i];
    const sel = mobile() && s.msel ? s.msel : s.sel;
    const m = mobile() && s.mm ? s.mm : s.m;
    if (m && mobile()) $app().dataset.m = m;
    if (s.view) app.go(s.view, true);
    if (mobile()) app.renderMnav();
    const el = sel ? document.querySelector(sel) : null;
    if (sel && !visible(el)) { i += i < STEPS.length - 1 ? 1 : 0; return show(); }
    title.textContent = s.title;
    text.textContent = s.text;
    count.textContent = `${i + 1} de ${STEPS.length}`;
    back.hidden = i === 0;
    next.textContent = i === STEPS.length - 1 ? 'Começar' : 'Próximo';
    if (el) {
      const r = el.getBoundingClientRect(), pad = 6;
      Object.assign(ring.style, { display: 'block', left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
      shade.style.background = 'transparent';
      placeCard(r);
    } else {
      ring.style.display = 'none';
      shade.style.background = 'rgba(0,0,0,.7)';
      Object.assign(card.style, { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' });
    }
    next.focus({ preventScroll: true });
  }

  function placeCard(r) {
    card.style.transform = 'none';
    const cw = Math.min(340, innerWidth - 24), ch = card.offsetHeight || 200, m = 12;
    let left, top;
    if (innerHeight - r.bottom > ch + m * 2) { top = r.bottom + m; left = r.left; }
    else if (r.top > ch + m * 2) { top = r.top - ch - m; left = r.left; }
    else if (innerWidth - r.right > cw + m * 2) { left = r.right + m; top = r.top; }
    else if (r.left > cw + m * 2) { left = r.left - cw - m; top = r.top; }
    else { left = (innerWidth - cw) / 2; top = innerHeight - ch - m - 70; }
    left = Math.max(m, Math.min(left, innerWidth - cw - m));
    top = Math.max(m, Math.min(top, innerHeight - ch - m));
    Object.assign(card.style, { left: left + 'px', top: top + 'px', width: cw + 'px' });
  }

  function end() {
    shade.remove(); ring.remove(); card.remove();
    removeEventListener('resize', show);
    document.removeEventListener('keydown', onKey, true);
    if (mobile()) { $app().dataset.m = 'pads'; app.renderMnav(); }
    app.go('seq', true);
    onDone && onDone();
  }
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); end(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); go(-1); }
    else e.stopPropagation();
  };
  function go(d) {
    if (d > 0 && i === STEPS.length - 1) { end(); return; }
    i = Math.max(0, i + d);
    // ao voltar, pula passos cujo alvo não está visível nesta tela
    while (d < 0 && i > 0 && STEPS[i].sel && !STEPS[i].m && !visible(document.querySelector(STEPS[i].sel))) i--;
    show();
  }
  next.onclick = () => go(1);
  back.onclick = () => go(-1);
  skip.onclick = end;
  addEventListener('resize', show);
  document.addEventListener('keydown', onKey, true);
  show();
}

const $app = () => document.getElementById('app');
