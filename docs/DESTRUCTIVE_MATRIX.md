# MATRIZ DESTRUCTIVA — P5.5 (APK Android)

> Objetivo de la fase P5 (depuración por causalidad):
> **NINGÚN AUDIO PUEDE NACER SIN UNA CAUSA AUDITABLE.**
>
> Esta matriz se ejecuta DESPUÉS de P5.1–P5.4 y ANTES de empaquetar/deployar.
> Solo si pasa completa se libera APK. Cada fila registra evidencia con la
> traza causal (`Diagnostics.causalLog()` en Kotlin / `window.__causalLog` en JS)
> y `dumpsys media_session` / `dumpsys activity services` en el emulador.

## Invariante central

```
SIN USER_PLAY / MEDIA_PLAY / USER_RESUME
→ NO ENGINE.START
```

Y el protocolo único (P5.2):

```
PLAY  → 1 START        (sesión nueva / servicio muerto)
RESUME→ 1 RESUME       (tras pausa, servicio vivo)
PAUSE → 1 PAUSE        (desde UI/teclado/API; lock screen ya pausó → 0)
STOP  → 1 STOP         (servicio vivo; muerto → 0)
```

## Cambios que esta matriz valida (P5.1–P5.4)

| # | Cambio | Dónde |
|---|---|---|
| P5.1 | `START_STICKY` → `START_NOT_STICKY`; restart con intent null **nunca** reanuda audio (`handleNullIntentRestart` + `NO_AUTO_PLAY` en la traza) | `AudioForegroundService.kt` |
| P5.1 | `restorePersistedSession() → engine.start()` eliminado: los parámetros se conservan, el motor NO arranca | ídem |
| P5.1 | Config (RETUNE/SET_WAVE/SET_AUDIO_LEVEL) y PAUSE **no crean ni reviven** el servicio (`serviceAlive` guard); solo START/RESUME pueden | ídem |
| P5.1 | `mediaPlaybackRequiresUserGesture = true` (WebView sin autoplay) | `MainActivity.kt` |
| P5.2 | Protocolo único Web→Nativo: `pauseSession` envía PAUSE; resume envía RESUME (no START duplicado); lock screen = 0 comandos | `src/core/native-protocol.js` + `main.js` |
| P5.2 | RESUME sobre motor detenido arranca con los parámetros de la última sesión (nunca motor mudo con notificación "playing") | `AudioForegroundService.kt` |
| P5.3 | En APK la WebView **solo dibuja**: sin `navigator.mediaSession`, sin reaffirm/ancla/restore web | `main.js` |
| P5.4 | Traza causal nativa (`Diagnostics.trace`) y web (`window.__causalLog`): timestamp, source, acción, estados, generación de servicio | `Diagnostics.kt`, `main.js` |

## Test A — Lifecycle (lock/unlock)

```
PLAY → LOCK → UNLOCK ×10
```

| # | Paso | Resultado esperado | Evidencia |
|---|---|---|---|
| A1 | PLAY (WebView) | 1 START en la traza causal; `serviceStartId` estable | `Diagnostics.causalLog()` |
| A2 | LOCK/UNLOCK ×10 (keyevent 26 / `input keyevent 82`) | **0 START espontáneos**; la MediaSession sigue activa tras el unlock | traza: solo eventos `focus` GAIN/LOSS; `dumpsys media_session` |
| A3 | Volver a la app | UI sincronizada (provider native), sin re-START | `window.__causalLog` |

**PASS si:** entre A1 y A3 hay exactamente 1 START y 0 START espontáneos.

## Test B — Navegación (back/forward dentro de la APK)

```
PLAY → navegar a /diagnostico → volver (BACK) ×20
```

| # | Paso | Resultado esperado | Evidencia |
|---|---|---|---|
| B1 | PLAY | 1 START | traza causal |
| B2 | Navegar ×20 (back/forward entre páginas) | **0 START adicionales**; el servicio sigue `isForeground=true` | `dumpsys activity services` |
| B3 | `/diagnostico` → fila Media Session | UNA MediaSession activa: la **nativa** (`active=true` en `dumpsys media_session`), **0** sesiones del WebView | `dumpsys media_session` |

**PASS si:** 1 START total; el WebView nunca declara una segunda MediaSession.

## Test C — Configuración con la sesión DETENIDA

Con el audio apagado (STOP), cambiar: volumen, onda, frecuencia, estado,
alarma, navegación.

| # | Paso | Resultado esperado | Evidencia |
|---|---|---|---|
| C1 | STOP | Servicio fuera; `audioActive=false` | `dumpsys activity services` vacío |
| C2 | Mover slider de volumen / cambiar onda / retune / alarma | `audio=OFF` y `service=OFF`; la traza registra `* dropped: servicio no activo` | `Diagnostics.causalLog()` |
| C3 | Navegar a otra página y volver | La UI muestra "Comenzar sesión" (estado honesto), sin arrancar nada | `/diagnostico` |

**PASS si:** ninguna configuración crea el servicio ni arranca audio.

## Test D — Muerte del proceso

```
PLAY → kill del proceso (adb shell am force-stop o kill desde el SO) → esperar
```

| # | Paso | Resultado esperado | Evidencia |
|---|---|---|---|
| D1 | PLAY, luego matar el proceso | **NO PLAY** tras la muerte; la notificación desaparece | `dumpsys media_session` vacío |
| D2 | Esperar 30–60 s (ventana de START_STICKY si aplicara) | **Sigue sin PLAY**; si el servicio se recrea con intent null → `NO_AUTO_PLAY` en la traza + stopSelf | `Diagnostics.causalLog()` |
| D3 | Reabrir la app | UI en "Comenzar sesión" (sin estado fantasma) | `/diagnostico` |
| D4 | `USER_PLAY` explícito | 1 START con los parámetros de la sesión (la UI los envía en el START) | traza causal |

**PASS si:** D1–D3 sin audio; D4 es la ÚNICA vía que arranca audio.

## Test E — Alarma con la APK cerrada

```
APK cerrada (forzar detención) → programar alarma → esperar que venza
```

| # | Paso | Resultado esperado | Evidencia |
|---|---|---|---|
| E1 | Programar alarma (nativa) y cerrar la app | Alarma en `AlarmManager` (persiste tras cerrar) | `adb shell dumpsys alarm` |
| E2 | Vencer la alarma | **Notification = YES**, **Audio = NO**, **WebView = NO** | Notificación visible; `dumpsys media_session` vacío |
| E3 | Reiniciar el dispositivo y esperar la alarma | `BootReceiver` recompone la alarma; vuelve a notificar SIN audio | Notificación; traza |

**PASS si:** la alarma **solo notifica** — jamás inicia una sesión.

## Cómo ejecutar (emulador)

```bash
# Emulador API 34 con la APK debug instalada
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.vyneural.bineural/.MainActivity

# Traza causal nativa (DiagnosticsActivity):
adb shell am start -n com.vyneural.bineural/.diag.DiagnosticsActivity

# MediaSession real:
adb shell dumpsys media_session | grep -A 20 "Vyneural"

# Servicios:
adb shell dumpsys activity services | grep -A 6 AudioForegroundService

# Simular muerte del proceso:
adb shell am kill com.vyneural.bineural

# Lock/unlock:
adb shell input keyevent 26 && adb shell input keyevent 82
```

## Traza causal web (dev server / WebView)

```js
window.__causalLog.list()   // anillo de eventos de reproducción
```

Cada entrada: `{ ts, action, source, from, to, playing, provider, native }`.

## Registro

| Fecha | Entorno | Test | Resultado | Evidencia |
|---|---|---|---|---|
| — | — | — | — | — |
