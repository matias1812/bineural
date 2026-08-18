// src/core/notification-capabilities.js
// Detección HONESTA de capacidades (Fase 12 del plan P0 de notificaciones).
//
// REGLA: "API disponible" ≠ "funcionalidad garantizada". Cada campo declara
// exactamente qué significa y qué NO garantiza:
//
//   notifications.permission  → estado real del permiso del navegador.
//   push.configured           → SIN backend = false (la API exista no basta).
//   backgroundScheduling      → SIEMPRE 'NOT_GUARANTEED': no existe un
//                               scheduler persistente sin Web Push.
//   calendar                  → respaldo real del SO (ICS/Google Calendar).
//
// La función es pura: recibe el entorno por inyección para poder testearse
// headless con fakes (diagnostics.js).

export const CAPABILITY_STATES = {
  NOT_SUPPORTED: 'NOT_SUPPORTED',
  DEFAULT: 'DEFAULT',
  GRANTED: 'GRANTED',
  DENIED: 'DENIED',
  AVAILABLE: 'AVAILABLE',
  NOT_GUARANTEED: 'NOT_GUARANTEED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  REQUIRES_SERVER: 'REQUIRES_SERVER',
  REQUIRES_INSTALL: 'REQUIRES_INSTALL',
};

// Texto en español para la UI: cada etiqueta explica qué hace el permiso o
// capacidad, sin prometer más de lo que el navegador garantiza (Fase 37).
export const CAPABILITY_TEXT = {
  notifications: {
    NOT_SUPPORTED: 'No compatible con este navegador',
    DEFAULT: 'No decidido — se pide al guardar',
    GRANTED: 'Activadas',
    DENIED: 'Bloqueadas en el navegador',
  },
  backgroundScheduling: 'No garantizado — depende del navegador',
  push: 'Requiere servidor — no configurado',
  calendar: 'Disponible — respaldo del sistema',
  mediaSession: 'Disponible al reproducir',
};

/**
 * Detecta las capacidades reales de la plataforma.
 * @param {object} [env]  Entorno inyectable: { window, navigator, Notification,
 *                        mediaSession, pushConfigured, swRegistered }.
 *                        En el navegador se rellena solo; en tests se pasan fakes.
 */
export function detectNotificationCapabilities(env = {}) {
  const w = env.window !== undefined ? env.window : typeof window !== 'undefined' ? window : null;
  const nav = env.navigator !== undefined ? env.navigator : typeof navigator !== 'undefined' ? navigator : null;
  const Notif = env.Notification !== undefined ? env.Notification : typeof Notification !== 'undefined' ? Notification : null;
  const mediaSession =
    env.mediaSession !== undefined ? env.mediaSession : w && 'mediaSession' in w ? w.mediaSession : null;
  const swReg = env.swRegistered !== undefined ? env.swRegistered : null;

  const notificationsSupported = !!Notif;
  const rawPermission = notificationsSupported ? Notif.permission || 'default' : 'unsupported';
  const notificationsPermission = ['granted', 'denied', 'default'].includes(rawPermission)
    ? rawPermission
    : 'default';

  return {
    notifications: {
      supported: notificationsSupported,
      permission: notificationsPermission, // 'default' | 'granted' | 'denied'
      actions: notificationsSupported && 'actions' in Notif.prototype, // botones
    },
    serviceWorker: {
      supported: !!(nav && 'serviceWorker' in nav),
      registered: !!swReg,
    },
    push: {
      supported: !!(w && 'PushManager' in w && nav && 'serviceWorker' in nav),
      configured: !!env.pushConfigured, // SIN backend → false
    },
    mediaSession: {
      supported: !!mediaSession,
    },
    // Honesto: el navegador no garantiza ejecución en segundo plano.
    backgroundScheduling: CAPABILITY_STATES.NOT_GUARANTEED,
    calendar: CAPABILITY_STATES.AVAILABLE,
    state: CAPABILITY_STATES, // referencia para la UI
    text: CAPABILITY_TEXT,
  };
}

/**
 * Resumen legible para la UI de permisos y para el diagnóstico.
 * @returns {Array<{key: string, label: string, status: string, note: string}>}
 */
export function capabilitySummary(caps) {
  if (!caps) return [];
  const rows = [];
  const perm = caps.notifications.permission;
  rows.push({
    key: 'notifications',
    label: 'Notificaciones',
    status:
      !caps.notifications.supported
        ? CAPABILITY_TEXT.notifications.NOT_SUPPORTED
        : perm === 'granted'
          ? CAPABILITY_TEXT.notifications.GRANTED
          : perm === 'denied'
            ? CAPABILITY_TEXT.notifications.DENIED
            : CAPABILITY_TEXT.notifications.DEFAULT,
    note: 'avisa a la hora elegida mientras la app pueda ejecutarse',
  });
  rows.push({
    key: 'background',
    label: 'Avisos con la app cerrada',
    status: caps.push.configured
      ? 'Web Push configurado (requiere sesión y suscripción)'
      : CAPABILITY_TEXT.backgroundScheduling,
    note: caps.push.configured
      ? 'el servidor envía el aviso a la hora exacta si el dispositivo está suscrito'
      : 'requieren Web Push con servidor, aún no configurado',
  });
  rows.push({
    key: 'calendar',
    label: 'Respaldo de calendario',
    status: CAPABILITY_TEXT.calendar,
    note: 'Google Calendar / .ics avisan aunque la app esté cerrada',
  });
  rows.push({
    key: 'push',
    label: 'Web Push',
    status: caps.push.configured ? 'Configurado' : CAPABILITY_TEXT.push,
    note: caps.push.configured
      ? 'servidor listo (VAPID): activá las notificaciones desde tu cuenta'
      : caps.push.supported
        ? 'soportado por el navegador, sin backend'
        : 'no soportado por este navegador',
  });
  rows.push({
    key: 'mediaSession',
    label: 'Control del reproductor',
    status: caps.mediaSession.supported ? CAPABILITY_TEXT.mediaSession : 'No soportado',
    note: 'aparece al reproducir; no requiere permiso de notificaciones',
  });
  return rows;
}
