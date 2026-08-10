// Motor de sonidos de ambiente generados por procedimiento (lluvia, río,
// bosque, pájaros). Admite varios sonidos a la vez: cada tipo es una capa
// independiente con su propio grafo de nodos y su propia respiración.
// Todas las capas respiran sincronizadas con el latido binaural: el LFO de
// cada capa se crea con la fase alineada al latido (pico justo en el latido,
// igual que el pulso visual de las gotas) y los pájaros cantan en múltiplos
// del latido, para que todo suene en armonía.

function makeNoise(ctx, kind = 'white', seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  // Filtro de Paul Kellet para ruido rosa (mucho más suave y natural que el blanco).
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') {
      data[i] = w;
    } else if (kind === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    } else if (kind === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else {
      data[i] = (w + last) / 2;
      last = w;
    }
  }
  return buf;
}

export class AmbientEngine {
  constructor() {
    this.ctx = null;
    this.output = null;
    this.ambientGain = null; // ganancia maestra de los ambientes (volumen propio)
    this.volume = 1;
    this.layerVolumes = {}; // type → volumen individual (default 1)
    this.beat = 0;
    this.phaseAt = null; // (t) => fase del latido [0,1) según el reloj del AudioContext
    this._phaseEpoch = null; // época a la que están alineados los LFO
    this.layers = new Map(); // type → capa { syncGain, gain, lfo, lfoGain, nodes, timers }
    this._dropBuf = null;
  }

  get active() {
    return this.layers.size > 0;
  }

  attach(ctx, outputGain) {
    this.ctx = ctx;
    this.output = outputGain;
    // Ganancia maestra de ambientes, independiente del volumen general.
    if (!this.ambientGain) {
      this.ambientGain = ctx.createGain();
      this.ambientGain.gain.value = this.volume;
      this.ambientGain.connect(outputGain);
    }
  }

  setVolume(v) {
    this.volume = v;
    if (this.ctx && this.ambientGain) {
      this.ambientGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    }
  }

  // Volumen individual de un sonido de ambiente (capa).
  setLayerVolume(type, v) {
    this.layerVolumes[type] = v;
    const layer = this.layers.get(type);
    if (layer && layer.gain) {
      layer.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    }
  }

  // Recibe la función de fase del motor binaural para alinear la respiración.
  syncToEngine(engine) {
    if (engine && typeof engine.getBeatPhaseAt === 'function') {
      this.phaseAt = (t) => engine.getBeatPhaseAt(t);
    }
  }

  // Garantiza que las capas activas coincidan exactamente con `types`.
  applySet(types, beat, epoch) {
    if (!this.ctx) return;
    const wanted = new Set(types);
    for (const type of [...this.layers.keys()]) {
      if (!wanted.has(type)) this.stop(type);
    }
    for (const type of wanted) {
      if (!this.layers.has(type)) this._addLayer(type);
    }
    this.setBeat(beat, epoch);
  }

  setBeat(beat, epoch) {
    this.beat = beat;
    // Si cambió la época del latido (p.ej. otro estado o ritmo), los LFO
    // deben reconstruirse con la nueva fase para seguir sincronizados.
    const rephase = epoch !== this._phaseEpoch;
    this._phaseEpoch = epoch;
    this.layers.forEach((layer) => this._applyLfo(layer, rephase));
  }

  start(type, beat, epoch) {
    if (!this.ctx) return;
    if (!this.layers.has(type)) this._addLayer(type);
    this.setBeat(beat, epoch);
  }

