# NOTIFICATION ARCHITECTURE — P2

## Las 5 vías, sin mezclar

| Vía | ¿Quién crea? | ¿API? | ¿App cerrada? | ¿SW? | ¿Backend? | ¿FCM? | ¿Permiso Android? |
|---|---|---|---|---|---|---|---|
| A. WEB notification | La página abierta | `new Notification()` | ❌ | ❌ | ❌ | ❌ | ❌ (permiso navegador) |
| B. PWA notification | Página o SW (showNotification) | Notifications API + SW | ⚠️ Solo si el SW está vivo y no mataron el proceso | ✅ | ❌ | ❌ | ❌ (permiso navegador) |
| C. APK native notification | Servicio/Receiver nativo | NotificationManager | ✅ (AlarmReceiver con app cerrada) | N/A | ❌ | ❌ | ✅ POST_NOTIFICATIONS |
| D. Push remoto | Servidor → SW | Push API / FCM | ✅ (con backend) | ✅ | ✅ | ⚠️ (opcional, VAPID) | ❌ (permiso navegador) |
| E. Local notification (delay) | Timer en la app | setTimeout / AlarmManager | ❌ web · ✅ APK | ⚠️ | ❌ | ❌ | ✅ APK |

**Conclusión honesta:** el proyecto NO declara "notificaciones background completas". Sin backend, solo la **APK** puede notificar con la app cerrada (AlarmManager + notificación nativa). Web/PWA usan respaldo de calendario (ICS/Google Calendar) cuando el navegador no puede.

## Backend requerido

- **Sin backend (hoy):** alarmas APK (validado: SCHEDULE_ALARM → notificación `bineural_alarms`), calendario, notificaciones con app abierta.
- **Requiere backend/FCM:** push remoto con app cerrada en web/PWA. No implementado (`push.configured=false`).

## Matriz por escenario

| Escenario | Web | PWA | APK |
|---|---|---|---|
| App abierta | ✅ local | ✅ local | ✅ nativa |
| App minimizada | ✅ (página viva) | ✅ (página/SW viva) | ✅ nativa |
| Otra app abierta | ⚠️ depende del navegador | ⚠️ depende del navegador | ✅ nativa |
| Pantalla bloqueada | ⚠️ iOS suspende; Android con página viva | ⚠️ idem | ✅ (validado en emulador) |
| App cerrada | ❌ | ⚠️ solo SW vivo (frágil) | ✅ AlarmReceiver |
| Proceso eliminado | ❌ | ❌ (SW matado) | ⚠️ según OEM; BootReceiver tras reboot |
| Teléfono reiniciado | ❌ | ❌ | ✅ BootReceiver reprograma alarmas |
| Sin internet | ✅ (local) | ✅ (local) | ✅ (offline total) |
| Permiso denegado | ✅ UI refleja `denied` | ✅ idem | ✅ `notificationPermission=denied` |

## Permiso: cuándo y fallback (P5)

- **Primer arranque APK:** NO se pide nada. Notificaciones se piden en el primer uso que las necesita (guardar recordatorio / alarma).
- **Exact alarms:** solo al programar una alarma exacta (no al arrancar).
- **Denegado:** la app sigue funcionando; la UI lo refleja y ofrece abrir ajustes (`OPEN_NOTIFICATION_SETTINGS`, botón contextual).
- **"No volver a preguntar":** se consulta el estado real del SO; nunca se muestra "GRANTED" si Android no lo concedió.
