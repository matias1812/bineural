// src/core/cognitive.js
// Cognitive State Model — Phase 9: Continuous State Variables with Feedback
//
// Maps the Neural Entrainment State (Phase 6) to phenomenological psychological
// variables (arousal, attention, relaxation, flow) using:
//   1. Yerkes-Dodson constraint: arousal and relaxation are anticorrelated via
//      a soft mutual inhibition term (high arousal suppresses relaxation and vice versa).
//   2. EEG band-derived updates: arousal tracks beta/gamma power; relaxation
//      tracks alpha; attention tracks theta+alpha cross-band coherence.
//   3. Flow as an emergent attractor (NOT a controllable target):
//      Flow = high attention × moderate arousal × moderate relaxation.
//      This emerges only when the brain has been in the Theta/Alpha border for
//      sustained time without high fatigue.
//   4. Confidence intervals: grow with stimulus duration and decay with masking/fatigue.
//
// Scientific disclaimer:
//   These equations are simplified dynamical models inspired by the psychophysiology
//   literature. They are NOT validated biomarkers and should not be interpreted as
//   direct measurements of any individual's cognitive state.

import { CognitiveState } from './states.js';
import { assertBounds } from '../validation/assert.js';

export class CognitiveStateModel {
  constructor() {
    this.state = new CognitiveState();
    this.params = null;
    // Phase 9: Time-on-task (for flow emergence: requires sustained effort)
    this._timeOnTask = 0;
  }

  setProfile(profileParams) {
    this.params = profileParams;
    this._timeOnTask = 0;
    // Reset confidence on profile change (new stimulus = new uncertainty)
    this.state.arousal.confidence    = 0;
    this.state.attention.confidence  = 0;
    this.state.relaxation.confidence = 0;
    this.state.flow.confidence       = 0;
  }

