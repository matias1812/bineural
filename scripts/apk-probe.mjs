// scripts/apk-probe.mjs
// Sonda CDP: ejecuta expresiones dentro del WebView de la APK (emulador) y
// reporta el estado REAL (bridge, provider, capacidades, audio, media session).
// Uso: node scripts/apk-probe.mjs [expresión]   (default: sondeo completo)
import { readFileSync } from 'fs';

const EXPR = process.argv[2];
const wsUrl = process.env.CDP_WS || 'ws://localhost:9222/devtools/page/FDA3CA69B9FF190B448063E2951FE9AC';

function evaluate(expr) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const t = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('timeout')); }, 8000);
    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression: expr, returnByValue: true, awaitPromise: true },
      }));
    };
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
    ws.onerror = (e) => { clearTimeout(t); reject(new Error('ws error')); };
  });
}

const PROBE = `(() => {
  const out = {};
  out.ua = navigator.userAgent;
  out.url = location.href;
  out.ready = document.readyState;
  out.platformBadge = (document.getElementById('platform-badge')||{}).textContent;
  out.platformBadgeHidden = (document.getElementById('platform-badge')||{}).classList ? document.getElementById('platform-badge').classList.contains('hidden') : null;
  out.hasAndroidBridge = typeof window.AndroidBridge !== 'undefined';
  out.hasAndroidBridgeNative = typeof window.AndroidBridgeNative !== 'undefined';
  out.bridge = window.__nativeBridge ? {
    present: window.__nativeBridge.present,
    platform: window.__nativeBridge.platform,
    bridgeStatus: window.__nativeBridge.bridgeStatus,
    info: window.__nativeBridge.info,
  } : null;
  out.provider = typeof window.__audioProvider === 'function' ? window.__audioProvider() : null;
  out.singleProvider = typeof window.__assertSingleAudioProvider === 'function' ? window.__assertSingleAudioProvider() : null;
  out.lifecycle = window.__lifecycle ? window.__lifecycle.summary() : null;
  out.audioState = window.__audioState ? window.__audioState.summary() : null;
  const probe = typeof window.__audioProbe === 'function' ? window.__audioProbe() : null;
  out.audioProbe = probe ? {
    ctxState: probe.ctx ? probe.ctx.state : null,
    stats: probe.stats,
    transport: probe.transport,
  } : null;
  out.mediaSession = 'mediaSession' in navigator ? {
    supported: true,
    playbackState: navigator.mediaSession.playbackState,
    metadata: navigator.mediaSession.metadata ? {
      title: navigator.mediaSession.metadata.title,
      artist: navigator.mediaSession.metadata.artist,
      album: navigator.mediaSession.metadata.album,
    } : null,
  } : { supported: false };
  out.wakeLock = window.__lifecycle ? null : null;
  out.capabilities = (typeof window.__nativeBridge !== 'undefined' && window.__nativeBridge) ? null : null;
  return JSON.stringify(out);
})()`;

const run = async () => {
  try {
    const r = await evaluate(EXPR || PROBE);
    if (typeof r === 'string') {
      try { console.log(JSON.stringify(JSON.parse(r), null, 2)); }
      catch { console.log(r); }
    } else {
      console.log(JSON.stringify(r, null, 2));
    }
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
};
run();
