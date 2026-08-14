package com.vyneural.bineural.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build

/**
 * Audio Focus explícito (P1): llamadas, otro audio, Bluetooth… la sesión
 * decide qué hacer (duck / pause / resume) y JAMÁS reinicia la simulación.
 */
class AudioFocusHelper(private val context: Context, private val engine: BinauralToneEngine) {

    private val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private var request: AudioFocusRequest? = null

    private val listener = AudioManager.OnAudioFocusChangeListener { change ->
        when (change) {
            AudioManager.AUDIOFOCUS_GAIN -> engine.resume()
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> engine.pause()
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> engine.duck(true)
            else -> {
                // Pérdida permanente: pausar (la sesión queda en pausa, no se destruye).
                engine.duck(false)
                engine.pause()
            }
        }
    }

    fun request() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val r = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build(),
                )
                .setOnAudioFocusChangeListener(listener)
                .build()
            request = r
            am.requestAudioFocus(r)
        } else {
            @Suppress("DEPRECATION")
            am.requestAudioFocus(listener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
        }
    }

    fun abandon() {
        val r = request
        if (r != null) {
            am.abandonAudioFocusRequest(r)
        } else {
            @Suppress("DEPRECATION")
            am.abandonAudioFocus(listener)
        }
    }
}
