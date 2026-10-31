// Painel do administrador: contas, projetos de todos os usuários e ações de
// moderação. Só aparece para quem o servidor diz que é admin, e o servidor
// confere de novo a cada chamada (server/api.php): um usuário comum que
// abrisse esta tela não receberia dados de ninguém.
import { h, toast, confirmDialog, promptDialog, modal, fmtDate } from './ui/dom.js';
import { deliverFile } from './wav.js';

const DAY = 864e5;
const fmtBytes = (n) => (!n ? '0 KB' : n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1).replace('.', ',') + ' MB');
const fmtMin = (sec) => {
  if (sec > 0 && sec < 60) return 'menos de 1 min';
  const m = Math.round((sec || 0) / 60);
  return m < 60 ? m + ' min' : Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + String(m % 60).padStart(2, '0') + 'min' : '');
};
const fmtN = (n) => (n || 0).toLocaleString('pt-BR');

// Últimos 30 dias (UTC), do mais antigo ao de hoje, preenchendo os dias sem uso.
function last30(rows, key) {
  const map = new Map(rows.map((r) => [r.day, r[key] || 0]));
  const out = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
    out.push({ day: d, v: map.get(d) || 0 });
  }
  return out;
}

// peak: mostra o maior dia em vez da soma (pessoas por dia não se somam)
function bars(title, data, fmt = fmtN, peak = false) {
  const max = Math.max(1, ...data.map((d) => d.v));
  const total = data.reduce((a, d) => a + d.v, 0);
  return h('div', { class: 'card adm-chart' },
    h('h3', {}, title),
    h('div', { class: 'adm-chart-total' }, peak ? fmtN(Math.max(0, ...data.map((d) => d.v))) : fmt(total), h('span', {}, peak ? ' no dia de pico' : ' em 30 dias')),
    h('div', { class: 'adm-bars' }, ...data.map((d) => h('i', {
      style: { height: Math.max(d.v ? 6 : 2, (d.v / max) * 100) + '%' },
      class: d.v ? '' : 'zero',
      title: `${d.day.slice(8, 10)}/${d.day.slice(5, 7)}: ${fmt(d.v)}`,
    }))),
    h('div', { class: 'adm-axis' }, h('span', {}, '30 dias atrás'), h('span', {}, 'hoje')));
}

const ago = (t) => {
  if (!t) return 'nunca';
  const d = Date.now() - t;
  if (d < 36e5) return 'agora há pouco';
  if (d < DAY) return 'hoje';
  if (d < 2 * DAY) return 'ontem';
  return Math.floor(d / DAY) + ' dias atrás';
};

export class AdminPanel {
  constructor(app) {
    this.app = app;
    this.tab = 'users';
    this.query = '';
    this.filter = 'all';
    this.sort = 'created';
    this.users = [];
    this.projects = [];
  }

  get api() { return this.app.auth.api; }

  async render(v) {
    if (!this.app.auth.isAdmin) {
      v.append(h('div', { class: 'empty' }, 'Acesso restrito ao administrador.'));
      return;
    }
    this.v = v;
    v.append(h('div', { class: 'empty' }, 'Carregando contas…'));
    try {
      await this.load();
    } catch (e) {
      console.error(e);
      v.innerHTML = '';
      v.append(h('div', { class: 'empty' }, 'Não foi possível carregar os dados: ' + (e.message || e)));
      return;
    }
    if (this.app.view !== 'admin') return;
    this.draw();
  }

  async load() {
    const [u, p, g] = await Promise.all([this.api.call('admin_users'), this.api.call('admin_projects'), this.api.call('admin_usage')]);
    this.daily = g.days;
    this.signups = g.signups;
    this.projects = p.projects.map((r) => ({ ...r, updated: new Date(r.updated_at).getTime(), created: new Date(r.created_at).getTime() }));
    this.users = u.users.map((r) => ({
      ...r, created: new Date(r.created_at).getTime(), seen: r.last_seen ? new Date(r.last_seen).getTime() : 0,
      nProjects: r.n_projects, size: r.bytes,
    }));
    this.userById = new Map(this.users.map((x) => [x.id, x]));
  }

