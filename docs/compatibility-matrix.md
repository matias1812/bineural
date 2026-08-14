# MATRIZ DE COMPATIBILIDAD — verificación en dispositivo real

> Bineural · Audio en segundo plano · Pantalla de bloqueo · Notificaciones.
> P33 del plan de robustez. REGLA: **no marcar "compatible" porque la API
> exista** — cada celda se clasifica por su comportamiento real, y lo que no
> se ha podido probar en dispositivo físico queda declarado como
> **NOT TESTED** con su paso de verificación.

## Leyenda de estados

| Estado | Significado |
|---|---|
| **WORKS** | Comportamiento confirmado por fuente autoritativa **o** verificado en navegador real |
| **LIMITED** | Funciona con condiciones / parcialmente / solo en ciertas versiones |
| **NOT GUARANTEED** | El navegador/OS no garantiza el comportamiento (aunque la API exista) |
| **UNSUPPORTED** | No disponible en la plataforma, con o sin instalación |
| **NOT TESTED** | Verificación en dispositivo físico pendiente (paso indicado) |

## Matriz (móvil + referencia escritorio)

| Capacidad | Chrome Android (navegador) | Android PWA (instalada) | iOS Safari (sin instalar) | iOS PWA (instalada) | Chrome/Firefox/Edge escritorio |
|---|---|---|---|---|---|
| Audio en segundo plano | **WORKS** — el `<audio>` real (srcObject) mantiene la pestaña *audible*; Chrome no suspende el AudioContext | **WORKS** — la PWA rutea por la sesión multimedia del SO | **NOT GUARANTEED** — iOS suspende el Web Audio al pasar a segundo plano/bloquear | **LIMITED** · **NOT TESTED** — vía `direct` + ancla legacy (reclama la MediaSession); hay que probarlo en el móvil | **WORKS** en Chrome/Edge · Firefox puede suspender según ajuste |
| Controles en notificaciones / lock screen | **WORKS** (MediaSession con `play`/`pause`/`stop`/seek) | **WORKS** | **NOT GUARANTEED** — Safari 15.4+ expone MediaSession, pero el Web Audio por sí solo no integra el lock screen; sin instalar, no | **LIMITED** · **NOT TESTED** — el ancla audible reclama los controles; quirk de play-tras-pause de Safari mitigado con `recoverFade` | **WORKS** · quirk Safari play-tras-pause |
| Notificaciones (app viva) | **WORKS** (Notification + SW) | **WORKS** | **UNSUPPORTED** — iOS no expone Notification API sin PWA instalada (la app avisa: `iosNeedsInstall`) | **WORKS** (16.4+; vía Web Push + `showNotification` del SW) | **WORKS** |
| Acciones en notificaciones (▶ Iniciar / Descartar) | **WORKS** (`actions` en `Notification.prototype`) | **WORKS** | **UNSUPPORTED** — el código detecta y omite los botones | **UNSUPPORTED** — igual que Safari | **WORKS** (excepto Firefox/sistemas sin `actions`) |
| Wake Lock (pantalla activa) | **WORKS** | **WORKS** | **WORKS** (16.4+) — solo en pestaña visible; no garantiza audio en background | **LIMITED** — roto en 16.4–18.3 (bug WebKit #254545), **arreglado en iOS 18.4** | **WORKS** (Chrome 84+, Safari 16.4+, Firefox 126+) |
| Service Worker | **WORKS** | **WORKS** | **UNSUPPORTED** sin instalar | **WORKS** | **WORKS** |
| Web Push (requiere servidor) | **NOT CONFIGURED** (API soportada) | **NOT CONFIGURED** | **NOT CONFIGURED** · **UNSUPPORTED** sin instalar | **NOT CONFIGURED** (soportado 16.4+) | **NOT CONFIGURED** |
| Badging (insignia en el icono) | **WORKS** (`setAppBadge`) | **WORKS** | no aplica | **WORKS** (16.4+, Badging API) | **WORKS** (Chrome/Edge) |
| Fullscreen | **WORKS** | **WORKS** | **LIMITED** (Safari no expone la API estándar de forma completa) | **LIMITED** | **WORKS** |
| Alarma local con app cerrada | **NOT GUARANTEED** (sin Push no hay scheduler persistente; respaldo: calendario) | **NOT GUARANTEED** | **NOT GUARANTEED** | **NOT GUARANTEED** | **NOT GUARANTEED** |
| Respaldo calendario (.ics / Google Calendar) | **WORKS** (lo dispara el SO) | **WORKS** | **WORKS** | **WORKS** | **WORKS** |

## Base de evidencia por celda (fuentes verificadas, 2026)

- **iOS 16.4+ Web Push / Badging / Wake Lock / Manifest ID** para apps de
  pantalla de inicio — WebKit blog *"Web Push for Web Apps on iOS and iPadOS"*
  (feb 2023): https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- **Wake Lock en iOS instalada roto hasta iOS 18.4** — WebKit bug #254545
  (https://bugs.webkit.org/show_bug.cgi?id=254545) y Progressier
  (actualizado ago 2026): https://progressier.com/pwa-capabilities/screen-wake-lock
- **Wake Lock soportado en Safari iOS 16.4+ y en todos los navegadores**
  — caniuse `wake-lock` y web.dev (may 2024):
  https://web.dev/blog/screen-wake-lock-supported-in-all-browsers
- **Patrón elemento audible + MediaSession**: Chrome lo reclama sin problema;
  Firefox exige audio audible real para despachar al SO; Safari tiene el quirk
  play-tras-pause — underoot.dev *"Web Audio API: Enjoy the Silence"* (ene 2025):
  https://underoot.dev/blog/2025/01/19/web-audio-media-session-journey/
  → valida la arquitectura P0.5: el `<audio>` real (no mudo) es la vía correcta
  en Android/escritorio, y el ancla legacy (audible para el navegador) solo en
  iOS `direct`, donde WebKit no reproduce MediaStream en `<audio>`.
- **iOS: Notification API no disponible sin PWA instalada** — comportamiento
  conocido de WebKit; la app lo detecta (`iosNeedsInstall`) y lo informa.
- **Wake Lock se libera al ocultar la pestaña** — MDN / Progressier; el código
  lo re-adquiere en `visibilitychange` si la sesión sigue activa.

## Protocolo de verificación en dispositivo (por plataforma)

Antes de cada corrida: abrir la build desplegada en el contexto exacto
(navegador o PWA instalada) y capturar la sonda:

```js
await window.__platformProbe()   // pegar el JSON como evidencia
```

La sonda devuelve: dispositivo (UA, iOS/Android, standalone, displayMode),
estado del audio (ctxState, sampleRate, RMS, osciladores, modo de transporte,
elemento), MediaSession (soporte + playbackState), Wake Lock (soporte +
activo), notificaciones (permiso + acciones), SW registrado, Push, badges y
alarmas. Complementar con `window.__audioProbe()`, `window.__lifecycle`,
`window.__sessionLog` y `window.__notificationDiagnostics()`.

### T1 · Audio continuo al minimizar (60 s)

1. PLAY (verificar `__audioProbe`: ctx `running`, 2 osciladores, RMS > 0, reloj avanzando).
2. Minimizar → abrir otra app → esperar 60 s → volver.
3. **PASS** si: misma frecuencia/latido, sin click/pop, RMS continuo, sin osciladores duplicados, sin `audioSuspended` en el log de sesión. **PARTIAL** si el SO suspendió (integrity < 100% con aviso honesto).

### T2 · Bloquear pantalla 5 min → desbloquear

1. PLAY → bloquear → 5 min → desbloquear.
2. **PASS** si el audio continúa y la integridad es 100%; **PARTIAL** si hubo
   suspensión registrada (el informe lo muestra, no se oculta).

### T3 · Bluetooth OFF → ON (y auriculares)

1. PLAY → desconectar Bluetooth → reconectar.
2. **PASS** si no reinicia osciladores ni frecuencias; el evento queda
   registrado en el log. (No se recrea el AudioContext.)

### T4 · Pausa / stop desde la pantalla de bloqueo

1. PLAY → desde los controles del SO: PAUSE → RESUMEN → STOP.
2. **PASS** si: pausa registra `experimentPaused` (no baja integridad),
   reanudar `experimentResumed`, y STOP sincroniza UI + MediaSession + audio
   (nada queda en "playing" con la UI detenida).

### T5 · Alarma en segundo plano

1. Crear alarma +2 min → minimizar → esperar.
2. **PASS** si llega la notificación (con acciones solo si la plataforma las
   soporta) y el tap en ▶ abre la sesión configurada (deep link `autostart`).
3. Documentar la condición exacta (página viva vs congelada vs cerrada) — con
   la app cerrada, **NOT GUARANTEED** por diseño; el respaldo es el calendario.

### T6 · Duplicación (tortura)

PLAY → PLAY → PAUSE → PLAY → STOP → PLAY. Después de cada paso verificar
`__audioProbe().stats.oscillatorCount` (2 en play, 0 en stop, nunca 4/6) y
que `__alarmManager.fires` no dispare dos veces la misma alarma.

## Plantilla de evidencia (rellenar por dispositivo)

```markdown
### Dispositivo: <modelo>
- OS: <Android 14 / iOS 17.x> · Browser: <Chrome 12x / Safari>
- Contexto: <navegador | PWA instalada>
- Fecha: <aaaa-mm-dd>
- Probe: <JSON de `await window.__platformProbe()`>

| Test | Resultado | Evidencia (hooks) | Estado |
|---|---|---|---|
| T1 minimizar 60 s | ... | `ctxState`, `rms`, log | WORKS / PARTIAL / FAIL |
| T2 bloquear 5 min | ... | `integrity`, `interruptions` | ... |
| T3 Bluetooth off/on | ... | osciladores, eventos | ... |
| T4 pausa/stop lock screen | ... | `experimentPaused/Resumed`, MediaSession | ... |
| T5 alarma +2 min | ... | `__notificationDiagnostics()`, acciones | ... |
| T6 duplicación | ... | `oscillatorCount` 2/0 | ... |
```

## Limitaciones conocidas de plataforma (documentadas, no ocultadas)

1. **iOS: notificaciones solo con la app instalada** (16.4+). Sin instalar,
   la UI lo avisa y el respaldo es el calendario. (WebKit #13878)
2. **iOS: Wake Lock roto en PWA instalada 16.4–18.3**; funciona en iOS 18.4+.
   Y Wake Lock **no** garantiza audio en segundo plano: solo evita que la
   pantalla se apague. (WebKit #254545, Progressier)
3. **iOS: Web Audio no se expone al reproductor del lock screen por sí solo**;
   por eso el modo `direct` usa el ancla audible legacy para reclamar la
   MediaSession. Es la celda con más riesgo de la matriz: requiere prueba física.
4. **Safari: quirk play-tras-pause** en MediaSession — `recoverFade` reanuda
   con rampa y evita el clic. (underoot 2025)
5. **Firefox: exige audio audible** para despachar MediaSession; en Android,
   el audio en segundo plano depende del ajuste del navegador. (underoot 2025)
6. **Chrome: un elemento con volumen 0 o muted no cuenta como audible** — no
   reclama MediaSession y el AudioContext puede suspenderse; por eso el
   transporte real usa el `<audio>` con el stream, no un ancla muda.
7. **Sin Push no existe scheduler persistente**: alarma con la app cerrada =
   **NOT GUARANTEED**; respaldo real = Google Calendar / `.ics`.
8. **Wake Lock se libera al ocultar la pestaña**; re-adquisición en
   `visibilitychange` solo si la sesión sigue activa.

## Cómo rellenar esta matriz

1. Instalar/abrir la build desplegada en cada contexto (navegador y PWA).
2. Correr `await window.__platformProbe()` y guardar el JSON.
3. Ejecutar T1–T6 y completar la plantilla con los valores de los hooks.
4. Actualizar la celda: **WORKS / LIMITED / NOT GUARANTEED / UNSUPPORTED**.
5. Si una celda sigue sin prueba física, mantener **NOT TESTED** con su paso.
