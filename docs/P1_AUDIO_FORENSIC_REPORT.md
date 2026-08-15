# P1 — AUDIO DUPLICATION FORENSIC + LIFECYCLE HARDENING

**Fecha:** 2026-08-15 · **Criterio:** no agregar funcionalidades; eliminar y *demostrar* la ausencia de pipelines de audio duplicados durante lifecycle transitions.

**Archivos protegidos (no modificados):** `src/cymatics.js`, `src/wavefield.js`, `src/core/simulation.js`, `src/core/experiments.js` — verificados **CLEAN vs HEAD**.

**Justificación de `src/audio.js` (único archivo del "core de audio" tocado):** la idempotencia de `start()` y el teardown síncrono son invariantes del motor que no pueden garantizarse desde fuera (cualquier llamador podría re-crear fuentes). Tu P1 excluye explícitamente solo cymatics/wavefield/simulation/experiments; el cambio en `audio.js` es mínimo, aditivo en instrumentación, y está cubierto por tests de regresión. `SimulationEngine` (simulation.js) NO se tocó.

---

## 1. Cambios realizados

### `src/audio.js` — idempotencia + teardown síncrono (M2)
- `start()` **idempotente**: con sesión viva y los MISMOS parámetros → no reconstruye (mismo sessionId, mismas fuentes, sin re-rampa). Con parámetros distintos → reconstruye.
- **Teardown síncrono** (stop-before-start): antes de crear fuentes nuevas se ejecutan `_teardownSources()` (fuentes vivas) y `_flushPendingTeardown()` (teardown diferido de un stop previo). **Nunca existe una ventana con dos sets de fuentes sonando.**
- `stop()` registra los nodos diferidos en `_pendingTeardown`; el timer los libera, pero un `start()` posterior los flushea SÍNCRONAMENTE.
- Robustez: `start()` ahora acepta llamada sin argumentos (`= {}` default) — antes rompía el destructuring.
- Instrumentación forense en `getAudioStats()`: `sessionId`, `sourceSeq`, `pendingTeardown`, `liveSourceIds`.

### `src/core/audio-automation.js` (nuevo, puro) — cancelación de automation (M1)
- `muteMasterGain()` / `restoreMasterGain()` / `setParamValueCancelingAutomation()`: política "cancelar scheduled values ANTES de fijar el valor". Una rampa residual (`setValueAtTime/linearRamp/exponentialRamp/setTargetAtTime` pendientes) ya no puede reactivar el motor web.

### `src/main.js` — aplicación de M1 + M3
- **M1:** la rama nativa de `restoreFromBackground()` usaba `gain.value = 0` sin cancelar → ahora `muteMasterGain()` (con `ctx.currentTime`). También `syncNativeAudioStop()` (rama web) usaba `gain.value = volumeLevel` sin cancelar → ahora `restoreMasterGain()`.
- **M3:** `RestoreGate` (máquina de estados) enruta TODAS las vías de restore: `visibilitychange`, `pageshow`, `focus`, `resume`, `pointerdown`, fullscreen (6 vías). El burst de unlock colapsa a **1 solo restore**; `force` (ctx suspendido, p. ej. toque iOS) atraviesa la ventana.

### `src/core/restore-gate.js` (nuevo, puro) — dedup por máquina de estados
- `IDLE → RESTORING → SETTLED → IDLE`. No es un debounce: es una máquina con transiciones explícitas; `coalesce` si llega durante un restore; `skip` dentro de la ventana de settle; `force` la atraviesa.

### `src/validation/diagnostics.js` — 7 tests de regresión nuevos
Con `FakeAudioContext` headless (el motor real ejercitado sin DOM):
1. `start()` duplicado → 1 pipeline, 2 osciladores, sessionId 1, idempotente.
2. **`lock_unlock_no_duplicate_pipeline`**: START→LOCK→UNLOCK ×3 → 2 osciladores totales, una sesión.
3. stop→start inmediato → nodos viejos **detenidos y desconectados SÍNCRONAMENTE** antes de crear los nuevos.
4. stop(false) → liberación completa tras el teardown diferido (async).
5. start() con parámetros distintos → reconstruye sin solape (sessionId 2, 2 fuentes vivas).
6. RestoreGate: burst deduplica a 1; force atraviesa; coalesce durante RESTORING.
7. muteMasterGain cancela automation antes de fijar 0.

