// src/core/experiments.js
// Phase 10: Experimental Mode
//
// Runs the reduced scientific pipeline HEADLESSLY (no AudioContext, no DOM)
// for a chosen stimulus condition and returns a reproducible comparison:
//   stimulus (PHYSICAL) · band powers (NEURAL/SIMULATED) · PSD (DERIVED) ·
//   cognitive state (ESTIMATED) · visual metaphor (VISUAL/HEURISTIC).
//
// Every run is reproducible: same (SimulationConfig, SimulationSeed) → same
// results (verified by the validation suite). Results export as experiment
// JSON records via buildExperimentRecord().
//
// CONDITIONS (how each drives the reduced model — HEURISTIC mapping):
//   binaural             → full entrainment at Δf
//   pure-tone            → stimulus present, no rhythm → no entrainment
//   noise                → stimulus present, no rhythm → no entrainment
//   amplitude-modulation → envelope modulates at Δf → weaker entrainment
//   none                 → no stimulus (control) → relax to baseline
//
// Honesty note: a pure tone or noise does NOT entrain a specific frequency in
// this reduced model; only rhythmic stimuli (binaural/AM) pull the dominant
// frequency. The UI presents each condition with its provenance label.

import { NeuralStateModel } from './neural.js';
import { EegInterface } from './eeg.js';
import { CognitiveStateModel } from './cognitive.js';
import { NeuralToVisualMapper } from './visual.js';
import {
  SimulationConfig,
  SimulationSeed,
  buildExperimentRecord,
  mulberry32,
  MODEL_VERSION,
  CONDITIONS,
} from './reproducibility.js';

export const CONDITION_LABELS = {
  binaural: 'Latido binaural',
  'pure-tone': 'Tono puro',
  noise: 'Ruido',
  'amplitude-modulation': 'Modulación de amplitud',
  none: 'Sin estímulo (control)',
};

export const DEFAULT_MODEL_PARAMS = {
  targetArousal: 0.5,
  targetAttention: 0.5,
  targetRelaxation: 0.5,
  fatigueRate: 0.08,
  habituationTau: 300,
};

/**
 * HEURISTIC: maps a condition to the reduced-model drive.
 * @returns {{ beat: number, strength: number, isPlaying: boolean }}
 */
export function conditionProfile(condition, config) {
  if (!CONDITIONS.includes(condition)) {
    throw new Error(`[Experiments] Unknown condition "${condition}"`);
  }
  switch (condition) {
    case 'binaural':
      return { beat: config.beat, strength: 0.9, isPlaying: true };
    case 'amplitude-modulation':
      return { beat: config.beat, strength: 0.5, isPlaying: true };
    case 'pure-tone':
      return { beat: 0, strength: 0.6, isPlaying: true };
    case 'noise':
      return { beat: 0, strength: 0.25, isPlaying: true };
    case 'none':
      return { beat: 0, strength: 0, isPlaying: false };
    default:
      throw new Error(`[Experiments] Unhandled condition "${condition}"`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// FFT (radix-2, iterative) + PSD helpers — pure math, testable headless.
// ────────────────────────────────────────────────────────────────────────────

export function fft(re, im) {
  const n = re.length;
  if (n < 2 || (n & (n - 1)) !== 0) {
    throw new Error('[Experiments] FFT requires a power-of-two length');
  }
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nxtRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nxtRe;
      }
    }
  }
}

/**
 * Synthesizes a short time-domain EEG trace from final band powers
 * (Phase 7: SyntheticEEG time-domain signal). Deterministic under seed.
 * SIMULATED — the trace is a reconstruction, not a recording.
 */
export function synthesizeTrace(eeg, { seed = 1, sampleRate = 128, samples = 2048 } = {}) {
  const rng = mulberry32(seed);
  const t0 = rng() * Math.PI * 2;
  const centers = { delta: 2, theta: 6, alpha: 10, beta: 20, gamma: 40 };
  const trace = new Float64Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    let v = (rng() - 0.5) * 0.03; // white-noise floor
    for (const band of Object.keys(centers)) {
      const amp = eeg[band] ?? 0;
      if (amp > 0.001) {
        v += amp * 0.5 * Math.sin(2 * Math.PI * centers[band] * t + t0 * (1 + Math.abs(Math.sin(centers[band]))));
      }
    }
    trace[i] = v;
  }
  return trace;
}

/** One-sided power spectrum [{ freq, power }] from a real trace (Hz). */
export function computePsd(trace, sampleRate = 128) {
  const n = trace.length;
  const re = new Float64Array(trace);
  const im = new Float64Array(n);
  fft(re, im);
  const out = [];
  for (let i = 0; i <= n / 2; i++) {
    out.push({ freq: (i * sampleRate) / n, power: (re[i] * re[i] + im[i] * im[i]) / n });
  }
  return out;
}

export const BAND_RANGES = [
  ['delta', 0.5, 4],
  ['theta', 4, 8],
  ['alpha', 8, 13],
  ['beta', 13, 30],
  ['gamma', 30, 50],
];

