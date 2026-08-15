# P2 — VALIDACIÓN TÉCNICA FINAL

**Fecha:** 2026-08-15 · **Entorno:** emulador Android 14 (API 34, AVD `vyneural-test`) + suite headless + revisión de código.

> **Re-validación (11:4x UTC-3):** ciclo completo re-ejecutado en vivo con evidencia fresca — play → screen off → pause → resume → stop vía `cmd media_session dispatch` (routing determinista), alarma con disparo real verificado por timestamp, y abandon de foco confirmado en `dumpsys audio`. Resultados idénticos a la primera ejecución.

---

## P2 STATUS: CONDITIONAL PASS

**CORE INTEGRITY: PASS** — `audio.js`, `cymatics.js`, `wavefield.js`, `core/simulation.js`, `core/experiments.js` sin cambios vs. último commit estable (`bdacf78`). P2 trabaja solo vía adapters/platform services (`src/platform/*`, `src/core/audio-*.js`).

---

## Evidencia por plataforma

### APK nativa — validada en emulador (API 34) ✅

| Ítem | Evidencia |
|---|---|
| Instalación | `pm list packages` → `com.vyneural.bineural` v1.0.0 (targetSdk 34, minSdk 26) |
| Launch | `am start` → `topResumedActivity = MainActivity`, proceso vivo |
| Bridge | CDP WebView: `bridgeStatus=CONNECTED`, `platform=android`, `present=true` |
| Handshake | `getPlatformInfo()` → capacidades reales (no UA) |
| Permiso notificaciones | `POST_NOTIFICATIONS` declarado; `notificationPermission=GRANTED` real |
| Canales | `bineural_alarms` (importance 4), `bineural_player` (importance 2) creados |
| Foreground Service | `isForeground=true foregroundId=1001 types=MEDIA_PLAYBACK` + notif `bineural_player` (category=transport, actions=2) |
| MediaSession (SO) | `dumpsys media_session`: `active=true`, `PlaybackState=PLAYING` |
| Audio focus | `dumpsys audio`: `requestAudioFocus(... AA=USAGE_MEDIA ... req=1)` → `focusState=GAIN` |
| GET_AUDIO_STATE | `{provider: native, audioActive: true, serviceRunning: true, focusState: GAIN, playbackState: playing}` |
| Provider único | `provider=native` + `assertSingleAudioProvider()=true` (web muda) |
| Control del SO | `cmd media_session dispatch pause/play` → UI sincroniza (`system_pause`/`system_play`, reason `lock-screen`) |
| Pantalla bloqueada | Con screen off: servicio `isForeground=true`, MediaSession `PLAYING` con posición AVANZANDO (2910524 ms en 2 lecturas) |
| Stop | `dispatch stop` → 0 instancias de servicio, 0 MediaSession, UI `STOPPED`, focus ABANDONADO (helper nativo + WebView) |
| TEST_NOTIFICATION | Notificación real en `bineural_alarms`, importance 4, category=reminder, contentIntent interactable |
| SCHEDULE_ALARM | `{"status":"OK"}` y disparo real confirmado (`when=1786808992293` ≈ hora del dispositivo) + rechazo `INVALID` de payload mal formado |
| CANCEL_ALARM | OK |
| Exact alarms | `exactAlarms=false` (correcto: se pide solo si se usa; no solicitado) |

### Web / PWA — validación headless + revisión de código

| Ítem | Evidencia |
|---|---|
| Tests | `npm test` → **82/82 PASS** (estados, lifecycle, watchdog, transport, bridge, notificaciones, fallback) |
| Build | `vite build` limpio (9 páginas + assets) |
| Detección de plataforma | `detectPlatformKind`: Chrome Android = `android-browser` (nunca APK sin bridge) |
| Fallback sin bridge | `createNativeBridgeAdapter()` → todo `NOT_SUPPORTED`, web intacta |
| UI no detiene audio | `AudioStateMachine` + guard: eventos UI no transicionan audio (test dedicado) |
| Interacción UI | Fix P2: `pointerdown` solo restaura si `ctx.state==='suspended'` (antes re-ejecutaba restore por toque) |
| Sesiones largas | Log de eventos acotado (1000) para no crecer sin límite |

---

## BLOCKERS
- **Validación física pendiente**: Bluetooth real, auriculares, reinicio de dispositivo, PWA instalada en dispositivo físico y proceso eliminado por el SO. El emulador no permite probarlos con fidelidad.

## KNOWN LIMITATIONS
- **Web (navegador no instalado):** iOS Safari suspende el AudioContext al bloquear (mitigación: duck + recovery al volver). Android Chrome mantiene audio vía elemento `<audio>` real (transporte `element`).
- **PWA:** funciona como Web + instalación; NO reemplaza la APK (sin service worker no hay ejecución garantizada en background; notificaciones con app cerrada requieren Push/backend o APK).
- **Push remoto:** no configurado (sin backend) — honestamente reportado como `push.configured=false`.
- **Exact alarms:** no solicitadas al arranque (se piden solo si se programa alarma exacta).

## BACKEND REQUIRED: NO (parcial)
- Alarmas/recordatorios: **APK nativa** los maneja offline (AlarmManager + notificación nativa). Web/PWA: calendario (ICS/Google Calendar) o app abierta.
- Push remoto (backend): **NO implementado** — solo notificaciones locales. Documentado en `NOTIFICATION_ARCHITECTURE.md`.

## NEXT ACTION
Probar en dispositivo físico: Bluetooth, lock screen con pantalla realmente apagada, kill del proceso, y PWA instalada real. Ver `P2_HARDWARE_VALIDATION.md` (checklist emulador ya ejecutado).

---
*Ver: `PLATFORM_CAPABILITY_MATRIX.md`, `NOTIFICATION_ARCHITECTURE.md`, `AUDIO_LIFECYCLE_REPORT.md`, `MEDIA_SESSION_REPORT.md`, `PERMISSION_MATRIX.md`, `TEST_MATRIX.md`.*
