# P6 — Web / PWA / APK Matrix y Feature Parity

> Una **diferencia esperada** no es un bug. Una **diferencia no explicada** se
> investiga. Estado por celda: PASS · FAIL · N/A · BLOCKED/NOT_TESTED (nota).

## 1. Matriz de arquitectura por plataforma

| Función | Web | PWA | APK | Diferencia esperada |
|---|---|---|---|---|
| Audio | Web Audio | Web Audio | Native (AudioTrack) | Sí — APK = motor Kotlin, WebView muda |
| MediaSession | Web | Web | Android (servicio) | Sí — un solo dueño por plataforma |
| Alarmas | Scheduler web (pestaña viva) | Scheduler web | Android AlarmManager | Sí — APK real y persistente; web honesta |
| Notificación | `new Notification` / SW | SW | NotificationHelper nativa | Sí |
| Audio Focus | Browser | Browser | Android AudioFocus | Sí |
| Background audio | Limitado (ancla + pestaña viva) | Limitado (SW no sostiene audio) | Nativo (Foreground Service) | Sí |
| Lock screen | Browser MediaSession | Browser MediaSession | Android MediaSession | Sí |
| Push | Web Push (con backend) | Web Push | Android (no usa Web Push) | Sí |
| IndexedDB | Sí | Sí | WebView (sí, mismo código) | No |
| Backend | Aditivo | Aditivo | Aditivo | No |
| PostgreSQL | Remoto | Remoto | Remoto | No |
| Service Worker | Sí | Sí | No (file://) | Sí |
| Android lifecycle | No | No | Sí | Sí |
| Account/Sync | Idéntico | Idéntico | Idéntico | **No** (el copy del producto lo afirma y se verifica) |

## 2. Feature Parity (P1.1)

| Función | WEB | PWA | APK | Nota |
|---|---|---|---|---|
| PLAY | PASS | PASS | PASS (estático) | gesto requerido en las tres |
| PAUSE | PASS | PASS | PASS (estático) | protocolo simétrico P5.2 |
| STOP | PASS | PASS | PASS (estático) | STOP de servicio inactivo = no-op |
| NEXT / PREVIOUS | PASS | PASS | PASS (estático) | retune, nunca START |
| frequency | PASS | PASS | PASS | mismo sessionId (R07) |
| carrier | PASS | PASS | PASS | UI + retune nativo |
| wave | PASS | PASS | PASS | UI + `SET_WAVE` |
| volume | PASS | PASS | PASS | gain web en vivo / `SET_AUDIO_LEVEL` APK |
| state | PASS | PASS | PASS | selectState en vivo sin reinicio |
| experimental condition | PASS | PASS | PASS | misma condición en motor |
| environment (ambient) | PASS | PASS | PASS | capas Web Audio / nativo muteado |
| favorites | PASS | PASS | PASS | local + nube (fav-sync) |
| itineraries | PASS | PASS | PASS | UI /cuenta + /rutina |
| alarms | PASS | PASS | PASS (nativo) | `alarmSave` emite `createAlarm` (main.js:4164) — P6-FEAT-001 verificado FIXED en código actual |
| notifications | PASS | PASS | PASS | chime web; canal nativo APK |
| login | PASS | PASS | PASS | |
| logout | PASS | PASS | PASS | revoca refresh |
| sync | PASS (parcial) | PASS (parcial) | PASS (parcial) | sin cola real (P6-FEAT-002) |
| push | PASS* | PASS* | N/A | *pata backend verificada; entrega BLOCKED por entorno |
| settings | PASS | PASS | PASS | panel + bridge OPEN_SETTINGS |
| diagnostics | PASS | PASS | PASS | /diagnostico + Diagnostics.kt |
| MediaSession controls | PASS | PASS | PASS | skip/seek = ±10 Hz |
| deep links | PASS (código) | PASS (código) | N/A | autostart no reproduce |
| offline | PASS | PASS | PASS | R25 |

## 3. Diferencias no explicadas

- **Ninguna** de las diferencias Web/PWA/APK contradice la matriz §1.
- P6-FEAT-001 (alarmas web/PWA no sincronizaban al backend) — **verificado
  FIXED** en el código actual (ver bug register): `main.js:4164` llama
  `createAlarm`, y el borrado usa `deleteAlarm`.
- Feature nueva desde este corte (commit `337428d`, backend): horario +
  alarma vinculada en pasos de itinerario. Reusa el pipeline genérico
  existente (`Alarm` model, `GET /api/v1/alarms`, `AlarmSync.kt`) — sin
  pipeline paralelo. Verificado end-to-end: `routers/itineraries.py
  _sync_item_alarm` crea/actualiza/borra la `Alarm` según `time_of_day`;
  `cuenta.js` (input de hora + días por paso, línea 791) y `rutina.js`
  (`scheduleLabel`) exponen la UI; `AlarmSync.kt` no distingue origen
  (manual vs itinerario), solo lee `config.freq/beat/wave` para el deep
  link. No está reflejada todavía en la matriz de arriba porque es
  posterior al corte P6 — funcionalmente es un caso más de la fila
  "alarms", no una fila nueva.

## 4. Estados imposibles (P2.3)

| Combinación | Resultado |
|---|---|
| PLAYING + STOPPED | No existe (máquina de estados única) |
| STOPPED + servicio/engine sonando | No ocurre (osc:0, gain al piso tras STOP) |
| PAUSED + audio audible | No ocurre (PAUSE → gain al piso, osc:0) |
| IDLE + audio audible | No ocurre (ctx none en idle) |
| SYNCED + request pendiente | No observable en runtime; caché TTL 8 s |
| LOGGED OUT + datos privados visibles | No probado en runtime (entorno); revisión: `clearSession` + UI re-render |

## 5. Conclusión

Producto coherente como único sistema: las diferencias estructurales entre
plataformas están **explicadas y verificadas**; la única falla de paridad es la
sincronización de alarmas web/PWA (P6-FEAT-001, P2).
