package com.vyneural.bineural.audio

import android.app.ActivityManager
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.IBinder
import androidx.core.content.ContextCompat
import com.vyneural.bineural.diag.Diagnostics
import com.vyneural.bineural.notifications.NotificationHelper
import com.vyneural.bineural.util.BineuralLog

/**
 * Foreground Service de audio (P1): mantiene la reproducción con la app en
 * segundo plano o la pantalla bloqueada. UN solo motor (BinauralToneEngine).
 * Comandos: START / PAUSE / RESUME / STOP / FREQ (retune en vivo) / PLAY.
 *
 * MediaSession real (P1.5): el servicio expone una MediaSession Android que el
 * SO conecta con los controles de la pantalla de bloqueo, el sombreado de
 * notificaciones, los auriculares y el centro multimedia. PlaybackState y
 * MediaMetadata reflejan el estado REAL del motor (nunca declarados sin
 * implementación).
 */
class AudioForegroundService : Service() {

    private val engine = BinauralToneEngine()
    private var focus: AudioFocusHelper? = null
    private var mediaSession: MediaSession? = null
    private var sessionTitle = "Sesión Vyneural"
    private var lastBase = 220.0
    private var lastBeat = 6.0
    // P2 — defensa de audio focus: `shouldPlay` = la sesión DEBERÍA estar
    // sonando. Si el foco se pierde (otra app, el propio WebView de la APK
    // reclamándolo al desbloquear) el servicio pausa y la MediaSession lo
    // refleja; un watchdog re-solicita el foco con backoff mientras shouldPlay
    // y al recuperarlo reanuda el MISMO motor (nunca una segunda sesión).
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())
    private var shouldPlay = false
    private var focusRetryRunnable: Runnable? = null
    private var focusRetryDelayMs = 1_200L
    // P3 — crash recovery: la sesión de audio se persiste en SharedPreferences
    // para que un restart START_STICKY (proceso eliminado por el SO mientras
    // sonaba) la restaure con las MISMAS frecuencias/onda/volumen — nunca
    // arranca con los defaults y la notificación nunca miente.
    private var lastWave = ""
    private var lastVolume = 0.6

    override fun onCreate() {
        super.onCreate()
        focus = AudioFocusHelper(this, engine) { label ->
            onFocusStateChange?.invoke(label)
            handleFocusChange(label)
        }
        mediaSession = MediaSession(this, "Vyneural").apply {
            setCallback(object : MediaSession.Callback() {
                override fun onPlay() = handleSystemPlay()
                override fun onPause() = handleSystemPause()
                override fun onStop() = handleSystemStop()
            })
            setActive(false)
        }
    }

    // ── P2 — gestión de interrupciones de audio focus ─────────────────────────
    // LOSS/LOSS_TRANSIENT: el motor pausó (AudioFocusHelper); la MediaSession y
    // la notificación reflejan la interrupción REAL (PAUSED) — pero NO se
    // empuja el evento de playback al JS: la sesión web (visualizador) sigue
    // viva y el JS ya recibe `vyneural:audiofocus` LOSS (INTERRUPTED). Empujar
    // "paused" haría pauseUiOnly() → teardown de la sesión → al recuperar foco
    // un "playing" re-arranca → bucle de sesión (sid++ por ciclo, observado en
    // el forense). Si la sesión debería seguir sonando, el watchdog re-solicita
    // foco con backoff. GAIN: reanuda el MISMO motor (nunca una segunda sesión).
    private fun handleFocusChange(label: String) {
        when (label) {
            "LOSS", "LOSS_TRANSIENT" -> {
                if (shouldPlay && running) setSessionPlaying(playing = false, pushToJs = false)
                scheduleFocusReacquire()
            }
            // P2 — endurecimiento UNKNOWN: un callback no reconocido NO se
            // transforma en pérdida genérica silenciosa. Queda visible como
            // UNKNOWN en Diagnostics (observabilidad) y entra en la MISMA
            // política defensiva que LOSS: si la sesión debe sonar, se pausa
            // y el watchdog re-solicita con backoff (recuperación). El
            // diagnóstico CRITICAL queda registrado en el log forense.
            "UNKNOWN" -> {
                BineuralLog.e(
                    "audio-focus",
                    "UNKNOWN focus callback — política defensiva: pausa + watchdog (CRITICAL)",
                )
                // P2 — el UNKNOWN queda CONTADO y visible en el diagnóstico:
                // nunca se transforma en pérdida genérica silenciosa.
                Diagnostics.focusUnknownCount += 1
                if (shouldPlay && running) setSessionPlaying(playing = false, pushToJs = false)
                scheduleFocusReacquire()
            }
            "GAIN" -> {
                // H7 — el foco se recuperó: volver al reintento rápido por si
                // vuelve a perderse (unlock, próximo gesto del WebView).
                focusRetryDelayMs = 1_200L
                if (shouldPlay) {
                    engine.resume()
                    setSessionPlaying(playing = true, pushToJs = false)
                }
            }
            // "DUCK": el foco SIGUE poseído (held=true); AudioFocusHelper ya
            // aplicó engine.duck(true). No pausar, no programar watchdog.
        }
    }

    private fun scheduleFocusReacquire() {
        if (!shouldPlay || focusRetryRunnable != null) return
        // P2 — cada intento de re-adquisición queda contado (diagnóstico).
        Diagnostics.focusReacquireCount += 1
        focusRetryRunnable = Runnable {
            focusRetryRunnable = null
            if (!shouldPlay) return@Runnable
            val f = focus ?: return@Runnable
            if (!f.held) {
                f.request()
                // request() informa GAIN por el código de retorno si el SO
                // concede (aunque el callback no llegue); si no, reintentar.
                if (!f.held) scheduleFocusReacquire()
            }
        }
        handler.postDelayed(focusRetryRunnable!!, focusRetryDelayMs)
        // H7 — backoff exponencial con tope: durante una interrupción LARGA
        // real (llamada en curso), el watchdog no debe spamear request() cada
        // 1.2 s (el SO no concederá GAIN hasta colgar). Se resetea al recibir
        // GAIN o al arrancar/reanudar. La recuperación tras colgar sigue siendo
        // ≤5 s (primer reintento a 1.2 s en el caso rápido del unlock).
        focusRetryDelayMs = (focusRetryDelayMs * 2).coerceAtMost(5_000L)
    }

    private fun cancelFocusReacquire() {
        focusRetryRunnable?.let { handler.removeCallbacks(it) }
        focusRetryRunnable = null
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        // startForeground incondicional: todo arranque pasa por startForegroundService
        // (que exige llamar a startForeground en <5s) y un restart START_STICKY llega
        // con intent nulo — sin reafirmar el foreground, Android 12+ mata la app con
        // ForegroundServiceDidNotStartInTimeException.
        startForegroundCompat()

        // P3 — crash recovery: restart START_STICKY tras kill del proceso por el
        // SO (intent null). Si había una sesión sonando, se restaura con las
        // frecuencias/onda/volumen guardadas; si no, el servicio se detiene solo.
        if (intent == null) {
            restorePersistedSession()
            return START_STICKY
        }

        when (action) {
            ACTION_START -> {
                val base = intent.getDoubleExtra(EXTRA_BASE, 220.0)
                val beat = intent.getDoubleExtra(EXTRA_BEAT, 6.0)
                val title = intent.getStringExtra(EXTRA_TITLE)
                val level = intent.getDoubleExtra(EXTRA_LEVEL, -1.0)
                if (!title.isNullOrEmpty()) sessionTitle = title
                engine.retune(base, beat)
                // P4-D — el motor arranca con el nivel del USUARIO (no el
                // default 0.6): aplicar el volumen ANTES de engine.start().
                // Si el SET_AUDIO_LEVEL llega después, el fade-in arranca al
                // default y hace un overshoot breve audible al pulsar play con
                // otro nivel de volumen.
                if (level in 0.0..1.0) {
                    engine.setVolume(level)
                    lastVolume = level
                }
                shouldPlay = true
                focus?.request()
                engine.start()
                // Resume restaura la ganancia si el motor estaba en pausa
                // (lock screen): sin esto un play web tras una pausa nativa
                // quedaría mudo.
                engine.resume()
                running = true
                Diagnostics.audioActive = true
                lastBase = base
                lastBeat = beat
                setSessionPlaying(playing = true)
                refreshPlayerNotification()
                persistSession()
            }
            ACTION_PAUSE -> {
                shouldPlay = false
                cancelFocusReacquire()
                engine.pause()
                running = false
                Diagnostics.audioActive = false
                setSessionPlaying(playing = false)
                refreshPlayerNotification()
                persistSession()
            }
            ACTION_RESUME, ACTION_PLAY -> {
                shouldPlay = true
                focus?.request()
                engine.resume()
                running = true
                Diagnostics.audioActive = true
                setSessionPlaying(playing = true)
                refreshPlayerNotification()
                persistSession()
            }
            ACTION_FREQ -> {
                val base = intent.getDoubleExtra(EXTRA_BASE, 0.0)
                val beat = intent.getDoubleExtra(EXTRA_BEAT, 0.0)
                if (base > 0.0) engine.retune(base, beat)
                val wave = intent.getStringExtra(EXTRA_WAVE)
                if (!wave.isNullOrEmpty()) {
                    engine.setWave(wave)
                    lastWave = wave
                }
                if (base > 0.0) {
                    lastBase = base
                    lastBeat = beat
                    refreshPlayerNotification()
                }
                persistSession()
            }
            ACTION_WAVE -> {
                val wave = intent.getStringExtra(EXTRA_WAVE)
                if (!wave.isNullOrEmpty()) {
                    engine.setWave(wave)
                    lastWave = wave
                    persistSession()
                }
            }
            ACTION_VOLUME -> {
                val level = intent.getDoubleExtra(EXTRA_LEVEL, 0.6)
                engine.setVolume(level)
                lastVolume = level
                persistSession()
            }
            ACTION_STOP -> {
                shouldPlay = false
                cancelFocusReacquire()
                focus?.abandon()
                engine.stop()
                stopForegroundCompat()
                stopSelf()
                running = false
                Diagnostics.audioActive = false
                setSessionStopped()
                clearSession()
            }
        }
        return START_STICKY
    }

    // ── Controles del sistema (MediaSession callback) ─────────────────────────
    // La pantalla de bloqueo / notificaciones / Bluetooth invocan estos
    // handlers; siempre actúan sobre el MISMO motor (nunca crean otro) y
    // actualizan la notificación para reflejar el estado real.
    private fun handleSystemPlay() {
        shouldPlay = true
        if (!running) {
            engine.retune(lastBase, lastBeat)
            engine.start()
            focus?.request()
        } else {
            focus?.request()
            engine.resume()
        }
        running = true
        Diagnostics.audioActive = true
        setSessionPlaying(playing = true)
        refreshPlayerNotification()
    }

    private fun handleSystemPause() {
        shouldPlay = false
        cancelFocusReacquire()
        engine.pause()
        running = false
        Diagnostics.audioActive = false
        setSessionPlaying(playing = false)
        refreshPlayerNotification()
    }

    private fun handleSystemStop() {
        shouldPlay = false
        cancelFocusReacquire()
        focus?.abandon()
        engine.stop()
        setSessionStopped()
        stopForegroundCompat()
        stopSelf()
        running = false
        Diagnostics.audioActive = false
        clearSession()
    }

    private fun setSessionPlaying(playing: Boolean, pushToJs: Boolean = true) {
        val s = mediaSession ?: return
        val now = android.os.SystemClock.elapsedRealtime()
        s.setMetadata(
            MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, sessionTitle)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, "Vyneural · Ondas binaurales")
                .putString(MediaMetadata.METADATA_KEY_ALBUM, "${lastBase} / ${(lastBase + lastBeat).toFixed(1)} Hz")
                .build(),
        )
        s.setPlaybackState(
            PlaybackState.Builder()
                .setActions(
                    PlaybackState.ACTION_PLAY or
                        PlaybackState.ACTION_PAUSE or
                        PlaybackState.ACTION_STOP,
                )
                .setState(if (playing) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED, now, 1f)
                .build(),
        )
        s.isActive = true
        Diagnostics.mediaSessionActive = playing
        Diagnostics.mediaSessionPlaybackState = if (playing) "playing" else "paused"
        // P2 — la interrupción por focus (LOSS) NO debe tumbar la sesión web:
        // pushToJs=false evita el bucle pause→play del sync JS (ver
        // handleFocusChange). El JS recibe el cambio de foco por separado.
        if (pushToJs) onPlaybackStateChange?.invoke(Diagnostics.mediaSessionPlaybackState)
    }

    private fun setSessionStopped() {
        val s = mediaSession ?: return
        s.setPlaybackState(
            PlaybackState.Builder()
                .setActions(0)
                .setState(PlaybackState.STATE_STOPPED, 0L, 0f)
                .build(),
        )
        s.isActive = false
        Diagnostics.mediaSessionActive = false
        Diagnostics.mediaSessionPlaybackState = "stopped"
        onPlaybackStateChange?.invoke("stopped")
    }

    /** Re-publica la notificación de control con el estado actual (play/pause). */
    private fun refreshPlayerNotification() {
        val notif = NotificationHelper.mediaNotification(
            context = this,
            title = sessionTitle,
            text = if (running) "Reproduciendo · ${lastBase} / ${(lastBase + lastBeat).toFixed(1)} Hz" else "En pausa",
            sessionToken = mediaSession?.sessionToken,
            isPlaying = running,
        )
        try {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(NOTIF_ID, notif)
        } catch (_: Exception) {
            /* la notificación se re-muestra en el próximo startForeground */
        }
    }

    // ── P3 — crash recovery: persistencia de la sesión de audio ──────────────
    // El proceso puede ser eliminado por el SO mientras la sesión suena (el
    // foreground service se mata por presión de memoria o el usuario lo limpia
    // de recientes). START_STICKY lo recrea con intent null: aquí se restaura
    // la MISMA sesión (frecuencias, onda, volumen, título) en vez de arrancar
    // con defaults y mentir en la notificación.
    private fun persistSession() {
        try {
            // putFloat: SharedPreferences no tiene putDouble; la precisión
            // float (~7 dígitos) es más que suficiente para frecuencias.
            prefs().edit()
                .putBoolean("shouldPlay", shouldPlay)
                .putFloat("base", lastBase.toFloat())
                .putFloat("beat", lastBeat.toFloat())
                .putString("wave", lastWave)
                .putFloat("volume", lastVolume.toFloat())
                .putString("title", sessionTitle)
                .apply()
        } catch (_: Exception) {
            /* persistencia no disponible */
        }
    }

    private fun restorePersistedSession() {
        try {
            val p = prefs()
            if (!p.getBoolean("shouldPlay", false)) {
                // Sin sesión activa al morir: no quedarse colgado en foreground.
                stopForegroundCompat()
                stopSelf()
                return
            }
            lastBase = p.getFloat("base", 220f).toDouble()
            lastBeat = p.getFloat("beat", 6f).toDouble()
            lastWave = p.getString("wave", "") ?: ""
            lastVolume = p.getFloat("volume", 0.6f).toDouble()
            sessionTitle = p.getString("title", "Sesión Vyneural") ?: "Sesión Vyneural"
            shouldPlay = true
            engine.retune(lastBase, lastBeat)
            if (lastWave.isNotEmpty()) engine.setWave(lastWave)
            engine.setVolume(lastVolume)
            focus?.request()
            engine.start()
            engine.resume()
            running = true
            Diagnostics.audioActive = true
            BineuralLog.d(
                "audio-service",
                "restart START_STICKY: sesión restaurada ${lastBase}/${lastBase + lastBeat} Hz wave=$lastWave vol=$lastVolume",
            )
            setSessionPlaying(playing = true)
            refreshPlayerNotification()
        } catch (e: Exception) {
            BineuralLog.e("audio-service", "restorePersistedSession falló", e)
            stopForegroundCompat()
            stopSelf()
        }
    }

    private fun clearSession() {
        try {
            prefs().edit().clear().apply()
        } catch (_: Exception) {
            /* persistencia no disponible */
        }
    }

    private fun prefs() =
        getSharedPreferences(PREFS_SESSION, android.content.Context.MODE_PRIVATE)

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startForegroundCompat() {
        val notif = NotificationHelper.mediaNotification(
            context = this,
            title = sessionTitle,
            text = if (running) "Reproduciendo · ${lastBase} / ${(lastBase + lastBeat).toFixed(1)} Hz" else "Reproduciendo…",
            sessionToken = mediaSession?.sessionToken,
            isPlaying = running,
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        } else {
            @Suppress("DEPRECATION")
            startForeground(NOTIF_ID, notif)
        }
    }

    private fun stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
    }

    override fun onDestroy() {
        shouldPlay = false
        cancelFocusReacquire()
        focus?.abandon()
        engine.stop()
        mediaSession?.release()
        mediaSession = null
        running = false
        Diagnostics.audioActive = false
        Diagnostics.mediaSessionActive = false
        Diagnostics.mediaSessionPlaybackState = "stopped"
        // No limpiar la sesión persistida aquí: onDestroy también se llama tras
        // un kill por el SO (donde SÍ queremos restaurar). El guardado queda
        // coherente por persistSession/clearSession en cada comando.
        BineuralLog.d("audio-service", "destroyed")
        super.onDestroy()
    }

    /** Formato de frecuencia para metadata/notificación (siempre punto decimal). */
    private fun Double.toFixed(decimals: Int = 1): String =
        String.format(java.util.Locale.US, "%.${decimals}f", this)

    companion object {
        const val ACTION_START = "com.vyneural.bineural.action.START"
        const val ACTION_PAUSE = "com.vyneural.bineural.action.PAUSE"
        const val ACTION_RESUME = "com.vyneural.bineural.action.RESUME"
        const val ACTION_PLAY = "com.vyneural.bineural.action.PLAY"
        const val ACTION_STOP = "com.vyneural.bineural.action.STOP"
        const val ACTION_FREQ = "com.vyneural.bineural.action.FREQ"
        const val ACTION_WAVE = "com.vyneural.bineural.action.WAVE"
        const val ACTION_VOLUME = "com.vyneural.bineural.action.VOLUME"
        const val EXTRA_BASE = "base"
        const val EXTRA_BEAT = "beat"
        const val EXTRA_WAVE = "wave"
        const val EXTRA_LEVEL = "level"
        const val EXTRA_TITLE = "title"
        private const val NOTIF_ID = 1001

        // P4-B — la sesión de audio se persiste con este nombre (SharedPreferences)
        // y el bridge la expone para que la UI web re-sincronice su estado tras
        // navegar dentro de la APK sin tocar el servicio.
        const val PREFS_SESSION = "vyneural_audio_session"

        // Callback hacia MainActivity para reenviar al JS los cambios de audio
        // focus (log de interferencias del HUD / /diagnostico).
        @Volatile
        var onFocusStateChange: ((String) -> Unit)? = null

        // Callback hacia MainActivity para reenviar al JS los cambios de
        // reproducción (pause/resume/stop desde lock screen o notificación),
        // para que la UI de la WebView quede sincronizada con el motor nativo.
        @Volatile
        var onPlaybackStateChange: ((String) -> Unit)? = null

        @Volatile
        var running = false
            private set

        /** MediaSession activa y reproduciendo (estado honesto para el bridge). */
        fun mediaSessionActive(): Boolean = Diagnostics.mediaSessionActive

        /** 'playing' | 'paused' | 'stopped' — estado real de la MediaSession. */
        fun mediaPlaybackState(): String = Diagnostics.mediaSessionPlaybackState

        fun start(context: Context, base: Double, beat: Double, title: String = "Sesión Vyneural", level: Double = -1.0) {
            val i = Intent(context, AudioForegroundService::class.java)
                .setAction(ACTION_START)
                .putExtra(EXTRA_BASE, base)
                .putExtra(EXTRA_BEAT, beat)
                .putExtra(EXTRA_TITLE, title)
                .putExtra(EXTRA_LEVEL, level)
            ContextCompat.startForegroundService(context, i)
        }

        fun pause(context: Context) {
            val i = Intent(context, AudioForegroundService::class.java).setAction(ACTION_PAUSE)
            ContextCompat.startForegroundService(context, i)
        }

        fun resume(context: Context) {
            val i = Intent(context, AudioForegroundService::class.java).setAction(ACTION_RESUME)
            ContextCompat.startForegroundService(context, i)
        }

        fun retune(context: Context, base: Double, beat: Double, wave: String? = null) {
            val i = Intent(context, AudioForegroundService::class.java)
                .setAction(ACTION_FREQ)
                .putExtra(EXTRA_BASE, base)
                .putExtra(EXTRA_BEAT, beat)
                .putExtra(EXTRA_WAVE, wave ?: "")
            ContextCompat.startForegroundService(context, i)
        }

        fun setWave(context: Context, wave: String) {
            val i = Intent(context, AudioForegroundService::class.java)
                .setAction(ACTION_WAVE)
                .putExtra(EXTRA_WAVE, wave)
            ContextCompat.startForegroundService(context, i)
        }

        fun setVolume(context: Context, level: Double) {
            val i = Intent(context, AudioForegroundService::class.java)
                .setAction(ACTION_VOLUME)
                .putExtra(EXTRA_LEVEL, level)
            ContextCompat.startForegroundService(context, i)
        }

        fun stop(context: Context) {
            val i = Intent(context, AudioForegroundService::class.java).setAction(ACTION_STOP)
            try {
                // Mismo camino que el resto de comandos: startForegroundService.
                // Con startService, Android 8+ lanza IllegalStateException si la app
                // está en background y el servicio ya no corre — el STOP fallaría en
                // silencio y la notificación quedaría colgada.
                ContextCompat.startForegroundService(context, i)
            } catch (e: Exception) {
                // App en background y servicio ya muerto por el SO: no hay nada que
                // detener (los estáticos del proceso reiniciado ya están en falso).
                BineuralLog.e("audio-service", "stop: servicio ya no estaba activo (esperado)", e)
            }
        }

        fun isRunning(context: Context): Boolean {
            if (running) return true
            return isServiceRunning(context)
        }

        private fun isServiceRunning(context: Context): Boolean {
            return try {
                val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
                @Suppress("DEPRECATION")
                am.getRunningServices(100).any { it.service.className == AudioForegroundService::class.java.name }
            } catch (_: Exception) {
                false
            }
        }
    }
}
