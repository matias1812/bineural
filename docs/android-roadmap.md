# BINEURAL → APK ANDROID — ROADMAP (arquitectura híbrida)

Estrategia: **no convertir la web en APK**. Darle un **sistema operativo nativo
alrededor**: la interfaz y las simulaciones siguen siendo web; Android controla
las capacidades que una pestaña/PWA no puede garantizar (audio en segundo
plano, lock screen, alarmas exactas, notificaciones con la app cerrada,
permisos, lifecycle).

```text
                         BINEURAL
                            │
             ┌──────────────┴──────────────┐
             │                             │
        WEB / UI                       ANDROID
             │                             │
     JS / WebGL / simulación         Kotlin (WebView shell)
             │                             │
             │                   ┌─────────┼──────────┐
             │                   │         │          │
             │                Audio     Alarmas    Permisos
             │                Service   Scheduler   Android
             │                   │         │          │
             └──────────┬────────┴─────────┴──────────┘
                        │
                 BRIDGE NATIVO (window.AndroidBridge)
                        │
                 Android WebView (assets locales, offline-first)
```

## Estado por fase (honesto)

| Fase | Qué | Estado | Dónde |
|---|---|---|---|
| P0 | Separar Core / Platform | ✅ **Implementado y validado (78/78)** | `src/platform/` — ver abajo |
| P1 | Android native runtime | 🟡 **Source delivered, NOT VERIFIED** (Kotlin + Gradle + manifest listos; falta SDK/compilar/probar en dispositivo) | `android/` + `android/README.md` |
| P2 | Bridge JS ↔ Kotlin | ✅ **Entregado** — `AndroidBridge.kt` implementa el contrato exacto de `native-bridge.js` | `android/.../bridge/` |
| P3 | Foreground Audio Service | 🟡 Código entregado (`AudioForegroundService` + `BinauralToneEngine`); sin prueba física | `android/.../audio/` |
| P3 | Foreground Audio Service nativo | ⬜ Requiere APK | — |
| P4 | MediaSession nativa | ⬜ Requiere APK | — |
| P5 | Audio Focus (duck/pause/resume) | ⬜ Requiere APK | — |
| P6 | AlarmScheduler nativo | ⬜ Requiere APK | — |
| P7 | Notificaciones nativas | ⬜ Requiere APK | — |
| P8 | PermissionManager nativo | ⬜ Requiere APK | — |
| P9 | APK firmada (release keystore) | ⬜ Requiere APK | — |
| P10 | Web → Descargar APK (página /download) | ⬜ Tras P9 | — |
| P11 | Tests reales Android (tortura) | ⬜ Tras P9 | — |
| P12 | Validación experimental comparada Web vs APK | ⬜ Tras P11 | — |

## P0 — Separación Core / Platform (ya en el repo)

```
/src
   /core      → AudioEngine, SimulationEngine, ExperimentEngine, AlarmEngine (pura, headless)
   /platform  → WebPlatform + AndroidPlatform (nuevo)
   main.js    → UI (sigue siendo la única capa de presentación)
```

- **`src/platform/native-bridge.js`**: contrato del bridge + adaptador seguro.
  - `detectNativeBridge()` — detecta `window.AndroidBridge` (lo inyecta la APK).
  - `validateCommand(command, payload)` — whitelist + validación de payload
    (Fase 24: comandos arbitrarios → `DENIED`).
  - `handshake()` — P0 gate §9: `GET_PLATFORM_CAPABILITIES`; sin respuesta real
    → `UNAVAILABLE`. El bridge nunca se da por existente solo por el UA (§8).
  - `createNativeBridgeAdapter()` — métodos `startBackgroundAudio`,
    `scheduleAlarm`, `requestNotificationPermission`, `openExperiment`, …
    **Sin bridge**: cada comando responde `{ ok:false, error:'NOT_SUPPORTED' }`
    → la web/PWA actual funciona idéntica. Aislamiento de fallos (§10): un
    bridge que lanza se reporta como `BRIDGE_ERROR`/`bridgeStatus:'ERROR'` y
    nunca rompe la UI ni el core.
