# AUDITORÍA FORENSE — VYNEURAL (WEB / PWA / APK)

> Método: inspección estática + tests + evidencia runtime (preview en dev
> server). La auditoría se hizo SIN corregir código; después se aplicaron los
> fixes B1–H3 (sección 21) con tests de regresión, y el veredicto se actualizó
> en la sección 22. Este documento conserva la evidencia original de cada
> hallazgo.
>
> Regla de oro: **NINGÚN AUDIO PUEDE COMENZAR SIN UNA CAUSA EXPLÍCITA Y
> AUDITABLE.** Causas legítimas: `USER_PLAY`, `USER_RESUME`, `MediaSession.play`
> explícito, o un equivalente documentado.

---

## 1. RESUMEN EJECUTIVO

La arquitectura de ownership quedó sustancialmente corregida en la fase
P5.1–P5.4 (kill-switch nativo, protocolo único, separación APK/Web,
instrumentación causal). La APK actual cumple la mayoría de las prohibiciones:
lifecycle, focus, configuración y alarmas **no** pueden arrancar audio, y el
servicio no se recrea con reproducción autónoma.**La auditoría encontró 2 caminos de PLAY prohibidos, 1 vía que des-enmudece
   el motor web dentro de la APK, y 1 divergencia UI↔nativo. Los 6 hallazgos
   (B1–H3) se corrigieron en la fase de fixes (sección 21) con tests de
   regresión.** Criterio de cierre tras los fixes: ver sección 22.

Hallazgos principales:

| ID | Severidad | Hallazgo | Dónde |
|---|---|---|---|
| B1 | **P0 BLOCKER** | Alarma web/PWA disparada en primer plano → `start()` (PLAY sin acción explícita de reproducción) | `src/main.js:3958` |
| C1 | **P1 CRITICAL** | Deep link `?autostart=true` → `start()` al cargar la página | `src/main.js:4204` |
| C2 | **P1 CRITICAL** | Cambio de condición experimental en APK → `setCondition()` rampea la ganancia web → doble tono | `src/audio.js:320` + `src/main.js:2588` |
| H1 | **P2 HIGH** | `selectState()` no re-sincroniza el motor nativo (divergencia UI↔sonido en APK) | `src/main.js:807` |
| H2 | **P2 HIGH** | Watchdog `recoverFade()` sin guard APK (latente: des-enmudece si el ctx se suspende visible) | `src/core/simulation.js:265` |
| H3 | **P2 HIGH** | Fallback `startBackgroundAudio()` en `syncNativeAudioRetune` para APK sin `retuneNative` (config → PLAY, latente) | `src/main.js:212` |

La APK es hoy **un único owner de audio** (servicio nativo), **una MediaSession**
(nativa), **un scheduler de alarmas** (AlarmManager) — salvo C2/H2. Web/PWA no
tienen doble motor, pero B1/C1 violan la regla de oro.

---

## 2. INVENTARIO COMPLETO

| Componente | Ruta | Rol |
|---|---|---|
| Entrypoint web | `index.html` + `src/main.js` | Generador, sesión, MediaSession web |
| PWA | `public/sw.js`, `public/manifest.webmanifest` | Cache, notificaciones, deep links |
| Motor web (protegido) | `src/audio.js` | BinauralEngine (Web Audio) |
| Ambiente | `src/ambient.js` | Capas de sonido sincronizadas |
| Transporte | `src/core/audio-transport.js` | `element`/`direct` |
| Ancla legacy | `src/core/media-anchor.js` | `<audio>` mudo (solo direct/iOS) |
| Simulación + watchdog | `src/core/simulation.js` | `loop()` + `_audioWatchdog()` |
| Salud de audio | `src/core/audio-health.js` | `evaluateAudioHealth`/`planRecovery` |
| Lifecycle puro | `src/core/lifecycle.js` | AppLifecycle |
| Audio state puro | `src/core/audio-state.js` | AudioStateMachine |
| Causal log web | `src/core/causal-log.js` | `window.__causalLog` |
| Protocolo nativo | `src/core/native-protocol.js` | Contrato PLAY/PAUSE/STOP |
| Bridge JS | `src/platform/native-bridge.js` | Adapter + whitelist |
| Capacidades | `src/platform/platform-capabilities.js` | Detección runtime |
| Alarmas web | `src/core/alarm-manager.js` | Scheduler multi-tab |
| Notificaciones web | `src/notifications.js`, `src/core/notification-manager.js` | Permisos, chime, alarmas |
| MainActivity | `android/.../MainActivity.kt` | Shell, WebView, bridge |
| ForegroundService | `android/.../audio/AudioForegroundService.kt` | Motor nativo + MediaSession |
| Motor nativo | `android/.../audio/BinauralToneEngine.kt` | AudioTrack streaming |
| Focus | `android/.../audio/AudioFocusHelper.kt` | Audio focus + watchdog |
| Bridge Kotlin | `android/.../bridge/AndroidBridge.kt` | Comandos whitelisted |
| Alarmas nativas | `android/.../notifications/AlarmScheduler.kt`, `AlarmReceiver.kt`, `BootReceiver.kt` | AlarmManager |
| Notificaciones | `android/.../notifications/NotificationHelper.kt` | Player + alarmas |
| Permisos | `android/.../permissions/PermissionManager.kt` | POST_NOTIFICATIONS |
| Diagnóstico | `android/.../diag/Diagnostics.kt`, `DiagnosticsActivity.kt` | Traza causal + snapshot |

