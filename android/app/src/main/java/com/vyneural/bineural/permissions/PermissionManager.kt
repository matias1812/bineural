package com.vyneural.bineural.permissions

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import java.lang.ref.WeakReference

/**
 * Permisos Android REALES (P1). Se solicitan SOLO bajo demanda (el usuario
 * toca "Activar" en la web), nunca todos al instalar. Estados honestos:
 * NOT_REQUESTED / GRANTED / DENIED / DENIED_PERMANENTLY / UNAVAILABLE.
 */
class PermissionManager(activity: Activity) {

    private val activityRef = WeakReference(activity)
    private val prefs = activity.getSharedPreferences("bineural_perms", android.content.Context.MODE_PRIVATE)
    private val reqNotifications = 41

    /** 'GRANTED' | 'DENIED' | 'DENIED_PERMANENTLY' | 'NOT_REQUESTED' | 'UNAVAILABLE' */
    fun notificationState(): String {
        val a = activityRef.get() ?: return "UNAVAILABLE"
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return "GRANTED"

        val granted = ContextCompat.checkSelfPermission(a, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        if (granted) return "GRANTED"

        val requestedBefore = prefs.getBoolean("notif_requested", false)
        val showRationale = ActivityCompat.shouldShowRequestPermissionRationale(a, Manifest.permission.POST_NOTIFICATIONS)

        return when {
            showRationale -> "DENIED"
            requestedBefore -> "DENIED_PERMANENTLY"
            else -> "NOT_REQUESTED"
        }
    }

    fun isNotificationGranted(): Boolean = notificationState() == "GRANTED"

    /** Invoca el diálogo del sistema (Android 13+). No-op en versiones viejas. */
    fun requestNotifications() {
        val a = activityRef.get() ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(a, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            prefs.edit().putBoolean("notif_requested", true).apply()
            ActivityCompat.requestPermissions(a, arrayOf(Manifest.permission.POST_NOTIFICATIONS), reqNotifications)
        }
    }

    fun onRequestPermissionsResult(requestCode: Int, grantResults: IntArray) {
        // El estado se lee después con getPlatformInfo(); aquí solo se registra.
        if (requestCode == reqNotifications) {
            // Intencionalmente sin otra lógica: la UI web consulta el estado real.
        }
    }
}
