# P3 — PERSISTENCIA Y CRASH RECOVERY

**Fecha:** 2026-08-15 · **Entorno:** emulador Android 14 (API 34), APK debug con los fixes, CDP + dumpsys + run-as.

**Regla P0:** `cymatics.js`, `wavefield.js`, `simulation.js`, `experiments.js` **intactos** (verificado vs HEAD). P3 trabajó solo en la capa de plataforma/persistencia.

---

## 1. INVENTARIO — ¿QUÉ SE PERSISTE Y DÓNDE?

| Datos | Almacén | Formato | Restauración |
|---|---|---|---|
| Sesión actual (`ob-session-v1`) | localStorage | JSON (estado, volumen, ambientes, timer, wave, custom, goal) | `restoreSession()` al cargar; deep links tienen prioridad |
| Favoritos (`ob-favs-v1`) | localStorage | Array de ids | `new Set(...)` al cargar |
| Historial (`ob-history-v1`) | localStorage | Array de registros {id, name, band, min, ts} | `updateHistory()`/`renderHistory()` |
| Visualizador (`ob-viz-v1`) · Portadora (`ob-carrier-v1`) | localStorage | string | Al cargar |
| Preferencias UI (quickstart, install banner, cookie, HUD, settings abiertos) | localStorage | string | Al cargar |
| Alarmas (web/PWA) | **IndexedDB** `vyneural-alarms-db` + mirror localStorage `vyneural_alarms` | JSON por id | `AlarmManager.init()` (importa legacy también) |
| Alarmas (APK) | **SharedPreferences** `bineural_alarms` (Kotlin) | JSON por alarmId | `BootReceiver` reprograma tras reboot |
| **Sesión de audio (APK)** | **SharedPreferences** `vyneural_audio_session` **(NUEVO en P3)** | base/beat/wave/volume/title/shouldPlay | Restart `START_STICKY` (kill por el SO) |
| Backup/restore manual | Archivo .json descargado | `backupPayload()`/`importBackup()` con `BACKUP_KEYS` | Import valida formato y recarga |

## 2. RUTAS DE RESTAURACIÓN (crash recovery web)

- **Recarga de pestaña:** `saveSession()` se llama en cada cambio + `beforeunload` + `visibilitychange(hidden)` → la sesión queda guardada milisegundos antes de cualquier cierre; `sanitizeSession` + `restoreSession` la recuperan.
- **Alarma → deep link:** `?freq=&beat=&wave=&autostart=true` configura el estado exacto del recordatorio y arranca el audio (el clic en la notificación cuenta como gesto).
- **Alarmas multi-tab:** Web Locks elige la pestaña PRIMARIA (única que dispara); BroadcastChannel sincroniza la UI; el store durable cierra la carrera al confirmar antes de disparar.
- **Kill del proceso (APK):** `START_STICKY` recrea el servicio con `intent == null` → **restaura la MISMA sesión** (P3).

## 3. HALLAZGOS Y FIXES

| # | Hallazgo | Gravedad | Fix |
|---|---|---|---|
| F1 | **El restart `START_STICKY` (proceso eliminado por el SO mientras sonaba) arrancaba el servicio SIN motor**: la notificación decía "Reproduciendo…" pero no había audio, y las frecuencias volvían a 220/6 Hz por defecto | **ALTA (crash recovery roto)** | Persistencia de la sesión de audio en `vyneural_audio_session` (base/beat/wave/volume/title/shouldPlay); `restorePersistedSession()` en `onStartCommand(null)` restaura el MISMO motor con las mismas frecuencias + re-solicita focus + MediaSession PLAYING. `clearSession()` en STOP/stop del sistema. `onDestroy` NO limpia (un kill del SO también pasa por onDestroy — ahí SÍ queremos restaurar) |
| F2 | **Sesión/favoritos/historial corruptos (NaN, fuera de rango, tipos raros) podían romper la restauración** | MEDIA | Nuevo módulo puro `src/core/session-store.js`: `sanitizeSession`/`sanitizeFavorites`/`sanitizeHistory` descartan valores corruptos ANTES de tocar el estado vivo. Integrado en main.js (sesión, favoritos, los 3 usos del historial) + validación de finito/rango en `restoreSession` |
| F3 | **Alarma corrupta (`nextAt` inválido)**: el scheduler debe ignorarla, nunca dispararla | BAJA | Confirmado por contrato: `alarmStateOnTick` → `skip` (test P3); vencida más allá de la gracia → `miss` (no se ejecuta una alarma vieja) |
| F4 | **Diagnóstico sin visibilidad de la política de focus** | BAJA | Contadores `focusReacquireCount`/`focusUnknownCount` en `Diagnostics` + expuestos en `GET_PLATFORM_CAPABILITIES` y `GET_AUDIO_STATE`; panel `/diagnostico` muestra estado → política (incluido UNKNOWN → CRITICAL) y contadores; `main.js` maneja UNKNOWN explícito |