## 3. OWNERSHIP WEB / PWA / APK

```
                         VYNEURAL
                            │
             ┌──────────────┼──────────────┐
            WEB            PWA            APK
             │              │              │
        Web Audio       Web Audio      Native Audio  ✓ (único; C2/H2 lo violan puntualmente)
        Web Session     Web Session    Android Session ✓ (única; updateMediaSession es no-op en APK)
        Web Alarm       Web Alarm      AlarmManager    ✓ (única; external nunca dispara en web)
        Web Notify      Web Notify     Native Notify   ✓ (canales/IDs deterministas)
```

Cada runtime tiene **un** owner de audio, **una** MediaSession y **un**
scheduler de alarmas. Se confirmó: `alarmOwnerForPlatform`, el flag `external`
(`src/core/alarm-manager.js:46`), `mediaPlaybackRequiresUserGesture = true` y
el guard `serviceAlive` en el servicio.

---

## 4. TODOS LOS CAMINOS DE PLAY (tabla exhaustiva)

| Fuente | Archivo:línea | Función | ¿Puede producir PLAY? | Directo/Indirecto | ¿Requiere usuario? | Riesgo |
|---|---|---|---|---|---|---|
| Botón play | `main.js` playBtn click → `resumeSession('ui')` | start() | ✅ legítimo | Directo | Sí | — |
| Tecla Espacio | `main.js:2160` | `resumeSession('keyboard')` | ✅ legítimo | Directo | Sí | — |
| API `__vyneural.play/toggle` | `main.js:2332` | start() | ✅ legítimo (documentado) | Directo | Sí | — |
| MediaSession.play (web) | `main.js` setActionHandler | `resumeSession('lock-screen')` | ✅ legítimo | Directo | Sí | — |
| Evento nativo `playing` | `main.js:424` | `resumeSession('lock-screen')` | ✅ respuesta a play del SO | Indirecto | Sí (lock screen) | — |
| **Alarma web primer plano** | **`main.js:3958`** | **`if (!playing) start();`** | **✅ BUG** | Directo | No (solo programó la alarma) | **P0** |
| **Deep link autostart** | **`main.js:4204`** | **`start()` en page load** | **✅ BUG (gateado por autoplay)** | Directo | Clic en notificación (ambiguo) | **P1** |
| Toggle ambiente sin sesión | `main.js:1549` | `start()` | ✅ user-equivalente no documentado | Directo | Sí (clic) | P3 |
| `endSession` → `stop(true)` | `main.js:1463` | stop() | ❌ (detiene) | — | — | — |
| Restore background | `main.js:2070` | restoreFromBackground | ❌ (mute-only en APK; recoverFade solo si ya playing en web) | — | — | — |
| Watchdog | `simulation.js:265` | recoverFade | ❌ con gain=0 (respeta mute); ⚠️ si ctx suspendido visible → des-enmudece | Indirecto | No | P2 (H2) |
| `setExpCondition` en APK | `audio.js:320` | setCondition ramps gain | ✅ des-enmudece el motor web (doble tono) | Indirecto | Sí | P1 (C2) |
| `onCreate` / lifecycle nativo | `AudioForegroundService.kt` | — | ❌ | — | — | — |
| `onStartCommand(null)` | `AudioForegroundService.kt` | handleNullIntentRestart | ❌ (`NO_AUTO_PLAY` + stopSelf) | — | — | — |
| `AudioFocus GAIN` | `AudioFocusHelper.kt` + service | engine.resume | ❌ solo si `shouldPlay` (interrupción); nunca arranca | — | — | — |
| Watchdog de focus | service `scheduleFocusReacquire` | request() | ❌ solo si `shouldPlay` | — | — | — |
| Config (retune/wave/volume) | `AudioForegroundService.kt` companion | startService | ❌ `serviceAlive` guard; si muerto → drop | — | — | — |
| `startForegroundService` | bridge START/RESUME | — | ✅ solo acciones de reproducción | — | — | — |
| Alarma nativa | `AlarmReceiver.kt` | NotificationHelper | ❌ solo notifica | — | — | — |
| `BOOT_COMPLETED` | `BootReceiver.kt` | rescheduleAll | ❌ solo reprograma | — | — | — |
| `MediaSession` creación | service `onCreate` | `setActive(false)` | ❌ | — | — | — |
| `onPageFinished`/DOMContentLoaded | `MainActivity.kt` / `main.js` | injectBridge / init | ❌ (salvo autostart C1) | — | — | — |
| `syncUiWithNativeSession` | `main.js:286` | startWebVisualizerMuted | ❌ (mute) | — | — | — |

