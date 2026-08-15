package com.vyneural.bineural.notifications

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import java.util.Calendar
import org.json.JSONArray
import org.json.JSONObject

/**
 * Programador de alarmas NATIVO (P1): usa AlarmManager del sistema, nunca
 * setTimeout/setInterval de la WebView. La alarma sobrevive a cerrar la
 * WebView, bloquear la pantalla o minimizar la app.
 *
 * - Exacta (setExactAndAllowWhileIdle) si SCHEDULE_EXACT_ALARM está
 *   autorizado; si no, window de 60 s (honesto: supported ≠ granted).
 * - Persistencia en SharedPreferences para reprogramar tras reinicio.
 * - P5 — RUTINAS: si se pasan días de repetición (0=domingo … 6=sábado,
 *   mismos valores que Date.getDay() en JS), la alarma se reprograma sola
 *   a la siguiente ocurrencia al dispararse (AlarmReceiver) y tras reboot
 *   (rescheduleAll recalcula la PRÓXIMA ocurrencia, nunca una pasada).
 */
class AlarmScheduler(private val context: Context) {

    private val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    private val prefs = context.getSharedPreferences("bineural_alarms", Context.MODE_PRIVATE)

    fun canScheduleExact(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) am.canScheduleExactAlarms() else true

    fun schedule(alarmId: String, title: String, body: String, atMs: Long, days: List<Int>? = null) {
        val record = JSONObject()
            .put("title", title)
            .put("body", body)
            .put("at", atMs)
        if (days != null && days.isNotEmpty()) {
            record.put("days", JSONArray(days))
            // Se guarda la hora del día (local) para recalcular la próxima
            // ocurrencia cuando la alarma se dispare o tras un reinicio.
            val cal = Calendar.getInstance().apply { timeInMillis = atMs }
            record.put("hh", cal.get(Calendar.HOUR_OF_DAY))
            record.put("mm", cal.get(Calendar.MINUTE))
        }
        prefs.edit().putString(alarmId, record.toString()).apply()

        val now = System.currentTimeMillis()
        if (atMs <= now) {
            // Alarma vencida: descartar para evitar ráfagas tras reinicio o retardo.
            prefs.edit().remove(alarmId).apply()
            return
        }

        val pi = pendingIntent(alarmId)
        if (canScheduleExact()) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi)
        } else {
            am.setWindow(AlarmManager.RTC_WAKEUP, atMs, 60_000L, pi)
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

    /**
     * P5 — reprograma la siguiente ocurrencia de una alarma recurrente
     * (misma hora, próximo día del patrón). Las de una sola vez se descartan
     * (ya se dispararon). Lo llama AlarmReceiver al disparar.
     */
    fun rescheduleAlarm(alarmId: String) {
        val raw = prefs.getString(alarmId, null) ?: return
        val j = runCatching { JSONObject(raw) }.getOrNull() ?: return
        val days = j.optJSONArray("days")
        val hh = j.optInt("hh", -1)
        val mm = j.optInt("mm", -1)
        if (days != null && days.length() > 0 && hh >= 0 && mm >= 0) {
            val dayList = (0 until days.length()).map { days.optInt(it) }
            val next = nextOccurrence(hh, mm, dayList, System.currentTimeMillis() + 60_000)
            if (next != null) {
                schedule(
                    alarmId,
                    j.optString("title", "Vyneural"),
                    j.optString("body", ""),
                    next,
                    dayList,
                )
            } else {
                prefs.edit().remove(alarmId).apply()
            }
        } else {
            prefs.edit().remove(alarmId).apply()
        }
    }

    /** Próxima fecha ≥ fromMs cuyo día de la semana esté en [days] a las hh:mm. */
    fun nextOccurrence(hh: Int, mm: Int, days: List<Int>, fromMs: Long): Long? {
        if (days.isEmpty()) return null
        val cal = Calendar.getInstance().apply { timeInMillis = fromMs }
        for (i in 0..8) {
            // Calendar.DAY_OF_WEEK: 1=domingo … 7=sábado → jsDay = dow - 1 (0=domingo).
            if (days.contains(cal.get(Calendar.DAY_OF_WEEK) - 1)) {
                val cand = Calendar.getInstance().apply {
                    set(cal.get(Calendar.YEAR), cal.get(Calendar.MONTH), cal.get(Calendar.DAY_OF_MONTH), hh, mm, 0)
                    set(Calendar.MILLISECOND, 0)
                }
                if (cand.timeInMillis >= fromMs) return cand.timeInMillis
            }
            cal.add(Calendar.DAY_OF_YEAR, 1)
        }
        return null
    }

    /** Reprograma todas las alarmas (tras BOOT_COMPLETED). Las recurrentes se
     *  reagendan a su PRÓXIMA ocurrencia; las de una sola vez, tal cual. */
    fun rescheduleAll() {
        for ((id, raw) in prefs.all) {
            runCatching {
                val j = JSONObject(raw as String)
                val daysArr = j.optJSONArray("days")
                val days =
                    if (daysArr != null && daysArr.length() > 0) (0 until daysArr.length()).map { daysArr.optInt(it) }
                    else emptyList()
                val hh = j.optInt("hh", -1)
                val mm = j.optInt("mm", -1)
                if (days.isNotEmpty() && hh >= 0 && mm >= 0) {
                    val next = nextOccurrence(hh, mm, days, System.currentTimeMillis() + 60_000)
                    if (next != null) {
                        schedule(id, j.optString("title", "Vyneural"), j.optString("body", ""), next, days)
                    }
                } else {
                    schedule(id, j.optString("title", "Vyneural"), j.optString("body", ""), j.optLong("at"))
                }
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
