// Avisos do administrador: ao abrir o app, quem tem conta na nuvem vê os
// avisos ativos que ainda não leu, um de cada vez. "Entendi" marca como lido
// no servidor (o painel mostra quantos já leram).
import { h, modal } from './ui/dom.js';

const LEVEL = { info: 'AVISO', novidade: 'NOVIDADE', alerta: 'IMPORTANTE' };

export async function showNotices(auth) {
  if (auth.mode !== 'cloud' || !auth.user) return;
  let list = [];
  try { ({ notices: list } = await auth.api.call('notices')); } catch (e) { return; } // sem internet: fica para a próxima
  for (const n of list) {
    await modal((d, close) => {
      d.classList.add('notice-dialog', 'lv-' + n.level);
      d.append(h('span', { class: 'notice-tag' }, LEVEL[n.level] || 'AVISO'), h('h2', {}, n.title),
        // texto puro (sem HTML), com as quebras de linha que o administrador escreveu
        h('div', { class: 'notice-body' }, ...n.body.split('\n').map((l) => h('p', {}, l))),
        h('div', { class: 'acts' }, h('button', { class: 'btn primary', onclick: () => close(true) }, 'Entendi')));
    }, { autofocus: false });
    auth.api.call('notice_read', { id: n.id }).catch(() => {});
  }
}
