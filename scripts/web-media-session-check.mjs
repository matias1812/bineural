// scripts/web-media-session-check.mjs
// Valida los CONTROLES REALES de la MediaSession en la web desplegada:
// arranca una sesión, despacha teclas de medios del SO (MediaPlayPause,
// MediaStop) vía CDP y verifica que la app responda (estado + botón de la
// UI). Reproduce lo que ve el usuario: "la media session aparece pero no
// controla nada".
// Uso: node scripts/web-media-session-check.mjs
import { spawn, execSync } from 'child_process';

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9448;
const BASE = process.env.URL_BASE || 'https://vyneural-six.vercel.app';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = `${process.env.TEMP || '/tmp'}/vyneural-msweb-${Date.now()}`;
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
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
const mediaKey = (code, vk) =>
  cmd('Input.dispatchKeyEvent', {
    type: 'keyDown',
    windowsVirtualKeyCode: vk,
    nativeVirtualKeyCode: 0,
    code,
    key: code,
    modifiers: 0,
  }).catch(() => {});

const state = () =>
  evaluate(`(() => {
    const v = window.__vyneural;
    const btn = document.getElementById('play-btn') || document.querySelector('.play-btn');
    return JSON.stringify({
      apiPlaying: v ? v.state().playing : null,
      btnClass: btn ? btn.className : null,
      msPb: 'mediaSession' in navigator ? navigator.mediaSession.playbackState : null,
      msTitle: 'mediaSession' in navigator && navigator.mediaSession.metadata ? navigator.mediaSession.metadata.title : null,
    });
  })()`);

// Cargar y arrancar.
await cmd('Page.navigate', { url: BASE + '/' });
await sleep(4000);
await evaluate(`(() => { const v = window.__vyneural; if (v) v.play(); return 'played'; })()`);
await sleep(2500);
console.log('=== Tras PLAY (web) ===');
console.log(JSON.parse((await state()) || '{}'));

// 1) MediaPlayPause → debe pausar. (0xB3 = VK_MEDIA_PLAY_PAUSE)
await mediaKey('MediaPlayPause', 0xb3);
await sleep(1500);
const afterPause = JSON.parse((await state()) || '{}');
console.log('=== Tras MediaPlayPause (tecla SO) ===');
console.log(afterPause);

// 2) MediaPlayPause de nuevo → debe reanudar.
await mediaKey('MediaPlayPause', 0xb3);
await sleep(1500);
const afterResume = JSON.parse((await state()) || '{}');
console.log('=== Tras 2º MediaPlayPause ===');
console.log(afterResume);

// 3) MediaStop → debe detener. (0xB2 = VK_MEDIA_STOP)
await mediaKey('MediaStop', 0xb2);
await sleep(1500);
const afterStop = JSON.parse((await state()) || '{}');
console.log('=== Tras MediaStop ===');
console.log(afterStop);

try { chrome.kill(); } catch {}

const fail = !afterPause.apiPlaying === false || afterResume.apiPlaying !== true || afterStop.apiPlaying !== false;
console.log(fail ? '\n❌ LA WEB NO RESPONDE A LOS CONTROLES DE MEDIA' : '\n✅ LA WEB RESPONDE A LOS CONTROLES DE MEDIA');
process.exit(fail ? 1 : 0);
