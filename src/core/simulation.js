// src/core/simulation.js
// Master controller orchestrating Audio, Neural, Cognitive, and Physics models.
// Phase 1: Strict Pipeline Architecture
// Stimulus -> Auditory -> Neural -> EEG -> Cognitive -> Visual -> Renderer

import { BinauralEngine } from '../audio.js';
import { AuditoryStateModel } from './auditory.js';
import { NeuralStateModel } from './neural.js';
import { CognitiveStateModel } from './cognitive.js';
import { EegInterface } from './eeg.js';
import { ScientificHUD } from '../ui/hud.js';
import { NeuralToVisualMapper } from './visual.js';
import { SimulationSeed, SimulationConfig, buildExperimentRecord, MODEL_VERSION } from './reproducibility.js';
import { evaluateAudioHealth } from './audio-health.js';

export class SimulationEngine {
  /**
   * @param {object} [cymaticsRenderer] CymaticsRenderer instance (optional).
   * @param {object} [opts]
   * @param {number} [opts.seed] Reproducibility seed for the stochastic models
   *   (Phase 12). Omit for non-deterministic sampling.
   */
  constructor(cymaticsRenderer, { seed = null } = {}) {
    this.audio = new BinauralEngine();
    this.auditory = new AuditoryStateModel();
    this.neural = new NeuralStateModel();
    this.cognitive = new CognitiveStateModel();
    this.eeg = new EegInterface({ seed });
    this.visualMapper = new NeuralToVisualMapper();
    this.hud = new ScientificHUD('scientific-hud');
    this.cymatics = cymaticsRenderer;

    // Phase 12: reproducibility bookkeeping
    this.seed = new SimulationSeed(seed ?? undefined);
    this.modelVersion = MODEL_VERSION;
    this.lastConfig = null;

    // Audio watchdog state: detects a session that is "playing but silent"
    // (OS-suspended context, dead gain) and recovers it automatically.
    this._audioHealth = 0;
    this._healthFrames = 0;
    
    // Quick reference to ambient engine so auditory model can check its volume
    this.ambient = null; 
    
    this.currentProfile = null;
    this.isPlaying = false;
    this.lastTime = performance.now();
    this.animFrame = null;
    
    // Start simulation loop
    this.loop = this.loop.bind(this);
    this.loop();
  }

  setProfile(profile, baseFreq) {
    this.currentProfile = profile;
    // Route parameters to appropriate domains
    this.neural.setProfile(profile.modelParams);
    this.cognitive.setProfile(profile.modelParams);
    this.eeg.setTargetBands(profile.neuralHypothesis.targetBands);
    
    // We update the audio engine parameters if it is playing
    if (this.isPlaying) {
      this.audio.retune({
        base: baseFreq || profile.stimulus.carrierBase,
        beat: profile.stimulus.beat
      });
    }
  }

  /**
   * Phase 14: capture the current run as a JSON experiment record
   * (modelVersion + seed + canonical config + optional results).
   */
  recordExperiment(results = null) {
    const config = this.lastConfig || new SimulationConfig({
      carrier: this.currentProfile?.stimulus.carrierBase ?? 220,
      beat: this.currentProfile?.stimulus.beat ?? 10,
      waveform: this.currentProfile?.stimulus.modulation ?? 'sine',
      modelParams: this.currentProfile?.modelParams ?? null,
    });
    return buildExperimentRecord({ config, seed: this.seed, results });
  }

  toggleScientificMode() {
    if (!this.cymatics) return;
    const currentMode = this.cymatics.getRenderMode();
    const newMode = currentMode === 'cinematic' ? 'scientific' : 'cinematic';
    this.cymatics.setRenderMode(newMode);
    
    // Optional: flash a UI notice or something if available
    console.log(`[SimulationEngine] Switched render mode to ${newMode}`);
  }

  start(baseFreq) {
    if (!this.currentProfile) return;
    
    const params = {
      base: baseFreq || this.currentProfile.stimulus.carrierBase,
      beat: this.currentProfile.stimulus.beat,
      wave: this.currentProfile.stimulus.modulation,
      volume: 0.6 // Controlled from UI elsewhere
    };
    
    this.audio.start(params);
    this.isPlaying = true;

    // Phase 12: record the canonical config of this run (for experiment export)
    this.lastConfig = new SimulationConfig({
      carrier: params.base,
      beat: params.beat,
      waveform: params.wave,
      durationSec: 0,
      volume: params.volume,
      modelParams: this.currentProfile?.modelParams ?? null,
    });
    
    // Link audio beat pulse to cymatics energy (perturbation model)
    this.audio.onBeatPulse = () => {
      if (this.cymatics) {
        // High arousal = strong pulses. Relaxation = smooth, subdued pulses.
        const state = this.cognitive.getState();
        const pulseStrength = 0.5 + (state.arousal.value * 0.5);
        this.cymatics.pulse(pulseStrength);
      }
    };
  }

  stop() {
    this.audio.stop(true);
    this.isPlaying = false;
  }
  
  setVolume(vol) {
    this.audio.setVolume(vol);
  }

  loop() {
    this.animFrame = requestAnimationFrame(this.loop);
    
    const now = performance.now();
    const dt = (now - this.lastTime) / 1000.0;
    this.lastTime = now;

    // 1. STIMULUS LAYER (Implicit in audio engine)
    const currentBase = this.audio._base || (this.currentProfile ? this.currentProfile.stimulus.carrierBase : 220);
    const currentBeat = this.audio.beat || (this.currentProfile ? this.currentProfile.stimulus.beat : 0);
    
    // Get master volumes (assume max 1.0)
    // If we have an ambient reference, grab its master volume. Otherwise use 0.
    const binauralVol = this.audio.masterGain ? this.audio.masterGain.gain.value : 0;
    const ambientVol = (this.ambient && this.ambient.active) ? this.ambient.volume : 0;

    // 2. AUDITORY MODEL (Phase 5)
    this.auditory.update(dt, {
      baseFreq: currentBase,
      binauralVolume: binauralVol,
      ambientVolume: ambientVol
    });
    const auditoryState = this.auditory.getState();

    // 3. NEURAL MODEL
    // Modulate the neural entrainment effectiveness by the perceptual strength 
    // of the auditory stimulus (accounting for masking and Fletcher-Munson).
    this.neural.update(dt, this.isPlaying, auditoryState.perceptualStrength, currentBeat);
    const neuralState = this.neural.getState();

    // 4. EEG MODEL (Simulated Measurement)
    const eegState = this.eeg.update(dt, neuralState);

    // 5. COGNITIVE MODEL
    this.cognitive.update(dt, this.isPlaying, neuralState);
    const cognitiveState = this.cognitive.getState();

    // 6. VISUAL METAPHOR LAYER (Phase 9: explicit Neural → Visual mapping)
    let visualState = null;
    if (this.currentProfile) {
      // The ONLY Neural→Visual transformation in the system. Renderers never
      // read neural variables directly. All fields are provenance-tagged.
      visualState = this.visualMapper.map({
        neural: neuralState,
        cognitive: cognitiveState,
        baseFrequency: currentBase,
        visualMetaphor: this.currentProfile.visualMetaphor,
      });
      
      if (this.cymatics) {
        // Feed pure visual/physical state to the renderer
        this.cymatics.updatePhysicsState(visualState);
      }
    }

    // Update Scientific HUD (Phase 14: grouped domains, never mixed)
    if (this.currentProfile) {
      const dominantMode = this.cymatics ? this.cymatics.getDominantMode() : null;
      this.hud.update({
        stimulus: {
          base: currentBase,
          beat: currentBeat,
          waveform: this.currentProfile.stimulus.modulation,
          amplitude: binauralVol,
        },
        neural: neuralState,
        cognitive: cognitiveState,
        hypothesis: this.currentProfile.neuralHypothesis,
        eeg: eegState,
        dominantMode,
        visual: visualState,
      });
    }

    // ── Audio watchdog ────────────────────────────────────────────────────────
    // Si la sesión está en play pero el sistema suspende el AudioContext sin
    // disparar visibilitychange (iOS al bloquear, pérdida de audio focus en
    // Android, entrada/salida de fullscreen en algunos dispositivos), el botón
    // se quedaría "en play" con la sesión muda. Cada ~0.5 s se muestrea el
    // estado real y se aplica la decisión de src/core/audio-health.js (pura y
    // testeada). Nunca actúa si el usuario puso el volumen en 0.
    if (this.isPlaying && this.audio && this.audio.ctx) {
      this._healthFrames++;
      if (this._healthFrames % 30 === 0) {
        const health = evaluateAudioHealth({
          isPlaying: this.isPlaying,
          ctxState: this.audio.ctx.state,
          gain: this.audio.masterGain ? this.audio.masterGain.gain.value : 0,
          rms: this.audio.getRms(),
          prevHealth: this._audioHealth,
        });
        this._audioHealth = health.health;
        if (health.action === 'resume') {
          console.warn('[SimulationEngine] AudioContext suspendido con sesión activa — reanudando.');
          this.audio.resume();
        } else if (health.action === 'refade') {
          console.warn('[SimulationEngine] Sesión en play sin señal de audio — reaplicando volumen.');
          this.audio.resume();
          this.audio.fadeTo(this.audio._volume ?? 0.6, 0.3);
        }
      }
    }
  }
}
