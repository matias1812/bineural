package com.vyneural.bineural.diag

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.vyneural.bineural.audio.AudioForegroundService
import com.vyneural.bineural.notifications.AlarmScheduler

/**
 * Estado global para la pantalla de diagnóstico y la sonda del bridge.
 * Los valores reales los escriben el servicio, el lifecycle y el bridge.
 */
object Diagnostics {

    @Volatile
    var lifecycle: String = "FOREGROUND"

    @Volatile
    var audioActive: Boolean = false

    @Volatile
    var focusState: String = "NONE"

    /** P2 — política de focus visible: veces que el watchdog re-solicitó el
     *  foco tras una pérdida/interrupción (incluido UNKNOWN). */
    @Volatile
    var focusReacquireCount: Int = 0

    /** P2 — política de focus visible: veces que se recibió un callback de
     *  Audio Focus NO reconocido (UNKNOWN, visible como tal, nunca pérdida
     *  genérica silenciosa). */
    @Volatile
    var focusUnknownCount: Int = 0

    /** MediaSession activa y reproduciendo (P1.5). */
    @Volatile
    var mediaSessionActive: Boolean = false

    /** 'playing' | 'paused' | 'stopped' — estado real de la MediaSession. */
    @Volatile
    var mediaSessionPlaybackState: String = "stopped"

    @Volatile
    var bridgeStatus: String = "UNAVAILABLE"

    /** Pantalla completa nativa (immersive mode) activa o no. */
    @Volatile
    var immersiveActive: Boolean = false

    @Volatile
    var lastError: String? = null

    /** Texto legible de la pantalla de diagnóstico. */
    fun snapshot(context: Context): String {
        val b = StringBuilder()
        b.appendLine("BINEURAL — DIAGNÓSTICO ANDROID")
        b.appendLine("==============================")
        b.appendLine("Platform: Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
        b.appendLine("App: ${context.packageName} ${com.vyneural.bineural.BuildConfig.VERSION_NAME}")
        b.appendLine()
        b.appendLine("BRIDGE: $bridgeStatus")
        b.appendLine("LIFECYCLE: $lifecycle")
        b.appendLine()
        b.appendLine("AUDIO:")
        b.appendLine("  Service running: ${AudioForegroundService.isRunning(context)}")
        b.appendLine("  Audio active: $audioActive")
        b.appendLine("  Focus: $focusState (re-adquisiciones del watchdog: $focusReacquireCount, callbacks UNKNOWN: $focusUnknownCount)")
        b.appendLine("  MediaSession: ${if (mediaSessionActive) "ACTIVE" else "INACTIVE"} ($mediaSessionPlaybackState)")
        b.appendLine()
        b.appendLine("NOTIFICATIONS:")
        val perm = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
        } else {
            PackageManager.PERMISSION_GRANTED
        }
        b.appendLine("  POST_NOTIFICATIONS: ${if (perm == PackageManager.PERMISSION_GRANTED) "GRANTED" else "NOT GRANTED"}")
        b.appendLine("  Channel player: ${if (channelExists(context, "bineural_player")) "YES" else "NO"}")
        b.appendLine("  Channel alarms: ${if (channelExists(context, "bineural_alarms")) "YES" else "NO"}")
        b.appendLine()
        b.appendLine("ALARMS:")
        val s = AlarmScheduler(context)
        b.appendLine("  Scheduled: ${s.list().size}")
        b.appendLine("  Exact allowed: ${s.canScheduleExact()}")
        b.appendLine("  Next: ${s.nextAt()?.let { java.text.DateFormat.getDateTimeInstance().format(it) } ?: "—"}")
        b.appendLine()
        b.appendLine("LAST ERROR: ${lastError ?: "—"}")
        return b.toString()
    }

    private fun channelExists(context: Context, id: String): Boolean {
        return runCatching {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) true
            else {
                val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
                nm.getNotificationChannel(id) != null
            }
        }.getOrDefault(false)
    }
}
