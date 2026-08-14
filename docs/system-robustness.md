# Robustez de sistema: audio en segundo plano, ciclo de vida y experimentación

> Fase de robustez PWA (P0–P40 del plan maestro). Principio rector: **no
> engañar al sistema operativo**. Si Android/iOS congela la PWA, se reconoce.
> Si el navegador no permite un scheduler persistente, se reconoce. La
> calidad se mide por continuidad real + ausencia de interferencias +
> controles reales + permisos reales + reproducibilidad + integridad.

## Arquitectura (tres sistemas separados, nunca mezclados)

```text
AUDIO PLAYBACK ──► Media Session / controles del SO (no depende de Notification)
SESSION SCHEDULING ──► Service Worker / Push / Calendar (alarmas; no finge audio)
SCIENTIFIC SIMULATION ──► SimulationEngine (modelos; cadencia 30/10 Hz)
```

Ningún sistema se usa para fingir que otro existe: el control del reproductor
viene de `navigator.mediaSession`, no del permiso de notificaciones; el
scheduler de alarmas es honesto sobre su límite (la página viva) y ofrece
respaldo de calendario; la simulación no mantiene 60 fps en segundo plano.

## P0 — Auditoría del ciclo de vida (tabla EVENTO → actual → debería → riesgo → solución)

| Evento | Qué ocurre hoy | Qué debería ocurrir | Riesgo | Solución |
|---|---|---|---|---|
| `visibilitychange` → hidden | Duck a 0 solo en iOS sin PWA; marca `BACKGROUND`/`AUDIO_*` en `AppLifecycle` | Lo mismo; el audio sigue si la plataforma lo permite | Timers estrangulados | El reloj de audio manda (AudioClock); no se reinicia nada |
| `visibilitychange` → visible | `restoreFromBackground()`: `recoverFade` si estaba suspendido | Transición `RETURNING` → `FOREGROUND` completada por el estado real del contexto | Clic de reanudación | Ganancia al piso antes de `resume()` + rampa |
| `AudioContext.onstatechange` | Nuevo: alimenta `AppLifecycle` y el `ExperimentEventLog` | Es la fuente de verdad de suspensión (iOS lock, audio focus) | SO suspende sin visibilitychange | Watchdog + hook de estado |
| `pageshow` / `focus` | `restoreFromBackground()` | Reafirmar ancla + MediaSession | Sesión muda con botón en play | Reafirmación idempotente |
| `freeze` / `resume` (Chrome) | `resume` → `restoreFromBackground` | Igual | Página congelada | El SW no puede mantener el AudioContext: se reconoce |
| `fullscreenchange` | Reafirmación de audio (turno anterior) | Igual | Algunos dispositivos suspenden al entrar/salir | Watchdog |
| AudioContext suspended | `AUDIO_SUSPENDED` + interrupción registrada | Registrar `audioSuspended` con audioTime | Pérdida de exposición | Integridad < 100% honesta |
| Wake Lock | Se adquiere en play, se libera en pausa | Mantener la pantalla activa; **no** presentarlo como garantía de audio | Usuario cree que asegura el audio | Etiquetas honestas (P11) |
| MediaSession | Metadata + acciones + `setActive` | Controles reales del SO | Dependencia falsa de Notification | Nunca se pide Notification por MediaSession |
| Timers (`setInterval` alarmas) | Watcher de 15 s mientras la página vive | Revisar alarmas en startup/foreground/resume; **no** prometer ejecución en background | Página congelada → alarma perdida | Respaldos Google Calendar / .ics + texto honesto |

## Módulos nuevos (lógica pura, testeada headless)

