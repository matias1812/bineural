# PLATFORM CAPABILITY MATRIX — P2

Clasificación por celda: `SUPPORTED` · `SUPPORTED_BUT_PERMISSION_REQUIRED` · `SUPPORTED_BUT_RESTRICTED` · `NOT_SUPPORTED` · `NOT_TESTED`.

| Capacidad | WEB | PWA instalada | APK nativa |
|---|---|---|---|
| Notifications API | SUPPORTED | SUPPORTED | SUPPORTED (nativa) |
| Push notifications | NOT_SUPPORTED (sin backend) | NOT_SUPPORTED (sin backend) | NOT_SUPPORTED (no usa FCM) |
| Local notifications | SUPPORTED_BUT_RESTRICTED (solo con página viva) | SUPPORTED_BUT_RESTRICTED (idem) | SUPPORTED (canal nativo) |
| Background notification | NOT_SUPPORTED | NOT_SUPPORTED (sin Push) | SUPPORTED (AlarmManager) |
| Notification permission | SUPPORTED_BUT_PERMISSION_REQUIRED | SUPPORTED_BUT_PERMISSION_REQUIRED | SUPPORTED_BUT_PERMISSION_REQUIRED (POST_NOTIFICATIONS) |
| Exact alarms | NOT_SUPPORTED | NOT_SUPPORTED | SUPPORTED_BUT_PERMISSION_REQUIRED (SCHEDULE_EXACT_ALARM, bajo demanda) |
| Background audio | SUPPORTED_BUT_RESTRICTED (element <audio> vivo) | SUPPORTED_BUT_RESTRICTED (idem) | SUPPORTED (Foreground Service) |
| Screen locked audio | SUPPORTED_BUT_RESTRICTED (Android: sí; iOS Safari: suspende) | SUPPORTED_BUT_RESTRICTED (idem) | SUPPORTED (validado: PLAYING con screen off) |
| Media Session | SUPPORTED (navigator.mediaSession) | SUPPORTED | SUPPORTED (MediaSession Android) |
| Lock-screen controls | SUPPORTED_BUT_RESTRICTED (según navegador/OS) | SUPPORTED_BUT_RESTRICTED | SUPPORTED (validado) |
| Play/Pause | SUPPORTED | SUPPORTED | SUPPORTED (validado con keyevent 126/127) |
| Next/Previous | NOT_SUPPORTED (1 pista) | NOT_SUPPORTED | NOT_SUPPORTED (1 pista) |
| Foreground Service | N/A | N/A | SUPPORTED (mediaPlayback, validado) |
| Android notification channel | N/A | N/A | SUPPORTED (bineural_alarms, bineural_player) |
| Native permissions | N/A | N/A | SUPPORTED (AndroidX, bajo demanda) |
| Persistent service | N/A | N/A | SUPPORTED (START_STICKY) |

## Plataforma detectada (nunca por UA)

- Chrome Android sin bridge → `android-browser`
- WebView con bridge → `android-native` (solo tras handshake `CONNECTED`)
- iOS → `ios` · desktop → `desktop`

## Estados (supported ≠ granted ≠ active)

Ejemplo real del emulador (sesión activa): `mediaSession.supported=true`, `mediaSession.active=true`, `playbackState=playing`; `notifications.supported=true`, `permission=GRANTED`; `exactAlarms.supported=true`, `granted=false` (no autorizada aún).
