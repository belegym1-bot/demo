const offlinePage = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<html lang="pt-BR"><title>Belê GYM · Sem conexão</title><body style="font:1.1rem system-ui;padding:2rem;background:#f8f8ff;color:#000">
<main><h1>Você está sem conexão</h1><p>O Belê GYM precisa do servidor local para carregar a sua conta.</p>
<a href="/">Tentar novamente</a></main></body></html>`;

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(() => new Response(offlinePage, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })));
});
