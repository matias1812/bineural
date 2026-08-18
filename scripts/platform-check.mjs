// scripts/platform-check.mjs
// Chequeo UNIFICADO de la plataforma sobre la web DESPLEGADA (y opcionalmente
// la APK vía CDP del emulador). Reemplaza badge-check.mjs, push-flow-check.mjs
// y select-style-check.mjs en un solo comando con resumen verde/rojo.
//
//   # Web (desplegada, requiere token para /cuenta)
//   TOKEN="<access_token>" node scripts/platform-check.mjs web
//
//   # Web sin token (solo /, badge + SW + media session web)
//   node scripts/platform-check.mjs web
//
//   # APK en el emulador (usa el CDP del WebView en el puerto 9222)
//   node scripts/platform-check.mjs apk
//
// Requiere: Chrome instalado (web), emulador con la APK instalada y
// `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>` (apk).
import { spawn, execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.URL_BASE || 'https://vyneural-six.vercel.app';
const TOKEN = process.env.TOKEN || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync('docs/evidence/responsive', { recursive: true });

const MODE = process.argv[2] || 'web';
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── Cliente CDP minimalista ────────────────────────────────────────────────
function makeCdp(wsUrl) {
  let nextId = 1;
  const pending = new Map();
  const ws = new WebSocket(wsUrl);
  const opened = new Promise((res, rej) => {
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
  const cmd = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return r && r.result ? r.result.value : undefined;
  };
  return { opened, cmd, evaluate, ws };
}

// En Windows `chrome.kill()` no termina el árbol detached: un Chrome headless
// zombie podía quedar vivo con el perfil viejo (ya suscrito) y secuestrar el
// puerto — la corrida siguiente se conectaba al zombie y daba falsos fallos.
// Acá se mata por PID real (taskkill /T) y se limpia el puerto antes de arrancar.
function killChromeTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
  } catch { /* ya no existía */ }
}

function freePort(port) {
  try {
    const out = execSync(`netstat -ano | grep ":${port} "`, { encoding: 'utf8', shell: process.env.ComSpec || 'cmd.exe' });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      const m = line.trim().match(/\s(\d+)\s*$/);
      if (m && /LISTENING/.test(line)) pids.add(m[1]);
    }
    for (const p of pids) killChromeTree(p);
  } catch { /* puerto libre */ }
}

async function launchChrome(port, extraFlags = []) {
  freePort(port);
  const profile = `${process.env.TEMP || '/tmp'}/vyneural-plat-${Date.now()}`;
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--autoplay-policy=no-user-gesture-required',
      ...extraFlags,
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
      const list = JSON.parse(execSync(`curl -s http://127.0.0.1:${port}/json/list`, { encoding: 'utf8' }));
      const page = list.find((t) => t.type === 'page');
      if (page) {
        wsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch { /* arrancando */ }
    await sleep(500);
  }
  if (!wsUrl) throw new Error(`Chrome no arrancó en el puerto ${port}`);
  const cdp = makeCdp(wsUrl);
  await cdp.opened;
  return { chrome, ...cdp };
}

