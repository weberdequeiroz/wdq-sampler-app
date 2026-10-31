// Inicialização: abertura animada, login/cadastro, instalação (PWA) e avisos
// de atualização.
import { CONFIG } from './config.js';
import { Auth, passwordProblems, validateEmail } from './auth.js';
import { App } from './app.js';
import { renderSound } from './audio/voices.js';
import { makeIR } from './audio/fx.js';
import { $, $$, h, toast } from './ui/dom.js';

const auth = new Auth();
const authReady = auth.init();
let ctx = null;
let app = null;
let recovering = false;
let installEvt = null;
let swReg = null;
let updating = false;

auth.onChange((user, evt) => {
  if (evt === 'PASSWORD_RECOVERY') { recovering = true; if (!$('#splash')) showAuth('newpw'); }
  if (evt === 'SIGNED_OUT' && app) location.reload();
});

// ------------------------------------------------------------- abertura
const STING = [
  { at: 0, s: { t: 'impact', p: { f0: 120, f1: 32, dur: 2.2, noise: 0.25 } }, g: 0.8 },
  { at: 0, s: { t: 'stab', p: { notes: [48, 55, 60, 64, 67, 71], wave: 'sawtooth', attack: 0.35, decay: 2.4, sustain: 0.55, release: 1, cutoff: 500, env: 2400, fattack: 0.7, detune: 12, level: 0.7 } }, g: 0.45 },
  { at: 0.18, s: { t: 'bell', p: { note: 79, ratio: 2, index: 2, decay: 1.4 } }, g: 0.28 },
  { at: 0.36, s: { t: 'bell', p: { note: 83, ratio: 2, index: 2, decay: 1.4 } }, g: 0.24 },
  { at: 0.54, s: { t: 'bell', p: { note: 86, ratio: 2, index: 2, decay: 1.8 } }, g: 0.22 },
];
const stingBuffers = Promise.all(STING.map((x) => renderSound(x.s))).catch(() => null);

async function playSting() {
  try {
    const bufs = await stingBuffers;
    if (!bufs) return;
    const out = new GainNode(ctx, { gain: 0.75 });
    const rev = new ConvolverNode(ctx, { buffer: makeIR(ctx, 3.2, 2.4) });
    const rg = new GainNode(ctx, { gain: 0.3 });
    out.connect(ctx.destination);
    out.connect(rev).connect(rg).connect(ctx.destination);
    const t = ctx.currentTime + 0.03;
    STING.forEach((x, i) => {
      const src = new AudioBufferSourceNode(ctx, { buffer: bufs[i] });
      const g = new GainNode(ctx, { gain: x.g });
      src.connect(g).connect(out);
      src.start(t + x.at);
    });
  } catch (e) { /* a abertura segue mesmo sem som */ }
}

async function bootSplash() {
  $('#splashVer').innerHTML = '<b>DESENVOLVIDO POR WEBER DE QUEIROZ - WDQ BRASIL</b><br>VERSÃO ' + CONFIG.VERSION;
  try {
    const svg = await (await fetch('assets/logo-mark.svg')).text();
    $('#splashLogo').innerHTML = svg;
    // cada pad entra em sequência, de baixo para cima, como um equalizador
    $$('#splashLogo .wdq-pad').forEach((p) => {
      const c = Number(p.dataset.c), r = Number(p.dataset.r);
      p.style.animationDelay = `${0.7 + c * 0.08 + (3 - r) * 0.1}s` + (p.classList.contains('wdq-lit') ? `, ${3 + c * 0.15}s` : '');
    });
  } catch (e) {
    $('#splashLogo').append(h('img', { src: 'assets/logo-mark.svg', alt: '', style: { width: '100%' } }));
  }
  const go = async () => {
    const sp = $('#splash');
    if (!sp || sp.classList.contains('out')) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    ctx.resume();
    playSting();
    sp.classList.add('out');
    document.removeEventListener('keydown', onKey);
    await authReady;
    setTimeout(() => {
      sp.remove();
      if (auth.recovering) recovering = true;
      if (auth.user && !recovering) startApp();
      else showAuth(recovering ? 'newpw' : 'in');
    }, 850);
  };
  const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') go(); };
  $('#splash').addEventListener('click', go);
  document.addEventListener('keydown', onKey);
}

// ---------------------------------------------------------- login/cadastro
let authMode = 'in';
function showAuth(mode = 'in') {
  $('#app').hidden = true;
  $('#auth').hidden = false;
  setAuthMode(mode);
  if (auth.notice) { msg(auth.notice.m, auth.notice.k); auth.notice = null; }
  $('#authMode').innerHTML = auth.mode === 'cloud'
    ? '<b>☁ Conta WDQ.</b> Seu e-mail é confirmado por link e seus projetos ficam disponíveis em qualquer aparelho.'
    : '<b>🔒 Conta neste aparelho.</b> Sua conta e seus projetos ficam guardados só aqui, com a senha protegida por criptografia (PBKDF2). ' +
      'Seus projetos ficam neste aparelho.';
}

