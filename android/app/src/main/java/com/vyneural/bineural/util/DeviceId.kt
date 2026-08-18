package com.vyneural.bineural.util

import android.content.Context
import java.util.UUID

/**
 * ID estable del dispositivo, persistido en SharedPreferences. Lo usa el
 * reporte de estado (PUT /devices/me) y es el mismo que ve la web vía bridge
 * (getPlatformInfo().deviceId), para que /cuenta liste un solo dispositivo.
 */
object DeviceId {
    private const val PREFS = "bineural_device"
    private const val KEY = "device_id"

    fun get(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.getString(KEY, null)?.let { return it }
        val id = UUID.randomUUID().toString()
        prefs.edit().putString(KEY, id).apply()
        return id
    }
}
