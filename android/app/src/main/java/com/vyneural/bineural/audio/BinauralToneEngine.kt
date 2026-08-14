package com.vyneural.bineural.audio

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.PI
import kotlin.math.sin

/**
 * Motor de tono binaural nativo (AudioTrack streaming). ÚNICO motor de audio
 * de la APK: genera L = sen(2π·f1·t) y R = sen(2π·f2·t) con f2 = f1 + beat.
 *
 * - La frecuencia cambia con rampa suave (mismo espíritu que el ramp de
 *   1,5 s de la web) y la ganancia hace fade al pausar/reanudar: sin clics.
 * - No usa setInterval/setTimeout como reloj: el reloj es la corriente de
 *   muestras del AudioTrack (P1 audio clock).
 * - La WebView controla las frecuencias (retune); el transporte lo sostiene
 *   este servicio.
 */
class BinauralToneEngine {
    private val sampleRate = 44100
    private val blockSamples = 2048
    private val base = AtomicReference(220.0)
    private val beat = AtomicReference(6.0)
    private val targetBase = AtomicReference(220.0)
    private val targetBeat = AtomicReference(6.0)
    private val gain = AtomicReference(0.0)
    private val targetGain = AtomicReference(0.6)
    private val playing = AtomicBoolean(false)
    private var phaseL = 0.0
    private var phaseR = 0.0
    @Volatile private var track: AudioTrack? = null
    private var thread: Thread? = null

    fun start() {
        if (playing.getAndSet(true)) return
        if (track == null) track = createTrack()
        thread = Thread({ runLoop() }, "bineural-audio").apply { start() }
    }

    fun pause() {
        targetGain.set(0.0)
    }

    fun resume() {
        if (playing.get()) targetGain.set(0.6)
    }

    fun retune(newBase: Double, newBeat: Double) {
        targetBase.set(newBase)
        targetBeat.set(newBeat)
    }

    /** Audio focus: duck baja el volumen sin cortar; restore lo recupera. */
    fun duck(down: Boolean) {
        targetGain.set(if (down) 0.12 else 0.6)
    }

    fun stop() {
        if (!playing.getAndSet(false)) return
        targetGain.set(0.0)
        try {
            track?.stop()
        } catch (_: Exception) {
        }
        try {
            track?.release()
        } catch (_: Exception) {
        }
        track = null
    }

    fun isPlaying(): Boolean = playing.get() && gain.get() > 0.01

    private fun createTrack(): AudioTrack {
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
            .build()
        val fmt = AudioFormat.Builder()
            .setSampleRate(sampleRate)
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setChannelMask(AudioFormat.CHANNEL_OUT_STEREO)
            .build()
        val minBuf = AudioTrack.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_OUT_STEREO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        val buf = maxOf(minBuf * 2, blockSamples * 4)
        return AudioTrack.Builder()
            .setAudioAttributes(attrs)
            .setAudioFormat(fmt)
            .setBufferSizeInBytes(buf)
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()
    }

    private fun runLoop() {
        val samples = ShortArray(blockSamples * 2)
        val dt = 1.0 / sampleRate
        while (playing.get()) {
            val tr = track ?: break
            val f1 = base.get() + (targetBase.get() - base.get()) * 0.05
            val bt = beat.get() + (targetBeat.get() - beat.get()) * 0.05
            base.set(f1)
            beat.set(bt)
            val f2 = f1 + bt
            val g = gain.get() + (targetGain.get() - gain.get()) * 0.05
            gain.set(g)
            val amp = (g * 32767 * 0.6).toInt()
            for (i in samples.indices step 2) {
                phaseL += 2 * PI * f1 * dt
                phaseR += 2 * PI * f2 * dt
                if (phaseL > 2 * PI) phaseL -= 2 * PI
                if (phaseR > 2 * PI) phaseR -= 2 * PI
                samples[i] = (sin(phaseL) * amp).toInt().toShort()
                samples[i + 1] = (sin(phaseR) * amp).toInt().toShort()
            }
            try {
                var off = 0
                while (off < samples.size) {
                    val w = tr.write(samples, off, samples.size - off)
                    if (w <= 0) break
                    off += w
                }
            } catch (_: Exception) {
                break
            }
        }
        try {
            track?.stop()
        } catch (_: Exception) {
        }
    }
}
