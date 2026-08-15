# MEDIA SESSION REPORT — P2

## Web / PWA (navigator.mediaSession)

- Handlers registrados: `play`, `pause`, `stop`, `previoustrack`, `nexttrack`, `seekto`, `seekbackward`, `seekforward` (con fallback si no soporta).
- Metadata: title (estado), artist ("Vyneural · Ondas binaurales"), album (banda + frecuencias), artwork (iconos 192/512).
- `setActive()` (Chrome 92+) para el widget del sombreado.
- `setPositionState` con la duración del temporizador (seek del sistema).
- **Límite honesto:** la Media Session web depende del navegador: en Android Chrome aparece el controlador; en iOS Safari solo con PWA instalada (16.4+); si el proceso muere, desaparece.
- Next/Previous: se mapea a cambiar de estado (no hay lista de pistas).

## APK nativa (MediaSession Android)

- `MediaSession(context, "Vyneural")` con callback → `handleSystemPlay/Pause/Stop`.
- PlaybackState con `ACTION_PLAY|PAUSE|STOP`, state PLAYING/PAUSED/STOPPED real.
- **Validado en emulador:** `dumpsys media_session` → `active=true`, `state=PlaybackState {state=PLAYING}`; "Media button session is com.vyneural.bineural/Vyneural". Controles del SO (keyevent 126/127) sincronizan la UI de la WebView.
- Notificación de transporte `bineural_player` (category=transport, actions=2) enlazada al session token.

## Dónde termina Web y dónde empieza Android

| Capacidad | Web/PWA (navigator.mediaSession) | APK (MediaSessionCompat/Media3-style) |
|---|---|---|
| Controles sistema | Según navegador/OS | ✅ control total |
| Lock screen | Solo Android Chrome / PWA iOS instalada | ✅ |
| Bluetooth/headset | A través del navegador | ✅ MediaButtonReceiver |
| Sobrevive a proceso muerto | ❌ | ✅ (servicio) |
| Estado real | `playbackState` del navegador | Reportado por el servicio (nunca inventado) |

**Conclusión:** la Media Session web NO es equivalente a la nativa. El bridge distingue: `mediaSession.supported/active/playbackState` de la APK provienen del servicio; en web, de `navigator.mediaSession`. No se declara lo nativo como web ni viceversa.
