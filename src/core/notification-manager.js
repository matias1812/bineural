// src/core/notification-manager.js
// NotificationManager — abstracción de notificaciones con providers (Fase 1/3
// del plan P0). Cada provider declara si PUEDE manejar la notificación en esta
// plataforma; el manager elige el primero que pueda. Nunca se muestra una
// acción que la plataforma no soporta y una notificación NUNCA toca el
// pipeline de audio ni crea una sesión automáticamente (Fase 20/21).
//
// Providers:
//   serviceWorker → registration.showNotification() (click/acciones vía SW).
//   local         → new Notification() (fallback sin SW).
//   push          → DESACTIVADO: requiere backend; configured = false.
//   calendar      → manual (botones del modal); nunca automático.
//
// Los providers reciben sus dependencias por inyección (deps), de modo que el
// módulo se testea headless con fakes en diagnostics.js.

export const LocalNotificationProvider = (deps = {}) => ({
  name: 'local',
  enabled: true,
  canHandle() {
    return (
      deps.notificationSupported &&
      deps.notificationSupported() &&
      deps.permissionState &&
      deps.permissionState() === 'granted' &&
      (!deps.swReady || !deps.swReady()) // el SW tiene prioridad si existe
    );
  },
  run(alarm) {
    return deps.showLocalNotification ? deps.showLocalNotification(alarm) : false;
  },
});

export const ServiceWorkerNotificationProvider = (deps = {}) => ({
  name: 'serviceWorker',
  enabled: true,
  canHandle() {
    return (
      deps.swReady &&
      deps.swReady() &&
      deps.notificationSupported &&
      deps.notificationSupported() &&
      deps.permissionState &&
      deps.permissionState() === 'granted'
    );
  },
  run(alarm) {
    return deps.showSwNotification ? deps.showSwNotification(alarm) : false;
  },
});

// Desactivado por diseño: no existe backend de Web Push (P0, Fase 13).
// canHandle() siempre false → nunca se intenta, y la UI lo declara así.
export const PushNotificationProvider = () => ({
  name: 'push',
  enabled: false,
  configured: false,
  canHandle() {
    return false;
  },
  run() {
    return false;
  },
});

// Respaldo del sistema para cuando la app está cerrada: exportación manual a
// Google Calendar / .ics. Nunca se invoca automáticamente (es una acción
// explícita del usuario en el modal de alarmas).
export const CalendarProvider = (deps = {}) => ({
  name: 'calendar',
  enabled: true,
  manual: true, // no participa en notify() automático
  canHandle() {
    return false;
  },
  run() {
    return deps.calendarExport ? deps.calendarExport() : false;
  },
});

export class NotificationManager {
  /**
   * @param {object} opts
   * @param {Array}  [opts.providers]  Providers en orden de prioridad.
   * @param {(alarm: object) => object} [opts.onShown]  Callback de telemetría local.
   */
  constructor(opts = {}) {
    this.providers = opts.providers || [];
    this.onShown = opts.onShown || null;
    this.history = []; // últimas notificaciones (diagnóstico)
    this.lastError = null;
  }

  /** Proveedor capaz de manejar la alarma en esta plataforma (o null). */
  resolve(alarm) {
    return this.providers.find((p) => p && p.enabled !== false && p.canHandle(alarm)) || null;
  }

  /**
   * Muestra la notificación con el primer provider capaz. Devuelve
   * { provider, shown }. Si ninguno puede (permiso denegado, sin soporte),
   * devuelve { provider: null, shown: false } — la UI cae al sonido/chime y
   * al respaldo de calendario; nunca se finge la notificación.
   */
  notify(alarm) {
    const provider = this.resolve(alarm);
    if (!provider) {
      return { provider: null, shown: false };
    }
    let shown = false;
    try {
      shown = !!provider.run(alarm);
    } catch (e) {
      this.lastError = `${provider.name}:${String(e)}`;
      shown = false;
    }
    this.history.unshift({ id: alarm && alarm.id, provider: provider.name, at: Date.now(), shown });
    if (this.history.length > 20) this.history.length = 20;
    if (this.onShown && shown) {
      try {
        this.onShown(alarm, provider.name);
      } catch {
        /* no romper el flujo */
      }
    }
    return { provider: provider.name, shown };
  }

  /** Estado honesto para el diagnóstico (Fase 24). */
  status() {
    return {
      providers: this.providers.map((p) => ({
        name: p.name,
        enabled: p.enabled !== false,
        configured: p.configured !== false,
        manual: !!p.manual,
      })),
      lastError: this.lastError,
      lastShown: this.history.find((h) => h.shown) || null,
    };
  }
}

/** Fábrica con los providers reales (wire en main.js). */
export function createNotificationManager(deps = {}) {
  return new NotificationManager({
    providers: [
      ServiceWorkerNotificationProvider(deps),
      LocalNotificationProvider(deps),
      PushNotificationProvider(),
      CalendarProvider(deps),
    ],
    onShown: deps.onShown || null,
  });
}
