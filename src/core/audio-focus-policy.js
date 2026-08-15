// src/core/audio-focus-policy.js
// P2 — Contrato puro de la política de Audio Focus (FASE 6 + endurecimiento UNKNOWN).
//
// Separa DURAMENTE dos conceptos que el dictamen P2 exige no mezclar:
//
//   held        → estado OPERACIONAL: ¿la sesión posee el foco AHORA? Es la
//                 fuente de verdad del watchdog de re-adquisición.
//   observability → Diagnostics.focusState: solo observabilidad/diagnóstico.
//                 Puede decir "GAIN" mientras held=false (callback de Android
//                 que no llega aunque el SO conceda — observado en el
//                 emulador). En ese caso HAY que re-solicitar.
//
// Política por estado (la MISMA que implementa AudioFocusHelper.kt en la APK):
//
//   GAIN                    → held=true  → resume
//   DUCK (CAN_DUCK)         → held=true  → duck  (el foco NO se pierde)
//   LOSS_TRANSIENT          → held=false → pause + watchdog
//   LOSS                    → held=false → pause + watchdog
//   UNKNOWN                 → held=false → pause + watchdog + CRITICAL
//                                    (visible como UNKNOWN, NUNCA pérdida genérica)
//
// Este módulo es la versión testeable en JS del contrato; la implementación
// Android vive en AudioFocusHelper.kt / AudioForegroundService.kt.

export const FOCUS_STATES = {
  GAIN: 'GAIN',
  LOSS: 'LOSS',
  LOSS_TRANSIENT: 'LOSS_TRANSIENT',
  DUCK: 'DUCK', // AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK
  UNKNOWN: 'UNKNOWN',
};

/**
 * Decisión operacional para un estado de focus observado.
 * @param {string} state  'GAIN' | 'LOSS' | 'LOSS_TRANSIENT' | 'DUCK' | 'UNKNOWN'
 * @returns {{
 *   held: boolean,        // ¿la sesión sigue poseyendo el foco? (fuente del watchdog)
 *   action: string,       // 'resume' | 'pause' | 'duck'
 *   watch: boolean,       // ¿programar watchdog de re-adquisición?
 *   critical: boolean,    // ¿estado inesperado con diagnóstico CRITICAL?
 * }}
 */
export function focusPolicy(state) {
  switch (state) {
    case FOCUS_STATES.GAIN:
      return { held: true, action: 'resume', watch: false, critical: false };
    case FOCUS_STATES.DUCK:
      // El foco NO se perdió: solo se baja el volumen (ducking). held=true
      // para que el watchdog no intente re-adquirir un foco que ya tenemos.
      return { held: true, action: 'duck', watch: false, critical: false };
    case FOCUS_STATES.LOSS_TRANSIENT:
      return { held: false, action: 'pause', watch: true, critical: false };
    case FOCUS_STATES.LOSS:
      return { held: false, action: 'pause', watch: true, critical: false };
    case FOCUS_STATES.UNKNOWN:
    default:
      // UNKNOWN queda EXPLÍCITO (nunca se transforma en pérdida genérica):
      // pausa defensiva + watchdog + CRITICAL.
      return { held: false, action: 'pause', watch: true, critical: true };
  }
}

/**
 * ¿Debe el watchdog volver a solicitar el foco?
 * La autoridad es `held` (estado operacional), NO el estado observado:
 * focusState="GAIN" con held=false (callback perdido) igual re-solicita;
 * held=true nunca re-solicita, aunque la observabilidad diga otra cosa.
 * Un UNKNOWN observado fuerza la re-solicitud aunque held diga lo contrario
 * (defensa: el estado es incoherente → reintentar).
 */
export function shouldRequestFocus(held, observedState) {
  return !held || observedState === FOCUS_STATES.UNKNOWN;
}
