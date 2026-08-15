# P2 — MEDIA SESSION / AUDIO FOCUS / NOTIFICATION FORENSIC

**Fecha:** 2026-08-15 · **Entorno:** emulador Android 14 (API 34, AVD `vyneural-test`), APK debug con los fixes, CDP sobre la WebView + dumpsys del sistema.

**Regla P0:** `cymatics.js`, `wavefield.js`, `simulation.js`, `experiments.js` **intactos** (verificado vs HEAD). P2 trabajó solo en lifecycle de audio, MediaSession, focus, notificaciones, alarmas, bridge, WebView e ICS.

---

## 1. ARQUITECTURA FINAL (quién posee cada recurso)

```
SESIÓN LÓGICA (1 por play de usuario)
   │
   ├── PIPELINE DE AUDIO (I1/I4)
   │     WEB/PWA: BinauralEngine → masterGain → compressor → analyser → transporte element/direct
   │     APK:     servicio nativo BinauralToneEngine (AudioTrack) = ÚNICA fuente audible
   │              motor web corre mudo (gain=0 con cancel de automation) SOLO para el visualizador
   │
   ├── MEDIA SESSION (I2/I3) — UN propietario
   │     WEB/PWA: navigator.mediaSession (handlers registrados UNA vez, main.js)
   │     APK:     MediaSession("Vyneural") nativa (AudioForegroundService) — la WebView ya NO reclama
   │
   ├── NOTIFICACIÓN (I5) — UN propietario
   │     WEB/PWA: NotificationManager web (SW → local), nunca auto-start de audio
   │     APK:     NotificationHelper nativa (bineural_player id=1001, MediaStyle) + alarmas (id=2001)
   │
   ├── ALARMA (I6) — UN propietario
   │     WEB/PWA: AlarmManager web (multi-tab, IndexedDB, honesto: solo pestaña viva)
   │     APK:     AlarmManager NATIVO (SO) — el scheduler web conserva la alarma como `external`
   │              (lista de UI) y JAMÁS dispara en paralelo
   │
   ├── AUDIO FOCUS (informa; no crea sesión)
   │     APK: AudioFocusHelper (GAIN/LOSS/LOSS_TRANSIENT/DUCK) + watchdog de re-adquisición
   │
   └── ICS (evento calendario; sin responsabilidad de audio)
         WEB/PWA: descarga .ics / Google Calendar · APK: SAVE_ICS a Descargas
```

**Regla de oro mantenida:** MediaSession controla, no crea · Notification representa, no crea · AudioFocus informa, no crea · Alarm programa, no controla · ICS representa un evento, no toca MediaSession.

## 2. OWNER POR RECURSO (FASE 1 — inventario respondido)

| Pregunta | Respuesta |
|---|---|
| 1. ¿Quién crea la Media Session? | **Web/PWA:** el navegador, reclamada por el `<audio>` real (transporte element). **APK:** `AudioForegroundService.onCreate()` → `MediaSession("Vyneural")`. |
| 2. ¿Quién modifica metadata? | **Web/PWA:** `updateMediaSession()` (main.js). **APK:** `setSessionPlaying()` (Kotlin). |
| 3. ¿Quién registra handlers? | **Web/PWA:** bloque único de `setActionHandler` en main.js (una vez). **APK:** `MediaSession.Callback` (onPlay/onPause/onStop). |
| 4. ¿Quién cambia playbackState? | Sólo las máquinas: web `audioState` / nativa `setSessionPlaying`. Ninguna UI inventa estado. |
| 5. ¿Quién reproduce audio? | **Web/PWA:** BinauralEngine. **APK:** servicio nativo (única vía audible). |
| 6/7. ¿Quién pausa/restaura? | Sincronización bidireccional: SO → `vyneural:audioplayback`/`audiofocus` → JS; JS → bridge `PAUSE/RESUME/STOP`. |
| 8/9. ¿Quién crea notificación/alarma? | Ver §1 (propietario único por plataforma). |
| 10. ¿Quién comunica WebView↔Android? | `AndroidBridge` (whitelist 22 comandos) + eventos `vyneural:*`. |
| 11. ¿Existe más de un propietario? | **ANTES de P2: SÍ** (MediaSession doble y alarmas sin cablear). **DESPUÉS: no** (ver §7/§8). |

