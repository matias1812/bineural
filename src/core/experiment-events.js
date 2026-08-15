// src/core/experiment-events.js
// Registro de eventos de la sesión/experimento (P19) e integridad (P20).
//
// Cada evento se guarda con { ts (wall clock), audioTime, type, payload }
// para poder reconstruir EXACTAMENTE qué ocurrió: inicios, pausas, reanudas,
// paso a segundo plano, suspensión del AudioContext, cambios de estímulo,
// de volumen y de condición.
//
// La integridad mide la CONTINUIDAD DEL AUDIO cuando debía sonar:
//
//   integridad = exposición real / exposición esperada
//
// donde la exposición esperada excluye las pausas voluntarias del usuario
// (pausar no es una interrupción) y la real descuenta los segmentos donde el
// audio estuvo suspendido o la pestaña congelada sin audio. Si el teléfono
// interrumpió la señal 24.8 s, el reporte dice "Integridad: 92%" en vez de
// fingir que la sesión fue continua.

export class ExperimentEventLog {
  /**
   * @param {{wallNow?: () => number, audioTime?: () => number}} [deps]
   */
  constructor({ wallNow = Date.now, audioTime = () => 0 } = {}) {
    this.wallNow = wallNow;
    this.audioTime = audioTime;
    this.events = [];
    this.startWall = null;
    this._playingSince = null; // wall de la última reanudación de audio
    this._pausedSince = null; // wall del inicio de una pausa voluntaria
    this._suspendedSince = null; // wall del inicio de una suspensión del SO
    this.exposureMs = 0;
    this.pausedMs = 0;
    this.interruptedMs = 0;
    this.interruptions = [];
    this.endWall = null; // reloj de pared congelado en stop()
  }

  _record(type, payload) {
    this.events.push({
      ts: this.wallNow(),
      audioTime: this.audioTime(),
      type,
      payload: payload || null,
    });
    // Sesiones muy largas: el log de eventos no debe crecer sin límite
    // (la integridad se calcula con contadores, no con el arreglo).
    if (this.events.length > 1000) this.events.splice(0, this.events.length - 1000);
  }

  /** Limpia el registro para una sesión nueva (después de stop()). */
  reset() {
    this.events = [];
    this.startWall = null;
    this._playingSince = null;
    this._pausedSince = null;
    this._suspendedSince = null;
    this.exposureMs = 0;
    this.pausedMs = 0;
    this.interruptedMs = 0;
    this.interruptions = [];
  }

  /** La condición experimental cambió a mitad de sesión (registro honesto).
   *  No altera la exposición ni la integridad: solo documenta el cambio de
   *  estímulo real (binaural → tono puro, ruido, AM o silencio). */
  conditionChanged(payload = {}) {
    this._record('conditionChanged', payload);
  }

  /** La sesión comienza a sonar. */
  start(payload = {}) {
    if (this.startWall != null) return;
    this.startWall = this.wallNow();
    this._playingSince = this.startWall;
    this._record('experimentStarted', payload);
  }

  /** Pausa voluntaria (botón, control del SO). No cuenta como interrupción. */
  pause(payload = {}) {
    if (this._playingSince == null || this._pausedSince != null) return;
    this.exposureMs += this.wallNow() - this._playingSince;
    this._playingSince = null;
    this._pausedSince = this.wallNow();
    this._record('experimentPaused', payload);
  }

  /** Reanudación tras pausa voluntaria. */
  resume(payload = {}) {
    if (this._pausedSince == null) return;
    this.pausedMs += this.wallNow() - this._pausedSince;
    this._pausedSince = null;
    this._playingSince = this.wallNow();
    this._record('experimentResumed', payload);
  }

  /** El AudioContext fue suspendido por el SO: marca interrupción real. */
  suspend(payload = {}) {
    if (this._suspendedSince != null) return;
    // Si estábamos "sonando" según el reloj de pared, cerrar ese segmento.
    if (this._playingSince != null) {
      this.exposureMs += this.wallNow() - this._playingSince;
      this._playingSince = null;
    }
    this._suspendedSince = this.wallNow();
    this._record('audioSuspended', payload);
  }

  /** El AudioContext volvió a running. */
  recover(payload = {}) {
    if (this._suspendedSince == null) return;
    const dur = this.wallNow() - this._suspendedSince;
    this.interruptedMs += dur;
    this.interruptions.push({ start: this._suspendedSince, end: this.wallNow(), durationMs: dur, reason: payload.reason || 'audioSuspended' });
    this._suspendedSince = null;
    this._playingSince = this.wallNow();
    this._record('audioRecovered', payload);
  }

  /**
   * Paso a segundo plano / vuelta. Si el audio SIGUE sonando en segundo
   * plano (Android con ancla, PWA instalada) la exposición continúa; si no
   * hay audio (pestaña congelada sin audio), equivale a una suspensión.
   */
  background(audioRunning = false, payload = {}) {
    if (audioRunning) {
      this._record('experimentBackgrounded', { ...payload, audioRunning: true });
    } else {
      this.suspend({ ...payload, reason: 'hidden-no-audio' });
    }
  }

  foreground(payload = {}) {
    this._record('experimentForegrounded', payload);
  }

  /** Evento informativo (cambios de estímulo, volumen, condición, …). */
  note(type, payload = {}) {
    this._record(type, payload);
  }

  /** Fin de la sesión (temporizador, stop, cierre de experimento). */
  stop(payload = {}) {
    const now = this.wallNow();
    if (this._playingSince != null) {
      this.exposureMs += now - this._playingSince;
      this._playingSince = null;
    }
    if (this._pausedSince != null) {
      this.pausedMs += now - this._pausedSince;
      this._pausedSince = null;
    }
    if (this._suspendedSince != null) {
      const dur = now - this._suspendedSince;
      this.interruptedMs += dur;
      this.interruptions.push({ start: this._suspendedSince, end: now, durationMs: dur, reason: 'audioSuspended' });
      this._suspendedSince = null;
    }
    // El reloj de pared se congela aquí: compute() posterior no debe alargar
    // la sesión (el tiempo tras el stop no es ni exposición ni espera).
    this.endWall = now;
    this._record('experimentCompleted', payload);
  }

  /** Cálculo final: tiempos e integridad (0..1). */
  compute() {
    if (this.startWall == null) return { started: false };
    const end = this.endWall != null ? this.endWall : this.wallNow();
    const wallMs = end - this.startWall;
    const exposure = this._closeOpenSegments();
    const expected = Math.max(0, wallMs - this.pausedMs);
    const integrity = expected > 0 ? Math.min(1, Math.max(0, exposure / expected)) : 1;
    return {
      started: true,
      wallMs,
      exposureMs: exposure,
      pausedMs: this.pausedMs,
      interruptedMs: this.interruptedMs,
      interruptions: this.interruptions,
      integrity,
      events: this.events,
    };
  }

  /** Texto honesto del resumen: "100%" o "92% — Audio interruption 24.8 s". */
  integrityText() {
    const r = this.compute();
    if (!r.started) return null;
    const pct = Math.round(r.integrity * 100);
    const totalInt = r.interruptions.reduce((a, i) => a + i.durationMs, 0);
    if (r.integrity >= 1) return `${pct}%`;
    const s = (totalInt / 1000).toFixed(1);
    return `${pct}% — Interrupción de audio ${s} s`;
  }

  _closeOpenSegments() {
    let exposure = this.exposureMs;
    const now = this.wallNow();
    if (this._playingSince != null) exposure += now - this._playingSince;
    return exposure;
  }
}
