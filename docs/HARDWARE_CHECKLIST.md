# Checklist físico — Audio en 2.º plano, pausa/play real y Media Session (web/PWA)

> Complementa [`docs/HARDWARE_TEST_PLAN.md`](HARDWARE_TEST_PLAN.md) (H1–H8). Aquí se
> verifica el comportamiento **nuevo** implementado en la web/PWA, en dispositivo
> real. Criterio: nada se marca PASS sin `EJECUTADO + OBSERVADO + VERIFICADO`.
> Todo lo que dependa del SO (suspender AudioContext, doze, focus) es limitación
> de plataforma y se documenta como tal, nunca se fuerza con hacks.

## Qué se verifica

| Capacidad | Comportamiento esperado |
|---|---|
| Audio en segundo plano | La sesión **nunca se enmudece ni se pausa** al ocultar la pestaña o salir de la app (web y PWA por igual, tipo YouTube) |
| Fuera del navegador | Los controles del sistema (lock screen / notificación / Bluetooth) controlan la sesión vía `navigator.mediaSession` |
| Pausa/play real | Pausar **congela el temporizador**; reanudar continúa la cuenta donde quedó (no reinicia la sesión) |
| Volumen | `volumeup`/`volumedown` del sistema ajustan el volumen real del motor (0–100 %) |
| Barra de progreso | Con temporizador: barra con cuenta regresiva; con ∞: **sin barra** (estado limpio) |
| Estado honesto | HUD (`D`) y `/diagnostico`: `audioState=PLAYING`, `playbackState=playing`, `lifecycle=AUDIO_RUNNING_BACKGROUND` en 2.º plano |

## Matriz por plataforma

| # | Escenario | Android Chrome | Android PWA | iOS Safari | iOS PWA |
|---|---|---|---|---|---|
| 1 | Play → suena + controls en notificación | ✅ esperado | ✅ | ⚠️ ver abajo | ✅ |
| 2 | Cambiar de app (home) → sigue sonando | ✅ | ✅ | ⚠️ SO puede suspender | ✅ |
| 3 | Bloquear pantalla → sigue sonando | ✅ | ✅ | ⚠️ SO suspende (documentar) | ✅ |
| 4 | Pausa desde lock screen → play reanuda con temporizador intacto | ✅ | ✅ | ⚠️ | ✅ |
| 5 | Volumen desde el sistema | ✅ (si el SO lo expone) | ✅ | ⚠️ | ✅ |
| 6 | Temporizador ∞ → sin barra en el controlador | ✅ | ✅ | ✅ | ✅ |
| 7 | Media Session refleja estado real (play/pause/stop) | ✅ | ✅ | ⚠️ Safari 15.4+ | ✅ 16.4+ |

> ⚠️ **iOS Safari sin PWA**: el SO puede suspender el Web Audio al salir de la
> pestaña — es limitación de plataforma. La app **no** enmudece por su cuenta; al
> volver, `restoreFromBackground()` reanuda con rampa suave al nivel de sesión.

## Procedimiento por escenario

### A. Audio en segundo plano (sin bloqueo)

| # | Paso | Esperado | Evidencia |
|---|---|---|---|
| A1 | Abrir la URL (web o PWA instalada), tocar **Comenzar sesión** | Suena; `audioState=PLAYING`; `playbackState=playing` | Consola: `window.__audioState.summary()` |
| A2 | Pulsar Home / cambiar de app | **Sigue sonando**; ganancia NO baja (sigue al % del slider) | Re-observar tras 3 s: `window.__audioProbe().stats.gain` |
| A3 | Bloquear pantalla | Sigue sonando (Android/PWA); si iOS Safari lo pausa, **documentar** (no es bug) | Nota de qué pasó |
| A4 | Volver a la app | Sigue sonando sin clics; `lifecycle=FOREGROUND`; `rms>0` | `window.__lifecycle.summary()` |

**Criterio PASS (A):** la ganancia nunca baja sola en A2/A3; sin cortes al volver.

### B. Pausa/play real desde la pantalla de bloqueo (temporizador)

| # | Paso | Esperado | Evidencia |
|---|---|---|---|
| B1 | Con sesión activa, armar un temporizador (p. ej. 15 min) | Barra del sistema muestra ~900 s | Captura del controlador |
| B2 | Pausar desde la notificación/lock screen | `playbackState=paused`; el audio cesa con fade; la barra se congela | `__vyneural.state().timeLeft` estable |
| B3 | Esperar 30 s y pulsar **Play** desde el lock screen | Reanuda con ~870 s (NO 900): **no reinició** | `timeLeft` tras reanudar |
| B4 | Pausar y reanudar varias veces | Nunca se duplica el audio; `audioState` alterna PAUSED/PLAYING | Log `__interferenceLog` |

