// src/core/audio-provider.js
// P1.5 Fase 5 — proveedor ÚNICO de audio. Regla estricta:
//
//   APK con motor nativo activo ⇒ el motor web NO debe sonar (ganancia 0).
//   Nunca WebAudio + BinauralToneEngine al mismo tiempo.
//
// Es pura (sin DOM, sin AudioContext): los tests la validan headless y
// main.js la usa en tiempo real con los datos reales de la sesión.

/**
 * Decide qué proveedor está reproduciendo AHORA.
 * @param {object} p
 * @param {boolean} [p.bridgePresent]  ¿hay bridge nativo (APK) en esta sesión?
 * @param {boolean} [p.nativeActive]   ¿el servicio nativo está reproduciendo?
 * @param {boolean} [p.playing]        ¿la sesión web está marcada como activa?
 * @returns {'native'|'web'|'none'}
 */
export function selectAudioProvider({ bridgePresent = false, nativeActive = false, playing = false } = {}) {
  if (bridgePresent && nativeActive) return 'native';
  if (playing) return 'web';
  return 'none';
}

/**
 * Invariante: cuando el proveedor es NATIVE, la ganancia del motor web debe
 * estar en 0 (la WebView no puede generar un segundo tono que interfiera).
 * @param {object} p
 * @param {'native'|'web'|'none'} [p.provider]
 * @param {number} [p.webGain]  masterGain.gain.value del motor web (0..1).
 * @returns {boolean} true si se cumple el invariante.
 */
export function assertSingleAudioProvider({ provider = 'none', webGain = 0 } = {}) {
  if (provider === 'native') return webGain === 0;
  return true;
}

/** Texto legible del proveedor para el HUD / diagnostico. */
export function providerLabel(provider) {
  switch (provider) {
    case 'native':
      return 'NATIVE';
    case 'web':
      return 'WEB';
    default:
      return 'NONE';
  }
}
