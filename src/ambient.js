// Motor de sonidos de ambiente generados por procedimiento (lluvia, río,
// bosque, pájaros, océano, fuego). Admite varios sonidos a la vez: cada tipo es una capa
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
      panner: this.ctx.createPanner(), // PHASE 5: HRTF spatializer
      lfo: null,
      lfoGain: null,
      nodes: [],
      timers: [],
    };
    
    // PHASE 5: Spatialization of ambient sound using HRTF
    // We position the sound source in a 3D sphere around the user.
    layer.panner.panningModel = 'HRTF';
    layer.panner.distanceModel = 'inverse';
    layer.panner.refDistance = 1;
    layer.panner.maxDistance = 10000;
    layer.panner.rolloffFactor = 1;

    // Distribute randomly in a hemisphere around the user, at a distance of 2-5 meters.
    const theta = Math.random() * Math.PI * 2; // azimuth
    const phi = (Math.random() - 0.2) * Math.PI * 0.5; // elevation (-10 to 45 deg)
    const r = 2 + Math.random() * 3;
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);
    
    // Older browsers might need setPosition, but positionX/Y/Z are standard now.
    if (layer.panner.positionX) {
      layer.panner.positionX.value = x;
      layer.panner.positionY.value = y;
      layer.panner.positionZ.value = z;
    } else {
      layer.panner.setPosition(x, y, z);
    }

    layer.syncGain.gain.value = 1;
    layer.gain.gain.value = this.layerVolumes[type] ?? 1;
    
    // Route: syncGain -> gain -> panner -> ambientGain
    layer.syncGain.connect(layer.gain);
    layer.gain.connect(layer.panner);
    layer.panner.connect(this.ambientGain || this.output);
    
    layer.nodes.push(layer.gain, layer.panner);
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

    // Espuma fina: brillo agudo del agua cayendo (el "siseo" de la lluvia
    // fuerte), muy sutil, para que el lecho no suene a manta plana.
    const hiss = ctx.createBufferSource();
    hiss.buffer = makeNoise(ctx, 'white', 6);
    hiss.loop = true;
    const hissLp = ctx.createBiquadFilter();
    hissLp.type = 'lowpass';
    hissLp.frequency.value = 8000;
    const hissG = ctx.createGain();
    hissG.gain.value = 0.045;
    hiss.connect(hissLp).connect(hissG).connect(layer.syncGain);
    hiss.start();
    layer.nodes.push(hiss, hissLp, hissG);

    // Gotitas: ráfagas suaves, con ataque gradual y sin picos agudos. La
    // frecuencia del pling varía mucho más (cerca y lejos) para que la
    // lluvia suene densa y con cuerpo, no como metrónomo.
    const droplet = () => {
      if (this.layers.get('lluvia') !== layer) return;
      const t = ctx.currentTime;
      const dsrc = ctx.createBufferSource();
      dsrc.buffer = this._dropBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 700 + Math.random() * 4600;
      bp.Q.value = 3.5 + Math.random() * 3;
      const lp2 = ctx.createBiquadFilter();
      lp2.type = 'lowpass';
      lp2.frequency.value = 4600;
      const dg = ctx.createGain();
      const peak = 0.045 + Math.random() * 0.1;
      dg.gain.setValueAtTime(0.0001, t);
      dg.gain.linearRampToValueAtTime(peak, t + 0.008);
      dg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + Math.random() * 0.1);
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

    // Brillo del agua sobre piedras: ruido rosa filtrado agudo, con su propio
    // LFO lento — el "chorrito" que suena entre las rocas del río.
    const shimmer = ctx.createBufferSource();
    shimmer.buffer = makeNoise(ctx, 'pink', 6);
    shimmer.loop = true;
    const shBp = ctx.createBiquadFilter();
    shBp.type = 'bandpass';
    shBp.frequency.value = 1900;
    shBp.Q.value = 0.8;
    const shG = ctx.createGain();
    shG.gain.value = 0.035;
    const shLfo = ctx.createOscillator();
    shLfo.frequency.value = 0.4;
    const shLfoG = ctx.createGain();
    shLfoG.gain.value = 0.018;
    shLfo.connect(shLfoG).connect(shG.gain);
    shimmer.connect(shBp).connect(shG).connect(layer.syncGain);
    shimmer.start();
    shLfo.start();
    layer.nodes.push(shimmer, shBp, shG, shLfo, shLfoG);

    // Gorgoteo: burbujas ocasionales — un tono corto que barre hacia abajo,
    // como una burbuja que sube y estalla.
    const gurgle = () => {
      if (this.layers.get('rio') !== layer) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'sine';
      const f0 = 340 + Math.random() * 480;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.45, t + 0.16);
      const og = ctx.createGain();
      const pk = 0.02 + Math.random() * 0.035;
      og.gain.setValueAtTime(0.0001, t);
      og.gain.linearRampToValueAtTime(pk, t + 0.015);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(og).connect(layer.syncGain);
      o.start(t);
      o.stop(t + 0.3);
      layer.timers.push(
        setTimeout(() => {
          try {
            o.disconnect();
          } catch (_) {
            /* ya desconectado */
          }
          try {
            og.disconnect();
          } catch (_) {
            /* ya desconectado */
          }
        }, 500),
      );
      layer.timers.push(setTimeout(gurgle, 2400 + Math.random() * 5200));
    };
    gurgle();
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

    // Hojarasca: el viento moviendo hojas — ruido rosa agudo, muy bajo, con
    // ráfagas aleatorias lentas (como una hoja que se arrastra por el suelo).
    const rustle = ctx.createBufferSource();
    rustle.buffer = makeNoise(ctx, 'pink', 6);
    rustle.loop = true;
    const ruHp = ctx.createBiquadFilter();
    ruHp.type = 'highpass';
    ruHp.frequency.value = 2200;
    const ruG = ctx.createGain();
    ruG.gain.value = 0.02;
    rustle.connect(ruHp).connect(ruG).connect(layer.syncGain);
    rustle.start();
    layer.nodes.push(rustle, ruHp, ruG);
    const rustleTimer = () => {
      if (this.layers.get('bosque') !== layer) return;
      // Ráfaga suave: sube y baja la ganancia de la hojarasca.
      ruG.gain.cancelScheduledValues(ctx.currentTime);
      ruG.gain.setValueAtTime(ruG.gain.value, ctx.currentTime);
      ruG.gain.linearRampToValueAtTime(0.012 + Math.random() * 0.03, ctx.currentTime + 0.6 + Math.random() * 0.8);
      ruG.gain.linearRampToValueAtTime(0.02, ctx.currentTime + 2.4 + Math.random() * 2.5);
      layer.timers.push(setTimeout(rustleTimer, 1800 + Math.random() * 3200));
    };
    rustleTimer();
    this._scheduleBirds(layer);
  }

  // ------------------------------------------------------------ Océano
  // Olas: lecho de ruido marrón que "hincha" con un LFO muy lento (oleaje),
  // un siseo de espuma filtrado agudo con su propia respiración y choques
  // de ola programados que barren la frecuencia de agudo a grave, como una
  // ola que sube, rompe y se retira por la arena.
  _buildOceano() {
    const layer = this.layers.get('oceano');
    const ctx = this.ctx;
    // Lecho: ruido marrón (profundo) filtrado bajo. Es el cuerpo de la ola.
    const src = ctx.createBufferSource();
    src.buffer = makeNoise(ctx, 'brown', 8);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    // Oleaje: LFO muy lento que hincha y encoge el lecho (0.5 ± 0.3), con
    // el periodo de una ola real. Fase libre: no compite con el latido.
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.08;
    const swellG = ctx.createGain();
    swellG.gain.value = 0.3;
    swell.connect(swellG).connect(g.gain);
    src.connect(lp).connect(g).connect(layer.syncGain);
    src.start();
    swell.start();
    layer.nodes.push(src, lp, g, swell, swellG);

    // Espuma: ruido rosa filtrado agudo, con LFO un poco más rápido que el
    // oleaje: suena como el agua subiendo por la arena entre olas.
    const hiss = ctx.createBufferSource();
    hiss.buffer = makeNoise(ctx, 'pink', 8);
    hiss.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1600;
    const hg = ctx.createGain();
    hg.gain.value = 0.05;
    const hlfo = ctx.createOscillator();
    hlfo.frequency.value = 0.13;
    const hlfoG = ctx.createGain();
    hlfoG.gain.value = 0.03;
    hlfo.connect(hlfoG).connect(hg.gain);
    hiss.connect(hp).connect(hg).connect(layer.syncGain);
    hiss.start();
    hlfo.start();
    layer.nodes.push(hiss, hp, hg, hlfo, hlfoG);

    // Lavado suave: pequeñas subidas de agua entre olas grandes (el agua que
    // sube por la arena y se retira), mucho más discretas que el choque.
    const wash = () => {
      if (this.layers.get('oceano') !== layer) return;
      const t = ctx.currentTime;
      const wsrc = ctx.createBufferSource();
      wsrc.buffer = makeNoise(ctx, 'pink', 1.2);
      wsrc.loop = true;
      const wb = ctx.createBiquadFilter();
      wb.type = 'lowpass';
      wb.frequency.setValueAtTime(520, t);
      wb.frequency.linearRampToValueAtTime(260, t + 1.6);
      const wg = ctx.createGain();
      const wpk = 0.05 + Math.random() * 0.06;
      wg.gain.setValueAtTime(0.0001, t);
      wg.gain.linearRampToValueAtTime(wpk, t + 0.5 + Math.random() * 0.5);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
      wsrc.connect(wb).connect(wg).connect(layer.syncGain);
      wsrc.start(t);
      wsrc.stop(t + 2.3);
      layer.timers.push(
        setTimeout(() => {
          [wsrc, wb, wg].forEach((n) => {
            try {
              n.disconnect();
            } catch (_) {
              /* ya desconectado */
            }
          });
        }, 2500),
      );
      layer.timers.push(setTimeout(wash, 2400 + Math.random() * 3600));
    };
    wash();

    // Choques de ola: ráfaga de ruido que sube despacio, rompe y decae.
    const crash = () => {
      if (this.layers.get('oceano') !== layer) return;
      const t = ctx.currentTime;
      const csrc = ctx.createBufferSource();
      csrc.buffer = makeNoise(ctx, 'pink', 1.5);
      csrc.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(900, t);
      bp.frequency.exponentialRampToValueAtTime(300, t + 2.2);
      bp.Q.value = 0.7;
      const cg = ctx.createGain();
      const peak = 0.16 + Math.random() * 0.12;
      cg.gain.setValueAtTime(0.0001, t);
      cg.gain.linearRampToValueAtTime(peak, t + 0.7 + Math.random() * 0.4);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      csrc.connect(bp).connect(cg).connect(layer.syncGain);
      csrc.start(t);
      csrc.stop(t + 3.2);
      layer.timers.push(
        setTimeout(() => {
          [csrc, bp, cg].forEach((n) => {
            try {
              n.disconnect();
            } catch (_) {
              /* ya desconectado */
            }
          });
        }, 3400),
      );
      layer.timers.push(setTimeout(crash, 3200 + Math.random() * 3800));
    };
    crash();
  }

  // ------------------------------------------------------------ Fuego
  // Fogata: lecho de ruido marrón con la llama parpadeando (LFO sobre el
  // volumen y otro, más lento, sobre el filtro: el fuego respira) y un
  // crepitar programado: chasquidos secos y cortos, a veces en racimos,
  // como leña quemándose.
  _buildFuego() {
    const layer = this.layers.get('fuego');
    const ctx = this.ctx;
    // Lecho: ruido marrón filtrado bajo, la base grave del fuego.
    const src = ctx.createBufferSource();
    src.buffer = makeNoise(ctx, 'brown', 6);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 620;
    const g = ctx.createGain();
    g.gain.value = 0.3;
    // Parpadeo: LFO medio sobre el volumen (0.3 ± 0.15) y LFO lento sobre
    // la frecuencia del filtro, como una hoguera viva.
    const flick = ctx.createOscillator();
    flick.frequency.value = 0.45;
    const flickG = ctx.createGain();
    flickG.gain.value = 0.15;
    flick.connect(flickG).connect(g.gain);
    const roar = ctx.createOscillator();
    roar.frequency.value = 0.09;
    const roarG = ctx.createGain();
    roarG.gain.value = 90;
    roar.connect(roarG).connect(lp.frequency);
    src.connect(lp).connect(g).connect(layer.syncGain);
    src.start();
    flick.start();
    roar.start();
    layer.nodes.push(src, lp, g, flick, flickG, roar, roarG);

    // Crepitar: chasquido seco de ruido blanco, muy corto y filtrado agudo.
    const crackle = (t, low = false) => {
      const csrc = ctx.createBufferSource();
      csrc.buffer = this._dropBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      // Chasquido normal (agudo) o pop grave de madera que revienta (bajo).
      bp.frequency.value = low ? 320 + Math.random() * 480 : 1800 + Math.random() * 3400;
      bp.Q.value = low ? 4.5 : 2.5;
      const cg = ctx.createGain();
      const peak = low ? 0.03 + Math.random() * 0.07 : 0.02 + Math.random() * 0.12;
      cg.gain.setValueAtTime(0.0001, t);
      cg.gain.linearRampToValueAtTime(peak, t + 0.002);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.012 + Math.random() * 0.04);
      csrc.connect(bp).connect(cg).connect(layer.syncGain);
      csrc.start(t);
      csrc.stop(t + 0.12);
      layer.timers.push(
        setTimeout(() => {
          [csrc, bp, cg].forEach((n) => {
            try {
              n.disconnect();
            } catch (_) {
              /* ya desconectado */
            }
          });
        }, 200),
      );
    };

    const timer = () => {
      if (this.layers.get('fuego') !== layer) return;
      const now = ctx.currentTime;
      // Racimos: a veces varios chasquidos casi seguidos (leña que cruje).
      const n = Math.random() < 0.35 ? 2 + Math.floor(Math.random() * 3) : 1;
      for (let i = 0; i < n; i++) {
        crackle(now + i * (0.03 + Math.random() * 0.06));
      }
      // De vez en cuando, un pop grave: una burbuja de resina que revienta.
      if (Math.random() < 0.14) crackle(now + 0.02, true);
      layer.timers.push(setTimeout(timer, 80 + Math.random() * 320));
    };
    timer();
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
    // A veces un trino rápido (3-4 notas casi seguidas, como un pájaro
    // insistente); lo demás son notas simples o dobles.
    const notes =
      Math.random() < 0.25 ? 3 + Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 2);
    const trill = notes >= 3;
    let start = time;
    for (let n = 0; n < notes; n++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const f0 = 1500 + Math.random() * 1600;
      osc.frequency.setValueAtTime(f0, start);
      osc.frequency.exponentialRampToValueAtTime(f0 * (1.25 + Math.random() * 0.4), start + 0.07);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.85, start + 0.15);
      const g = ctx.createGain();
      const pk = trill ? 0.05 : 0.07;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.linearRampToValueAtTime(pk, start + 0.02);
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
      start += trill ? 0.07 + Math.random() * 0.05 : 0.18 + Math.random() * 0.12;
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
    else if (type === 'oceano') this._buildOceano(layer);
    else if (type === 'fuego') this._buildFuego(layer);
  }
}
