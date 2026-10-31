// Service worker do WDQ Sampler: deixa o app funcionando offline e entrega
// versões novas. Ao publicar uma versão, troque VERSION: o app avisa o usuário
// e atualiza com um toque.
const VERSION = 'wdq-sampler-1.1.8';
const SHELL = [
  './', 'index.html', 'privacidade.html', 'js/privacy.js', 'manifest.webmanifest', 'css/app.css',
  'js/main.js', 'js/app.js', 'js/admin.js', 'js/api.js', 'js/usage.js', 'js/config.js', 'js/auth.js', 'js/cloud.js', 'js/storage.js', 'js/project.js',
  'js/sequencer.js', 'js/library.js', 'js/midi.js', 'js/wav.js',
  'js/audio/engine.js', 'js/audio/fx.js', 'js/audio/voices.js', 'js/audio/native.js',
  'js/ui/dom.js', 'js/ui/knob.js', 'js/ui/tour.js', 'js/ui/share.js',
  'vendor/qrcode.js',
  'assets/logo.svg', 'assets/logo-mark.svg', 'assets/icon-192.png', 'assets/icon-512.png',
  'assets/icon-maskable-512.png', 'assets/apple-touch-icon.png', 'assets/favicon-64.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // nuvem (Supabase) sempre direto na rede
  if (url.pathname.endsWith('/version.json')) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (err) {
      if (req.mode === 'navigate') return cache.match('index.html');
      throw err;
    }
  })());
});