- **`src/platform/platform-capabilities.js`**: `detectPlatformKind()` distingue
  `desktop` / `android-browser` / `android-native` / `ios` / `unknown` —
  **un Chrome Android sin bridge es `android-browser`, nunca nativo** (§2/§8).
  `mergePlatformCapabilities()` produce la matriz única y honesta con
  proveedor (`web` | `native`) y estados separados
  **supported ≠ granted ≠ active**. La web no promete background audio; la
  APK sí (si el sistema lo permite), y "autorizada" es un estado distinto de
  "soportada".
- **UI**: el modal de permisos muestra una fila **Plataforma** (solo visible
  dentro de la APK) y las etiquetas cambian a "Nativa — concedido ✓" etc.
- **Diagnóstico**: `window.__platformProbe().platform` expone el estado real
  del bridge; `window.__nativeBridge` para depurar desde la consola.

## Contrato del bridge (lo que debe implementar el Kotlin)

La APK inyecta en la WebView (antes de `loadUrl` del contenido local):

```js
window.AndroidBridge = {
  version: '1.0.0',
  postMessage(msg) { /* msg = { command, payload } */ },
  getPlatformInfo() {
    return {
      nativeAudio: true,
      notifications: true,
      exactAlarms: true,
      exactAlarmsGranted: false,   // el SO aún no autorizó SCHEDULE_EXACT_ALARM
      backgroundService: true,
      backgroundServiceActive: false,
      notificationPermission: 'default', // 'granted' | 'denied' | 'default'
      mediaSession: true,
      mediaSessionActive: false,
    };
  },
};
```

Comandos permitidos (whitelist — todo lo demás se rechaza en origen):

```text
GET_PLATFORM_INFO
START_BACKGROUND_AUDIO / STOP / PAUSE / RESUME_BACKGROUND_AUDIO
SCHEDULE_ALARM / CANCEL_ALARM
REQUEST_NOTIFICATION_PERMISSION
OPEN_EXPERIMENT
```

Reglas de seguridad (Fase 24): validación de origen, whitelist de comandos,
payload solo objetos planos serializables, sin acceso a archivos ni shell.
`supported` / `granted` / `active` son tres estados distintos: nunca
confundirlos.

## Matriz Web vs APK (objetivo, honesto)

| Capacidad | Web/PWA | APK | Nota |
|---|:---:|:---:|---|
| Audio en primer plano | ✓ | ✓ | |
| Audio en segundo plano | Limitado | ✓ | Foreground Service (P3) |
| Lock screen / media controls | Limitado | ✓ | MediaSession nativa (P4) |
| Audio focus (bluetooth, llamadas) | Accidental | ✓ explícito | duck/pause/resume (P5) |
| Alarmas | Limitado (web abierta) | ✓ exactas | AlarmScheduler (P6) |
| Notificaciones con app cerrada | No garantizado | ✓ | Notifications nativas (P7) |
| Permisos reales | Limitados | ✓ | PermissionManager (P8) |
| Offline | ✓ (PWA) | ✓ (assets locales) | |
| Simulación / experimental | ✓ (mismo core) | ✓ (mismo core) | nunca duplicar |
| Distribución | URL | APK firmada + página /download | (P9/P10) |

El ✓ de la APK significa "implementado y probado en dispositivos objetivo",
no "la API existe".

## Orden de ejecución recomendado (con Android Studio, en tu máquina)

1. Crear proyecto Android (Kotlin) + WebView que carga los **assets locales**
   (`WebViewAssetLoader`, `file://`) con el build de esta web — offline-first.
