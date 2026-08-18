# P6 — Backend + Web/PWA/APK Integration Forensic

> Auditoría forense destructiva de **Vyneural** como producto único (Web · PWA · APK ·
> backend · PostgreSQL · Web Push), ejecutada el **2026-08-17** contra:
> - Frontend `dev` @ `http://127.0.0.1:5173` (Vite, proxy `/api`)
> - Backend FastAPI `vyneural-backend` @ `http://127.0.0.1:8000` (uvicorn, venv local)
> - PostgreSQL local (puerto 5432, `/health/db` → `{"database":"ok"}`)
> - Suite `npm test` → **113/113 PASS** · `npm run build` → **OK (2.05 s)**
>
> Regla de oro aplicada: **UNKNOWN no es PASS**. Estado solo de la enumeración
> {PASS, FAIL, BLOCKED, NOT_TESTED, UNKNOWN}.

---

## 0. Alcance y metodología

### 0.1 Invariantes P0 auditadas

1. **Si el usuario no tocó Play, ningún camino (Web, PWA, APK, backend, Push,
   alarma, Service Worker, lifecycle, restore, sync, reload, notificación) puede
   producir audio de sesión.**
2. **Si el usuario tocó Play, Web/PWA reproducen por Web Audio y la APK por su
   motor nativo — nunca dos dueños audibles a la vez.**
3. STOP absoluto: tras STOP no existe ningún camino de reanudación autónoma.
4. Alarma/Push/notificationclick → aviso (notificación), nunca PLAY.

### 0.2 Enfoque

- **Fase 1 (estática)**: enumeración de TODOS los caminos de reproducción en
  `src/` (JS) y `android/` (Kotlin) con clasificación de su trigger.
- **Fase 2 (runtime)**: pruebas en vivo sobre el navegador real del preview con
  instrumentación ya existente en el producto (`window.__audioProbe`,
  `window.__causalLog`, `window.__audioState`, `window.__alarmManager`,
  `window.__interferenceLog`, `window.__uiAudioGuard`) — sin modificar código.
- **Fase 3 (backend)**: flujos reales desde la UI (`/cuenta`, generador) y
  verificación de "dispositivo B" por API directa + lectura directa de
  PostgreSQL.

### 0.3 Entorno

- Backend y Postgres arrancados localmente para la prueba (el backend no estaba
  corriendo al inicio; se levantó con el venv del repo y `.env` existente).
- **Emulador Android**: BLOCKED — el AVD `vyneural-test` no tiene system image
  instalada (`system-images/android-34/...` ausente). Las pruebas APK runtime se
  sustituyen por forense estático del código Kotlin + evidencia de emulador de
  la etapa anterior (`docs/evidence/run_20260816_*.log`) + unit tests.
- **Web Push end-to-end**: BLOCKED en la parte de entrega — el navegador del
  sandbox no puede registrarse en el push service (FCM inalcanzable:
  `Registration failed - push service not available`). La pata backend
  (subscribe → PostgreSQL → status) se verificó íntegramente.

---

## 1. Enumeración de caminos de reproducción (Fase 1 estática)

### 1.1 Caminos que SÍ crean reproducción (todos requieren gesto del usuario)

| # | Camino | Código | Gesto requerido | Clasificación |
|---|--------|--------|-----------------|---------------|
| A | Botón Play (UI) | `main.js:1474` → `resumeSession('ui')` → `start()` | Click | Legítimo |
| B | Quickstart "Iniciar" | `main.js:2066 quickStartSession()` → `start()` | Click explícito (2º paso del modal) | Legítimo |
| C | MediaSession play (lock screen / BT / notif) | `main.js:2691` (web) / `AudioForegroundService.kt` `handleSystemPlay` (APK) | Acción del usuario en el SO | Legítimo |
| D | API `window.__vyneural.play()` | `main.js:2656` | Llamada externa (bookmark/script) | Legítimo (documentado) |
| E | APK START nativo | `syncNativeAudioStart()` ← `start()`; solo vía puente desde A | — | Legítimo |
| F | Reanudación del watchdog de focus (APK) | `AudioForegroundService.handleFocusChange("GAIN")` → `engine.resume()` | **Política explícita de resume** (H7): si `shouldPlay`, al recuperar foco reanuda el MISMO motor. Ninguna otra app/resource puede dispararla. | Política documentada (ver 5.3) |

### 1.2 Caminos auditados como NO-reproducción (evidencia)

