// Service worker do Suporte: guarda so o "casco" (fontes, icones). Nunca guarda a API.
const V = "suporte-v4";
const FIXOS = ["/static/icons/icon-192.png", "/static/icons/apple-touch-icon.png"];
self.addEventListener("install", e => {   // cada icone separado: um que falhe (ou ja esteja no cache) nao impede a instalacao
  e.waitUntil(caches.open(V).then(c => Promise.all(FIXOS.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
  if (r.mode === "navigate") {           // pagina: sempre a versao mais nova; sem rede usa a ultima copia (modo offline)
    e.respondWith(fetch(r).then(x => {
      if (x.ok && u.pathname === "/") { const c = x.clone(); caches.open(V).then(k => k.put("/", c)).catch(() => {}); }
      return x;
    }).catch(() => caches.match("/").then(h => h || new Response(
      "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><body style='font:16px system-ui;padding:32px;text-align:center'><h2>Sem conexão</h2><p>Conecte-se à rede da empresa para usar o Suporte.</p><p style='color:#555;font-size:14px'>Se a rede está ok, o certificado do servidor pode ter sido renovado: aperte <b>Ctrl+Shift+R</b> e, no aviso do navegador, clique em <b>Avançado → Continuar</b>.</p><button onclick='location.reload()'>Tentar de novo</button>",
      { headers: { "Content-Type": "text/html; charset=utf-8" } }))));
    return;
  }
  if (/^\/static\/(css|js)\//.test(u.pathname)) {   // estilos e scripts: rede primeiro (sempre a versao nova); offline usa a copia
    e.respondWith(fetch(r).then(x => { if (x.ok) { const c = x.clone(); caches.open(V).then(k => k.put(r, c)).catch(() => {}); } return x; })
      .catch(() => caches.match(r, { ignoreSearch: true })));
    return;
  }
  if (u.pathname.startsWith("/static/")) {   // fontes e icones: cache primeiro
    e.respondWith(caches.match(r).then(h => h || fetch(r).then(x => { if (x.ok) { const c = x.clone(); caches.open(V).then(k => k.put(r, c)).catch(() => {}); } return x; })));
  }
});
