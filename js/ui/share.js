// "Indicar para um amigo": manda o link do APK pelo WhatsApp, pelo menu de
// compartilhar do Android, copiando o link ou mostrando um QR code para o
// amigo apontar a câmera.
import { h, modal, toast } from './dom.js';
import { CONFIG } from '../config.js';
import qrcode from '../../vendor/qrcode.js';

export function shareMessage(name) {
  const by = name ? ` (indicado por ${name})` : '';
  return `Conheça o WDQ Sampler${by}: sampler no estilo MPC com efeitos de DJ e kits de Funk Rio, Rap, Trap, Rock e muito mais. ` +
    `Baixe grátis para Android: ${CONFIG.SHARE_URL}`;
}

function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n + 8} ${n + 8}" shape-rendering="crispEdges" role="img" aria-label="QR code do link de download"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* WebView sem permissão: cai no método antigo */ }
  const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
  ta.value = text;
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  return ok;
}

function openExternal(url) {
  if (window.WDQAndroid && window.WDQAndroid.openUrl) window.WDQAndroid.openUrl(url);
  else window.open(url, '_blank', 'noopener');
}

export function shareApp(user) {
  const msg = shareMessage(user && user.name);
  return modal((d, close) => {
    const native = async () => {
      if (window.WDQAndroid && window.WDQAndroid.shareText) { window.WDQAndroid.shareText('Indicar o WDQ Sampler', msg); return; }
      if (navigator.share) { try { await navigator.share({ title: 'WDQ Sampler', text: msg }); } catch (e) { /* cancelado */ } return; }
      if (await copy(msg)) toast('Mensagem copiada: é só colar para o seu amigo', 'ok');
    };
    const qr = h('div', { class: 'share-qr', html: qrSvg(CONFIG.SHARE_URL) });
    d.classList.add('share');
    d.append(
      h('h2', {}, 'Indicar para um amigo'),
      h('p', {}, 'Mande o link do WDQ Sampler. Seu amigo baixa, instala no Android e cria a conta dele.'),
      h('div', { class: 'share-acts' },
        h('button', { class: 'btn primary block share-wa', onclick: () => openExternal('https://wa.me/?text=' + encodeURIComponent(msg)) }, 'Enviar pelo WhatsApp'),
        h('button', { class: 'btn block', onclick: native }, 'Compartilhar…'),
        h('button', { class: 'btn block', onclick: async () => toast(await copy(CONFIG.SHARE_URL) ? 'Link copiado' : 'Não deu para copiar; segure o link abaixo', 'ok') }, 'Copiar link')),
      h('div', { class: 'share-qr-box' }, qr, h('span', {}, 'Juntos? Peça para o amigo apontar a câmera do celular para o código.')),
      h('div', { class: 'share-link' }, CONFIG.SHARE_URL),
      h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => close() }, 'Fechar')));
  }, { autofocus: false });
}