| Módulo | Fase | Responsabilidad |
|---|---|---|
| `src/core/audio-clock.js` | P4 | Fase del latido y tiempo de sesión derivados de `AudioContext.currentTime` (sin drift, sin timers). `beatPhase()`, `nextBeatAt()`, `elapsed()` |
| `src/core/lifecycle.js` | P5 | Máquina de estados `FOREGROUND / BACKGROUND / AUDIO_RUNNING_BACKGROUND / AUDIO_SUSPENDED / RETURNING / STOPPED` con transiciones explícitas y rechazo de eventos inválidos |
| `src/core/experiment-events.js` | P19/P20 | Registro de eventos `{ts, audioTime, type, payload}` + **integridad de sesión** (exposición real / esperada; pausas voluntarias no bajan la integridad; suspensiones del SO sí) |
| `src/core/capabilities.js` | P10/P37/P38 | Sondeo de capacidades reales (notificaciones, Media Session, Wake Lock, Push, autoplay) con etiquetas honestas por plataforma |
| `BinauralEngine.getAudioStats()` / `onCtxStateChange` | P26/P36 | Estado real del motor (contexto, sample rate, RMS, ganancia, nº de osciladores) y hook de suspensión/reanudación |

### AudioClock (P4) — reloj maestro

- La fase del latido se calcula `phase = ((t − epoch) mod period)/period` con
  `t = AudioContext.currentTime`. `setTimeout`/`setInterval`/`Date.now()`/RAF
  no son reloj del audio; solo UI, historial y scheduler externo.
- El pulso visual se auto-corrige con `nextBeatAt()`: aunque la pestaña
  pase 20 minutos congelada, al volver la fase es la correcta (testeado).
- `Date.now()` solo se usa para UI, historial, duración aproximada y
  scheduler externo (alarmas).

### Máquina de estados (P5)

```text
FOREGROUND ──hidden+playing+ctx running──► AUDIO_RUNNING_BACKGROUND
FOREGROUND ──hidden+playing+ctx suspended─► AUDIO_SUSPENDED
FOREGROUND ──hidden+!playing─────────────► BACKGROUND
AUDIO_RUNNING_BACKGROUND ──ctx suspended──► AUDIO_SUSPENDED
AUDIO_SUSPENDED ──visible────────────────► RETURNING
RETURNING ──resume ok────────────────────► FOREGROUND
cualquiera ──stop────────────────────────► STOPPED
```

Eventos imposibles se **rechazan** (no se fuerza el estado). Nunca se asume
`hidden = audio detenido` ni `visible = audio corriendo`.

### Integridad de sesión (P20)

```text
integridad = exposición real / exposición esperada
esperada = tiempo de pared − pausas voluntarias
real = esperada − interrupciones del SO (suspensión, pestaña congelada sin audio)
```

El resumen de sesión muestra la integridad: `100%` o
`92% — Interrupción de audio 24.8 s`. Registro de eventos en
`window.__sessionLog` y máquina en `window.__lifecycle` (para depuración).

## P12/P14/P15 — Notificaciones de alarma y Service Worker

- `public/sw.js` implementa `notificationclick` (cerrar, enfocar ventana
  existente, navegarla al deep link de la sesión, o abrir la PWA) y
  `notificationclose`.
- La página dispara la alarma con `registration.showNotification()` con
  acciones **▶ Iniciar sesión / Descartar** solo si la plataforma soporta
  acciones (`'actions' in Notification.prototype`); si no, sin botones
  (no mostrar botones que no puedan funcionar).
- **Límite honesto**: un Service Worker NO es un scheduler persistente. Con
  la app cerrada o la pestaña congelada la alarma local no se dispara;
  para eso existe Web Push (requiere backend, P13) y el respaldo de
  Google Calendar / `.ics` ya integrado. La UI de alarmas lo explica.

## P13 — Push API (no implementada, documentada)

Sin backend, Web Push no puede existir. La fila del modal de permisos dice
honestamente **"No configurado — requiere servidor"**. Si algún día hay
backend: `showNotification` del SW ya está listo para mostrarla; habría que
añadir `push` → `showNotification` en `sw.js` y suscripción VAPID.

## P21/P22 — Simulación en segundo plano

- `drawVisual` (render 60 fps) se congela cuando `document.hidden`:
  `if (document.hidden) return;` tras programar el siguiente frame. Sin
  trabajo visual en segundo plano; al volver, la fase se reconstruye desde
  el AudioClock (no se repiten frames perdidos).