// ── Modo WEB ───────────────────────────────────────────────────────────────
async function checkWeb() {
  console.log('\n════════ WEB DESPLEGADA ════════');
  const cdp = await launchChrome(9449);
  const { chrome, cmd, evaluate } = cdp;

  // 1) Badge + SW en /
  await cmd('Page.navigate', { url: BASE + '/' });
  await sleep(4500);
  let r = JSON.parse((await evaluate(PROBE_BADGE_SW)) || '{}');
  check('Badge WEB en /', r.badge && r.badge.text === 'WEB' && !r.badge.cls.includes('hidden'), `${r.badge ? r.badge.text + ' · ' + r.badge.cls : 'sin badge'}`);
  check('Service worker registrado en /', !!r.sw, r.sw ? r.sw.scope : 'no');

  // 2) /cuenta: badge + SW + botón de push + selects oscuros (si hay token).
  await cmd('Page.navigate', { url: BASE + '/cuenta' });
  await sleep(3000);
  if (TOKEN) {
    await evaluate(
      `localStorage.setItem('vyneural_access_token', ${JSON.stringify(TOKEN)});
       localStorage.setItem('vyneural_refresh_token', 'x'); 'ok'`,
    );
    await cmd('Page.navigate', { url: BASE + '/cuenta' });
    await sleep(4500);
  }
  r = JSON.parse((await evaluate(PROBE_CUENTA)) || '{}');
  check('Badge WEB en /cuenta', r.badge && r.badge.text === 'WEB', r.badge ? r.badge.text : 'sin badge');
  check('Service worker registrado en /cuenta', !!r.sw, r.sw ? r.sw.scope : 'no');
  check('Botón de push presente', !!r.pushBtn, r.pushBtn ? '' : 'sin botón');

  if (TOKEN) {
    // Accordion de itinerario: select con opciones oscuras.
    await evaluate(`(() => { const d = document.querySelector('.cuenta-create'); if (d) d.open = true; return 'ok'; })()`);
    await sleep(800);
    r = JSON.parse((await evaluate(PROBE_SELECT)) || '{}');
    // Fondo oscuro: RGB total < 200 (el blanco del sistema sería ~765).
    const m = r.optionBg ? r.optionBg.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/) : null;
    const darkBg = !!m && (Number(m[1]) + Number(m[2]) + Number(m[3])) < 200;
    check('Select oscuro (accordion)', darkBg, `optionBg=${r.optionBg}`);
    check('color-scheme dark', r.colorScheme === 'dark', r.colorScheme);

    // Push end-to-end (permiso vía CDP + clic real). El backend de Render
    // free puede estar en cold start: reintentar hasta que el botón se habilite.
    try {
      await cmd('Browser.grantPermissions', { origin: BASE, permissions: ['notifications'] });
    } catch { /* no disponible */ }
    let btnReady = false;
    for (let i = 0; i < 10; i++) {
      const st = JSON.parse((await evaluate(PROBE_CUENTA)) || '{}');
      if (st.pushBtn && !st.pushBtn.disabled) {
        btnReady = true;
        break;
      }
      await sleep(4000);
    }
    check('Botón de push habilitado (tras espera)', btnReady, btnReady ? '' : 'sigue deshabilitado');
    await evaluate(`document.getElementById('cuenta-push-subscribe').click(); 'clicked'`);
    await sleep(6000);
    r = JSON.parse((await evaluate(PROBE_PUSH_AFTER)) || '{}');
    check('Push end-to-end (suscripción)', r.subscribed === true, r.subscribed ? 'suscrito ✓' : (r.text || 'no'));
    check('Texto de push confirma suscripción', /suscrito/i.test(r.text || ''), r.text || '');
  } else {
    console.log('  (sin TOKEN: se omiten push end-to-end y selects de /cuenta)');
  }

  // 3) Media session web: PLAY + teclas de medios vía CDP (desktop).
  await cmd('Page.navigate', { url: BASE + '/' });
  await sleep(4000);
  await evaluate(`(() => { const v = window.__vyneural; if (v) v.play(); return 'ok'; })()`);
  await sleep(2500);
  r = JSON.parse((await evaluate(PROBE_MEDIA)) || '{}');
  check('Web reproduce (estado)', r.playing === true, `playing=${r.playing}`);
  check('MediaSession con metadata', !!r.msTitle, r.msTitle || 'sin metadata');
  // Teclas de medios del SO (desktop): MediaPlayPause / MediaStop.
  const key = (code, vk) => cmd('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: vk, nativeVirtualKeyCode: 0, code, key: code, modifiers: 0 }).catch(() => {});
  await key('MediaPlayPause', 0xb3);
  await sleep(1500);
  r = JSON.parse((await evaluate(PROBE_MEDIA)) || '{}');
  const responded = r.playing === false;
  // Informativo: Chrome headless no siempre rutea teclas de medios a la
  // MediaSession; la validación real de los controles del SO se hace en el
  // emulador (modo apk) o en un navegador con ventana.
  console.log(`  ℹ️  Controles de media (desktop headless): ${responded ? 'pausó con la tecla ✓' : 'no rutea teclas en headless (validar en navegador real / modo apk)'}`);

  // Screenshot del badge para evidencia.
  const shot = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync('docs/evidence/responsive/platform-check-web-badge.png', Buffer.from(shot.data, 'base64'));

  try { killChromeTree(chrome.pid); } catch {}
}

// ── Modo APK (emulador) ────────────────────────────────────────────────────
async function checkApk() {
  console.log('\n════════ APK (EMULADOR, CDP WebView) ════════');
  const list = JSON.parse(execSync('curl -s -m 5 http://127.0.0.1:9222/json/list', { encoding: 'utf8' }));
  const page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('Sin página del WebView en el puerto 9222. Ejecutá: adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>');
  const cdp = makeCdp(page.webSocketDebuggerUrl);
  await cdp.opened;
  const { evaluate } = cdp;

  const r = JSON.parse((await evaluate(PROBE_APK)) || '{}');
  check('Plataforma APK (bridge)', r.bridge && r.bridge.present, r.bridge ? `${r.bridge.platform} · ${r.bridge.bridgeStatus}` : 'sin bridge');
  check('Badge APK en el header', r.badge === 'APK', r.badge || 'sin badge');
  check('MediaSession nativa declarada (bridge)', r.mediaSession && r.mediaSession.supported, r.mediaSession && r.mediaSession.supported ? `controls=${(r.mediaSession.controls || []).join(',')}` : 'no');
  check('Estado honrado (stopped sin tocar)', r.mediaSession && r.mediaSession.playbackState === 'stopped', r.mediaSession ? r.mediaSession.playbackState : '—');
  check('Sin overflow en el header', r.overflowHeader === 0, `overflow=${r.overflowHeader}`);
  check('band-table en contenedor scrollable', r.bandTableContained, '');
}

