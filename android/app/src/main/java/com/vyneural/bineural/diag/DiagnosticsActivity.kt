package com.vyneural.bineural.diag

import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity

/**
 * Pantalla de diagnóstico (P1 debug). Se abre desde adb:
 *   adb shell am start -n com.vyneural.bineural/.diag.DiagnosticsActivity
 * Toca el texto para refrescar.
 */
class DiagnosticsActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val tv = TextView(this).apply {
            setPadding(48, 48, 48, 48)
            textSize = 13f
            setTextColor(Color.WHITE)
        }
        val scroll = ScrollView(this).apply {
            setBackgroundColor(Color.rgb(11, 13, 18))
            addView(tv)
        }
        setContentView(scroll)
        tv.setOnClickListener {
            tv.text = Diagnostics.snapshot(this@DiagnosticsActivity)
        }
        tv.text = Diagnostics.snapshot(this)
    }
}
