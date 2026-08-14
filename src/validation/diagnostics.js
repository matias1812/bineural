// src/validation/diagnostics.js
// Scientific validation suite for Bineural V2 (Phase 11).
// Run headless:  npm test   (node scripts/run-diagnostics.mjs)
// Run in browser: window.runBineuralDiagnostics() in the console.
// Documentación: docs/validation.md

import { NeuralStateModel } from '../core/neural.js';
import { CognitiveStateModel } from '../core/cognitive.js';
import { EegInterface } from '../core/eeg.js';
import { NeuralToVisualMapper } from '../core/visual.js';
import { evaluateAudioHealth } from '../core/audio-health.js';
import { ExperimentRunner, conditionProfile } from '../core/experiments.js';
import { assertValidState, assertValidNeuralState, assertValidCognitiveState, assertPhysicalFrequency } from './assert.js';
import { getProfileById, PROFILES } from '../models/profiles.js';
import { SimulationConfig, SimulationSeed, buildExperimentRecord, MODEL_VERSION, mulberry32 } from '../core/reproducibility.js';
import { WaveField } from '../wavefield.js';
import { buildSilentWav, ANCHOR_SECONDS } from '../core/media-anchor.js';
import {
  evaluatePermissions,
  notifStateText,
  wakeStateText,
  enabledStateText,
} from '../core/permissions.js';
import { AudioClock } from '../core/audio-clock.js';
import { AppLifecycle } from '../core/lifecycle.js';
import { ExperimentEventLog } from '../core/experiment-events.js';
import { probeCapabilities } from '../core/capabilities.js';
import { AudioTransport } from '../core/audio-transport.js';
import { planRecovery, RECOVERY } from '../core/audio-health.js';
import { AlarmManager, inMemoryAlarmStore, alarmStateOnTick } from '../core/alarm-manager.js';
import { detectNotificationCapabilities, capabilitySummary } from '../core/notification-capabilities.js';
import { createNotificationManager } from '../core/notification-manager.js';

