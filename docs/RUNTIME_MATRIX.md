# P5.7 — Matriz destructiva REAL en emulador (evidencia física)

> **Estado**: P5.7 EJECUTADO — Android 14 (API 34), AVD `vyneural-test`, APK debug
> con el código congelado de P5.6 (112/112 en Node y navegador).
> Fecha: 2026-08-16 · Dispositivo: `emulator-5554` (1080×2340, dpr 2.75).

Método de evidencia (todo timestamped y verificable):

| Fuente | Qué demuestra |
| --- | --- |
| `adb shell dumpsys media_session` | nº de MediaSessions, playbackState, active |
| `adb shell dumpsys audio` | AudioFocus (gain/loss), AudioTracks activos |
| `adb shell dumpsys activity services` | servicio vivo, `startId`, foreground |
| `adb shell dumpsys notification` | notificaciones (ids/channels) |
| `DiagnosticsActivity` (uiautomator) | traza causal nativa (`Diagnostics.trace`) |
| CDP (`scripts/cdp.js`) al WebView | audioState, gain/RMS del motor web, causalLog JS |
| `adb logcat` | cadena de eventos del sistema (FGS, focus, media) |

---

## T1 — Idle torture test: **PASS**

Secuencia con la APK recién abierta **sin darle PLAY**:

```
OPEN + WAIT 30s → LOCK(8s) → UNLOCK → BACK (cierra app) → reabrir →
HOME → FOREGROUND → am kill + reabrir (muerte de proceso + recreación de
Activity + page load) → menú ☰ abrir/cerrar → cambiar estado (Meditación →
Intuición) → cambiar onda (Cimática, tap real) → volumen (drag real) →
fullscreen → historial → WAIT 10s
```

Resultado en TODOS los puntos:

```
nativePlaying = false      (no hay AudioForegroundService en dumpsys)
webPlaying    = false      (__audioProbe(): ctx=null, transport=null)
webGain       = 0
sid/gen       = 0          (Service generation: 0)
START count   = 0          (CAUSAL TRACE vacía)
MediaSession  = INACTIVE
Focus         = NONE
```

**Cero START en toda la secuencia.** Un solo START aquí = P0; no ocurrió.

---

## T2 — PLAY → destrucción: **PASS**

```
PLAY (tap real "Comenzar sesión") → LOCK(10s) → UNLOCK → HOME(8s) →
FOREGROUND → Activity destroy+recreate (--activity-clear-task, mismo PID)
```

| Momento | Evidencia |
| --- | --- |
| PLAY | `startId=3` (= 1×START + 1×WAVE + 1×VOLUME config); `startForegroundCount=1`; MediaSession `PLAYING`; focus `GAIN`; web `gain=0` (motor mudo) |
| LOCK | `isForeground=true`, `startId=3`, MediaSession `PLAYING` — sin START nuevo |
| UNLOCK | `startId=3`, sigue `PLAYING` |
| HOME 8s | `isForeground=true` (FGS sostiene el audio), MediaSession `PLAYING` |
| FOREGROUND | `startId=3` — sin START nuevo |
| Recreate Activity (clear-task, mismo PID 22009) | `startId=3`, MediaSession `PLAYING`, `sessionId=1` (web) — la recreación NO crea sesión nueva |

**Cadena nativa en logcat** (un solo START, causa exacta del primer PLAY):

```
04:31:53.550  Background started FGS ... intent: action.START (has extras)
04:31:53.989  MediaSessionStack: addSession ... com.vyneural.bineural/Vyneural
04:31:54.147  MediaFocusControl: requestAudioFocus() ... AudioFocusHelper
04:31:54.183  [audio-focus] request granted (res=1)
04:31:54.288  Media button session is changed to com.vyneural.bineural/Vyneural
```

**Traza causal nativa (DiagnosticsActivity)** de la última sesión:

```
[04:55:02.275] gen=0 [config] RETUNE dropped: servicio no activo (config nunca revive audio)
[04:55:40.862] gen=1 [service] created generation=1
[04:55:41.120] gen=1 [cmd] START startId=1 before{running=false shouldPlay=false media=stopped focus=NONE}
[04:55:41.172] gen=1 [focus] GAIN {running=false shouldPlay=true ...}
[04:55:41.483] gen=1 [cmd] START done{startId=1 running=true shouldPlay=true media=playing focus=GAIN}
[04:55:41.713] gen=1 [cmd] WAVE startId=2 ...   (config tras start)
[04:55:41.841] gen=1 [cmd] VOLUME startId=3 ... (config tras start)
[04:56:02.957] gen=1 [media] MEDIA_STOP before{running=true}
```

