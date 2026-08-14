package com.vyneural.bineural.notifications

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONObject

/**
 * Programador de alarmas NATIVO (P1): usa AlarmManager del sistema, nunca
 * setTimeout/setInterval de la WebView. La alarma sobrevive a cerrar la
 * WebView, bloquear la pantalla o minimizar la app.
 *
 * - Exacta (setExactAndAllowWhileIdle) si SCHEDULE_EXACT_ALARM está
 *   autorizado; si no, window de 60 s (honesto: supported ≠ granted).
 * - Persistencia en SharedPreferences para reprogramar tras reinicio.
 */
class AlarmScheduler(private val context: Context) {

    private val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    private val prefs = context.getSharedPreferences("bineural_alarms", Context.MODE_PRIVATE)

    fun canScheduleExact(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) am.canScheduleExactAlarms() else true

    fun schedule(alarmId: String, title: String, body: String, atMs: Long) {
        val record = JSONObject()
            .put("title", title)
            .put("body", body)
            .put("at", atMs)
        prefs.edit().putString(alarmId, record.toString()).apply()
        val trigger = if (atMs < System.currentTimeMillis()) System.currentTimeMillis() + 1000 else atMs
        val pi = pendingIntent(alarmId)
        if (canScheduleExact()) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pi)
        } else {
            am.setWindow(AlarmManager.RTC_WAKEUP, trigger, 60_000L, pi)
        }
    }

    fun cancel(alarmId: String) {
        prefs.edit().remove(alarmId).apply()
        am.cancel(pendingIntent(alarmId))
    }

    fun list(): List<String> = prefs.all.keys.toList()

    fun nextAt(): Long? =
        prefs.all.values.mapNotNull { raw ->
            runCatching { JSONObject(raw as String).optLong("at") }.getOrNull()
        }.minOrNull()

    /** Reprograma todas las alarmas (tras BOOT_COMPLETED). */
    fun rescheduleAll() {
        for ((id, raw) in prefs.all) {
            runCatching {
                val j = JSONObject(raw as String)
                schedule(id, j.optString("title", "Bineural"), j.optString("body", ""), j.optLong("at"))
            }
        }
    }

    private fun pendingIntent(alarmId: String): PendingIntent {
        val i = Intent(context, AlarmReceiver::class.java)
            .setAction("com.vyneural.bineural.ALARM_$alarmId")
        return PendingIntent.getBroadcast(
            context,
            alarmId.hashCode(),
            i,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}