## 5. TODOS LOS CAMINOS DE PAUSE

| Fuente | Archivo | Comando nativo | ¿Simétrico? |
|---|---|---|---|
| UI botón / teclado / API | `main.js` pauseSession | 1 PAUSE (`nativePauseCommand`) | ✅ |
| Lock screen (nativo) | evento `vyneural:audioplayback` → pauseUiOnly | 0 (el nativo ya pausó) | ✅ |
| MediaSession.pause (web) | setActionHandler | 0 (web sin bridge) | ✅ |
| Focus LOSS | `AudioFocusHelper` → engine.pause | nativo | ✅ |
| `handleSystemPause` | service | nativo | ✅ |

## 6. TODOS LOS CAMINOS DE STOP

| Fuente | Archivo | Comando nativo | ¿Simétrico? |
|---|---|---|---|
| UI stop / timer end | `main.js` stop() | 1 STOP si `serviceRunning` | ✅ |
| Lock screen stop | evento `stopped` → stop(false) | 0 (servicio ya muerto) | ✅ |
| MediaSession.stop | service handleSystemStop | nativo + stopSelf | ✅ |
| Alarma | — | nunca | ✅ |

## 7. TODOS LOS CAMINOS DE RESTORE

| Vía | En Web/PWA | En APK |
|---|---|---|
| visibilitychange visible | requestRestore → recoverFade/fadeTo + reaffirm + updateMediaSession | **mute + pause transport, 0 comandos nativos** ✅ |
| pageshow / focus / resume | ídem | ídem ✅ |
| pointerdown (solo si ctx suspendido) | ídem | ídem ✅ |
| `_audioWatchdog` (0.5 s) | recoverFade si health malo | ⚠️ H2 (guard ausente) |
| ctx.onstatechange | lifecycle/sessionLog | lifecycle/sessionLog ✅ |

## 8. MEDIASESSION

- **Web/PWA**: `navigator.mediaSession` con handlers play/pause/stop/prev/next/seek/volume, metadata, positionState. `updateMediaSession()` es **no-op con bridge** (`main.js` guard P6) y los handlers no se registran en APK. ✅
- **APK**: MediaSession Android única en el servicio; la WebView no reclama (motor mudo + `<audio>` pausado). ✅
- **¿Puede una acción de MediaSession Web llegar al motor nativo?** En APK no hay handlers web. En web no hay nativo. ✅ (cerrado).
- **¿Puede Android MediaSession producir PLAY sin acción explícita?** No: `handleSystemPlay` solo corre por callback del SO (play del usuario). ✅

## 9. AUDIO FOCUS

- `request`/`abandon` correctos; `held` es la fuente de verdad del watchdog.
- **GAIN** → `engine.resume()` solo si `shouldPlay` (interrupción previa); nunca arranca desde detenido (tras P5.1 `shouldPlay` jamás se restaura). ✅
- **Loop LOSS→GAIN**: la pausa por LOSS usa `pushToJs=false` (no dispara el sync JS), el watchdog re-solicita con backoff y al GAIN reanuda el MISMO motor. No hay bucle (el JS no recibe 'paused' falso). ✅
- **UNKNOWN**: visible, defensivo (pausa + watchdog + contador en Diagnostics). ✅

## 10. FOREGROUND SERVICE

- Se crea solo por `START`/`RESUME` (acciones de reproducción) o por un STOP
  race self-cleaning (crea → detiene, sin audio). Config y PAUSE: guard
  `serviceAlive` (nunca crean). ✅
- `START_NOT_STICKY` + null-intent → `NO_AUTO_PLAY` + stopSelf. ✅
- `onDestroy` libera focus/engine/MediaSession; no limpia la sesión persistida (intencional). ✅

## 11. ALARMMANAGER

- **APK**: `AlarmManager` único owner; `external` evita el disparo web paralelo; `AlarmReceiver` **solo notifica** (nunca PLAY) ✅; `BootReceiver` solo reprograma ✅; PendingIntent determinista (`alarmId.hashCode()` + acción única) ✅; rutinas recalcular próxima ocurrencia ✅.
- **Web/PWA**: scheduler multi-tab (primaria única + confirmación en store) ✅; one-shot, MISSED sin ejecutar ✅; **pero el disparo en primer plano llama `start()` (B1, P0)** ❌.

