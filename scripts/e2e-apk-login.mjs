// scripts/e2e-apk-login.mjs
// E2E del login DENTRO del WebView de la APK: llena el form de /cuenta y
// verifica que la sesión se establece. La llamada API va por el bridge nativo
// (API_REQUEST → HttpURLConnection), por lo que NO depende de CORS.
// Uso: EMAIL=… PASS=… node scripts/e2e-apk-login.mjs
import http from 'http';

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

const email = process.env.EMAIL;
const pass = process.env.PASS;
if (!email || !pass) throw new Error('EMAIL/PASS requeridos');

const list = await getJSON('http://127.0.0.1:9222/json/list');
const page = list.find((x) => x.type === 'page');
if (!page) throw new Error('sin página CDP');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result);
    pending.delete(m.id);
  }
};
await new Promise((res) => (ws.onopen = res));
function cmd(method, params = {}) {
  return new Promise((res) => {
    const myId = ++id;
    pending.set(myId, res);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
}
await cmd('Page.enable');
await cmd('Runtime.enable');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await cmd('Page.navigate', { url: 'file:///android_asset/bineural/cuenta.html' });
await sleep(3500);

const expression = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const hasBridge = !!(window.AndroidBridgeNative && typeof window.AndroidBridgeNative.postMessage === 'function');
  document.getElementById('cuenta-login-btn').click();
  await sleep(400);
  const emailIn = document.getElementById('auth-email');
  const passIn = document.getElementById('auth-password');
  if (!emailIn || !passIn) return JSON.stringify({ hasBridge, step: 'modal-no-abrio' });
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(emailIn, ${JSON.stringify(email)});
  setter.call(passIn, ${JSON.stringify(pass)});
  emailIn.dispatchEvent(new Event('input', { bubbles: true }));
  passIn.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(200);
  document.getElementById('auth-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await sleep(7000);
  const err = document.getElementById('auth-error');
  const content = document.getElementById('cuenta-content');
  return JSON.stringify({
    hasBridge,
    error: err && !err.classList.contains('hidden') ? err.textContent : null,
    loggedIn: content && !content.classList.contains('hidden'),
    name: document.getElementById('cuenta-name') ? document.getElementById('cuenta-name').textContent : null,
    email: document.getElementById('cuenta-email') ? document.getElementById('cuenta-email').textContent : null,
    tokenLen: (localStorage.getItem('vyneural_access_token') || '').length,
  });
})()`;

const ev = await cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
console.log(ev.result.value);
ws.close();
