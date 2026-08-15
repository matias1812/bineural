// src/core/audio-state.js
// P2 Fase 1 — máquina de estados CENTRAL del audio.
//
// Separa estrictamente el estado de audio del estado de UI y del estado del
// experimento: abrir un menú, scrollear o cambiar de pestaña NUNCA puede
// transicionar el audio (solo eventos explícitos de audio lo hacen).
//
// Distingue la FUENTE de cada transición — el usuario, el sistema (lock
// screen / notificaciones), el audio focus (otra app, llamada, Bluetooth) —
// porque experimentalmente no es lo mismo un pause del usuario que una
// interrupción del SO (Fase 10: los datos se contaminan si se mezclan).
//
// Es pura (sin DOM, sin AudioContext): los tests la validan headless y
// main.js la alimenta con los eventos reales.

export const AUDIO_STATES = Object.freeze([
  'IDLE',
  'INITIALIZING',
  'PLAYING',
  'PAUSED',
  'STOPPED',
  'INTERRUPTED',
  'DUCKED',
  'BACKGROUND',
  'ERROR',
]);

/** Fuentes de transición (eventos). */
export const AUDIO_EVENTS = Object.freeze([
  'user_play',
  'user_pause',
  'user_stop',
  'system_play',
  'system_pause',
  'system_stop',
  'started',
  'focus_gain',
  'focus_loss',
  'focus_duck',
  'call_started',
  'call_ended',
  'bluetooth_changed',
  'app_background',
  'app_foreground',
  'error',
]);

// Tabla de transiciones. Una transición ausente se IGNORA (devuelve ok:false),
// nunca se fuerza: un evento estale no puede corromper el estado.
const TRANSITIONS = {
  IDLE: {
    user_play: 'INITIALIZING',
    system_play: 'INITIALIZING',
    error: 'ERROR',
  },
  INITIALIZING: {
    started: 'PLAYING',
    focus_gain: 'PLAYING',
    user_stop: 'STOPPED',
    system_stop: 'STOPPED',
    error: 'ERROR',
  },
  PLAYING: {
    user_pause: 'PAUSED',
    system_pause: 'PAUSED',
    user_stop: 'STOPPED',
    system_stop: 'STOPPED',
    focus_loss: 'INTERRUPTED',
    call_started: 'INTERRUPTED',
    focus_duck: 'DUCKED',
    app_background: 'BACKGROUND',
    error: 'ERROR',
  },
  PAUSED: {
    user_play: 'PLAYING',
    system_play: 'PLAYING',
    user_stop: 'STOPPED',
    system_stop: 'STOPPED',
    focus_duck: 'DUCKED',
    error: 'ERROR',
  },
  STOPPED: {
    user_play: 'INITIALIZING',
    system_play: 'INITIALIZING',
    error: 'ERROR',
  },
  INTERRUPTED: {
    focus_gain: 'PLAYING',
    call_ended: 'PLAYING',
    user_play: 'PLAYING',
    system_play: 'PLAYING',
    user_stop: 'STOPPED',
    system_stop: 'STOPPED',
    error: 'ERROR',
  },
  DUCKED: {
    focus_gain: 'PLAYING',
    focus_loss: 'INTERRUPTED',
    call_started: 'INTERRUPTED',
    user_stop: 'STOPPED',
    system_stop: 'STOPPED',
    error: 'ERROR',
  },
  BACKGROUND: {
    app_foreground: 'PLAYING',
    user_pause: 'PAUSED',
    system_pause: 'PAUSED',
    user_stop: 'STOPPED',
    system_stop: 'STOPPED',
    focus_loss: 'INTERRUPTED',
    focus_duck: 'DUCKED',
    error: 'ERROR',
  },
  ERROR: {
    user_play: 'INITIALIZING',
    system_play: 'INITIALIZING',
    user_stop: 'STOPPED',
    system_stop: 'STOPPED',
    error: 'ERROR',
  },
};

export class AudioStateMachine {
  /** @param {'IDLE'|'STOPPED'} [initial] @param {{now?: () => number}} [opts] */
  constructor(initial = 'IDLE', { now = Date.now } = {}) {
    this.state = AUDIO_STATES.includes(initial) ? initial : 'IDLE';
    this.history = [];
    this._now = now;
  }

  /**
   * Transición por FUENTE. Registra { ts, source, from, to, reason }.
   * @param {string} source  un evento de AUDIO_EVENTS.
   * @param {{reason?: string}} [opts]
   * @returns {{ok: boolean, source: string, from: string, to: string|null, state: string}}
   */
  transition(source, { reason = '' } = {}) {
    const from = this.state;
    const to = TRANSITIONS[from] && TRANSITIONS[from][source];
    if (!to) {
      return { ok: false, source, from, to: null, state: this.state };
    }
    this.state = to;
    const entry = { ts: this._now(), source, from, to, reason };
    this.history.push(entry);
    if (this.history.length > 200) this.history.shift();
    return { ok: true, source, from, to, reason, state: to };
  }

  /** ¿El motor está produciendo audio en este momento? */
  get isAudible() {
    return ['PLAYING', 'BACKGROUND', 'DUCKED', 'INITIALIZING'].includes(this.state);
  }

  /** ¿Hay una sesión viva (aunque esté en pausa)? */
  get isActive() {
    return this.state !== 'IDLE' && this.state !== 'STOPPED' && this.state !== 'ERROR';
  }

  /** Resumen legible para el HUD / diagnostico. */
  summary() {
    const last = this.history[this.history.length - 1] || null;
    return {
      state: this.state,
      transitions: this.history.length,
      last,
      isAudible: this.isAudible,
    };
  }

  reset() {
    this.state = 'IDLE';
    this.history = [];
  }
}
