// src/core/states.js
// Phase 1: Strict Domain Separation
// These classes define pure data structures for each domain to ensure 
// no cross-contamination of variables (e.g., visual parameters directly 
// mapped from cognitive state without an explicit transformation step).

export class StimulusState {
  constructor() {
    this.carrierFrequency = 0; // Hz
    this.beatFrequency = 0;    // Hz
    this.leftFrequency = 0;    // Hz
    this.rightFrequency = 0;   // Hz
    this.amplitude = 0;        // [0, 1]
    this.waveform = 'sine';
    this.phase = 0;
  }
}

export class PhysicalState {
  constructor() {
    this.baseFrequency = 0;    // Derived from stimulus
    this.dominantMode = null;  // { m, n, omega, detuning } computed by Cymatics
    this.energy = 0;           // Simulated energy level
  }
}

export class NeuralState {
  constructor() {
    // Pure neurophysiological variables (reduced order)
    this.delta = 0;
    this.theta = 0;
    this.alpha = 0;
    this.beta = 0;
    this.gamma = 0;
    this.aperiodic1f = 0;
    this.fatigue = 0;          // Metabolic/synaptic fatigue [0,1]
    this.adaptation = 1.0;     // Habituation to stimulus [0,1] (1 = no habituation)
    this.dominantFreq = 12.0;  // Current dominant neural oscillation frequency (Hz)
  }
}

export class EEGState {
  constructor() {
    // Simulated measurement
    this.delta = 0;
    this.theta = 0;
    this.alpha = 0;
    this.beta = 0;
    this.gamma = 0;
    this.coherence = 0;
    this.asymmetry = 0;
    this.isSimulated = true;
  }
}

export class CognitiveState {
  constructor() {
    // Psychological/Phenomenological variables with confidence intervals
    this.arousal     = { value: 0.5, confidence: 0 };
    this.attention   = { value: 0.5, confidence: 0 };
    this.relaxation  = { value: 0.5, confidence: 0 };
    this.engagement  = { value: 0.5, confidence: 0 };
    // Phase 9: Flow state — emergent attractor (not a target).
    // Defined as: high attention + moderate arousal + moderate relaxation.
    // Validated by Csikszentmihalyi (1990) and supported by frontal-midline Theta
    // elevation in EEG studies (Tozman et al., 2015).
    this.flow        = { value: 0.0, confidence: 0 };
    // Phase 9: Current dominant entrainment frequency fed from NeuralStateModel.
    // Provides cognitive model awareness of where the brain actually IS in band space,
    // not just where the stimulus points.
    this.dominantFreq = 12.0; // Hz (baseline)
  }
}

export class VisualState {
  constructor() {
    // Visualization metaphors
    this.coherence = 0;        // VISUAL metaphor ← relaxation/alpha
    this.complexity = 0;       // VISUAL metaphor ← fatigue/frequency
    this.velocity = 0;         // VISUAL metaphor ← arousal/beta
    this.baseFrequency = 220;  // PHYSICAL: stimulus carrier rep
    // Fase 17: per-field provenance map { field → { class, tag, basis, origin } }
    this.provenance = {};
  }
}