## 12. NOTIFICACIONES

- Player (canal `bineural_player`, ID 1001) vs Alarma (canal `bineural_alarms_v2`, ID 2001): deterministas, sin colisión. ✅
- Cancelar player no cancela alarma y viceversa. ✅
- La alarma no crea player. ✅
- En APK, la notificación de **fin de sesión** (web `new Notification`) no se muestra (WebView sin Notification API) → M1 (P3).

## 13. WEBVIEW BRIDGE

- Whitelist exacta (`BridgeCommands.ALL` == `BRIDGE_COMMANDS`), payload validado, aislamiento de fallos. ✅
- `GET_AUDIO_STATE`/`GET_MEDIA_SESSION_STATE` reportan estado real (nunca inventado). ✅
- Los comandos de PLAY/RESUME/STOP/START existen y se usan; PAUSE/RESUME se usan ahora desde el protocolo simétrico. ✅

## 14. LIFECYCLE

- Android: `LifecycleManager` es solo observabilidad. `MainActivity` no reanuda audio en onResume/onStop. `configChanges` evita recrear la Activity. `singleTask` evita recargas al reabrir. ✅
- WebView: `visibilitychange`/`pageshow`/`focus`/`resume`/`pointerdown` → restore mute-only en APK. ✅
- Web: el restore es la recuperación legítima de una sesión ya en play. ✅

## 15. CONCURRENCIA (escenarios)

| Escenario | Resultado esperado (verificado por código/tests) |
|---|---|
| PLAY + LOCK / UNLOCK | Restore mute-only en APK; web: recoverFade. 0 START. ✅ |
| PAUSE + LOCK | Nada: pausado. ✅ |
| STOP + LOCK | Nada. ✅ |
| PLAY + LOSS + GAIN | INTERRUPTED → PLAYING (mismo motor). ✅ |
| PLAY + kill del proceso | Servicio no recreado; null-intent → NO_AUTO_PLAY. ✅ (P5.1) |
| PLAY + Activity destroy | WebView destroy; servicio foreground sigue; sin START. ✅ |
| PLAY + WebView reload | syncUiWithNativeSession alinea UI sin tocar el servicio. ✅ |
| PLAY + alarma | B1 en Web/PWA (P0); en APK la alarma solo notifica. ⚠️ |
| Multi-tab alarmas | 1 disparo (primaria + confirmación en store). ✅ |
| Multi-tab AUDIO | Cada tab reproduce su propia sesión (no es bug de espontaneidad). Documentado. |
| play→stop rápidos (race bridge) | STOP self-cleaning; sin audio. ✅ |
| setExpCondition + APK + playing | **C2: des-enmudece el motor web → doble tono.** ❌ |

## 16. BUGS ENCONTRADOS (detalle)

### B1 — P0 BLOCKER — Alarma web en primer plano inicia una sesión

- **Archivo/Función**: `src/main.js:3958` (handler `onFire` del AlarmManager).
- **Causa raíz**: el disparo de alarma con la página visible ejecuta
  `if (!playing) start();` — un PLAY sin acción de reproducción del usuario.
  La regla de oro prohíbe explícitamente "disparo de alarma" como causa.
- **Reproducción**: programar una alarma (web/PWA), dejarla vencer con la
  página abierta → arranca la sesión sola.
- **Evidencia**: estática (línea citada); el scheduler web es dueño en
  Web/PWA (no hay `external`), así que `onFire` corre.
- **Impacto**: reproducción espontánea (la clase de bug que esta fase quiere
  eliminar).
- **Fix recomendado**: la alarma **solo notifica** (notificación + chime +
  toast + configurar el estado), sin `start()`. Si se quiere "la alarma
  arranca la sesión", debe ser un opt-in explícito y separado, documentado.
- **Test necesario**: test puro del handler onFire (estado configurado sin
  start).

### C1 — P1 CRITICAL — Deep link `autostart=true` inicia la sesión al cargar

- **Archivo/Función**: `src/main.js:4204` (`if (deepAutostart && ...) start()`).
- **Causa raíz**: carga de página con `?freq=…&autostart=true` → `start()`.
  La carga de página está en la lista prohibida. El comentario asume que el
  clic en la notificación cuenta como gesto, pero la página que se abre no
  tiene ese contexto de gesto (lo tiene el SW al navegar).
- **Reproducción**: PWA → alarma → clic en "Iniciar" de la notificación →
  la página arranca sola (o queda configurada si el navegador bloquea el
  autoplay).
- **Evidencia**: estática; en la práctica el navegador suele bloquear el
  AudioContext sin gesto (el try/catch lo confirma), pero es un camino de
  PLAY en page load.
- **Impacto**: PLAY espontáneo dependiente de la política de autoplay del
  navegador; también salta `syncUiWithNativeSession` (se omite con autostart).