// ── Sondas ─────────────────────────────────────────────────────────────────
const PROBE_BADGE_SW = `(async () => {
  const b = document.getElementById('platform-badge');
  let sw = null;
  if ('serviceWorker' in navigator) {
    try { const reg = await navigator.serviceWorker.getRegistration(); sw = reg ? { scope: reg.scope } : null; } catch {}
  }
  return JSON.stringify({ badge: b ? { text: b.textContent, cls: b.className } : null, sw });
})()`;

const PROBE_CUENTA = `(async () => {
  const b = document.getElementById('platform-badge');
  let sw = null;
  if ('serviceWorker' in navigator) {
    try { const reg = await navigator.serviceWorker.getRegistration(); sw = reg ? { scope: reg.scope } : null; } catch {}
  }
  const sub = document.getElementById('cuenta-push-subscribe');
  return JSON.stringify({ badge: b ? { text: b.textContent, cls: b.className } : null, sw, pushBtn: sub ? { disabled: sub.disabled } : null });
})()`;

const PROBE_SELECT = `(() => {
  const sel = document.getElementById('it-step-freq');
  if (!sel) return JSON.stringify({ missing: true });
  const opt = sel.options[0] ? getComputedStyle(sel.options[0]) : null;
  return JSON.stringify({ optionBg: opt ? opt.backgroundColor : null, colorScheme: getComputedStyle(document.documentElement).colorScheme });
})()`;

const PROBE_PUSH_AFTER = `(async () => {
  const t = document.getElementById('cuenta-push-text');
  let sub = null;
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      sub = reg ? await reg.pushManager.getSubscription() : null;
    }
  } catch {}
  return JSON.stringify({ subscribed: !!sub, text: t ? t.textContent : null });
})()`;

const PROBE_MEDIA = `(() => {
  const v = window.__vyneural;
  return JSON.stringify({
    playing: v ? v.state().playing : null,
    msTitle: 'mediaSession' in navigator && navigator.mediaSession.metadata ? navigator.mediaSession.metadata.title : null,
    msPb: 'mediaSession' in navigator ? navigator.mediaSession.playbackState : null,
  });
})()`;

const PROBE_APK = `(() => {
  const b = document.getElementById('platform-badge');
  const bridge = window.__nativeBridge || null;
  // En la APK la MediaSession es NATIVA (Kotlin), no la web del WebView:
  // se lee del bridge, no de navigator.mediaSession.
  const bInfo = bridge && bridge.info ? bridge.info : {};
  const ms = {
    supported: !!bInfo.mediaSession,
    active: !!bInfo.mediaSessionActive,
    playbackState: bInfo.mediaSessionPlaybackState || 'unknown',
    controls: bInfo.mediaSessionControls || [],
  };
  const table = document.querySelector('.band-table');
  const wrap = table ? table.closest('.band-table-wrap') : null;
  const cs = wrap ? getComputedStyle(wrap) : null;
  let overflowHeader = 0;
  const nav = document.querySelector('.site-nav');
  if (nav) {
    const nr = nav.getBoundingClientRect();
    document.querySelectorAll('.site-nav *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > window.innerWidth + 1) overflowHeader++;
    });
  }
  return JSON.stringify({
    badge: b ? b.textContent : null,
    bridge: bridge ? { present: bridge.present, platform: bridge.platform, bridgeStatus: bridge.bridgeStatus } : null,
    mediaSession: ms,
    overflowHeader,
    bandTableContained: !!(wrap && cs && (cs.overflowX === 'auto' || cs.overflowX === 'scroll')),
  });
})()`;

// ── Ejecutar ───────────────────────────────────────────────────────────────
try {
  if (MODE === 'apk') await checkApk();
  else await checkWeb();
} catch (e) {
  console.error('ERROR:', e.message);
  process.exit(1);
}

console.log('\n════════ RESUMEN ════════');
const fails = results.filter((r) => !r.ok);
results.forEach((r) => console.log(`  ${r.ok ? '✅' : '❌'} ${r.name}`));
console.log(fails.length === 0 ? '\nTODO EN VERDE ✓' : `\n${fails.length} chequeo(s) fallidos — revisar arriba.`);
process.exit(fails.length === 0 ? 0 : 1);
