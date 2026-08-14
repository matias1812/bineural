// src/platform/native-bridge.js
// P0 — Separación Core / Platform (plan Bineural → APK Android, Fase 0).
//
// Define el CONTRATO del bridge nativo (WebView → Kotlin) y un adaptador
// seguro que la web usa DESDE HOY:
//
//   - Sin bridge (web/PWA): cada comando devuelve { ok:false, error:'NOT_SUPPORTED' }
//     → el comportamiento web actual queda intacto, nada se rompe.
//   - Con bridge (futura APK): expone las capacidades nativas reales con
//     estados honestos (supported / granted / active), nunca confundidos.
//
// El Kotlin de la APK implementa EXACTAMENTE este contrato (comandos y forma
// de los mensajes), ver docs/android-roadmap.md.
//
// Seguridad (Fase 24 del plan): whitelist de comandos + validación de entrada.
// El bridge JAMÁS acepta comandos arbitrarios desde el contenido web.

/** Comandos permitidos. Todo lo demás se rechaza con DENIED. */
export const BRIDGE_COMMANDS = Object.freeze([
  'GET_PLATFORM_CAPABILITIES', // handshake (P0 gate §9): devuelve la capacidad real
  'START_BACKGROUND_AUDIO',
  'STOP_BACKGROUND_AUDIO',
  'PAUSE_BACKGROUND_AUDIO',
  'RESUME_BACKGROUND_AUDIO',
  'SCHEDULE_ALARM',
  'CANCEL_ALARM',
  'REQUEST_NOTIFICATION_PERMISSION',
  'REQUEST_EXACT_ALARM_PERMISSION',
  'OPEN_EXPERIMENT',
  'OPEN_SETTINGS',
]);

/**
 * Detecta el bridge nativo inyectado por el shell Android.
 * @param {object} [env] { bridge } — para tests headless.
 * @returns {null | { present:true, platform:'android', version:string }}
 */
export function detectNativeBridge(env = {}) {
  const bridge = env.bridge || (typeof window !== 'undefined' ? window.AndroidBridge : null);
  if (!bridge || typeof bridge.postMessage !== 'function') return null;
  return {
    present: true,
    platform: 'android',
    version: typeof bridge.version === 'string' && bridge.version ? bridge.version : 'unknown',
  };
}

/**
 * Valida un comando contra la whitelist y su payload.
 * @returns {{ ok:true, command:string } | { ok:false, error:'DENIED'|'INVALID' }}
 */
export function validateCommand(command, payload) {
  if (typeof command !== 'string' || !BRIDGE_COMMANDS.includes(command)) {
    return { ok: false, error: 'DENIED' };
  }
  // Payload: solo objetos planos serializables (sin funciones, sin claves raras).
  if (payload !== undefined && payload !== null) {
    if (typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, error: 'INVALID' };
    try {
      JSON.stringify(payload);
    } catch {
      return { ok: false, error: 'INVALID' };
    }
    for (const k of Object.keys(payload)) {
      if (!/^[A-Za-z0-9_]+$/.test(k)) return { ok: false, error: 'INVALID' };
    }
  }
  return { ok: true, command };
}

/**
 * Adaptador seguro: cada método consulta el bridge si existe y, si no,
 * devuelve el estado honesto de "no disponible" (la web sigue funcionando).
 */
