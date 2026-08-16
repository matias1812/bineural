# AUDIO LIFECYCLE REPORT — P2

## Causa raíz: "el audio se detiene ante cualquier interacción con la app"

**Diagnóstico causal (no fue un stop, fue churn):**
`window.addEventListener('pointerdown', restoreFromBackground, { passive: true })` ejecutaba el **restore completo** en CADA toque mientras la sesión sonaba:

1. `sessionLog.foreground()` → un evento de log por toque (ruido en el registro experimental, memoria creciente en sesiones largas).
2. `updateMediaSession()` → re-creaba `MediaMetadata` en cada tap (churn en el controlador del sistema).
3. `audio.fadeTo(volumeLevel, 0.4)` → cancelaba valores programados y re-rampaba la ganancia a cada toque (micro-interferencia).

**Fix aplicado (P2 Fase 11):** el handler ahora solo actúa si `AudioContext.state === 'suspended'` (el caso iOS que exige gesto para reanudar). Con la sesión sana, un toque en menú/scroll/slider/HUD ya no toca el audio. La máquina de estados central (`AudioStateMachine`) garantiza que ningún evento UI pueda transicionar el audio (solo eventos explícitos de audio).

## Pausa/play real (tipo YouTube)

- `pauseSession()` (lock screen, botón de la app, API `__vyneural.pause`)
  congela el motor y el **temporizador** (`pausedRemainingMs`), sin terminar la
  sesión: no registra historial ni resetea el reloj de la sesión.
- `resumeSession()` reanuda la MISMA sesión y restaura la cuenta regresiva
  donde quedó (p. ej. pausa con 15 min → play 30 s después → quedan ~14:30).
- En la web la máquina de estados ahora llega a `PLAYING` (`started` se
  transiciona al arrancar el motor, antes solo lo hacía el evento nativo de la
  APK): el HUD y /diagnostico ya no se quedan en `INITIALIZING`.

## El audio no se bloquea en segundo plano (web + PWA)

- Al pasar la pestaña a segundo plano la sesión **no se enmudece ni se pausa**
  (comportamiento tipo YouTube): el sonido continúa dentro del navegador y
  fuera de él (pantalla de bloqueo / controles del sistema).
- Se eliminó el duck a 0 que se aplicaba al ocultar la página en iOS Safari
  sin PWA: enmudecer la sesión al salir era "bloquear" el audio para ahorrar
  problemas. Si el SO suspende el AudioContext (iOS Safari), al volver
  `restoreFromBackground()` lo reanuda con rampa suave al nivel de la sesión.

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

## P5.6 — Fixes de la auditoría forense (B1–H3)

Auditoría completa en [`docs/FORENSIC_AUDIT.md`](FORENSIC_AUDIT.md).

- **B1** — la alarma web/PWA ya NO arranca la sesión en primer plano: solo
  notifica + chime + toast y deja el estado configurado (regla de oro:
  disparo de alarma ≠ PLAY).
- **C1** — el deep link `?autostart=true` ya NO llama `start()` al cargar:
  configura el estado y espera el gesto del usuario (page load ≠ PLAY).
- **C2/H2 — frontera estructural APK** — `BinauralEngine.setPlatformMuted()`:
  en la APK el motor web es PERMANENTEMENTE inaudible; `start`, `setCondition`,
  `setVolume`, `fadeTo` y `recoverFade` consultan la frontera y jamás suben la
  ganancia (antes `setCondition()` des-enmudecía el motor web → doble tono con
  el nativo). El watchdog de `simulation.js` tiene guard explícito
  (`_platformMuted → return`), no protección accidental.
- **H1** — `selectState()` re-sincroniza el motor NATIVO (`syncNativeAudioRetune`)
  al cambiar de estado con la sesión activa (antes la UI cambiaba y el sonido
  seguía en el estado anterior).
- **H3** — eliminado el fallback `startBackgroundAudio()` del retune:
  **RETUNE nunca significa START** (la configuración no puede crear audio).

Verificación: suite **112/112** (Node y navegador) — incluye el test de la
frontera del motor (APK: ganancia 0 en start/setCondition/setVolume/fadeTo/
recoverFade; web: rampa normal) y el test de jerarquía de comandos (alarma,
autostart y RETUNE jamás generan PLAY).

## P5 — Depuración por causalidad: NINGÚN AUDIO NACE SIN CAUSA AUDITABLE (APK)