- El pipeline científico corre a 30 Hz en sesión y 10 Hz en reposo con
  `dt` acumulado (la simulación avanza en tiempo real; los integradores
  dt-lineales siguen siendo estables).

## P33 — Matriz de compatibilidad (a validar en dispositivo real)

| Capacidad | Chrome Android | Chrome Desktop | Safari iOS | Safari iOS PWA | Firefox Android | Samsung Internet |
|---|---|---|---|---|---|---|
| Audio en segundo plano | Depende del ancla de medios (tab audible) | n/a (pestaña oculta suspende) | ❌ sin PWA | ✅ 16.4+ | Depende de ajuste "audio en segundo plano" | Igual que Chrome |
| Controles en notificaciones/lock | ✅ (MediaSession) | ✅ (controles de medios del navegador) | ❌ sin PWA | ✅ | ✅ | ✅ |
| Notificaciones | ✅ | ✅ | ❌ sin PWA | ✅ 16.4+ | ✅ | ✅ |
| Acciones en notificaciones | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Wake Lock | ✅ | ✅ (Chrome 84+) | ❌ | ❌ | ❌ | ✅ |
| Service Worker | ✅ | ✅ | ❌ sin PWA | ✅ | ✅ | ✅ |
| Push | ✅ (requiere servidor) | ✅ | ❌ sin PWA | ✅ | ✅ | ✅ |
| Fullscreen | ✅ | ✅ | ❌ (Safari no expone API estándar) | ✅ | ✅ | ✅ |

No marcar "compatible" solo porque la API exista: cada fila debe probarse
en el dispositivo real (ver tests de tortura).

## P34 — Tests de tortura (manuales, checklist)

En cada prueba medir: continuidad de frecuencia, de fase, de RMS, glitches,
osciladores duplicados, estado de sesión, integridad del experimento y
estado de MediaSession.

- [ ] PLAY → MINIMIZAR → abrir WhatsApp → volver → ¿audio continuo sin clic?
- [ ] PLAY → BLOQUEAR teléfono → esperar 5 min → desbloquear → ¿continúa? ¿integridad < 100% con aviso?
- [ ] PLAY → Bluetooth OFF → Bluetooth ON → ¿no reinicia osciladores ni frecuencias?
- [ ] PLAY → abrir pestaña nueva → volver
- [ ] PLAY → entrar a fullscreen → salir
- [ ] PLAY → rotar → volver
- [ ] PLAY → pausa desde la pantalla de bloqueo → reanudar desde la pantalla de bloqueo
- [ ] PLAY → stop desde la pantalla de bloqueo → ¿MediaSession liberada y UI sincronizada?
- [ ] PLAY → PLAY → PLAY (doble/triple play) → ¿una sola sesión de audio, sin capas?
- [ ] Alarma con la app en segundo plano → ¿notificación con acciones? → acción ▶ → ¿abre la sesión configurada?

## P35 — Criterios de no regresión

No se acepta una implementación si: la frecuencia cambia, el latido cambia,
la fase salta, el volumen cambia solo, aparece un click/pop, se duplican
osciladores, se duplica el AudioContext, MediaSession queda colgada en
"playing" con la UI detenida, la notificación miente o el experimento pierde
eventos.

## P38 — Fallbacks honestos

| Capacidad | Etiqueta | Realidad |
|---|---|---|
| Alarma en segundo plano | "Limitada — depende del navegador" | Solo dispara con la página viva; respaldo calendario |
| Reproducción en lock screen | "Soportado" / "Requiere instalación (iOS)" | MediaSession según plataforma |
| Push | "No configurado — requiere servidor" | Sin backend no existe |
| Wake Lock | "Pantalla activa (cuando el navegador lo permite)" | No es garantía de audio |
| Media Session | "Disponible (al reproducir)" | No es un permiso |

## P39 — Seguridad y privacidad

Los experimentos, el EEG sintético, el audio y el estado del usuario son
**locales por defecto** (`localStorage`, sin servidor). Nada se envía a un
servidor salvo consentimiento explícito; Vercel Analytics no recoge el
contenido de la sesión.
