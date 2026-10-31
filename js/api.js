// Cliente do servidor do WDQ Sampler (server/api.php, no Hostinger).
import { CONFIG } from './config.js';

export class ApiError extends Error {
  constructor(msg, status, code) { super(msg); this.status = status; this.code = code; }
}

export class Api {
  constructor() {
    this.base = CONFIG.API_URL;
    this.token = null;
    this.onSessionLost = null; // chamado quando o servidor derruba a sessão (bloqueio, conta excluída)
  }

  async call(a, body, { qs = '', raw = null, blob = false, keepalive = false } = {}) {
    const headers = {};
    if (this.token) headers['X-WDQ-Token'] = this.token;
    let payload;
    if (raw) { payload = raw; headers['Content-Type'] = 'application/octet-stream'; }
    else if (body !== undefined) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
    let r;
    try {
      r = await fetch(`${this.base}?a=${a}${qs}`, { method: payload !== undefined ? 'POST' : 'GET', headers, body: payload, cache: 'no-store', keepalive });
    } catch (e) {
      throw new ApiError('Sem conexão com o servidor. Verifique a internet.', 0, 'offline');
    }
    if (r.ok && blob) return r.blob();
    let d = {};
    try { d = await r.json(); } catch (e) { /* resposta vazia */ }
    if (!r.ok) {
      const err = new ApiError(d.error || 'Erro no servidor (' + r.status + ').', r.status, d.code);
      if (this.token && (d.code === 'auth' || d.code === 'blocked') && this.onSessionLost) this.onSessionLost(err);
      throw err;
    }
    return d;
  }
}
