# P4 — Perfiles de plataforma: Web / PWA / APK con ownership diferenciado

> Cierre técnico posterior al feedback de arquitectura: la APK NO es "Web con más
> permisos". Es un runtime Android con audio y alarmas nativas. Web y PWA siguen
> siendo runtimes web. Este reporte fija el contrato de tres perfiles y documenta
> los hallazgos P4-A..P4-D con evidencia de emulador (Android 14) y Chrome real.

## 1. Contrato congelado: tres perfiles explícitos

| Superficie | Web | PWA | APK |
|---|---|---|---|
| Audio | Web Audio | Web Audio | Motor nativo (Foreground Service) |
| Alarma | Scheduler web | Scheduler web | AlarmManager del teléfono (SO) |
| Notificación | Web (como está) | Web (como está) | Nativa autónoma (con o sin APK abierta) |
| Alarma recurrente (rutina por días) | **NO** (una sola vez) | **NO** (una sola vez) | **SÍ** — AlarmManager reprograma solo (con vibración) |
| Página `/rutina` | Oculto (aviso APK-only) | Oculto (aviso APK-only) | Disponible (lista + tira semanal L M X J V S D) |
| Navegación | Web | Web | WebView + BACK del sistema |

Reglas de ownership (eliminan la ambigüedad que causaba los bugs previos):

- **WEB / PWA**: NO NativeBridge, NO AlarmManager Android, NO audio nativo.
  El scheduler web es dueño de la alarma; la notificación web queda intacta.
- **APK**: Audio nativo = owner (la web queda muda, solo visualizador);
  AlarmManager Android = owner temporal de la alarma (el scheduler web es
  solo espejo de UI, `external` → nunca dispara); la notificación de alarma
  es nativa y autónoma (NO depende de que la UI esté abierta).

## 2. P4-A — APK Alarm Ownership ✅ PASS

**Contrato**: la alarma pertenece al reloj del sistema (AlarmManager
`RTC_WAKEUP` + `setExactAndAllowWhileIdle` cuando hay permiso, si no ventana de
60 s honesta). `AlarmReceiver` publica la notificación **independientemente del
estado de la UI** — con la APK abierta, cerrada, proceso muerto o pantalla
bloqueada. Tras reboot, `BootReceiver` reprograma desde la persistencia local.

**P5 — Rutina recurrente (exclusiva de la APK)** ✅ PASS:
- El selector de días (L M X J V S D) solo existe dentro de la APK; web/PWA
  guardan recordatorios de una sola vez (la web no puede reprogramar con la
  pestaña cerrada).
- `SCHEDULE_ALARM` con `days` → el reloj del SO guarda el patrón; al dispararse,
  `AlarmReceiver` reprograma a la PRÓXIMA ocurrencia (misma hora, próximo día
  del patrón) y la notificación llega con el proceso muerto. Verificado:
  `origWhen=2026-08-17 16:28:00` (lunes) desde un disparo del sábado.
- Tras reboot, `BootReceiver.rescheduleAll()` recalcula la próxima ocurrencia.
- Vibración: canal `bineural_alarms_v2` (patrón `[0,500,300,500,300,700]`); el
  ID cambió porque los canales Android son inmutables y las instalaciones
  previas heredaban el canal sin vibración.

**Verificado en emulador (proceso muerto)**:
1. `SCHEDULE_ALARM` vía bridge → `dumpsys alarm` muestra el PendingIntent en el
   reloj del SO: `RTC_WAKEUP #6 … tag=*walarm*:com.vyneural.bineural.ALARM_p4a-test-1`.
2. `kill -9` del proceso (APK "cerrada"): el reloj del SO conserva la alarma.
3. Al dispararse (~100 s después), Android despierta el proceso solo para el
   broadcast: `AlarmReceiver` consume el registro (`prefs` → 0) y publica **una**
   única notificación nativa: `android.title=Sesión P4-A`.
4. Sin doble disparo: el espejo web (`external`) nunca dispara en paralelo
   (test I6) y el conteo de notificaciones fue 1.

> Nota: si `POST_NOTIFICATIONS` está denegado (Android 13+), la notificación no
> se muestra — comportamiento honesto y respetado por el código; la app la
> solicita en el gesto de guardar la alarma.