/** Integrates PSD power over the standard EEG bands (DERIVED). */
export function bandPowerFromPsd(psd, ranges = BAND_RANGES) {
  const out = {};
  for (const [name, lo, hi] of ranges) {
    let sum = 0;
    for (const p of psd) if (p.freq >= lo && p.freq < hi) sum += p.power;
    out[name] = sum;
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// ExperimentRunner
// ────────────────────────────────────────────────────────────────────────────

export class ExperimentRunner {
  /**
   * @param {object} o
   * @param {SimulationConfig|object} o.config
   * @param {SimulationSeed|number|null} [o.seed]
   */
  constructor({ config, seed = null }) {
    this.config = config instanceof SimulationConfig ? config : new SimulationConfig(config);
    this.seed = seed instanceof SimulationSeed ? seed : new SimulationSeed(seed ?? undefined);
    this.neural = new NeuralStateModel();
    this.eeg = new EegInterface({ seed: this.seed.seed });
    this.cognitive = new CognitiveStateModel();
    this.visualMapper = new NeuralToVisualMapper();
  }

  /**
   * Runs the reduced pipeline headlessly and returns a plain comparison object.
   * @param {object} [o]
   * @param {number} [o.durationSec=300]
   * @param {number} [o.dt=0.1] simulation step (seconds)
   */
  run({ durationSec = 300, dt = 0.1 } = {}) {
    const { beat, strength, isPlaying } = conditionProfile(this.config.condition, this.config);
    const params = this.config.modelParams || DEFAULT_MODEL_PARAMS;
    this.neural.setProfile(params);
    this.cognitive.setProfile(params);

    const steps = Math.max(10, Math.round(durationSec / dt));
    const series = {
      bands: { delta: [], theta: [], alpha: [], beta: [], gamma: [] },
      cognitive: { arousal: [], attention: [], relaxation: [], flow: [] },
      dominantFreq: [],
    };
    let final = null;

    for (let i = 0; i < steps; i++) {
      this.neural.update(dt, isPlaying, strength, beat);
      const ns = this.neural.getState();
      const es = this.eeg.update(dt, ns);
      this.cognitive.update(dt, isPlaying, ns);
      const cs = this.cognitive.getState();

      if (i % 10 === 0 || i === steps - 1) {
        series.bands.delta.push(ns.delta);
        series.bands.theta.push(ns.theta);
        series.bands.alpha.push(ns.alpha);
        series.bands.beta.push(ns.beta);
        series.bands.gamma.push(ns.gamma);
        series.cognitive.arousal.push(cs.arousal.value);
        series.cognitive.attention.push(cs.attention.value);
        series.cognitive.relaxation.push(cs.relaxation.value);
        series.cognitive.flow.push(cs.flow.value);
        series.dominantFreq.push(ns.dominantFreq);
      }
      final = { neural: ns, eeg: es, cognitive: cs };
    }

    const trace = synthesizeTrace(final.eeg, { seed: this.seed.seed });
    const psd = computePsd(trace, 128);
    const psdBands = bandPowerFromPsd(psd);
    const visual = this.visualMapper.map({
      neural: final.neural,
      cognitive: final.cognitive,
      baseFrequency: this.config.carrier,
    });

    return {
      modelVersion: MODEL_VERSION,
      condition: this.config.condition,
      conditionLabel: CONDITION_LABELS[this.config.condition],
      seed: this.seed.seed,
      durationSec,
      stimulus: this.config.earFrequencies(),
      final: {
        neural: {
          delta: final.neural.delta,
          theta: final.neural.theta,
          alpha: final.neural.alpha,
          beta: final.neural.beta,
          gamma: final.neural.gamma,
          dominantFreq: final.neural.dominantFreq,
          fatigue: final.neural.fatigue,
          adaptation: final.neural.adaptation,
        },
        eeg: {
          delta: final.eeg.delta,
          theta: final.eeg.theta,
          alpha: final.eeg.alpha,
          beta: final.eeg.beta,
          gamma: final.eeg.gamma,
          coherence: final.eeg.coherence,
          asymmetry: final.eeg.asymmetry,
        },
        cognitive: {
          arousal: { value: final.cognitive.arousal.value, confidence: final.cognitive.arousal.confidence },
          attention: { value: final.cognitive.attention.value, confidence: final.cognitive.attention.confidence },
          relaxation: { value: final.cognitive.relaxation.value, confidence: final.cognitive.relaxation.confidence },
          flow: { value: final.cognitive.flow.value, confidence: final.cognitive.flow.confidence },
        },
        visual: {
          coherence: visual.coherence,
          complexity: visual.complexity,
          velocity: visual.velocity,
          provenance: visual.provenance,
        },
      },
      psdBands,
      psd,
      series,
    };
  }

  /** Wraps the results in a reproducible experiment record (JSON-ready). */
  record(results) {
    return buildExperimentRecord({ config: this.config, seed: this.seed, results });
  }
}