2. Implementar `AndroidBridge` (el contrato de arriba) — P2.
3. Foreground Service con `AudioTrack`/`AAudio` + `MediaSession` + Audio Focus
   — P3/P4/P5. La WebView sigue controlando frecuencia/beat/experimento; el
   servicio nativo es el transporte persistente.
4. Alarmas exactas (`SCHEDULE_EXACT_ALARM`, `AlarmManager`) + notificaciones
   (`NotificationChannel`, `PendingIntent`) — P6/P7.
5. Permisos bajo demanda (nunca todos al instalar) — P8.
6. Firmar con keystore propio (nunca al repo), versionCode/versionName,
   SHA-256 — P9.
7. Página `/download` en la web con la APK y su SHA-256 — P10.
8. Test de tortura en dispositivos reales (START → LOCK → YouTube → BT off/on
   → …) midiendo frecuencia, fase, RMS, interrupciones — P11.
9. Comparación Web vs APK y validación experimental con identidad de sesión
   (versión de app, Android, device, engine, experimentId) — P12.

## P0 VALIDATION GATE — STATUS (cerrado antes de avanzar a Kotlin)

| # | Criterio | Resultado | Evidencia |
|---|---|---|---|
| 1 | Core sin modificar | ✅ PASS | diff `dcd639e..0d47b91`: solo `src/platform/`, UI de permisos y sonda; `audio.js`, `cymatics.js`, `wavefield.js`, `simulation.js`, `experiments.js` intactos |
| 2 | Entorno real (Chrome Android ≠ nativo) | ✅ PASS | `detectPlatformKind()` + test: UA Android sin bridge → `android-browser` |
| 3 | Bridge sin errores si no existe | ✅ PASS | sin bridge: `NOT_SUPPORTED`, nunca lanza (test) |
| 4 | Whitelist de comandos | ✅ PASS | 11 comandos; arbitrarios → `DENIED` (test `EXEC_SHELL`) |
| 5 | supported ≠ granted ≠ active | ✅ PASS | notificaciones `granted`, alarmas `supported`+`granted`, background `supported`+`active` (test) |
| 6 | Fallback web (NO_OP) | ✅ PASS | navegador: `runtime:'web'`, bridge `UNAVAILABLE`, app normal |
| 7 | Diagnóstico | ✅ PASS | `__platformProbe().platform` + `.capabilities`; `window.__nativeBridge` |
| 8 | Sin falsos positivos | ✅ PASS | capacidades SOLO de `getPlatformInfo()`/handshake real; bridge mudo → `UNAVAILABLE` (test) |
| 9 | Handshake | ✅ PASS | `handshake()` → `CONNECTED`/`UNAVAILABLE`; timeout; test |
| 10 | Aislamiento de fallos | ✅ PASS | bridge que lanza → `BRIDGE_ERROR`, adaptador nunca lanza (test) |
| 11 | Una sola inicialización | ✅ PASS | adaptador único en main.js; sin listeners duplicados |
| 12 | Seguridad | ✅ PASS | whitelist + payload plano serializable + claves validadas; sin JS/archivos/shell/intents arbitrarios |
| 13 | NO APK todavía | ✅ PASS | nada de Kotlin/Gradle creado |
| 14 | Matriz de entornos | ✅ PASS* | desktop verificado en vivo; Firefox/Android/iOS **NOT TESTED** (requiere dispositivo) |
| 15 | Criterios de aceptación | ✅ PASS | todos los anteriores (78/78 tests, build ✓) |

**P0 STATUS: PASS** — se puede avanzar a P1 (scaffold Android) cuando haya
SDK disponible. Los puntos con * dependen de prueba física en dispositivo.

## Telemetría y privacidad (sin backend)

Eventos (experiment_start, audio_focus_loss/gain, background/foreground,
bluetooth_change, notification, experiment_end) se guardan **solo local**
(IndexedDB + almacenamiento local de Android). Sin servidor, sin nube: los
datos de audio, EEG simulado y estado cognitivo nunca salen del dispositivo.