El primer PLAY es `START startId=1`; todo lo demás es config o el STOP explícito.

---

## T3 — STOP absoluta: **PASS**

```
PLAY → PAUSE (media key PLAY_PAUSE) → STOP (media key MEDIA_STOP) →
LOCK → UNLOCK → HOME → FOREGROUND → WAIT 30s
```

| Después de STOP | Evidencia |
| --- | --- |
| Servicio | DESTRUIDO (no aparece en dumpsys) |
| MediaSession | retirada del stack |
| Tras LOCK/UNLOCK/HOME/FG + 30s | sin servicio, sin MediaSession, sin focus, JS `STOPPED` con `provider=none` |

**START_AFTER_STOP = 0.** La pausa del sistema dejó la MediaSession en `PAUSED`
(servicio foreground, correcto) y el STOP la destruyó por completo.

---

## T4 — Audio Focus adversarial: **PASS**

El emulador no tiene un segundo reproductor funcional (YouTube Music no
reproduce sin login), así que el plano físico se probó **inyectando por CDP los
eventos exactos que el bridge nativo empuja al JS** (`vyneural:audiofocus`), y
el plano nativo se verificó **estáticamente** sobre el código del servicio
(leído completo: `handleFocusChange`, `scheduleFocusReacquire`, `shouldPlay`).

### JS (inyección real del payload del bridge)

| Secuencia | Estado |
| --- | --- |
| PLAY → `LOSS` | `PLAYING → INTERRUPTED` ✓ |
| `INTERRUPTED` → `GAIN` | `→ PLAYING` ✓ |
| PAUSE (media key) → `GAIN` | queda `PAUSED` — **GAIN no convierte pausa en play** ✓ |
| STOP (media key) → `GAIN` | queda `STOPPED` — **GAIN después de STOP jamás produce PLAY** ✓ |

### Nativo (prueba estática, regla de oro)

```kotlin
"LOSS","LOSS_TRANSIENT" -> if (shouldPlay && running) pausar motor (pushToJs=false) + watchdog
"UNKNOWN"               -> contar + pausa defensiva + watchdog
"GAIN"                  -> if (shouldPlay) engine.resume()   // PAUSE/STOP ponen shouldPlay=false → no-op
"DUCK"                  -> engine.duck() (foco sigue held)
watchdog                -> if (!shouldPlay) return           // nunca re-dispara tras pause/stop
```

**Límite honesto**: no se pudo producir un LOSS físico real (segunda app
reproduciendo) en este emulador. La prueba de foco a nivel de servicio queda
pendiente en hardware real (criterio del informe).

---

## T5 — Crash / process death: **PASS**

| Escenario | Tras kill + reabrir |
| --- | --- |
| PLAY → `force-stop` → reabrir | sin servicio, sin MediaSession, sin focus, JS `IDLE`/`ctx:null` — **no se restaura el PLAY** |
| PAUSE → `force-stop` → reabrir | sin servicio, sin MediaSession — **PAUSE persistido no se interpreta como permiso para reproducir** |
| STOP → `force-stop` → reabrir | sin servicio, sin MediaSession — idem |

`START_NOT_STICKY` confirmado: el servicio NO se recrea tras la muerte del
proceso y ningún `shouldPlay` persistido se convierte en `engine.start()`.

---

## T6 — Alarmas: **PASS**

### APK abierta (sesión reproduciendo)

```
scheduleAlarm(al-1, T+120s) → la alarma dispara con la app abierta
```

- Notificación de alarma publicada (id=2001, canal `bineural_alarms_v2`).
- Notificación del player intacta (id=1001).
- **La sesión siguió PLAYING sin interrupción** — la alarma no toca el audio.
- Sin doble alarma (una sola notificación; el scheduler web está marcado
  `external` y nunca dispara en paralelo — verificado estáticamente).