## 4. SERIALIZACIÓN JS ↔ NATIVO (auditoría)

- **Bridge:** whitelist estricta (`BridgeCommands.ALL` = espejo de `BRIDGE_COMMANDS` JS, 21 comandos); payloads con `opt*` (nunca lanzan por campos faltantes); respuestas serializables; errores → `BRIDGE_ERROR` sin romper la web.
- **Alarmas:** el espejo web marca `external` y nunca dispara en paralelo con el AlarmManager nativo (I6, probado).
- **Persistencia de sesión de audio:** valores float (SharedPreferences no tiene putDouble; precisión float suficiente para frecuencias).

## 5. CONCURRENCIA (multi-tab y multi-proceso)

- **Alarmas web:** Web Locks (pestaña primaria) + BroadcastChannel (fallback best-effort) + confirmación en el store durable antes de disparar → un solo disparador por evento.
- **Sesión web:** último-escritor-gana entre pestañas (documentado, aceptable: la sesión es por-usuario, no por-pestaña).
- **APK:** el servicio nativo es el ÚNICO motor de audio; el WebView corre mudo (solo visualizador). No hay dos procesos escribiendo el mismo estado de audio.

## 6. TESTS (102/102 PASS — 102 = 95 previos + 7 nuevos P3)

- `P3: sesión corrupta (NaN/fuera de rango) se descarta, no rompe la restauración` — NaN es typeof number; sin validación rompería el volumen.
- `P3: sesión completamente inválida → null (nada que restaurar)`.
- `P3: favoritos corruptos se filtran (solo ids string, acotados)`.
- `P3: historial corrupto se filtra y acota a 50 registros`.
- `P3: alarma corrupta (nextAt inválido) nunca dispara (skip seguro)`.
- `P3: store durable corrupto (basura en IndexedDB) no rompe la carga ni dispara` — null/strings/números/`nextAt:NaN`/sin `nextAt` se descartan; solo la alarma válida sobrevive y jamás se dispara lo corrupto.
- `P3: carrera multi-tab — dos schedulers con el MISMO store disparan UNA sola vez` — el tick de A dispara y remueve del store; el tick de B confirma en el store y descarta (un solo disparo por evento, sin Web Locks).
- Build vite OK · **APK release compilada y firmada con el keystore real** (versión distribuida) · core protegido CLEAN.

## 7. EVIDENCIA EN EMULADOR (fresca, esta sesión)

```
== prefs de sesión ANTES del kill ==
<float name="beat"  value="6.0"/>   <float name="base"  value="210.0"/>
<boolean name="shouldPlay" value="true"/>  <string name="title">Meditación</string>

== kill del proceso (simulación del SO) ==
PID 7857 → 8104  (proceso matado y recreado)

== log del proceso NUEVO (restauración) ==
D Vyneural: [audio-service] restart START_STICKY: sesión restaurada 210.0/216.0 Hz wave=sine vol=0.4

== sistema ==
MediaSession: state=PLAYING(3), position avanzando · servicio isForeground=true · 1 notificación player

== stop limpio ==
0 servicios foreground · prefs de sesión limpiadas (clearSession)

== política de focus en el diagnóstico ==
GET_AUDIO_STATE → { focusState: "GAIN", focusReacquireCount: 0, focusUnknownCount: 0,
                     audioActive: true, serviceRunning: true, playbackState: "playing" }
```

## 8. CRITERIOS DE CIERRE P3

| # | Criterio | Estado |
|---|---|---|
| 1 | La sesión de audio sobrevive al kill del proceso (restauración START_STICKY) | ✅ verificado en emulador (210/216 Hz restauradas) |
| 2 | La notificación nunca miente tras un restart (motor real o nada) | ✅ (restore re-arranca el motor; sin sesión → se detiene solo) |
| 3 | Datos corruptos no rompen la restauración web | ✅ (sanitización + tests) |
| 4 | Alarmas no se disparan corruptas/vencidas | ✅ (skip/miss + test) |
| 5 | Multi-tab: un solo disparador por evento | ✅ (Web Locks + store durable; ya probado en P2) |
| 6 | Serialización bridge validada y aislada | ✅ (whitelist + opt* + BRIDGE_ERROR) |
| 7 | Diagnóstico muestra la política de focus y sus contadores | ✅ (panel + GET_AUDIO_STATE) |
| 8 | Tests automatizados PASS | ✅ 102/102 |
| 9 | Build web + APK debug OK | ✅ |
| 10 | Core de simulación protegido | ✅ CLEAN |

**P3 STATUS: PASS.** El único pendiente físico sigue siendo el mismo de P2 (kill por OEM en dispositivo real, reinicio real) — `NOT_TESTED` para hardware, separado del cierre lógico.

---

*Ver: `P2_MEDIA_SESSION_FORENSIC_REPORT.md`, `P1_AUDIO_FORENSIC_REPORT.md`, `P0_AUDIT.md`.*
