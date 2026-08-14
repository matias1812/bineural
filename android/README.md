# Bineural — Android (P1: runtime nativo)

Shell Android (Kotlin + WebView) que envuelve la web Bineural. **Mismo core
científico**: la simulación matemática es la del repo raíz y no se toca; la
plataforma se adapta al core.

> **Estado honesto: P1 = SOURCE DELIVERED, NOT VERIFIED.** El código está
> listo para compilar en Android Studio, pero **no fue compilado ni probado en
> dispositivo** (el SDK no existe en el entorno de desarrollo de la web). No
> se puede declarar P1 PASS sin una prueba física en Android.

## Requisitos

- Android Studio (Hedgehog o posterior) — trae JDK 17.
- Ningún backend: la app funciona offline con los assets locales.

## Build

```bash
# 1. (opcional) refrescar la web empaquetada:
#    npm run build && rm -rf app/src/main/assets/bineural && cp -r ../dist app/src/main/assets/bineural
# 2. Abrir la carpeta android/ en Android Studio y Run ▶ (o:)
cd android
./gradlew assembleDebug     # genera app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Qué implementa

| Pieza | Archivo |
|---|---|
| WebView offline (assets locales, MPA) | `MainActivity.kt` |
| Bridge (contrato exacto de `src/platform/native-bridge.js`) | `bridge/AndroidBridge.kt`, `bridge/BridgeCommands.kt` |
| Foreground Service `mediaPlayback` | `audio/AudioForegroundService.kt` |
| Motor de tono nativo (AudioTrack, rampa de 1,5 s) | `audio/BinauralToneEngine.kt` |
| Audio Focus explícito (duck/pause/resume) | `audio/AudioFocusHelper.kt` |
| Notificaciones (canales + reproductor + alarma) | `notifications/NotificationHelper.kt` |
| Alarmas AlarmManager exactas (+ reboot) | `notifications/AlarmScheduler.kt`, `AlarmReceiver.kt`, `BootReceiver.kt` |
| Permisos bajo demanda | `permissions/PermissionManager.kt` |
| Lifecycle | `lifecycle/LifecycleManager.kt` |
| Pantalla de diagnóstico | `diag/DiagnosticsActivity.kt`, `diag/Diagnostics.kt` |

## Permisos declarados (reales, bajo demanda)

`POST_NOTIFICATIONS` · `FOREGROUND_SERVICE` · `FOREGROUND_SERVICE_MEDIA_PLAYBACK`
· `WAKE_LOCK` · `SCHEDULE_EXACT_ALARM` · `RECEIVE_BOOT_COMPLETED` ·
`MODIFY_AUDIO_SETTINGS` · `INTERNET` (solo para enlaces externos; la
simulación es local).

## Bridge (contrato)

`window.AndroidBridge` se inyecta con `postMessage(msg)` y `getPlatformInfo()`
— exactamente lo que detecta `src/platform/native-bridge.js`. Los comandos
permitidos son la whitelist de `BridgeCommands.kt` (espejo del JS). Estados
honestos: `supported ≠ granted ≠ active` (p. ej. `exactAlarms=true` pero
`exactAlarmsGranted=false` hasta que el SO lo autorice).

## Diagnóstico

```bash
adb shell am start -n com.vyneural.bineural/.diag.DiagnosticsActivity
# y en la web (dentro de la APK):
window.__platformProbe()
```

## Checklist físico (TEST 01–15) — pendiente de dispositivo

- [ ] T01 Abrir simulación y reproducir
- [ ] T02 Minimizar: el audio sigue según configuración (Foreground Service)
- [ ] T03 Volver: NO aparece un segundo audio (un solo engine)
- [ ] T04 Bloquear pantalla / T05 desbloquear: sin saltos de fase
- [ ] T06 Cambiar a otra app y volver
- [ ] T07 Llamada entrante → pausa por audio focus; al colgar, resume
- [ ] T08 Otro audio (YouTube/Spotify) → duck o pausa según el caso
- [ ] T09 Desconectar internet: todo sigue funcionando (offline)
- [ ] T10 Cerrar la WebView: la notificación del reproductor persiste
- [ ] T11 Notificación de alarma con la app cerrada/minimizada
- [ ] T12 Programar alarma → dispara a la hora (exacta si está autorizada)
- [ ] T13 Denegar POST_NOTIFICATIONS → la app degrada, no pide siempre
- [ ] T14 Conceder → solo se habilita notificaciones
- [ ] T15 Reiniciar la app: alarmas reprogramadas (BootReceiver) y sin
      AudioContext duplicado
- [ ] T16 Verificar `window.__platformProbe().platform.kind === 'android-native'`

## Limitaciones conocidas

- No compilado en este entorno (requiere Android SDK en tu máquina).
- `SCHEDULE_EXACT_ALARM` depende de la autorización del SO (Android 12+).
- El motor nativo es un tono simple (senoidal estéreo con ramp): no incluye
  aún los ambientes de la web ni WebAudio — la sesión de la WebView sigue
  siendo la fuente principal; el servicio nativo es el transporte de fondo.
- Enlaces externos (Instagram, fuentes) dentro de la WebView se resuelven
  localmente si fallan; se recomienda probar y ajustar `shouldOverrideUrlLoading`.
