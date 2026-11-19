// Cadastro e login por e-mail.
// - Modo nuvem (CONFIG.API_URL preenchido): conta no servidor do WDQ Sampler
//   (server/api.php no Hostinger), com confirmação por e-mail, nova senha por
//   link, bloqueio pelo administrador e "Minha Pasta" sincronizada.
// - Modo local: conta guardada só no aparelho; a senha nunca é salva, apenas um
//   hash PBKDF2-SHA256 com sal aleatório.
import { CONFIG } from './config.js';
import { getUser, putUser } from './storage.js';
import { Api } from './api.js';

const SESSION_KEY = 'wdq.session';
const CLOUD_KEY = 'wdq.cloud';
const NOTICE_KEY = 'wdq.notice';
const ITER = 210000;
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}
export function passwordProblems(pw) {
  const p = [];
  if (pw.length < 8) p.push('ter pelo menos 8 caracteres');
  if (!/[A-Za-z]/.test(pw)) p.push('ter letras');
  if (!/[0-9]/.test(pw)) p.push('ter números');
  return p;
}

async function pbkdf2(password, saltHex) {
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256);
  return hex(bits);
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
export async function localId(email) {
  return 'local-' + hex(await crypto.subtle.digest('SHA-256', enc.encode(email))).slice(0, 24);
}

export class Auth {
  constructor() {
    this.mode = CONFIG.API_URL ? 'cloud' : 'local';
    this.api = new Api();
    this.user = null;
    this.profile = null; // perfil no servidor: admin, bloqueio, último acesso
    this.listeners = new Set();
    this.fails = 0;
    this.lockUntil = 0;
    this.recoveryToken = null;
    // sessão derrubada pelo servidor (conta bloqueada ou excluída): sai e avisa
    this.api.onSessionLost = (err) => {
      if (err.code === 'blocked') notice(err.message, 'err');
      this._clearCloud();
      this._emit('SIGNED_OUT');
    };
  }

  // Quem é administrador é o servidor que diz; isto só decide se o app mostra
  // a entrada do painel.
  get isAdmin() { return this.mode === 'cloud' && !!(this.profile && this.profile.is_admin); }
  get recovering() { return !!this.recoveryToken; }

  onChange(fn) { this.listeners.add(fn); }
  _emit(evt) { for (const fn of this.listeners) fn(this.user, evt); }