### APK cerrada (proceso en background/kill, sin actividad)

```
scheduleAlarm(al-3, T+90s) → HOME + am kill → la alarma dispara
```

- Notificación de alarma publicada (id=2001) aunque la app no está abierta.
- **Audio START = 0**: sin AudioForegroundService, sin MediaSession, sin focus.

> ⚠️ Nota de plataforma documentada: `am force-stop` NO es una simulación válida
> de "app cerrada" — Android bloquea los broadcasts a paquetes force-stopped
> (estado STOPPED) hasta la próxima apertura manual. El cierre real de usuario
> (swipe de recents, kill por el SO) sí entrega la alarma, como se demostró con
> `am kill`/background. Es comportamiento de Android, no un bug de la app.

---

## T7 — Ownership (sesión reproduciendo): **PASS**

| Aspecto | Evidencia |
| --- | --- |
| MediaSession | **1 única** sesión `Vyneural` en el stack (grep = 1) |
| Audio Focus | `gain: GAIN, loss: none` (servicio nativo) |
| Audio real | `dumpsys audio` → **exactamente 1 AudioTrack activo** (`piid:943 state:started u/pid:10200`) = motor nativo; la WebView NO tiene track |
| Web audio | `gain=0, rms=0` (motor mudo estructural P5.6), 2 osciladores solo para visualizador |
| Notificación | 1 player (id=1001, canal `bineural_player`) |
| Servicio | `isForeground=true`, `startId=3` |

---

## T8 — 100 cambios durante PLAY: **PASS**

```
PLAY → condición ×25 + onda ×25 + volumen ×25 + estado ×25
       (intercalando LOCK/UNLOCK)
```

| Invariante | Resultado |
| --- | --- |
| audioState | `PLAYING` todo el tiempo |
| WebGain | **0** en todo momento (frontera C2/H2: ningún setCondition/setWave/setVolume/fade des-enmudece) |
| sessionId web | estable (2 = PLAY inicial + 1 resync del reload; sin saltos por condición) |
| MediaSession | 1 única, `PLAYING` |
| `startId` | 3 → 53 → 78: **cada comando de config infla startId** (ver hallazgo P3-2) — pero `engine.start()` NO se re-ejecuta (los +25 de estado confirman que los RETUNE de `selectState` (H1) llegan al nativo) |

---

## T9 — Idempotencia: **PASS**

| Secuencia | Resultado |
| --- | --- |
| PLAY → MEDIA_PLAY ×2 | `startId` estable (3), sigue `PLAYING` — play duplicado = no-op |
| PAUSE ×2 | `PAUSED`, `startId` estable |
| PLAY (resume) | `PLAYING`, `startId` estable — **resume no crea START** |
| STOP → RETUNE | RETUNE con servicio muerto: bridge OK, **no se crea servicio** |

---

## T10 — H1 runtime (RETUNE ≠ START): **PASS**

Con el servicio inexistente: `retuneBackgroundAudio()` → respuesta OK del bridge
pero **no se crea el servicio, no hay MediaSession, JS queda IDLE/ctx:null**.
Guard `serviceAlive` confirmado en runtime (y trazado en el anillo nativo:
`[config] RETUNE dropped: servicio no activo`).

---

## Hallazgos nuevos (ninguno bloqueante)

| ID | Sev | Archivo | Descripción |
| --- | --- | --- | --- |
| R1 | 🟠 P3 | `src/main.js` (`syncUiWithNativeSession`) | Tras recargar el WebView con sesión nativa activa, la máquina queda en `INITIALIZING` (hace `system_play` pero nunca `started`; el servicio no re-emite "playing" en page load). Solo cosmético (HUD/diagnóstico); el audio y el nativo no se afectan. Fix: transicionar `started` tras el resync, o que MainActivity empuje el playbackState al cargar la página. |
| R2 | 🟠 P3 | `src/main.js` (`syncNativeAudioStart`/bridge) | Chattiness de config: cada tick de volumen, clic de onda y cambio de estado entrega un `startService` nativo sin debounce/batching → `startId` se infla (3→78 en T8). No crea reproducción (nunca re-llama `engine.start()`), pero infla el id usado para detectar START duplicados y despierta `onStartCommand` repetidamente. Fix: batch/coalescer (enviar en `change`/`pointerup`, no por tick; o un solo comando FREQ combinado). |
| R3 | 🟡 P4 | `Diagnostics.kt` | `focusState` queda en `GAIN` tras un STOP (el abandon no resetea la etiqueta). Solo visual. |
| R4 | 🟡 P4 | `Diagnostics.kt` | "Channel alarms: NO" aunque el canal real es `bineural_alarms_v2` (comprueba un nombre legacy). Solo visual. |