  draw() {
    const v = this.v;
    v.innerHTML = '';
    const now = Date.now(), U = this.users;
    const stat = (n, label) => h('div', { class: 'adm-stat' }, h('b', {}, String(n)), h('span', {}, label));
    v.append(
      h('div', { class: 'toolbar' },
        h('b', { class: 'adm-title' }, 'PAINEL DO ADMINISTRADOR'),
        h('span', { class: 'spacer', style: { flex: 1 } }),
        h('button', { class: 'btn small', onclick: () => { this.v.innerHTML = ''; this.render(this.v); } }, 'Atualizar')),
      h('div', { class: 'adm-stats' },
        stat(U.length, 'contas'),
        stat(U.filter((x) => now - x.created < 7 * DAY).length, 'novas em 7 dias'),
        stat(U.filter((x) => now - x.seen < 7 * DAY).length, 'ativas em 7 dias'),
        stat(U.filter((x) => x.blocked).length, 'bloqueadas'),
        stat(this.projects.length, 'projetos'),
        stat(fmtBytes(this.projects.reduce((a, p) => a + (p.size || 0), 0)), 'na nuvem')),
      h('div', { class: 'seg adm-tabs' },
        h('button', { class: this.tab === 'users' ? 'on' : '', onclick: () => { this.tab = 'users'; this.draw(); } }, 'CONTAS'),
        h('button', { class: this.tab === 'usage' ? 'on' : '', onclick: () => { this.tab = 'usage'; this.draw(); } }, 'USO'),
        h('button', { class: this.tab === 'projects' ? 'on' : '', onclick: () => { this.tab = 'projects'; this.draw(); } }, 'PROJETOS')));
    if (this.tab === 'users') this.drawUsers(v);
    else if (this.tab === 'usage') this.drawUsage(v);
    else this.drawProjects(v, this.projects.slice(0, 100), true);
  }

  drawUsage(v) {
    const D = this.daily, sum = (k) => D.reduce((a, r) => a + (r[k] || 0), 0);
    const active30 = this.users.filter((u) => u.usage.days30 > 0).length;
    const stat = (n, label) => h('div', { class: 'adm-stat' }, h('b', {}, String(n)), h('span', {}, label));
    v.append(
      h('p', { class: 'adm-hint' }, 'Últimos 30 dias. Conta o tempo com o app aberto na tela e as ações (toques nos pads, play, exportações e gravações), nunca o conteúdo.'),
      h('div', { class: 'adm-stats' },
        stat(active30, 'usaram o app'),
        stat(fmtMin(sum('seconds')), 'de uso no total'),
        stat(fmtMin(active30 ? sum('seconds') / active30 : 0), 'por pessoa (média)'),
        stat(fmtN(sum('opens')), 'aberturas do app'),
        stat(fmtN(sum('hits')), 'toques nos pads'),
        stat(fmtN(sum('plays')), 'plays'),
        stat(fmtN(sum('exports')), 'exportações WAV'),
        stat(fmtN(sum('recs')), 'gravações')),
      h('div', { class: 'adm-charts' },
        bars('PESSOAS USANDO POR DIA', last30(D, 'active'), fmtN, true),
        bars('TEMPO DE USO POR DIA', last30(D, 'seconds'), fmtMin),
        bars('NOVAS CONTAS POR DIA', last30(this.signups, 'n')),
        bars('TOQUES NOS PADS POR DIA', last30(D, 'hits'))));
    const top = [...this.users].filter((u) => u.usage.seconds30 > 0).sort((a, b) => b.usage.seconds30 - a.usage.seconds30).slice(0, 10);
    v.append(h('div', { class: 'card adm-top' }, h('h3', {}, 'QUEM MAIS USA (30 DIAS)'),
      top.length ? h('ol', {}, ...top.map((u) => h('li', {},
        h('button', { class: 'adm-link', onclick: () => this.userUsage(u) }, u.name || u.email),
        h('span', {}, ` · ${fmtMin(u.usage.seconds30)} · ${u.usage.days30} dia${u.usage.days30 === 1 ? '' : 's'}`))))
        : h('p', { class: 'adm-hint' }, 'Ninguém usou o app nos últimos 30 dias.')));
  }