| Camino | Resultado | Evidencia |
|--------|-----------|-----------|
| Deep link `?autostart=true` | Configura estado + toast; **no** `start()` | `main.js:4553-4560`; test `P5.6` (`diagnostics.js:2256`); runtime §2.8 |
| Alarma web onFire | Notificación + chime + toast; **no** `start()` | `main.js:4235-4290`; test `B1` (`diagnostics.js:2264`); runtime §2.5 |
| Alarma nativa APK (AlarmManager) | `AlarmReceiver` → `NotificationHelper.showAlarm`; **no** toca el motor | `AlarmReceiver.kt` (solo notifica) |
| Web Push (SW) | `showNotification` únicamente | `public/sw.js` handler `push`; REGLA DE ORO en comentario |
| notificationclick | Enfoca ventana / navega deep link; **no** play | `public/sw.js` handler `notificationclick`; autostart no arranca (1.2) |
| Reload / pageshow / focus / resume / pointerdown | `requestRestore()` → `restoreFromBackground()` **retorna si `!playing`** | `main.js:2344-2360`; runtime §2.7 |
| Restore de sesión guardada | `restoreSession()` solo restaura parámetros (volumen, estado, timer); **no** reproduce | `main.js:3767-3830`; runtime §2.7 |
| visibilitychange (background/foreground) | No pausa ni reproduce; solo transición de máquina | `main.js:2390-2430`; runtime §2.2/2.7 |
| Back / Forward (APK) | Historial manual de páginas; **no** toca el audio | `MainActivity.kt` `onBack`; comentario P4-B |
| Recreación de Activity (APK) | `syncUiWithNativeSession()` alinea UI con el servicio; **no** re-START | `main.js:330-380`; comentario P4-B |
| Restart del servicio nativo (kill proceso) | `handleNullIntentRestart()` → **NO_AUTO_PLAY**, `START_NOT_STICKY` | `AudioForegroundService.kt` |
| Config nativa (retune/wave/volumen) | Descartada si el servicio no está vivo (config nunca revive audio) | `AudioForegroundService.retune/setWave/setVolume` + `serviceAlive()` |
| PAUSE de servicio inactivo | No-op (no crea audio) | `AudioForegroundService.pause()` |
| STOP de servicio inactivo | No-op | `nativeStopCommand()` → `'none'`; `AudioForegroundService.stop()` |

**Resultado Fase 1**: no existe ningún camino autónomo a PLAY. Todos los START
nativos se originan en el protocolo Web→Nativo (`start()` → `syncNativeAudioStart()`
→ `START_BACKGROUND_AUDIO`), que solo se alcanza desde un gesto de la UI/API.

---

## 2. Evidencia runtime (Web, navegador real)

> Trazas reales con timestamps. `probe = window.__audioProbe()`;
> `causal = window.__causalLog`.

### 2.1 P0.2 — Idle torture Web

Línea base tras cargar la página (sin tocar Play):

```json
{ "audioState": "IDLE", "ctx": "none", "causalLen": 0, "provider": "none",
  "singleOwnerOk": true, "oscCount": "n/a" }
```

Secuencia de 10 clases de interacción sin Play — estado tras CADA paso:

| Paso | acción | audioState | ctx | osc | gain | causal |
|------|--------|-----------|-----|-----|------|--------|
| 1 | selectState(sueno) | IDLE | none | 0 | 0 | 0 |
| 2 | selectState(relajacion) | IDLE | none | 0 | 0 | 0 |
| 3 | volumen 0.9 | IDLE | none | 0 | 0 | 0 |
| 4 | switch visualizador | IDLE | none | 0 | 0 | 0 |
| 5 | abrir panel ajustes | IDLE | none | 0 | 0 | 0 |
| 6 | cerrar panel | IDLE | none | 0 | 0 | 0 |
| 7 | portadora Solfeggio | IDLE | none | 0 | 0 | 0 |
| 8 | scroll | IDLE | none | 0 | 0 | 0 |
| 9 | focus/blur | IDLE | none | 0 | 0 | 0 |
| 10 | visibilitychange | IDLE | none | 0 | 0 | 0 |

**PASS** — 10/10 clases sin creación de AudioContext ni eventos PLAY.
`__uiAudioGuard`: 0 violaciones (ningún evento UI cambió el estado de audio).

> Nota metodológica: en una primera pasada automatizada se registró un
> `PLAY source=ui-play` que **no fue un bug del producto**: el click automático
> aterrizó en el botón play por un corrimiento de layout tras cerrar el modal de
> quickstart (evidencia: `ui-guard "click:play-btn"`, causado por coordenadas del
> snapshot stale). La repetición controlada (tabla anterior, clicks por id con
> verificación tras cada paso) demostró **0 reproducciones espontáneas**.