## 3. LIFECYCLE (FASE 3/4 — secuencia real observada)

```
START (UI) ─▶ foco GAIN + MediaSession PLAYING + servicio foreground (sid=1, live=[1,2])
LOCK       ─▶ visibility:hidden · wakelock released · servicio sigue isForeground · audio nativo sigue
UNLOCK     ─▶ visibility:visible · Chromium reclama focus (quirk WebView) → LOSS temporal → MediaSession
               PAUSED honesta · watchdog re-adquiere (≤5 s) → GAIN → reanuda el MISMO motor (sid=1)
STOP       ─▶ focus abandon · motor detenido · servicio fuera · MediaSession eliminada
```

**Primer lock (LOCK #1) vs #2 vs #3 — IDÉNTICOS:** `sid=1`, `live=[1,2]`, `gain=0`, `pendingTeardown=0` en los tres. El "primer lock crítico" ya no difiere de los siguientes (P1 eliminó la causa M1/M2; P2 eliminó el bucle de focus).

## 4. RESULTADOS CLAVE

- **MediaSession única en el SO**: `dumpsys media_session` muestra SOLO `Vyneural` (antes: 2 sesiones, nativa + Chromium/WebView).
- **Notificación única**: exactamente 1 player (`id=1001`, MediaStyle, category=transport) durante la sesión; desaparece al stop.
- **Focus defensivo**: LOSS tras unlock se recupera solo (watchdog) sin reiniciar la sesión.
- **Sin bucle de sesión**: `sid` estable en 3 lock/unlock (antes del fix: sid crecía 1→5→14→21→24 por el bucle pause→play).
- **95/95 tests · build OK · core protegido.**

## 4b. ENDURECIMIENTO UNKNOWN + POLÍTICA DE FOCUS (dictamen de revisión)

El dictamen de revisión exigía cerrar el estado `UNKNOWN` del Audio Focus antes del cierre lógico. Implementado en 4 puntos:

| Punto del dictamen | Implementación | Evidencia |
|---|---|---|
| **1. UNKNOWN → estado seguro y recuperable** | `AudioFocusHelper`: el callback no reconocido queda **visible como `UNKNOWN`** en `Diagnostics.focusState` (nunca transformado en pérdida genérica silenciosa); `held=false`; `AudioForegroundService.handleFocusChange("UNKNOWN")` entra en la MISMA política defensiva que LOSS (pausa + watchdog con backoff) y registra **CRITICAL** en el log forense | Contrato puro `src/core/audio-focus-policy.js` + test `P2 focus: UNKNOWN es estado explícito y recuperable` |
| **2. `held` es la autoridad del watchdog, no `Diagnostics`** | `request()` ahora usa `if (held) return` (estado operacional), no `focusState == "GAIN"` (observabilidad): un callback perdido con `focusState=GAIN` y `held=false` igual re-solicita | Test `P2 focus: held es la autoridad del watchdog, NO la observabilidad` (cubre el caso `held=false + GAIN` → re-solicitar) |
| **3. DUCK no pierde el foco** | `LOSS_TRANSIENT_CAN_DUCK` → `held=true` (solo baja volumen con `engine.duck(true)`); el watchdog no intenta re-adquirir un foco que ya poseemos | Test `P2 focus: DUCK mantiene held=true` |
| **4. Cadena completa de alarma nativa** | Decisión pura `alarmOwnerForPlatform(platformKind, bridge)` en `alarm-manager.js`, usada por `scheduleNativeAlarm()` en `main.js`: APK con bridge → dueño nativo; Chrome Android/Web/PWA → dueño web (nunca nativo, P16-3) | Test `P2 I6: dueño de alarma por plataforma`; la cadena nativa completa (UI→bridge→AlarmScheduler→PendingIntent→AlarmReceiver→NotificationHelper) queda **etiquetada como integración**, cubierta por evidencia de emulador (P2 previo: `SCHEDULE_ALARM` → notificación real disparada) y por la re-validación de esta sesión |

**Verificación en vivo post-endurecimiento** (APK reconstruida, emulador Android 14): 3 ciclos lock/unlock con `sid=1` estable, `live=[1,2]`, `pending=0`, gate `SETTLED`; lock/unlock REAL del SO → `INTERRUPTED → PLAYING` por `focus_gain` (watchdog recuperó el foco y reanudó el MISMO motor); única MediaSession PLAYING con posición avanzando; stop → 0 servicios, 0 notificaciones.

## 5. LOGS FORENSES (FASE 13 — extraídos de `__interferenceLog` + dumpsys)

```
provider:NATIVE · ctx:running · wakelock:acquired · focus:GAIN@0.82 · playback:playing@0.82   [START]
wakelock:released · visibility:hidden@12.9                                                    [LOCK]
visibility:visible@18.07 · wakelock:acquired · focus:LOSS@18.35                               [UNLOCK]
(focus re-adquirido: focus:GAIN · playback:playing — mismo sid, mismo motor)                  [RECOVERY]
```

## 6. TESTS (95/95 PASS — 95 = 89 previos + 6 nuevos P2)

- `P2 I6: alarma external (nativa) NUNCA dispara el scheduler web (dueño único)`.
- `P2 ICS FASE 10: UID estable, LOCATION/SEQUENCE, sin evento duplicado`.
- `P2 focus: UNKNOWN es estado explícito y recuperable (NO pérdida genérica)` (dictamen §1).
- `P2 focus: DUCK mantiene held=true (el foco NO se pierde al duplicar)` (dictamen §1).
- `P2 focus: held es la autoridad del watchdog, NO la observabilidad` (dictamen §2).
- `P2 I6: dueño de alarma por plataforma — APK nativo vs Web/PWA (un solo disparador)` (dictamen §4).
- (P1 ya aportó: doble start, lock/unlock ×3, stop→start, RestoreGate, cancelación de automation.)

## 7. PROBLEMAS ENCONTRADOS (por el forense) Y FIXES

| # | Hallazgo | Evidencia | Fix |
|---|---|---|---|
| F1 | **MediaSession doble en APK**: el `<audio>` del transporte web (mudo) hacía que Chromium reclamara una MediaSession paralela ante el SO | `dumpsys media_session`: 2 sesiones (P2 sesión previa) | Pausar el elemento web cuando el nativo posee el audio (`syncNativeAudioStart` + rama nativa de `restoreFromBackground`) → 1 sola sesión |
| F2 | **Alarma APK sin cablear**: la UI usaba solo el scheduler web (pestaña viva); el AlarmManager nativo (validado, sobrevive app cerrada + reboot) nunca se usaba desde la UI | `alarmSave` → solo `alarmManager.create` (web); cero llamadas al bridge | `scheduleNativeAlarm()` en APK + alarma `external` (el web la conserva en la lista sin disparar); cancelación nativa en ambos botones |
| F3 | **Audio focus robado al desbloquear**: Chromium (WebView) reclama focus al reanudar → el servicio nativo pausaba y NUNCA recuperaba (audio mudo tras el primer unlock) | `focus:LOSS` persistente + posición congelada + `Diagnostics.focusState=LOSS` | `AudioFocusHelper.held` + watchdog de re-adquisición con backoff (reanuda el MISMO motor) + MediaSession honesta (PAUSED durante LOSS) |
| F4 | **Bucle de sesión por el sync**: `paused` de focus → `pauseUiOnly()` (teardown) → `playing` → `start()` (sid++ por ciclo) | `sid` 1→5→14→21→24 en 3 locks | `setSessionPlaying(playing, pushToJs=false)` para interrupciones de focus: el JS recibe `vyneural:audiofocus` (INTERRUPTED) sin teardown |
| F5 | **ICS**: faltaban `LOCATION`/`SEQUENCE` (RFC 5545) | audit FASE 10 | Añadidos; UID ya estable (`alarm.id@vyneural.cl`) |

## 8. MATRIZ WEB / PWA / APK (FASE 9 — corregida)

| CAPABILITY | WEB | PWA | APK |
|---|---|---|---|
| Web Audio | ✅ | ✅ | ✅ (mudo, solo visualizador) |
| Media Session | ✅ `navigator.mediaSession` | ✅ idem | ✅ NATIVA (única ante el SO) |
| OS notification | Browser (Notification API) | Browser (SW) | ✅ Android (canales + MediaStyle) |
| Audio focus | OS (navegador) | OS | ✅ Android + watchdog |
| Foreground service | ❌ | ❌ | ✅ mediaPlayback |
| Alarm API | ❌ (scheduler web, pestaña viva) | ❌ idem | ✅ AlarmManager + BootReceiver |
| Calendar .ics | ✅ descarga | ✅ descarga | ✅ SAVE_ICS (Descargas) |
| Lock-screen controls | ✅ (Android element) / 🟡 iOS PWA | ✅ | ✅ verificado |

## 9. EVIDENCIA DE MEDIA SESSION / NOTIFICATION / FOCUS / ALARM / ICS

- **MediaSession**: `dumpsys media_session` → media button session = `com.vyneural.bineural/Vyneural`, `active=true`, PLAYING; una sola sesión del paquete.
- **Notification**: `dumpsys notification` → 1 registro `bineural_player` (id=1001, actions=2, vis=PUBLIC) + 0 duplicados.
- **Audio Focus**: `dumpsys audio` → `requestAudioFocus(... USAGE_MEDIA ... req=1)` GAIN + abandon limpio en stop; LOSS → recuperación por watchdog (evidencia de ciclo).
- **Alarm**: P2 previo: `SCHEDULE_ALARM` → OK y disparo real (`when≈now`); ahora la UI lo cablea nativamente con `external` (test I6).
- **ICS**: test FASE 10: UID estable, un solo `VEVENT`, LOCATION/SEQUENCE presentes.

## 10. RIESGOS PENDIENTES / NO VERIFICADO EN ESTE ENTORNO

- Bluetooth / auriculares / headset reales → `cmd media_session dispatch` cubre la ruta lógica, pero el hardware físico queda `NOT_TESTED`.
- Proceso eliminado por el OEM y reinicio real → BootReceiver cubre el reboot; kill del proceso por batería requiere dispositivo.
- El quirk de Chromium (reclamo de focus en WebView) puede comportarse distinto en un dispositivo físico; el watchdog lo absorbe por diseño.
- `requestCode = alarmId.hashCode()`: colisión de hash posible (raro) → documentado; PendingIntent `FLAG_UPDATE_CURRENT` reemplaza en lugar de duplicar.
- Focus LOSS temporal (~2–5 s) tras unlock en el emulador: es la interrupción real (otro "reproductor" — la propia WebView — pidió foco); se recupera solo.
- El estado `UNKNOWN` de Audio Focus ya no es un riesgo de cierre: quedó endurecido (watchdog + CRITICAL, visible como UNKNOWN) y cubierto por test explícito (§4b, criterios 20-22).

## 11. CRITERIOS DE CIERRE (FASE 14)

| # | Criterio | Estado |
|---|---|---|
| 1 | Sin duplicación de pipeline | ✅ (P1 + forense: `live=[1,2]` constante) |
| 2 | Sin duplicación de Media Session | ✅ (1 sesión en `dumpsys`) |
| 3 | Sin duplicación de handlers | ✅ (registro único; verificado por inspección) |
| 4 | Sin duplicación de notification | ✅ (1 player, 1 alarm por evento) |
| 5 | Sin duplicación de alarm | ✅ (external + test I6 + dueño puro por plataforma) |
| 6 | Audio Focus definido | ✅ (GAIN/LOSS/LOSS_TRANSIENT/DUCK/UNKNOWN + watchdog + `held` como autoridad) |
| 7 | lock/unlock idempotente | ✅ (sid estable ×3) |
| 8 | background/foreground idempotente | ✅ (gate + sin teardown por focus) |
| 9 | Web/PWA/APK diferenciadas | ✅ (matriz §8) |
| 10 | Notification owner único | ✅ |
| 11 | Media Session owner único | ✅ |
| 12 | Alarm owner único | ✅ |
| 13 | ICS correcto por plataforma | ✅ (FASE 10) |
| 14 | tests automatizados PASS | ✅ 95/95 |
| 15 | pruebas emulador PASS | ✅ |
| 16 | prueba física Android | ⚠️ NOT_TESTED (requiere dispositivo) |
| 17-19 | lock #1/#2/#3 validados | ✅ (emulador, idénticos) |
| 20 | UNKNOWN de focus es estado seguro y recuperable | ✅ (pausa + watchdog + CRITICAL visible) |
| 21 | Test explícito de UNKNOWN | ✅ (`focusPolicy(UNKNOWN)`: held=false, watch=true, critical=true, firma ≠ LOSS) |
| 22 | `held` = autoridad del watchdog (no observabilidad) | ✅ (`shouldRequestFocus`: `held=false + GAIN` re-solicita; `held=true + UNKNOWN` fuerza) |
| 23 | Cadena de alarma con dueño único por plataforma | ✅ (test puro + integración etiquetada con evidencia de emulador) |

## 12. NIVELES DE CIERRE (revisión independiente del dictamen)

| Nivel | Estado |
|---|---|
| Código / test unitario | ✅ **PASS** (95/95, incluidos los 4 tests del endurecimiento UNKNOWN) |
| Integración / emulador | ✅ **PASS** (3 ciclos lock/unlock `sid=1`; lock/unlock real del SO con recuperación por watchdog; MediaSession única; stop limpio) |
| Estados inesperados / UNKNOWN | ✅ **CERRADO** (política defensiva + CRITICAL visible + test explícito; `held` como autoridad del watchdog) |
| Cadena de alarma nativa | 🟡 **INTEGRACIÓN** (dueño probado en JS; cadena completa UI→bridge→AlarmScheduler→PendingIntent→AlarmReceiver→NotificationHelper etiquetada como integración, con evidencia de emulador previa) |
| Hardware físico | ⚠️ **NOT_TESTED** (Bluetooth real, auriculares, kill por OEM, reinicio real, pantalla bloqueada física) — se mantiene SEPARADO del cierre lógico |
| Production-ready | ❌ todavía no (requiere el hardware físico + pruebas de fabricantes variados) |

**P2 STATUS: PASS (cierre lógico)** — con la terminología corregida: **no se observaron estados UNKNOWN durante las pruebas ejecutadas**, y además el manejo defensivo de UNKNOWN quedó **endurecido y cubierto por test explícito** (watchdog + CRITICAL, visible como UNKNOWN, nunca pérdida genérica silenciosa). El cierre lógico está completo; el hardware físico sigue correctamente etiquetado como `NOT_TESTED` y separado del criterio de corrección lógica.

---
*Ver: `P1_AUDIO_FORENSIC_REPORT.md`, `P0_AUDIT.md`, `P2_VALIDATION_REPORT.md`, `TEST_MATRIX.md`.*