Fase P5.1–P5.5: se eliminó toda reproducción autónoma y se unificó el
protocolo de reproducción. Detalle completo de la matriz en
[`docs/DESTRUCTIVE_MATRIX.md`](DESTRUCTIVE_MATRIX.md).

### P5.1 — Kill-switch de reproducción espontánea

- `START_STICKY` → `START_NOT_STICKY`: si el SO mata el proceso, el servicio
  **no se recrea** (y por tanto nunca puede reanudar audio solo).
- `restorePersistedSession() → engine.start()` ELIMINADO: la sesión persistida
  (frecuencias, onda, volumen, título) se conserva para un comando explícito,
  pero un `shouldPlay` persistido **jamás** se convierte en `engine.start()`.
  Un restart con intent null registra `NO_AUTO_PLAY` en la traza causal y el
  servicio se detiene solo.
- Configuración (RETUNE / SET_WAVE / SET_AUDIO_LEVEL) y PAUSE **no crean ni
  reviven** el servicio (`serviceAlive` guard): solo `START`/`RESUME` (acciones
  de reproducción explícitas) pueden arrancar audio.
- `mediaPlaybackRequiresUserGesture = true`: el WebView no puede autoplay.
- AudioFocus **GAIN nunca significa "reproducir"**: solo recupera una
  interrupción (el motor ya estaba sonando); desde detenido es no-op.

### P5.2 — Protocolo único PLAY/PAUSE/STOP (Web y APK simétricos)

Contrato puro en `src/core/native-protocol.js` (testeado):

```
PLAY (sesión nueva / servicio muerto)      → 1 START
RESUME (tras pausa, servicio vivo)         → 1 RESUME
RESUME ya aplicada (lock screen)           → 0 comandos (solo mute web)
PAUSE desde UI / teclado / API             → 1 PAUSE
PAUSE ya aplicada (lock screen)            → 0 comandos
STOP con servicio vivo                     → 1 STOP
STOP con servicio muerto                   → 0 comandos
```

- `pauseSession()` ahora envía **PAUSE** al servicio nativo (antes solo
  sincronizaba la UI: el motor nativo seguía sonando con la UI en pausa —
  asimetría PLAY/PAUSE corregida).
- La reanudación tras pausa envía **RESUME** (no un START duplicado con
  re-solicitud de audio focus).
- RESUME sobre un motor detenido arranca con los parámetros de la última
  sesión (nunca un motor mudo con la notificación "playing").

### P5.3 — APK: la WebView solo dibuja (separación total Web/APK)

En la APK el WebView NO ejecuta el protocolo de recuperación de audio web:

- sin `navigator.mediaSession` (ni metadata ni handlers: el SO ve UNA sola
  MediaSession, la nativa — P6);
- sin reaffirm del transporte ni play del ancla al volver de background;
- sin `startAnchor()` al arrancar (la MediaSession la posee el servicio).

El motor web arranca **mudo** (ganancia 0 con cancelación de automation) solo
para alimentar el visualizador; el `<audio>` web queda pausado.

### P5.4 — Instrumentación causal

- **Nativo:** `Diagnostics.trace()` — anillo de 80 eventos con timestamp,
  generación de servicio (`serviceStartId`), comando, estados before/after
  (`running`, `shouldPlay`, `mediaSessionPlaybackState`, `focusState`). Se
  muestra en `DiagnosticsActivity` y en la traza del snapshot.
- **Web:** `window.__causalLog` — anillo con `{ts, action, source, from, to,
  playing, provider, native}` registrado en PLAY/RESUME/PAUSE/STOP/RESTORE y
  en los eventos nativos (`vyneural:audioplayback` / `vyneural:audiofocus`).

Si vuelve a ocurrir "se activó sola", la traza responde EXACTAMENTE qué
componente emitió el primer PLAY y con qué generación de servicio.

## Frecuencia/estabilidad (P11)

- `retune()` rampea frecuencias en marcha (1.5 s) sin reiniciar osciladores → sin discontinuidad de fase al cambiar de estado.
- `setWave()` muta `oscillator.type` en vivo (sin recrear nodos).
- El movimiento del teléfono NO entra al modelo de audio (sin sensor en la cadena); solo lifecycle/focus lo afectan.
- No se aplicaron hacks (volumen/buffers/setInterval arbitrarios) para "arreglar" el síntoma.
