// scripts/responsive-check.mjs
// Chequeo responsive de la web DESPLEGADA: mide overflow horizontal y saca
// screenshots a varios anchos de viewport, con sesión autenticada (token en
// localStorage) para ver /cuenta con itinerarios reales.
//
// Uso:
//   TOKEN="<access_token>" node scripts/responsive-check.mjs [360,768,1024,1440]
//
// Requiere: Chrome instalado y la web desplegada (URL_BASE, default
// https://vyneural-six.vercel.app). Guarda PNG en docs/evidence/responsive/.
import { spawn, execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';

const CHROME =
  process.env.CHROME ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9333;
const BASE = process.env.URL_BASE || 'https://vyneural-six.vercel.app';
const TOKEN = process.env.TOKEN || '';
const WIDTHS = (process.argv[2] || '360,768,1024,1440').split(',').map(Number);
const OUT_DIR = 'docs/evidence/responsive';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT_DIR, { recursive: true });

if (!TOKEN) {
  console.error('Falta TOKEN (access_token).');
  process.exit(1);
}

// ── Lanzar Chrome headless con remote debugging ────────────────────────────
const profile = `${process.env.TEMP || '/tmp'}/vyneural-chrome-${Date.now()}`;
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profile}`,
    '--window-size=1440,900',
    'about:blank',
  ],
  { stdio: 'ignore', detached: true },
);
chrome.unref();

let wsUrl = null;
for (let i = 0; i < 40; i++) {
  try {
    const list = JSON.parse(
      execSync(`curl -s http://127.0.0.1:${DEBUG_PORT}/json/list`, { encoding: 'utf8' }),
    );
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

// ── Cliente CDP minimalista ────────────────────────────────────────────────
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

// ── Medición de overflow (JS en la página) ─────────────────────────────────
// Un elemento solo es overflow REAL si no vive dentro de un contenedor con
// scroll horizontal intencional (overflow-x auto/scroll, p. ej. band-table-wrap)
// y aun así se sale del viewport.
const MEASURE = `(() => {
  const vw = window.innerWidth;
  const doc = document.documentElement;
  const over = [];
  const inScrollable = (el) => {
    let p = el.parentElement;
    while (p) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll') return true;
      p = p.parentElement;
    }
    return false;
  };
  if (doc.scrollWidth > vw + 1) over.push({ el: 'html', sw: doc.scrollWidth, cw: vw });
  document.querySelectorAll('body *').forEach((el) => {
    if (inScrollable(el)) return;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' && !el.closest('dialog, [role="dialog"], .auth-modal, .freq-modal')) return;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) {
      const cn = typeof el.className === 'string' ? '.' + el.className.split(' ').filter(Boolean).join('.') : '';
      over.push({ el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cn.slice(0, 60), right: Math.round(r.right), left: Math.round(r.left), w: Math.round(r.width) });
    }
  });
  return JSON.stringify({
    vw,
    scrollW: doc.scrollWidth,
    overflow: over.slice(0, 14),
    totalOverflow: over.length,
    inScrollContainers: document.querySelectorAll('body *').length > 0 ? 1 : 0,
    itineraryItems: document.querySelectorAll('#cuenta-itineraries .cuenta-item').length,
    scheduleRows: document.querySelectorAll('.schedule-row').length,
    scheduleVisible: document.querySelectorAll('.schedule:not(.hidden)').length,
  });
})()`;

async function screenshot(page, width, out) {
  const r = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(out, Buffer.from(r.data, 'base64'));
}

async function checkPage(path, width, label) {
  await cmd('Page.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
  await cmd('Page.navigate', { url: BASE + path });
  await sleep(3000);
  // Inyectar token y recargar para /cuenta autenticado.
  await evaluate(
    `localStorage.setItem('vyneural_access_token', ${JSON.stringify(TOKEN)});
     localStorage.setItem('vyneural_refresh_token', 'x'); 'ok'`,
  );
  await cmd('Page.navigate', { url: BASE + path });
  await sleep(3000);
  // Expandir las vistas de horario de los itinerarios (Ver horario).
  await evaluate(
    `document.querySelectorAll('[data-act="scheduleit"]').forEach(b => {
       const s = document.querySelector('[data-schedule="' + CSS.escape(b.dataset.id) + '"]');
       if (s) s.classList.remove('hidden');
     }); 'ok'`,
  );
  await sleep(600);
  const m = JSON.parse((await evaluate(MEASURE)) || '{}');
  const fail = (m.totalOverflow || 0) > 0;
  console.log(`\n=== ${label} @${width}px — ${fail ? '❌ OVERFLOW' : '✅ OK'} ===`);
  console.log(`  scrollW=${m.scrollW} vw=${m.vw} overflowEls=${m.totalOverflow} itinerarios=${m.itineraryItems} scheduleRows=${m.scheduleRows} scheduleVisible=${m.scheduleVisible}`);
  (m.overflow || []).forEach((o) => console.log(`    ⚠ ${o.el} right=${o.right} left=${o.left} w=${o.w}`));
  await screenshot(path.replace(/[^a-z0-9]+/gi, '-') || 'home', width, `${OUT_DIR}/${label.replace(/\W+/g, '-')}-${width}.png`);
  return fail;
}

// ── Ejecutar ───────────────────────────────────────────────────────────────
const results = [];
for (const w of WIDTHS) {
  results.push({ page: '/cuenta (dashboard, itinerarios)', width: w, fail: await checkPage('/cuenta', w, 'cuenta') });
  results.push({ page: '/ (home)', width: w, fail: await checkPage('/', w, 'home') });
}

console.log('\n=== RESUMEN RESPONSIVE ===');
const fails = results.filter((r) => r.fail);
results.forEach((r) => console.log(`  ${r.fail ? '❌' : '✅'} ${r.page} @${r.width}px`));
console.log(fails.length === 0 ? 'TODO EN ORDEN: sin overflow horizontal.' : `⚠ ${fails.length} caso(s) con overflow — revisar arriba.`);

try { chrome.kill(); } catch {}
process.exit(fails.length === 0 ? 0 : 1);