- **Fix recomendado**: eliminar el autostart (mostrar el estado configurado +
  botón play), o convertirlo en un gesto real (botón "Comenzar" visible).
- **Test necesario**: si se elimina, test de que la carga con autostart no
  llama start().

### C2 — P1 CRITICAL — Cambio de condición experimental des-enmudece el motor web en APK

- **Archivo/Función**: `src/audio.js:320` `setCondition()` + `src/main.js:2588`
  `setExpCondition()`.
- **Causa raíz**: `setCondition()` (con `_playing=true`) hace crossfade y
  `linearRampToValueAtTime(vol, t1+0.3)` — sube la ganancia del motor web a
  plena sesión. En la APK el motor web debe estar **siempre mudo**
  (`muteWebForNative`), pero `setExpCondition` no vuelve a mutea.
- **Reproducción**: APK, sesión sonando (nativa), abrir "Modo experimental" →
  cambiar condición → el motor web (visualizador) suena ENCIMA del nativo →
  doble tono/interferencia de fase.
- **Evidencia**: estática (rama de setCondition con `_playing`); el mute solo
  ocurre en `start()`/`restoreFromBackground()`.
- **Impacto**: exactamente el síntoma "audio acoplado / interferencia" en la
  APK.
- **Fix recomendado**: en `setExpCondition` (y en cualquier mutador en vivo
  que toque la ganancia) re-aplicar `muteWebForNative()` cuando `nativeAudio()`.
  Mejor aún: que el mute sea una propiedad del motor en modo APK.
- **Test necesario**: test del engine con fake ctx: tras setCondition con
  mute previo, la ganancia debe quedar 0 (o el mutador no debe rampear).

### H1 — P2 HIGH — `selectState()` no sincroniza el motor nativo

- **Archivo/Función**: `src/main.js:807` `selectState()`.
- **Causa raíz**: al seleccionar un estado con la sesión activa en APK, solo
  se retunea el motor web (`simulation.setProfile` → `audio.retune`); el
  servicio nativo no recibe `RETUNE`. Wave (`applyWave`), portadora
  (`applyCarrier`) y sliders custom sí lo hacen — inconsistente.
- **Reproducción**: APK, sesión sonando, tocar otra tarjeta → la UI muestra
  el estado nuevo; el sonido sigue en el estado viejo hasta el próximo START.
- **Impacto**: divergencia UI↔nativo (la UI miente sobre lo que se oye).
- **Fix recomendado**: en `selectState`, si `playing` y hay bridge →
  `syncNativeAudioRetune()`.
- **Test necesario**: test del contrato (o integración): seleccionar estado →
  1 RETUNE.

### H2 — P2 HIGH — Watchdog `recoverFade` sin guard APK (latente)

- **Archivo/Función**: `src/core/simulation.js:259-265` `_audioWatchdog()`.
- **Causa raíz**: si el AudioContext de la WebView se suspende con la app
  visible en la APK (raro pero posible), el watchdog llama
  `recoverFade(_volume)` → des-enmudece el motor web → doble tono con el
  nativo. Hoy está protegido de facto porque `evaluateAudioHealth` respeta el
  mute (`gain > 0.02` falso), pero la ruta `ctxState === 'suspended'` no.
- **Reproducción**: no reproducido; latente.
- **Fix recomendado**: guard `if (nativeAudio()) return;` (o flag de "motor
  mudo por diseño") al inicio del watchdog.
- **Test necesario**: test puro: watchdog con flag APK no debe emitir recover.

### H3 — P2 HIGH — Fallback de retune a START (latente)

- **Archivo/Función**: `src/main.js:212` (`syncNativeAudioRetune` fallback).
- **Causa raíz**: si el bridge no declara `retuneNative`, el retune cae a
  `startBackgroundAudio(...)` → config produce START (PLAY desde configuración).
  Muerto en la APK actual (`retuneNative=true`), pero viola la regla si el
  flag cae o en APKs futuras.
- **Fix recomendado**: eliminar el fallback; el START solo desde acciones de
  reproducción.

### M1 — P3 MEDIUM — Sin notificación nativa de fin de sesión en APK ✅ CORREGIDO

- `endSession` usa `new Notification(...)` web; en la WebView no se muestra.
  El usuario en APK no recibe aviso al terminar el temporizador.
- **Fix aplicado**: comando bridge `SESSION_END` (whitelisted en
  `native-bridge.js` y `BridgeCommands.kt`) → `NotificationHelper.showSessionEnd()`
  (id 2002, canal `bineural_session_end`, IMPORTANCE_DEFAULT sin vibración,
  tocar abre la app). `endSession()` de `main.js` usa el bridge en la APK y
  cae a la Notification API web en Web/PWA.
- **Validado en emulador (Android 14)**: SESSION_END → notificación nativa
  publicada (id=2002, canal correcto).

### M2 — P3 MEDIUM — PAUSE nativo mantiene el audio focus

- `ACTION_PAUSE`/`handleSystemPause` no hacen `focus.abandon()` (estándar de
  media players para reanudar rápido), pero otra app puede perder foco
  mientras esta está pausada. Documentado como comportamiento; no bloquea.

### M3 — P3 MEDIUM — Toggle de ambiente con sesión detenida arranca la sesión

- `src/main.js:1549`: `else if (ambientTypes.size > 0) { start(); }`. Es una
  acción del usuario (quiere oír el ambiente) pero es un PLAY desde un control
  que no es de reproducción. Debe documentarse explícitamente como
  user-equivalent o eliminarse.

### L1–L4 — P4 LOW

- L1: STOP de servicio muerto → crea-y-detiene con flash de notificación
  (race play→stop; self-cleaning, sin audio).
- L2: NaN en frecuencias si `customBase` queda vacío (UI lo limita; el motor
  queda en silencio).
- L3: `getRunningServices` deprecado — en OEMs raros podría dar falsos
  negativos al `serviceAlive` (config drop; benigno).
- L4: tras navegar en APK con el nativo PAUSED, la UI muestra "Comenzar
  sesión" (el play reanuda la MISMA sesión — comportamiento correcto, etiqueta
  imprecisa).