### 2.2 P0.4/P0.5 — STOP absoluto y gain después de STOP

PLAY (click real) →

```json
{ "audioState": "PLAYING", "ctx": "running", "osc": 2, "gain": 0.9, "rms": 0.34,
  "provider": "web", "mediaSession": "playing", "sessionId": 1, "wakelock": true }
```

STOP (`window.__vyneural.stop()`, mismo camino que la acción `stop` de MediaSession):

| t | audioState | osc | gain | rms | provider | sessionId |
|---|-----------|-----|------|-----|----------|-----------|
| +0 s (fade en curso) | STOPPED | 0 | 0.89 | 0.30 | none | 1 |
| +2.5 s | STOPPED | 0 | 0.0001 (piso) | 0 | none | 1 |
| +blur/focus/pageshow/resume | STOPPED | 0 | 0.0001 | 0 | none | 1 |
| +scroll | STOPPED | 0 | 0.0001 | 0 | none | 1 |

Luego **PLAY → PAUSE → GAIN triggers** (focus/pageshow/resume):

```json
{ "audioState": "PAUSED", "osc": 0, "gain": 0.0001, "provider": "none", "sessionId": 2 }
```

**PASS** — tras STOP/PAUSE ningún trigger de restore (focus, pageshow, resume,
scroll, visibility) reanuda. `sessionId` no se incrementa sin gesto.

### 2.3 P0.6 — Alarma web (ahora + 60 s, ventana de gracia 5 min)

- Programada desde la UI real (modal "Recordatorio de sesión").
- Disparo (tick 5 s): `alarmManager.fires: 1`, estado `TRIGGERED`.
- Estado de audio tras el disparo:

```json
{ "fires": 1, "audioState": "IDLE", "provider": "none", "ctx": "none",
  "uiPlaying": false, "status": "○ En pausa", "causal": [], "sessionId": 1 }
```

- Toast: `"Tu sesión está lista — toca play para comenzar 🎧"`.
- Permiso notificación: `granted`.

**PASS** — ALARMA → aviso (notificación + chime + toast), **cero PLAY de sesión**.

> Nota de política (P3, ver registro): el disparo en foreground reproduce un
> *chime* breve de 3 notas (Web Audio, `playChime()`), que es la **campanita de
> aviso** documentada — no la sesión binaural. Cumple "la alarma no arranca el
> reproductor" (test B1 protege contra `start()`), pero produce sonido sin gesto;
> requiere aprobación explícita de la política (hallazgo P6-ALARM-003).

### 2.4 P1.2/P1.3/P1.5/P2.7 — Cambio de frecuencia/estado/volumen e input rápido durante PLAY

| Paso | sessionId | osc | gain | provider | audioState |
|------|-----------|-----|------|----------|-----------|
| PLAY | 1 | 2 | 0.9 | web | PLAYING |
| NEXT ×2 | 1 | 2 | 0.9 | web | PLAYING |
| PREV ×3 | 1 | 2 | 0.9 | web | PLAYING |
| estado B (concentración) | 1 | 2 | 0.9 | web | PLAYING |
| estado C (relajación) | 1 | 2 | 0.9 | web | PLAYING |
| volumen 1.0 → 0.1 → 0 → 1 | 1 | 2 | 1.0→0.1→0→1.0 | web | PLAYING |

`playCount` (PLAY+RESUME totales) = **1**. `causal = ["RESUME:ui"]`.

**PASS** — una sola sesión, sin START duplicado, sin doble audio; el gain sigue
al slider en vivo.

### 2.5 P1.7 — Reload durante PLAY (política web)

Recarga tras una sesión en PLAY:

```json
{ "audioState": "IDLE", "ctx": "none", "provider": "none",
  "uiPlaying": false, "btnLabel": "Comenzar sesión", "causal": 0,
  "sel": "relajacion" }
```

**PASS** — el reload restaura parámetros (estado/portadora/volumen) y **nunca
reanuda** la reproducción. (En la APK el audio lo sostiene el servicio nativo;
la UI se re-sincroniza con `syncUiWithNativeSession()` sin re-START.)

### 2.6 P1.9 — OFFLINE (backend asesinado)

Con uvicorn detenido (`health` → 000): PLAY, PAUSE, cambio de estado y toggle de
favorito funcionan al 100%; el sync a la nube falla silenciosamente (best-effort,
`fav-sync` captura y retorna null); 0 violaciones del UI guard.

