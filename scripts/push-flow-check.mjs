// scripts/push-flow-check.mjs
// Prueba END-TO-END del push en PC sobre la web desplegada: entra a /cuenta,
// concede el permiso de notificación (CDP), hace clic en "Activar
// notificaciones" y reporta el resultado real (suscripción + backend).
// Uso: TOKEN="<access_token>" node scripts/push-flow-check.mjs
import { spawn, execSync } from 'child_process';

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9445;
const BASE = process.env.URL_BASE || 'https://vyneural-six.vercel.app';
const TOKEN = process.env.TOKEN || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!TOKEN) {
  console.error('Falta TOKEN.');
  process.exit(1);
}

const profile = `${process.env.TEMP || '/tmp'}/vyneural-push-${Date.now()}`;
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profile}`,
    '--window-size=1280,900',
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
  } catch { /* arrancando */ }
  await sleep(500);
}
if (!wsUrl) {
  console.error('Chrome no arrancó');
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

// 1) /cuenta con sesión.
await cmd('Page.navigate', { url: BASE + '/cuenta' });
await sleep(3000);
await evaluate(
  `localStorage.setItem('vyneural_access_token', ${JSON.stringify(TOKEN)});
   localStorage.setItem('vyneural_refresh_token', 'x'); 'ok'`,
);
await cmd('Page.navigate', { url: BASE + '/cuenta' });
await sleep(4500);

// 2) Permiso de notificación (equivalente al diálogo que el usuario acepta).
try {
  await cmd('Browser.grantPermissions', {
    origin: 'https://vyneural-six.vercel.app',
    permissions: ['notifications'],
  });
} catch (e) {
  console.log('  (grantPermissions no disponible:', String(e).slice(0, 80), ')');
}

const before = JSON.parse(
  (await evaluate(
    `(() => {
       const t = document.getElementById('cuenta-push-text');
       const b = document.getElementById('cuenta-push-subscribe');
       return JSON.stringify({ text: t ? t.textContent : null, btnDisabled: b ? b.disabled : null, perm: Notification.permission });
     })()`,
  )) || '{}',
);
console.log('=== Estado inicial ===');
console.log('  permiso notificación:', before.perm);
console.log('  texto:', before.text);
console.log('  botón habilitado:', before.btnDisabled === false);

// 3) Clic en "Activar notificaciones".
await evaluate(`document.getElementById('cuenta-push-subscribe').click(); 'clicked'`);
await sleep(6000);

const after = JSON.parse(
  (await evaluate(
    `(async () => {
       const t = document.getElementById('cuenta-push-text');
       const b = document.getElementById('cuenta-push-subscribe');
       let sub = null, subErr = null;
       try {
         if ('serviceWorker' in navigator) {
           const reg = await navigator.serviceWorker.getRegistration();
           sub = reg ? await reg.pushManager.getSubscription() : null;
         }
       } catch (e) { subErr = String(e && e.message || e); }
       return JSON.stringify({ text: t ? t.textContent : null, btnDisabled: b ? b.disabled : null, subscribed: !!sub, subErr });
     })()`,
  )) || '{}',
);
console.log('=== Tras activar ===');
console.log('  texto:', after.text);
console.log('  suscrito (pushManager):', after.subscribed, after.subErr ? `(${after.subErr})` : '');

try { chrome.kill(); } catch {}
const ok = after.subscribed === true && /suscrito/i.test(after.text || '');
console.log(ok ? '\n✅ PUSH EN PC FUNCIONA' : '\n❌ FLUJO DE PUSH FALLÓ');
process.exit(ok ? 0 : 1);
