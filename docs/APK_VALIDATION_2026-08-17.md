# Validación de la APK — 2026-08-17 (emulador Android 14 / API 34)

> Evidencia **en runtime** de la APK release construida hoy (rebuild con el
> bundle web actual, que incluye los fixes de correo/reenvío y el deploy).
> Complementa los reportes estáticos previos (`FORENSIC_AUDIT.md`,
> `HARDWARE_MATRIX.md`, `P6_*`). Los comandos y scripts usados quedan abajo
> para reproducir cada prueba.

## Build validado

| Campo | Valor |
|---|---|
| APK | `public/vyneural.apk` (también `android/app/build/outputs/apk/release/app-release.apk`) |
| Tamaño | 3.006.688 bytes (~3,0 MB) |
| SHA-256 (prefijo) | `67aa407c8993…` (último: **campana/notificaciones bloqueadas sin sesión** + sync de alarmas cada 5 min + tarjeta 963 Hz + **login por bridge nativo sin CORS**) |
| Firma | release firmada (CN=Bineural) |
| Versión (bridge) | `appVersion: 1.2.1` (bump de patch: límite de sonido de alarma) |
| Bundle web embebido | dist de hoy con `VITE_API_URL=https://vyneural-backend.onrender.com` (login/sync reales dentro del WebView) |
| API nativa (worker 2.º plano) | `BuildConfig.API_BASE = https://vyneural-backend.onrender.com` |
| SHA-256 del build 1.2.1 (publicado) | `67aa407c8993…` (incluye: tarjeta de notificaciones de /cuenta en la APK + **sincronización de alarmas del servidor** + sección Dispositivos + **fix fullscreen** + **tarjeta 963 Hz** + **login por bridge nativo**) |
| Sistema | Emulador `sdk_gphone64_x86_64`, Android 14, API 34, `google_apis` |

## 1. Sonda de plataforma (WebView release con CDP habilitado)

`node scripts/apk-probe.mjs` sobre la APK instalada:

- badge de plataforma: **APK** ✓ · bridge `CONNECTED` (AndroidBridgeNative) ✓
- provider audio: `native` · `singleProvider: true` ✓ · gain web **0** en APK ✓
- lifecycle `FOREGROUND`, `audioState: IDLE`, `isAudible: false` ✓
- notificaciones `GRANTED`, alarmScheduler `true`, 0 crashes en toda la sesión ✓

## 2. PLAY real → motor nativo

| Evidencia | Resultado |
|---|---|
| Estado JS tras PLAY | `PLAYING`, `playing: true`, provider `native` |
| Servicio | `AudioForegroundService`: 1 (foreground) |
| AudioTrack | `AudioPlaybackConfiguration … type:android.media.AudioTrack state:started` (USAGE_MEDIA, sessionId **297**, pid de la app) |
| Media Session | `Media button session is com.vyneural.bineural/Vyneural` (controles del SO → nuestra app); sesión en el stack con 8 controllers |

## 3. Controles externos (pantalla de bloqueo / auriculares)

`adb shell cmd media_session dispatch {pause|play|stop}` y la UI sincroniza:

| Comando | Estado JS | Botón |
|---|---|---|
| dispatch **pause** | `PAUSED` | `playing: false` |
| dispatch **play** | `PLAYING` | `playing: true` |
| dispatch **stop** | `STOPPED` | `playing: false` |

Tras STOP: servicio **0**, sin AudioTrack nativo de la sesión activo, sin
reproducción espontánea. (Queda un AAudio del sink del WebView, silencioso,
gain 0 — artefacto del WebView, no del motor.)

## 4. Cadena de alarma con la app CERRADA

`node scripts/alarm-chain-test.mjs 70` — **7/7 PASS**:

1. `SCHEDULE_ALARM` → `status: OK`
2. PendingIntent en el reloj del SO (`*walarm*:…ALARM_p4a-…`)
3. Proceso detectado y muerto (`kill -9`, app cerrada)
4. **Notificación nativa apareció con la app cerrada** (título único)
5. Registro persistente consumido (un solo disparo)
6. Exactamente **UNA** notificación

> Nota: el paso 5 lee `shared_prefs/bineural_alarms.xml` con `run-as`, que
> **falla silenciosamente en la APK release** (no debuggable). El consumo se
> verificó de forma definitiva con `su 0` (ver §5): el registro desaparece de
> prefs tras disparar.

## 5. Alarma tras REINICIO del emulador (NUEVO, hoy)

`adb reboot` con la alarma `p4b-94638` programada a +240 s. Resultado:

