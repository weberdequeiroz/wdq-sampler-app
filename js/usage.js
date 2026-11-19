// Uso do app para o painel do administrador: tempo com o app aberto na tela e
// quantas vezes a pessoa tocou pads, deu play, exportou e gravou. Só contagens,
// nunca o conteúdo. Envia a cada minuto (e ao sair do app) para o servidor.
export class Usage {
  constructor(auth) {
    this.auth = auth;
    this.n = { hits: 0, plays: 0, exports: 0, recs: 0 };
    this.since = document.hidden ? 0 : performance.now();
    this.secs = 0;
  }

  get on() { return this.auth.mode === 'cloud' && !!this.auth.user; }

  count(k) { this.n[k]++; }

  start() {
    setInterval(() => this.flush(), 60000);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.flush(true);
      else this.since = performance.now();
    });
  }

  flush(leaving) {
    if (this.since) {
      const now = performance.now();
      this.secs += (now - this.since) / 1000;
      this.since = leaving ? 0 : now;
    }
    const body = { seconds: Math.round(this.secs), ...this.n };
    if (!this.on || !Object.values(body).some((v) => v > 0)) return;
    this.secs = 0;
    this.n = { hits: 0, plays: 0, exports: 0, recs: 0 };
    this.auth.api.call('usage', body, { keepalive: true }).catch(() => { /* sem internet: perde só este minuto */ });
  }
}
