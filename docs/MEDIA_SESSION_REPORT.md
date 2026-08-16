# MEDIA SESSION REPORT — P2

## Web / PWA (navigator.mediaSession)

- Handlers registrados: `play`, `pause`, `stop`, `previoustrack`, `nexttrack`, `seekto`, `seekbackward`, `seekforward`, `volumeup`, `volumedown` (con fallback si no soporta).
- Metadata: title (estado), artist ("Vyneural · Ondas binaurales"), album (banda + frecuencias), artwork (iconos 192/512).
- `setActive()` (Chrome 92+) para el widget del sombreado.
- `setPositionState` con la duración del temporizador (seek del sistema), refrescado cada segundo mientras suena (barra tipo YouTube).
- Sin temporizador (∞) el estado de posición se limpia (`setPositionState(null)`): el controlador del sistema queda sin barra, como contenido sin duración.
- `setActionHandler('volumeup'/'volumedown')` → ajustan el volumen REAL del motor (±10 %, mismo camino que el slider, nunca fuera de [0,1]).
- **Pausa/play reales (tipo YouTube):** `pause` congela el motor y el temporizador (`pausedRemainingMs`); `play` reanuda la MISMA sesión donde quedó la cuenta (no reinicia). `stop` solo termina la sesión (historial).
- **Nunca bloquea el audio:** al pasar a segundo plano la sesión NO se enmudece ni se pausa (ni en la web ni en la PWA instalada); solo el usuario o el SO pueden detenerla. El control es 100 % web (navigator.mediaSession), sin bridge nativo.
- **Límite honesto:** la Media Session web depende del navegador: en Android Chrome aparece el controlador; en iOS Safari solo con PWA instalada (16.4+); si el proceso muere, desaparece.
- Next/Previous: se mapea a cambiar de estado (no hay lista de pistas).

## APK nativa (MediaSession Android)

- `MediaSession(context, "Vyneural")` con callback → `handleSystemPlay/Pause/Stop`.
- PlaybackState con `ACTION_PLAY|PAUSE|STOP`, state PLAYING/PAUSED/STOPPED real.
- **Validado en emulador:** `dumpsys media_session` → `active=true`, `state=PlaybackState {state=PLAYING}`; "Media button session is com.vyneural.bineural/Vyneural". Controles del SO (keyevent 126/127) sincronizan la UI de la WebView.
- Notificación de transporte `bineural_player` (category=transport, actions=2) enlazada al session token.

### P6 — UNA sola MediaSession por app (regla de propietario único)

- En la APK el propietario de la MediaSession es el **servicio nativo**; el
  WebView **no** registra `navigator.mediaSession` (ni metadata, ni handlers,
  ni `setPositionState`): `updateMediaSession()` es no-op con bridge presente
  y los `setActionHandler` se omiten. El SO ve una sola sesión activa.
- El `<audio>` web queda pausado y el motor web mudo (ganancia 0): la WebView
  no reclama reproducción de medios ante el SO.
- `GET_MEDIA_SESSION_STATE` del bridge reporta el estado REAL del servicio
  (`active` / `playbackState`), nunca lo inventa.

## Dónde termina Web y dónde empieza Android

| Capacidad | Web/PWA (navigator.mediaSession) | APK (MediaSessionCompat/Media3-style) |
|---|---|---|
| Controles sistema | Según navegador/OS | ✅ control total |
| Lock screen | Solo Android Chrome / PWA iOS instalada | ✅ |
| Bluetooth/headset | A través del navegador | ✅ MediaButtonReceiver |
| Sobrevive a proceso muerto | ❌ | ✅ (servicio) |
| Estado real | `playbackState` del navegador | Reportado por el servicio (nunca inventado) |

**Conclusión:** la Media Session web NO es equivalente a la nativa. El bridge distingue: `mediaSession.supported/active/playbackState` de la APK provienen del servicio; en web, de `navigator.mediaSession`. No se declara lo nativo como web ni viceversa.
