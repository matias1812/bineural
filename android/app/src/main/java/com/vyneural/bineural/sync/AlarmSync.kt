package com.vyneural.bineural.sync

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.vyneural.bineural.BuildConfig
import com.vyneural.bineural.notifications.AlarmScheduler
import com.vyneural.bineural.util.AuthStore
import com.vyneural.bineural.util.BineuralLog
import com.vyneural.bineural.util.DeviceId
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import org.json.JSONArray
import org.json.JSONObject

/**
 * Sincronización NATIVA con el backend (el "push" que la APK puede ofrecer
 * sin Firebase): un ciclo periódico (AlarmManager, auto-reprogramable, ~30
 * min) consulta las alarmas del usuario y las (re)programa en el reloj del
 * sistema. Así una alarma creada en la WEB llega a la APK y dispara con la
 * app cerrada, aunque el usuario no abra la app. También reporta el estado
 * del dispositivo (PUT /api/v1/devices/me) para la sección Dispositivos.
 *
 * Honestidad: no es push en tiempo real (eso requiere FCM/Firebase); es
 * sincronización periódica del servidor al dispositivo, suficiente para que
 * los recordatorios estén programados ANTES de la hora.
 */
object AlarmSync {
    const val ACTION_SYNC = "com.vyneural.bineural.ALARM_SYNC"

    /** Cada 5 min (inexacto, ventana de 1 min): una alarma creada en la web
     *  llega al teléfono en minutos, no media hora. Además se sincroniza al
     *  abrir la app (MainActivity.onResume) y al iniciar sesión (STORE_AUTH). */
    private const val SYNC_INTERVAL_MS = 5 * 60 * 1000L
    private const val SYNC_WINDOW_MS = 60 * 1000L

    private const val PREFS_SYNCED = "bineural_synced_alarms"
    private const val KEY_IDS = "ids"

