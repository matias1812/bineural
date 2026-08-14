// src/core/auditory.js
// Psychoacoustic Model (Phase 5)
// Transforms physical acoustic stimuli into perceptual neurological inputs.

export class AuditoryStateModel {
  constructor() {
    this.state = {
      baseFrequency: 200,
      physicalVolume: 0,
      ambientVolume: 0,
      
      // Perceptual outputs
      perceivedPhons: 0,
      perceptualStrength: 0, // 0.0 to 1.0 normalized effectiveness
      maskingPenalty: 0
    };
  }

  // Simplified A-weighting curve approx to mimic ISO 226 equal-loudness contours.
  // Human hearing is drastically less sensitive in the low frequencies (100-250 Hz)
  // where binaural carrier tones usually reside.
  _calculateAWeighting(f) {
    const f2 = f * f;
    const f4 = f2 * f2;
    const num = 12194 * 12194 * f4;
    const den = (f2 + 20.6 * 20.6) * Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) * (f2 + 12194 * 12194);
    const ra = num / den;
    // Normalize so that 1000Hz is ~1.0. At 200Hz, weight will be ~0.2 - 0.4.
    const weight = ra * 1.25; 
    return Math.max(0.01, Math.min(1.0, Math.sqrt(weight))); // compressed for game-like usability
  }

  update(dt, physicalParams) {
    const { baseFreq, binauralVolume, ambientVolume } = physicalParams;
    
    this.state.baseFrequency = baseFreq;
    this.state.physicalVolume = binauralVolume;
    this.state.ambientVolume = ambientVolume;

    // 1. Fletcher-Munson / ISO 226 equivalent
    // Perceived loudness drops significantly at lower frequencies.
    const freqWeight = this._calculateAWeighting(baseFreq);
    
    // Perceptual strength base (ignores precise dB conversion for real-time scale normalized 0-1)
    const unmaskedStrength = binauralVolume * freqWeight;

    // 2. Auditory Masking
    // Ambient noise (rain, brown noise) acts as a broadband masker.
    // If ambient volume approaches or exceeds the binaural tone, the pure tone is masked.
    let penalty = 0;
    if (ambientVolume > 0.05) {
      const snr = unmaskedStrength / ambientVolume; 
      // If SNR < 1.5, start applying masking penalty.
      if (snr < 1.5) {
        penalty = 1.0 - (snr / 1.5);
      }
    }
    
    this.state.maskingPenalty = penalty;
    
    // Final perceptual strength delivered to the neurological model.
    // Even under heavy masking, we leave a small residual neurological signal (0.2x).
    this.state.perceptualStrength = Math.max(0, unmaskedStrength * (1.0 - penalty * 0.8));
    
    // Pseudo-phons for UI if needed (just mapping 0-1 to 20-80 range)
    this.state.perceivedPhons = 20 + (this.state.perceptualStrength * 60);
  }
  
  getState() {
    return this.state;
  }
}
