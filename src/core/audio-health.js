// src/core/audio-health.js
// Pure decision logic for the audio watchdog.
//
// Kept DOM/Audio-free on purpose so the scientific suite (npm test) can
// validate it headless. SimulationEngine.loop() samples the live audio state
// every ~0.5 s, feeds it to evaluateAudioHealth(), and applies the returned
// action (resume / refade / none).
//
// Why it exists: on mobile the OS can suspend the AudioContext without firing
// visibilitychange (iOS locks the screen, Android loses audio focus, some
// devices suspend on fullscreen enter/exit). Without a watchdog the UI stays
// "en play" while the session is silent.

export const HEALTH_THRESHOLD = 3; // consecutive bad samples before acting

/**
 * @param {object} s
 * @param {boolean} s.isPlaying    Is the session supposed to be playing?
 * @param {string|null} s.ctxState 'running' | 'suspended' | null
 * @param {number} s.gain          Master gain value (0..1)
 * @param {number|null} s.rms      Analyser RMS (0..1), null if not available
 * @param {number} [s.prevHealth]  Accumulated bad samples from previous call
 * @returns {{ action: 'resume'|'refade'|'none', health: number }}
 */
export function evaluateAudioHealth({ isPlaying, ctxState, gain, rms, prevHealth = 0 }) {
  // Not playing or no context yet → nothing to do.
  if (!isPlaying || ctxState == null) return { action: 'none', health: 0 };

  let health = prevHealth;

  // Context suspended by the OS → count consecutive samples, then resume.
  if (ctxState === 'suspended') {
    health += 1;
    if (health >= HEALTH_THRESHOLD) return { action: 'resume', health: 0 };
    return { action: 'none', health };
  }

  // Context running: only flag silence when the gain is not user-muted.
  // A muted session (gain at the 0.0001 floor or below 0.02) is intentional —
  // the watchdog must never fight the user's volume slider.
  if (gain > 0.02) {
    if (rms !== null && rms < 0.003) {
      health += 1;
      if (health >= HEALTH_THRESHOLD) return { action: 'refade', health: 0 };
      return { action: 'none', health };
    }
  }

  // Healthy signal (or muted by the user) → reset the counter.
  return { action: 'none', health: 0 };
}