  async init() {
    try {
      const n = JSON.parse(sessionStorage.getItem(NOTICE_KEY) || 'null');
      if (n) { this.notice = n; sessionStorage.removeItem(NOTICE_KEY); }
    } catch (e) { /* sem storage */ }
    if (this.mode === 'cloud') {
      // link de "nova senha" do e-mail abre a versão web com #reset=TOKEN
      const m = location.hash.match(/reset=([0-9a-f]{64})/);
      if (m) {
        this.recoveryToken = m[1];
        history.replaceState(null, '', location.pathname + location.search);
        return null;
      }
      let s = null;
      try { s = JSON.parse(localStorage.getItem(CLOUD_KEY) || 'null'); } catch (e) { /* sem sessão salva */ }
      if (s && s.token && s.user) {
        this.api.token = s.token;
        this._setProfile(s.user);
        await this.refreshProfile();
      }
      return this.user;
    }
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (s && s.email) {
        const u = await getUser(s.email);
        if (u && u.sessionToken && safeEqual(u.sessionToken, s.token || '')) this.user = { id: u.id, email: u.email, name: u.name };
      }
    } catch (e) { /* sem sessão salva */ }
    return this.user;
  }

  _setProfile(p) {
    this.profile = p;
    this.user = { id: p.id, email: p.email, name: p.name || p.email.split('@')[0] };
  }

  _storeCloud(token, profile) {
    this.api.token = token;
    this._setProfile(profile);
    try { localStorage.setItem(CLOUD_KEY, JSON.stringify({ token, user: profile })); } catch (e) { /* sem localStorage */ }
  }

  _clearCloud() {
    this.api.token = null;
    this.user = null;
    this.profile = null;
    try { localStorage.removeItem(CLOUD_KEY); } catch (e) { /* nada a limpar */ }
  }

  // Avisa o servidor que o app abriu (último acesso, versão, aparelho) e pega
  // o perfil atualizado. Sem internet, segue com o perfil guardado.
  async refreshProfile() {
    if (this.mode !== 'cloud' || !this.api.token) return this.profile;
    try {
      const d = await this.api.call('touch', { version: CONFIG.VERSION, device: deviceName() });
      if (this.api.token) this._storeCloud(this.api.token, d.user);
    } catch (e) {
      if (e.code === 'auth' || e.code === 'blocked') {
        if (e.code === 'blocked') this.notice = { m: e.message, k: 'err' };
        this._clearCloud();
      }
    }
    return this.profile;
  }

  async signUp(email, password, name) {
    email = email.trim().toLowerCase();
    if (!validateEmail(email)) throw new Error('E-mail inválido.');
    const probs = passwordProblems(password);
    if (probs.length) throw new Error('A senha precisa ' + probs.join(', ') + '.');
    if (this.mode === 'cloud') {
      const d = await this.api.call('signup', { email, password, name });
      if (d.confirm) return { confirm: true, mailFailed: d.mail === false };
      this._storeCloud(d.token, d.user);
      await this.refreshProfile();
      this._emit('SIGNED_IN');
      return { confirm: false };
    }
    if (await getUser(email)) throw new Error('Já existe uma conta com esse e-mail neste aparelho.');
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await pbkdf2(password, salt);
    const u = { email, name: name || email.split('@')[0], salt, hash, id: await localId(email), created: Date.now() };
    await putUser(u);
    await this._startLocal(u);
    return { confirm: false };
  }

  async signIn(email, password) {
    email = email.trim().toLowerCase();
    if (Date.now() < this.lockUntil) {
      throw new Error('Muitas tentativas. Aguarde ' + Math.ceil((this.lockUntil - Date.now()) / 1000) + ' s.');
    }
    if (this.mode === 'cloud') {
      try {
        const d = await this.api.call('login', { email, password });
        this.fails = 0;
        this._storeCloud(d.token, d.user);
        await this.refreshProfile();
        this._emit('SIGNED_IN');
      } catch (e) {
        // quem tinha conta só neste aparelho precisa criar a conta na nuvem
        if (e.code === 'credentials' && await getUser(email)) {
          throw new Error('As contas agora ficam na nuvem. Toque em "Criar conta" com este mesmo e-mail: seus projetos deste aparelho vêm junto.');
        }
        throw e;
      }
      return;
    }
    const u = await getUser(email);
    const hash = u ? await pbkdf2(password, u.salt) : await pbkdf2(password, '00'.repeat(16));
    if (!u || !safeEqual(hash, u.hash)) { this._fail(); throw new Error('E-mail ou senha incorretos.'); }
    this.fails = 0;
    await this._startLocal(u);
  }

  _fail() {
    this.fails++;
    if (this.fails >= 5) { this.lockUntil = Date.now() + 60000; this.fails = 0; }
  }

  async _startLocal(u) {
    u.sessionToken = hex(crypto.getRandomValues(new Uint8Array(24)));
    await putUser(u);
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ email: u.email, token: u.sessionToken })); } catch (e) { /* sem localStorage */ }
    this.user = { id: u.id, email: u.email, name: u.name };
    this._emit('SIGNED_IN');
  }

  async resetPassword(email) {
    email = email.trim().toLowerCase();
    if (this.mode !== 'cloud') throw new Error('No modo local a senha não pode ser recuperada por e-mail.');
    await this.api.call('forgot', { email });
  }

  async updatePassword(password) {
    const probs = passwordProblems(password);
    if (probs.length) throw new Error('A senha precisa ' + probs.join(', ') + '.');
    if (this.mode === 'cloud') {
      if (this.recoveryToken) {
        const d = await this.api.call('reset', { token: this.recoveryToken, password });
        this.recoveryToken = null;
        this._storeCloud(d.token, d.user);
        await this.refreshProfile();
        this._emit('SIGNED_IN');
      } else {
        await this.api.call('password', { password });
      }
      return;
    }
    const u = await getUser(this.user.email);
    u.salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    u.hash = await pbkdf2(password, u.salt);
    await this._startLocal(u);
  }

  // LGPD: a pessoa apaga a própria conta e tudo o que está no servidor.
  async deleteAccount(password) {
    await this.api.call('delete_me', { password });
    notice('Sua conta e seus dados foram excluídos.', 'ok');
    this._clearCloud();
  }

  async signOut() {
    if (this.mode === 'cloud') {
      try { await this.api.call('logout', {}); } catch (e) { /* sai mesmo sem internet */ }
      this._clearCloud();
    } else {
      try {
        const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
        if (s) { const u = await getUser(s.email); if (u) { delete u.sessionToken; await putUser(u); } }
        localStorage.removeItem(SESSION_KEY);
      } catch (e) { /* nada a limpar */ }
      this.user = null;
    }
    this._emit('SIGNED_OUT');
  }
}

// Aviso para a tela de login depois que o app recarrega.
function notice(m, k) {
  try { sessionStorage.setItem(NOTICE_KEY, JSON.stringify({ m, k })); } catch (e) { /* sem storage */ }
}

function deviceName() {
  const ua = navigator.userAgent;
  const os = (ua.match(/Android [\d.]+/) || ua.match(/iPhone|iPad|Windows|Mac OS X|Linux|CrOS/) || ['?'])[0];
  return (window.WDQAndroid ? 'App Android' : 'Navegador') + ' · ' + os.replace('Mac OS X', 'Mac');
}
