# AUDIO LIFECYCLE REPORT — P2

## Causa raíz: "el audio se detiene ante cualquier interacción con la app"

**Diagnóstico causal (no fue un stop, fue churn):**
`window.addEventListener('pointerdown', restoreFromBackground, { passive: true })` ejecutaba el **restore completo** en CADA toque mientras la sesión sonaba:

1. `sessionLog.foreground()` → un evento de log por toque (ruido en el registro experimental, memoria creciente en sesiones largas).
2. `updateMediaSession()` → re-creaba `MediaMetadata` en cada tap (churn en el controlador del sistema).
3. `audio.fadeTo(volumeLevel, 0.4)` → cancelaba valores programados y re-rampaba la ganancia a cada toque (micro-interferencia).

**Fix aplicado (P2 Fase 11):** el handler ahora solo actúa si `AudioContext.state === 'suspended'` (el caso iOS que exige gesto para reanudar). Con la sesión sana, un toque en menú/scroll/slider/HUD ya no toca el audio. La máquina de estados central (`AudioStateMachine`) garantiza que ningún evento UI pueda transicionar el audio (solo eventos explícitos de audio).

## Watchdog y recuperación (web/PWA)

- `simulation.loop()` → `_audioWatchdog()` muestrea cada ~0.5 s el estado real del contexto; si quedó `suspended` con sesión activa → `recoverFade` (ganancia al piso → resume → rampa sin clics).
- `planRecovery()` decide UNA sola recuperación al volver de background (nunca reinicia la sesión completa).
- Al volver de iOS suspensión: `restoreFromBackground()` (visibility/focus/pageshow/resume + primer toque).

## Transporte (cómo llega el audio al SO)

- `element` (Android/desktop): AudioContext → master → compressor → analyser → MediaStreamDestination → `<audio>` real. El SO lo ve como reproducción única → MediaSession, lock screen, no suspende.
- `direct` (iOS): salida directa por `ctx.destination` + ancla muda (fallback legacy solo para reclamar MediaSession en PWA iOS).
- Fallback automático UNA vez si el elemento falla.

## APK nativa (validado en emulador API 34)

| Escenario | Resultado |
|---|---|
| Start | Foreground Service `isForeground=true` (mediaPlayback), focus GAIN, MediaSession PLAYING |
| Pause (keyevent 127) | UI sincroniza → PAUSED |
| Resume (keyevent 126) | PLAYING, provider native |
| Screen off | Servicio sigue foreground + MediaSession PLAYING ✅ |
| Stop | Servicio fuera, estado `stopped` honesto |
| Invariante | `assertSingleAudioProvider()=true` (nunca web+nativo a la vez) |

## Frecuencia/estabilidad (P11)

- `retune()` rampea frecuencias en marcha (1.5 s) sin reiniciar osciladores → sin discontinuidad de fase al cambiar de estado.
- `setWave()` muta `oscillator.type` en vivo (sin recrear nodos).
- El movimiento del teléfono NO entra al modelo de audio (sin sensor en la cadena); solo lifecycle/focus lo afectan.
- No se aplicaron hacks (volumen/buffers/setInterval arbitrarios) para "arreglar" el síntoma.
