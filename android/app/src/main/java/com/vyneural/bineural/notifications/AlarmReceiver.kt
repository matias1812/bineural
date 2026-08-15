package com.vyneural.bineural.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import org.json.JSONObject

/**
 * Disparo de alarma (AlarmManager → BroadcastReceiver → Notification nativa).
 * No depende de la WebView: funciona con la app cerrada, minimizada o con la
 * pantalla bloqueada.
 */
class AlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (!action.startsWith(ACTION_PREFIX)) return
        val id = action.removePrefix(ACTION_PREFIX)
        val prefs = context.getSharedPreferences("bineural_alarms", Context.MODE_PRIVATE)
        val record = runCatching {
            JSONObject(prefs.getString(id, "{}") ?: "{}")
        }.getOrNull() ?: return
        NotificationHelper.showAlarm(
            context,
            record.optString("title", "Vyneural"),
            record.optString("body", "Hora de tu sesión"),
        )
        // P5 — rutina: si la alarma tiene días de repetición, se reprograma a la
        // PRÓXIMA ocurrencia (misma hora, próximo día del patrón). Si no, se
        // consume (una sola vez).
        val days = record.optJSONArray("days")
        if (days != null && days.length() > 0) {
            AlarmScheduler(context).rescheduleAlarm(id)
        } else {
            prefs.edit().remove(id).apply()
        }
    }

    companion object {
        const val ACTION_PREFIX = "com.vyneural.bineural.ALARM_"
    }
}