export function createNativeBridgeAdapter(env = {}) {
  const raw = env.bridge || (typeof window !== 'undefined' ? window.AndroidBridge : null);
  const bridge = detectNativeBridge(env);
  // Aislamiento de fallos: un getPlatformInfo que lance NO debe impedir
  // crear el adaptador (la web sigue funcionando).
  let info = null;
  try {
    if (raw && typeof raw.getPlatformInfo === 'function') info = raw.getPlatformInfo();
  } catch {
    info = null;
  }
  // Handshake (P0 gate §9): si el bridge no responde getPlatformInfo, el
  // estado es UNAVAILABLE — nunca asumimos que existe por el user-agent.
  let bridgeStatus = !bridge ? 'UNAVAILABLE' : info ? 'CONNECTED' : 'PENDING';

  /** Ejecuta un comando whitelisted; responde con estado honesto. */
  function send(command, payload) {
    const v = validateCommand(command, payload);
    if (!v.ok) return { ok: false, error: v.error };
    if (!bridge) return { ok: false, error: 'NOT_SUPPORTED', platform: 'web' };
    try {
      const res = raw.postMessage({ command, payload: payload || null });
      // El puente puede responder síncronamente o prometer (respuesta async
      // por events). Nunca asumimos el resultado: `pending` = entregado al
      // sistema, el resultado real llega por evento nativo.
      return { ok: true, pending: true, response: res !== undefined ? res : null, platform: 'android' };
    } catch {
      // Aislamiento de fallos (P0 gate §10): un error del bridge NUNCA rompe
      // la UI ni el core; se reporta y la web sigue con su proveedor web.
      bridgeStatus = 'ERROR';
      return { ok: false, error: 'BRIDGE_ERROR', platform: 'android' };
    }
  }

  /**
   * Handshake completo: GET_PLATFORM_CAPABILITIES y, si el bridge responde
   * por evento asíncrono, lo espera con timeout. Sin respuesta → UNAVAILABLE.
   */
  async function handshake({ timeoutMs = 250 } = {}) {
    if (!bridge) return { status: 'UNAVAILABLE', platform: 'web' };
    // Respuesta síncrona: ya la tenemos (getPlatformInfo).
    if (info) {
      bridgeStatus = 'CONNECTED';
      return { status: 'CONNECTED', platform: 'android', info };
    }
    // Sin getPlatformInfo, intentamos el comando de handshake.
    try {
      const res = send('GET_PLATFORM_CAPABILITIES');
      if (res.ok && res.response && typeof res.response === 'object') {
        info = res.response;
        bridgeStatus = 'CONNECTED';
        return { status: 'CONNECTED', platform: 'android', info };
      }
    } catch {
      /* caer al timeout */
    }
    await new Promise((r) => setTimeout(r, timeoutMs));
    bridgeStatus = info ? 'CONNECTED' : 'UNAVAILABLE';
    return { status: bridgeStatus, platform: 'android', info: info || null };
  }

  return {
    present: !!bridge,
    info: info || null,
    platform: bridge ? 'android' : 'web',
    bridgeStatus,
    handshake,

    // ---- Audio en segundo plano (Fase 4) ----
    startBackgroundAudio: (payload) => send('START_BACKGROUND_AUDIO', payload),
    stopBackgroundAudio: () => send('STOP_BACKGROUND_AUDIO'),
    pauseBackgroundAudio: () => send('PAUSE_BACKGROUND_AUDIO'),
    resumeBackgroundAudio: () => send('RESUME_BACKGROUND_AUDIO'),

    // ---- Alarmas exactas (Fase 8) ----
    scheduleAlarm: (alarm) => send('SCHEDULE_ALARM', alarm),
    cancelAlarm: (alarmId) => send('CANCEL_ALARM', typeof alarmId === 'string' ? { alarmId } : null),

    // ---- Permisos (Fase 10) ----
    requestNotificationPermission: () => send('REQUEST_NOTIFICATION_PERMISSION'),

    // ---- Sesión experimental (Fase 9) ----
    openExperiment: (experimentId) =>
      send('OPEN_EXPERIMENT', typeof experimentId === 'string' ? { experimentId } : null),

    // ---- Diagnóstico ----
    getState() {
      return {
        present: this.present,
        platform: this.platform,
        bridgeStatus,
        version: raw && raw.version ? raw.version : null,
        info,
        supported: {
          backgroundAudio: !!info && !!info.backgroundService,
          exactAlarms: !!info && !!info.exactAlarms,
          nativeAudio: !!info && !!info.nativeAudio,
          notifications: !!info && !!info.notifications,
        },
      };
    },
  };
}
