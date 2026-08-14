// src/core/capabilities.js
// Sondeo de capacidades reales de la plataforma (P10/P37/P38).
//
// NO trata todo como "permisos": cada capacidad es distinta y se muestra al
// usuario solo si realmente existe, con su función exacta:
//
//   Notificaciones → avisos del sistema (alarmas, recordatorios).
//   Media Session  → controles del reproductor desde el SO. NO es un
//                    permiso y NO depende de Notification.
//   Wake Lock      → mantiene la pantalla activa; NO garantiza audio en
//                    segundo plano.
//   Push           → eventos enviados por un servidor; requiere backend.
//   Audio          → políticas de autoplay del navegador.
//
// Es pura (recibe flags inyectados) para poder testearla headless; main.js
// la alimenta con los valores reales del navegador.

/**
 * @param {object} s
 * @param {boolean} [s.notificationSupported]
 * @param {string|null} [s.notificationPermission] 'default'|'granted'|'denied'|null
 * @param {boolean} [s.mediaSessionSupported]
 * @param {boolean} [s.mediaSessionActive]          ¿playbackState 'playing'?
 * @param {boolean} [s.wakeLockSupported]
 * @param {boolean} [s.wakeLockActive]
 * @param {boolean} [s.pushSupported]               ¿PushManager + serviceWorker?
 * @param {boolean} [s.pushConfigured]              ¿Backend de Web Push configurado?
 * @param {boolean} [s.iosNeedsInstall]
 * @returns {object} Capacidades con etiquetas honestas.
 */
export function probeCapabilities({
  notificationSupported = false,
  notificationPermission = null,
  mediaSessionSupported = false,
  mediaSessionActive = false,
  wakeLockSupported = false,
  wakeLockActive = false,
  pushSupported = false,
  pushConfigured = false,
  iosNeedsInstall = false,
}) {
  return {
    notifications: {
      supported: notificationSupported,
      permission: notificationSupported ? notificationPermission : null,
      label: notifCapabilityLabel({ notificationSupported, notificationPermission, iosNeedsInstall }),
    },
    mediaSession: {
      supported: mediaSessionSupported,
      active: mediaSessionActive,
      // Los controles del sistema no requieren permiso de notificaciones.
      label: mediaSessionSupported
        ? (mediaSessionActive ? 'Controles activos' : 'Disponible (al reproducir)')
        : 'No soportado',
    },
    wakeLock: {
      supported: wakeLockSupported,
      active: wakeLockActive,
      // Honesto: mantiene la pantalla encendida; no es una garantía de audio.
      label: wakeLockSupported ? (wakeLockActive ? 'Pantalla activa ✓' : 'Pantalla activa disponible') : 'No soportado',
    },
    push: {
      supported: pushSupported,
      configured: pushConfigured,
      label: pushConfigured ? 'Configurado' : pushSupported ? 'No configurado — requiere servidor' : 'No soportado',
    },
    audio: {
      label: 'Autoplay según políticas del navegador (se inicia con un toque)',
    },
  };
}

export function notifCapabilityLabel({ notificationSupported, notificationPermission, iosNeedsInstall }) {
  if (!notificationSupported) return 'No soportado en este navegador';
  if (notificationPermission === 'granted') return 'Concedido ✓';
  if (notificationPermission === 'denied') return 'Denegado en el navegador';
  if (iosNeedsInstall) return 'Requiere instalar la app (iOS)';
  return 'Sin decidir';
}