1. **Persistencia**: el registro sobrevive al reboot (`su 0 cat
   …/shared_prefs/bineural_alarms.xml` → `{"title":"Reboot-P4B…","at":…}`).
2. **BootReceiver**: el `BOOT_COMPLETED` se entrega (ventana de ~78 s en este
   emulador con 113 receivers); `BootReceiver.kt` → `rescheduleAll()` y el
   PendingIntent `ALARM_p4b` **vuelve al reloj del SO**.
3. **Disparo**: la notificación "Reboot-P4B 4638" apareció a la hora correcta,
   con el proceso del sistema — no la WebView.
4. **Consumo**: tras disparar, el registro `p4b` ya no está en prefs (one-shot).
5. **Sin audio fantasma**: 0 servicios de audio tras el ciclo completo.

> Lección del test: en este emulador el broadcast de boot tarda hasta ~78 s en
> completar la entrega a los 113 receivers; un chequeo inmediato tras
> `sys.boot_completed=1` puede ver la alarma "ausente" por unos segundos. Y
> `run-as` no sirve para leer prefs en release: usar `su 0`.

## 5b. Límite de sonido de alarma sin respuesta (NUEVO en 1.2.1)

La alarma ya no puede sonar indefinidamente: si nadie la toca ni la descarta,
se **silencia sola a los 2 minutos** (`AlarmScheduler.ALARM_RING_LIMIT_MS`).

Cadena nativa:
1. `AlarmReceiver` publica la notificación de alarma y programa el silencio
   (`AlarmScheduler.scheduleSilence(id)` → `AlarmManager.RTC` en fire + 120 s,
   PendingIntent `SILENCE_ALARM_<id>`).
2. Al vencer el límite, `AlarmSilenceReceiver` → `NotificationHelper.cancelAlarm`
   cancela la notificación (corta sonido/vibración y limpia el sombreado).
3. Si el usuario tocó/descartó antes, el silencio es un no-op.

Evidencia emulador (alarma `rl-5654`, v1.2.1):
- Alarma dispara → notificación presente + `SILENCE_ALARM_rl-5654` en el reloj ✓
- Registro one-shot consumido ✓
- **A los ~120 s del disparo, la notificación se auto-canceló sin intervención** ✓

> Web/PWA: el chime de foreground ya es acotado (~4 s, `playChime()`) y el
> sonido de la notificación web lo reproduce el SO una sola vez — el límite
> nativo garantiza lo mismo en la APK, donde el ringtone de alarma puede ser
> largo o repetirse según el OEM.

## 5c. Push del backend a la APK: alarma del SERVIDOR sincronizada y disparada con la app en segundo plano (NUEVO, hoy)

Flujo completo de "backend push para la APK" (sin Firebase): el ciclo nativo
`AlarmSync` (AlarmManager, auto-reprogramable cada ~30 min) consulta
`GET /api/v1/alarms` con el token guardado (`STORE_AUTH`), programa las
alarmas del servidor en el reloj del SO y reporta el dispositivo
(`PUT /api/v1/devices/me`). Evidencia E2E contra el backend local (build de
prueba con `-PapiBase=http://10.0.2.2:8000`):

1. **Login/registro en la APK** → `STORE_AUTH` guarda el token nativo y dispara
   un sync inmediato ✓
2. **Dispositivo reportado**: `PUT /devices/me` 200, `platform=apk`,
   `app_version=1.2.1`, `notification_permission=granted` ✓ (verificado en el
   backend local y en la sección Dispositivos de /cuenta)
3. **Alarma creada en el SERVIDOR** (+10 min) → el sync la programa en el reloj
   del SO: `tag=*walarm*:com.vyneural.bineural.ALARM_<id>` (RTC_WAKEUP) ✓
4. **Force-stop cancela la alarma** (acción administrativa de Android; no es el
   caso real de "app en segundo plano") → repetido con **HOME** ✓
5. **Disparo con la app en segundo plano**: la notificación apareció con el
   proceso del sistema (no la WebView): `android.title="E2E Fire Test"`,
   `android.text="Toca para iniciar tu sesión de 528 Hz."`, canal
   `bineural_alarms_v3`, `category=alarm` ✓
6. **Auto-silencio** programado (`SILENCE_ALARM_<id>` a los 120 s) ✓

> El endpoint `GET /api/v1/alarms` devuelve `repeat_rule` en formato RRULE
> (`FREQ=WEEKLY;BYDAY=MO,TH`) — el worker lo parsea a días para la rutina
> recurrente nativa. Honestidad: no es push en tiempo real (eso requiere FCM);
> es sincronización periódica, suficiente para que los recordatorios estén
> programados antes de la hora.

