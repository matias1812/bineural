// src/core/causal-log.js
// P5.4 — instrumentación causal: anillo de eventos de reproducción con
// timestamp / source / acción / estados, para responder la pregunta
// "¿qué componente emitió el primer PLAY?" si reaparece la reproducción
// fantasma. Puro (sin DOM): lo usan main.js (window.__causalLog) y el
// servicio nativo (Diagnostics.trace en Kotlin, espejo conceptual).
export function createCausalLog({ max = 120, now = Date.now } = {}) {
  const ring = [];
  return {
    /** Registra un evento {action, source, ...}; devuelve el evento con ts. */
    push(entry) {
      const e = { ts: now(), ...entry };
      ring.push(e);
      if (ring.length > max) ring.shift();
      return e;
    },
    /** Copia del anillo (orden cronológico). */
    list() {
      return ring.map((e) => ({ ...e }));
    },
    clear() {
      ring.length = 0;
    },
    get length() {
      return ring.length;
    },
  };
}
