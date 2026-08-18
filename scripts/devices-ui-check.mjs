// scripts/devices-ui-check.mjs
// Verifica la sección "📱 Dispositivos" de /cuenta contra un backend local
// (http://localhost:8000) sirviendo dist en :5174.
// Uso: TOKEN="<token>" node scripts/devices-ui-check.mjs
import { spawn } from 'child_process';

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:5174';
const TOKEN = process.env.TOKEN;
const PORT = 9455;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = `${process.env.TEMP || '/tmp'}/vyneural-dev-${Date.now()}`;
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
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
  if (r.exceptionDetails) return 'EXC: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 160);
  return r.result?.value;
};

await cmd('Page.navigate', { url: BASE + '/cuenta' });
await sleep(3500);
await evaluate(`localStorage.setItem('vyneural_access_token', ${JSON.stringify(TOKEN)});
                localStorage.setItem('vyneural_refresh_token', 'x'); 'ok'`);
await cmd('Page.navigate', { url: BASE + '/cuenta' });
await sleep(5000);

const snap = await evaluate(`(async () => {
  const items = [...document.querySelectorAll('#cuenta-devices .cuenta-item')].map(li => li.textContent.replace(/\\s+/g, ' ').trim());
  return JSON.stringify({
    gateHidden: (() => { const g = document.getElementById('cuenta-gate'); return g ? g.classList.contains('hidden') : null; })(),
    cardTitle: (() => { const h = [...document.querySelectorAll('h3')].find(x => x.textContent.includes('Dispositivos')); return h ? h.textContent : null; })(),
    emptyText: (document.getElementById('cuenta-devices-empty') || {}).textContent || null,
    items,
  });
})()`);
console.log(JSON.stringify(JSON.parse(snap || '{}'), null, 2));
ws.close();
try { process.kill(chrome.pid); } catch {}