```json
playOffline:  { "audioState": "PLAYING", "osc": 2, "gain": 1, "provider": "web" }
pauseOffline: { "audioState": "PAUSED",  "osc": 0, "gain": 0.2 (fade), "provider": "none" }
favAfterToggle: ["meditacion", "sueno"]  // local OK
```

Backend restaurado después (`/health` → 200). **PASS** (degradación correcta).

### 2.7 P1.8 — Persistencia tras cierre/reapertura

Usuario `p6-forensic-0817@example.com` creado desde la UI; datos creados desde la
UI y verificados tras recarga completa y desde "dispositivo B" (API directa):

| Recurso | Creado vía | Visible en UI tras reload | Visible vía API (device B) | En PostgreSQL |
|---------|-----------|---------------------------|----------------------------|---------------|
| Usuario | registro UI | ✓ (perfil) | `me()` ✓ | `users` 1 fila |
| Favorito "Meditación" | estrella del generador | ✓ | `favorites` ✓ | (join) |
| Frecuencia "Meditación" | fav-sync automático | ✓ | `frequencies` ✓ | ✓ |
| Frecuencia "Mi frecuencia P6" (333.3/12.5) | modal UI | ✓ | ✓ | ✓ |
| Itinerario "Rutina P6" (1 paso, 600 s) | `/cuenta` UI | ✓ | `itineraries` ✓ | ✓ |
| Alarma del generador | modal UI | ✓ local | **✗ ausente** (gap, ver hallazgo P6-FEAT-001) | — |
| Suscripción push | API (UI bloqueada por entorno) | — | 201 + `subscription_count` | `push_subscriptions` ✓ |

**PASS con hallazgo** — ver P6-FEAT-001 (alarmas no sincronizan).

### 2.8 Deep link / autostart (runtime)

Carga `/?freq=210&beat=6&autostart=true` (el deep link que genera la notificación
de alarma): toast "Tu sesión está lista — toca play", **audioState IDLE, ctx
none, causal 0**. **PASS.**

### 2.9 P2.4 — Error UX

Cambio de contraseña con contraseña actual incorrecta (backend vivo):
mensaje limpio `"la contraseña actual no es correcta"`; **sin** stack trace,
excepción Python, SQL ni URLs internas (`hasStack: false`). **PASS.**

---

## 3. Backend — flujos reales (no Swagger)

Verificado desde la UI y contra la API con el token del usuario:

```
REGISTER  ✓  (UI: perfil + tokens + "Sincronizado ✓")
LOGIN     ✓  (UI y API)
ME        ✓  (API: email/username correctos)
CREATE FREQUENCY ✓ (UI modal → POST → PG)
FAVORITE  ✓  (UI estrella → frequency+favorite en PG)
CREATE ITINERARY ✓ (UI /cuenta → PG)
CREATE ALARM → ✗ NO llega al backend (P6-FEAT-001)
PUSH SUBSCRIBE ✓ (API: 201 + PG; UI bloqueada por push service del entorno)
LOGOUT/LOGIN (refresh) — cubierto por diseño (client.js refresh único por 401)
```

Refresh: `client.js` implementa refresh **una sola vez por 401 con promesa única**
(`tryRefresh`) — no existe camino de bucle infinito de refresh. Token en memoria
+ localStorage; error normalizado `ApiError {status, detail, code}`.

**PASS (con P6-FEAT-001).**

---

## 4. APK — forense estático Kotlin (runtime BLOCKED)

| Invariante | Evidencia | Estado |
|------------|-----------|--------|
| Restart del proceso no reanuda audio | `handleNullIntentRestart()` → `NO_AUTO_PLAY` + `START_NOT_STICKY` | **PASS (estático)** |
| Un solo motor | `BinauralToneEngine` único en `AudioForegroundService`; `start()` idempotente (`if (playing.getAndSet(true)) return`) | **PASS (estático)** |
| WebView no autoplay | `mediaPlaybackRequiresUserGesture = true` | **PASS (estático)** |
| Web muda en APK (single owner) | `setPlatformMuted(true)` permanente + `muteWebForNative()` + `assertSingleAudioProvider()`; test `P5.6: en APK el motor web es PERMANENTEMENTE inaudible` | **PASS (estático + unit)** |
| Alarma nativa no reproduce | `AlarmScheduler` (AlarmManager exacto/window) → `AlarmReceiver` → `NotificationHelper.showAlarm` (canal `bineural_alarms_v3`, USAGE_ALARM); sin contacto con el motor | **PASS (estático)** |
| Alarma sobrevive a app cerrada / reboot | AlarmManager + `BootReceiver` (reschedule) | **PASS (estático)** |
| Sin duplicados de notificación | IDs fijos `NOTIF_PLAYER=1001`, `NOTIF_ALARM=2001`, `NOTIF_SESSION_END=2002` | **PASS (estático)** |
| MediaSession honesta | `PlaybackState` refleja el estado real; `setActive(false)` en onCreate | **PASS (estático)** |
| Controles del SO → mismo motor | `onSkipToNext/onSkipToPrevious/onSeekTo` retunean el MISMO motor (`stepFrequency`) | **PASS (estático)** |
| Bridge whitelist | `BridgeCommands.isAllowed` + payload validado + aislamiento de fallos | **PASS (estático)** |
| Permisos mínimos | Manifest: INTERNET, POST_NOTIFICATIONS, FOREGROUND_SERVICE(+MEDIA_PLAYBACK), WAKE_LOCK, SCHEDULE_EXACT_ALARM, RECEIVE_BOOT_COMPLETED, MODIFY_AUDIO_SETTINGS | **PASS (estático)** |
| Evidencia de emulador previa | `docs/evidence/run_20260816_131327.log`: `VERIFY-IDLE: PASS — svc=0 msess=0 js=STOPPED`, AudioTracks/focus reales | Complementaria |

