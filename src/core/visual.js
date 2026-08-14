// src/core/visual.js
// Phase 9: Explicit Neural → Visual Mapping
//
// PURPOSE: the only place where neural/cognitive state becomes visual state.
// No renderer reads neural variables directly; renderers consume a VisualState
// produced here. Every mapping is declared a VISUAL METAPHOR (Fase 9) unless a
// specific experimental basis exists — we never claim visual coherence ==
// neural coherence.
//
// Metaphor table (all VISUAL class):
//   relaxation (alpha proxy) → spatial coherence of the pattern
//   arousal                  → motion energy (phase rotation velocity)
//   fatigue                  → temporal instability (complexity noise)
//   theta power              → slow temporal modulation (slowest component)
//   carrier frequency        → spatial scale of the pattern
//
// Provenance vocabulary (Fase 17): MEASURED | SIMULATED | DERIVED |
// ESTIMATED | HEURISTIC. Visual fields are HEURISTIC metaphors by design.

import { VisualState } from './states.js';

export const VISUAL_CLASS = 'VISUAL';
export const METAPHOR_TAG = 'visual metaphor';

const clamp01 = (x) => Math.max(0, Math.min(1, x));

export class NeuralToVisualMapper {
  constructor() {
    // HEURISTIC: response curve shapes. Tuned for perceptual readability, not
    // validated against psychophysics.
    this._curve = { slow: 0.15, fast: 0.55 }; // not used directly, documented intent
  }

  /**
   * Map neural + cognitive state into a VisualState.
   * Pure and deterministic: same inputs → same VisualState (Phase 12 friendly).
   *
   * @param {object} inputs
   * @param {object} inputs.neural       NeuralState (from NeuralStateModel)
   * @param {object} inputs.cognitive    CognitiveState (from CognitiveStateModel)
   * @param {number} inputs.baseFrequency Carrier frequency (Hz) of the stimulus
   * @param {object} [inputs.visualMetaphor] Profile visual baseline
   *        { complexity, coherence, velocityScale } — HEURISTIC constants
   */
  map({ neural, cognitive, baseFrequency = 220, visualMetaphor = {} }) {
    const v = new VisualState();
    const vm = visualMetaphor;

    // ── Spatial coherence ← relaxation (alpha proxy) ─────────────────────────
    // METAPHOR: "more relaxed → more coherent pattern". No claim that visual
    // coherence equals neural coherence.
    const relax = cognitive?.relaxation?.value ?? 0.5;
    v.coherence = clamp01(0.3 + 0.7 * relax);

    // ── Motion energy ← arousal ──────────────────────────────────────────────
    // METAPHOR: "more aroused → faster phase rotation".
    const arousal = cognitive?.arousal?.value ?? 0.5;
    const velScale = typeof vm.velocityScale === 'number' ? vm.velocityScale : 0.5;
    v.velocity = clamp01(0.2 * (1 - velScale) + velScale * (0.2 + 0.8 * arousal));

    // ── Temporal instability ← fatigue + theta slow modulation ───────────────
    // METAPHOR: "fatigue adds irregularity; theta power adds slow drift".
    const fatigue = neural?.fatigue ?? 0;
    const theta = neural?.theta ?? 0;
    const baseComplexity = typeof vm.complexity === 'number' ? vm.complexity : 0.5;
    v.complexity = clamp01(baseComplexity + fatigue * 0.2 + theta * 0.15);

    // ── Spatial scale ← carrier frequency ────────────────────────────────────
    v.baseFrequency = baseFrequency || 220;

    // ── Provenance (Fase 17: honesty labels) ────────────────────────────────
    v.provenance = {
      coherence: { class: VISUAL_CLASS, tag: METAPHOR_TAG, basis: 'relaxation (alpha proxy)', origin: 'ESTIMATED' },
      velocity:  { class: VISUAL_CLASS, tag: METAPHOR_TAG, basis: 'arousal', origin: 'ESTIMATED' },
      complexity:{ class: VISUAL_CLASS, tag: METAPHOR_TAG, basis: 'fatigue + theta power', origin: 'ESTIMATED' },
      baseFrequency: { class: 'PHYSICAL', tag: 'stimulus carrier', origin: 'DERIVED' },
    };
    return v;
  }
}