## 17. BUGS POTENCIALES NO CONFIRMADOS

- **Ventana submilisegundo** entre `applyAudio()` (rampa del motor web) y
  `muteWebForNative()` en `start()` APK: síncrona, inaudible; no confirmado
  como audible en hardware.
- **Autoplay del navegador con autostart (C1)**: depende del navegador;
  no se pudo confirmar en hardware (sin dispositivo).
- **Multitab de audio en PWA**: dos pestañas reproduciendo a la vez es
  posible (cada una su sesión); no es espontáneo, pero conviene decidirlo.

## 18. UNKNOWNS (no bloqueantes)

- U1: política exacta de autoplay para `autostart` por navegador (C1).
- U2: comportamiento de `getRunningServices` en OEMs (L3).
- U3: la ruta `ctxState==='suspended'` del watchdog en APK (H2) no se pudo
  reproducir sin dispositivo.
- Ningún UNKNOWN se asume como PLAYING/PAUSED/STOPPED: `Diagnostics` y
  `__causalLog` distinguen estados reales y el focus UNKNOWN es explícito.

## 19. TESTS EJECUTADOS

| Test | Resultado |
|---|---|
| `npm test` (suite 110) | **110/110 PASS** |
| Suite en navegador (preview dev server) | **110/110 PASS** |
| `npm run build` | **OK** (bundle nuevo) |
| `gradle assembleDebug` (Kotlin compila) | **BUILD SUCCESSFUL** |
| Sanity en preview: play/pause → PAUSED/PLAYING, `__causalLog` registra, menú ⋯ (7 ítems), fullscreen real (burbuja oculta, historial desde ⋯) | OK |
| Test F14 (nuevo): 100 ciclos PLAY-LOCK-UNLOCK-PAUSE-STOP → 100 START / 100 RESUME / 100 PAUSE / 100 STOP, 0 espontáneos | **PASS** (añadido al suite) |

## 20. TESTS FALLIDOS

- Ninguno en el entorno disponible. La matriz destructiva física (FASE 15,
  `docs/DESTRUCTIVE_MATRIX.md`) **no se ejecutó**: no hay emulador/adb en este
  entorno. Pendiente obligatorio antes de release.

## 21. CAMBIOS RECOMENDADOS (separados de los ya realizados)

**Ya realizados (fases previas P5.1–P5.5):** kill-switch nativo
(START_NOT_STICKY, null-intent sin auto-play, config/PAUSE con guard
`serviceAlive`), `mediaPlaybackRequiresUserGesture=true`, protocolo único
`native-protocol.js`, mute del motor web en APK, `updateMediaSession` no-op en
APK, anillo causal nativo + `__causalLog`, menú ⋯ con compartir/historial,
suite 104→110.

**Aplicados en la fase de fixes (P5.6):**

1. **B1** — la alarma web/PWA ya NO llama `start()`: solo notifica + chime +
   toast y deja el estado configurado (`main.js` onFire). Test de jerarquía.
2. **C1** — `?autostart=true` ya NO arranca audio en page load: solo configura
   el estado y espera el gesto del usuario. Test de jerarquía.
3. **C2/H2 — frontera estructural APK**: el motor web tiene `_platformMuted`
   (`setPlatformMuted()` en `audio.js`); TODAS las operaciones de ganancia
   (start, setCondition, setVolume, fadeTo, recoverFade) y `transport.play`
   consultan la frontera y jamás suben la ganancia en APK. El watchdog
   (`simulation.js`) tiene un guard explícito `_platformMuted → return`.
   main.js la aplica al init (`applyPlatformMutePolicy`) y en cada
   `muteWebForNative`. Test de regresión del motor (112/112).
