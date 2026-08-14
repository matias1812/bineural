package com.vyneural.bineural.bridge

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.webkit.JavascriptInterface
import com.vyneural.bineural.BuildConfig
import com.vyneural.bineural.MainActivity
import com.vyneural.bineural.audio.AudioForegroundService
import com.vyneural.bineural.diag.Diagnostics
import com.vyneural.bineural.notifications.AlarmScheduler
import com.vyneural.bineural.notifications.NotificationHelper
import com.vyneural.bineural.permissions.PermissionManager
import com.vyneural.bineural.util.BineuralLog
import org.json.JSONObject

/**
 * Bridge WebView → Kotlin. Implementa el contrato de
 * `src/platform/native-bridge.js`:
 *
 *   window.AndroidBridge = {
 *     version, postMessage(msg), getPlatformInfo()
 *   }
 *
 * Reglas del P0 gate: whitelist, payload validado, estados honestos
 * (supported / granted / active nunca se confunden) y aislamiento de fallos
 * (un error aquí nunca rompe la UI web).
 */
class AndroidBridge(
    private val activity: MainActivity,
    private val scheduler: AlarmScheduler,
    private val permissions: PermissionManager,
) {
    private val context: Context = activity
    @JavascriptInterface
    fun getVersion(): String = "1.0.0"

    /** Capacidades REALES de esta instalación (supported/granted/active). */
    @JavascriptInterface
    fun getPlatformInfo(): String {
        val audioRunning = AudioForegroundService.isRunning(context)
        val info = JSONObject()
        info.put("platform", "android")
        info.put("appVersion", BuildConfig.VERSION_NAME)
        info.put("nativeAudio", true)
        info.put("mediaSession", true)
        info.put("mediaSessionActive", audioRunning)
        info.put("notifications", true)
        info.put("notificationPermission", permissions.notificationState())
        info.put("alarmScheduler", true)
        info.put("exactAlarms", scheduler.canScheduleExact())
        info.put("exactAlarmsGranted", scheduler.canScheduleExact())
        info.put("backgroundService", true)
        info.put("backgroundServiceActive", audioRunning)
        info.put("focusState", Diagnostics.focusState)
        info.put("fullscreen", Diagnostics.immersiveActive)
        return info.toString()
    }

    @SuppressLint("NewApi")
    @JavascriptInterface
    fun postMessage(raw: String): String {
        return try {
            val msg = JSONObject(raw)
            val command = msg.optString("command", "")
            val payload = msg.optJSONObject("payload")
            if (!BridgeCommands.isAllowed(command)) return respond("DENIED", command, null)
            when (command) {
                "GET_PLATFORM_CAPABILITIES" -> getPlatformInfo() // handshake: la info directa
                "START_BACKGROUND_AUDIO" -> {
                    val base = payload?.optDouble("base", 220.0) ?: 220.0
                    val beat = payload?.optDouble("beat", 6.0) ?: 6.0
                    AudioForegroundService.start(context, base, beat)
                    respond("OK", command, null)
                }
                "PAUSE_BACKGROUND_AUDIO" -> {
                    AudioForegroundService.pause(context)
                    respond("OK", command, null)
                }
                "RESUME_BACKGROUND_AUDIO" -> {
                    AudioForegroundService.resume(context)
                    respond("OK", command, null)
                }
                "STOP_BACKGROUND_AUDIO" -> {
                    AudioForegroundService.stop(context)
                    respond("OK", command, null)
                }
                "SCHEDULE_ALARM" -> {
                    val id = payload?.optString("alarmId") ?: return respond("INVALID", command, null)
                    val title = payload.optString("title", "Vyneural")
                    val body = payload.optString("body", "Hora de tu sesión")
                    val at = payload.optLong("atMs", 0L)
                    if (id.isEmpty() || at <= 0L) return respond("INVALID", command, null)
                    scheduler.schedule(id, title, body, at)
                    respond("OK", command, null)
                }
                "CANCEL_ALARM" -> {
                    val id = payload?.optString("alarmId") ?: return respond("INVALID", command, null)
                    scheduler.cancel(id)
                    respond("OK", command, null)
                }
                "REQUEST_NOTIFICATION_PERMISSION" -> {
                    permissions.requestNotifications()
                    respond("OK", command, null)
                }
                "REQUEST_EXACT_ALARM_PERMISSION" -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        try {
                            context.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM))
                        } catch (e: Exception) {
                            BineuralLog.e("bridge", "exact alarm settings", e)
                        }
                    }
                    respond("OK", command, null)
                }
                "OPEN_EXPERIMENT" -> {
                    // La app ya está abierta; enfocar (la sesión la controla la web).
                    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
                    launch?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    if (launch != null) context.startActivity(launch)
                    respond("OK", command, null)
                }
                "OPEN_SETTINGS" -> {
                    try {
                        val i = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                        i.data = Uri.parse("package:${context.packageName}")
                        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        context.startActivity(i)
                    } catch (e: Exception) {
                        BineuralLog.e("bridge", "open settings", e)
                        return respond("BRIDGE_ERROR", command, null)
                    }
                    respond("OK", command, null)
                }
                "SET_FULLSCREEN" -> {
                    val enabled = payload?.optBoolean("enabled", true) ?: true
                    activity.setImmersiveMode(enabled)
                    respond("OK", command, null)
                }
                "SET_ORIENTATION" -> {
                    val mode = payload?.optString("mode", "sensor") ?: "sensor"
                    activity.setOrientation(mode)
                    respond("OK", command, null)
                }
                "TEST_NOTIFICATION" -> {
                    NotificationHelper.showAlarm(context, "Vyneural · Prueba", "Notificaciones funcionando (diagnóstico).")
                    respond("OK", command, null)
                }
                else -> respond("DENIED", command, null)
            }
        } catch (e: Exception) {
            // Aislamiento de fallos: el error se reporta, la web sigue.
            BineuralLog.e("bridge", "postMessage error", e)
            Diagnostics.lastError = e.message
            respond("BRIDGE_ERROR", null, null)
        }
    }

    private fun respond(status: String, command: String?, data: JSONObject?): String {
        val r = JSONObject()
        r.put("status", status)
        if (command != null) r.put("command", command)
        if (data != null) r.put("data", data)
        return r.toString()
    }
}