  stop(type) {
    const layer = this.layers.get(type);
    if (!layer) return;
    this.layers.delete(type);
    layer.timers.forEach(clearTimeout);
    const ctx = this.ctx;
    if (ctx && layer.syncGain) {
      layer.syncGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12);
    }
    // Capturamos la lista de nodos de ESTA capa: la limpieza diferida nunca
    // toca los nodos de otras capas ni de sonidos que se inicien después.
    const nodes = layer.nodes;
    layer.nodes = [];
    setTimeout(() => {
      nodes.forEach((n) => {
        try {
          if (typeof n.stop === 'function') n.stop();
        } catch (_) {
          /* ya detenido */
        }
        try {
          n.disconnect();
        } catch (_) {
          /* ya desconectado */
        }
      });
    }, 450);
  }

  stopAll() {
    [...this.layers.keys()].forEach((t) => this.stop(t));
  }

  // ------------------------------------------------------------ Capas
  _addLayer(type) {
    const layer = {
      syncGain: this.ctx.createGain(),
      gain: this.ctx.createGain(), // volumen individual de esta capa
      lfo: null,
      lfoGain: null,
      nodes: [],
      timers: [],
    };
    layer.syncGain.gain.value = 1;
    layer.gain.gain.value = this.layerVolumes[type] ?? 1;
    layer.syncGain.connect(layer.gain);
    layer.gain.connect(this.ambientGain || this.output);
    layer.nodes.push(layer.gain);
    this.layers.set(type, layer);
    if (!this._dropBuf) this._dropBuf = makeNoise(this.ctx, 'white', 0.25);
    this._build(type, layer);
  }

  // LFO que respira la capa. Con `rephase` se reconstruye con la fase
  // alineada al latido actual (p.ej. al cambiar de estado o de ritmo).
  _applyLfo(layer, rephase = false) {
    if (!this.ctx) return;
    const f = Math.max(0.1, this.beat);
    if (rephase && layer.lfo) {
      try {
        layer.lfo.stop();
      } catch (_) {
        /* ya detenido */
      }
      try {
        layer.lfo.disconnect();
      } catch (_) {
        /* ya desconectado */
      }
      try {
        layer.lfoGain.disconnect();
      } catch (_) {
        /* ya desconectado */
      }
      layer.lfo = null;
      layer.lfoGain = null;
    }
    if (!layer.lfo) {
      layer.lfo = this.ctx.createOscillator();
      const wave = this._phaseWave(f);
      if (wave) layer.lfo.setPeriodicWave(wave);
      layer.lfo.frequency.value = f;
      layer.lfoGain = this.ctx.createGain();
      layer.lfoGain.gain.value = 0.06; // profundidad de la respiración (sutil)
      layer.lfo.connect(layer.lfoGain).connect(layer.syncGain.gain);
      layer.lfo.start();
      layer.nodes.push(layer.lfo, layer.lfoGain);
    } else {
      layer.lfo.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.2);
    }
  }

  // Onda senoidal con fase alineada al latido: su pico cae exactamente en la
  // fase 0 del reloj binaural, el mismo instante del pulso visual de las gotas.
  _phaseWave(f) {
    try {
      const now = this.ctx.currentTime;
      let phase = 0;
      if (this.phaseAt) {
        const ph = this.phaseAt(now);
        if (ph != null) phase = ph;
      }
      const phi = 2 * Math.PI * phase + Math.PI / 2;
      const real = new Float32Array(2);
      const imag = new Float32Array(2);
      real[1] = Math.sin(phi);
      imag[1] = Math.cos(phi);
      return this.ctx.createPeriodicWave(real, imag);
    } catch (_) {
      return null; // navegador sin PeriodicWave: respira sin fase alineada
    }
  }

  // ------------------------------------------------------------ Lluvia
  _buildRain() {
    const layer = this.layers.get('lluvia');
    const ctx = this.ctx;
    // Lecho: ruido rosa (suave y natural) bien filtrado. Búfer largo para
    // que el empalme del loop sea casi inaudible.
    const src = ctx.createBufferSource();
    src.buffer = makeNoise(ctx, 'pink', 6);
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 350;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6500;
    const g = ctx.createGain();
    g.gain.value = 0.22;
    src.connect(hp).connect(lp).connect(g).connect(layer.syncGain);
    src.start();
    layer.nodes.push(src, hp, lp, g);

    // Gotitas: ráfagas suaves, con ataque gradual y sin picos agudos.
    const droplet = () => {
      if (this.layers.get('lluvia') !== layer) return;
      const t = ctx.currentTime;
      const dsrc = ctx.createBufferSource();
      dsrc.buffer = this._dropBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1100 + Math.random() * 2400;
      bp.Q.value = 4.5;
      const lp2 = ctx.createBiquadFilter();
      lp2.type = 'lowpass';
      lp2.frequency.value = 4200;
      const dg = ctx.createGain();
      const peak = 0.05 + Math.random() * 0.09;
      dg.gain.setValueAtTime(0.0001, t);
      dg.gain.linearRampToValueAtTime(peak, t + 0.008);
      dg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + Math.random() * 0.09);
      dsrc.connect(bp).connect(lp2).connect(dg).connect(layer.syncGain);
      dsrc.start(t);
      dsrc.stop(t + 0.35);
      // Los nodos de la gotita son efímeros: se desconectan solos al terminar
      // (evita acumular nodos de audio durante sesiones largas).
      layer.timers.push(
        setTimeout(() => {
          [dsrc, bp, lp2, dg].forEach((n) => {
            try {
              n.disconnect();
            } catch (_) {
              /* ya desconectado */
            }
          });
        }, 600),
      );
      layer.timers.push(setTimeout(droplet, 90 + Math.random() * 180));
    };
    droplet();
  }

  // ------------------------------------------------------------ Río
  _buildRio() {
    const layer = this.layers.get('rio');
    const ctx = this.ctx;
    // Lecho: ruido marrón (profundo) filtrado bajo, sin el "wah-wah" fuerte.
    const src = ctx.createBufferSource();
    src.buffer = makeNoise(ctx, 'brown', 6);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 720;
    lp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.value = 0.45;
    // Burbujeo sutil: LFO lento y poco profundo sobre el filtro.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 2.2;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 120;
    lfo.connect(lfoG).connect(lp.frequency);
    src.connect(lp).connect(g).connect(layer.syncGain);
    src.start();
    lfo.start();
    layer.nodes.push(src, lp, g, lfo, lfoG);
  }

  // ------------------------------------------------------------ Bosque
  _buildForest() {
    const layer = this.layers.get('bosque');
    const ctx = this.ctx;
    // Viento entre los árboles: ruido rosa, grave y suave.
    const src = ctx.createBufferSource();
    src.buffer = makeNoise(ctx, 'pink', 6);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 480;
    const g = ctx.createGain();
    g.gain.value = 0.28;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 140;
    lfo.connect(lfoG).connect(lp.frequency);
    src.connect(lp).connect(g).connect(layer.syncGain);
    src.start();
    lfo.start();
    layer.nodes.push(src, lp, g, lfo, lfoG);
    this._scheduleBirds(layer);
  }

  // ------------------------------------------------------------ Pájaros
  _buildBirds() {
    const layer = this.layers.get('pajaros');
    const ctx = this.ctx;
    // Lecho suave de viento para dar contexto.
    const src = ctx.createBufferSource();
    src.buffer = makeNoise(ctx, 'pink', 6);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    const g = ctx.createGain();
    g.gain.value = 0.07;
    src.connect(lp).connect(g).connect(layer.syncGain);
    src.start();
    layer.nodes.push(src, lp, g);
    this._scheduleBirds(layer);
  }

  // Gorjeo: notas con barrido suave de frecuencia, más graves y discretas,
  // sincronizadas a múltiplos del latido.
  _chirp(time, layer) {
    const ctx = this.ctx;
    const notes = 1 + Math.floor(Math.random() * 2);
    let start = time;
    for (let n = 0; n < notes; n++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const f0 = 1500 + Math.random() * 1600;
      osc.frequency.setValueAtTime(f0, start);
      osc.frequency.exponentialRampToValueAtTime(f0 * (1.25 + Math.random() * 0.4), start + 0.07);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.85, start + 0.15);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.linearRampToValueAtTime(0.07, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
      osc.connect(g).connect(layer.syncGain);
      osc.start(start);
      osc.stop(start + 0.28);
      layer.timers.push(
        setTimeout(() => {
          try {
            osc.disconnect();
          } catch (_) {
            /* ya desconectado */
          }
          try {
            g.disconnect();
          } catch (_) {
            /* ya desconectado */
          }
        }, 500),
      );
      start += 0.18 + Math.random() * 0.12;
    }
  }

  _scheduleBirds(layer) {
    const timer = () => {
      if (this.layers.get('bosque') !== layer && this.layers.get('pajaros') !== layer) return;
      const beatSec = 1 / Math.max(0.5, this.beat);
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const k = 1 + Math.floor(Math.random() * 4); // canta dentro de 1-4 latidos
      this._chirp(now + k * beatSec * (0.8 + Math.random() * 0.4), layer);
      layer.timers.push(setTimeout(timer, 1800 + Math.random() * 3200));
    };
    timer();
  }

  _build(type, layer) {
    if (type === 'lluvia') this._buildRain(layer);
    else if (type === 'rio') this._buildRio(layer);
    else if (type === 'bosque') this._buildForest(layer);
    else if (type === 'pajaros') this._buildBirds(layer);
  }
}