4. **H1** — `selectState()` ahora envía `syncNativeAudioRetune()` al motor
   nativo cuando la sesión está en play (fin de la divergencia UI↔nativo).
5. **H3** — eliminado el fallback `startBackgroundAudio()` del retune: RETUNE
   nunca significa START (el lado nativo descarta el retune si el servicio no
   está vivo).

**Pendientes (no bloqueantes):**

1. ~~**M1** — notificación nativa de fin de sesión en APK~~ ✅ CORREGIDO (SESSION_END, validado en emulador).
2. **M3** — documentar/gatear el toggle de ambiente → `start()` (user-equivalent).
3. Matriz destructiva en emulador + idle torture test (requiere hardware).

## 22. CRITERIO DE CIERRE

| Criterio | Estado tras fixes (P5.6) |
|---|---|
| Sin camino de PLAY espontáneo conocido | ✅ (B1/C1 corregidos + tests de jerarquía) |
| Ownership único por runtime | ✅ (frontera estructural `_platformMuted` — C2/H2) |
| MediaSession única por runtime | ✅ |
| AudioFocus sin loops | ✅ |
| Service recreation no reproduce | ✅ (P5.1) |
| Lifecycle no reproduce | ✅ |
| Configuración no reproduce | ✅ (H3 eliminado; RETUNE≠START) |
| Alarmas no reproducen | ✅ (B1; APK ya ✅) |
| Web/PWA/APK separados | ✅ (frontera explícita) |
| Tests pasan | ✅ **112/112** (Node y navegador) |
| Pruebas destructivas pasan | ⏳ pendiente emulador/hardware |
| Sin UNKNOWNs bloqueantes | ✅ |

**VEREDICTO: PASS condicional (código).** Los 6 hallazgos de la auditoría
están corregidos y blindados por tests. Falta únicamente la evidencia física:
matriz destructiva en emulador + idle torture test + `dumpsys` antes de
empaquetar/release.

> Archivo relacionado: `docs/DESTRUCTIVE_MATRIX.md` (pruebas de destrucción),
> `docs/AUDIO_LIFECYCLE_REPORT.md` (fase P5), `docs/HARDWARE_CHECKLIST.md`
> (matriz física G1–G6).

---

## P5.7 — Validación runtime REAL en emulador (2026-08-16)

La matriz destructiva se ejecutó físicamente en el emulador (Android 14, AVD
`vyneural-test`, APK debug con el código congelado). Evidencia completa y
timestamped en **`docs/RUNTIME_MATRIX.md`**. Resumen:

| Test | Resultado |
| --- | --- |
| T1 Idle torture (0 START sin causa) | ✅ PASS |
| T2 PLAY → destrucción (lock/unlock/bg/fg/recreate) | ✅ PASS — startId estable, 1 START |
| T3 STOP absoluta (0 START después de STOP) | ✅ PASS |
| T4 Audio Focus (GAIN jamás reproduce) | ✅ PASS — JS físico + nativo estático |
| T5 Crash/process death (PLAY/PAUSE/STOP + kill) | ✅ PASS — recovery nunca reproduce |
| T6 Alarmas (APK abierta y cerrada) | ✅ PASS — notifica, nunca PLAY |
| T7 Ownership (1 MediaSession, 1 AudioTrack, web mute) | ✅ PASS |
| T8 100 cambios durante PLAY | ✅ PASS — gain 0, PLAYING, sin START nuevo |
| T9 Idempotencia (PLAY×3/PAUSE×2/STOP) | ✅ PASS — sin comandos duplicados |
| T10 H1 runtime (RETUNE sin servicio) | ✅ PASS — no crea servicio |

**Spontaneous PLAY = 0** en toda la matriz. Hallazgos nuevos NO bloqueantes:
**R1 (P3)** la máquina JS queda en `INITIALIZING` tras recargar el WebView con
sesión nativa activa (falta `started` en `syncUiWithNativeSession`); **R2 (P3)**
los comandos de config (volumen/onda/estado) no tienen debounce → `startId` se
infla sin crear reproducción; **R3/R4 (P4)** dos etiquetas visuales de
`Diagnostics` imprecisas (focusState tras stop; nombre del canal de alarmas).

**Estado**: `CODE PASS / RUNTIME PASS (emulador) / RELEASE PENDING (hardware)`.
Pendiente físico en hardware real: LOSS real por segunda app, alarma tras
reboot, Bluetooth, llamada entrante, instalación en dispositivo.

---

## P5.8 — Auditoría fresca + fixes R1/R2/F2 (2026-08-16)

