// src/core/restore-gate.js
// P1 — RestoreGate: deduplicación por máquina de estados (forense M3).
//
// Problema clase M3: un unlock puede disparar `restoreFromBackground()` desde
// hasta 5 vías (visibilitychange, pageshow, focus, resume, pointerdown) en el
// mismo burst de eventos. Cada ejecución re-crea MediaMetadata, re-rampea la
// ganancia y registra eventos de log → micro-interferencia y ruido de
// diagnóstico, aunque no duplique el pipeline.
//
// Solución (NO un debounce arbitrario): una máquina de estados explícita.
//
//   IDLE ──request()──▶ RESTORING ──complete()──▶ SETTLED ──(ventana)──▶ IDLE
//                          │  ▲                        │
//                          │  └─(request durante)      │  request() dentro de la
//                          │     → 'coalesce' (skip)   │  ventana → 'skip'
//                          └───────────────────────────┘  (salvo force)
//
// - El primer request en el burst ejecuta el restore (RESTORING).
// - Los requests que llegan DURANTE o justo DESPUÉS (ventana de settle, p. ej.
//   focus tras visibilitychange) se deduplican → 'skip' / 'coalesce'.
// - `force` (el caller sabe que la sesión sigue sin recuperar, p. ej. el
//   AudioContext sigue 'suspended' en iOS) atraviesa la ventana: el restore
//   DEBE reintentarse aunque se acabe de ejecutar.
//
// Es pura (sin DOM, sin timers internos): los tests la validan headless.

export const RESTORE_GATE_STATES = ['IDLE', 'RESTORING', 'SETTLED'];

export class RestoreGate {
  /**
   * @param {object} [opts]
   * @param {number} [opts.settleMs]  Ventana de dedup tras un restore (ms).
   * @param {() => number} [opts.now] Reloj inyectable (tests).
   */
  constructor({ settleMs = 1500, now = Date.now } = {}) {
    this.settleMs = settleMs;
    this._now = now;
    this.state = 'IDLE';
    this._settledAt = 0;
    this._pending = false;
    this.transitions = 0;
    this.history = [];
  }

  /**
   * Decide si un trigger de restore debe ejecutar.
   * @param {object} [opts]
   * @param {boolean} [opts.force]  El caller sabe que la sesión sigue sin
   *   recuperar (ctx suspendido, elemento pausado) → reintentar aunque
   *   estemos en la ventana de settle.
   * @returns {{action: 'run'|'skip'|'coalesce', state: string}}
   */
  request({ force = false } = {}) {
    const now = this._now();
    if (this.state === 'RESTORING') {
      this._pending = true;
      return { action: 'coalesce', state: this.state };
    }
    if (this.state === 'SETTLED') {
      if (force) {
        this._beginRestore(now);
        return { action: 'run', state: this.state };
      }
      if (now - this._settledAt < this.settleMs) {
        return { action: 'skip', state: this.state };
      }
      this.state = 'IDLE';
      this.transitions += 1;
    }
    this._beginRestore(now);
    return { action: 'run', state: this.state };
  }

  /**
   * El restore terminó. Si durante él llegó un request coalescido (no puede
   * ocurrir con un restore síncrono, pero es la transición correcta si algún
   * día es async), se deja la puerta abierta para un segundo restore; si no,
   * se pasa a SETTLED (ventana de dedup).
   */
  complete() {
    if (this.state !== 'RESTORING') return { action: 'none', state: this.state };
    if (this._pending) {
      this._pending = false;
      return { action: 'rerun-pending', state: this.state };
    }
    this.state = 'SETTLED';
    this._settledAt = this._now();
    this.transitions += 1;
    this._log('complete', 'settled');
    return { action: 'settled', state: this.state };
  }

  /** Estado legible para diagnóstico. */
  summary() {
    return {
      state: this.state,
      transitions: this.transitions,
      settledAgoMs: this.state === 'SETTLED' ? this._now() - this._settledAt : null,
      last: this.history[this.history.length - 1] || null,
    };
  }

  reset() {
    this.state = 'IDLE';
    this._pending = false;
    this.transitions = 0;
    this.history = [];
  }

  _beginRestore(now) {
    this.state = 'RESTORING';
    this.transitions += 1;
    this._log('begin', 'restoring');
  }

  _log(kind, detail) {
    this.history.push({ kind, detail, ts: this._now() });
    if (this.history.length > 50) this.history.shift();
  }
}