**Criterio PASS (B):** B3 reanuda con el remanente, no desde cero.

### C. Volumen desde la Media Session

| # | Paso | Esperado | Evidencia |
|---|---|---|---|
| C1 | Con sesión activa, subir volumen por el sistema (si el SO lo expone; si no, `window.__vyneural.volumeUp()`) | El motor sube 10 %; slider y etiqueta sincronizados | `__vyneural.state().volume` |
| C2 | Bajar hasta 0 y volver | Nunca negativo ni >100 %; sigue sonando a >0 | Valores extremos |

**Criterio PASS (C):** volumen real del motor cambia y la UI lo refleja.

### D. Barra de progreso del sistema

| # | Paso | Esperado | Evidencia |
|---|---|---|---|
| D1 | Temporizador 15 min activo | Barra visible contando hacia atrás | Captura lock screen |
| D2 | Cambiar a ∞ durante la sesión | **La barra desaparece** del controlador | Captura (sin barra) |
| D3 | Pasar de ∞ a 20 min | La barra reaparece en 1200 s | Captura |

**Criterio PASS (D):** D2 limpia el estado de posición (`setPositionState(null)`).

### E. PWA instalada

| # | Paso | Esperado | Evidencia |
|---|---|---|---|
| E1 | Instalar la PWA (menú Chrome: *Instalar aplicación*) | Abre standalone; badge **PWA** | `matchMedia('(display-mode: standalone)')` |
| E2 | Repetir A2–A4 dentro de la PWA | Sigue sonando sin bloqueo | Igual que A |
| E3 | Cerrar la PWA (swipe) | El audio se detiene (limitación del navegador, igual que YouTube en web); documentar | Nota |

**Criterio PASS (E):** E1–E2; E3 documentado como límite honesto.

### F. Diagnóstico en dispositivo

| # | Paso | Esperado | Evidencia |
|---|---|---|---|
| F1 | Consola: `window.runBineuralDiagnostics()` | **113 PASS / 0 FAIL** (también en navegador) | Salida |
| F2 | Tecla `D` (HUD) | `audioState` real (PLAYING/PAUSED), `lifecycle` correcto | Captura HUD |
| F3 | `/diagnostico` → fila Media Session | `Controles activos` con la sesión sonando | Captura |

**Criterio PASS (F):** F1 sin fallos ambientales; F2/F3 sin mentiras de estado.

## G. APK — depuración por causalidad (P5.1–P5.5)

> Matriz destructiva completa con procedimientos y comandos `adb` en
> [`docs/DESTRUCTIVE_MATRIX.md`](DESTRUCTIVE_MATRIX.md). Aquí el resumen físico:

| # | Escenario | Resultado esperado (P5) | Evidencia |
|---|---|---|---|
| G1 | PLAY → LOCK/UNLOCK ×10 | **1 START total, 0 espontáneos**; sesión intacta al desbloquear | `DiagnosticsActivity` traza |
| G2 | PLAY → navegar ×20 | **0 START adicionales**; el servicio sigue foreground | `dumpsys activity services` |
| G3 | Sesión DETENIDA: mover volumen/onda/frecuencia/alarma | **audio=OFF, service=OFF** (config nunca revive) | traza: `* dropped: servicio no activo` |
| G4 | PLAY → matar el proceso → esperar | **NO PLAY**; sin notificación; UI honesta al reabrir | `dumpsys media_session` vacío |
| G5 | Alarma con la APK cerrada | **Notificación SÍ, Audio NO, WebView NO** | notificación; `dumpsys media_session` |
| G6 | Lock screen pause → UI play | 1 PAUSE + 1 RESUME (protocolo simétrico) | `window.__causalLog` |

**Criterio PASS (G):** G1–G5 sin ningún START espontáneo; G6 con conteo de
comandos exacto (1 START / 1 PAUSE / 1 RESUME / 1 STOP por acción de usuario).

## Dispositivos requeridos

- Android 8.0+ con Chrome actualizado (web y PWA).
- iPhone con iOS 16.4+ (Safari y PWA instalada; Media Session de lock screen
  solo con la PWA instalada).
- Opcional: auriculares Bluetooth para verificar controles BT (H4 del plan físico).

## Registro

| Fecha | Plataforma | Dispositivo | Escenarios ejecutados | Resultado | Notas |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

> Los escenarios A–F son **web/PWA**; G es **APK** (requiere emulador o
> dispositivo Android con la APK instalada). La matriz destructiva G debe
> ejecutarse completa en hardware antes de empaquetar/release (P5.5).
