// scripts/apk-push-card-check.mjs
// Verifica la tarjeta "🔔 Notificaciones push" dentro de la APK (WebView):
// navega a cuenta.html, lee el texto, estado de botones y permiso nativo.
// Uso: node scripts/apk-push-card-check.mjs [cuenta.html]
import http from 'node:http';
// Node 24+: WebSocket global (undici), como usan los otros scripts.
const WebSocket = globalThis.WebSocket;

const target = process.argv[2] || 'cuenta.html';

async function getPage() {
  const list = await new Promise((res, rej) =>
    http.get('http://127.0.0.1:9222/json/list', (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej),
  );
  const p = list.find((x) => x.type === 'page' && /vyneural/i.test((x.title || '') + (x.url || '')));
  if (!p) throw new Error('NO_VYNEURAL_PAGE');
  return p;
}

const page = await getPage();
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = {};
const send = (m, params) =>
  new Promise((res) => {
    const i = ++id;
    pending[i] = res;
    ws.send(JSON.stringify({ id: i, method: m, params }));
  });
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending[m.id]) {
    pending[m.id](m.result);
    delete pending[m.id];
  }
});
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const evalR = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return 'EXC: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};

// Navegar a cuenta.html dentro de la app (e inyectar sesión si viene TOKEN)
const token = process.env.TOKEN;
if (token) {
  await evalR(`localStorage.setItem('vyneural_access_token', ${JSON.stringify(token)}); 'ok'`);
}
if ((await evalR('location.href')) !== 'file:///android_asset/bineural/' + target) {
  await evalR(`location.href = ${JSON.stringify(target)}; 'ok'`);
  await new Promise((r) => setTimeout(r, 3500));
}
await evalR('location.reload(); "ok"');
await new Promise((r) => setTimeout(r, 4500));
const url = await evalR('location.href');
console.log('URL:', url);

const snap = await evalR(`(() => {
  const t = document.getElementById('cuenta-push-text');
  const sub = document.getElementById('cuenta-push-subscribe');
  const unsub = document.getElementById('cuenta-push-unsubscribe');
  let native = null;
  try { native = window.AndroidBridge ? (window.AndroidBridge.getPlatformInfo() || {}).notificationPermission : null; } catch (e) {}
  const loggedIn = !!(window.__vyneuralAuth && window.__vyneuralAuth.isLoggedIn && window.__vyneuralAuth.isLoggedIn());
  return {
    loggedIn,
    hasBridge: !!window.AndroidBridge,
    nativeNotifPermission: native,
    card: !!t,
    text: t ? t.textContent : null,
    subDisabled: sub ? sub.disabled : null,
    subLabel: sub ? sub.textContent : null,
    unsubDisabled: unsub ? unsub.disabled : null,
    gateHidden: (() => { const g = document.getElementById('cuenta-gate'); return g ? g.classList.contains('hidden') : null; })(),
  };
})()`);
console.log(JSON.stringify(snap, null, 2));
ws.close();
