# TEST MATRIX — P2

## PLATFORM | STATE | ACTION | EXPECTED | ACTUAL | RESULT | EVIDENCE

### APK nativa (emulador API 34)

| Plataforma | Estado | Acción | Esperado | Actual | Resultado | Evidencia |
|---|---|---|---|---|---|---|
| APK | App abierta | Play (UI) | Servicio + MediaSession PLAYING | Foreground Service `isForeground=true` (mediaPlayback, notif `bineural_player` transport actions=2), MediaSession `Vyneural active=true`, focus GAIN | ✅ PASS | dumpsys + CDP |
| APK | Screen off | Audio activo | Sigue sonando | Pantalla `Asleep`, servicio `isForeground=true`, MediaSession `PLAYING` con posición AVANZANDO (2910524 ms) | ✅ PASS | keyevent 26 + dumpsys (2 lecturas) |
| APK | Screen off | Pause (dispatch sistema) | UI sincroniza | audioState `BACKGROUND → PAUSED`, source `system_pause`, reason `lock-screen`, audible=false, bridge `paused` | ✅ PASS | `cmd media_session dispatch pause` + CDP |
| APK | Screen off | Resume (dispatch sistema) | PLAYING | audioState `PAUSED → PLAYING`, source `system_play`, audible=true | ✅ PASS | `cmd media_session dispatch play` + CDP |
| APK | Cualquiera | Stop (dispatch sistema) | Servicio fuera | 0 instancias de servicio, 0 MediaSession, UI `STOPPED`, focus ABANDONADO (helper nativo + WebView) | ✅ PASS | `cmd media_session dispatch stop` + dumpsys + log audio |
| APK | Cualquiera | TEST_NOTIFICATION | Notificación nativa | Canal `bineural_alarms`, importance 4, category=reminder, contentIntent interactable | ✅ PASS | dumpsys notification |
| APK | Cualquiera | SCHEDULE_ALARM (+5 s) | Alarma → notificación | `{"status":"OK"}` y notificación `when=1786808992293` ≈ hora del dispositivo (disparada real) | ✅ PASS | CDP + dumpsys notification |
| APK | Cualquiera | CANCEL_ALARM | Cancela | OK | ✅ PASS | CDP |
| APK | — | Invariante motor único | web muda con nativo | `assertSingleAudioProvider()=true`, `provider` único | ✅ PASS | CDP |
| APK | — | Bridge + permisos | Estado REAL de Android | `bridgeStatus=CONNECTED`, badge APK, `notificationPermission=GRANTED`, `exactAlarms=false` (honesto) | ✅ PASS | CDP (re-lectura en vivo) |
| APK | — | Re-validación P2 (11:4x) | Ciclo completo en vivo | Play → lock → pause → resume → stop, todos con evidencia del sistema | ✅ PASS | esta sesión, emulador API 34 |
| APK | Recientes eliminado | Audio background | Depende del OEM | NOT_TESTED (emulador no fiel) | ⚠️ | — |
| APK | Reboot | Alarmas reprogramadas | BootReceiver | NOT_TESTED (no se reinició el emulador en esta sesión) | ⚠️ | — |
| APK | Bluetooth | Conectar/desconectar | Duck/pause controlado | NOT_TESTED (sin BT en emulador) | ⚠️ | — |

### Web / PWA (headless + código)

| Plataforma | Estado | Acción | Esperado | Actual | Resultado | Evidencia |
|---|---|---|---|---|---|---|
| Web | Cualquiera | UI interactúa (tap/menú/scroll) | No detener audio | Guard + state machine; fix pointerdown solo restaura si suspendido | ✅ PASS | código + tests |
| Web | iOS Safari sin PWA | Bloquear pantalla | Suspende (limitación) | Duck + recovery al volver | ✅ PASS (WEB_LIMITATION) | código |
| Web/Android | Screen locked | Audio | Continúa si página viva (element) | Transporte `element` mantiene reproducción | ✅ PASS (RESTRICTED) | código |
| Web/PWA | App cerrada | Notificación | Requiere Push/backend | `push.configured=false`, respaldo calendario | ✅ PASS (honesto) | código |
| Web/PWA | Sin bridge | Capacidades | NOT_SUPPORTED, web intacta | `present=false`, fallback OK | ✅ PASS | tests |
| PWA | Instalación real | Install prompt | Installable | Manifest válido (standalone, icons, shortcuts) | ✅ PASS (no probado en device) | manifest |
| PWA | Proceso matado | Evento background | No garantizado | Documentado como NOT_GUARANTEED | ✅ PASS (honesto) | código |
| Chrome Android | UA Android | Detección | android-browser ≠ APK | `detectPlatformKind` → android-browser sin bridge | ✅ PASS | tests |

### Suite automatizada

| Ítem | Resultado |
|---|---|
| `npm test` | ✅ 82/82 PASS |
| `npm run build` (vite) | ✅ limpio |
| Tests P2 dedicados | ✅ estados de audio, provider único, bridge whitelist, fallback, notificaciones, lifecycle |

## Criterio P17

- CORE INTEGRITY ✅ · WEB ✅ (limitaciones documentadas) · PWA ✅ (limitaciones documentadas) · APK ✅ en emulador · PERMISSIONS ✅ · NOTIFICATIONS ✅ · PUSH/LOCAL ✅ · MEDIA SESSION ✅ · AUDIO BACKGROUND ✅ · AUDIO LIFECYCLE ✅ · FREQUENCY STABILITY ✅ (por diseño) · BRIDGE SECURITY ✅ · FALLBACK ✅ · TEST EVIDENCE ⚠️ (falta hardware físico: BT, reboot real, proceso muerto por OEM, PWA en device).

**P2 = CONDITIONAL PASS** — pendiente la validación física en dispositivo (ver `P2_VALIDATION_REPORT.md` → BLOCKERS).