    /** Programa el próximo ciclo. Se auto-reprograma al ejecutarse. */
    fun schedulePeriodic(context: Context) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = syncPendingIntent(context)
        am.setWindow(
            AlarmManager.RTC_WAKEUP,
            System.currentTimeMillis() + SYNC_INTERVAL_MS,
            SYNC_WINDOW_MS,
            pi,
        )
    }

    /** Ejecuta un ciclo completo (alarmas + reporte de dispositivo). */
    fun run(context: Context) {
        val token = AuthStore.token(context)
        if (token == null) {
            // Sin sesión no hay nada que sincronizar; el ciclo periódico igual
            // queda programado (para cuando haya sesión).
            schedulePeriodic(context)
            return
        }
        Thread {
            try {
                syncAlarms(context, token)
                reportDevice(context, token)
            } catch (e: Exception) {
                BineuralLog.e("alarmsync", "ciclo de sincronización falló", e)
            } finally {
                schedulePeriodic(context)
            }
        }.start()
    }

    /** Cancela y olvida las alarmas que llegaron por sync (al cerrar sesión). */
    fun clearSynced(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_SYNCED, Context.MODE_PRIVATE)
        val synced = prefs.getStringSet(KEY_IDS, emptySet()) ?: emptySet()
        val scheduler = AlarmScheduler(context)
        for (id in synced) scheduler.cancel(id)
        prefs.edit().remove(KEY_IDS).apply()
    }

    // ── Sincronización de alarmas ───────────────────────────────────────────
    private fun syncAlarms(context: Context, token: String) {
        val json = httpGet("${BuildConfig.API_BASE}/api/v1/alarms", token) ?: return
        val server = JSONArray(json)
        val scheduler = AlarmScheduler(context)
        val syncedPrefs = context.getSharedPreferences(PREFS_SYNCED, Context.MODE_PRIVATE)
        val previouslySynced = syncedPrefs.getStringSet(KEY_IDS, emptySet()) ?: emptySet()
        val newSynced = mutableSetOf<String>()

        for (i in 0 until server.length()) {
            val a = server.optJSONObject(i) ?: continue
            val id = a.optString("id")
            if (id.isEmpty()) continue
            newSynced.add(id)

            if (!a.optBoolean("enabled", true)) {
                scheduler.cancel(id) // desactivada en la web → se quita del reloj
                continue
            }
            val atMs = parseIsoToMillis(a.optString("scheduled_at", "")) ?: continue
            if (atMs <= System.currentTimeMillis()) {
                scheduler.cancel(id) // ya pasó: no reprogramar ráfagas viejas
                continue
            }
            val title = a.optString("name").ifBlank { "Vyneural" }
            val days = parseByDay(a.optString("repeat_rule", ""))
            val config = a.optJSONObject("config")
            // Deep link: al tocar la notificación de esta alarma (manual o
            // generada por un ítem de itinerario con horario), la app abre esta
            // frecuencia exacta en vez de la pantalla por defecto.
            val freq = config?.let { if (it.has("freq")) it.optDouble("freq") else null }
            val beat = config?.let { if (it.has("beat")) it.optDouble("beat") else null }
            val wave = config?.let { if (it.has("wave")) it.optString("wave") else null }
            scheduler.schedule(id, title, buildBody(config, title), atMs, days, freq, beat, wave)
        }

        // Las sincronizadas que ya no están en el servidor fueron borradas en
        // la web: se cancelan. Las locales (creadas sin sesión) se respetan.
        for (id in previouslySynced) {
            if (id !in newSynced) scheduler.cancel(id)
        }
        syncedPrefs.edit().putStringSet(KEY_IDS, newSynced).apply()
        BineuralLog.d("alarmsync", "alarmas sincronizadas: ${newSynced.size} programada(s)")
    }

    // ── Reporte del dispositivo (estado de push) ────────────────────────────
    private fun reportDevice(context: Context, token: String) {
        // En segundo plano no hay Activity (el detalle DENIED_PERMANENTLY lo
        // reporta la web vía bridge cuando la app está abierta). Acá basta el
        // estado real del permiso del sistema.
        val granted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        val body = JSONObject()
            .put("device_id", DeviceId.get(context))
            .put("platform", "apk")
            .put("app_version", BuildConfig.VERSION_NAME)
            .put("notification_permission", if (granted) "granted" else "denied")
            .put("push_enabled", granted)
            .put("user_agent", "Vyneural-APK/${BuildConfig.VERSION_NAME}")
        httpPut("${BuildConfig.API_BASE}/api/v1/devices/me", token, body)
    }

    // ── Helpers ─────────────────────────────────────────────────────────────
    private fun syncPendingIntent(context: Context): PendingIntent {
        val i = Intent(context, AlarmSyncReceiver::class.java).setAction(ACTION_SYNC)
        return PendingIntent.getBroadcast(
            context,
            0x5A7, // request code fijo del ciclo
            i,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun buildBody(config: JSONObject?, title: String): String {
        val freq = config?.optDouble("freq")
        return if (freq != null && freq > 0) {
            "Toca para iniciar tu sesión de ${Math.round(freq)} Hz."
        } else {
            "Hora de tu sesión en Vyneural."
        }
    }

    // 'FREQ=WEEKLY;BYDAY=MO,TH' → [1,4] (0=domingo … 6=sábado, como Date.getDay()).
    private val DAY_INDEX = mapOf(
        "MO" to 1, "TU" to 2, "WE" to 3, "TH" to 4, "FR" to 5, "SA" to 6, "SU" to 0,
    )

    private fun parseByDay(rrule: String?): List<Int>? {
        if (rrule.isNullOrBlank()) return null
        val m = Regex("BYDAY=([A-Za-z,]+)").find(rrule) ?: return null
        val days = m.groupValues[1].split(",")
            .mapNotNull { DAY_INDEX[it.trim().uppercase()] }
            .distinct()
        return if (days.isEmpty()) null else days
    }

    // ISO 8601 con offset ('2026-08-17T19:00:00+00:00', '…Z', con o sin milis).
    private fun parseIsoToMillis(iso: String): Long? {
        if (iso.isBlank()) return null
        val patterns = listOf(
            "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
            "yyyy-MM-dd'T'HH:mm:ssXXX",
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
        )
        for (p in patterns) {
            try {
                val sdf = SimpleDateFormat(p, Locale.US)
                sdf.timeZone = TimeZone.getTimeZone("UTC")
                return sdf.parse(iso)?.time
            } catch (_: Exception) { /* probar el siguiente formato */ }
        }
        return null
    }

    private fun httpGet(url: String, token: String): String? {
        var conn: HttpURLConnection? = null
        return try {
            conn = URL(url).openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.setRequestProperty("Authorization", "Bearer $token")
            conn.setRequestProperty("Accept", "application/json")
            conn.connectTimeout = 10_000
            conn.readTimeout = 15_000
            if (conn.responseCode !in 200..299) {
                BineuralLog.e("alarmsync", "GET $url → ${conn.responseCode}")
                return null
            }
            BufferedReader(InputStreamReader(conn.inputStream)).use { it.readText() }
        } catch (e: Exception) {
            BineuralLog.e("alarmsync", "GET falló: ${e.message}")
            null
        } finally {
            conn?.disconnect()
        }
    }

    private fun httpPut(url: String, token: String, body: JSONObject) {
        var conn: HttpURLConnection? = null
        try {
            conn = URL(url).openConnection() as HttpURLConnection
            conn.requestMethod = "PUT"
            conn.setRequestProperty("Authorization", "Bearer $token")
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Accept", "application/json")
            conn.doOutput = true
            conn.connectTimeout = 10_000
            conn.readTimeout = 15_000
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            if (conn.responseCode !in 200..299) {
                BineuralLog.e("alarmsync", "PUT $url → ${conn.responseCode}")
            }
        } catch (e: Exception) {
            BineuralLog.e("alarmsync", "PUT falló: ${e.message}")
        } finally {
            conn?.disconnect()
        }
    }
}
