// src/core/audio-automation.js
// P1 — Política de cancelación de automation de AudioParam (forense M1).
//
// El bug clase M1: asignar `param.value = X` NO cancela los eventos de
// automation programados (setValueAtTime / linearRampToValueAtTime /
// exponentialRampToValueAtTime / setTargetAtTime) que el motor dejó
// pendientes. Una rampa residual (del fade-in de start(), del watchdog
// recoverFade o de setVolume) puede ejecutarse DESPUÉS y volver a elevar la
// ganancia, haciendo audible un pipeline que debía estar mudo (en la APK:
// web + servicio nativo sonando a la vez → batido/acoplamiento).
//
// Regla: ANTES de fijar un valor absoluto sobre un AudioParam que pudo tener
// automation pendiente, se cancela lo programado y se fija el valor con
// setValueAtTime (valor instantáneo, sin rampa residual).
//
// Es pura (sin DOM): los tests la validan headless con un AudioParam fake.

/**
 * Cancela la automation pendiente de un AudioParam y fija un valor absoluto
 * de forma instantánea. Si `param` no existe o no expone la API, no hace
 * nada (aislamiento de fallos).
 * @param {object|null} param  AudioParam (gain o frequency).
 * @param {number} value       Valor absoluto a fijar.
 * @param {number} [now]       Tiempo del AudioContext (ctx.currentTime).
 */
export function setParamValueCancelingAutomation(param, value, now = 0) {
  if (!param) return;
  if (typeof param.cancelScheduledValues === 'function') {
    try {
      param.cancelScheduledValues(now);
    } catch (_) {
      /* contexto cerrado */
    }
  }
  if (typeof param.setValueAtTime === 'function') {
    try {
      param.setValueAtTime(value, now);
    } catch (_) {
      /* contexto cerrado */
      return;
    }
    return;
  }
  try {
    param.value = value;
  } catch (_) {
    /* parámetro no escribible */
  }
}

/**
 * Enmudece el motor web (masterGain) con cancelación de automation:
 * la vía correcta para silenciar el pipeline web cuando el nativo toma el
 * control, o para restaurar el nivel web al volver. Nunca deja una rampa
 * residual capaz de reactivar el motor.
 * @param {object|null} masterGain AudioNode con .gain.
 * @param {number} [now]          ctx.currentTime.
 */
export function muteMasterGain(masterGain, now = 0) {
  setParamValueCancelingAutomation(masterGain && masterGain.gain, 0, now);
}

/**
 * Restaura el nivel web (volumen de sesión) con la MISMA política de
 * cancelación: evita que una rampa vieja pise el nivel nuevo.
 */
export function restoreMasterGain(masterGain, volume, now = 0) {
  setParamValueCancelingAutomation(masterGain && masterGain.gain, volume, now);
}
