// scripts/pwa-audit.mjs
// Auditoría de la PWA (perfil PWA) en Chrome real del HOST:
//
//   1. INSTALABILIDAD: manifest (name, start_url, display, icons 192/512,
//      scope), service worker registrado y controlador, HTTPS, viewport.
//   2. RUNTIME STANDALONE: display-mode 'standalone' (--app), SW controller
//      activo, audio con ruta única (transporte 'element', gain, RMS),
//      MediaSession con metadata, y comportamiento al pasar a segundo plano
//      (visibilitychange → ctx no suspendido si hay ancla/transporte).
//
// Uso (dos fases):
//   node scripts/pwa-audit.mjs install   → contra Chrome HEADLESS (CDP 9224)
//   node scripts/pwa-audit.mjs standalone → contra Chrome --app (CDP 9225)
import { execSync } from 'child_process';

const PORT = process.argv[2] === 'standalone' ? '9225' : '9224';
const URL = process.env.PWA_URL || 'https://vyneural-six.vercel.app/';

function wsUrl() {
  const json = JSON.parse(execSync(`curl -s http://localhost:${PORT}/json`, { encoding: 'utf8' }));
  const page = json.find((t) => t.type === 'page');
  if (!page) throw new Error(`sin página CDP en ${PORT} — ¿Chrome corriendo?`);
  return page.webSocketDebuggerUrl;
}

function evaluate(expr) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl());
    const t = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('timeout')); }, 10000);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === 1) {
        clearTimeout(t);
        try { ws.close(); } catch {}
        if (msg.error) return reject(new Error(JSON.stringify(msg.error)));
        const r = msg.result && msg.result.result;
        resolve(r && r.value !== undefined ? r.value : r);
      }
    };
    ws.onerror = () => { clearTimeout(t); reject(new Error('ws error')); };
  });
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function auditInstall() {
  const out = await evaluate(`(async () => {
    const r = {};
    r.https = location.protocol === 'https:';
    // Manifest
    const links = Array.from(document.querySelectorAll('link[rel="manifest"]'));
    r.manifestLink = links.length > 0;
    let manifest = null;
    try {
      const m = await (await fetch(links[0].href)).json();
      manifest = {
        name: m.name, short_name: m.short_name, start_url: m.start_url,
        display: m.display, scope: m.scope, theme: m.theme_color,
        icons: (m.icons || []).map((i) => ({ sizes: i.sizes, type: i.type })),
      };
    } catch (e) { r.manifestError = String(e); }
    r.manifest = manifest;
    r.has192 = !!(manifest && manifest.icons && manifest.icons.some((i) => i.sizes === '192x192'));
    r.has512 = !!(manifest && manifest.icons && manifest.icons.some((i) => i.sizes === '512x512'));
    r.validDisplay = !!(manifest && (manifest.display === 'standalone' || manifest.display === 'fullscreen' || manifest.display === 'minimal-ui'));
    r.startUrlOk = !!(manifest && manifest.start_url && manifest.start_url.startsWith('/'));
    // Service worker: la primera visita registra pero no controla todavía;
    // si no hay controller, se recarga para que el SW tome el control.
    r.swSupported = 'serviceWorker' in navigator;
    let reg = null;
    try { reg = await navigator.serviceWorker.getRegistration(); } catch {}
    r.swRegistered = !!reg;
    if (!navigator.serviceWorker.controller) {
      location.reload();
      await new Promise((x) => setTimeout(x, 3500));
    }
    r.swController = !!navigator.serviceWorker.controller;
    r.viewport = !!document.querySelector('meta[name="viewport"]');
    // Señal de instalabilidad (beforeinstallprompt) capturada en la página.
    r.installPromptFired = window.__installPromptFired === true;
    return JSON.stringify(r);
  })()`);
  const r = JSON.parse(out);
  check('HTTPS', r.https);
  check('manifest enlazado', r.manifestLink);
  check('manifest válido (name/start/display/scope)', !!r.manifest && !!r.manifest.name && !!r.manifest.name && r.validDisplay && r.startUrlOk, r.manifest ? `display=${r.manifest.display} start=${r.manifest.start_url}` : r.manifestError);
  check('iconos 192 + 512', r.has192 && r.has512);
  check('service worker registrado', r.swRegistered);
  check('service worker controla la página', r.swController);
  check('viewport', r.viewport);
  const failed = results.filter((x) => !x.ok);
  console.log(`\n=== PWA INSTALABILIDAD: ${failed.length === 0 ? 'PASS' : `FAIL (${failed.length})`} ===`);
}