function setAuthMode(mode) {
  authMode = mode;
  const f = $('#authForm');
  $$('[data-auth]', f).forEach((b) => b.classList.toggle('on', b.dataset.auth === mode));
  $$('[data-only]', f).forEach((el) => (el.hidden = el.dataset.only !== mode));
  $$('[data-hide]', f).forEach((el) => (el.hidden = el.dataset.hide === mode));
  $('.auth-tabs', f).hidden = mode === 'forgot' || mode === 'newpw';
  $('#aForgot').hidden = mode !== 'in';
  $('#aBack').hidden = mode !== 'forgot';
  $('#aPass').autocomplete = mode === 'in' ? 'current-password' : 'new-password';
  $('#aPassLbl').textContent = mode === 'newpw' ? 'Nova senha' : 'Senha';
  $('#authSubmit').textContent = { in: 'Entrar', up: 'Criar minha conta', forgot: 'Enviar link de recuperação', newpw: 'Salvar nova senha' }[mode];
  msg('');
  setTimeout(() => (mode === 'up' ? $('#aName') : mode === 'newpw' ? $('#aPass') : $('#aEmail')).focus(), 50);
}

function msg(text, kind = 'err') {
  const m = $('#authMsg');
  m.textContent = text;
  m.className = 'auth-msg ' + (text ? kind : '');
}

function bindAuth() {
  if (CONFIG.PRIVACY_URL) $('#privacyLink').href = CONFIG.PRIVACY_URL;
  $$('[data-auth]').forEach((b) => (b.onclick = () => setAuthMode(b.dataset.auth)));
  $('#aForgot').onclick = () => setAuthMode('forgot');
  $('#aBack').onclick = () => setAuthMode('in');
  $('#aShow').onclick = () => {
    const p = $('#aPass'), show = p.type === 'password';
    p.type = show ? 'text' : 'password';
    $('#aPass2').type = p.type;
    $('#aShow').textContent = show ? 'ocultar' : 'mostrar';
  };
  $('#authForm').onsubmit = async (e) => {
    e.preventDefault();
    const email = $('#aEmail').value.trim(), pass = $('#aPass').value, btn = $('#authSubmit');
    if (authMode !== 'newpw' && !validateEmail(email)) { msg('Digite um e-mail válido.'); return; }
    if (authMode === 'up' || authMode === 'newpw') {
      const probs = passwordProblems(pass);
      if (probs.length) { msg('A senha precisa ' + probs.join(', ') + '.'); return; }
    }
    if (authMode === 'up' && pass !== $('#aPass2').value) { msg('As senhas não são iguais.'); return; }
    if (authMode === 'in' && !pass) { msg('Digite sua senha.'); return; }
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Aguarde…';
    try {
      if (authMode === 'in') {
        await auth.signIn(email, pass);
        startApp();
      } else if (authMode === 'up') {
        const r = await auth.signUp(email, pass, $('#aName').value.trim());
        if (r.confirm) {
          setAuthMode('in');
          msg(r.mailFailed
            ? 'Conta criada, mas o servidor não conseguiu enviar o e-mail de confirmação agora. Tente entrar daqui a pouco ou fale com o administrador.'
            : `Conta criada! Enviamos um link de confirmação para ${email} (veja também o spam). Confirme e depois entre aqui.`, 'ok');
        } else startApp();
      } else if (authMode === 'forgot') {
        await auth.resetPassword(email);
        msg('Se houver uma conta com esse e-mail, você receberá um link para criar uma nova senha.', 'ok');
      } else if (authMode === 'newpw') {
        await auth.updatePassword(pass);
        recovering = false;
        history.replaceState(null, '', location.pathname);
        toast('Senha alterada com sucesso', 'ok');
        startApp();
      }
    } catch (err) {
      msg(err.message || String(err));
    } finally {
      btn.disabled = false;
      if (btn.textContent === 'Aguarde…') btn.textContent = label;
    }
  };
}

async function startApp() {
  if (app || !auth.user) return;
  $('#auth').hidden = true;
  $('#app').hidden = false;
  $('#aPass').value = '';
  $('#aPass2').value = '';
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  app = new App(auth, ctx, {
    install: promptInstall,
    canInstall: () => !!installEvt,
    isStandalone,
    checkUpdate,
  });
  if (location.hostname === 'localhost') window.__wdq = app; // usado pelos testes automatizados
  try {
    await app.start();
    toast(`Bem-vindo, ${auth.user.name}!`, 'ok');
  } catch (e) {
    console.error(e);
    toast('Erro ao abrir o app: ' + e.message, 'err');
  }
  $('#btnInstall').hidden = !installEvt;
  checkUpdate(false);
  setInterval(() => checkUpdate(false), 6 * 60 * 60 * 1000);
  let lastCheck = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - lastCheck > 30 * 60 * 1000) { lastCheck = Date.now(); checkUpdate(false); }
  });
}

// ------------------------------------------------- instalar e atualizar
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true || !!window.WDQAndroid;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvt = e;
  const b = $('#btnInstall');
  if (b) b.hidden = false;
});
window.addEventListener('appinstalled', () => {
  installEvt = null;
  $('#btnInstall').hidden = true;
  toast('WDQ Sampler instalado! Abra pelo ícone na tela inicial.', 'ok');
});

