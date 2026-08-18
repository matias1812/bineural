// scripts/push-card-state-probe.mjs
// Sonda: estado real de la tarjeta de push en /cuenta de la web desplegada.
// Uso: TOKEN="..." node scripts/push-card-state-probe.mjs
import { spawn } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'https://vyneural-six.vercel.app';
const TOKEN = process.env.TOKEN;
const PORT = 9451;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = `${process.env.TEMP || '/tmp'}/vyneural-probe-${Date.now()}`;
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: 'ignore' });

async function getWs() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const l = await r.json();
      const p = l.find((x) => x.type === 'page');
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error('no chrome');
}

const ws = new WebSocket(await getWs());
let id = 0;
const pending = {};
const cmd = (m, params) => new Promise((res) => {
  const i = ++id;
  pending[i] = res;
  ws.send(JSON.stringify({ id: i, method: m, params }));
});
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending[m.id]) { pending[m.id](m.result); delete pending[m.id]; }
});
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const evaluate = async (expr) => {
  const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return 'EXC: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
  return r.result?.value;
};

await cmd('Page.navigate', { url: BASE + '/cuenta' });
await sleep(3500);
if (TOKEN) {
  await evaluate(`localStorage.setItem('vyneural_access_token', ${JSON.stringify(TOKEN)});
                  localStorage.setItem('vyneural_refresh_token', 'x'); 'ok'`);
  await cmd('Page.navigate', { url: BASE + '/cuenta' });
  await sleep(4500);
}

const probe = `(async () => {
  const t = document.getElementById('cuenta-push-text');
  const sub = document.getElementById('cuenta-push-subscribe');
  let sw = null, pushSub = null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    sw = !!reg;
    pushSub = reg ? !!(await reg.pushManager.getSubscription()) : false;
  } catch (e) { sw = 'err'; }
  // Estado interno del módulo: leer lo que la UI ve (texto ya lo da).
  return JSON.stringify({
    gateHidden: (() => { const g = document.getElementById('cuenta-gate'); return g ? g.classList.contains('hidden') : null; })(),
    text: t ? t.textContent : null,
    subDisabled: sub ? sub.disabled : null,
    sw, pushSub,
  });
})()`;
const snap = JSON.parse((await evaluate(probe)) || '{}');
console.log(JSON.stringify(snap, null, 2));
ws.close();
try { chrome.kill(); } catch {}
