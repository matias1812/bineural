# P5.9 — Matriz física en hardware real (release candidate)

**APK**: `public/vyneural.apk` — release candidate firmada, SHA-256
`c8b8483dba91ef73993f5d25ab6c776d774da07a3c56d7058e1278f6feb6608a` (2,95 MB,
sin APK anidada). Descarga: `https://vyneural-six.vercel.app/vyneural.apk` o
`adb install -r android/app/build/outputs/apk/release/app-release.apk`.

**Reglas absolutas** (cualquier fallo = STOP del release + traza causal del
primer START):

```
IDLE  + cualquier evento  →  NO PLAY
STOP  + cualquier evento  →  NO PLAY
```

**Evidencia**: cada test anota `PASS/FAIL`. Para verificar el estado real en
cada paso, usar (solo debug; el WebView de debug está abierto por CDP):

```bash
# Estado JS (audioState, ctx, causal) — requiere adb forward del webview:
adb shell "cat /proc/net/unix | grep -oE 'webview_devtools_remote_[0-9]+' | head -1"
adb forward tcp:9222 localabstract:webview_devtools_remote_<PID>
node scripts/cdp.js "__audioState.state + '|ctx=' + (__audioProbe().ctx ? __audioProbe().ctx.state : 'null') + '|causal=' + __causalLog.list().length"

# Estado nativo (servicio + MediaSession + focus):
adb shell "dumpsys activity services com.vyneural.bineural | grep -c AudioForegroundService"
adb shell "dumpsys media_session | grep -c Vyneural"
adb shell "dumpsys audio | grep -A2 'playback activity' | head -20"   # 1 solo AudioTrack cuando PLAY

# Traza causal nativa (quién emitió cada START):
adb shell "logcat -d -s BineuralLog:I" | tail -50
```

---

## A. Idle (sin tocar play — objetivo: 0 audio en todo el bloque)

| # | TEST | Cómo | Esperado | RESULT |
|---|------|------|----------|--------|
| A1 | Idle 5 min | Instalar, abrir, NO tocar play, esperar 5 min | sin servicio, sin MediaSession, JS IDLE, causal vacía | |
| A2 | Lock idle | keyevent 26 (o botón físico), esperar 30 s | 0 servicios, 0 sesiones | |
| A3 | Unlock idle | keyevent 82, esperar 15 s | 0 servicios, 0 sesiones | |
| A4 | Back idle | keyevent 4 ×2 (salir), reabrir | 0 servicios, 0 sesiones | |
| A5 | Navegar idle | tocar estado/onda/volumen/menú/portadora sin play | 0 servicios, JS IDLE/STOPPED | |
| A6 | Kill y reabrir (idle) | `adb shell am force-stop com.vyneural.bineural` → reabrir | 0 servicios, 0 sesiones | |
| A7 | Background/foreground idle | HOME (keyevent 3), reabrir | 0 servicios, 0 sesiones | |

**Regla A: si en cualquier paso aparece audio → BUG P0 (activación espontánea).**

## B. Reproducción y ciclo básico

| # | TEST | Cómo | Esperado | RESULT |
|---|------|------|----------|--------|
| B1 | Play | tocar "Comenzar sesión" | 1 servicio, 1 MediaSession PLAYING, focus GAIN, 1 AudioTrack, web mute | |
| B2 | Lock playing | keyevent 26, esperar 30 s | sigue PLAYING, startId estable, notificación player visible | |
| B3 | Unlock playing | keyevent 82 | sigue PLAYING, sin START nuevo | |
| B4 | Back playing | keyevent 4 (navega a home, no cierra app) | sigue PLAYING | |
| B5 | Background/Foreground playing | HOME → reabrir | sigue PLAYING, 1 sola sesión | |
| B6 | Pause | dispatch: `adb shell cmd media_session dispatch pause` | PAUSED, servicio foreground (no destruido), 0 audio | |
| B7 | Resume | `cmd media_session dispatch play` | PLAYING, MISMA sesión (startId no cambia) | |
| B8 | Stop | `cmd media_session dispatch stop` | servicio destruido, MediaSession retirada, JS STOPPED | |
| B9 | GAIN after STOP | `cmd media_session dispatch play` y enseguida `pause`+`stop`, luego `cmd media_session dispatch play` | **STOP + GAIN jamás reproduce**: tras STOP, play del sistema = acción explícita (ok); pero un GAIN solo (sin play) = 0 audio | |
| B10 | STOP absoluta | B8 → keyevent 26 → 82 → HOME → reabrir → esperar 30 s | 0 servicios, 0 sesiones, causal sin PLAY | |