---

## Criterio de cierre (P5.7)

| Criterio | Estado |
| --- | --- |
| Idle torture = PASS | ✅ |
| 100-cycle lifecycle (T8) = PASS | ✅ |
| AudioFocus matrix (T4) = PASS | ✅ (JS físico + nativo estático; LOSS físico pendiente hardware) |
| STOP persistence (T3) = PASS | ✅ |
| Process death (T5) = PASS | ✅ |
| Alarm closed-app (T6) = PASS | ✅ |
| Alarm reboot | ⏳ pendiente (requiere reiniciar el emulador; BootReceiver re-programa — verificado estáticamente) |
| MediaSession uniqueness (T7) = PASS | ✅ |
| Notification uniqueness (T7/T6) = PASS | ✅ |
| `dumpsys audio` single track (T7) = PASS | ✅ |
| **Spontaneous PLAY = 0** | ✅ (0 START sin causa explícita en TODA la matriz) |

**Veredicto**: `P5 — CODE PASS / RUNTIME PASS (emulador) / RELEASE PENDING (hardware)`.
Los hallazgos R1–R4 no bloquean audio ni ownership; se recomienda corregir R1 y
R2 antes de release. Pendiente físico en hardware real: LOSS real por segunda
app, alarma tras reboot, Bluetooth, llamada entrante, y la instalación de la APK

---

## P5.8 — Re-ejecución tras fixes R1/R2/F2 (2026-08-16)

La auditoría fresca (docs/FORENSIC_AUDIT.md §P5.8) encontró UN camino nuevo de
autoactivación (F2: el mixer de ambiente llamaba `start()` sin sesión) y se
corrigieron R1 y R2. Esta sección re-ejecuta la matriz sobre la APK debug
nueva (misma AVD `vyneural-test`, Android 14).

### Evidencia (timestamped, adb + CDP)

| Verificación | Evidencia | Resultado |
| --- | --- | --- |
| T2 — PLAY → destrucción (R1) | `am start --activity-clear-task` con sesión nativa activa → `__audioState.state` | **PLAYING** (antes INITIALIZING) — `lastStartId=3` estable |
| T8 — 100 cambios durante PLAY (R2) | 25×vol + 25×onda + 25×condición + 25×estado por handlers reales → `__nativeCmdCoalescer.sent()` | **level:1 · wave:1 · retune:1** (antes 75) — `lastStartId` 3→**6** (antes →78) — gain 0, sid 1, PLAYING |
| T9 — Idempotencia | `cmd media_session dispatch` play×2/pause×2/play | **lastStartId 6 estable**, PLAYING |
| H1 — RETUNE sin servicio | `RETUNE_BACKGROUND_AUDIO` con servicio muerto → dumpsys | **0 servicios, 0 MediaSessions**, JS STOPPED, sin PLAY en causal |
| F2 — ambiente sin sesión (APK) | click en `.ambient-btn` lluvia con sesión detenida → estado + dumpsys | **STOPPED, 0 servicios**, sin entradas causales nuevas (en web: IDLE, ctx null, toast "toca play") |
| STOP absoluta + lock/unlock | keyevent 26/82 → dumpsys + CDP | **0 servicios, 0 sesiones**, causal intacta (10) |

**Spontaneous PLAY = 0** en toda la re-ejecución.

**Veredicto**: `P5.8 — CODE PASS / RUNTIME PASS (emulador) / RELEASE PENDING
(hardware)`. APK release firmada generada con los fixes (SHA-256
`c8b8483dba91ef73993f5d25ab6c776d774da07a3c56d7058e1278f6feb6608a`, servida en
`/vyneural.apk`). Pendiente: matriz física G1–G6 en dispositivo real
(docs/HARDWARE_CHECKLIST.md).
en dispositivo físico (no emulador).
