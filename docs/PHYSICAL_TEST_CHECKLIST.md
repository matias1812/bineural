# Checklist de prueba física — APK Android v1.2.0

> Valida la APK **release** (`public/vyneural.apk`, build 2026-08-17, sha256
> `67aa407c…`, bundle web con `VITE_API_URL=https://vyneural-backend.onrender.com`
> y llamadas API por el bridge nativo — sin CORS)
> en un **teléfono real**. Complementa
> [`HARDWARE_CHECKLIST.md`](HARDWARE_CHECKLIST.md) (web/PWA) y la evidencia de
> emulador (Android 14 / API 34, ver abajo). Criterio: nada se marca PASS sin
> `EJECUTADO + OBSERVADO + VERIFICADO` en el teléfono.

## Estado en emulador (ya verificado, APK nueva 2026-08-17)

| Capacidad | Resultado emulador |
|---|---|
| Build release firmada instalable (CN=Bineural) | ✅ PASS |
| PLAY → AudioTrack nativo (USAGE_MEDIA, sesión 297) + Foreground Service | ✅ PASS |
| Media Session (controles SO → UI sincronizada: PAUSE/PLAY/STOP) | ✅ PASS (`Media button session = com.vyneural.bineural/Vyneural`) |
| Alarma con la app **cerrada** → notificación nativa, **nunca PLAY** | ✅ PASS (cadena 7/7, `scripts/alarm-chain-test.mjs`) |
| Provider único (`singleProvider: true`), gain web 0 en APK | ✅ PASS |
| IDLE honesto tras STOP/alarma (`isAudible: false`, 0 crashes) | ✅ PASS |
| Badge plataforma APK + bridge CONNECTED | ✅ PASS |

## Qué NO cubre el emulador (esto se prueba en físico)

| # | Escenario | Comportamiento esperado | Evidencia |
|---|---|---|---|
| H1 | **Calidad auditiva real** (altavoz y auriculares) | Audio limpio, sin cortes ni distorsión; fade in/out suave | Oído + `dumpsys audio` |
| H2 | **Bluetooth real** (auriculares/altavoz BT) | El audio sigue al cambiar de dispositivo BT; los botones del BT controlan play/pause; al desconectar BT → pausa limpia o duck | Nota de lo observado + `dumpsys audio` |
| H3 | **Reinicio real del teléfono** con alarma programada | BootReceiver reprograma la alarma; dispara tras el arranque | Notificación tras boot + `dumpsys alarm` |
| H4 | **El SO mata el proceso** (recents → swipe, o `adb shell am kill`) | No hay reproducción fantasma; la alarma sigue disparando igual | `dumpsys media_session` vacío + notificación |
| H5 | **Alarma exacta a la hora justa** (SCHEDULE_EXACT_ALARM autorizado) | Suena ±segundos, no ±60 s | Hora real de la notificación |
| H6 | **Pantalla bloqueada real (keyguard)** | PLAY → bloquear → sigue sonando; controles del lock screen funcionan | Captura de lock screen |
| H7 | **Vibración de rutina recurrente** | Rutina por días vibra + notifica aunque la app esté cerrada | Observación |
| H8 | **WebAPK real** (Chrome → "Añadir a pantalla de inicio") vs APK | La APK muestra badge **APK** (no WebAPK); el WebAPK muestra badge **WebAPK** y NO tiene audio nativo | Badge en la app |
| H9 | **Audio focus real** (llamada entrante / otro audio) | Duck o pausa según política; al terminar la llamada, recupera el nivel | Observación + `/diagnostico` foco |
| H10 | **Batería/doze** (pantalla apagada 10+ min con alarma) | La alarma no se pierde en doze (alarma exacta o ventana documentada) | Notificación en el minuto esperado |
| H11 | **Límite de sonido sin respuesta** (v1.2.1) | La alarma suena y, si nadie la toca/descarta, **se silencia sola a los 2 min** (`AlarmScheduler.ALARM_RING_LIMIT_MS`): la notificación desaparece del sombreado | Observar ~2 min sin tocar nada → la notificación se cancela sola |
| H12 | **Tarjeta de notificaciones en /cuenta (APK)** (v1.2.1) | En la APK, /cuenta muestra la tarjeta "🔔 Notificaciones push" con el texto "El servidor está listo (VAPID). Activá las notificaciones…". **Activar** pide el permiso real de Android (POST_NOTIFICATIONS); al concederlo → "✅ Notificaciones activadas…". **Desactivar** abre los Ajustes de notificaciones del sistema. Sin HTTPS/Web Push: la entrega es nativa (AlarmManager), no depende del servidor | Verificar los tres estados (sin pedir → texto VAPID; concedido → ✅; denegado permanente → aviso + botón a Ajustes) |
| H13 | **Alarma del servidor llega a la APK y dispara con la app cerrada** (v1.2.1, sync nativo) | Iniciar sesión en la APK → crear una alarma en la **web** (misma cuenta) → dentro de ~30 min (o al reabrir la app) la alarma queda programada en el teléfono (`dumpsys alarm` → `ALARM_<id>`) → dispara con la app cerrada y notifica | `dumpsys alarm` + notificación en el minuto esperado (verificado en emulador: `E2E Fire Test`) |
| H14 | **Sección Dispositivos en /cuenta (APK)** (v1.2.1) | Con sesión, /cuenta muestra "📱 Dispositivos" con el teléfono: plataforma **APK Android**, versión de la app, estado de notificaciones (activadas/desactivadas), push activo y última vez visto | La tarjeta lista el dispositivo y el backend registra `PUT /devices/me` (verificado en emulador y contra el backend) |
| H15 | **Login dentro de la APK** (v1.2.1, bridge nativo) | Iniciar sesión en /cuenta dentro de la APK **funciona sin depender del CORS del servidor** (las llamadas API van por `HttpURLConnection` nativo). Al loguear, las alarmas del servidor se sincronizan al instante y el dispositivo queda reportado | Login OK en el teléfono + la alarma creada en la web aparece en `dumpsys alarm` |
| H16 | **Campana y notificaciones bloqueadas sin sesión** (v1.2.1) | Sin iniciar sesión, la campana 🔔 de la home está deshabilitada (atenuada, click → aviso "Iniciá sesión…", no abre el modal) y las notificaciones no se activan. Al iniciar sesión se desbloquea (web y APK) | Campana atenuada sin sesión; activa tras login |

