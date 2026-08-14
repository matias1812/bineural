// src/core/eeg.js
// EEG Interface Module
// Phase 7: Realistic EEG Simulation
// Derives virtual EEG from the NeuralStateModel (Phase 6) instead of raw noise.
// Adds: hemispheric asymmetry, 1/f (pink) noise, biological artifacts (EMG, blink).

import { EEGState } from './states.js';
import { mulberry32 } from './reproducibility.js';

// ── Pink-noise approximation via Voss-McCartney algorithm (3-register approx) ──
// Generates values with a power spectrum proportional to 1/f.
class PinkNoiseOscillator {
  constructor(rng = Math.random) {
    this.b0 = 0; this.b1 = 0; this.b2 = 0;
    this._rng = rng;
  }
  next() {
    const w = this._rng() * 2 - 1;
    this.b0 = 0.99886 * this.b0 + w * 0.0555179;
    this.b1 = 0.99332 * this.b1 + w * 0.0750759;
    this.b2 = 0.96900 * this.b2 + w * 0.1538520;
    // Normalized to ~[-0.5, 0.5]
    return (this.b0 + this.b1 + this.b2 + w * 0.0816000) * 0.11;
  }
}

export class EegInterface {
  constructor({ seed = null } = {}) {
    this.isConnected = false;
    this.simulatedTime = 0;
    this.targetBands = null;

    this.state = new EEGState();

    // Phase 12: Reproducibility — a seeded PRNG makes the simulated stream
    // deterministic when a SimulationSeed is provided (see core/reproducibility.js).
    // Without a seed the stream is non-deterministic (realistic default).
    this.setSeed(seed);

    // Phase 7: Noise sources
    this.pink = new PinkNoiseOscillator(this._rand);

    // Hemispheric asymmetry bias: positive = left dominant (common in focused state)
    // Fluctuates slowly over time on a ~30-second cycle.
    this._asymmetryBias = (this._rand() - 0.5) * 0.2;
    this._asymmetryPhase = this._rand() * Math.PI * 2;

    // Blink artifact model
    this._nextBlinkIn = 3 + this._rand() * 5; // seconds until next blink
    this._blinkDuration = 0;                   // seconds remaining

    // The simulated stream is the DEFAULT measurement source. Real hardware
    // would set isConnected via connect() to a real EEG device; this module
    // is explicitly labeled SyntheticEEG (SIMULATED) in the HUD.
    this.connect();
  }

  /**
   * Phase 12: set a reproducibility seed (mulberry32). Passing null restores
   * non-deterministic sampling (Math.random).
   */
  setSeed(seed) {
    this._seed = seed;
    this._rand = seed == null ? Math.random : mulberry32(seed);
  }

  setTargetBands(bands) {
    this.targetBands = bands;
  }

  connect() {
    this.isConnected = true;
    console.log('[EEG] Simulated hardware stream connected.');
  }

  disconnect() {
    this.isConnected = false;
    console.log('[EEG] Hardware disconnected.');
  }

  toggle() {
    if (this.isConnected) {
      this.disconnect();
    } else {
      this.connect();
    }
  }

  update(dt, neuralState) {
    if (!this.isConnected) return null;
    
    this.simulatedTime += dt;

    // ── Source: Phase 6 NeuralStateModel bands ──────────────────────────────
    // The true underlying signal comes from the physically-derived neural model.
    const srcDelta = neuralState ? neuralState.delta : 0.3;
    const srcTheta = neuralState ? neuralState.theta : 0.2;
    const srcAlpha = neuralState ? neuralState.alpha : 0.5;
    const srcBeta  = neuralState ? neuralState.beta  : 0.2;
    const srcGamma = neuralState ? neuralState.gamma : 0.1;

    // ── Phase 7a: 1/f (Pink) Noise ──────────────────────────────────────────
    // Real EEG has a power spectrum that falls off at ~1/f. All bands have
    // background pink noise riding beneath the stimulus-driven signal.
    const pinkSample = this.pink.next();

    // Band noise amplitudes scale with how "electric" the brain is.
    // High fatigue → more noise (signal-to-noise degrades).
    const noiseFactor = 0.08 + (neuralState ? neuralState.fatigue * 0.12 : 0.08);

    // Apply pink noise + small white noise per band 
    const w = () => (this._rand() - 0.5);
    this.state.delta = Math.max(0, Math.min(1, srcDelta + pinkSample * noiseFactor + w() * 0.03));
    this.state.theta = Math.max(0, Math.min(1, srcTheta + pinkSample * noiseFactor * 0.8 + w() * 0.03));
    this.state.alpha = Math.max(0, Math.min(1, srcAlpha + pinkSample * noiseFactor * 0.7 + w() * 0.03));
    this.state.beta  = Math.max(0, Math.min(1, srcBeta  + pinkSample * noiseFactor * 0.5 + w() * 0.04));
    this.state.gamma = Math.max(0, Math.min(1, srcGamma + pinkSample * noiseFactor * 0.3 + w() * 0.05));

    // ── Phase 7b: Hemispheric Asymmetry ────────────────────────────────────
    // Alpha asymmetry: left-frontal Alpha decrease → approach motivation.
    // Modeled as a slow oscillation (period ~30s) + individual bias.
    const asymmetryOsc = 0.15 * Math.sin(this.simulatedTime * 0.21 + this._asymmetryPhase);
    this.state.asymmetry = this._asymmetryBias + asymmetryOsc;
    // Asymmetry modulates Alpha: one hemisphere has more alpha than the other.
    // This is already captured in the scalar, no band splitting in this model.

    // ── Phase 7c: Blink Artifacts ──────────────────────────────────────────
    // Eye blinks inject a large slow-wave (mainly Delta/Theta) voltage spike.
    this._nextBlinkIn -= dt;
    if (this._nextBlinkIn <= 0 && this._blinkDuration <= 0) {
      // Start a blink
      this._blinkDuration = 0.15 + this._rand() * 0.2; // 150–350 ms
      this._nextBlinkIn = 3 + this._rand() * 7;         // reset timer
    }
    if (this._blinkDuration > 0) {
      const blinkArtifact = 0.6 * Math.sin(Math.PI * this._blinkDuration / 0.25);
      this.state.delta = Math.min(1.0, this.state.delta + blinkArtifact * 0.4);
      this.state.theta = Math.min(1.0, this.state.theta + blinkArtifact * 0.2);
      this._blinkDuration -= dt;
    }

    // ── Phase 7d: Coherence ─────────────────────────────────────────────────
    // Coherence represents synchrony between regions. 
    // Higher adaptation (fresh stimulus) → higher coherence potential.
    // More fatigue → lower coherence.
    const adaptationFactor = neuralState ? neuralState.adaptation : 0.5;
    const fatigueFactor    = neuralState ? neuralState.fatigue    : 0;
    const baseCoherence    = 0.4 + adaptationFactor * 0.4 - fatigueFactor * 0.2;
    this.state.coherence   = Math.max(0, Math.min(1, baseCoherence + (this._rand() - 0.5) * 0.08));
    
    return this.state;
  }
}
