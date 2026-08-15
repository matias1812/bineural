# PERMISSION MATRIX — P2

## Política: nada al primer arranque, todo bajo demanda

| Permiso | ¿Obligatorio? | ¿Cuándo se pide? | Si se rechaza | "No volver a preguntar" |
|---|---|---|---|---|
| POST_NOTIFICATIONS (APK) | No | Primer uso que necesita notificar (guardar alarma/recordatorio, botón "Probar") | App sigue funcionando; UI muestra `denied` + botón "Abrir ajustes de notificación" | Se consulta el estado real del SO (`permissionState`); nunca se finge GRANTED |
| SCHEDULE_EXACT_ALARM (APK) | No | Solo al programar una alarma exacta (no al arrancar) | Se usa alarma inexacta o respaldo web/calendario; `exactAlarms.granted=false` reflejado | Botón "Autorizar alarmas exactas" → `OPEN_SETTINGS` |
| FOREGROUND_SERVICE(_MEDIA_PLAYBACK) | Sí (solo para audio persistente) | Al iniciar una sesión con audio | Declarado en manifest; el servicio arranca dentro de la app en foreground (no es dialog de usuario) | N/A |
| Notificaciones web (Notification.permission) | No | En el gesto de play, si aún no se decidió | Permiso queda `default/denied`; la app avisa solo con la página viva | No se vuelve a preguntar (LS_PERM_ASKED) |
| Wake Lock | No (mejora) | En el gesto de play, si soportado | Audio sigue igual; es pantalla, no audio | N/A |
| INTERNET | Sí (APK) | En manifest (normal) | N/A (offline total; no se usa backend) | N/A |

## Reglas P5 cumplidas

- **No se piden todos los permisos indiscriminadamente** al abrir la APK (verificado: al arrancar `exactAlarms=false`, `focusState=NONE`, sin diálogos forzados).
- **La UI refleja el estado real:** `mergePlatformCapabilities` separa `supported / granted / active`; el modal de permisos muestra "concedido", "denegado" o "sin decidir" según el sistema.
- **Nunca "PERMISSION GRANTED" si Android no lo concedió:** el bridge lee `notificationPermission` real del SO (`Permissions.notificationState()`), no un flag propio.

## Estados del modelo (P6)

```
notifications: { supported: true, granted: false, active: false }   // no: notifications=true
```

- `supported` = API disponible · `granted` = permiso concedido · `active` = servicio/función realmente funcionando.
- `push.configured=false` sin backend · `backgroundScheduling='NOT_GUARANTEED'` (honesto).
