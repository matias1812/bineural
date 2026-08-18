// scripts/badge-check.mjs
// Verifica en la web DESPLEGADA: badge de plataforma (WEB/PWA/APK) en / y
// /cuenta, registro del service worker en cada página y estado del botón
// de push. Uso: node scripts/badge-check.mjs
import { spawn, execSync } from 'child_process';

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9444;
const BASE = process.env.URL_BASE || 'https://vyneural-six.vercel.app';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = `${process.env.TEMP || '/tmp'}/vyneural-badge-${Date.now()}`;
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profile}`,
    '--window-size=1280,800',
    'about:blank',
  ],
  { stdio: 'ignore', detached: true },
);
chrome.unref();

let wsUrl = null;
for (let i = 0; i < 30; i++) {
  try {
    const list = JSON.parse(execSync(`curl -s http://127.0.0.1:${DEBUG_PORT}/json/list`, { encoding: 'utf8' }));
    const page = list.find((t) => t.type === 'page');
    if (page) {
      wsUrl = page.webSocketDebuggerUrl;
      break;
    }
  } catch { /* chrome aún arrancando */ }
  await sleep(500);
}
if (!wsUrl) {
  console.error('Chrome headless no arrancó en el puerto', DEBUG_PORT);
  process.exit(1);
}

let nextId = 1;
const pending = new Map();
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = () => rej(new Error('ws error'));
});
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
};
function cmd(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r && r.result ? r.result.value : undefined;
}

const PROBE = `(async () => {
  const b = document.getElementById('platform-badge');
  let sw = null;
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      sw = reg ? { scope: reg.scope } : null;
    } catch (e) { sw = 'error:' + e.message; }
  }
  const sub = document.getElementById('cuenta-push-subscribe');
  return JSON.stringify({
    badge: b ? { text: b.textContent, cls: b.className } : null,
    sw,
    pushBtn: sub ? { disabled: sub.disabled, text: sub.textContent } : null,
  });
})()`;

for (const path of ['/', '/cuenta']) {
  await cmd('Page.navigate', { url: BASE + path });
  await sleep(4500);
  const r = await evaluate(PROBE);
  console.log(`=== ${path} ===`);
  console.log(JSON.stringify(JSON.parse(r || '{}'), null, 2));
}

try { chrome.kill(); } catch {}
process.exit(0);
