// src/core/neural.js
// Neural State Model: simulates reduced-order neurophysiological variables.
// Phase 6: Entrainment Model - simulates inertia and resonance.

import { NeuralState } from './states.js';
import { assertBounds } from '../validation/assert.js';

export class NeuralStateModel {
  constructor() {
    this.state = new NeuralState();
    this.timeActive = 0;
    this.params = null;
    
    // Baseline resting brain frequency (e.g., low Beta / high Alpha)
    this.baselineFreq = 12.0; 
    
    // The current dominant frequency of the brain model
    this.currentEntrainmentFreq = this.baselineFreq; 
  }

  setProfile(profileParams) {
    this.params = profileParams;
    this.timeActive = 0;
    this.state.adaptation = 1.0;
  }

  // A Gaussian curve to distribute a single frequency into standard EEG bands
  _calculateBandPower(centerFreq, bandTarget, width) {
    const dist = centerFreq - bandTarget;
    return Math.exp(-(dist * dist) / (2 * width * width));
  }

  // Update discrete EEG bands based on the continuous currentEntrainmentFreq
  _updateBands() {
    const f = this.currentEntrainmentFreq;
    this.state.delta = this._calculateBandPower(f, 2.0, 1.5);
    this.state.theta = this._calculateBandPower(f, 6.0, 2.0);
    this.state.alpha = this._calculateBandPower(f, 10.0, 2.0);
    this.state.beta  = this._calculateBandPower(f, 20.0, 6.0);
    this.state.gamma = this._calculateBandPower(f, 40.0, 15.0);
    // Publish the dominant oscillation frequency so downstream models (e.g.
    // CognitiveStateModel) can read it directly from the state object.
    this.state.dominantFreq = f;
  }

  update(dt, isPlaying, perceptualStrength = 1.0, targetBeatFreq = 0) {
    if (!this.params) return;

    if (!isPlaying || targetBeatFreq === 0) {
      // Relax towards baseline (inertia recovery)
      const distToBaseline = this.baselineFreq - this.currentEntrainmentFreq;
      this.currentEntrainmentFreq += distToBaseline * dt * 0.05; 
      this.state.fatigue = Math.max(0, this.state.fatigue - dt * 0.01);
      this._updateBands();
      return;
    }

    this.timeActive += dt;

    // Phase 6: Dynamic Entrainment (Forced Damped Oscillator approx)
    // 1. Calculate Resonance (Lorentzian-like curve)
    // If the target frequency is very far from the current brain frequency, 
    // the entrainment force is weaker (less resonance).
    const deltaF = Math.abs(targetBeatFreq - this.currentEntrainmentFreq);
    // width factor of the resonance curve
    const resonanceWidth = 15.0; 
    const resonanceFactor = 1.0 / (1.0 + Math.pow(deltaF / resonanceWidth, 2));

    // 2. Entrainment Pull
    // How fast the frequency shifts. Depends on adaptation (diminishing returns),
    // perceptual strength (loudness/masking), and resonance.
    const entrainmentRate = 0.05; // Base speed of state change
    const pullForce = entrainmentRate * this.state.adaptation * perceptualStrength * resonanceFactor;
    
    // 3. Apply Inertia
    const freqDiff = targetBeatFreq - this.currentEntrainmentFreq;
    this.currentEntrainmentFreq += freqDiff * pullForce * dt;

    // Update derived bands
    this._updateBands();

    // Adaptation: H(t) = exp(-t / tau)
    this.state.adaptation = Math.exp(-this.timeActive / this.params.habituationTau);

    // Fatigue grows based on the profile's cognitive load
    this.state.fatigue += this.params.fatigueRate * dt * 0.005;

    // Bounds checking
    this.state.fatigue = assertBounds(this.state.fatigue, 0, 1, 'Neural Fatigue');
    this.state.adaptation = assertBounds(this.state.adaptation, 0, 1, 'Neural Adaptation');
  }

  getState() {
    return this.state;
  }
}
