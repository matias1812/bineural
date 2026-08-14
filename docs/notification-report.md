# NOTIFICATION VALIDATION REPORT — P0 Notification System

> Informe de validación del sistema de recordatorios (plan P0, "Zero Backend").
> REGLA: nunca se promete una capacidad que el navegador/OS no garantiza.
> API disponible ≠ funcionalidad garantizada.

## Arquitectura implementada

```
                    ALARM
                      │
          ┌───────────┴────────────┐
          │                        │
   AlarmManager (página)      CalendarProvider (.ics / Google Calendar)
          │                        │
   scheduler ÚNICO (5 s)           │
          │                        │
   NotificationManager             ▼
   ├─ ServiceWorkerProvider    recordatorio del SO
   ├─ LocalNotificationProvider   (aunque la app esté cerrada)
   ├─ PushNotificationProvider  → DESACTIVADO (sin backend)
   └─ CalendarProvider          → manual (botones del modal)
```

- **`src/core/alarm-manager.js`** — única autoridad sobre crear/cancelar/ejecutar/expirar
  alarmas. Persistencia durable en **IndexedDB** (`vyneural-alarms-db`) con espejo
  síncrono en `localStorage` para la UI (`getAlarms()` sigue funcionando).
- **`src/core/notification-manager.js`** — orquesta providers por capacidad real.
- **`src/core/notification-capabilities.js`** — detección honesta de capacidades.
- **`src/notifications.js`** — primitivas (SW/local/calendar/chime) sin schedulers.
- **`public/sw.js`** — `notificationclick`/`notificationclose`/`push`/`message`.
- **`src/main.js`** — wiring: `window.__alarmManager`, `window.__notificationManager`,
  `window.__notificationDiagnostics()`.

## Matriz por condición (Fase 9/22)

| Condición                        | Notificación local | SW | Push | Calendar | Resultado declarado |
|----------------------------------|--------------------|----|------|----------|---------------------|
| A · Página visible               | ✅ SÍ              | ✅ | —    | manual   | **WORKS**           |
| B · Otra pestaña activa          | ✅ SÍ              | ✅ | —    | manual   | **WORKS**           |
| C · Página minimizada/suspendida | ⚠️ best-effort     | ⚠️ | —    | manual   | **LIMITED**         |
| D · PWA instalada en background  | ⚠️ dependiente     | ⚠️ | —    | manual   | **LIMITED**         |
| E · PWA cerrada                  | ❌ NO               | ❌ | ❌   | ✅ SO    | **NOT GUARANTEED** → respaldo calendario |
| F · Navegador cerrado            | ❌ NO               | ❌ | ❌   | ✅ SO    | **NOT GUARANTEED** → respaldo calendario |
| G · SO congeló la pestaña        | ⚠️ al volver se marca MISSED/TRIGGERED | — | — | ✅ | **LIMITED** |

## Matriz de capacidades (Fase 28)

| Capability                    | Estado            | Evidencia                                             | Limitación |
|-------------------------------|-------------------|-------------------------------------------------------|------------|
| Permiso Notification          | WORKS             | `requestPermission()` real; tests con estado 'default' piden de verdad | En iOS requiere PWA instalada (16.4+) |
| Scheduler único (página viva) | WORKS             | `AlarmManager` — 1 `setInterval`, 0 timers duplicados | Muere si la página muere (honesto) |
| Persistencia IndexedDB        | WORKS             | Test de recarga + verificación en navegador (restaurada tras reload) | — |
| Anti-duplicado                | WORKS             | One-shot (store + espejo), estados SCHEDULED→TRIGGERED/MISSED; test 2 ticks = 1 fire | Sin Web Locks, carrera mínima cerrada por confirmación en store |
| Multi-tab                     | WORKS (Web Locks) | Solo la pestaña PRIMARIA dispara (test locks denegado/concedido) | Sin Web Locks: elección best-effort por BroadcastChannel |
| SW notificationclick          | WORKS             | Cierra → enfoca ventana → navega deep link → o abre la PWA | Solo si el SW está registrado (producción) |
| Acciones (START/DISMISS)      | LIMITED           | Solo se muestran si `'actions' in Notification.prototype` | iOS no las soporta → sin botones |
| Alarmas con la app cerrada    | **NOT GUARANTEED**| Sin Push no hay scheduler persistente; declarado en UI y docs | Requiere backend de Web Push |
| Web Push                      | **NOT CONFIGURED**| `pushSupported()` + handler `push` listos; `configured: false` | Requiere servidor (no existe) |
| Calendar / .ics               | WORKS             | `buildIcs`/`buildGoogleCalendarUrl` (tests: UID/DTSTART/DTEND), botones del modal | El recordatorio lo gestiona el SO |
| Diagnóstico                   | WORKS             | `window.__notificationDiagnostics()` (permiso, SW, push, alarmCount, activeScheduler, lastError) | — |
| La notificación toca el audio | ❌ nunca           | `onFire` en hidden solo notifica/chime; jamás crea AudioContext ni sesión (Fase 21) | — |

## Estados de alarma (Fase 13)

`SCHEDULED → TRIGGERED` (una vez) · `SCHEDULED → CANCELLED` (nunca se ejecuta) ·
`SCHEDULED → MISSED` (venció pasada la gracia de 5 min: **no** se ejecuta una alarma vieja) ·
vencida al arrancar → `EXPIRED`.

## Tests (Fase 25) — suite 71/71

- `alarmStateOnTick`: wait/fire/miss/skip (5 casos).
- Disparo único: one-shot en memoria + store durable; 2º tick no duplica.
- Cancelada nunca se ejecuta.
- Vencida → MISSED (no se ejecuta tarde).
- Recarga: recupera desde el store durable.
- Arranque: descarta EXPIRED.
- Multi-tab: primaria dispara, secundaria no (Web Locks).
- Multi-tab sin Web Locks: BroadcastChannel elige UNA primaria.
- NotificationManager: SW primero, local como fallback; denegado → no finge.
- Push desactivado + Calendar manual (honestidad).
- NotificationCapabilities: API ≠ garantizado; push "requiere servidor".
- CalendarProvider: `.ics` válido (UID/DTSTART/DTEND) + URL Google Calendar.

## Test de tortura en navegador (Fase 26) — verificado

crear → (recarga) → restaurar → disparar 1× → cancelar → no dispara → badge/UI
sincronizados → 0 duplicados, 0 alarmas fantasma, 0 errores de consola.

## Declaraciones honestas (UI)

- Modal de alarmas: *"Con la app cerrada o congelada, la notificación local no puede
  dispararse (límite del navegador). El respaldo del calendario sí avisa a la hora
  exacta. Las notificaciones con la app cerrada (Web Push) requieren un servidor:
  aún no está configurado."*
- Permisos: Notificaciones **Activadas/Bloqueadas/No decididas** · Avisos con la app
  cerrada **No garantizado** · Web Push **Requiere servidor** · Calendario **Disponible**.

## Regla final cumplida

- ❌ No hay `setTimeout` como scheduler persistente (solo `setInterval` del manager vivo).
- ❌ El SW no programa nada (no es scheduler del SO).
- ❌ No se promete notificación con la web cerrada sin Push.
- ❌ No hay schedulers duplicados (el watcher legacy se eliminó).
- ✅ Permisos reales, persistencia durable, anti-duplicado, multi-tab, calendar fallback.
