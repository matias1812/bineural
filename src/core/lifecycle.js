// src/core/lifecycle.js
// Máquina de estados del ciclo de vida de la aplicación (P5).
//
// La regla central: NUNCA asumir que "pestaña oculta = audio detenido". El
// AudioContext puede seguir "running" en segundo plano (Android con ancla de
// medios, PWA instalada en iOS) o ser suspendido por el SO (iOS Safari sin
// PWA, pérdida de audio focus). Cada evento real (visibilitychange,
// ctx.onstatechange, play/pause) se alimenta aquí y la máquina decide el
// estado — y solo el estado determina qué recuperación aplicar al volver.
//
// Es pura (sin DOM, sin AudioContext): los tests la validan headless.

export const LIFECYCLE_STATES = [
  'FOREGROUND',
  'BACKGROUND',
  'AUDIO_RUNNING_BACKGROUND',
  'AUDIO_SUSPENDED',
  'RETURNING',
  'STOPPED',
];

export const LIFECYCLE_EVENTS = ['start', 'stop', 'visibility', 'ctx', 'resume'];

export class AppLifecycle {
  /** @param {'FOREGROUND'|'STOPPED'} [initial] */
  constructor(initial = 'FOREGROUND') {
    this.state = initial;
    this.history = [];
  }

  /**
   * @param {string} type 'start'|'stop'|'visibility'|'ctx'|'resume'
   * @param {{visible?: boolean, ctxState?: string|null, playing?: boolean,
   *          resumeOk?: boolean}} [e]
   * @returns {{ok: boolean, from: string, to: string|null, state: string}}
   */
  transition(type, e = {}) {
    const from = this.state;
    const to = this._next(from, type, e);
    if (!to) return { ok: false, from, to: null, state: this.state };
    if (to !== from) {
      this.state = to;
      this.history.push({ from, to, type, ts: Date.now(), ...e });
      if (this.history.length > 500) this.history.shift();
    }
    return { ok: true, from, to, state: this.state };
  }

  // Tabla de transiciones. Devuelve null si el evento no es válido en el
  // estado actual (transición imposible: se ignora, no se fuerza).
  _next(from, type, e) {
    const { visible, ctxState, playing, resumeOk } = e;
    switch (from) {
      case 'STOPPED':
        if (type === 'start') return 'FOREGROUND';
        return null;
      case 'FOREGROUND':
        if (type === 'stop') return 'STOPPED';
        if (type === 'visibility') {
          if (visible) return null;
          if (!playing) return 'BACKGROUND';
          return ctxState === 'suspended' ? 'AUDIO_SUSPENDED' : 'AUDIO_RUNNING_BACKGROUND';
        }
        return null;
      case 'BACKGROUND':
        if (type === 'visibility' && visible) return 'FOREGROUND';
        if (type === 'stop') return 'STOPPED';
        return null;
      case 'AUDIO_RUNNING_BACKGROUND':
        if (type === 'visibility' && visible) return 'FOREGROUND';
        if (type === 'ctx' && ctxState === 'suspended') return 'AUDIO_SUSPENDED';
        if (type === 'stop') return 'STOPPED';
        return null;
      case 'AUDIO_SUSPENDED':
        if (type === 'visibility' && visible) return 'RETURNING';
        if (type === 'ctx' && ctxState === 'running') return 'AUDIO_RUNNING_BACKGROUND';
        if (type === 'stop') return 'STOPPED';
        return null;
      case 'RETURNING':
        if (type === 'resume' && resumeOk) return 'FOREGROUND';
        if (type === 'resume' && !resumeOk) return 'AUDIO_SUSPENDED';
        if (type === 'stop') return 'STOPPED';
        return null;
      default:
        return null;
    }
  }

  /** Resumen legible para el dashboard/debug. */
  summary() {
    return {
      state: this.state,
      transitions: this.history.length,
      last: this.history[this.history.length - 1] || null,
    };
  }
}