## 5d. Login DENTRO del WebView de la APK (sin CORS) — NUEVO, hoy

Antes, iniciar sesión dentro de la APK fallaba siempre con "sin conexión con
el servidor": el WebView carga desde `file://` (origen opaco → `Origin: null`)
y el backend no lo tiene en CORS. Fix definitivo: **todas las llamadas API de
la APK se hacen por el bridge nativo** (`API_REQUEST` → `HttpURLConnection`,
asíncrono con callback `__vyneuralApiResponse`, timeout 30 s) — sin CORS, sin
depender de la config del servidor. La web/PWA siguen con fetch (same-origin).

Evidencia E2E (APK apuntando al backend local, `10.0.2.2:8000`):

1. **Login por la UI de /cuenta dentro del WebView** → token guardado ✓
   (antes: error de red por CORS; dos bugs propios corregidos de paso: el ACK
   del bridge es un STRING que había que parsear, y el resolver devolvía
   `body` cuando `request()` lee `res.text`).
2. **STORE_AUTH** → el worker nativo sincroniza al instante: `alarmas
   sincronizadas: 2 programada(s)` ✓
3. **Alarma del servidor en el reloj del SO**: `ALARM_18e2545c…` (RTC_WAKEUP) ✓
4. **Dispositivo reportado**: `PUT /devices/me` → `platform=apk,
   app_version=1.2.1, notification_permission=denied` (el `pm clear` de la
   prueba revocó el permiso; honesto) ✓ y la sección **📱 Dispositivos** de
   /cuenta lista el teléfono con datos reales ✓
5. La alarma sincronizada dispara con la app cerrada (cadena ya validada en
   §5c: HOME → notificación del sistema).

## 5e. Prueba física (emulador) del flujo completo + gating por sesión — NUEVO, hoy

Con el build final (campana bloqueada sin sesión, sync cada 5 min + al abrir
la app) y el backend ya desplegado en Render:

1. **Campana bloqueada sin sesión**: `locked: true`, `aria-disabled: true`;
   click → toast "🔒 Iniciá sesión…" y el modal NO abre ✓
2. **Login en la APK de PRODUCCIÓN (contra Render)**: registro + sesión
   guardada (tokenLen 269, sin error) ✓ — el "sin conexión en el servidor"
   quedó eliminado de raíz (bridge nativo, sin CORS)
3. **Campana desbloqueada tras login**: `locked: false` ✓
4. **Dispositivo reportado a Render**: `PUT /devices/me` → `apk · 1.2.1 ·
   granted · 22:42:44Z` (verificado en GET /devices de producción) ✓
5. **Alarma del servidor → reloj del SO**: exacta (RTC_WAKEUP, permiso
   concedido) ✓
6. **Disparo con la app en segundo plano (HOME)**: notificación "Fire Final
   2" / "Toca para iniciar tu sesión de 963 Hz." (canal `bineural_alarms_v3`,
   category=alarm) + auto-silencio programado ✓

> Detalle de la prueba: con el permiso de notificaciones revocado (un `pm
> clear` de la prueba lo resetea), la alarma dispara pero la notificación se
> omite en silencio por diseño — al conceder POST_NOTIFICATIONS, aparece.

## 6. Prueba física pendiente (fuera del alcance del emulador)

Ver [`docs/PHYSICAL_TEST_CHECKLIST.md`](PHYSICAL_TEST_CHECKLIST.md) — H1–H10:
calidad auditiva real, Bluetooth (botones, desconexión), reinicio real con
alarma, WebAPK vs APK, doze con pantalla apagada, audio focus con llamada real.

## Conclusión

Runtime completo en emulador: **PASS** en audio nativo (PLAY/PAUSE/STOP,
Media Session, servicio foreground), alarma con la app cerrada (7/7),
**alarma tras reinicio (cadena BootReceiver completa, nueva evidencia)** y
**push del backend a la APK (alarma del servidor sincronizada y disparada con
la app en segundo plano, nueva evidencia)**. Sin crashes. El único paso que
falta para "100% funcional" es la validación física (documentada en el
checklist).

## Reproducción

```bash
# Sonda completa (requiere CDP forward del WebView)
node scripts/apk-probe.mjs

# Cadena de alarma con app cerrada
node scripts/alarm-chain-test.mjs 70

# Alarma tras reboot: programar → adb reboot → esperar → dumpsys notification
# (ver §5; leer prefs con `su 0`, no con run-as)

# Evidencia nativa (servicio, MediaSession, AudioTracks, traza)
./scripts/hardware-evidence.sh start-run && ./scripts/hardware-evidence.sh capture "…"
```
