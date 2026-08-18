# P6 — Audio Forensic

> Invariancias de audio auditadas en Web/PWA/APK con evidencia runtime, estática
> y unitaria. Pregunta central: **¿puede sonar audio sin que el usuario toque
> Play, o sonar dos dueños a la vez?**

---

## 1. Invariancia A — Ningún camino autónomo produce audio de sesión

**Resultado: PASS.**

Caminos auditados (detalle en informe principal §1.2): deep link autostart,
alarma web, alarma nativa, push, notificationclick, reload, pageshow, focus,
resume, pointerdown, visibilitychange, restore de sesión, back/forward,
recreación de Activity, restart del servicio nativo, config nativa (retune/wave/
volumen), PAUSE/STOP de servicio inactivo.

Evidencia de cierre:

- Runtime: 10/10 clases de interacción idle → `ctx:none, causal:0` (R01).
- Unit: `P5.5/F14: 100 ciclos PLAY-LOCK-UNLOCK-PAUSE-STOP → 100 START,
  0 espontáneos`; `P5.6: jerarquía de comandos — alarma, autostart y RETUNE
  jamás generan PLAY`.
- Estático: `handleNullIntentRestart()` NO_AUTO_PLAY + START_NOT_STICKY;
  `mediaPlaybackRequiresUserGesture = true` en el WebView.

## 2. Invariancia B — Un solo dueño de audio por plataforma

**Resultado: PASS (Web runtime; APK estático + unit).**

| Plataforma | Dueño | Mecanismo de exclusión |
|---|---|---|
| Web/PWA | Web Audio (`BinauralEngine`) | Sin motor nativo presente |
| APK | `BinauralToneEngine` (Kotlin) | WebView **permanentemente mudo**: `setPlatformMuted(true)` en el init y en cada `muteWebForNative()`; masterGain cancelado a 0; `<audio>` de transporte pausado; `assertSingleAudioProvider()` lanza WARN si `provider=native` con `webGain>0` |

Evidencia:

- Test unit `P5.6: en APK el motor web es PERMANENTEMENTE inaudible (frontera
  estructural)` — PASS.
- `audio-provider.js`: `selectAudioProvider()` y `assertSingleAudioProvider()`
  puros, expuestos en `window.__assertSingleAudioProvider` (runtime: `true`).
- En Web nunca se instancia el puente nativo → `provider: 'web'`; en la APK la
  UI declara `provider: 'native'` solo cuando `GET_AUDIO_STATE` confirma
  `serviceRunning + playing` (nunca inventa estado).

**Riesgo residual mitigado**: `muteWebForNative()` cancela la automation
pendiente antes de fijar gain=0 (forense M1) — evita que una rampa residual
(fade-in/recoverFade) re-eleve la ganancia y produzca batido con el nativo.

## 3. STOP absoluto

**Resultado: PASS (Web runtime; APK estático).**

- `stop()`: `syncNativeAudioStop()` (protocolo simétrico: STOP solo si el
  servicio está vivo), teardown síncrono (`simulation.stop()`, osc → 0),
  `stopAnchor()`, MediaSession → stopped, gain → piso con fade.
- Tras STOP, TODOS los triggers de restore (focus/pageshow/resume/scroll/
  visibility) dejan el estado en STOPPED con osc:0, gain:0.0001, rms:0 (R03-R05).
- `sessionId` no se incrementa sin gesto del usuario.
- APK: `ACTION_STOP` abandona focus, detiene el motor, cierra la notificación y
  `clearSession()`; restart con intent null jamás reanuda.

## 4. Gain después de STOP / PAUSE

**Resultado: PASS.**

- STOP → gain al piso (fade ~1.8 s) y permanece.
- PAUSE → gain al piso, osc:0.
- GAIN triggers (equivalente web a recuperar focus) → **NO PLAY** (R05).
- APK: tras `PAUSE` el motor queda pausado (`targetGain=0`); un `RESUME` solo
  restaura el nivel si `playing` (sesión) sigue vivo. La política de resume tras
  **audio focus** es explícita y documentada (H7) — ver §5.

## 5. Audio focus (APK) — política de resume explícita

Flujo `AudioFocusHelper` + `AudioForegroundService`:

```
LOSS / LOSS_TRANSIENT → pausa el motor (pushToJs=false), programa watchdog
DUCK                 → duck (held sigue true, sin watchdog)
UNKNOWN              → política defensiva = LOSS + contador visible
GAIN                 → si shouldPlay: reanuda el MISMO motor (jamás otro)
```

- La pausa por focus NO se empuja al JS (`pushToJs=false`) para evitar el bucle
  pause→play del sync (forense previo).
- El watchdog re-solicita con backoff (1.2 s → 5 s tope) mientras `shouldPlay`.
- **Clasificación**: política de resume explícita y documentada (P6-POL-001,
  P3). No es reproducción espontánea: exige que la sesión estuviera activa y que
  el SO devuelva el foco (otra app lo liberó). Cumple la salvedad del enunciado
  P0.5 ("salvo que exista una política explícita de resume").

## 6. MediaSession

- Web/PWA: handlers `play/pause/stop/nexttrack/previoustrack/seekto/volume`
  conectados; en la APK **no** se registran handlers web (`apk-native-owner`):
  un solo MediaSession por app.
- APK: `setActive(false)` en onCreate; `PlaybackState` refleja el estado REAL;
  skip/seek retunean el MISMO motor (±10 Hz, clamp 60–400) y avisan al JS
  (`vyneural:audiofreq`) para re-sincronizar la UI.
- Runtime web: `mediaSession.playbackState` = paused (idle) / playing (PLAY) /
  paused (STOP/PAUSE) — consistente con la UI.

## 7. Watchdog de audio web (audio-health)

`planRecovery()` decide UNA vez por restore: `recover` (ctx suspendido → piso +
resume + rampa), `reaffirm-element`, o `none`. Nunca reinicia la sesión
completa. El pointerdown solo fuerza re-restore si el ctx sigue `suspended`
(requisito de gesto de iOS) y solo si `playing`.

## 8. Conclusión

- Audio espontáneo: **0**.
- Doble ownership (native + web audible): **0** (frontera estructural +
  invariante assert + tests).
- START duplicado por lifecycle/lock/unlock/reload: **0** (unit F14 + runtime
  R04/R06).
- Batido/eco/doblamiento: no observable (un solo dueño por diseño).
