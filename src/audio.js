// Motor de ondas binaurales con Web Audio API.
// Reproduce dos osciladores: uno en el oído izquierdo (frecuencia base)
// y otro en el derecho (base + ritmo). El cerebro percibe la diferencia.
//
// Reloj maestro: la fase del latido y el tiempo de sesión se derivan del
// AudioContext.currentTime (AudioClock), nunca de timers JS, para que no
// haya drift aunque la pestaña pase minutos en segundo plano.
import { AudioClock } from './core/audio-clock.js';

export class BinauralEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.analyser = null;
    this.leftOsc = null;
    this.rightOsc = null;
    this.beat = 0;
    this._base = 0;
    this.onBeatPulse = null;
    // Hook para el monitor de ciclo de vida: se dispara con cada cambio real
    // del AudioContext (running ↔ suspended) aunque no haya visibilitychange.
    this.onCtxStateChange = null;
    this._pulseTimer = null;
    this._epoch = null; // tiempo del AudioContext del último latido (fase 0)
    // Reloj maestro de la sesión (fase del latido, tiempo transcurrido).
    this.clock = new AudioClock(() => (this.ctx ? this.ctx.currentTime : 0));
  }

  get isPlaying() {
    return this.leftOsc !== null;
  }

  get currentBeat() {
    return this.beat;
  }

  // Crea el AudioContext (debe crearse/resumirse tras un gesto del usuario).
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;
      // Compresor suave: evita que la suma de ondas + ambientes sature
      // (distorsión) y pega las capas para un resultado más limpio.
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -18;
      this.compressor.knee.value = 20;
      this.compressor.ratio.value = 4;
      this.compressor.attack.value = 0.005;
      this.compressor.release.value = 0.25;
      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      // Estado real del contexto como fuente de verdad del ciclo de vida:
      // iOS al bloquear, pérdida de audio focus o congelación de la pestaña
      // suspenden el contexto sin disparar visibilitychange.
      this.ctx.onstatechange = () => {
        if (this.onCtxStateChange) this.onCtxStateChange(this.ctx.state);
      };
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  // Reanuda el AudioContext si el sistema lo suspendió (p. ej. al volver a
  // la app tras cambiar de aplicación, bloquear la pantalla o cerrar la
  // pestaña temporalmente). Sin esto la sesión vuelve muda hasta que el
  // usuario toca play otra vez.
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {
        /* el navegador exigirá un gesto para reanudar */
      });
    }
  }

  // Reanudación sin clics: si el SO suspendió el contexto (iOS al bloquear,
  // pérdida de audio focus en Android), al volver el audio arranca a plena
  // ganancia en mitad de un ciclo y suena un clic/pop. Aquí se baja la
  // ganancia al piso ANTES de reanudar, se reanuda y se sube con una rampa
  // suave hasta el volumen de la sesión: el reinicio queda inaudible.
  recoverFade(volume = 0.6, seconds = 0.8) {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const wasSuspended = ctx.state === 'suspended';
    const now = ctx.currentTime;
    try {
      this.masterGain.gain.cancelScheduledValues(now);
      // Piso inmediato: evita que el primer bloque renderizado tras resume()
      // salte a plena ganancia.
      this.masterGain.gain.setValueAtTime(0.0001, now);
    } catch (_) {
      /* contexto cerrado */
    }
    this.resume();
    if (wasSuspended) {
      // Rampa desde el piso: el fade de entrada enmascara la reanudación.
      try {
        this.masterGain.gain.linearRampToValueAtTime(Math.max(0.0001, volume), now + seconds);
      } catch (_) {
        /* contexto cerrado */
      }
    } else if (this.masterGain.gain.value < 0.02) {
      // Contexto ya corriendo pero mudo (watchdog): subir con suavidad.
      try {
        this.masterGain.gain.linearRampToValueAtTime(Math.max(0.0001, volume), now + seconds);
      } catch (_) {
        /* contexto cerrado */
      }
    }
    this._volume = volume;
  }

  // RMS de la señal que sale al altavoz, tomada del analizador (0…1 aprox.).
  // Devuelve null si no hay analizador todavía (antes del primer play). Lo usa
  // el watchdog del SimulationEngine para detectar una sesión "en play pero
  // muda" (contexto suspendido o ganancia muerta) y recuperarla.
  getRms() {
    if (!this.analyser) return null;
    const fft = this.analyser.fftSize;
    if (!this._tdBuf || this._tdBuf.length !== fft) this._tdBuf = new Uint8Array(fft);
    this.analyser.getByteTimeDomainData(this._tdBuf);
    let sum = 0;
    for (let i = 0; i < fft; i++) {
      const v = (this._tdBuf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / fft);
  }

  start({ base = 200, beat = 10, volume = 0.5, wave = 'sine' }) {
    const ctx = this.ensure();
    this.stopInstant();
    this._base = base;
    this.beat = beat;

    const left = ctx.createOscillator();
    const right = ctx.createOscillator();
    left.type = wave;
    right.type = wave;
    left.frequency.value = base;
    right.frequency.value = base + beat;

    const leftGain = ctx.createGain();
    leftGain.gain.value = 0.5;
    const rightGain = ctx.createGain();
    rightGain.gain.value = 0.5;
    const leftPanner = ctx.createStereoPanner();
    leftPanner.pan.value = -1;
    const rightPanner = ctx.createStereoPanner();
    rightPanner.pan.value = 1;

    left.connect(leftGain).connect(leftPanner).connect(this.masterGain);
    right.connect(rightGain).connect(rightPanner).connect(this.masterGain);

    left.start();
    right.start();
    this.leftOsc = left;
    this.rightOsc = right;
    // Volumen objetivo de la sesión (para restauraciones y el watchdog de audio).
    this._volume = volume;
    // Época del primer latido: el primer pulso del timer se dispara a +100 ms.
    this._epoch = ctx.currentTime + 0.1;
    this.clock.setEpoch(this._epoch);

    // Fundido de entrada para un inicio suave.
    const now = ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(Math.max(0.0001, this.masterGain.gain.value), now);
    this.masterGain.gain.linearRampToValueAtTime(volume, now + 1.2);

    this._startPulse();
  }

  setVolume(v) {
    this._volume = v;
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(Math.max(0.0001, this.masterGain.gain.value), now);
    this.masterGain.gain.linearRampToValueAtTime(v, now + 0.2);
  }

  // Fundido suave del volumen maestro a un nivel dado (0…1). Se usa al pasar
  // la app a segundo plano (fade-out a 0) y al volver (fade-in al volumen de
  // la sesión), para que la suspensión/reanudación del AudioContext no suene
  // a cortes, clics o interferencias.
  fadeTo(v, seconds = 0.25) {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(Math.max(0.0001, this.masterGain.gain.value), now);
    this.masterGain.gain.linearRampToValueAtTime(Math.max(0.0001, v), now + seconds);
  }

  // Reajusta las frecuencias en marcha con una transición suave (ramp),
  // sin reiniciar los osciladores ni cortar el sonido: al cambiar de estado
  // la portadora y el latido se deslizan hasta los valores nuevos en 1.5s.
  retune({ base, beat }) {
    if (!this.ctx || !this.leftOsc) return;
    const now = this.ctx.currentTime;
    
    // Transición ultra-suave cancelando valores previos
    this.leftOsc.frequency.cancelScheduledValues(now);
    this.leftOsc.frequency.setValueAtTime(this.leftOsc.frequency.value, now);
    this.leftOsc.frequency.linearRampToValueAtTime(base, now + 1.5);
    
    this.rightOsc.frequency.cancelScheduledValues(now);
    this.rightOsc.frequency.setValueAtTime(this.rightOsc.frequency.value, now);
    this.rightOsc.frequency.linearRampToValueAtTime(base + beat, now + 1.5);
    
    this._base = base;
    this.beat = beat;
  }

  // Cambia la forma de onda en vivo: el tipo del oscilador es mutable, así
  // que se puede cambiar sobre la marcha sin cortar ni reiniciar el sonido.
  setWave(wave) {
    if (this.leftOsc) this.leftOsc.type = wave;
    if (this.rightOsc) this.rightOsc.type = wave;
  }

  // Desvanece el volumen maestro a cero (fade-out) durante `duration` ms y
  // avisa al terminar, para que el final del temporizador no corte en seco.
  fadeAndStop(duration = 2000, done) {
    const ctx = this.ctx;
    if (!ctx || !this.leftOsc) {
      if (done) done();
      return;
    }
    const now = ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(Math.max(0.0001, this.masterGain.gain.value), now);
    this.masterGain.gain.linearRampToValueAtTime(0.0001, now + duration / 1000);
    setTimeout(() => {
      if (done) done();
    }, duration + 80);
  }

  // Dispara onBeatPulse cada latido binaural (para la animación visual).
  // El timer se auto-corrige con el reloj del AudioContext para no acumular
  // deriva y quedar siempre alineado con la fase real del latido.
  _startPulse() {
    if (this._pulseTimer) clearTimeout(this._pulseTimer);
    const tick = () => {
      if (!this.leftOsc) return;
      if (this.onBeatPulse) this.onBeatPulse();
      let delay = this.beat > 0 ? 1000 / this.beat : 1000;
      if (this.ctx && this._epoch != null) {
        const period = Math.max(0.08, 1 / this.beat);
        const elapsed = this.ctx.currentTime - this._epoch;
        delay = Math.max(20, (period - (elapsed % period)) * 1000);
      }
      this._pulseTimer = setTimeout(tick, delay);
    };
    this._pulseTimer = setTimeout(tick, 100);
  }

  // Fase del latido [0,1) en un instante dado del reloj del AudioContext.
  // 0 = justo el latido, igual que el pulso que ven las gotas del visualizador.
  // Derivada del AudioClock (AudioContext.currentTime): sin drift por timers.
  getBeatPhaseAt(time) {
    if (!this.ctx || this._epoch == null || !this.leftOsc || !this.beat) return null;
    return this.clock.beatPhase(this.beat, time);
  }

  // Fase del latido en este momento.
  getBeatPhase() {
    if (!this.ctx) return null;
    return this.getBeatPhaseAt(this.ctx.currentTime);
  }

  // Estado real del motor para el monitor de integridad (P26/P36): contexto,
  // sample rate, reloj, ganancia, RMS y nº de osciladores. Devuelve null si
  // todavía no hay contexto.
  getAudioStats() {
    if (!this.ctx) return null;
    return {
      ctxState: this.ctx.state,
      sampleRate: this.ctx.sampleRate,
      currentTime: this.ctx.currentTime,
      gain: this.masterGain ? this.masterGain.gain.value : 0,
      rms: this.getRms(),
      oscillatorCount: this.leftOsc ? 2 : 0,
    };
  }

  // Época del latido actual (para alinear el LFO de los ambientes).
  getBeatEpoch() {
    return this._epoch;
  }

  stop(fade = true) {
    if (!this.ctx || !this.leftOsc) return;
    const oscs = [this.leftOsc, this.rightOsc];
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(Math.max(0.0001, this.masterGain.gain.value), now);
    this.masterGain.gain.linearRampToValueAtTime(0.0001, now + (fade ? 1 : 0.05));
    this.leftOsc = null;
    this.rightOsc = null;
    if (this._pulseTimer) {
      clearTimeout(this._pulseTimer);
      this._pulseTimer = null;
    }
    setTimeout(
      () =>
        oscs.forEach((o) => {
          try {
            o.stop();
          } catch (_) {
            /* ya detenido */
          }
          o.disconnect();
        }),
      fade ? 1100 : 80,
    );
  }

  stopInstant() {
    this.stop(false);
  }
}
