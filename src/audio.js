// Motor de ondas binaurales con Web Audio API.
// Reproduce dos osciladores: uno en el oído izquierdo (frecuencia base)
// y otro en el derecho (base + ritmo). El cerebro percibe la diferencia.

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
    this._pulseTimer = null;
    this._epoch = null; // tiempo del AudioContext del último latido (fase 0)
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
    // Época del primer latido: el primer pulso del timer se dispara a +100 ms.
    this._epoch = ctx.currentTime + 0.1;

    // Fundido de entrada para un inicio suave.
    const now = ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(Math.max(0.0001, this.masterGain.gain.value), now);
    this.masterGain.gain.linearRampToValueAtTime(volume, now + 1.2);

    this._startPulse();
  }

  setVolume(v) {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(Math.max(0.0001, this.masterGain.gain.value), now);
    this.masterGain.gain.linearRampToValueAtTime(v, now + 0.2);
  }

  // Reajusta las frecuencias en marcha con una transición suave (ramp),
  // sin reiniciar los osciladores ni cortar el sonido: al cambiar de estado
  // la portadora y el latido se deslizan hasta los valores nuevos.
  retune({ base, beat }) {
    if (!this.ctx || !this.leftOsc) return;
    const now = this.ctx.currentTime;
    this.leftOsc.frequency.setTargetAtTime(base, now, 0.4);
    this.rightOsc.frequency.setTargetAtTime(base + beat, now, 0.4);
    this._base = base;
    this.beat = beat;
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
  getBeatPhaseAt(time) {
    if (!this.ctx || this._epoch == null || !this.leftOsc || !this.beat) return null;
    const period = Math.max(0.08, 1 / this.beat);
    const elapsed = time - this._epoch;
    return (((elapsed % period) + period) % period) / period;
  }

  // Fase del latido en este momento.
  getBeatPhase() {
    if (!this.ctx) return null;
    return this.getBeatPhaseAt(this.ctx.currentTime);
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
