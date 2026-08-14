# Arquitectura

## Visión general

```
┌──────────────────────────────────────────────────────────────────────────┐
│ PÁGINAS (Vite multi-página)                                               │
│   index.html (app) · que-son-las-ondas-binaurales · beneficios ·          │
│   como-usar · sobre-nosotros · privacidad                                 │
├──────────────────────────────────────────────────────────────────────────┤
│ APP (index.html)                                                          │
│   src/main.js       — orquestación UI, sesión, timer, alarmas, media      │
│   src/site.js       — nav/footer comunes de las páginas secundarias       │
│   src/style.css     — estilos de la app                                    │
├──────────────────────────────────────────────────────────────────────────┤
│ PIPELINE CIENTÍFICO (src/core)                                             │
│   Stimulus → Auditory → Neural → EEG → Cognitive → Visual → HUD           │
│   Orchestrado por SimulationEngine.loop() (rAF)                            │
├──────────────────────────────────────────────────────────────────────────┤
│ SIMULACIONES VISUALES                                                      │
│   src/wavefield.js  — laboratorio de propagación de ondas (FDTD 2D)       │
│   src/cymatics.js   — cimática: modos de Bessel, WebGL2/1/CPU             │
│   src/starfield.js  — fondo decorativo (no científico)                    │
├──────────────────────────────────────────────────────────────────────────┤
│ AUDIO                                                                      │
│   src/audio.js      — motor binaural (Web Audio)                          │
│   src/ambient.js    — 6 paisajes sonoros sintetizados                     │
├──────────────────────────────────────────────────────────────────────────┤
│ SOPORTE                                                                    │
│   src/models/profiles.js    — 28 perfiles con hipótesis y evidencia       │
│   src/notifications.js      — alarmas, permisos, Media Session helpers    │
│   src/validation/*          — asserts + suite de diagnóstico (25 tests)   │
│   src/core/reproducibility.js — semilla, config canónica, versión         │
│   scripts/run-diagnostics.mjs — runner headless (npm test)                │
└──────────────────────────────────────────────────────────────────────────┘
```

## Pipeline científico (separación de dominios — P1)

Cada capa es un módulo independiente con su propio estado; una capa **nunca**
escribe variables de otra. Los datos fluyen en una sola dirección:

```
StimulusState ──► AuditoryStateModel ──► NeuralStateModel ──► EegInterface
     (audio)          (psicoacústica)      (neurofisiológico)   (EEG sintético)
                                                                    │
                                                                    ▼
                                                          CognitiveStateModel
                                                          (psicológico estimado)
                                                                    │
                                                                    ▼
                                                          NeuralToVisualMapper
                                                          (metáfora visual, P9)
                                                                    │
                                                                    ▼
                                                          CymaticsRenderer /
                                                          WaveField (blit)
```

La única puerta Neural→Visual es `NeuralToVisualMapper` (P9). Los renderers
consumen un `VisualState` con provenance; nunca leen variables neuronales.

## Estados (src/core/states.js)

| Clase | Dominio | Campos |
|---|---|---|
| `StimulusState` | Físico | carrier, beat, L/R, amplitud, waveform, fase |
| `PhysicalState` | Físico | frecuencia base, modo dominante, energía |
| `NeuralState` | Neural | delta…gamma, aperiodic1f, fatigue, adaptation, dominantFreq |
| `EEGState` | Medición simulada | bandas, coherence, asymmetry, isSimulated |
| `CognitiveState` | Psicológico | arousal/attention/relaxation/engagement/flow (`{value, confidence}`), dominantFreq |
| `VisualState` | Visual | coherence, complexity, velocity, baseFrequency, provenance |

## Bucles en ejecución

1. **`SimulationEngine.loop()`** (rAF): actualiza Auditory → Neural → EEG →
   Cognitive → Visual → HUD. Corre siempre; sin perfil seleccionado los modelos
   no se actualizan.
2. **`drawVisual()`** (main.js, rAF): blitsea los canvases offscreen de las
   dos simulaciones sobre el canvas principal; sincroniza el pulso visual con
   la fase del latido (`audio.getBeatPhase()`).
3. **`starfield`** (rAF): fondo espacial; se pausa en modo cimática.

## Sesión (main.js)

`selectState(profile)` → `simulation.setProfile(profile, base)` (ruta parámetros
a neural/cognitivo/EEG). `start()` → `simulation.start(base)`, conecta ambientes
(`ambient.attach/syncToEngine/applySet`), arranca Media Session y WakeLock.
`stop()` → fade y liberación. Cambios en vivo (sliders, forma de onda) van
directos a `simulation.audio.retune()/setWave()`.

## Reproducibilidad (P12)

Todo run puede reconstruirse con `(SimulationSeed, SimulationConfig,
ModelVersion)`. `SimulationEngine.recordExperiment()` exporta el JSON canónico
(ver `docs/scientific-model.md`).

## Notas de implementación

- El canvas principal solo tiene contexto 2D; el GL vive en canvases offscreen
  de `CymaticsRenderer` (nunca pedir un contexto distinto al mismo canvas).
- `WaveField` crea su canvas offscreen de forma perezosa (solo en `render()`)
  para que la física corra headless en Node.
- El EEG sintético se auto-conecta al arrancar; teclas de desarrollo: `E`
  desconecta/conecta el EEG, `M` alterna modo científico/cinemático.