## Procedimiento

### 1. Instalar la APK

```bash
# Descargar desde la web publicada (o copiar android/app/build/outputs/apk/release/app-release.apk)
adb install -r vyneural.apk
```

### 2. Preparar la herramienta de evidencia

```bash
./scripts/hardware-evidence.sh start-run        # inicia un run timestamped
./scripts/hardware-evidence.sh capture "H1 calidad altavoz"
./scripts/hardware-evidence.sh play | tap X Y   # primer play (ver doc del script)
./scripts/hardware-evidence.sh verify-playing
./scripts/hardware-evidence.sh dispatch-pause | dispatch-play | dispatch-stop
./scripts/hardware-evidence.sh lock | unlock | home | open | kill | reopen
./scripts/hardware-evidence.sh verify-idle
./scripts/hardware-evidence.sh summary
```

> `hardware-evidence.sh` guarda cada captura en `docs/evidence/run_<ts>.log`
> (servicio nativo + MediaSession + AudioTracks + traza BineuralLog).

### 3. Pruebas rápidas sin adb (en el teléfono)

1. Abrir la app → badge **APK** → **Comenzar sesión** → suena el motor.
2. Lock screen → aparecen los controles de Vyneural → pausar/play/stop.
3. Con sesión activa, hacer una **llamada** (o reproducir otro audio) → duck/pausa → al colgar, recupera.
4. Programar una **alarma a +2 min** → cerrar la app (swipe) → llega la notificación **exacta** → al tocar, NO reproduce la sesión (solo avisa).
5. Reiniciar el teléfono con esa alarma reprogramada → sigue disparando.
6. Conectá **auriculares BT** → el audio pasa al BT → botones BT controlan play/pause → desconectá → pausa limpia.

### 4. Diagnóstico en el teléfono

- `/diagnostico` (dentro de la app): fila **Media Session** con controles activos mientras suena; **Audio nativo** ON; **Alarmas** SCHEDULE_ALARM OK.
- Consola (si WebView debug): `window.runBineuralDiagnostics()` → **113 PASS / 0 FAIL**.

## Criterio de release

- H1–H10 sin fallos de comportamiento (los límites de plataforma se **documentan**, no se fuerzan).
- G1–G6 de [`HARDWARE_CHECKLIST.md`](HARDWARE_CHECKLIST.md) (matriz destructiva) en hardware.
- Tras la validación física: subir la APK final a `public/vyneural.apk` y re-desplegar.

## Registro

| Fecha | Dispositivo | Android | APK hash | H1–H10 | G1–G6 | Firmado por |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |
