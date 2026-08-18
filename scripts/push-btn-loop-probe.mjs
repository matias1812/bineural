// scripts/push-btn-loop-probe.mjs
// Reproduce el wait loop de platform-check.mjs y muestra estado por iteración.
import { spawn } from 'child_process';

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'https://vyneural-six.vercel.app';
const TOKEN = process.env.TOKEN;
const PORT = 9453;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = `${process.env.TEMP || '/tmp'}/vyneural-loop-${Date.now()}`;
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
const cmd = (m, params) => new Promise((res) => { const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method: m, params })); });
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending[m.id]) { pending[m.id](m.result); delete pending[m.id]; } });
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const evaluate = async (expr) => {
  const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.value;
};

// Mismo orden que platform-check: / primero, luego /cuenta, token, /cuenta de nuevo
await cmd('Page.navigate', { url: BASE + '/' });
await sleep(4500);
await cmd('Page.navigate', { url: BASE + '/cuenta' });
await sleep(3000);
await evaluate(`localStorage.setItem('vyneural_access_token', ${JSON.stringify(TOKEN)});
                localStorage.setItem('vyneural_refresh_token', 'x'); 'ok'`);
await cmd('Page.navigate', { url: BASE + '/cuenta' });
await sleep(4500);

const probe = `(async () => {
  const t = document.getElementById('cuenta-push-text');
  const sub = document.getElementById('cuenta-push-subscribe');
  let pushSub = null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    pushSub = reg ? !!(await reg.pushManager.getSubscription()) : 'nosw';
  } catch (e) { pushSub = 'err'; }
  return JSON.stringify({
    gate: (() => { const g = document.getElementById('cuenta-gate'); return g ? g.classList.contains('hidden') : 'nogate'; })(),
    text: t ? (t.textContent || '').slice(0, 70) : 'NOTEXT',
    disabled: sub ? sub.disabled : 'NOBTN',
    pushSub,
  });
})()`;

for (let i = 0; i < 12; i++) {
  const s = JSON.parse((await evaluate(probe)) || '{}');
  const t0 = new Date().toISOString().slice(11, 19);
  console.log(`t=${t0} iter=${i} gate=${s.gate} disabled=${s.disabled} pushSub=${s.pushSub} text="${s.text}"`);
  await sleep(4000);
}
ws.close();
try { chrome.kill(); } catch {}