## 3. P4-B — APK Navigation ✅ PASS (con 1 defecto real corregido)

**Defecto encontrado**: `webView.canGoBack()` siempre devuelve `false` con
`file://` + `shouldOverrideUrlLoading` (el historial del WebView no acumula
entradas; `history.length` se mantuvo en 1 tras navegar). El BACK del sistema
**salía de la app** en vez de volver a la página anterior.

**Fix**: historial manual de páginas en `MainActivity` (`pageStack` +
`OnBackPressedDispatcher.addCallback`). BACK navega a la página anterior real
y solo cierra la app cuando el stack se agota (estamos en la home).

**Verificado en emulador**:
- index → click en "Privacidad" → BACK → **vuelve a index** (URL confirmada),
  la Activity sigue en primer plano (no cierra).
- El audio nativo **nunca se interrumpe** por navegación: `dumpsys media_session`
  mostró `PLAYING` con posición avanzando durante todo el recorrido.
- Al volver a la home, la UI se **re-sincroniza desde el estado nativo**
  (P4-B sync): `playing=true`, frecuencias 210/6, provider `native`,
  `sessionId=1` **estable** (la sesión nunca se re-arranca).

**Forward**: auditado — no hay botón de forward en la app (el sistema Android
no tiene hardware de forward) y no se expone. Se documenta la separación:
`MediaSession.previoustrack/nexttrack` navegan **contenido** (estados de la
sesión, `selectState`), NUNCA páginas del WebView. Tres mecanismos distintos:
anterior/siguiente de contenido, back/forward de páginas, controls de
MediaSession — ninguno modifica el audio.

## 4. P4-C — Web/PWA Audio Forensics ✅ PASS (ruta audible única)

**Mapa de la ruta audible web** (verificado en Chrome real, headless 151, y en
la WebView 113 del emulador):

```
AudioContext → masterGain → compressor → analyser → outputTap
                                                     │
                            'element' (Android/desktop) │ 'direct' (iOS, fallback)
                                                     │
                          MediaStreamDestination      ctx.destination + ancla muda
                                                     │        (solo iOS)
                                             <audio> real
```

**Evidencia (Chrome real, sesión en play)**:
- `transport.mode = 'element'`, `elementReadyState=4`, `elementPaused=false`,
  `elementCurrentTime` avanzando → **una sola** vía audible hacia el SO.
- `gain = 0.6` (volumen real), `rms = 0.267` (señal presente), `ctx running`.
- `sessionId = 1`, `liveSources = [1, 2]` → exactamente un par estéreo,
  un pipeline (sin doble motor).
- **Sin ancla muda en DOM** (`audioElements: []`): el ancla solo existe en
  modo 'direct' (iOS) — no hay ruta audible duplicada.
- `singleProvider = true` en cada muestra; `mediaSession` con metadata
  correcta (Meditación · Theta 6 Hz · 210/216 Hz).
- **Interacciones de UI** (cambiar estado, abrir/cerrar menú, scroll, volumen,
  cambio de visualizador): `ctx` permaneció `running`, `sid` estable en 1,
  sin suspensión ni recreación — **el síntoma histórico "el audio se corta al
  interactuar" NO se reproduce** en web.
- Badge de plataforma: oculto en web sin bridge (sin falso "APK").

## 5. P4-D — APK Play transient ✅ PASS (causa encontrada y corregida)

**Medición (emulador, timestamps del primer PLAY)**: sin contienda de audio
focus (`focusReacquireCount=0`, `focusUnknownCount=0`), gain web estable en 0
(mute correcto), sin watchdog. El transient no venía de la web.

**Causa real**: el motor nativo arrancaba con `volume` **fijo 0.6**
(`BinauralToneEngine` default) y el `SET_AUDIO_LEVEL` con el nivel del usuario
llegaba después. Con el volumen del usuario distinto de 0.6, el fade-in
arrancaba al default y hacía un **overshoot breve** al pulsar play.

**Fix (plataforma, sin tocar core)**:
- `START_BACKGROUND_AUDIO` recibe `level` en el payload (JS envía `volumeLevel`).
- `AudioForegroundService.ACTION_START` aplica `engine.setVolume(level)`
  **antes** de `engine.start()` → el fade-in arranca al nivel del usuario.

