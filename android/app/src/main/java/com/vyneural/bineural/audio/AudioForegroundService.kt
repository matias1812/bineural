package com.vyneural.bineural.audio

import android.app.ActivityManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.content.ContextCompat
import com.vyneural.bineural.diag.Diagnostics
import com.vyneural.bineural.notifications.NotificationHelper
import com.vyneural.bineural.util.BineuralLog

/**
 * Foreground Service de audio (P1): mantiene la reproducción con la app en
 * segundo plano o la pantalla bloqueada. UN solo motor (BinauralToneEngine).
 * Comandos: START / PAUSE / RESUME / STOP / FREQ (retune en vivo).
 */
class AudioForegroundService : Service() {

    private val engine = BinauralToneEngine()
    private var focus: AudioFocusHelper? = null

    override fun onCreate() {
        super.onCreate()
        focus = AudioFocusHelper(this, engine) { label -> onFocusStateChange?.invoke(label) }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val base = intent.getDoubleExtra(EXTRA_BASE, 220.0)
                val beat = intent.getDoubleExtra(EXTRA_BEAT, 6.0)
                engine.retune(base, beat)
                focus?.request()
                engine.start()
                startForegroundCompat()
                running = true
                Diagnostics.audioActive = true
            }
            ACTION_PAUSE -> {
                engine.pause()
                running = false
                Diagnostics.audioActive = false
            }
            ACTION_RESUME -> {
                engine.resume()
                running = true
                Diagnostics.audioActive = true
            }
            ACTION_FREQ -> {
                val base = intent.getDoubleExtra(EXTRA_BASE, 0.0)
                val beat = intent.getDoubleExtra(EXTRA_BEAT, 0.0)
                if (base > 0.0) engine.retune(base, beat)
            }
            ACTION_STOP -> {
                focus?.abandon()
                engine.stop()
                stopForegroundCompat()
                stopSelf()
                running = false
                Diagnostics.audioActive = false
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startForegroundCompat() {
        val notif = NotificationHelper.mediaNotification(this, "Sesión Vyneural", "Reproduciendo…")
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
        focus?.abandon()
        engine.stop()
        running = false
        Diagnostics.audioActive = false
        BineuralLog.d("audio-service", "destroyed")
        super.onDestroy()
    }

    companion object {
        const val ACTION_START = "com.vyneural.bineural.action.START"
        const val ACTION_PAUSE = "com.vyneural.bineural.action.PAUSE"
        const val ACTION_RESUME = "com.vyneural.bineural.action.RESUME"
        const val ACTION_STOP = "com.vyneural.bineural.action.STOP"
        const val ACTION_FREQ = "com.vyneural.bineural.action.FREQ"
        const val EXTRA_BASE = "base"
        const val EXTRA_BEAT = "beat"
        private const val NOTIF_ID = 1001

        // Callback hacia MainActivity para reenviar al JS los cambios de audio
        // focus (log de interferencias del HUD / /diagnostico).
        @Volatile
        var onFocusStateChange: ((String) -> Unit)? = null

        @Volatile
        var running = false
            private set

        fun start(context: Context, base: Double, beat: Double) {
            val i = Intent(context, AudioForegroundService::class.java)
                .setAction(ACTION_START)
                .putExtra(EXTRA_BASE, base)
                .putExtra(EXTRA_BEAT, beat)
            ContextCompat.startForegroundService(context, i)
        }

        fun pause(context: Context) {
            context.startService(Intent(context, AudioForegroundService::class.java).setAction(ACTION_PAUSE))
        }

        fun resume(context: Context) {
            context.startService(Intent(context, AudioForegroundService::class.java).setAction(ACTION_RESUME))
        }

        fun retune(context: Context, base: Double, beat: Double) {
            context.startService(
                Intent(context, AudioForegroundService::class.java)
                    .setAction(ACTION_FREQ)
                    .putExtra(EXTRA_BASE, base)
                    .putExtra(EXTRA_BEAT, beat),
            )
        }

        fun stop(context: Context) {
            context.startService(Intent(context, AudioForegroundService::class.java).setAction(ACTION_STOP))
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
