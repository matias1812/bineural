// src/platform/fullscreen.js
// Pantalla completa y rotación para web y APK con un solo contrato:
//   - APK (bridge nativo presente): SET_FULLSCREEN / SET_ORIENTATION → el
//     shell Android hace immersive mode y bloquea/libera la orientación.
//   - Web: Fullscreen API + screen.orientation.lock (requiere fullscreen).
// Devuelve SIEMPRE { ok } o { ok:false, error } — nunca lanza.

export function isFullscreen() {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement
  );
}

/**
 * Activa/desactiva pantalla completa.
 * @param {boolean} enabled
 * @param {{ present:boolean, setFullscreen?:Function }} [bridge]
 */
export async function setFullscreen(enabled, bridge) {
  if (bridge && bridge.present && typeof bridge.setFullscreen === 'function') {
    return bridge.setFullscreen(enabled ? { enabled: true } : { enabled: false });
  }
  try {
    if (enabled) {
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      else return { ok: false, error: 'Fullscreen API no disponible' };
    } else {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

/**
 * Bloquea/libera la orientación.
 * @param {'portrait'|'landscape'|'sensor'} mode
 * @param {{ present:boolean, setOrientation?:Function }} [bridge]
 */
export async function setOrientation(mode, bridge) {
  if (bridge && bridge.present && typeof bridge.setOrientation === 'function') {
    return bridge.setOrientation({ mode });
  }
  try {
    const o = screen.orientation || screen.msOrientation;
    if (!o || typeof o.lock !== 'function') {
      return { ok: false, error: 'screen.orientation.lock no disponible' };
    }
    const map = { portrait: 'portrait-primary', landscape: 'landscape-primary', sensor: 'any' };
    await o.lock(map[mode] || 'any');
    return { ok: true };
  } catch (e) {
    // En Android Chrome solo funciona dentro de fullscreen; se reporta.
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

/** Estado actual para la UI de diagnóstico. */
export function screenState() {
  return {
    fullscreen: isFullscreen(),
    orientation: screen.orientation ? screen.orientation.type : null,
    inner: { w: window.innerWidth, h: window.innerHeight },
    dpr: window.devicePixelRatio || 1,
  };
}
