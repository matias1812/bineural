# P0 — BASELINE Y AUDITORÍA DEL REPOSITORIO

**Fecha:** 2026-08-15 · **Rama:** main · **Commit estable de referencia:** HEAD (core sin modificar)

> **Corrección de estado previo:** el informe anterior citado ("78/78 tests, sin SDK/Gradle, bridge no probado") está **obsoleto**. Estado real hoy: **82/82 tests**, `android/` completo con Gradle + Kotlin, **APK real construida y validada en emulador Android 14 (API 34)** con evidencia del sistema (Foreground Service, MediaSession, alarmas, permisos). Ver `P2_VALIDATION_REPORT.md`.

---

## 1. ARQUITECTURA ACTUAL (reconstruida del código)

```
┌─────────────────────────────────────────────────────────────┐
│ SIMULATION CORE (PROTEGIDO — P0 = PASS, 0 diffs vs HEAD)     │
│  src/audio.js          BinauralEngine (Web Audio, 514 líneas)│
│  src/cymatics.js       renderizador cimático (2309)          │
│  src/wavefield.js      campo de ondas (303)                  │
│  src/core/simulation.js SimulationEngine (270)               │
│  src/core/experiments.js + experiment-events.js (497)        │
└──────────────┬──────────────────────────────────────────────┘
               │ (API del motor: start/stop/retune/setVolume/…)
┌──────────────▼──────────────────────────────────────────────┐
│ SESSION / AUDIO LAYER (src/core/* — puras, testeadas headless)│
│  audio-state.js   AudioStateMachine (9 estados, 16 fuentes)  │
│  lifecycle.js     AppLifecycle (6 estados, eventos reales)   │
│  audio-provider.js selectAudioProvider + invariante motor único│
│  audio-transport.js 'element' (MediaStream→<audio>) | 'direct'│
│  audio-health.js   watchdog (resume/refade sin clics)        │
│  audio-clock.js    reloj = AudioContext.currentTime          │
│  media-anchor.js   ancla muda (fallback legacy iOS)          │
└──────────────┬──────────────────────────────────────────────┘
               │ (eventos reales: focus, playback, visibilidad)
┌──────────────▼──────────────────────────────────────────────┐
│ PLATFORM LAYER                                               │
│  platform-capabilities.js  detección + fusión web/nativo     │
│  native-bridge.js          adapter whitelist (22 comandos)   │
│  notification-manager.js   providers SW/local/push(off)/cal  │
│  alarm-manager.js          scheduler multi-tab + IndexedDB   │
│  permissions.js            lógica pura de permisos           │
│  fullscreen.js             pantalla completa                 │
└──────────────┬──────────────────────────────────────────────┘
               │ file:// android_asset / HTTPS
┌──────────────▼──────────────────────────────────────────────┐
│ ANDROID (APK real)                                           │
│  MainActivity.kt       WebView shell + injectBridge          │
│  AudioForegroundService.kt  Foreground + MediaSession nativa │
│  BinauralToneEngine.kt      AudioTrack streaming (reloj por  │
│                             muestras, sin timers)            │
│  AndroidBridge.kt / BridgeCommands.kt  whitelist Kotlin      │
│  AlarmScheduler/Receiver/BootReceiver  AlarmManager + reboot │
│  NotificationHelper.kt    2 canales (player/alarms)          │
│  PermissionManager.kt     permisos bajo demanda              │
│  AudioFocusHelper.kt      focus + duck/pause/resume          │
│  Diagnostics.kt / LifecycleManager.kt / DiagnosticsActivity  │
└──────────────────────────────────────────────────────────────┘
```

**Regla de capas cumplida:** el core NO accede a `window.AndroidBridge`, `Notification`, `navigator.mediaSession` ni `AlarmManager` — todo pasa por la capa de plataforma. `main.js` (3920 líneas) es el ÚNICO orquestador con DOM, y solo alimenta las máquinas puras.

