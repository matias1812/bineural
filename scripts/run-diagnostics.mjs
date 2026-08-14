// scripts/run-diagnostics.mjs
// Headless scientific validation suite (Phase 11 / Fase 20 integrity checks).
// Run: npm test
//
// Imports the SAME suite the browser exposes as window.runBineuralDiagnostics().
// All physics/neural/EEG/cognitive modules are DOM-free, so the suite runs
// identically in Node and in the browser.

import { runBineuralDiagnostics } from '../src/validation/diagnostics.js';

// Capture console output coloring stripped (Node prints %c literally otherwise).
const orig = [console.log, console.warn, console.error];
const isNode = typeof process !== 'undefined';
if (isNode) {
  console.log = (...a) => orig[0](...a.map((x) => (typeof x === 'string' ? x.replace(/%c/g, '') : x)));
  console.warn = (...a) => orig[1](...a.map((x) => (typeof x === 'string' ? x.replace(/%c/g, '') : x)));
}

const { passed, failed } = await runBineuralDiagnostics();

if (isNode) {
  if (failed > 0) {
    console.error(`\n✗ ${failed} validation test(s) FAILED.`);
    process.exit(1);
  }
  console.log(`\n✓ All ${passed} validation tests passed.`);
  process.exit(0);
}
