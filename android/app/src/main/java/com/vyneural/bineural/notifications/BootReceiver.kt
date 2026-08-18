package com.vyneural.bineural.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.vyneural.bineural.sync.AlarmSync

/**
 * Tras BOOT_COMPLETED las alarmas de AlarmManager se pierden: se reprograman
 * desde la persistencia local (P1 scheduler real, sin backend) y se vuelve a
 * programar el ciclo de sincronización del servidor (el PendingIntent del
 * ciclo también se pierde con el reboot).
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            AlarmScheduler(context).rescheduleAll()
            AlarmSync.schedulePeriodic(context)
        }
    }
}