**Runtime APK: BLOCKED (entorno)** — AVD sin system image; no se pudo bootear.

---

## 5. Hallazgos

Resumen (detalle en `P6_BUG_REGISTER.md`):

| ID | Severidad | Resumen |
|----|-----------|---------|
| P6-FEAT-001 | **P2** | Las alarmas del generador (web/PWA) no se sincronizan al backend: `createAlarm` nunca se llama desde el generador y la cola de sync está inerte; la UI de `/cuenta` afirma "alarmas viven en la nube" pero la lista backend queda vacía. |
| P6-FEAT-002 | P3 | `enqueueLocal()/drainQueue()` definidos en `api/sync.js` pero sin ningún llamador: el "sync" real es POST directos best-effort, sin cola offline ni reintentos. Deuda documentada. |
| P6-ALARM-003 | P3 | El chime de alarma en foreground es sonido sin gesto (3 notas). Política documentada y protegida contra `start()` por el test B1, pero requiere aprobación explícita si la regla P0.6 se lee en su forma literal ("audio = NO"). |
| P6-UX-001 | P3 | `/cuenta` no re-renderiza la lista de itinerarios (y probablemente frecuencias/alarmas) tras crear/borrar: hay que recargar para ver el cambio. |
| P6-OBS-001 | P3 | Tras STOP/PAUSE el AudioContext web queda en `running` (silencioso, gain al piso). Decisión de no exigir nuevo gesto; sin audio audible. |
| P6-POL-001 | P3 | APK: política explícita de resume tras recuperar audio focus (watchdog H7). Es la política documentada de la mayoría de reproductores; NO es reproducción espontánea (requiere que la sesión estuviera en `shouldPlay`). |

**P0 = 0 · P1 = 0 · P2 = 1 · P3 = 5.**

---

## 6. Veredicto resumido

| Área | Veredicto |
|------|-----------|
| WEB | **PASS** |
| PWA | **CONDITIONAL PASS** (instalación standalone y push E2E no ejecutables en el entorno; SW activo y handlers verificados) |
| APK | **CONDITIONAL PASS** (forense estático + evidencia previa; runtime BLOCKED por entorno) |
| BACKEND | **PASS** (con P6-FEAT-001) |
| POSTGRES | **PASS** |
| WEB PUSH | **CONDITIONAL PASS** (pata backend verificada; entrega al navegador BLOCKED por entorno) |
| AUDIO | **PASS** |
| ALARMS | **PASS** (con P6-ALARM-003 a decidir) |
| NOTIFICATIONS | **PASS** |
| AUTH | **PASS** |
| SYNC | **CONDITIONAL PASS** (favoritos/frecuencias/itinerarios OK; alarmas no — P6-FEAT-001) |
| UX | **CONDITIONAL PASS** (P6-UX-001; P2.5/P2.6 viewport/touch NOT_TESTED en vivo) |
| SECURITY | **PASS** (ver P6_SECURITY_FORENSIC.md) |

> ⚠️ **Regla de release**: con P2 > 0 no se declara PRODUCTION READY hasta cerrar
> P6-FEAT-001 (o su mitigación explícita). P3 presentados como deuda pendiente.
> Ver informe final completo al cierre de este documento.

---

## 7. Reproducción del entorno de prueba

```bash
# backend
cd ../backvyneural/backend && ./.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000
# frontend (proxy /api → 8000)
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173
# suite + build
npm test && npm run build
```
