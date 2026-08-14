package com.vyneural.bineural.permissions

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import java.lang.ref.WeakReference

/**
 * Permisos Android REALES (P1). Se solicitan SOLO bajo demanda (el usuario
 * toca "Activar" en la web), nunca todos al instalar. Estados honestos:
 * NOT_REQUESTED / GRANTED / DENIED / UNAVAILABLE.
 */
class PermissionManager(activity: Activity) {

    private val activityRef = WeakReference(activity)
    private val reqNotifications = 41

    /** 'GRANTED' | 'DENIED' | 'NOT_REQUESTED' | 'UNAVAILABLE' */
    fun notificationState(): String {
        val a = activityRef.get() ?: return "UNAVAILABLE"
        return when {
            Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU -> "GRANTED" // < 13 no aplica
            ContextCompat.checkSelfPermission(a, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED ->
                "GRANTED"
            a.shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS) -> "DENIED"
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
