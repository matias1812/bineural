package com.vyneural.bineural.notifications

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.vyneural.bineural.MainActivity
import com.vyneural.bineural.R
import com.vyneural.bineural.audio.AudioForegroundService

/**
 * Notificaciones Android REALES (P1). No dependen de que el JavaScript de la
 * WebView siga vivo: el canal, el PendingIntent y el poster son 100 % nativos.
 */
object NotificationHelper {

    const val CHANNEL_PLAYER = "bineural_player"
    // v2: los canales son inmutables una vez creados; al añadir vibración se
    // cambió el ID para que las instalaciones existentes reciban el canal nuevo
    // (con vibración) en lugar de heredar el viejo sin ella.
    const val CHANNEL_ALARMS = "bineural_alarms_v2"
    // M1 — canal de fin de sesión: IMPORTANCE_DEFAULT (sonido suave, sin
    // vibración) para avisar que el temporizador terminó. Canal propio para
    // no mezclarse con el reproductor ni con las alarmas.
    const val CHANNEL_SESSION_END = "bineural_session_end"
    private const val NOTIF_PLAYER = 1001
    private const val NOTIF_ALARM = 2001
    private const val NOTIF_SESSION_END = 2002

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_PLAYER, "Reproductor Vyneural", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Control de la sesión en curso"
                setShowBadge(false)
            },
        )
        // P5 — la alarma vibra (patrón de recordatorio) además de sonar: es un
        // aviso de alarma, no una notificación pasiva. El canal se crea con la
        // vibración habilitada desde el arranque para que Android la permita.
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ALARMS, "Alarmas Vyneural", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Recordatorios de sesión (con vibración)"
                enableVibration(true)
                setVibrationPattern(VIBRATION_ALARM)
            },
        )
        // M1 — fin de sesión: aviso suave (sonido del sistema, sin vibración).
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_SESSION_END, "Fin de sesión", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Aviso de que la sesión terminó"
                setShowBadge(false)
            },
        )
    }

    private val VIBRATION_ALARM = longArrayOf(0, 500, 300, 500, 300, 700)

    /** Notificación del reproductor (Foreground Service): el SO la muestra en
     *  lock screen y centro de control mientras el servicio corre. Con la
     *  MediaSession adjunta (P1.5) el sombreado de notificaciones y la
     *  pantalla de bloqueo exponen los controles reales: ▶/⏸ contextual según
     *  el estado del motor y ■ detener. Nunca se duplica reproducción: los
     *  botones reenvían al MISMO servicio/motor. */
    fun mediaNotification(
        context: Context,
        title: String,
        text: String,
        sessionToken: android.media.session.MediaSession.Token?,
        isPlaying: Boolean,
    ): Notification {
        ensureChannels(context)
        val open = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val play = PendingIntent.getService(
            context, 2,
            Intent(context, AudioForegroundService::class.java).setAction(AudioForegroundService.ACTION_PLAY),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val pause = PendingIntent.getService(
            context, 3,
            Intent(context, AudioForegroundService::class.java).setAction(AudioForegroundService.ACTION_PAUSE),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val stop = PendingIntent.getService(
            context, 1,
            Intent(context, AudioForegroundService::class.java).setAction(AudioForegroundService.ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        // minSdk 26: API de plataforma para MediaStyle sin dependencias extra.
        val builder = Notification.Builder(context, CHANNEL_PLAYER)
            .setSmallIcon(R.drawable.ic_stat_bineural)
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
        if (isPlaying) {
            builder.addAction(0, "Pausar", pause)
            builder.addAction(0, "Detener", stop)
        } else {
            builder.addAction(0, "Reproducir", play)
            builder.addAction(0, "Detener", stop)
        }
        builder.setStyle(
            Notification.MediaStyle()
                .setMediaSession(sessionToken)
                .setShowActionsInCompactView(0, 1),
        )
        return builder.build()
    }

    fun alarmNotification(context: Context, title: String, body: String): Notification {
        ensureChannels(context)
        val open = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(context, CHANNEL_ALARMS)
            .setSmallIcon(R.drawable.ic_stat_bineural)
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(open)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            // Vibración + sonido de alarma (P5): el patrón respeta el canal;
            // con la vibración del canal habilitada, el sistema la ejecuta.
            .setVibrate(VIBRATION_ALARM)
            .setDefaults(NotificationCompat.DEFAULT_SOUND or NotificationCompat.DEFAULT_VIBRATE)
            .build()
    }

    /** Publica la alarma. Respeta el permiso POST_NOTIFICATIONS (Android 13+). */
    fun showAlarm(context: Context, title: String, body: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIF_ALARM, alarmNotification(context, title, body))
    }

    /**
     * M1 — fin de sesión nativo (id 2002, canal `bineural_session_end`): avisa
     * que el temporizador terminó aunque la WebView esté en segundo plano (la
     * web no puede mostrar new Notification() dentro del WebView). Toca la
     * notificación para volver a la app. Respeta POST_NOTIFICATIONS (Android 13+).
     */
    fun showSessionEnd(context: Context, title: String, body: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        ensureChannels(context)
        val open = PendingIntent.getActivity(
            context, 10, Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val n = NotificationCompat.Builder(context, CHANNEL_SESSION_END)
            .setSmallIcon(R.drawable.ic_stat_bineural)
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(open)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .build()
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIF_SESSION_END, n)
    }
}
