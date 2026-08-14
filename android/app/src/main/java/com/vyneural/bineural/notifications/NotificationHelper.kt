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
    const val CHANNEL_ALARMS = "bineural_alarms"
    private const val NOTIF_PLAYER = 1001
    private const val NOTIF_ALARM = 2001

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_PLAYER, "Reproductor Bineural", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Control de la sesión en curso"
                setShowBadge(false)
            },
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ALARMS, "Alarmas Bineural", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Recordatorios de sesión"
            },
        )
    }

    /** Notificación del reproductor (Foreground Service): el SO la muestra en
     *  lock screen y centro de control mientras el servicio corre. */
    fun mediaNotification(context: Context, title: String, text: String): Notification {
        ensureChannels(context)
        val open = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val stop = PendingIntent.getService(
            context, 1,
            Intent(context, AudioForegroundService::class.java).setAction(AudioForegroundService.ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(context, CHANNEL_PLAYER)
            .setSmallIcon(R.drawable.ic_stat_bineural)
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(0, "Detener", stop)
            .build()
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
}
