// src/core/carrier.js
// Portadora (f1): familias de afinación ORTOGONALES al preset/estado — el
// preset define el ritmo (Δf, el latido) y la portadora define la base
// tonal. Cualquier combinación es posible (p. ej. Beta + 136,1 Hz) sin
// multiplicar los presets fijos. Fuente de verdad única: el generador
// principal (index.html) y "Personalizar" en itinerarios (rutina.html)
// escalan exactamente igual porque ambos importan de acá.

export const CARRIER_BASE = {
  estandar: null,
  estandar220: 220,
  solfeggio: 528,
  solfeggio963: 963,
  ancestral: 136.1,
  schumann: 194.7,
  personalizado: 'custom',
};

// Afinación de referencia sobre la que se escala: A = 432 Hz (Verdi), no la
// base canónica de 220 Hz.
export const STANDARD_BASE = 432;

// Escalado proporcional (opción B): cada preset conserva su identidad
// relativa al elegir una familia de portadora (528 Solfeggio, 136,1
// Ancestral, etc.). En vez de fijar la misma base para todos, se multiplica
// la base propia del preset por la razón familia/estándar: un preset de
// 432 Hz → 528 Hz exacto en la familia Solfeggio, y los presets más graves
// que el estándar siguen sonando más graves que los agudos, todos
// "afinados" a la misma referencia.
export function scaleCarrier(originalF1, targetBase) {
  return +(originalF1 * (targetBase / STANDARD_BASE)).toFixed(1);
}

// Base (f1) efectiva para un preset/valor propio (`ownBase`) según el modo
// de portadora elegido. `customHz` solo se usa en modo 'personalizado'.
export function carrierBaseFor(mode, ownBase, customHz) {
  if (mode === 'solfeggio' || mode === 'solfeggio963' || mode === 'ancestral') {
    return scaleCarrier(ownBase, CARRIER_BASE[mode]);
  }
  if (mode === 'schumann') return CARRIER_BASE.schumann;
  if (mode === 'estandar220') return CARRIER_BASE.estandar220;
  if (mode === 'personalizado') return customHz;
  return ownBase; // 'estandar': la base propia del preset, sin escalar
}