**Verificado en emulador**: sesión iniciada con slider en 0.25 →
`GET_AUDIO_STATE` reporta `volume: 0.25` desde el primer instante (antes
persistía 0.6). El fade-in exponencial del motor (5 %/bloque) se mantiene
suave; no se introdujo ningún fade/workaround adicional.

## 6. Matriz P0 → P4 (estado)

| Área | Estado |
|---|---|
| CORE_INTEGRITY (cymatics/wavefield/simulation/experiments) | ✅ CLEAN |
| P0 Separación Core/Platform + bridge whitelist | ✅ PASS |
| P1 Pipeline único + alarma nativa + MediaSession | ✅ PASS |
| P2 Forense MediaSession/Focus (incl. UNKNOWN endurecido) | ✅ PASS (cierre lógico) |
| P3 Persistencia / crash recovery | ✅ PASS |
| **P4-A Alarma APK autónoma** | ✅ PASS |
| **P4-B Navegación APK (BACK + re-sync UI)** | ✅ PASS |
| **P4-C Forense audio Web/PWA (ruta única)** | ✅ PASS |
| **P4-D Transient del play APK** | ✅ PASS |
| Tests | ✅ 104/104 |
| Hardware físico (Bluetooth real, kill OEM, reboot real) | ⚠️ NOT_TESTED |

## 7. Seguimiento (validaciones posteriores al cierre P4)

- **Traza de navegación en /diagnostico**: nuevo comando `GET_NAV_STATE` (página
  actual, historial manual, BACK habilitado). El bridge lo lee del campo
  cacheado `currentPage` (`@Volatile`): leer `webView.url` desde el hilo
  JavaBridge lanzaba el warning de WebView-thread (defecto encontrado y
  corregido). Verificado: `index → privacidad` → `{current: privacidad,
  stack: [index], backEnabled: true}` y el panel de /diagnostico lo muestra.
- **Cadena de alarma automatizada**: `scripts/alarm-chain-test.mjs` — programa,
  verifica el PendingIntent, mata el proceso, espera y verifica la notificación
  única + registro consumido. **6/6 PASS** en ejecución real.
- **PWA auditada**: `scripts/pwa-audit.mjs` — instalabilidad **PASS 7/7**
  (manifest display=standalone, iconos 192/512, SW registrado y controlador,
  HTTPS) y runtime standalone (Chrome `--app`, display-mode `standalone`)
  **PASS 7/7** (ruta única, MediaSession, badge="PWA", ctx no suspendido en
  segundo plano). El Chrome del emulador crashea (x86_64), así que la
  instalación WebAPK real queda en el plan de hardware.
- **Plan de hardware**: `docs/HARDWARE_TEST_PLAN.md` — H1 (alarma con app
  cerrada) PASS; H2/H3 parciales (screen off con AudioTrack `state:started` y
  notificación `vis=PUBLIC`); H4-H8 `NOT_TESTED` con dispositivo exacto.

## 8. Cambios de esta fase

- `android/…/MainActivity.kt` — historial manual de páginas + `OnBackPressedDispatcher` (P4-B); `navState()` + `currentPage` cacheado (traza /diagnostico).
- `android/…/AudioForegroundService.kt` — `level` en `ACTION_START` (P4-D); `PREFS_SESSION` público (P4-B).
- `android/…/AndroidBridge.kt` — `GET_AUDIO_STATE` con base/beat/wave/volume/title (P4-B); `level` en START (P4-D); `GET_NAV_STATE` (traza).
- `android/…/BridgeCommands.kt` — `GET_NAV_STATE` en la whitelist.
- `src/main.js` — `syncUiWithNativeSession()` en boot + `parseBridgeResponse` (P4-B); `level` en START (P4-D).
- `src/platform/native-bridge.js` — export `parseBridgeResponse` + `getNavState` (P4-B/traza).
- `src/diagnostico.js` / `diagnostico.html` — panel de Navegación (P4-B).
- `scripts/alarm-chain-test.mjs` — cadena de alarma automatizada.
- `scripts/pwa-audit.mjs` — auditoría PWA (instalabilidad + standalone).
- `src/validation/diagnostics.js` — tests P4 (parser del bridge + perfiles de plataforma) → 104/104.
