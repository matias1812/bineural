# P2 — HARDWARE / AUDIO / PERMISSIONS VALIDATION

**Fecha:** 2026-08-15
**Entorno de validación:** Emulador Android API 34 (Android 14, google_apis x86_64, 1080×2340) — AVD `vyneural-test`. Sin dispositivo físico conectado.
**Versión APK:** debug `app-debug.apk` (1.0.0, targetSdk 34, minSdk 26).
**Estado global:** El gate P2 NO se declara cerrado. La infraestructura de audio/native está **validada en emulador** con evidencia de dumpsys; la validación **física real queda pendiente** (ver sección PENDIENTES).

---

## 1. Arquitectura final (mapa WEB → BRIDGE → ANDROID)

```
                 ┌───────────────────────────────┐
                 │  SIMULACIÓN matemática (core) │  ← NO se tocó (Fase 14)
                 └───────────────┬───────────────┘
                                 │ parámetros
                                 ▼
                 ┌───────────────────────────────┐
                 │  UI (WebView) — control/visual │
                 │  audioState.js (máquina P2)    │
                 └───────────────┬───────────────┘
                                 │ AndroidBridge (whitelist)
                                 ▼
                 ┌───────────────────────────────┐
                 │  AudioForegroundService (P1)  │
                 │  ├─ BinauralToneEngine        │  ← ÚNICO motor audible
                 │  ├─ AudioFocusHelper          │
                 │  └─ MediaSession (P1.5/P2)    │
                 └───────┬───────────────┬───────┘
                         ▼               ▼
                  MediaSession      AudioFocus
                         │               │
                         ▼               ▼
                    Android OS ──► LockScreen / Notification / Bluetooth
```

Reglas estructurales verificadas:
- **Un solo proveedor de audio activo**: `assertSingleAudioProvider()` (nativo activo ⇒ gain web = 0). Verificado en vivo: `webGain=0` con el servicio reproduciendo.
- **UI ≠ AUDIO ≠ EXPERIMENTO**: la máquina `AudioStateMachine` (IDLE/INITIALIZING/PLAYING/PAUSED/STOPPED/INTERRUPTED/DUCKED/BACKGROUND/ERROR) solo transiciona con eventos de audio explícitos; cada transición registra `{ts, source, from, to, reason}`.
- La WebView **no es la autoridad del audio**: el motor nativo sobrevive a WebView pausada, HOME, pantalla apagada y rotación.

## 2. Problemas encontrados y corregidos (bugs reales reproducidos en emulador)

| # | Bug | Evidencia | Corrección |
|---|-----|-----------|------------|
| B1 | `createNativeBridgeAdapter().getState().info` era el **JSON string crudo** del objeto nativo (nunca se normalizaba ni refrescaba) → `supported.*` siempre falsas y `retuneNative=false` | CDP: `info` string; retune caía al fallback | Normalización a objeto + re-lectura en vivo en `getState()`/`handshake()` |
| B2 | `syncNativeAudioStart()` **nunca enviaba START** (solo RETUNE+VOLUME) → servicio corriendo pero motor sin arrancar (quedaba enmascarado por B1) | CDP: `backgroundServiceActive=true` pero `msState=stopped`, focus NONE | Envío explícito de `START_BACKGROUND_AUDIO` con base/beat/wave/title |
| B3 | `BinauralToneEngine` **nunca llamaba a `track.play()`** → en MODE_STREAM el AudioTrack queda idle y `write()` bloquea para siempre: motor nativo **silencioso** (compilaba, jamás sonaba) | `dumpsys audio`: `AudioTrack ... state:idle` con MediaSession PLAYING | `track.play()` antes del bucle de escritura + `Thread.sleep` si `write()≤0` |
| B4 | El mute web (`gain.value=0`) era **pisado por el ramp programado** del motor web → doble motor audible (web al 60 % + nativo) | CDP: `webGain=0.6` con provider native | `cancelScheduledValues` + `setValueAtTime(0)` en `syncNativeAudioStart` |
| B5 | El callback de audio focus **no llegaba a la web** aunque el SO concediera (stack GAIN, `notified:true`, `Diagnostics=NONE`) | `dumpsys audio` vs `GET_AUDIO_STATE: focusState NONE` | Estado honesto por **código de retorno** de `requestAudioFocus` + log en el listener |
| B6 | Recursión del APK (se embebía a sí mismo) | tamaño 18.9 MB → 6.3 MB | `vyneural.apk` excluido del bundle de assets |

## 3. Matriz PASS / FAIL / NOT TESTED (emulador API 34)

### WEB (headless)
| Prueba | Resultado |
|--------|-----------|
| `npm test` (suite de validación) | ✅ **PASS** — 82/82 |
| Build Vite | ✅ **PASS** — limpio |
| Máquina de estados de audio (tests puros) | ✅ **PASS** |
| Bridge: info cruda string → objeto | ✅ **PASS** (test B1) |

