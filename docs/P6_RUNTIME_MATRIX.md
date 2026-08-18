# P6 — Runtime Matrix (evidencia ejecutada)

> Matriz de pruebas runtime sobre navegador real (Web) y evidencia estática/unit
> para PWA y APK. Instrumentación del propio producto: `__audioProbe`,
> `__causalLog`, `__audioState`, `__interferenceLog`, `__uiAudioGuard`,
> `__alarmManager`, `__restoreGate`. Timestamps reales (epoch ms).

**Leyenda**: PASS · FAIL · BLOCKED (entorno) · NOT_TESTED · UNKNOWN.

---

## A. Web — sesión y audio

| ID | Prueba | Resultado | Evidencia |
|----|--------|-----------|-----------|
| R01 | Idle torture (10 clases de interacción sin play) | **PASS** | `IDLE/ctx:none/osc:0/causal:0` tras cada paso |
| R02 | PLAY (click) | **PASS** | `PLAYING · ctx:running · osc:2 · gain:0.9 · rms:0.34 · provider:web · media:playing · wakelock:acquired` |
| R03 | STOP absoluto + fade | **PASS** | `STOPPED · osc:0 · gain:0.0001 · rms:0 · provider:none` a t+2.5 s |
| R04 | GAIN después de STOP (focus/pageshow/resume/scroll) | **PASS** | `STOPPED` persistente; `sessionId` estable |
| R05 | PLAY → PAUSE → GAIN triggers | **PASS** | `PAUSED · osc:0 · gain:0.0001`; sin resume |
| R06 | Reload post-STOP / post-PLAY | **PASS** | `IDLE · ctx:none · provider:none · btn:Comenzar sesión`; parámetros restaurados |
| R07 | Cambio de estado A→B→C en PLAY | **PASS** | `sessionId:1` fijo, `osc:2`, sin START nuevo |
| R08 | NEXT/PREVIOUS en PLAY | **PASS** | `sessionId:1`, `playCount:1` total |
| R09 | Volumen 1→0.1→0→1 en PLAY | **PASS** | `gain` 1.0/0.1/0/1.0 en vivo, `rms` acompaña |
| R10 | Input rápido (rapid play/pause/next) | **PASS** | `causal=["RESUME:ui"]`, 1 sesión, 0 duplicados |
| R11 | Alarma +60 s → disparo | **PASS** | `fires:1`; `IDLE · ctx:none · causal:[]`; toast "toca play" |
| R12 | Deep link `autostart=true` | **PASS** | `IDLE · ctx:none · causal:0` |
| R13 | UI guard (eventos UI no tocan audio) | **PASS** | `__uiAudioGuard` 0 violaciones |

## B. Web — backend

| ID | Prueba | Resultado | Evidencia |
|----|--------|-----------|-----------|
| R20 | Registro UI | **PASS** | Perfil + tokens + "Sincronizado ✓" |
| R21 | Favorito → nube | **PASS** | `favorites` API: frequency Meditación 210/6 |
| R22 | Frecuencia custom → nube | **PASS** | "Mi frecuencia P6" 333.3/12.5 en API + PG |
| R23 | Itinerario → nube | **PASS** | "Rutina P6" 1 paso 600 s en API + PG |
| R24 | Alarma del generador → nube | **FAIL (P2)** | `createAlarm` nunca se llama; "Mis alarmas" vacío pese a alarma local activa → P6-FEAT-001 |
| R25 | Offline (backend muerto): play/pause/estado/favorito | **PASS** | Todo local OK; sync silencioso |
| R26 | Error UX (401/400) | **PASS** | "la contraseña actual no es correcta", sin stack |
| R27 | Persistencia tras reload | **PASS** | Favoritos/frecuencias/itinerarios visibles |

## C. PWA