  update(dt, isPlaying, neuralState) {
    if (!this.params) return;

    if (!isPlaying) {
      // Relax all variables towards baseline slowly
      const relaxRate = dt * 0.04;
      this.state.arousal.value    += (0.5 - this.state.arousal.value)    * relaxRate;
      this.state.attention.value  += (0.5 - this.state.attention.value)  * relaxRate;
      this.state.relaxation.value += (0.5 - this.state.relaxation.value) * relaxRate;
      this.state.flow.value       += (0.0 - this.state.flow.value)       * relaxRate;
      // Confidence decays when not playing
      this.state.arousal.confidence    *= (1 - dt * 0.03);
      this.state.attention.confidence  *= (1 - dt * 0.03);
      this.state.relaxation.confidence *= (1 - dt * 0.03);
      this.state.flow.confidence       *= (1 - dt * 0.03);
      this._timeOnTask = Math.max(0, this._timeOnTask - dt * 0.5);
      return;
    }

    this._timeOnTask += dt;

    // ── 1. Extract neural signals ───────────────────────────────────────────
    const adapt  = neuralState.adaptation;   // [0,1] habituation factor
    const fatigue = neuralState.fatigue;     // [0,1] metabolic cost
    // Band powers from the Phase 6 Gaussian mapping
    const delta = neuralState.delta ?? 0;
    const theta = neuralState.theta ?? 0;
    const alpha = neuralState.alpha ?? 0;
    const beta  = neuralState.beta  ?? 0;
    const gamma = neuralState.gamma ?? 0;
    // Current dominant frequency from entrainment model (published by
    // NeuralStateModel on the state object itself — no back-reference needed).
    const f = neuralState.dominantFreq ?? 10;
    this.state.dominantFreq = f;

    // Effective stimulus: habituated signal modulated by perceptual input
    const E = adapt * (1 - fatigue * 0.6);

    // ── 2. EEG-derived targets for this frame ───────────────────────────────
    // These are the instantaneous "pulls" derived from the actual neural band
    // state. They are NOT the profile targets — they are dynamically computed.
    //
    // Arousal target: driven by high-frequency activation (beta + gamma).
    // Scales with profile target but gated by actual band power.
    const tArousal = this.params.targetArousal * (0.3 + 0.7 * (beta + gamma * 0.5));

    // Relaxation target: driven by alpha power (idling rhythm).
    // Anticorrelated with arousal via Yerkes-Dodson: relaxation is suppressed
    // when beta/gamma are elevated (and vice versa).
    const alphaRelax  = alpha * 1.3;
    const betaPenalty = (beta + gamma) * 0.5; // high beta suppresses relaxation
    const tRelaxation = Math.max(0, this.params.targetRelaxation * alphaRelax - betaPenalty);

    // Attention target: driven by frontal theta + alpha coactivation.
    // (Theta-alpha border 6-10 Hz is associated with focused attention and
    // working memory — Klimesch et al., 1999; Bastiaansen & Hagoort, 2003)
    const tAttention = this.params.targetAttention * (0.4 + 0.6 * (theta * 0.6 + alpha * 0.4));

    // ── 3. Coupling constants ───────────────────────────────────────────────
    // Base coupling is slower than the old linear model (~minutes to full target).
    // Multiplied by the effective stimulus so masking/habituation slows it down.
    const kBase  = 0.025 * E;
    const kArous = kBase * 1.1;
    const kAttn  = kBase * 0.9;
    const kRelax = kBase * 0.8;

    // ── 4. Mutual inhibition (Yerkes-Dodson soft constraint) ─────────────
    // High arousal suppresses relaxation (and vice versa).
    // This prevents the physically nonsensical state: arousal=1 AND relaxation=1.
    const arousalNow   = this.state.arousal.value;
    const relaxNow     = this.state.relaxation.value;
    const inhibition   = 0.08; // strength of mutual suppression
    const arousInhibit = arousalNow  * inhibition; // arousal suppresses relaxation
    const relaxInhibit = relaxNow    * inhibition; // relaxation suppresses arousal

    // ── 5. Differential updates ─────────────────────────────────────────────
    let dArousal    = (tArousal    - arousalNow)  * kArous * dt;
    let dAttention  = (tAttention  - this.state.attention.value) * kAttn  * dt;
    let dRelaxation = (tRelaxation - relaxNow)    * kRelax * dt;

    // Apply fatigue penalties (high cognitive load degrades attention first).
    // Proportional to the current level (decay rate, not constant drain):
    // a constant drain can exceed the coupling pull and clamp the variable to
    // exactly zero forever, emitting a boundary warning on every frame.
    dArousal    -= fatigue * arousalNow * dt * 0.06;
    dAttention  -= fatigue * this.state.attention.value * dt * 0.09;

    // Apply mutual inhibition
    dArousal    -= arousInhibit * relaxNow * dt * 0.3;
    dRelaxation -= relaxInhibit * arousalNow * dt * 0.3;

    this.state.arousal.value    = assertBounds(this.state.arousal.value    + dArousal,    0, 1, 'Cognitive Arousal');
    this.state.attention.value  = assertBounds(this.state.attention.value  + dAttention,  0, 1, 'Cognitive Attention');
    this.state.relaxation.value = assertBounds(this.state.relaxation.value + dRelaxation, 0, 1, 'Cognitive Relaxation');

    // ── 6. Flow: emergent attractor (not a target) ──────────────────────────
    // Flow requires simultaneously: high attention, moderate arousal (0.3-0.7),
    // moderate relaxation (0.3-0.7), low fatigue, sustained time on task (>60s).
    //
    // Formula: flow = attention × bell(arousal) × bell(relaxation) × timeBonus
    //   where bell(x) = exp(-((x - 0.5) / 0.25)²) peaks at x=0.5.
    const bell = (x) => Math.exp(-Math.pow((x - 0.5) / 0.25, 2));
    const timeBonus = Math.min(1.0, this._timeOnTask / 120); // full after 2 min
    const flowPotential =
      this.state.attention.value *
      bell(this.state.arousal.value) *
      bell(this.state.relaxation.value) *
      (1 - fatigue * 0.8) *
      timeBonus;

    // Flow is a slow state: it takes time to enter and time to leave.
    // Use a slow EMA (τ ≈ 30s) so it doesn't flicker.
    const kFlow = 1 - Math.exp(-dt / 30);
    this.state.flow.value = assertBounds(
      this.state.flow.value + (flowPotential - this.state.flow.value) * kFlow,
      0, 1, 'Cognitive Flow'
    );

    // ── 7. Confidence intervals ─────────────────────────────────────────────
    // Confidence grows with sustained exposure to an effective stimulus.
    // Decays with high masking (E low) or high fatigue.
    const confRate = dt * 0.015 * E;
    this.state.arousal.confidence    = Math.min(1.0, this.state.arousal.confidence    + confRate);
    this.state.attention.confidence  = Math.min(1.0, this.state.attention.confidence  + confRate * 0.8);
    this.state.relaxation.confidence = Math.min(1.0, this.state.relaxation.confidence + confRate * 0.8);
    this.state.flow.confidence       = Math.min(1.0, this.state.flow.confidence       + confRate * 0.3);
  }

  getState() {
    return this.state;
  }
}