### APK — emulador (evidencia dumpsys + CDP)
| Prueba | Resultado | Evidencia |
|--------|-----------|-----------|
| Instalación y arranque (WebView offline) | ✅ PASS | `Displayed MainActivity`, `[EEG] Simulated stream connected` |
| Handshake del bridge | ✅ PASS | `bridgeStatus: CONNECTED`, version 1.0.0 |
| Play → servicio foreground | ✅ PASS | `isForeground=true types=00000002 (mediaPlayback)` |
| Play → motor nativo audible | ✅ PASS | `AudioTrack type:android.media.AudioTrack state:started sampleRate=44100` |
| MediaSession activa | ✅ PASS | `active=true state=PLAYING(3) actions=7`; metadata `Meditación · 210.0/216.0 Hz` |
| Botones de medios → app | ✅ PASS | `Media button session is com.vyneural.bineural/Vyneural` |
| Notificación de control | ✅ PASS | `channel=bineural_player category=transport actions=2 vis=PUBLIC` (Pausar + Detener) |
| AudioFocus concedido | ✅ PASS | stack focus `gain:GAIN notified:true`; `focusState=GAIN` |
| Single audio provider | ✅ PASS | `webGain=0` mientras native reproduce |
| **TEST-LS-001 pantalla apagada 6s** | ✅ PASS | track `state:started`, `isForeground=true`, `PLAYING(3)` |
| Media key PAUSE → WebView sincronizada | ✅ PASS | `PAUSED(2)` en SO + UI botón "Comenzar sesión" + `audioState=PAUSED` |
| Media key RESUME | ✅ PASS | `PLAYING(3)` + UI `playing=true` |
| Media key STOP | ✅ PASS | servicio 0, notificación 0, `audioState=STOPPED` |
| Background (HOME) → audio continúa | ✅ PASS | track `state:started` tras HOME |
| **Fase 9 — interacciones UI** (menú ⋯, scroll, HUD) | ✅ PASS | `audioState` PLAYING antes/después; guard `warns=0` |
| Slider volumen → `SET_AUDIO_LEVEL` sin re-pedir focus | ✅ PASS | `focusEvents` sin incremento |
| Slider portadora → `RETUNE_BACKGROUND_AUDIO` | ✅ PASS | estado PLAYING, guard `warns=0` |
| Rotación (landscape/portrait) | ✅ PASS | track `started`, `PLAYING` |
| Permiso POST_NOTIFICATIONS | ✅ PASS | `pm grant` → `notificationPermission=GRANTED` (estado honesto) |
| Teardown STOP | ✅ PASS | servicio liberado, notificación eliminada, track nativo released |

### Pendiente — requiere hardware físico (NOT TESTED, no inventar evidencia)
| Prueba | Estado |
|--------|--------|
| Llamada telefónica real entrante/saliente (duck/pause + restore) | 🔴 NOT TESTED |
| Bluetooth real (auriculares/auto): media keys, conexión/desconexión | 🔴 NOT TESTED |
| Ahorro de batería / Doze / low-memory kill del proceso | 🔴 NOT TESTED |
| Render físico del lock screen (widget con artwork/controles) | 🔴 NOT TESTED |
| Varias versiones de Android (26–35) | 🔴 NOT TESTED (solo API 34) |
| Reinicio del dispositivo con alarma programada | 🔴 NOT TESTED (lógica cubierta por tests, física pendiente) |
| Interrupción por otra app de música real | 🟠 PARCIAL (focus loss simulado por `dumpsys`/media keys; otra app no disponible en el AVD) |

## 4. Instrumentación dejada en el código (Fase 9/13)

- **`window.__audioState`** — máquina de estados con historial `{ts, source, from, to, reason}`.
- **`window.__uiAudioGuard`** — registra cada interacción UI con `{kind, ts, id, before, after, changed, expected}`; un cambio de audio por un evento no-audio dispara `console.warn`.
- **`window.__audioProvider()`** / **`window.__assertSingleAudioProvider()`** — invariante de un solo motor.
- **`window.__interferenceLog`** — focus/playback/provider/ctx/wakelock en tiempo real (HUD + /diagnostico).
- **`GET_AUDIO_STATE` / `GET_MEDIA_SESSION_STATE`** (bridge whitelisted) — estado real nativo para diagnóstico.
- **HUD (⋯ → Rendimiento y FPS)** — muestra estado de audio, proveedor, FPS, lifecycle, log de interferencias.

## 5. Cómo reproducir la validación en emulador

```bash
emulator -avd vyneural-test -no-window -no-snapshot -gpu swiftshader_indirect &
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.vyneural.bineural/.MainActivity
adb shell pm grant com.vyneural.bineural android.permission.POST_NOTIFICATIONS
# CDP (build debug habilita WebView.setWebContentsDebuggingEnabled):
adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof com.vyneural.bineural)
# presionar play desde el inspector, luego:
adb shell dumpsys audio | grep -E "AudioTrack.*10193"        # state:started
adb shell dumpsys media_session | grep PlaybackState          # PLAYING(3)
adb shell input keyevent 85   # play/pause media key
adb shell input keyevent 26   # screen off (audio debe continuar)
adb shell input keyevent 3    # HOME (audio debe continuar)
adb shell input keyevent 86   # media stop
```

## 6. Riesgos restantes

1. **Focus tug-of-war**: en el emulador apareció un `focus:LOSS` alrededor del resume de media keys (origen: el elemento `<audio>` silencioso del WebView o el `abandon()` del stop). El estado final fue correcto y honesto, pero el comportamiento de focus con otra app real de audio debe verificarse en hardware.
2. **Doze/batería**: no validado; el FGS tipo `mediaPlayback` mitiga, pero la política del fabricante puede variar.
3. **WebView pausada**: `webView.onPause()` pausa timers/rendering; el motor nativo no depende de ella (verificado), pero el push de eventos nativos→JS durante background depende de que la WebView ejecute `evaluateJavascript` al volver.
4. **`NOT TESTED` ≠ PASS**: todo lo listado en la sección 3-pendiente sigue sin evidencia.

## 7. Veredicto

- **Código/arquitectura:** ✅ sólido (6 bugs reales encontrados y corregidos con evidencia).
- **Build:** ✅ PASS (JS 82/82, Vite, Kotlin).
- **Emulador (API 34):** ✅ 16/16 pruebas automatizables PASS con evidencia de `dumpsys`.
- **Dispositivo físico:** 🔴 pendiente — necesarios al menos: lock screen real, llamada, Bluetooth, Doze, Android 26–35.