async function promptInstall() {
  if (!installEvt) {
    toast('No iPhone/iPad: toque em Compartilhar → "Adicionar à Tela de Início". No Android, use o APK ou o menu ⋮ → "Instalar app".');
    return;
  }
  installEvt.prompt();
  await installEvt.userChoice;
  installEvt = null;
  $('#btnInstall').hidden = true;
}

function updateBar(text, actionLabel, action) {
  if ($('.update-bar.upd')) return;
  const bar = h('div', { class: 'update-bar upd', role: 'status' },
    h('span', {}, '✨ ' + text),
    h('button', { class: 'btn small primary', onclick: () => { bar.remove(); action(); } }, actionLabel),
    h('button', { class: 'btn small', onclick: () => bar.remove() }, 'Depois'));
  document.body.append(bar);
}

function onWaitingWorker(worker) {
  updateBar('Nova versão do WDQ Sampler disponível.', 'Atualizar agora', async () => {
    if (app && app.dirty) await app.saveNow();
    updating = true;
    worker.postMessage({ type: 'SKIP_WAITING' });
  });
}

async function registerSW() {
  if (!('serviceWorker' in navigator) || window.WDQAndroid) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  try {
    swReg = await navigator.serviceWorker.register('sw.js');
    if (swReg.waiting && navigator.serviceWorker.controller) onWaitingWorker(swReg.waiting);
    swReg.addEventListener('updatefound', () => {
      const w = swReg.installing;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) onWaitingWorker(w);
      });
    });
    // só recarrega quando o próprio usuário pediu a atualização (na primeira
    // instalação o worker assume a página sem precisar recarregar)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!updating) return;
      updating = false;
      location.reload();
    });
    setInterval(() => swReg.update().catch(() => {}), 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) swReg.update().catch(() => {}); });
  } catch (e) {
    console.warn('Service worker indisponível', e);
  }
}

const newer = (a, b) => {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
  return false;
};

async function checkUpdate(manual) {
  let found = false;
  if (swReg) {
    try { await swReg.update(); found = !!swReg.waiting; } catch (e) { /* offline */ }
  }
  if (CONFIG.UPDATE_URL) {
    try {
      const info = await fetchUpdateInfo();
      const A = window.WDQAndroid;
      if (A && A.versionCode && A.installUpdate && info.apk && info.build > A.versionCode()) {
        found = true;
        offerApkUpdate(info, manual);
      } else if (!A && info.version && newer(info.version, CONFIG.VERSION) && info.web) {
        found = true;
        updateBar(`Versão ${info.version} disponível`, 'Abrir', () => window.open(info.web, '_blank', 'noopener'));
      }
    } catch (e) {
      if (manual) toast('Não foi possível verificar agora (sem internet?).', 'err');
      return;
    }
  }
  if (manual && !found) toast('Você já está com a versão mais recente (' + CONFIG.VERSION + ').', 'ok');
}

// Aceita a resposta da API de releases do GitHub ou um version.json próprio.
async function fetchUpdateInfo() {
  const u = CONFIG.UPDATE_URL;
  const r = await fetch(u + (u.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  if (d.tag_name) {
    const apk = (d.assets || []).find((a) => /\.apk$/i.test(a.name));
    return {
      build: Number((d.tag_name.match(/(\d+)$/) || [])[1] || 0),
      version: d.name || d.tag_name,
      apk: apk && apk.browser_download_url,
      notes: (d.body || '').split('\n')[0],
    };
  }
  return { build: Number(d.build || 0), version: d.version, apk: d.apk, web: d.web, notes: d.notes };
}

// Atualização do APK dentro do app: baixa com barra de progresso e abre o
// instalador do Android (que pede um toque de confirmação, regra do sistema).
function offerApkUpdate(info, now) {
  if ($('.update-bar.upd')) return;
  const start = async () => {
    if (app && app.dirty) await app.saveNow();
    const bar = h('div', { class: 'update-bar upd', role: 'status' });
    const txt = h('span', {}, 'Baixando a atualização… 0%');
    const prog = h('div', { class: 'rec-meter' }, h('i'));
    bar.append(txt, prog);
    document.body.append(bar);
    window.__wdqUpdateProgress = (p) => {
      if (p < 0) {
        txt.textContent = 'O download falhou. Verifique a internet e tente de novo em Ajustes.';
        setTimeout(() => bar.remove(), 6000);
      } else if (p >= 100) {
        prog.firstChild.style.width = '100%';
        txt.textContent = 'Pronto! Toque em "Instalar" na tela do Android.';
        setTimeout(() => bar.remove(), 8000);
      } else {
        prog.firstChild.style.width = p + '%';
        txt.textContent = `Baixando a atualização… ${p}%`;
      }
    };
    window.WDQAndroid.installUpdate(info.apk);
  };
  if (now) { start(); return; }
  updateBar(`Nova versão do WDQ Sampler (build ${info.build})${info.notes ? ' — ' + info.notes.slice(0, 80) : ''}`, 'Atualizar agora', start);
}

// ----------------------------------------------------------------- start
bindAuth();
bootSplash();
registerSW();
