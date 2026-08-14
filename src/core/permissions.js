// src/core/permissions.js
// Lógica pura de decisión de permisos web (notificaciones + Wake Lock).
// Sin DOM ni APIs de navegador a propósito: la suite científica (npm test)
// la valida headless. main.js la conecta a las APIs reales (Notification,
// navigator.wakeLock); estas decisiones son el contrato que hace que los
// permisos sean reales y no un adorno:
//
//   - Si el permiso de notificaciones está "sin decidir" y no está
//     desactivado manualmente → se pide (diálogo del sistema).
//   - Si ya está concedido o denegado → no se vuelve a pedir.
//   - Si el usuario los desactivó (⋯ → Permisos de la web) → no se pide nada.
//   - En iOS sin la PWA instalada el diálogo no existe: se explica en el
//     modal y no se hace una llamada inútil.
//   - El Wake Lock se adquiere solo si hay soporte y no está ya activo.

/**
 * Decide qué permisos hay que pedir/adquirir en este momento.
 * @param {object} s
 * @param {boolean} [s.disabled]                 Usuario desactivó permisos (localStorage).
 * @param {boolean} [s.notificationSupported]    ¿Existe Notification?
 * @param {string|null} [s.notifPermission]      'default' | 'granted' | 'denied' | null
 * @param {boolean} [s.wakeLockSupported]        ¿Existe navigator.wakeLock?
 * @param {boolean} [s.wakeLockHeld]             ¿Wake Lock ya adquirido y sin liberar?
 * @param {boolean} [s.iosNeedsInstall]          iOS sin la PWA instalada.
 * @returns {{shouldRequestNotifications: boolean, willPromptNotifications: boolean, shouldAcquireWakeLock: boolean}}
 */
export function evaluatePermissions({
  disabled = false,
  notificationSupported = false,
  notifPermission = null,
  wakeLockSupported = false,
  wakeLockHeld = false,
  iosNeedsInstall = false,
}) {
  const shouldRequestNotifications =
    !disabled && notificationSupported && notifPermission === 'default';
  // En iOS sin PWA instalada el navegador nunca muestra el diálogo; pedirlo
  // es una llamada inútil que además confunde al usuario. El modal explica
  // cómo instalar la app.
  const willPromptNotifications = shouldRequestNotifications && !iosNeedsInstall;
  const shouldAcquireWakeLock = !disabled && wakeLockSupported && !wakeLockHeld;
  return {
    shouldRequestNotifications,
    willPromptNotifications,
    shouldAcquireWakeLock,
  };
}

/** Texto honesto del estado de notificaciones para el modal. */
export function notifStateText({ notificationSupported, notifPermission, iosNeedsInstall }) {
  if (!notificationSupported) return 'No soportado en este navegador';
  if (notifPermission === 'granted') return 'Concedido ✓';
  if (notifPermission === 'denied') return 'Denegado en el navegador';
  if (iosNeedsInstall) return 'Requiere instalar la app (iOS)';
  return 'Sin decidir';
}

/** Texto del estado del Wake Lock para el modal. */
export function wakeStateText({ wakeLockSupported, wakeLockHeld }) {
  if (!wakeLockSupported) return 'No soportado';
  return wakeLockHeld ? 'Activo ✓' : 'Inactivo';
}

/** Texto del interruptor global activado/desactivado. */
export function enabledStateText(disabled) {
  return disabled ? 'Desactivados' : 'Activados';
}
