// src/platform/platform-capabilities.js
// P0 — Separación Core / Platform.
//
// Distingue el ENTORNO real y fusiona las capacidades de la WEB
// (probeCapabilities, honestas) con las del shell NATIVO (Android) cuando el
// bridge está presente. Regla del P0 gate §2/§8:
//
//   "Un Chrome Android sigue siendo WEB" — android-native SOLO cuando el
//   bridge respondió el handshake; el user-agent jamás concede capacidades.
//
// Es pura (recibe inyección) para poder testearla headless.

/**
 * Clasifica el entorno real (nunca por UA para conceder capacidades).
 * @param {object} [env]
 * @param {string} [env.ua]            navigator.userAgent.
 * @param {boolean} [env.bridgePresent] ¿window.AndroidBridge detectado?
 * @returns {'desktop'|'android-browser'|'android-native'|'ios'|'unknown'}
 */
export function detectPlatformKind({ ua = '', bridgePresent = false } = {}) {
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  if (isIos) return 'ios';
  if (isAndroid) return bridgePresent ? 'android-native' : 'android-browser';
  if (!ua) return 'unknown';
  return 'desktop';
}

/**
 * Fusiona capacidades web + nativas en una matriz única.
 * @param {object} p
 * @param {object} p.web         Resultado de probeCapabilities().
 * @param {object|null} p.native getState() del adaptador de bridge (null si no hay APK).
 * @param {object} [p.env]       { ua, bridgePresent } para clasificar el entorno.
 * @returns {object} Matriz con provider y estados separados.
 */
export function mergePlatformCapabilities({ web, native = null, env = {} }) {
  const isNative = !!(native && native.present);
  const platformKind = detectPlatformKind({
    ua: env.ua || '',
    bridgePresent: isNative,
  });

  // Notificaciones: nativo puede avisar con la app cerrada; la web no.
  const notif = isNative
    ? {
        provider: 'native',
        supported: !!native.info && !!native.info.notifications,
        granted: (native.info && native.info.notificationPermission) === 'granted',
        permission: native.info && native.info.notificationPermission
          ? native.info.notificationPermission
          : web.notifications.permission,
        label: notifNativeLabel(native),
      }
    : { provider: 'web', granted: web.notifications.permission === 'granted', ...web.notifications };

  // Audio en segundo plano: web limitada; APK con Foreground Service lo
  // garantiza si el sistema lo permite.
  const backgroundAudio = isNative
    ? {
        provider: 'native',
        supported: !!native.info && !!native.info.backgroundService,
        active: !!native.info && !!native.info.backgroundServiceActive,
        label: native.info && native.info.backgroundService
          ? (native.info.backgroundServiceActive ? 'Servicio activo ✓' : 'Disponible (Foreground Service)')
          : 'No disponible en este dispositivo',
      }
    : {
        provider: 'web',
        supported: false,
        active: false,
        label: 'Limitado por el navegador (la pestaña debe seguir viva)',
      };

  // Alarmas exactas: solo la APK con el SO.
  const exactAlarms = isNative
    ? {
        provider: 'native',
        supported: !!native.info && !!native.info.exactAlarms,
        granted: !!native.info && !!native.info.exactAlarmsGranted,
        label: native.info && native.info.exactAlarms
          ? (native.info.exactAlarmsGranted ? 'Autorizadas ✓' : 'Requiere configuración del sistema')
          : 'No soportado en este dispositivo',
      }
    : {
        provider: 'web',
        supported: false,
        granted: false,
        label: 'No garantizado sin la app (requiere calendario o web abierta)',
      };

  // Media Session: nativa en la APK; web depende del navegador.
  const mediaSession = isNative
    ? {
        provider: 'native',
        supported: !!native.info && !!native.info.mediaSession,
        active: !!native.info && !!native.info.mediaSessionActive,
        label: native.info && native.info.mediaSession
          ? (native.info.mediaSessionActive ? 'Controles activos ✓' : 'Disponible (al reproducir)')
          : 'No soportado',
      }
    : { provider: 'web', ...web.mediaSession, label: web.mediaSession.label };

  return {
    platformKind,
    platform: isNative ? 'android' : 'web',
    native: isNative,
    notifications: notif,
    backgroundAudio,
    exactAlarms,
    mediaSession,
    // La APK no cambia estas: push sigue necesitando backend; wake lock es
    // pantalla, no audio.
    wakeLock: web.wakeLock,
    push: web.push,
    audio: web.audio,
  };
}

function notifNativeLabel(native) {
  const perm = native.info && native.info.notificationPermission;
  if (perm === 'granted') return 'Nativa — concedido ✓';
  if (perm === 'denied') return 'Nativa — denegado en el sistema';
  return 'Nativa — sin decidir';
}
