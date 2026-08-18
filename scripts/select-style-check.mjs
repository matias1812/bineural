// scripts/select-style-check.mjs
// Verifica visualmente los <select> del accordion en /cuenta (estilo oscuro)
// y saca un screenshot. Uso: TOKEN="<access_token>" node scripts/select-style-check.mjs
import { spawn, execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9447;
const BASE = process.env.URL_BASE || 'https://vyneural-six.vercel.app';
const TOKEN = process.env.TOKEN || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync('docs/evidence/responsive', { recursive: true });

if (!TOKEN) {
  console.error('Falta TOKEN.');
  process.exit(1);
}

const profile = `${process.env.TEMP || '/tmp'}/vyneural-sel-${Date.now()}`;
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profile}`,
    '--window-size=1280,1600',
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

await cmd('Page.navigate', { url: BASE + '/cuenta' });
await sleep(3000);
await evaluate(
  `localStorage.setItem('vyneural_access_token', ${JSON.stringify(TOKEN)});
   localStorage.setItem('vyneural_refresh_token', 'x'); 'ok'`,
);
await cmd('Page.navigate', { url: BASE + '/cuenta' });
await sleep(4000);

// Abrir el accordion "Crear itinerario".
await evaluate(`(() => { const d = document.querySelector('.cuenta-create'); if (d) d.open = true; return 'ok'; })()`);
await sleep(800);

const r = await evaluate(`(() => {
  const sel = document.getElementById('it-step-freq');
  if (!sel) return JSON.stringify({ missing: true });
  const cs = getComputedStyle(sel);
  const opt = sel.options[0] ? getComputedStyle(sel.options[0]) : null;
  return JSON.stringify({
    selectBg: cs.backgroundColor,
    selectColor: cs.color,
    optionBg: opt ? opt.backgroundColor : null,
    optionColor: opt ? opt.color : null,
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
  });
})()`);
console.log('=== Estilos del select en el accordion ===');
console.log(r);

const shot = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
writeFileSync('docs/evidence/responsive/cuenta-accordion-selects.png', Buffer.from(shot.data, 'base64'));
console.log('Screenshot: docs/evidence/responsive/cuenta-accordion-selects.png');

try { chrome.kill(); } catch {}
process.exit(0);