## C. Audio Focus adversarial (otra app real)

| # | TEST | Cómo | Esperado | RESULT |
|---|------|------|----------|--------|
| C1 | LOSS → GAIN | PLAY → reproducir música en otra app (YouTube/Spotify/Música) → pausar la otra app | Vyneural se INTERRUMPE (LOSS) y REANAUDA al recuperar foco (si debería sonar) | |
| C2 | LOSS_TRANSIENT | PLAY → alarma/tono del sistema (alarma de reloj) → descartar | pausa breve, reanuda sin nueva sesión | |
| C3 | LOSS permanente | PLAY → app de navegación/llamada que toma foco | queda PAUSED/INTERRUPTED, NO se destruye | |
| C4 | PAUSE + GAIN | B6 (paused) → otra app toma y suelta foco | **queda PAUSED** (GAIN jamás convierte PAUSE en PLAY) | |
| C5 | STOP + GAIN | B8 (stopped) → otra app toma y suelta foco | **queda STOPPED, 0 audio** | |

## D. Bluetooth y llamada (requiere auriculares BT)

| # | TEST | Cómo | Esperado | RESULT |
|---|------|------|----------|--------|
| D1 | BT connect playing | PLAY → conectar auriculares BT | sigue PLAYING, controles BT (play/pausa) funcionan | |
| D2 | BT disconnect playing | PLAY → desconectar BT | pausa o sigue (según política del SO); NUNCA doble tono ni sesión nueva | |
| D3 | BT connect idle | sin sesión → conectar BT | 0 audio | |
| D4 | Llamada entrante | PLAY → recibir llamada | pausa (LOSS_TRANSIENT); al colgar reanuda si correspondía; 0 sesiones nuevas | |

## E. Alarmas y notificaciones (app cerrada de verdad)

| # | TEST | Cómo | Esperado | RESULT |
|---|------|------|----------|--------|
| E1 | Alarma app abierta | programar alarma a +2 min, dejar app abierta | notificación id=2001, sesión intacta, 0 interrupción, **sin PLAY** | |
| E2 | Alarma app cerrada | programar alarma a +2 min, **swipe de recents** (NO force-stop), esperar | notificación nativa SIN audio, 0 servicios | |
| E3 | Alarma tras reboot | programar alarma, reiniciar teléfono, esperar hora | BootReceiver reprograma; al disparar: notificación SIN audio | |
| E4 | Notificación app cerrada | notificación de E2 → tocar | abre la app; **NO reproduce** (estado configurado, el usuario toca play) | |

## F. Muerte de proceso

| # | TEST | Cómo | Esperado | RESULT |
|---|------|------|----------|--------|
| F1 | Kill PLAY → reabrir | PLAY → `adb shell am force-stop com.vyneural.bineural` → reabrir | **0 audio** (recovery nunca reproduce; START_NOT_STICKY) | |
| F2 | Kill PAUSE → reabrir | B6 (paused) → force-stop → reabrir | 0 audio, JS IDLE | |
| F3 | Kill STOP → reabrir | B8 → force-stop → reabrir | 0 audio, JS IDLE | |
| F4 | Kill por fabricante | PLAY → "Forzar detención" desde Ajustes → reabrir | 0 audio | |

## G. Estrés durante PLAY (opcional en dispositivo)

| # | TEST | Cómo | Esperado | RESULT |
|---|------|------|----------|--------|
| G1 | 100 cambios | PLAY → cambiar condición/estado/onda/volumen ×25 rápidos + lock/unlock alternando | PLAYING, gain web 0, startId estable (~+3, NO +75), 1 sesión | |
| G2 | Idempotencia | `cmd media_session dispatch play` ×3, `pause` ×2, `play` | startId no se mueve, 1 sola notificación player | |

---

## Criterio de cierre

- **Todo A–F = PASS** → `RELEASE CONFIRMADA`, deploy ya realizado, se puede
  distribuir `c8b8483d…6608a`.
- **Cualquier FAIL en A** (audio en IDLE/STOP) → **P0: activación espontánea**.
  No parchear el síntoma: leer `__causalLog` + `Diagnostics.trace` (logcat
  `BineuralLog:I`) y trazar el primer START hasta su origen (regla de
  ownership).
- El emulador ya cubrió A1–A5, B1–B10, C4–C5, E1–E2, F1–F3, G1–G2 (ver
  `docs/RUNTIME_MATRIX.md`). Este checklist cubre lo que el emulador NO puede:
  Bluetooth real (D), llamada real (D4), reboot físico (E3), y el kill por
  fabricante en hardware real (F4).
