package com.vyneural.bineural.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Silencia la alarma si nadie respondió dentro del límite
 * (AlarmScheduler.ALARM_RING_LIMIT_MS): cancela la notificación de alarma,
 * lo que corta el sonido/vibración que aún estuviera sonando (ringtone largo
 * o loop de OEM) y limpia el sombreado. No-op si el usuario ya la tocó
 * (auto-cancel) o la descartó. Lo programa AlarmScheduler.scheduleSilence()
 * con un PendingIntent explícito por alarma.
 */
class AlarmSilenceReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        NotificationHelper.cancelAlarm(context)
    }
}