async function auditStandalone() {
  const out = await evaluate(`(async () => {
    const r = {};
    const dm = (() => {
      try {
        if (window.matchMedia('(display-mode: standalone)').matches) return 'standalone';
        if (window.matchMedia('(display-mode: fullscreen)').matches) return 'fullscreen';
      } catch (_) {}
      return 'browser';
    })();
    r.displayMode = dm;
    r.swController = !!navigator.serviceWorker.controller;
    r.isStandaloneWindow = !!window.chrome && (window.outerWidth - window.innerWidth < 30);
    // Play
    document.getElementById('play-btn').click();
    await new Promise((x) => setTimeout(x, 1500));
    const a = window.__audioProbe ? window.__audioProbe() : null;
    const s = a && a.stats;
    const t = a && a.transport;
    r.audio = {
      ctx: s && s.ctxState, gain: s && s.gain, rms: s && s.rms,
      tmode: t && t.mode, tpaused: t && t.elementPaused, sid: s && s.sessionId,
      single: window.__assertSingleAudioProvider ? window.__assertSingleAudioProvider() : null,
    };
    r.mediaSession = 'mediaSession' in navigator ? {
      pb: navigator.mediaSession.playbackState,
      title: navigator.mediaSession.metadata && navigator.mediaSession.metadata.title,
    } : null;
    r.badge = (() => { const b = document.getElementById('platform-badge'); return b ? { text: b.textContent, hidden: b.classList.contains('hidden') } : null; })();
    // Background: simular segundo plano (visibilitychange) y ver si el ctx
    // se suspende (debe seguir running con el transporte 'element').
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((x) => setTimeout(x, 700));
    const a2 = window.__audioProbe ? window.__audioProbe() : null;
    r.afterBackground = { ctx: a2 && a2.stats && a2.stats.ctxState, gain: a2 && a2.stats ? Number(a2.stats.gain).toFixed(3) : null };
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    return JSON.stringify(r);
  })()`);
  const r = JSON.parse(out);
  check('display-mode standalone (ventana --app)', r.displayMode === 'standalone', `displayMode=${r.displayMode}`);
  check('service worker controla la ventana standalone', r.swController === true, `controller=${r.swController}`);
  check('audio ruta única (element · gain · rms)', r.audio.tmode === 'element' && r.audio.gain > 0 && r.audio.rms > 0 && r.audio.single === true, `ctx=${r.audio.ctx} gain=${r.audio.gain && r.audio.gain.toFixed(2)} rms=${r.audio.rms && r.audio.rms.toFixed(3)}`);
  check('sessionId estable (sin doble pipeline)', r.audio.sid === 1, `sid=${r.audio.sid}`);
  check('MediaSession con metadata', !!r.mediaSession && !!r.mediaSession.title, r.mediaSession ? `pb=${r.mediaSession.pb} · ${r.mediaSession.title}` : 'sin metadata');
  check('badge NO afirma APK en PWA', r.badge ? r.badge.hidden === false && r.badge.text === 'PWA' : false, r.badge ? `${r.badge.text} hidden=${r.badge.hidden}` : 'sin badge');
  check('AudioContext NO suspendido al pasar a segundo plano', r.afterBackground.ctx === 'running', `ctx=${r.afterBackground.ctx}`);
  const failed = results.filter((x) => !x.ok);
  console.log(`\n=== PWA RUNTIME STANDALONE: ${failed.length === 0 ? 'PASS' : `FAIL (${failed.length})`} ===`);
}

if (process.argv[2] === 'standalone') auditStandalone();
else auditInstall();
