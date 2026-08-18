# P6 — Alarm & Notification Forensic

---

## 1. Política por plataforma

| Plataforma | Dueño de la alarma | Ejecución | Respaldo |
|---|---|---|---|
| Web | Scheduler web (`AlarmManager`, tick 5 s) | Solo con pestaña viva (honesto) | Calendario (.ics / Google Calendar) |
| PWA | Scheduler web | Solo con pestaña viva | Calendario + Web Push (backend) |
| APK | **AlarmManager nativo** | App cerrada / background / lock / reboot | BootReceiver reprograma |

Decisión pura: `alarmOwnerForPlatform('android-native', bridge) → 'native'`.
La alarma con dueño nativo se marca `external` en el espejo web y el scheduler
web **nunca la dispara en paralelo** (`alarmStateOnTick → 'skip'` si
`alarm.external`) — un solo disparador por evento lógico (I6).

## 2. P0.6 — La alarma nunca produce PLAY

### Web (runtime, R11)
- Alarma programada desde la UI (modal real) a +60 s.
- Disparo: `fires: 1`, `state: TRIGGERED`.
- Audio tras el disparo: `audioState: IDLE · provider: none · ctx: none ·
  causal: [] · uiPlaying: false`.
- Toast: `"Tu sesión está lista — toca play para comenzar 🎧"`.
- **PASS.**

### PWA
- Mismo código que Web + SW. Handler `push`/`notificationclick` del SW solo
  notifican/navegan (código verificado). Instalación standalone y entrega push
  no ejecutables en el entorno (R33/R34) — **BLOCKED parcial**.

### APK (estático)
- `AlarmScheduler` (setExactAndAllowWhileIdle o window 60 s si sin
  SCHEDULE_EXACT_ALARM) → `PendingIntent` → `AlarmReceiver` →
  `NotificationHelper.showAlarm`.
- `AlarmReceiver.onReceive` **solo muestra la notificación** (canal
  `bineural_alarms_v3`, sonido de alarma USAGE_ALARM + vibración, CATEGORY_ALARM).
- **No toca** `BinauralToneEngine` ni el servicio de audio. **PASS (estático).**

### Chime de foreground (Web/PWA)
- `onFire` en foreground: notificación + `playChime()` (3 notas A5·D6·G6, Web
  Audio, gain 0.14, contexto temporal cerrado a los 4 s) + toast + estado
  configurado con la frecuencia exacta de la alarma.
- Es sonido **sin gesto** (aunque no es la sesión). Protegido contra `start()`
  por el test B1. → Hallazgo **P6-ALARM-003 (P3)**: requiere aprobación
  explícita de la política si se interpreta P0.6 en forma literal.

## 3. P0.7 — Notificaciones APK

| Condición | Estado |
|---|---|
| APK abierta | PASS (estático) — NotificationHelper con POST_NOTIFICATIONS |
| APK background | PASS (estático) — AlarmManager RTC_WAKEUP |
| APK cerrada | PASS (estático) — BroadcastReceiver sin dependencia de la WebView |
| Screen locked | PASS (estático) — RTC_WAKEUP + canal de alarma |
| Proceso muerto | PASS (estático) — receiver + BootReceiver; sin audio |
| **Duplicados** | **0** — IDs fijos (1001 player / 2001 alarma / 2002 fin de sesión); `AlarmReceiver` one-shot; recurrentes se reprograman a la PRÓXIMA ocurrencia |
| Notification ID estable | Sí (constantes) |

## 4. P0.8 — Notificaciones Web/PWA

- Foreground: notificación + toast + chime (web) o nativa (APK).
- Background: notificación SW (`showSwNotification`, tag `vyneural-alarm-<id>`,
  renotify) — con pestaña viva.
- Click: enfoca la ventana / navega al deep link `?freq=…&beat=…&wave=…&
  autostart=true` — que **no reproduce** (verificado R12).
- Push: `sw.js` handler `push` → `showNotification` únicamente; REGLA DE ORO
  documentada. **Audio: NO en ningún caso.**

## 5. UX de alarmas (P2)

| Operación | UI | Store local | Backend | Notificación |
|---|---|---|---|---|
| Crear (+1 min) | ✓ | ✓ (IndexedDB+mirror) | **✗** (P6-FEAT-001) | ✓ al disparar |
| Editar (hora/frecuencia/label/enabled) | ✓ | ✓ | — | — |
| Desactivar / Eliminar / Recrear | ✓ | ✓ | — | — |
| Recurrentes (días) | ✓ | reprograma próxima ocurrencia | — | ✓ |

## 6. UX de notificaciones (P2)

- Título/cuerpo/icono/tag/timestamp: presentes (SW y nativas).
- Click target: recurso correcto (deep link configurado); **nunca** PLAY.
- Spam: `renotify` por tag; alarmas one-shot; IDs fijos → sin duplicados.

## 7. Conclusión

- ALARMA → PLAY: **0** en todas las plataformas.
- Notificaciones duplicadas: **0** (IDs fijos + one-shot + dueño único).
- Alarmas duplicadas: **0** (I6 + carrera multi-tab cerrada por unit tests).
- Gap funcional: sincronización de alarmas web/PWA al backend (**P6-FEAT-001**,
  P2) — la cuenta muestra una lista backend que el generador nunca puebla.