  async userUsage(u) {
    let rows = [];
    try { rows = (await this.api.call('admin_usage', undefined, { qs: '&id=' + u.id })).days; } catch (e) { toast(e.message, 'err'); return; }
    const t = u.usage;
    modal((d, close) => {
      d.classList.add('adm-dialog');
      d.append(h('h2', {}, 'Uso de ' + (u.name || u.email)), h('p', {}, `${u.email} · último acesso ${ago(u.seen)}` + (u.device ? ` · ${u.device}` : '')),
        h('div', { class: 'adm-stats' },
          ...[[fmtMin(t.seconds), 'de uso no total'], [t.days30, 'dias ativos em 30'], [fmtN(t.opens), 'aberturas'], [fmtN(t.hits), 'toques nos pads'],
            [fmtN(t.plays), 'plays'], [fmtN(t.exports), 'exportações'], [fmtN(t.recs), 'gravações'], [u.nProjects, 'projetos na nuvem']]
            .map(([n, l]) => h('div', { class: 'adm-stat' }, h('b', {}, String(n)), h('span', {}, l)))),
        h('div', { class: 'adm-charts' }, bars('TEMPO DE USO POR DIA', last30(rows, 'seconds'), fmtMin), bars('TOQUES NOS PADS POR DIA', last30(rows, 'hits'))),
        h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => close() }, 'Fechar')));
    }, { autofocus: false });
  }

  drawUsers(v) {
    const list = h('div', { class: 'adm-list' });
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Buscar por nome ou e-mail…', value: this.query, 'aria-label': 'Buscar contas' });
    const filter = h('select', { class: 'input', 'aria-label': 'Filtrar contas' },
      ...[['all', 'Todas'], ['active', 'Ativas em 7 dias'], ['new', 'Novas em 7 dias'], ['blocked', 'Bloqueadas'], ['admin', 'Administradores']]
        .map(([k, t]) => h('option', { value: k, selected: this.filter === k }, t)));
    const sort = h('select', { class: 'input', 'aria-label': 'Ordenar contas' },
      ...[['created', 'Mais novas'], ['seen', 'Último acesso'], ['usage', 'Mais uso (30 dias)'], ['projects', 'Mais projetos']]
        .map(([k, t]) => h('option', { value: k, selected: this.sort === k }, t)));
    const fill = () => {
      const q = this.query.toLowerCase(), now = Date.now();
      const rows = this.users.filter((u) => {
        if (q && !(u.email + ' ' + (u.name || '')).toLowerCase().includes(q)) return false;
        return { all: true, active: now - u.seen < 7 * DAY, new: now - u.created < 7 * DAY, blocked: u.blocked, admin: u.is_admin }[this.filter];
      });
      const key = { created: (u) => u.created, seen: (u) => u.seen, usage: (u) => u.usage.seconds30, projects: (u) => u.nProjects }[this.sort];
      rows.sort((a, b) => key(b) - key(a));
      list.innerHTML = '';
      if (!rows.length) list.append(h('div', { class: 'empty' }, 'Nenhuma conta encontrada.'));
      for (const u of rows) list.append(this.userCard(u));
    };
    search.oninput = () => { this.query = search.value.trim(); fill(); };
    filter.onchange = () => { this.filter = filter.value; fill(); };
    sort.onchange = () => { this.sort = sort.value; fill(); };
    v.append(h('div', { class: 'toolbar adm-filter' }, search, filter, sort), list);
    fill();
  }

  userCard(u) {
    const me = u.id === this.app.user.id;
    return h('div', { class: 'pcard adm-user' + (u.blocked ? ' blocked' : '') },
      h('div', { class: 't' }, h('b', {}, u.name || u.email.split('@')[0]),
        u.is_admin ? h('span', { class: 'badge cloud' }, 'ADMIN') : null,
        u.blocked ? h('span', { class: 'badge red' }, 'BLOQUEADA') : null,
        u.confirmed ? null : h('span', { class: 'badge' }, 'E-MAIL NÃO CONFIRMADO'),
        me ? h('span', { class: 'badge' }, 'VOCÊ') : null),
      h('div', { class: 'sub' }, u.email),
      h('div', { class: 'sub' }, `Criada em ${fmtDate(u.created)} · último acesso ${ago(u.seen)}`),
      h('div', { class: 'sub' }, `${u.nProjects} projeto${u.nProjects === 1 ? '' : 's'} · ${fmtBytes(u.size)}` +
        (u.app_version ? ` · v${u.app_version}` : '') + (u.device ? ` · ${u.device}` : '')),
      h('div', { class: 'sub adm-usage' }, u.usage.seconds
        ? `Uso: ${fmtMin(u.usage.seconds)} no total · ${u.usage.days30} dia${u.usage.days30 === 1 ? '' : 's'} ativo${u.usage.days30 === 1 ? '' : 's'} em 30 · ${fmtN(u.usage.hits)} toque${u.usage.hits === 1 ? '' : 's'} · ${fmtN(u.usage.plays)} play${u.usage.plays === 1 ? '' : 's'}`
        : 'Uso: ainda não usou o app com esta conta'),
      u.blocked && u.blocked_reason ? h('div', { class: 'sub adm-warn' }, 'Motivo: ' + u.blocked_reason) : null,
      u.admin_note ? h('div', { class: 'sub adm-note' }, 'Nota: ' + u.admin_note) : null,
      h('div', { class: 'acts' },
        h('button', { class: 'btn small primary', onclick: () => this.userProjects(u) }, 'Projetos'),
        h('button', { class: 'btn small', onclick: () => this.userUsage(u) }, 'Uso'),
        me ? null : h('button', { class: 'btn small' + (u.blocked ? '' : ' danger'), onclick: () => this.toggleBlock(u) }, u.blocked ? 'Desbloquear' : 'Bloquear'),
        me ? null : h('button', { class: 'btn small', onclick: () => this.toggleAdmin(u) }, u.is_admin ? 'Remover admin' : 'Tornar admin'),
        u.confirmed ? null : h('button', { class: 'btn small', onclick: () => this.update(u, { confirmed: true }, 'E-mail confirmado') }, 'Confirmar e-mail'),
        h('button', { class: 'btn small', onclick: () => this.resetPassword(u) }, 'Redefinir senha'),
        h('button', { class: 'btn small', onclick: () => this.editNote(u) }, 'Nota'),
        me ? null : h('button', { class: 'btn small danger', onclick: () => this.deleteUser(u) }, 'Excluir conta')));
  }

  drawProjects(v, rows, withOwner, close) {
    const list = h('div', { class: 'folder-grid' });
    if (!rows.length) list.append(h('div', { class: 'empty' }, 'Nenhum projeto na nuvem.'));
    for (const p of rows) {
      const owner = this.userById.get(p.user_id);
      list.append(h('div', { class: 'pcard' },
        h('div', { class: 't' }, h('b', {}, p.name)),
        withOwner ? h('div', { class: 'sub' }, owner ? `${owner.name || ''} · ${owner.email}` : 'conta excluída') : null,
        h('div', { class: 'sub' }, `${fmtDate(p.updated)} · ${p.bpm || '—'} BPM · ${fmtBytes(p.size)}`),
        h('div', { class: 'acts' },
          h('button', { class: 'btn small primary', onclick: () => { if (close) close(); this.openCopy(p, owner); } }, 'Abrir cópia'),
          h('button', { class: 'btn small', onclick: () => this.download(p) }, 'Baixar .wdq'),
          h('button', { class: 'btn small danger', onclick: async () => { if (await this.deleteProject(p)) { if (close) close(); this.draw(); } } }, 'Excluir'))));
    }
    v.append(list);
  }

  userProjects(u) {
    const rows = this.projects.filter((p) => p.user_id === u.id);
    modal((d, close) => {
      d.classList.add('adm-dialog');
      d.append(h('h2', {}, 'Projetos de ' + (u.name || u.email)), h('p', {}, `${u.email} · ${rows.length} projeto(s) na nuvem`));
      this.drawProjects(d, rows, false, close);
      d.append(h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => close() }, 'Fechar')));
    }, { autofocus: false });
  }

  fetchFile(p) {
    return this.api.call('admin_project_get', undefined, { qs: '&id=' + encodeURIComponent(p.id), blob: true });
  }

  async openCopy(p, owner) {
    try {
      const blob = await this.fetchFile(p);
      await this.app.importProjectFile(blob, `${p.name} (de ${owner ? owner.name || owner.email : 'conta excluída'})`);
    } catch (e) { toast('Não foi possível abrir: ' + (e.message || e), 'err'); }
  }

  async download(p) {
    try {
      const where = await deliverFile(await this.fetchFile(p), p.name.replace(/[^\w\- ]+/g, '_') + '.wdq');
      toast('Projeto baixado' + (where ? ' para ' + where : ''), 'ok');
    } catch (e) { toast('Não foi possível baixar: ' + (e.message || e), 'err'); }
  }

  async deleteProject(p) {
    if (!(await confirmDialog('Excluir projeto', `Apagar "${p.name}" da nuvem do usuário? Ele não poderá recuperar.`, 'Excluir', true))) return false;
    try { await this.api.call('admin_project_del', { id: p.id }); } catch (e) { toast(e.message, 'err'); return false; }
    this.projects = this.projects.filter((x) => x.id !== p.id);
    const u = this.userById.get(p.user_id);
    if (u) { u.nProjects--; u.size -= p.size || 0; }
    toast('Projeto excluído', 'ok');
    return true;
  }

  async update(u, patch, okMsg) {
    try {
      const { user } = await this.api.call('admin_update', { id: u.id, ...patch });
      Object.assign(u, user);
    } catch (e) { toast(e.message, 'err'); return; }
    toast(okMsg, 'ok');
    this.draw();
  }

  async toggleBlock(u) {
    if (u.blocked) {
      if (await confirmDialog('Desbloquear conta', `${u.email} volta a entrar e salvar projetos.`, 'Desbloquear')) this.update(u, { blocked: false, blocked_reason: null }, 'Conta desbloqueada');
      return;
    }
    const reason = await promptDialog('Bloquear conta', '', `${u.email} não consegue mais entrar nem salvar na nuvem. Motivo (aparece para o usuário ao tentar entrar):`, 'Bloquear');
    if (reason === null) return;
    this.update(u, { blocked: true, blocked_reason: reason }, 'Conta bloqueada');
  }

  async toggleAdmin(u) {
    const on = !u.is_admin;
    const ok = await confirmDialog(on ? 'Tornar administrador' : 'Remover administrador',
      on ? `${u.email} vai ver todas as contas e projetos e poderá bloquear e excluir contas.` : `${u.email} deixa de ter acesso ao painel.`,
      on ? 'Tornar admin' : 'Remover', on);
    if (ok) this.update(u, { is_admin: on }, on ? 'Agora é administrador' : 'Acesso de administrador removido');
  }

  async editNote(u) {
    const note = await promptDialog('Nota interna', u.admin_note || '', 'Só administradores veem esta nota.', 'Salvar');
    if (note !== null) this.update(u, { admin_note: note || null }, 'Nota salva');
  }

  async resetPassword(u) {
    if (!(await confirmDialog('Redefinir senha', `Enviar para ${u.email} um e-mail com o link para criar uma senha nova?`, 'Enviar'))) return;
    try {
      await this.api.call('admin_reset', { id: u.id });
      toast('E-mail de redefinição enviado', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }

  async deleteUser(u) {
    const typed = await promptDialog('Excluir conta', '', `Isto apaga a conta ${u.email} e todos os projetos dela na nuvem, sem volta. Digite o e-mail da conta para confirmar:`, 'Excluir para sempre');
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== u.email.toLowerCase()) { toast('O e-mail digitado não confere. Nada foi apagado.', 'err'); return; }
    try {
      await this.api.call('admin_delete_user', { id: u.id });
      this.users = this.users.filter((x) => x.id !== u.id);
      this.projects = this.projects.filter((p) => p.user_id !== u.id);
      this.userById.delete(u.id);
      toast('Conta excluída', 'ok');
      this.draw();
    } catch (e) { toast('Erro ao excluir: ' + (e.message || e), 'err'); }
  }
}
