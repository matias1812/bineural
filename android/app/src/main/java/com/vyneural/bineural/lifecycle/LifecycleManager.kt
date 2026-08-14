package com.vyneural.bineural.lifecycle

import com.vyneural.bineural.diag.Diagnostics
import com.vyneural.bineural.util.BineuralLog

/**
 * Lifecycle de la APK (P1): onResume/onPause/onStop se reflejan en
 * Diagnostics. Nota honesta: onPause NO significa proceso destruido ni
 * WebView muerta — el audio lo sostiene el Foreground Service aparte.
 */
object LifecycleManager {

    @Volatile
    var state: String = "FOREGROUND"
        private set

    fun onResume() {
        state = "FOREGROUND"
        Diagnostics.lifecycle = "FOREGROUND"
        BineuralLog.d("lifecycle", "FOREGROUND")
    }

    fun onPause() {
        state = "BACKGROUND"
        Diagnostics.lifecycle = "BACKGROUND"
        BineuralLog.d("lifecycle", "BACKGROUND")
    }

    fun onStop() {
        Diagnostics.lifecycle = "STOPPED"
        BineuralLog.d("lifecycle", "STOPPED")
    }
}
