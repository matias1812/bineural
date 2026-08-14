// src/core/media-anchor.js
// "Ancla de medios": un elemento <audio> mudo que se reproduce en bucle junto
// a la sesión binaural. Su único propósito es registrar la pestaña como
// reproducción de medios ante el sistema operativo:
//
//   - Android (Chrome): el navegador trata la pestaña como un reproductor en
//     marcha → aparece el controlador del reproductor en las notificaciones
//     (Media Session) y NO suspende el AudioContext al cambiar de app o
//     bloquear la pantalla (fuente de la "interferencia" al moverse por el
//     teléfono: cada suspensión/reanudación produce clics o cortes).
//   - iOS: sin un elemento <audio> reproduciéndose, Safari no muestra los
//     controles del reproductor en la pantalla de bloqueo aunque el sonido
//     real salga por Web Audio. Con la PWA instalada, el ancla habilita el
//     control del reproductor y el audio en segundo plano.
//
// La pista es silencio real (muestras a cero), así que no aporta sonido:
// todo el audio sigue saliendo por el AudioContext del motor binaural.

/** Construye un WAV PCM 16-bit mono de 8 kHz con muestras a cero (silencio). */
export function buildSilentWav(seconds = 8) {
  const sr = 8000;
  const sampleCount = Math.max(1, Math.round(seconds * sr));
  const dataBytes = sampleCount * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const str = (off, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true); // tamaño del chunk fmt
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sr, true); // 8000 Hz
  v.setUint32(28, sr * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits por muestra
  str(36, 'data');
  v.setUint32(40, dataBytes, true);
  // Las muestras quedan en 0: silencio.
  return buf;
}

// Duración por defecto de la pista del ancla. Una pista de 1 s en bucle hace
// que el reloj de medios del SO reinicie cada segundo (parece "media que
// termina"); con 8 s la línea de tiempo del reproductor es estable.
export const ANCHOR_SECONDS = 8;

/**
 * Crea el elemento <audio> en bucle con la pista muda (solo navegador).
 *
 * Importante: NO se pone volume = 0 ni muted. Aunque la pista es silencio
 * digital (muestras a cero), el navegador clasifica el elemento como
 * "reproduciendo audio" por su estado (paused=false) y nivel de volumen;
 * un elemento con volumen 0 o muted se considera no-audible y Chrome puede
 * NO reclamar el MediaSession (desaparece el controlador en Android) y
 * sentirse libre de suspender el AudioContext en segundo plano (fuente de
 * la interferencia al moverse por el celular).
 */
export function createSilentAudio(seconds = ANCHOR_SECONDS) {
  const url = URL.createObjectURL(new Blob([buildSilentWav(seconds)], { type: 'audio/wav' }));
  const a = new Audio(url);
  a.loop = true;
  a.preload = 'auto';
  a.setAttribute('playsinline', '');
  return a;
}