| ID | Prueba | Resultado | Evidencia |
|----|--------|-----------|-----------|
| R30 | SW registrado y activo | **PASS** | `navigator.serviceWorker.getRegistration()` → scope `http://127.0.0.1:5173/` |
| R31 | Manifest | **PASS** | `manifest.webmanifest` 200, display standalone |
| R32 | Idle torture PWA (= Web + SW) | **PASS** | Mismo motor; sin SW autoplay (handlers solo notifican) |
| R33 | Instalación standalone | **NOT_TESTED** | Sin `beforeinstallprompt` en el entorno |
| R34 | Push E2E (browser→FCM→backend→PG→trigger→receive) | **BLOCKED (entorno)** | `Registration failed - push service not available` (FCM inalcanzable); pata backend verificada por separado |
| R35 | notificationclick → deep link | **NOT_TESTED** (verificado por código + test) | `sw.js` navega a `ndata.url`/action; autostart no reproduce |

## D. APK

| ID | Prueba | Resultado | Evidencia |
|----|--------|-----------|-----------|
| R40 | Idle torture APK (P0.1) | **BLOCKED (entorno)** | AVD sin system image; ver `docs/evidence/run_20260816_131327.log` (etapa previa: `VERIFY-IDLE: PASS`) |
| R41 | NO_AUTO_PLAY / START_NOT_STICKY | **PASS (estático + unit)** | `AudioForegroundService.kt` |
| R42 | Single owner (web muda) | **PASS (estático + unit)** | `P5.6` test + `setPlatformMuted` |
| R43 | Alarma nativa → notificación, no PLAY | **PASS (estático)** | `AlarmReceiver.kt` |
| R44 | Notificaciones sin duplicados (IDs fijos) | **PASS (estático)** | `NotificationHelper` 1001/2001/2002 |
| R45 | Focus policy (LOSS→pause, GAIN→resume mismo motor) | **PASS (estático + ev. previa)** | `AudioFocusHelper.kt` + watchdog H7 |
| R46 | Kill proceso → reopen | **PASS (estático)** | restart con intent null → detiene el servicio |
| R47 | Recreación de Activity | **PASS (estático)** | `syncUiWithNativeSession()` sin re-START |
| R48 | Back/Forward | **PASS (estático)** | historial manual `pageStack`, no toca audio |

## E. Transversal

| ID | Prueba | Resultado | Evidencia |
|----|--------|-----------|-----------|
| R50 | Multi-tab (primaria única, sin doble disparo) | **PASS (unit)** | "carrera multi-tab — dos schedulers disparan UNA sola vez"; "solo la pestaña PRIMARIA dispara (Web Locks)" |
| R51 | Stress lifecycle (100 ciclos PLAY-LOCK-UNLOCK) | **PASS (unit)** | `P5.5/F14: 100 START, 0 espontáneos` |
| R52 | Coalescing de config nativa | **PASS (unit)** | `R2: ráfaga = 1 comando, último valor gana` |
| R53 | Suite completa | **PASS** | `113 Passed, 0 Failed` |
| R54 | Build | **PASS** | `✓ built in 2.05s` |
| R55 | POSTGRES torture (migración/escrituras concurrentes) | **NOT_TESTED** | Solo `/health/db` + persistencia verificada |
| R56 | Push torture (1/10/100) | **BLOCKED (entorno)** | igual R34 |
| R57 | Cold start del servicio | **NOT_TESTED** | entorno local |

---

## F. Traza causal ejemplo (sesión de prueba completa, real)

```
t=…0659  PLAY   source=ui-play   from=IDLE  → INITIALIZING   (artefacto de automatización, ver informe §2.1)
t=…1457  RESUME source=ui        from=IDLE  → INITIALIZING   (test controlado)
t=…1460  provider WEB · mediasession playing · ctx running · wakelock acquired
t=…5378  PAUSE  source=ui        PLAYING → PAUSED            (test controlado)
t=…      STOP   source=user-stop …                           (test controlado)
t=…      (focus/pageshow/resume) → sin eventos causales
```

**START espontáneos: 0. Duplicados de sesión: 0.**