**Dependencias:** solo `@vercel/analytics` + `@vercel/speed-insights` (runtime), `vite@6` (dev). Sin frameworks UI. Build multi-página (`vite.config.js` → 9 HTML raíz), `base:'./'` (necesario para `file://` en la APK), plugin que quita `crossorigin` (file:// opaco).

**Entry points:** `index.html → src/main.js` (app), `diagnostico.html → src/diagnostico.js`, páginas de contenido → `src/site.js`. La APK sirve el MISMO `dist/` desde assets locales (offline).

---

## 2. DIAGRAMA REAL DE ESTADOS DEL AUDIO

### 2.1 Máquina de audio (`src/core/audio-state.js` — verificada en código + 82 tests)

```
            user_play / system_play
   IDLE ─────────────────────────────▶ INITIALIZING ──started/focus_gain──▶ PLAYING
     ▲                                     │  ▲                              │  │
     │                                     │  │ user_stop/system_stop       │  │ user_pause/system_pause
     │                                     ▼  │                              ▼  ▼
     │                                  STOPPED                              PAUSED
     │                                     │  ▲                              │  ▲
     └──user_play/system_play──────────────┘  └──user_play/system_play───────┘  │
                                                                               │
   PLAYING ──app_background──▶ BACKGROUND ──app_foreground──▶ PLAYING          │
   PLAYING ──focus_loss/call_started──▶ INTERRUPTED ──focus_gain/call_ended──▶ PLAYING
   PLAYING/PAUSED ──focus_duck──▶ DUCKED ──focus_gain──▶ PLAYING
   (cualquiera) ──error──▶ ERROR ──user_play/system_play──▶ INITIALIZING
```

- **Invariante:** ningún evento UI (menú, scroll, resize, orientación, HUD) está en la tabla → no puede transicionar el audio (test dedicado `AudioState: máquina central`).
- **`isAudible` = PLAYING | BACKGROUND | DUCKED | INITIALIZING.** Un lock legítimo = PLAYING → BACKGROUND (sigue sonando); NO se detiene.

### 2.2 Ciclo de vida (`src/core/lifecycle.js`)

```
FOREGROUND ──visibility:hidden + playing──▶ AUDIO_RUNNING_BACKGROUND ──ctx suspended──▶ AUDIO_SUSPENDED
     ▲                                            │  ▲                                        │
     │ visibility:visible                         │  │ ctx running                            │ visibility:visible
     └────────────── RETURNING ◀──────────────────┘  └───────────────────────────────────────┘
                     │  resume(ok) → FOREGROUND / resume(!ok) → AUDIO_SUSPENDED
```

### 2.3 Pipeline real del sonido

```
BinauralEngine:  [L osc base] [R osc base+beat] ─▶ masterGain ─▶ compressor ─▶ analyser ─▶ transport
   (condición: binaural|pure-tone|AM|noise|none)                                    │
                                     ┌──────────────────────────────────────────────┤
                               'element' (Android/desktop)                     'direct' (iOS fallback)
                              MediaStreamDestination ─▶ <audio srcObject>       ctx.destination
                              (el <audio> real es la reproducción ante el SO)  (+ ancla muda legacy)
```

**APK (doble motor controlado):** el servicio nativo (`BinauralToneEngine`, AudioTrack) sostiene el sonido; el motor web corre pero con `masterGain = 0` **y valores programados cancelados** (`syncNativeAudioStart`). Invariante verificado en runtime: `assertSingleAudioProvider()` — nativo activo ⇒ web muda.

---

## 3. HIPÓTESIS CAUSAL — "dos frecuencias/acoplamiento al primer lock/unlock"

> Diagnóstico por análisis de código (la instrumentación para confirmación en vivo ya existe y está documentada en §5). Ordenadas por probabilidad.

### M1 — Rampa programada pisa el silencio web en la APK (la más probable)
- **Código:** `restoreFromBackground()` (main.js, rama nativa) hace `audio.masterGain.gain.value = 0` **sin** `cancelScheduledValues(now)`.
- **Por qué importa:** `syncNativeAudioStart()` documenta exactamente este bug ("el ramp programado por el motor web pisa el 0 y la web suena al 60% con el nativo") y lo arregla cancelando valores programados. Pero `restoreFromBackground` (que corre en CADA unlock con APK) **no** lo hace: si el watchdog (`recoverFade`) o un `setVolume` dejó un `linearRampToValueAtTime` pendiente, el motor web reanuda audible → **dos motores sonando = batido/acoplamiento**.
- **Explica "desaparece la segunda vez":** en el primer ciclo quedan ramps residuales del fade-in inicial (1.2 s) o del watchdog; al consumirse, los ciclos siguientes ya no tienen valores programados pendientes.

### M2 — Ventana de doble pipeline en `BinauralEngine.start()` (hasta ~1.1 s)
- **Código:** `start()` → `stopInstant()` → `stop(false)` **programa** `n.stop(); n.disconnect()` en `setTimeout(…, 80 ms)`; con `stop(true)` (UI pause→play) son 1100 ms. Los nodos viejos NO se detienen sincrónicamente.
- Si `start()` corre con `_playing=true` (p. ej. `vyneural:audioplayback` "playing" con `playing=false` pero fuentes web aún vivas tras `pauseUiOnly()`, o un play del sistema), las fuentes viejas y nuevas coexisten durante la ventana → dos conjuntos de tonos mezclados en `masterGain` (subiendo de rampa) → "dos frecuencias" que se desvanecen al desconectarse los nodos viejos.
- **No hay test que cubra esto** (ver §6, GAP-1).

### M3 — 5+ disparadores de `restoreFromBackground` en un mismo unlock
- `visibilitychange`, `pageshow`, `focus`, `resume` (page lifecycle), `pointerdown` (si suspendido) + `setTimeout` de fullscreen. La mayoría son idempotentes (`if (!playing) return`, máquinas rechazan transiciones inválidas), pero cada uno **re-crea MediaMetadata y re-rampa la ganancia** → micro-transientes de ganancia y doble `updateMediaSession()`. No es un segundo pipeline, pero es la "interferencia con interacción UI" que ya se mitigó parcialmente (P2 Fase 11: pointerdown solo si `suspended`).

### M4 — Reafirmación del `<audio>` del transporte contra el servicio nativo
- En la APK, la WebView tiene su propio `<audio>` (elemento del transporte web, mudo por masterGain) que **además** pide audio focus (`org.chromium…AudioFocusDelegate` — observado en `dumpsys audio` del emulador). Al volver de background, `reaffirm()` re-playea el elemento; si M1 no se corrige, eso re-anima la vía web completa.

### M5 — (descartada como causa primaria) doble `AudioContext`
- `BinauralEngine.ensure()` es idempotente (`if (!this.ctx)`) y el contexto se crea una sola vez. No hay código que cree dos `AudioContext`. La duplicación sería de *fuentes*, no de contextos (M2).

**Conclusión:** la causa más probable del síntoma reportado es **M1 + M2 en conjunto**: rampas web pendientes que reaniman el motor web al volver (APK) y ventanas de solapamiento de fuentes al re-crear un pipeline. Ambas son de la **capa de plataforma/sesión**, no del core — corregibles sin tocar `audio.js`/`simulation.js`.

---

## 4. MATRIZ REAL WEB / PWA / APK

Leyenda: ✅ implementado+verificado · 🟡 implementado con limitación documentada · ❌ no implementado · ⚠️ requiere hardware no disponible.

| Capacidad | WEB | PWA | APK |
|---|---|---|---|
| Notifications API | ✅ `Notification` (permiso real) | ✅ vía SW `showNotification` | ✅ `NotificationManager` + 2 canales |
| Push remoto | ❌ `push.configured=false` | ❌ (handler SW listo, sin backend) | ❌ (no FCM) |
| Notificación local (app abierta) | ✅ | ✅ | ✅ |
| Notificación con app cerrada | ❌ (limitación navegador) | 🟡 solo con Push/backend | ✅ AlarmManager + BootReceiver |
| Permission notification | ✅ bajo demanda | ✅ bajo demanda | ✅ `POST_NOTIFICATIONS` bajo demanda, estados honestos |
| Exact alarms | ❌ N/A | ❌ N/A | ✅ `setExactAndAllowWhileIdle` si concedido; si no, window 60 s (honesto) |
| Audio background | 🟡 (pestaña viva, transporte element) | 🟡 (igual que web + instalada) | ✅ Foreground Service mediaPlayback |
| Audio con pantalla bloqueada | 🟡 Android: sí (element) / iOS: suspende (duck+recovery) | 🟡 igual; PWA iOS sí con controls | ✅ verificado en emulador (posición avanza) |
| Media Session (web) | ✅ handlers play/pause/stop/prev/next/seek | ✅ | N/A en WebView (se usa la NATIVA) |
| Media Session (nativa) | N/A | N/A | ✅ `MediaSession("Vyneural")` + notif transport + lock screen |
| Lock-screen controls | 🟡 (Android con element) | 🟡 | ✅ play/pause/stop, verificado |
| Play/Pause/Stop desde el sistema | 🟡 vía MediaSession | 🟡 | ✅ verificado `cmd media_session dispatch` |
| Foreground Service | N/A | N/A | ✅ `types=MEDIA_PLAYBACK`, START_STICKY |
| Canal de notificación | N/A | N/A | ✅ `bineural_player` (LOW) + `bineural_alarms` (HIGH) |
| Permisos nativos | N/A | N/A | ✅ solo bajo demanda |
| Alarmas exactas | ❌ | ❌ | ✅ AlarmManager |
| Servicio persistente | N/A | N/A | ✅ sobrevive lock/minimizar; reboot → BootReceiver |
| ICS / calendario | ✅ descarga .ics + Google Calendar URL | ✅ idem | ✅ SAVE_ICS a Descargas (bridge) |
| Persistencia sesiones | ✅ localStorage + IndexedDB (alarmas) | ✅ idem | ✅ SharedPreferences (alarmas) + web |
| Detección de plataforma | ✅ `android-browser` ≠ APK | ✅ `standalone` → PWA | ✅ bridge handshake real |

**Estados separados (nunca TRUE/FALSE):** cada capacidad distingue `supported` / `granted` / `active` / `configured` — verificado en `mergePlatformCapabilities()`, `getPlatformInfo()` (Kotlin) y tests (§2/§8/§10, §14).

---

## 5. INSTRUMENTACIÓN EXISTENTE (para confirmar M1–M4 en vivo)

| Hook | Qué expone | Cómo usarlo para la causa raíz |
|---|---|---|
| `window.__audioProbe()` | `ctx.state`, `oscillatorCount`, `gain`, `rms`, `currentTime`, transporte | **Si `oscillatorCount` salta a 4+ al desbloquear → M2 confirmado** (doble set de fuentes). Si `gain` sube >0 en APK → M1 confirmado |
| `window.__interferenceLog` | eventos ctx/visibility/focus/playback/fullscreen con `audioTime` | Reconstruir la secuencia exacta del primer unlock |
| `window.__audioState.summary()` | estado + última transición con fuente y razón | Ver si el unlock genera transiciones de más |
| `window.__lifecycle.summary()` | estado del ciclo de vida | Distinguir AUDIO_RUNNING_BACKGROUND vs AUDIO_SUSPENDED |
| `window.__sessionLog` | integridad de sesión, interrupciones (cap 1000) | Medir la exposición real vs interrupciones |
| `window.__uiAudioGuard` | eventos UI que cambiaron audio | Descartar/confirmar M3 por interacción |
| `window.__platformProbe()` / `/diagnostico` | matriz completa por plataforma | Estado honesto por runtime |
| Kotlin `Diagnostics` | focus, lifecycle, audioActive, mediaSession | Cruzar con lo que reporta el JS |

**Protocolo de confirmación propuesto (P1):** en el emulador, sesión activa → lock → unlock → leer `oscillatorCount` + `gain` + `__interferenceLog` en los 3 s posteriores. Esperado si la causa es M1/M2: `oscillatorCount` > 2 o `gain` > 0 en la ventana posterior al unlock, con evento `ctx`/`focus` previo.

---

## 6. GAPS DE COBERTURA Y RIESGOS

> **Actualización (P1, mismo día):** GAP-1 y GAP-2 quedaron **CERRADOS** (ver `P1_AUDIO_FORENSIC_REPORT.md`): `start()` idempotente + teardown síncrono, política de cancelación de automation, RestoreGate con máquina de estados, y 7 tests de regresión + reproducción forense en emulador. GAP-3 cubierto por el test `lock_unlock_no_duplicate_pipeline` (START→LOCK→UNLOCK ×3).
4. **Riesgo arquitectónico:** `main.js` concentra toda la orquestación (3920 líneas). La capa de sesión (AudioSessionManager del prompt maestro) no existe como clase única: hoy son varias máquinas puras coordinadas por main.js. No es un bug, pero P1 debería consolidar la coordinación (start idempotente, dedupe de eventos) en un módulo testeable.
5. **Riesgo honesto:** `BinauralToneEngine` nativo usa rampa de frecuencias por factor 0.05 por bloque (no rampa temporal exacta como la web) → frecuencias transitoriamente distintas entre web y nativo durante un retune. No audible en pruebas pero es una diferencia de modelo documentada.

---

## 7. ESTADO POR ÁREA (P0 gate)

| Área | Estado | Evidencia |
|---|---|---|
| CORE INTEGRITY | ✅ **PASS** | 5 archivos core: 0 diffs vs HEAD |
| Separación de capas | ✅ PASS | core sin acceso a APIs de plataforma (verificado por inspección) |
| Audio lifecycle | ✅ PASS (parcial) | máquinas puras + 82 tests; M1/M2 sin test (GAP-1/2) |
| No duplicación de audio | 🟡 **CONDITIONAL** | invariante runtime OK; ventana M2 sin cobertura |
| Permisos | ✅ PASS | reales, bajo demanda, estados honestos (web + Kotlin) |
| Notificaciones | ✅ PASS | providers separados, push honesto, 2 canales nativos |
| Alarmas | ✅ PASS | web (multi-tab, IndexedDB) + APK (AlarmManager, reboot) |
| ICS | ✅ PASS | RFC básico (UID/DTSTAMP/DTSTART/DTEND/SUMMARY/DESC), 3 vías de guardado |
| Media Session | ✅ PASS | web handlers + nativa real, nunca falsificada |
| Bridge | ✅ PASS | whitelist 22 comandos, payload validado, fallback NOT_SUPPORTED, aislamiento de fallos |
| Lifecycle listeners | 🟡 PASS con observación | 5 vías de restore en unlock (M3): idempotentes pero redundantes |
| Testing | ✅ 82/82 PASS | ver §6 por gaps |
| Build | ✅ PASS | `vite build` limpio; APK instalable validada en API 34 |

**P0 STATUS: PASS** (GAP-1/GAP-2 cerrados por P1 — ver `P1_AUDIO_FORENSIC_REPORT.md`). La hipótesis M1/M2 quedó confirmada como causa y eliminada; sin evidencia de que el problema estuviera en el core.

## 8. RECOMENDACIONES P1 (orden de prioridad)

1. Escribir los tests que faltan: `start()` doble → fuentes viejas desconectadas ANTES de crear nuevas (o sin solape audible); rama nativa de restore → `cancelScheduledValues` antes del 0.
2. Aplicar el fix mínimo (capa de plataforma, no core): en `restoreFromBackground()` rama nativa, replicar `cancelScheduledValues(now) + setValueAtTime(0, now)` (como ya hace `syncNativeAudioStart`).
3. Consolidar un `AudioSessionManager` testeable (start/pause/resume/stop idempotentes + dedupe de eventos de unlock) sin cambiar el core — main.js solo lo alimenta.
4. Confirmación en vivo del diagnóstico con la instrumentación de §5 en el emulador (protocolo listo).

---
*Ver: `P2_VALIDATION_REPORT.md`, `PLATFORM_CAPABILITY_MATRIX.md`, `AUDIO_LIFECYCLE_REPORT.md`, `TEST_MATRIX.md`.*