export async function runBineuralDiagnostics() {
  console.group('%c BINEURAL V2 DIAGNOSTICS ', 'background: #222; color: #bada55');
  console.log('Running Scientific Validation Suite...');
  
  let passed = 0;
  let failed = 0;
  const pending = [];

  // Soportar tests síncronos y asíncronos: los asíncronos (p. ej. AlarmManager
  // con IndexedDB/memoria) resuelven después; el resumen espera a todos.
  async function runTest(name, testFn) {
    const p = (async () => {
      try {
        await testFn();
        console.log(`%c[PASS] %c${name}`, 'color: #4ade80', 'color: inherit');
        passed++;
      } catch (err) {
        console.error(`%c[FAIL] %c${name}`, 'color: #f87171', 'color: inherit', err.message);
        failed++;
      }
    })();
    pending.push(p);
    return p;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // NEURAL MODEL TESTS
  // ──────────────────────────────────────────────────────────────────────────

  runTest('NeuralStateModel: Bounds are strictly enforced under high fatigue', () => {
    const model = new NeuralStateModel();
    const profile = getProfileById('concentracion');
    model.setProfile(profile.modelParams);
    model.state.fatigue = 0.99; // Phase 1: state is a NeuralState object
    for (let i = 0; i < 36000; i++) {
      model.update(1.0, true);
    }
    const state = model.getState();
    if (state.fatigue < 0 || state.fatigue > 1) {
      throw new Error(`fatigue out of bounds: ${state.fatigue}`);
    }
    if (state.adaptation < 0 || state.adaptation > 1) {
      throw new Error(`adaptation out of bounds: ${state.adaptation}`);
    }
  });

  runTest('NeuralStateModel: Adaptation converges to near-zero (habituation)', () => {
    const model = new NeuralStateModel();
    const profile = getProfileById('meditacion');
    model.setProfile(profile.modelParams);
    // Entrainment branch (isPlaying=true, target beat=6 Hz) with realistic dt.
    // Adaptation H(t)=exp(-t/tau); tau=300s → need t ≈ 1400s for H < 0.01.
    for (let i = 0; i < 20000; i++) {
      model.update(0.1, true, 1.0, 6);
    }
    const state = model.getState();
    if (state.adaptation > 0.01) {
      throw new Error(`Adaptation failed to converge near zero. Value: ${state.adaptation}`);
    }
  });

  runTest('NeuralStateModel: deterministic under identical params and dt sequence', () => {
    const profile = getProfileById('sueno');
    const a = new NeuralStateModel();
    const b = new NeuralStateModel();
    a.setProfile(profile.modelParams);
    b.setProfile(profile.modelParams);
    for (let i = 0; i < 2000; i++) {
      a.update(0.016, true, 0.9, 2);
      b.update(0.016, true, 0.9, 2);
    }
    const sa = a.getState();
    const sb = b.getState();
    for (const k of ['delta', 'theta', 'alpha', 'beta', 'gamma', 'fatigue', 'adaptation', 'dominantFreq']) {
      if (sa[k] !== sb[k]) {
        throw new Error(`Neural model not deterministic on field ${k}: ${sa[k]} vs ${sb[k]}`);
      }
    }
  });

  runTest('NeuralStateModel: dominantFreq is published and bounded (4–40 Hz)', () => {
    const model = new NeuralStateModel();
    model.setProfile(getProfileById('meditacion').modelParams);
    for (let i = 0; i < 5000; i++) model.update(0.016, true, 1.0, 6);
    const f = model.getState().dominantFreq;
    if (!isFinite(f) || f < 4 || f > 40) {
      throw new Error(`dominantFreq out of plausible range: ${f}`);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // AUDIO / STIMULUS TESTS
  // ──────────────────────────────────────────────────────────────────────────

  runTest('Audio Physics: Carrier and Beat frequencies are strictly positive', () => {
    const profile = getProfileById('sueno');
    assertPhysicalFrequency(profile.stimulus.carrierBase, 'Carrier Base');
    assertPhysicalFrequency(profile.stimulus.beat, 'Beat Frequency');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // WAVEFIELD PHYSICS TESTS (Phase 2)
  // ──────────────────────────────────────────────────────────────────────────

  runTest('WaveField: CFL number is < 1 (numerically stable)', () => {
    const wf = new WaveField(64, { c: 0.4 });
    const { cfl } = wf.getPhysicsMetrics();
    if (cfl >= 1) {
      throw new Error(`CFL = ${cfl.toFixed(4)} ≥ 1. Grid is numerically UNSTABLE.`);
    }
  });

  runTest('WaveField: CFL clamping fires when c > 1/√2', () => {
    // Pass an unsafe c — constructor should clamp it to the stability limit.
    const wf = new WaveField(64, { c: 0.9 });
    if (wf.c !== 1 / Math.SQRT2) {
      throw new Error(`Constructor did not clamp c. Got c=${wf.c}`);
    }
    const { cfl } = wf.getPhysicsMetrics();
    // At the exact boundary cfl == 1 mathematically; allow float precision.
    if (cfl > 1 + 1e-12) {
      throw new Error(`CFL = ${cfl.toFixed(6)} > 1 even after clamping. Bug in constructor.`);
    }
  });

  runTest('WaveField: Energy is zero in a quiescent grid', () => {
    const wf = new WaveField(64, { c: 0.4 });
    wf.setCircle(32, 32, 28);
    const E = wf.computeEnergy();
    if (E !== 0) {
      throw new Error(`Expected E=0 in quiescent grid, got E=${E}`);
    }
  });

  runTest('WaveField: Impulse creates positive energy', () => {
    const wf = new WaveField(64, { c: 0.4 });
    wf.setCircle(32, 32, 28);
    wf.pokeDisc(32, 32, 1.0);
    const E = wf.computeEnergy();
    if (E <= 0) {
      throw new Error(`Expected E > 0 after impulse, got E=${E}`);
    }
  });

  runTest('WaveField: Energy decays monotonically under damping (no sources)', () => {
    const wf = new WaveField(64, { c: 0.4, damp: 0.99 });
    wf.setCircle(32, 32, 28);
    wf.pokeDisc(32, 32, 1.0);

    const samples = [];
    // Run 200 steps and sample energy every 20 steps
    for (let s = 0; s < 200; s++) {
      wf.step();
      if (s % 20 === 0) samples.push(wf.computeEnergy());
    }

    // Energy must be monotonically non-increasing (allow tiny float noise)
    for (let i = 1; i < samples.length; i++) {
      if (samples[i] > samples[i - 1] * 1.02) { // 2% tolerance for numerical noise
        throw new Error(
          `Energy increased from ${samples[i-1].toFixed(6)} to ${samples[i].toFixed(6)} ` +
          `at sample ${i}. Damping is not working correctly.`
        );
      }
    }
  });

  runTest('WaveField: No NaN or Infinity in field after 300 steps', () => {
    const wf = new WaveField(64, { c: 0.4, damp: 0.995 });
    wf.setCircle(32, 32, 28);
    wf.pokeDisc(20, 20, 2.0);
    wf.pokeDisc(44, 44, 1.5);
    for (let s = 0; s < 300; s++) wf.step();
    for (let i = 0; i < wf.n; i++) {
      if (!isFinite(wf.u[i])) {
        throw new Error(`NaN or Infinity found at cell ${i} after 300 steps.`);
      }
    }
  });

  runTest('WaveField: Amplitude stays within clamping limits after strong pulse', () => {
    const AMP_LIMIT = 5.0;
    const wf = new WaveField(64, { c: 0.4, damp: 0.995 });
    wf.setCircle(32, 32, 28);
    wf.pokeDisc(32, 32, 100.0); // Extreme pulse
    for (let s = 0; s < 50; s++) wf.step();
    for (let i = 0; i < wf.n; i++) {
      if (Math.abs(wf.u[i]) > AMP_LIMIT + 1e-6) {
        throw new Error(`Amplitude ${wf.u[i]} exceeds clamp limit at cell ${i}.`);
      }
    }
  });

  runTest('WaveField: Dirichlet BC — boundary cells remain zero', () => {
    const SIZE = 64;
    const wf = new WaveField(SIZE, { c: 0.4, damp: 0.995 });
    wf.setCircle(32, 32, 28);
    wf.pokeDisc(32, 32, 1.0);
    for (let s = 0; s < 100; s++) wf.step();
    // Cells at grid edge (row 0, row N-1, col 0, col N-1) must be 0
    for (let x = 0; x < SIZE; x++) {
      if (wf.u[x] !== 0)           throw new Error(`Top edge cell (${x},0) is non-zero.`);
      if (wf.u[(SIZE - 1) * SIZE + x] !== 0) throw new Error(`Bottom edge cell (${x},N-1) is non-zero.`);
    }
    for (let y = 0; y < SIZE; y++) {
      if (wf.u[y * SIZE] !== 0)          throw new Error(`Left edge cell (0,${y}) is non-zero.`);
      if (wf.u[y * SIZE + SIZE - 1] !== 0) throw new Error(`Right edge cell (N-1,${y}) is non-zero.`);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // AUDIO / STIMULUS DERIVATION (Phase 4)
  // ──────────────────────────────────────────────────────────────────────────

  runTest('Audio Physics: ear frequencies derive correctly (L=carrier, R=carrier+beat, Δf=beat)', () => {
    const cfg = new SimulationConfig({ carrier: 220, beat: 6 });
    const ears = cfg.earFrequencies();
    if (ears.left !== 220) throw new Error(`left ear: ${ears.left} ≠ 220`);
    if (ears.right !== 226) throw new Error(`right ear: ${ears.right} ≠ 226`);
    if (ears.difference !== 6) throw new Error(`Δf: ${ears.difference} ≠ 6`);
  });

  runTest('Audio Physics: all profiles carry physically valid carrier/beat', () => {
    for (const p of PROFILES) {
      assertPhysicalFrequency(p.stimulus.carrierBase, `Profile "${p.id}" carrier`);
      assertPhysicalFrequency(p.stimulus.beat, `Profile "${p.id}" beat`);
      if (p.modelParams) {
        for (const k of ['targetArousal', 'targetAttention', 'targetRelaxation']) {
          const v = p.modelParams[k];
          if (typeof v !== 'number' || v < 0 || v > 1) {
            throw new Error(`Profile "${p.id}" modelParams.${k} out of [0,1]: ${v}`);
          }
        }
        if (!(p.modelParams.habituationTau > 0)) {
          throw new Error(`Profile "${p.id}" habituationTau must be > 0`);
        }
      }
      if (p.visualMetaphor) {
        for (const k of ['complexity', 'coherence', 'velocityScale']) {
          const v = p.visualMetaphor[k];
          if (typeof v !== 'number' || v < 0 || v > 1) {
            throw new Error(`Profile "${p.id}" visualMetaphor.${k} out of [0,1]: ${v}`);
          }
        }
      }
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // REPRODUCIBILITY (Phase 12)
  // ──────────────────────────────────────────────────────────────────────────

  runTest('SimulationConfig: rejects out-of-range parameters', () => {
    let threw = false;
    try { new SimulationConfig({ beat: 0.05 }); } catch { threw = true; }
    if (!threw) throw new Error('beat=0.05 should be rejected');
    threw = false;
    try { new SimulationConfig({ waveform: 'superharsh' }); } catch { threw = true; }
    if (!threw) throw new Error('unknown waveform should be rejected');
  });

  runTest('SimulationConfig: canonical JSON is stable regardless of key order', () => {
    const a = new SimulationConfig({ carrier: 220, beat: 6, waveform: 'triangle' });
    const b = new SimulationConfig({ waveform: 'triangle', beat: 6, carrier: 220 });
    if (JSON.stringify(a.canonical()) !== JSON.stringify(b.canonical())) {
      throw new Error('Canonical configs differ despite identical params');
    }
  });

  runTest('mulberry32: deterministic and well-distributed', () => {
    const r1 = mulberry32(12345);
    const r2 = mulberry32(12345);
    for (let i = 0; i < 1000; i++) {
      const a = r1();
      if (a !== r2()) throw new Error('same seed diverged');
      if (a < 0 || a >= 1) throw new Error('PRNG out of [0,1)');
    }
    const r3 = mulberry32(999);
    if (r1() === r3()) throw new Error('different seeds produced same first draw');
  });

  runTest('Reproducibility: EEG streams identical under the same seed', () => {
    const neural = { delta: 0.3, theta: 0.2, alpha: 0.5, beta: 0.2, gamma: 0.1, fatigue: 0.1, adaptation: 0.9 };
    const a = new EegInterface({ seed: 42 });
    const b = new EegInterface({ seed: 42 });
    for (let i = 0; i < 1000; i++) {
      const sa = a.update(0.016, neural);
      const sb = b.update(0.016, neural);
      for (const k of ['delta', 'theta', 'alpha', 'beta', 'gamma', 'coherence', 'asymmetry']) {
        if (sa[k] !== sb[k]) {
          throw new Error(`EEG diverged on ${k} at step ${i}: ${sa[k]} vs ${sb[k]}`);
        }
      }
    }
  });

  runTest('Reproducibility: EEG streams differ under different seeds', () => {
    const neural = { delta: 0.3, theta: 0.2, alpha: 0.5, beta: 0.2, gamma: 0.1, fatigue: 0.1, adaptation: 0.9 };
    const a = new EegInterface({ seed: 1 });
    const b = new EegInterface({ seed: 2 });
    let differed = false;
    for (let i = 0; i < 500; i++) {
      const sa = a.update(0.016, neural);
      const sb = b.update(0.016, neural);
      if (sa.theta !== sb.theta) { differed = true; break; }
    }
    if (!differed) throw new Error('different seeds produced identical streams');
  });

  runTest('ExperimentRecord: JSON includes modelVersion, seed and canonical config', () => {
    const cfg = new SimulationConfig({ carrier: 220, beat: 6 });
    const seed = new SimulationSeed(12345);
    const rec = buildExperimentRecord({ config: cfg, seed, results: { neural: { alpha: 0.4 } } });
    const json = JSON.parse(JSON.stringify(rec));
    if (json.modelVersion !== MODEL_VERSION) throw new Error('missing modelVersion');
    if (json.seed !== 12345) throw new Error('missing seed');
    if (json.config.carrier !== 220 || json.config.beat !== 6) throw new Error('missing canonical config');
    if (json.results.neural.alpha !== 0.4) throw new Error('missing results');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SYNTHETIC EEG VALIDITY (Phase 7)
  // ──────────────────────────────────────────────────────────────────────────

  runTest('SyntheticEEG: band power stays finite and within [0,1] over 2000 steps', () => {
    const eeg = new EegInterface();
    const neural = { delta: 0.3, theta: 0.2, alpha: 0.5, beta: 0.2, gamma: 0.1, fatigue: 0.3, adaptation: 0.5 };
    for (let i = 0; i < 2000; i++) {
      const s = eeg.update(0.016, neural);
      for (const k of ['delta', 'theta', 'alpha', 'beta', 'gamma', 'coherence']) {
        if (!isFinite(s[k]) || s[k] < 0 || s[k] > 1) {
          throw new Error(`EEG ${k} out of [0,1]: ${s[k]} at step ${i}`);
        }
      }
    }
  });

  runTest('SyntheticEEG: 1/f background produces non-trivial fluctuation (no dead channels)', () => {
    // Seeded for determinism. Zero neural drive: any fluctuation must come
    // from the pink/white noise floor. Measured std ≈ 0.007 with seed 7.
    const eeg = new EegInterface({ seed: 7 });
    const neural = { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0, fatigue: 0, adaptation: 0 };
    const samples = [];
    for (let i = 0; i < 500; i++) {
      samples.push(eeg.update(0.016, neural).alpha);
    }
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    const std = Math.sqrt(samples.reduce((s, v) => s + (v - mean) * (v - mean), 0) / samples.length);
    if (!isFinite(std) || std < 0.004) {
      throw new Error(`Expected pink-noise fluctuation (std ≥ 0.004), got std=${std.toFixed(5)}`);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // COGNITIVE MODEL (Phase 8)
  // ──────────────────────────────────────────────────────────────────────────

  runTest('CognitiveStateModel: values and confidence stay in [0,1]', () => {
    const m = new CognitiveStateModel();
    m.setProfile(getProfileById('concentracion').modelParams);
    const neural = { delta: 0.1, theta: 0.3, alpha: 0.4, beta: 0.8, gamma: 0.3, fatigue: 0.2, adaptation: 0.8, dominantFreq: 16 };
    for (let i = 0; i < 6000; i++) {
      m.update(0.016, true, neural);
      const s = m.getState();
      assertValidCognitiveState(s);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // NEURAL → VISUAL MAPPING (Phase 9)
  // ──────────────────────────────────────────────────────────────────────────

  runTest('VisualMapper: deterministic and provenance-tagged', () => {
    const mapper = new NeuralToVisualMapper();
    const neural = { fatigue: 0.2, theta: 0.4 };
    const cognitive = { arousal: { value: 0.7 }, relaxation: { value: 0.6 } };
    const vm = { complexity: 0.5, velocityScale: 0.6 };
    const a = mapper.map({ neural, cognitive, baseFrequency: 220, visualMetaphor: vm });
    const b = mapper.map({ neural, cognitive, baseFrequency: 220, visualMetaphor: vm });
    if (a.coherence !== b.coherence || a.velocity !== b.velocity || a.complexity !== b.complexity) {
      throw new Error('VisualMapper is not deterministic');
    }
    if (!a.provenance.coherence || a.provenance.coherence.tag !== 'visual metaphor') {
      throw new Error('VisualState missing provenance tags');
    }
    assertValidNeuralState({ fatigue: 0.2, adaptation: 1 });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // AUDIO WATCHDOG (pure decision logic — src/core/audio-health.js)
  // ──────────────────────────────────────────────────────────────────────────

  runTest('AudioWatchdog: contexto suspendido → resume al tercer chequeo', () => {
    let health = 0;
    let action = 'none';
    for (let i = 0; i < 5; i++) {
      const r = evaluateAudioHealth({ isPlaying: true, ctxState: 'suspended', gain: 0.5, rms: 0.4, prevHealth: health });
      health = r.health;
      action = r.action;
      if (action === 'resume') break;
    }
    if (action !== 'resume') throw new Error('No resume tras 5 muestras suspendidas');
    if (health !== 0) throw new Error('health no se resetea tras actuar');
  });

  runTest('AudioWatchdog: señal nula con ganancia → refade al tercer chequeo', () => {
    let health = 0;
    let action = 'none';
    for (let i = 0; i < 5; i++) {
      const r = evaluateAudioHealth({ isPlaying: true, ctxState: 'running', gain: 0.5, rms: 0.001, prevHealth: health });
      health = r.health;
      action = r.action;
      if (action === 'refade') break;
    }
    if (action !== 'refade') throw new Error('No refade tras 5 muestras silenciosas');
  });

  runTest('AudioWatchdog: señal presente → nunca actúa y resetea contador', () => {
    for (let i = 0; i < 10; i++) {
      const r = evaluateAudioHealth({ isPlaying: true, ctxState: 'running', gain: 0.5, rms: 0.2, prevHealth: 2 });
      if (r.action !== 'none' || r.health !== 0) {
        throw new Error('Falsa alarma con señal presente');
      }
    }
  });

  runTest('AudioWatchdog: volumen del usuario a 0 → nunca actúa', () => {
    for (let i = 0; i < 10; i++) {
      const r = evaluateAudioHealth({ isPlaying: true, ctxState: 'running', gain: 0.0001, rms: 0, prevHealth: 2 });
      if (r.action !== 'none' || r.health !== 0) {
        throw new Error('El watchdog no debe pelear con el volumen a 0');
      }
    }
  });

  runTest('AudioWatchdog: sin sesión activa → nunca actúa', () => {
    const r = evaluateAudioHealth({ isPlaying: false, ctxState: 'suspended', gain: 0.5, rms: 0 });
    if (r.action !== 'none' || r.health !== 0) throw new Error('Actuó sin sesión activa');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // EXPERIMENTAL MODE (Phase 10)
  // ──────────────────────────────────────────────────────────────────────────

  runTest('Experiments: determinista bajo la misma semilla y config', () => {
    const cfg = new SimulationConfig({ carrier: 220, beat: 6, condition: 'binaural', durationSec: 300 });
    const a = new ExperimentRunner({ config: cfg, seed: 1234 }).run();
    const b = new ExperimentRunner({ config: cfg, seed: 1234 }).run();
    if (JSON.stringify(a.final) !== JSON.stringify(b.final)) {
      throw new Error('Resultados finales no deterministas bajo la misma semilla');
    }
    if (JSON.stringify(a.psdBands) !== JSON.stringify(b.psdBands)) {
      throw new Error('PSD no determinista bajo la misma semilla');
    }
  });

  runTest('Experiments: binaural entraña hacia Δf; sin estímulo se relaja a línea base', () => {
    const bin = new ExperimentRunner({
      config: new SimulationConfig({ carrier: 220, beat: 6, condition: 'binaural' }),
      seed: 7,
    }).run();
    const none = new ExperimentRunner({
      config: new SimulationConfig({ carrier: 220, beat: 6, condition: 'none' }),
      seed: 7,
    }).run();
    const fBin = bin.final.neural.dominantFreq;
    const fNone = none.final.neural.dominantFreq;
    if (!(Math.abs(fBin - 6) < Math.abs(fNone - 6))) {
      throw new Error(`binaural debería acercar la dominante a 6 Hz (${fBin.toFixed(2)}) más que none (${fNone.toFixed(2)})`);
    }
  });

  runTest('Experiments: PSD válida (finita y no negativa) y bandas integradas', () => {
    const res = new ExperimentRunner({
      config: new SimulationConfig({ carrier: 220, beat: 6, condition: 'binaural' }),
      seed: 42,
    }).run();
    for (const p of res.psd) {
      if (!isFinite(p.power) || p.power < 0) throw new Error('PSD inválida');
    }
    for (const v of Object.values(res.psdBands)) {
      if (!isFinite(v) || v < 0) throw new Error('Band power PSD inválida');
    }
  });

  runTest('Experiments: todas las condiciones producen estados finitos', () => {
    for (const cond of ['binaural', 'pure-tone', 'noise', 'amplitude-modulation', 'none']) {
      const res = new ExperimentRunner({
        config: new SimulationConfig({ carrier: 220, beat: 8, condition: cond }),
        seed: 5,
      }).run({ durationSec: 60 });
      for (const v of Object.values(res.final.neural)) if (!isFinite(v)) throw new Error(`neural NaN en ${cond}`);
      for (const v of Object.values(res.final.eeg)) if (!isFinite(v)) throw new Error(`eeg NaN en ${cond}`);
    }
  });

  runTest('Experiments: exporta registro JSON reproductible', () => {
    const cfg = new SimulationConfig({ carrier: 220, beat: 10, condition: 'noise', durationSec: 60 });
    const runner = new ExperimentRunner({ config: cfg, seed: 99 });
    const results = runner.run({ durationSec: 60 });
    const rec = runner.record(results);
    if (rec.seed !== 99) throw new Error('seed no persistida');
    if (rec.config.condition !== 'noise') throw new Error('config no persistida');
    if (rec.results.psdBands.alpha === undefined) throw new Error('resultados ausentes');
  });

  runTest('Experiments: conditionProfile rechaza condiciones desconocidas', () => {
    let threw = false;
    try {
      conditionProfile('klingon', new SimulationConfig({}));
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Condición desconocida no rechazada');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // MEDIA ANCHOR TESTS (silent WAV used to register Media Session on mobile)
  // ──────────────────────────────────────────────────────────────────────────

  runTest('Media anchor: WAV silencioso con cabecera válida (RIFF/WAVE/fmt/data)', () => {
    const wav = buildSilentWav(1);
    const v = new DataView(wav);
    const str = (off, n) => {
      let s = '';
      for (let i = 0; i < n; i++) s += String.fromCharCode(v.getUint8(off + i));
      return s;
    };
    if (str(0, 4) !== 'RIFF') throw new Error('sin marcador RIFF');
    if (str(8, 4) !== 'WAVE') throw new Error('sin marcador WAVE');
    if (str(12, 4) !== 'fmt ') throw new Error('sin chunk fmt');
    if (str(36, 4) !== 'data') throw new Error('sin chunk data');
    if (v.getUint16(22, true) !== 1) throw new Error('no es mono');
    if (v.getUint32(24, true) !== 8000) throw new Error('sample rate != 8000');
    if (v.getUint16(34, true) !== 16) throw new Error('no es 16-bit');
  });

  runTest('Media anchor: las muestras son silencio real (todo a cero)', () => {
    const wav = buildSilentWav(0.5);
    const v = new DataView(wav);
    for (let i = 44; i < wav.byteLength; i += 2) {
      if (v.getInt16(i, true) !== 0) throw new Error(`muestra no nula en offset ${i}`);
    }
  });

  runTest('Media anchor: la pista por defecto es larga (≥ 6 s) para un reloj de medios estable', () => {
    const wav = buildSilentWav();
    // 44 bytes de cabecera + 2 bytes por muestra a 8000 Hz.
    const seconds = (wav.byteLength - 44) / 2 / 8000;
    if (seconds < 6) throw new Error(`pista demasiado corta: ${seconds.toFixed(2)} s`);
    if (seconds !== ANCHOR_SECONDS) throw new Error(`ANCHOR_SECONDS (${ANCHOR_SECONDS}) no coincide con buildSilentWav()`);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PERMISSIONS TESTS (lógica pura: decisiones reales, no adornos)
  // ──────────────────────────────────────────────────────────────────────────

  runTest('Permisos: sin decidir y activados → se pide el diálogo y se adquiere Wake Lock', () => {
    const d = evaluatePermissions({
      notificationSupported: true,
      notifPermission: 'default',
      wakeLockSupported: true,
      wakeLockHeld: false,
    });
    if (!d.shouldRequestNotifications) throw new Error('debería querer pedir notificaciones');
    if (!d.willPromptNotifications) throw new Error('debería mostrar el diálogo (no iOS)');
    if (!d.shouldAcquireWakeLock) throw new Error('debería adquirir Wake Lock');
  });

  runTest('Permisos: ya concedido → nunca se vuelve a pedir', () => {
    const d = evaluatePermissions({ notificationSupported: true, notifPermission: 'granted' });
    if (d.shouldRequestNotifications) throw new Error('no se debe re-pedir un permiso concedido');
    if (d.willPromptNotifications) throw new Error('no debe mostrar diálogo');
  });

  runTest('Permisos: denegado → no se vuelve a molestar', () => {
    const d = evaluatePermissions({ notificationSupported: true, notifPermission: 'denied' });
    if (d.shouldRequestNotifications) throw new Error('no se debe re-pedir un permiso denegado');
  });

  runTest('Permisos: desactivados manualmente → no se pide nada (gate real)', () => {
    const d = evaluatePermissions({
      disabled: true,
      notificationSupported: true,
      notifPermission: 'default',
      wakeLockSupported: true,
      wakeLockHeld: false,
    });
    if (d.shouldRequestNotifications || d.willPromptNotifications || d.shouldAcquireWakeLock) {
      throw new Error('con permisos desactivados no se debe pedir ni adquirir nada');
    }
  });

  runTest('Permisos: iOS sin PWA instalada → no se llama a un diálogo inexistente', () => {
    const d = evaluatePermissions({
      notificationSupported: true,
      notifPermission: 'default',
      iosNeedsInstall: true,
    });
    if (!d.shouldRequestNotifications) throw new Error('quiere notificaciones...');
    if (d.willPromptNotifications) throw new Error('...pero no debe llamar al diálogo (iOS sin PWA)');
  });

  runTest('Permisos: Wake Lock ya activo → no se re-adquiere', () => {
    const d = evaluatePermissions({ wakeLockSupported: true, wakeLockHeld: true });
    if (d.shouldAcquireWakeLock) throw new Error('Wake Lock ya activo no se re-adquiere');
  });

  runTest('Permisos: sin soporte de Wake Lock → se omite sin error', () => {
    const d = evaluatePermissions({ wakeLockSupported: false, wakeLockHeld: false });
    if (d.shouldAcquireWakeLock) throw new Error('sin soporte no se adquiere');
  });

  runTest('Permisos: textos de estado honestos por plataforma', () => {
    if (notifStateText({ notificationSupported: false }) !== 'No soportado en este navegador') throw new Error('unsupported');
    if (notifStateText({ notificationSupported: true, notifPermission: 'granted' }) !== 'Concedido ✓') throw new Error('granted');
    if (notifStateText({ notificationSupported: true, notifPermission: 'denied' }) !== 'Denegado en el navegador') throw new Error('denied');
    if (notifStateText({ notificationSupported: true, notifPermission: 'default', iosNeedsInstall: true }) !== 'Requiere instalar la app (iOS)') throw new Error('ios');
    if (wakeStateText({ wakeLockSupported: true, wakeLockHeld: true }) !== 'Activo ✓') throw new Error('wake on');
    if (wakeStateText({ wakeLockSupported: false }) !== 'No soportado') throw new Error('wake unsupported');
    if (enabledStateText(true) !== 'Desactivados' || enabledStateText(false) !== 'Activados') throw new Error('enabled toggle');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SYSTEM ROBUSTNESS TESTS (P4/P5/P19/P20/P10)
  // ──────────────────────────────────────────────────────────────────────────

  runTest('AudioClock: la fase del latido deriva del reloj de audio sin drift (20 min)', () => {
    let t = 0;
    const clock = new AudioClock(() => t);
    clock.setEpoch(10); // arranca en t=10 s
    t = 10 + 1000; // 1000 s simuladas
    const phase = clock.beatPhase(6);
    if (phase == null || phase < 0 || phase >= 1) throw new Error(`fase fuera de rango: ${phase}`);
    // La fase esperada se calcula directamente: ((t - epoch) mod period)/period
    const period = 1 / 6;
    const expected = (((t - 10) % period) + period) % period / period;
    if (Math.abs(phase - expected) > 1e-9) throw new Error(`fase incorrecta: ${phase} vs ${expected}`);
    // 20 minutos a 10 Hz: la fase en t=epoch+1200 debe ser ~0 (justo el
    // latido). Tolerancia de punto flotante: 0.1 s no es exacto en binario.
    clock.setEpoch(5);
    t = 5 + 1200;
    const ph = clock.beatPhase(10);
    if (ph == null) throw new Error('sin fase');
    const toBeat = Math.min(ph, 1 - ph);
    if (toBeat > 1e-3) throw new Error(`tras 20 min exactos la fase debe ser 0, fue ${ph}`);
  });

  runTest('AudioClock: nextBeatAt programa el próximo latido sin timers', () => {
    let t = 0;
    const clock = new AudioClock(() => t);
    clock.setEpoch(0);
    t = 0.1;
    const next = clock.nextBeatAt(6); // periodo 1/6 s
    const expected = 0.1 + (1 / 6 - ((0.1 % (1 / 6))));
    if (Math.abs(next - expected) > 1e-9) throw new Error(`nextBeatAt incorrecto: ${next}`);
    if (clock.beatPhase(0) != null) throw new Error('beat 0 → sin fase');
  });

  runTest('AppLifecycle: secuencia real FOREGROUND → BACKGROUND-audio → suspendido → RETURNING → FOREGROUND', () => {
    const lc = new AppLifecycle();
    // Estado inicial tras play: FOREGROUND ('start' solo aplica desde STOPPED).
    if (lc.state !== 'FOREGROUND') throw new Error('estado inicial');
    let r = { ok: true, to: 'FOREGROUND' };
    // Ocultar con audio corriendo (Android con ancla): sigue sonando.
    r = lc.transition('visibility', { visible: false, ctxState: 'running', playing: true });
    if (r.to !== 'AUDIO_RUNNING_BACKGROUND') throw new Error(`esperaba AUDIO_RUNNING_BACKGROUND, ${r.to}`);
    // El SO suspende el contexto estando oculto (iOS):
    r = lc.transition('ctx', { ctxState: 'suspended' });
    if (r.to !== 'AUDIO_SUSPENDED') throw new Error(`esperaba AUDIO_SUSPENDED, ${r.to}`);
    // Volver visible: pasamos por RETURNING y completamos al recuperar running.
    r = lc.transition('visibility', { visible: true, ctxState: 'suspended', playing: true });
    if (r.to !== 'RETURNING') throw new Error(`esperaba RETURNING, ${r.to}`);
    r = lc.transition('resume', { resumeOk: true });
    if (r.to !== 'FOREGROUND') throw new Error(`esperaba FOREGROUND, ${r.to}`);
  });

  runTest('AppLifecycle: transiciones imposibles se rechazan (no se fuerza el estado)', () => {
    const lc = new AppLifecycle();
    // Un evento de contexto en FOREGROUND no es válido: no debe cambiar nada.
    const r = lc.transition('ctx', { ctxState: 'suspended' });
    if (r.ok) throw new Error('ctx en FOREGROUND no es una transición válida');
    if (lc.state !== 'FOREGROUND') throw new Error('el estado no debe cambiar');
    // Ocultar sin reproducir → BACKGROUND; volver → FOREGROUND.
    lc.transition('visibility', { visible: false, ctxState: null, playing: false });
    if (lc.state !== 'BACKGROUND') throw new Error('esperaba BACKGROUND');
    lc.transition('visibility', { visible: true });
    if (lc.state !== 'FOREGROUND') throw new Error('esperaba FOREGROUND');
    // Stop desde cualquier estado → STOPPED; start lo reanima.
    lc.transition('visibility', { visible: false, ctxState: 'running', playing: true });
    lc.transition('stop');
    if (lc.state !== 'STOPPED') throw new Error('esperaba STOPPED');
    if (!lc.transition('start').ok) throw new Error('start desde STOPPED debe ser válido');
    if (lc.state !== 'FOREGROUND') throw new Error('esperaba FOREGROUND tras start');
  });

  runTest('ExperimentEventLog: la integridad refleja las interrupciones reales del SO', () => {
    let wall = 0;
    let audio = 0;
    const log = new ExperimentEventLog({ wallNow: () => wall, audioTime: () => audio });
    log.start({ condition: 'BINAURAL' });
    wall = 10000; audio = 10000; // 10 s sonando
    log.suspend({ reason: 'ctx-suspended' }); // el SO interrumpe
    wall = 12000; // 2 s de interrupción
    log.recover({ reason: 'ctx-running' });
    wall = 20000; audio = 20000; // 8 s más
    const r = log.compute();
    // Exposición 18 s; esperada 20 s → integridad 0.9.
    if (Math.abs(r.integrity - 0.9) > 1e-9) throw new Error(`integridad ${r.integrity}`);
    if (r.interruptions.length !== 1 || r.interruptions[0].durationMs !== 2000) throw new Error('interrupción mal registrada');
    if (r.events.some((e) => !['experimentStarted', 'audioSuspended', 'audioRecovered', 'experimentCompleted'].includes(e.type))) {
      throw new Error('evento inesperado en el registro');
    }
    const txt = log.integrityText();
    if (!/90%/.test(txt) || !/Interrupción/.test(txt)) throw new Error(`texto de integridad: ${txt}`);
  });

  runTest('ExperimentEventLog: la pausa voluntaria no se cuenta como interrupción', () => {
    let wall = 0;
    const log = new ExperimentEventLog({ wallNow: () => wall });
    log.start();
    wall = 5000;
    log.pause({ source: 'lock-screen' }); // pausa voluntaria desde el control del SO
    wall = 20000; // 15 s de pausa voluntaria
    log.resume();
    wall = 25000; // 5 s más
    const r = log.compute();
    if (r.integrity !== 1) throw new Error(`integridad ${r.integrity} (pausa voluntaria no debe bajar la integridad)`);
    if (r.pausedMs !== 15000) throw new Error(`pausedMs ${r.pausedMs}`);
    if (r.interruptions.length !== 0) throw new Error('no hay interrupciones');
  });

  runTest('PlatformCapabilities: cada capacidad se muestra con su función real', () => {
    const caps = probeCapabilities({
      notificationSupported: true,
      notificationPermission: 'granted',
      mediaSessionSupported: true,
      mediaSessionActive: true,
      wakeLockSupported: true,
      wakeLockActive: true,
      pushSupported: true,
      pushConfigured: false,
    });
    if (caps.notifications.label !== 'Concedido ✓') throw new Error('notif label');
    if (caps.mediaSession.label !== 'Controles activos') throw new Error('media session no depende de Notification');
    if (caps.push.label !== 'No configurado — requiere servidor') throw new Error('push honesto sin backend');
    if (!caps.wakeLock.label.toLowerCase().includes('pantalla')) throw new Error('wake lock = pantalla, no garantía de audio');
    const noMs = probeCapabilities({});
    if (noMs.mediaSession.label !== 'No soportado') throw new Error('media session unsupported');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // AUDIO TRANSPORT TESTS (P0.5 — pipeline único)
  // ──────────────────────────────────────────────────────────────────────────

  function fakeCtx() {
    const destination = { connected: false };
    const streamDest = { stream: {} };
    return {
      destination,
      streamDest,
      createGain: () => ({
        targets: [],
        connect(n) { this.targets.push(n); if (n === destination) destination.connected = true; },
        disconnect(n) { this.targets = this.targets.filter((t) => t !== n); },
      }),
      createMediaStreamDestination: () => streamDest,
    };
  }

  function fakeElement() {
    return {
      srcObject: null,
      paused: true,
      currentTime: 0,
      readyState: 0,
      error: null,
      onerror: null,
      attrs: {},
      playCalls: 0,
      pauseCalls: 0,
      setAttribute(k, v) { this.attrs[k] = v; },
      play() { this.paused = false; this.playCalls++; return Promise.resolve(); },
      pause() { this.paused = true; this.pauseCalls++; },
    };
  }

  runTest('AudioTransport: iOS usa salida directa (sin MediaStream a <audio>)', () => {
    const ctx = fakeCtx();
    const t = new AudioTransport({ isIos: true, createElement: fakeElement });
    const mode = t.attach(ctx, { connect: () => {} });
    if (mode !== 'direct') throw new Error(`iOS debería ser direct, fue ${mode}`);
    if (!ctx.destination.connected) throw new Error('debe conectar a ctx.destination');
  });

  runTest('AudioTransport: el audio REAL viaja por un único <audio> (modo element)', () => {
    const ctx = fakeCtx();
    const el = fakeElement();
    const t = new AudioTransport({ isIos: false, createElement: () => el });
    const mode = t.attach(ctx, { connect: () => {} });
    if (mode !== 'element') throw new Error(`esperaba element, fue ${mode}`);
    if (el.srcObject == null) throw new Error('el elemento debe recibir el stream real');
    t.play();
    if (el.paused || el.playCalls !== 1) throw new Error('play() debe arrancar el elemento');
    t.pause();
    if (!el.paused || el.pauseCalls !== 1) throw new Error('pause() debe pausar el elemento');
    // reaffirm: si el SO lo pausó, vuelve a reproducir UNA vez.
    el.paused = true;
    if (!t.reaffirm()) throw new Error('reaffirm debe re-producir el elemento pausado');
    if (t.reaffirm()) throw new Error('reaffirm no debe re-producir un elemento activo');
  });

  runTest('AudioTransport: si el <audio> falla, se degrada UNA vez a salida directa', () => {
    const ctx = fakeCtx();
    const el = fakeElement();
    let fallback = 0;
    const t = new AudioTransport({ isIos: false, createElement: () => el, onFallback: () => fallback++ });
    t.attach(ctx, { connect: () => {} });
    if (t.mode !== 'element') throw new Error('esperaba element');
    el.onerror();
    if (t.mode !== 'direct' || !t.fallbackApplied) throw new Error('fallback a direct no aplicado');
    if (fallback !== 1) throw new Error('onFallback debe llamarse una vez');
    if (!ctx.destination.connected) throw new Error('debe conectar a destination tras el fallback');
    // Segundo error: el transporte anula onerror tras el fallback (no debe
    // volver a intentar); si aún estuviera asignado, tampoco debe re-fallback.
    if (typeof el.onerror === 'function') el.onerror();
    if (fallback !== 1) throw new Error('no debe volver a hacer fallback');
  });

  runTest('PlanRecovery: decide UNA recuperación según el estado real (P0.5.9)', () => {
    const r1 = planRecovery({ wasSuspended: true, ctxState: 'suspended' });
    if (r1.action !== 'recover' || r1.state !== RECOVERY.REQUIRED) throw new Error('suspendido → recover');
    const r2 = planRecovery({ wasSuspended: true, ctxState: 'running' });
    if (r2.action !== 'none' || r2.state !== RECOVERY.SUCCESS) throw new Error('ya corriendo → success');
    const r3 = planRecovery({ wasSuspended: false, transportMode: 'element', elementPaused: true });
    if (r3.action !== 'reaffirm-element' || r3.state !== RECOVERY.RUNNING) throw new Error('elemento pausado → reaffirm');
    const r4 = planRecovery({ wasSuspended: false });
    if (r4.action !== 'none' || r4.state !== RECOVERY.NONE) throw new Error('nada que recuperar');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // NOTIFICATION SYSTEM TESTS (P0 — AlarmManager / NotificationManager)
  // ──────────────────────────────────────────────────────────────────────────

  runTest('AlarmManager: alarmStateOnTick decide wait/fire/miss/skip (estados reales)', async () => {
    const now = 1_000_000;
    if (alarmStateOnTick({ id: 'a', nextAt: now + 1000 }, now) !== 'wait') throw new Error('futuro → wait');
    if (alarmStateOnTick({ id: 'a', nextAt: now - 1000 }, now) !== 'fire') throw new Error('dentro de la gracia → fire');
    if (alarmStateOnTick({ id: 'a', nextAt: now - 10 * 60 * 1000 }, now) !== 'miss') throw new Error('pasó la gracia → miss');
    if (alarmStateOnTick({ id: 'a', nextAt: now - 1000, state: 'CANCELLED' }, now) !== 'skip') throw new Error('cancelada → skip');
    if (alarmStateOnTick({ id: 'a', nextAt: now - 1000, state: 'TRIGGERED' }, now) !== 'skip') throw new Error('disparada → skip');
    if (alarmStateOnTick({ id: 'a' }, now) !== 'skip') throw new Error('sin nextAt → skip');
  });

  runTest('AlarmManager: dispara UNA vez y nunca duplica (one-shot + store durable)', async () => {
    let fired = 0;
    const store = inMemoryAlarmStore();
    const am = new AlarmManager({ store, now: () => 1000, tickMs: 60000, onFire: () => fired++ });
    await am.init();
    await am.create({ id: 'al-1', nextAt: 1000 });
    if (am.list().length !== 1) throw new Error('debe listar la alarma');
    await am.tick();
    if (fired !== 1) throw new Error('debe disparar exactamente una vez');
    if (am.list().length !== 0) throw new Error('one-shot: fuera de la lista');
    const stored = await store.getAll();
    if (stored.length !== 0) throw new Error('one-shot: fuera del store durable');
    await am.tick(); // segundo tick: no debe volver a disparar
    if (fired !== 1) throw new Error('no debe duplicar');
    am.dispose();
  });

  runTest('AlarmManager: cancelada nunca se ejecuta', async () => {
    let fired = 0;
    const am = new AlarmManager({ store: inMemoryAlarmStore(), now: () => 5000, tickMs: 60000, onFire: () => fired++ });
    await am.init();
    const a = await am.create({ id: 'al-x', nextAt: 5000 });
    await am.cancel(a.id);
    if (am.list().length !== 0) throw new Error('cancelada fuera de la lista');
    await am.tick();
    if (fired !== 0) throw new Error('cancelada no debe disparar');
    am.dispose();
  });

  runTest('AlarmManager: alarma vencida se marca MISSED, no se ejecuta tarde', async () => {
    let fired = 0;
    const am = new AlarmManager({
      store: inMemoryAlarmStore(),
      now: () => 1_000_000,
      graceMs: 5 * 60 * 1000,
      onFire: () => fired++,
      onSync: () => {},
    });
    await am.init();
    await am.create({ id: 'al-old', nextAt: 1_000_000 - 30 * 60 * 1000 }); // 30 min atrás
    await am.tick();
    if (fired !== 0) throw new Error('no debe ejecutar una alarma vieja');
    if (!am.lastNotification || am.lastNotification.state !== 'MISSED') throw new Error('debe marcarse MISSED');
    if (am.list().length !== 0) throw new Error('la vencida no queda pendiente');
    am.dispose();
  });

  runTest('AlarmManager: recarga recupera la alarma desde el store durable (Fase 5)', async () => {
    const store = inMemoryAlarmStore();
    const a1 = new AlarmManager({ store, now: () => 1000, tickMs: 60000 });
    await a1.init();
    await a1.create({ id: 'al-reload', nextAt: 999_999_999 });
    const a2 = new AlarmManager({ store, now: () => 2000, tickMs: 60000 });
    await a2.init();
    const list = a2.list();
    if (list.length !== 1 || list[0].id !== 'al-reload') throw new Error('debe restaurarse desde el store');
    a1.dispose();
    a2.dispose();
  });

  runTest('AlarmManager: al arrancar descarta (EXPIRED) lo que venció hace mucho', async () => {
    const store = inMemoryAlarmStore();
    await store.put({ id: 'al-exp', nextAt: 1000 });
    let fired = 0;
    const am = new AlarmManager({ store, now: () => 999_999_999, tickMs: 60000, onFire: () => fired++ });
    await am.init();
    if (am.list().length !== 0) throw new Error('la vencida debe descartarse al arrancar');
    if (fired !== 0) throw new Error('no debe ejecutarse');
    am.dispose();
  });

  runTest('AlarmManager: solo la pestaña PRIMARIA dispara (Web Locks, Fase 15)', async () => {
    // Secundaria: el lock no se concede → no dispara jamás.
    const denied = new AlarmManager({
      store: inMemoryAlarmStore(),
      now: () => 1000,
      tickMs: 60000,
      onFire: () => {
        throw new Error('secundaria no debe disparar');
      },
      locks: { request: (_n, _o, cb) => cb(null) },
    });
    await denied.init();
    await denied.create({ id: 'al-2', nextAt: 1000 });
    await denied.tick();
    if (denied.fires !== 0) throw new Error('secundaria no dispara');
    denied.dispose();
    // Primaria: el lock se concede → dispara una vez.
    let fired = 0;
    const primary = new AlarmManager({
      store: inMemoryAlarmStore(),
      now: () => 1000,
      tickMs: 60000,
      onFire: () => fired++,
      locks: { request: (_n, _o, cb) => cb({}) },
    });
    await primary.init();
    await primary.create({ id: 'al-3', nextAt: 1000 });
    await primary.tick();
    if (fired !== 1) throw new Error('primaria debe disparar');
    primary.dispose();
  });

  runTest('AlarmManager: sin Web Locks, el BroadcastChannel elige UNA primaria', async () => {
    const bus = {
      subs: [],
      // Entrega asíncrona, como BroadcastChannel real (si fuera síncrona, la
      // respuesta llegaría antes de registrar el handler de la segunda pestaña).
      postMessage(msg) {
        queueMicrotask(() => this.subs.forEach((fn) => fn({ data: msg })));
      },
      set onmessage(fn) {
        this.subs.push(fn);
      },
      get onmessage() {
        return null;
      },
    };
    const store = inMemoryAlarmStore();
    let firedA = 0;
    let firedB = 0;
    const amA = new AlarmManager({
      store,
      now: () => 1000,
      tickMs: 60000,
      channel: bus,
      instanceId: '00000000000001aaaa',
      onFire: () => firedA++,
    });
    const amB = new AlarmManager({
      store,
      now: () => 1000,
      tickMs: 60000,
      channel: bus,
      instanceId: '00000000000002bbbb',
      onFire: () => firedB++,
    });
    await amA.init();
    await amB.init();
    if (amA._primary !== true || amB._primary !== false) {
      throw new Error(`elección incorrecta: A=${amA._primary} B=${amB._primary}`);
    }
    await amA.create({ id: 'al-mt', nextAt: 1000 });
    await amA.tick();
    await amB.tick();
    if (firedA !== 1 || firedB !== 0) throw new Error('solo la primaria dispara (sin duplicados)');
    amA.dispose();
    amB.dispose();
  });

  runTest('NotificationManager: el provider SW tiene prioridad; sin SW cae al local', () => {
    let swShown = 0;
    let localShown = 0;
    const nm = createNotificationManager({
      notificationSupported: () => true,
      permissionState: () => 'granted',
      swReady: () => true,
      showSwNotification: () => {
        swShown++;
        return true;
      },
      showLocalNotification: () => {
        localShown++;
        return true;
      },
    });
    const r = nm.notify({ id: 'n1', freq: 220 });
    if (r.provider !== 'serviceWorker' || !r.shown) throw new Error('debe elegir el provider SW');
    if (swShown !== 1 || localShown !== 0) throw new Error('SW primero, local no');
    const nm2 = createNotificationManager({
      notificationSupported: () => true,
      permissionState: () => 'granted',
      swReady: () => false,
      showSwNotification: () => {
        swShown++;
        return true;
      },
      showLocalNotification: () => {
        localShown++;
        return true;
      },
    });
    const r2 = nm2.notify({ id: 'n2', freq: 220 });
    if (r2.provider !== 'local' || !r2.shown) throw new Error('sin SW → local');
    if (localShown !== 1) throw new Error('local debe usarse una vez');
  });

  runTest('NotificationManager: sin permiso no muestra y no finge (denegado → null)', () => {
    const nm = createNotificationManager({
      notificationSupported: () => true,
      permissionState: () => 'denied',
      swReady: () => true,
      showSwNotification: () => true,
      showLocalNotification: () => true,
    });
    const r = nm.notify({ id: 'n3', freq: 220 });
    if (r.provider !== null || r.shown !== false) throw new Error('denegado → no mostrar, no fingir');
  });

  runTest('NotificationManager: Push desactivado y Calendar manual (honestidad, Fase 13)', () => {
    const nm = createNotificationManager({
      notificationSupported: () => true,
      permissionState: () => 'granted',
    });
    const st = nm.status();
    const push = st.providers.find((p) => p.name === 'push');
    const cal = st.providers.find((p) => p.name === 'calendar');
    if (!push || push.enabled !== false || push.configured !== false) throw new Error('Push desactivado sin backend');
    if (!cal || cal.manual !== true) throw new Error('Calendar es manual, nunca automático');
  });

  runTest('NotificationCapabilities: detección honesta (API disponible ≠ garantizado, Fase 12)', () => {
    const caps = detectNotificationCapabilities({});
    if (caps.backgroundScheduling !== 'NOT_GUARANTEED') throw new Error('no existe scheduler persistente sin Push');
    if (caps.calendar !== 'AVAILABLE') throw new Error('calendario disponible como respaldo');
    if (caps.push.configured !== false) throw new Error('push sin backend no está configurado');
    const granted = detectNotificationCapabilities({
      window: { PushManager: {}, mediaSession: {} },
      navigator: { serviceWorker: {} },
      Notification: { permission: 'granted', prototype: { actions: true } },
      pushConfigured: false,
      swRegistered: true,
    });
    if (!granted.notifications.supported || granted.notifications.permission !== 'granted') throw new Error('permiso concedido');
    if (!granted.notifications.actions) throw new Error('acciones soportadas en esta plataforma');
    if (!granted.push.supported || granted.push.configured) throw new Error('push: soportado pero NO configurado');
    if (!granted.mediaSession.supported) throw new Error('media session detectada');
    const rows = capabilitySummary(granted);
    const pushRow = rows.find((r) => r.key === 'push');
    if (!pushRow || !/requiere servidor/i.test(pushRow.status)) throw new Error('fila push honesta');
  });

  runTest('CalendarProvider: el .ics y Google Calendar son eventos reales (Fase 10)', async () => {
    const prev = globalThis.location;
    globalThis.location = { origin: 'https://vyneural.test', pathname: '/' };
    try {
      const { buildIcs, buildGoogleCalendarUrl } = await import('../notifications.js');
      const alarm = { id: 'al-test-1', nextAt: Date.UTC(2026, 7, 14, 10, 0), minutes: 30, freq: 220, beat: 6, time: '10:00' };
      const ics = buildIcs(alarm);
      for (const needle of ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:al-test-1@vyneural.cl', 'DTSTART:', 'DTEND:', 'SUMMARY:']) {
        if (!ics.includes(needle)) throw new Error(`.ics sin ${needle}`);
      }
      const gcal = buildGoogleCalendarUrl(alarm);
      if (!gcal.startsWith('https://calendar.google.com/calendar/render?')) throw new Error('url de Google Calendar');
    } finally {
      globalThis.location = prev;
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ──────────────────────────────────────────────────────────────────────────

  await Promise.all(pending);
  console.log(`\n%cResults: ${passed} Passed, ${failed} Failed`, failed > 0 ? 'color: #f87171' : 'color: #4ade80');
  console.groupEnd();
  
  return { passed, failed };
}