Re-auditoría exhaustiva sobre los archivos ACTUALES (no se asumió que los 6
bugs de la FASE 1 eran los últimos): se re-mapearon TODOS los callers de
`start()`, `resumeSession()`, `startBackgroundAudio()`, `transport.play()`,
`audioAnchor.play()`, los eventos nativos y los handlers de lifecycle que
podrían llegar a PLAYING, más el servicio Kotlin (START_NOT_STICKY,
`handleNullIntentRestart`, GAIN con `shouldPlay`).

### Veredicto de la auditoría fresca

| Vía | ¿Puede llegar a PLAYING? | Veredicto |
| --- | --- | --- |
| `start()` desde playBtn / quickStart / Espacio / `__vyneural.play·toggle` / MediaSession 'play' / evento nativo 'playing' (espejo de acción real) | Solo acciones explícitas | ✅ limpio |
| `syncNativeAudioStart` (1 START) / `syncNativeAudioResume` (1 RESUME) | Protocolo P5.2 | ✅ limpio |
| RESTORE (`requestRestore` ← visibility/pageshow/focus/resume/pointerdown) | Guard `if (!playing) return` | ✅ limpio |
| GAIN nativo / service recreation / BOOT | START_NOT_STICKY + `NO_AUTO_PLAY`; GAIN solo resume si `shouldPlay` | ✅ limpio |
| Alarma (web/PWA y APK) | B1: notifica, nunca PLAY | ✅ limpio |
| **Mixer de ambiente sin sesión → `start()`** | **config → PLAY** | 🔴 **F2 (NUEVO, corregido)** |
| `syncUiWithNativeSession` tras recarga | `system_play` sin `started` → INITIALIZING colgado | 🟠 R1 (corregido) |
| Config nativa sin coalescing (vol/onda/estado) | startId inflado 3→78 | 🟠 R2 (corregido) |
| `diagnostico.js` btn-beep / btn-bg | Botones explícitos del diagnóstico (gesto) | ✅ limpio |

### Fixes aplicados (secuencia controlada)

1. **F2 (P2, hallazgo NUEVO)** — el mixer de ambiente ya NO llama `start()`
   sin sesión: guarda la configuración y avisa "toca play para comenzar".
   Antes, un toque en un sonido de ambiente arrancaba la sesión completa
   (config → PLAY, violaba la jerarquía).
2. **R1 (P3)** — `syncUiWithNativeSession` ahora transiciona `started` tras
   `system_play` (igual que `start()` y el evento `vyneural:audioplayback`):
   la UI llega a PLAYING tras recargar el WebView con sesión nativa activa.
3. **R2 (P3)** — `NativeCommandCoalescer` en `native-protocol.js` (puro,
   testeado): los comandos de config nativos (volumen/onda/retune) se
   coalescen por ráfaga (120 ms trailing) → SOLO el último valor de la ráfaga
   llega al servicio. Los comandos de reproducción (START/RESUME/PAUSE/STOP)
   NO pasan por ahí (siempre directos y síncronos).

### Tests

- Suite: **113/113** (Node y navegador). Nuevos: test dinámico del coalescer
  (ráfaga = 1 comando, gana el último, `cancelAll`) y checks estáticos R1/R2/F2
  dentro de la jerarquía de comandos (lee main.js).
- Re-ejecución física en emulador con APK debug nueva (detalle en
  `docs/RUNTIME_MATRIX.md` §P5.8).

### Resultados de la re-ejecución (emulador)

| Verificación | Antes | Después |
| --- | --- | --- |
| T8: 100 cambios (vol/onda/cond/estado ×25) | startId 3→78 | **startId 3→6** (1 comando por tipo: level+wave+retune) |
| T2: recreación de Activity con sesión nativa | UI colgada en INITIALIZING | **UI en PLAYING** |
| T9: PLAY×2 / PAUSE×2 / PLAY (media dispatch) | startId se movía | **startId 6 estable** |
| H1: RETUNE con servicio muerto | — | **0 servicios, 0 MediaSessions, sin PLAY** |
| F2: ambiente sin sesión (web y APK) | arrancaba la sesión | **IDLE/STOPPED, 0 servicios** |
| STOP absoluta + lock/unlock | — | **0 servicios, 0 sesiones, causal intacta** |

**Spontaneous PLAY = 0** en la re-ejecución.

**Estado**: `CODE PASS / RUNTIME PASS (emulador) / RELEASE PENDING (hardware)`.
APK release firmada generada con los fixes P5.8 (SHA-256
`c8b8483dba91ef73993f5d25ab6c776d774da07a3c56d7058e1278f6feb6608a`,
`public/vyneural.apk`). Pendiente físico en hardware real: matriz G1–G6
(`docs/HARDWARE_CHECKLIST.md`).