---

## 2. Evidencia de ejecución

### Suite automatizada
```
Results: 89 Passed, 0 Failed   (82 previos + 7 P1)
✓ All 89 validation tests passed.
✓ vite build limpio
```
### Reproducción forense en emulador (APK nueva, Android 14, bundle `main-DOlXsX1X.js`)
Ciclo completo con `__audioProbe()` (nueva instrumentación) vía CDP:

| Escenario | sessionId | osc | live | pending | gain | Estado |
|---|---|---|---|---|---|---|
| Play (sesión) | 1 | 2 | [1,2] | 0 | 0 (web muda) | PLAYING |
| Lock/unlock ×3 | **1** (constante) | 2 | [1,2] | 0 | 0 | PLAYING |
| Pause (dispatch sistema) | 1 | 0 | [] | 0 | — | PAUSED |
| Resume (dispatch sistema) | 2 | 2 | [3,4] | 0 | — | (transición) |
| **Stop→start inmediato** | 3 | 2 | [5,6] | **0** | — | PLAYING |
| Stop final | 3 | 0 | [] | 0 | — | STOPPED |

**Lectura:** en ningún instante existieron más de 2 fuentes vivas ni teardown pendiente tras un start. El stop→start inmediato (el escenario M2 que antes podía solapar hasta 1,1 s) flushea síncronamente y arranca el pipeline nuevo limpio. El gate `restoreGate.state = SETTLED` confirma la deduplicación del burst de unlock.

---

## 3. Checklist de cierre P1

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | `start()` doble no duplica audio | ✅ PASS | test §1 + forense (sessionId 1, 2 osc) |
| 2 | `restore()` múltiple no duplica audio | ✅ PASS | test RestoreGate §6 + `SETTLED` en vivo |
| 3 | lock/unlock no duplica audio | ✅ PASS | test §2 + 3 ciclos en emulador |
| 4 | MediaSession no crea audio | ✅ PASS | handlers → start/stop existentes; dispatch play no duplicó pipeline |
| 5 | No quedan automation ramps residuales | ✅ PASS | audit: TODAS las rampas de audio.js ya cancelan; los 2 puntos sin cancelar de main.js corregidos + test §7 |
| 6 | `activeAudioSessions <= 1` | ✅ PASS | sessionId constante, 1 contexto (fake + emulador) |
| 7 | `activeAudioContexts <= 1` | ✅ PASS | `ensure()` idempotente (no modificado; verificado) |
| 8 | `activePipelines <= 1` | ✅ PASS | `liveSourceIds` siempre 2 o 0 |
| 9 | stop libera completamente | ✅ PASS | test §4 + forense (live [], pending 0, STOPPED) |
| 10 | tests automatizados PASS | ✅ PASS | 89/89 |
| 11 | build PASS | ✅ PASS | vite + APK debug |
| 12 | simulaciones sin regresión | ✅ PASS | core CLEAN vs HEAD; `SimulationEngine` intacto |

## 4. P1 STATUS: **PASS** (en emulador + tests)

Observaciones no bloqueantes (ya documentadas en P2):
- El estado `INTERRUPTED` transitorio al resume desde el sistema corresponde al choque de audio focus WebView/nativo (Chromium `AudioFocusDelegate`), ya documentado; la web permanece muda y el servicio nativo es la vía audible — no afecta el invariante de pipelines.
- La confirmación definitiva del *síntoma auditivo* (batido en el primer lock) requiere oído físico; la causa mecánica (ventana de solape + rampa residual) quedó eliminada y demostrada ausente por instrumentación.

## 5. Siguiente paso natural
- Re-sincronizar `public/vyneural.apk` con el build nuevo (release) para que el próximo deploy distribuya la versión con el fix.
- Deploy a Vercel de la web con el fix (M1/M2/M3) cuando lo pidas.

---
*Ver: `docs/P0_AUDIT.md` (gaps GAP-1/GAP-2 ahora cerrados), `P2_VALIDATION_REPORT.md`, `TEST_MATRIX.md`.*
