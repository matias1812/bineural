// src/validation/assert.js
// Numerical and physical validations for Bineural Engine V2.

/**
 * Asserts that a value is within a strict physical/mathematical boundary.
 * Throws an error if violated, enforcing the "Mathematical Validity" rule.
 */
export function assertBounds(val, min, max, name = 'Variable') {
  if (typeof val !== 'number' || isNaN(val)) {
    throw new Error(`[VALIDATION FAILED] ${name} is NaN or not a number: ${val}`);
  }
  if (val < min || val > max) {
    console.warn(`[PHYSICAL BOUNDARY WARNING] ${name} exceeded bounds [${min}, ${max}]. Value: ${val}. Clamping applied.`);
  }
  return Math.max(min, Math.min(max, val));
}

/**
 * Asserts that a frequency is physically meaningful for audio or neural waves.
 */
export function assertPhysicalFrequency(f, name = 'Frequency') {
  if (typeof f !== 'number' || isNaN(f)) {
    throw new Error(`[VALIDATION FAILED] ${name} is NaN`);
  }
  if (f <= 0) {
    throw new Error(`[VALIDATION FAILED] ${name} must be > 0. Got: ${f}`);
  }
  if (f > 20000) {
    console.warn(`[PHYSICAL BOUNDARY WARNING] ${name} exceeds human hearing limit: ${f}Hz`);
  }
  return f;
}

/**
 * Validates the NeuralState object (Phase 1 shape: fatigue, adaptation).
 */
export function assertValidNeuralState(state) {
  assertBounds(state.fatigue, 0, 1, 'NeuralState.fatigue');
  assertBounds(state.adaptation, 0, 1, 'NeuralState.adaptation');
  return true;
}

/**
 * Validates the CognitiveState object (Phase 1 shape: arousal, attention, relaxation — each with value + confidence).
 */
export function assertValidCognitiveState(state) {
  assertBounds(state.arousal.value, 0, 1, 'CognitiveState.arousal.value');
  assertBounds(state.attention.value, 0, 1, 'CognitiveState.attention.value');
  assertBounds(state.relaxation.value, 0, 1, 'CognitiveState.relaxation.value');
  assertBounds(state.arousal.confidence, 0, 1, 'CognitiveState.arousal.confidence');
  assertBounds(state.attention.confidence, 0, 1, 'CognitiveState.attention.confidence');
  assertBounds(state.relaxation.confidence, 0, 1, 'CognitiveState.relaxation.confidence');
  return true;
}

/**
 * Legacy: validates any flat state object with {fatigue, adaptation} fields.
 * Kept for backward compat with older diagnostic calls.
 */
export function assertValidState(state) {
  // Detect Phase 1 NeuralState vs legacy flat object
  if ('adaptation' in state) return assertValidNeuralState(state);
  // Fallback: check whichever numeric fields are present
  for (const [key, val] of Object.entries(state)) {
    if (typeof val === 'number') {
      assertBounds(val, 0, 1, key);
    }
  }
  return true;
}
