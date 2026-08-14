# Bineural — Android (P1: runtime nativo)

Shell Android (Kotlin + WebView) que envuelve la web Bineural. **Mismo core
científico**: la simulación matemática es la del repo raíz y no se toca; la
plataforma se adapta al core.

> **Estado honesto: P1 = COMPILED, NOT DEVICE-TESTED.** La APK debug se
> compiló correctamente en este entorno (JDK 17 + Gradle 8.2 + Android SDK
> 34) → `app-debug.apk` (3,5 MB, SHA-256
> `c53c1dce149416264bbefc1636e1b6aa3f65194346147076509342cb236f5a40`).
> **Falta la prueba física en dispositivo** — no se puede declarar P1 PASS
> sin correr el checklist TEST 01–16 en un Android real.

## Requisitos

- JDK 17 + Gradle 8.2 + Android SDK (platform 34, build-tools 34.0.0).
  Instalados en este entorno en `~/.local/opt/jdk-17.0.20+8`,
  `~/.local/opt/gradle-8.2` y `~/.local/android-sdk` (variables en `~/.bashrc`).
- Ningún backend: la app funciona offline con los assets locales.

## Build

```bash
# 1. (opcional) refrescar la web empaquetada:
#    npm run build && rm -rf app/src/main/assets/bineural && cp -r ../dist app/src/main/assets/bineural
# 2. Compilar (o abrir android/ en Android Studio y Run ▶):
cd android
./gradlew.bat assembleDebug    # Windows (./gradlew en Linux/mac)
# → app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### APK release firmada (distribución)

```bash
./gradlew.bat assembleRelease
# → app/build/outputs/apk/release/app-release.apk (firmada)
```

La firma release lee las credenciales de `local.properties` (gitignored) o de
las variables `BINEURAL_STORE_FILE/BINEURAL_STORE_PASS/BINEURAL_KEY_ALIAS/
BINEURAL_KEY_PASS`. El keystore vive FUERA del repositorio
(`~/.local/bineural-release.keystore`); nunca se sube. La APK release actual:
SHA-256 `7858c0ad0f5d9e0b1be51b51465dc9d9209bee47b41aaf7a8ccab99db3300a7d`
(se sirve en la web en `/bineural.apk`).

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
