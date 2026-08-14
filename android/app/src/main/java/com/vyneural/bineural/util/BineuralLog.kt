package com.vyneural.bineural.util

import android.util.Log

/** Log con tag prefijado (filtro en logcat: `bineural`). */
object BineuralLog {

    private const val TAG = "Vyneural"

    fun d(tag: String, msg: String) = Log.d(TAG, "[$tag] $msg")

    fun e(tag: String, msg: String, t: Throwable? = null) = Log.e(TAG, "[$tag] $msg", t)
}
