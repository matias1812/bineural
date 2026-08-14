// src/platform/platform-capabilities.js
// P0 — Separación Core / Platform.
//
// Fusiona las capacidades de la WEB (probeCapabilities, honestas) con las
// del shell NATIVO (Android) cuando el bridge está presente. El resultado es
// la matriz única que la UI muestra: cada capacidad declara su proveedor
// ('web' | 'native') y su estado real (supported / granted / active), sin
// confundir "la API existe" con "funciona garantizado".
//
// Es pura (recibe inyección) para poder testearla headless.

/**
 * @param {object} p
 * @param {object} p.web       Resultado de probeCapabilities().
 * @param {object|null} p.native  getState() del adaptador de bridge (null si no hay APK).
 * @returns {object} Matriz fusionada con etiquetas honestas.
 */
export function mergePlatformCapabilities({ web, native = null }) {
  const isNative = !!(native && native.present);

  // Notificaciones: el proveedor nativo (si existe) puede mostrar avisos con
  // la app cerrada; la web no. El permiso real lo reporta el bridge.
  const notif = isNative
    ? {
        provider: 'native',
        supported: !!native.info && !!native.info.notifications,
        permission: native.info && native.info.notificationPermission ? native.info.notificationPermission : web.notifications.permission,
        label: notifNativeLabel(native),
      }
    : { provider: 'web', ...web.notifications, label: web.notifications.label };

  // Audio en segundo plano: la web está limitada por el navegador/SO; la APK
  // con Foreground Service lo garantiza (si el sistema lo permite).
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

  // Alarmas exactas: solo la APK puede garantizarlas con el SO.
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

  // Media Session: la APK la implementa nativamente; la web depende del
  // navegador.
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
    platform: isNative ? 'android' : 'web',
    native: isNative,
    notifications: notif,
    backgroundAudio,
    exactAlarms,
    mediaSession,
    // Las capacidades web que la APK no cambia (push sigue necesitando
    // backend; wake lock es pantalla, no audio).
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
