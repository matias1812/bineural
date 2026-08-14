# Validación

## Cómo ejecutar

```bash
npm test                       # suite headless (Node) — 38 tests, < 2 s
window.runBineuralDiagnostics()# misma suite en el navegador (consola)
npm run build                  # build de producción
```

La suite importa exactamente los mismos módulos en Node y en el navegador
(la física y los modelos son libres de DOM; `WaveField` crea su canvas de forma
perezosa para permitirlo).

## Inventario de la suite (src/validation/diagnostics.js)

### Ancla de medios (Media Session en móvil)

| Test | Qué valida |
|---|---|
| WAV silencioso con cabecera válida | RIFF/WAVE/fmt/data, 8 kHz, mono, 16-bit |
| Muestras a cero (silencio real) | El ancla no aporta sonido |

### Física de ondas (WaveField)

| Test | Qué valida |
|---|---|
| CFL < 1 | Estabilidad numérica del esquema leapfrog |
| CFL clamping con c > 1/√2 | El constructor clampa la velocidad insegura |
| Energía = 0 en rejilla en reposo | Definición de energía |
| Impulso crea energía > 0 | Fuentes inyectan energía |
| Decaimiento monótono bajo damping | Disipación sin fuentes |
| Sin NaN/Infinity tras 300 pasos | Robustez numérica |
| Clamp de amplitud tras pulso extremo | Límite no físico se respeta |
| Dirichlet: bordes en cero | Condiciones de contorno |

### Audio / estímulo

| Test | Qué valida |
|---|---|
| Derivación de oídos (L=carrier, R=carrier+Δf) | Consistencia del estímulo físico |
| Todos los perfiles con carrier/beat válidos | Integridad del dataset |
| ModelParams y visualMetaphor en [0,1] | Bounds de parámetros |

### Modelo neural

| Test | Qué valida |
|---|---|
| Bounds bajo fatiga alta (36 000 pasos) | fatigue/adaptation ∈ [0,1] |
| Habituación converge a ~0 | H(t) = exp(−t/τ) |
| Determinismo (misma trayectoria) | Reproducibilidad del modelo |
| dominantFreq publicado y plausible (4–40 Hz) | Wiring corregido (antes `_owner` roto) |

### Reproducibilidad (P12)

| Test | Qué valida |
|---|---|
| SimulationConfig rechaza params inválidos | Validación estricta |
| JSON canónico estable ante orden de claves | Byte-identidad |
| mulberry32 determinista y bien distribuido | PRNG |
| EEG idéntico bajo el mismo seed | Streams reproductibles |
| EEG distinto bajo distinto seed | Sensibilidad a la semilla |
| ExperimentRecord completo (versión, seed, config) | Formato de exportación |

### EEG sintético

| Test | Qué valida |
|---|---|
| Bandas finitas y ∈ [0,1] en 2000 pasos | Validez numérica |
| Fluctuación 1/f no trivial (std ≥ 0.004, seed 7) | Canales vivos (no muertos) |

### Modelo cognitivo y visual

| Test | Qué valida |
|---|---|
| Valores y confianza ∈ [0,1] (6000 pasos) | Bounds de CognitiveState |
| VisualMapper determinista y con provenance | Puerta Neural→Visual correcta |

### Audio watchdog (lógica pura — src/core/audio-health.js)

| Test | Qué valida |
|---|---|
| Contexto suspendido → `resume` al 3er chequeo | Recuperación de suspensión del SO |
| Señal nula con ganancia → `refade` al 3er chequeo | Sesión "en play pero muda" |
| Señal presente → nunca actúa y resetea contador | Sin falsos positivos |
| Volumen del usuario a 0 → nunca actúa | No pelea con el slider de volumen |
| Sin sesión activa → nunca actúa | No actúa en pausa |

### Experimental Mode (Phase 10 — src/core/experiments.js)

| Test | Qué valida |
|---|---|
| Determinismo bajo la misma semilla y config | Reproducibilidad del experimento |
| Binaural entraña hacia Δf; sin estímulo relaja a línea base | Respuesta del modelo según condición |
| PSD finita, no negativa y bandas integradas | Validez del espectro (FFT) |
| Todas las condiciones producen estados finitos | Robustez en las 5 condiciones |
| Exporta registro JSON reproductible (seed + config) | Formato de experimento |
| `conditionProfile` rechaza condiciones desconocidas | Validación de entrada |

## Checklist de integridad (Fase 20)

| # | Ítem | Estado (2026-08-14) |
|---|---|---|
| 1 | `npm run build` | ✅ 6 páginas, 150 kB JS (gzip 48 kB) |
| 2 | `npm test` (diagnósticos) | ✅ 38/38 (Node) |
| 3 | Suite en el navegador | ✅ 38/38 (`window.runBineuralDiagnostics()`) |
| 4 | GPU (WebGL2) | ✅ contexto GL2 detectado; fallback GL1 (GLSL ES 1.00) + `OES_texture_float`; fallback CPU |
| 5 | CPU fallback | ✅ presente en el código (`buildGLProgram` → null → rasterizador) |
| 6 | Móvil | ⚠️ sin dispositivo físico disponible; canvas adaptativo (`devicePixelRatio`), rotación forzada en vertical |
| 7 | NaN/Infinity | ✅ cubierto por tests (WaveField, EEG, cognitivo) |
| 8 | Bounds | ✅ `assertBounds` en neural/cognitivo; tests de rango |
| 9 | HUD no confunde simulación con medición | ✅ grupos separados + etiquetas (Fase 16/17) |
| 10 | Ninguna variable visual presentada como neurofisiológica | ✅ provenance `visual metaphor` obligatoria |
| 11 | Revisión de ecuaciones | ✅ documentada en `docs/scientific-model.md` |

## Reporte de validación — 2026-08-14

- **Entorno**: Windows (Git Bash), Node ≥ 18, Chrome (runtime del preview).
- **Build**: `✓ built in ~1.3 s` — `dist/` regenerado (6 páginas + assets).
- **Tests**: 38/38 en Node y 38/38 en el navegador (corridas consecutivas, sin
  flakiness tras fijar semilla del test 1/f).
- **Runtime**: la app arranca sin errores de consola; HUD científico poblado
  (STIMULUS con frecuencias reales, NEURAL con arrastre 12→16 Hz, EEG SIMULATED,
  VISUAL con base de metáfora).
- **Errores estructurales corregidos en esta auditoría** (ver `docs/audit.md`):
  `dominantFreq` sin wiring, EEG nunca conectado, canvas de WaveField en el
  constructor (bloqueaba headless), drenaje de fatiga constante en cognitive,
  test de habituación que caía en la rama equivocada, test CFL con precisión
  flotante.

## Reproducibilidad de un experimento

1. Elegir `SimulationSeed(seed)` y `SimulationConfig(...)`.
2. Construir el motor con la semilla:
   `new SimulationEngine(cymatics, { seed })`.
3. Ejecutar y exportar `engine.recordExperiment(results)` → JSON
   `{ modelVersion, seed, config, recordedAt, results }`.
4. Re-ejecutar con el mismo seed + config → mismos streams (verificado por test).
