package com.wsgpolar.disband.call

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.min
import kotlin.math.sin

/**
 * In-memory synthesized call tones (no asset files), mirroring the iOS
 * `CallSounds`. Ring/calling tones loop via a MODE_STATIC AudioTrack with
 * setLoopPoints; the chimes play once. Gated by `sound_enabled`.
 */
object CallTones {
    private const val SAMPLE_RATE = 44100
    private val trackRef = AtomicReference<AudioTrack?>(null)

    /**
     * A tone with a proper attack/sustain/release shape.
     *
     * The previous envelope was `exp(-3t)` across the whole buffer, so a 1.4s
     * ring had collapsed to 5% of its amplitude almost immediately — it read as
     * a buzzy pluck rather than a ring. It also ended mid-waveform, so every
     * loop began with a discontinuity, which is heard as a click.
     *
     * `decay` keeps the plucked shape for the short chimes, where it is wanted.
     * The release ramp always brings the signal to exactly zero.
     */
    private fun pcm(
        seconds: Double,
        oscillators: List<Pair<Double, Double>>,
        decay: Double = 0.0,
    ): ShortArray {
        val n = (SAMPLE_RATE * seconds).toInt()
        val out = ShortArray(n)
        val attack = (0.015 * SAMPLE_RATE).toInt().coerceAtLeast(1)
        val release = (0.040 * SAMPLE_RATE).toInt().coerceAtLeast(1).coerceAtMost(n / 2)
        for (i in 0 until n) {
            var v = 0.0
            for ((freq, amp) in oscillators) {
                v += amp * sin(2.0 * PI * freq * i / SAMPLE_RATE)
            }
            val t = i.toDouble() / n
            val body = if (decay > 0.0) exp(-decay * t) else 1.0
            val rampIn = min(1.0, i.toDouble() / attack)
            val rampOut = min(1.0, (n - 1 - i).toDouble() / release)
            val envelope = body * rampIn * rampOut
            out[i] = (v * 32767.0 * envelope).toInt().coerceIn(-32768, 32767).toShort()
        }
        return out
    }

    private fun silence(seconds: Double) = ShortArray((seconds * SAMPLE_RATE).toInt())

    /**
     * Ring: two short bursts then a pause, the cadence a phone actually uses.
     * One long 1.4s tone read as a drone rather than a ring.
     */
    private val ringtone by lazy {
        val burst = pcm(0.4, listOf(440.0 to 0.20, 550.0 to 0.10))
        burst + silence(0.2) + burst + silence(1.6)
    }

    /** Calling: a single soft pulse every three seconds, as a ringback. */
    private val calling by lazy {
        pcm(0.45, listOf(400.0 to 0.16, 500.0 to 0.08)) + silence(2.55)
    }

    // Short chimes keep the plucked decay; that shape suits them.
    private val connected by lazy { pcm(0.35, listOf(660.0 to 0.18, 990.0 to 0.09), decay = 3.0) }
    private val join by lazy { pcm(0.3, listOf(520.0 to 0.16, 780.0 to 0.08), decay = 3.0) }
    private val leave by lazy { pcm(0.3, listOf(780.0 to 0.16, 520.0 to 0.08), decay = 3.0) }
    private val end by lazy { pcm(0.4, listOf(520.0 to 0.16, 390.0 to 0.12, 280.0 to 0.10), decay = 3.0) }

    fun startRingtone() = loop(ringtone)
    fun startCallingTone() = loop(calling)
    fun playConnected() = once(connected)
    fun playJoin() = once(join)
    fun playLeave() = once(leave)
    fun playEnd() = once(end)

    fun stop() {
        trackRef.getAndSet(null)?.let {
            runCatching {
                it.pause()
                it.flush()
                it.release()
            }
        }
    }

    private fun loop(pcm: ShortArray) {
        stop()
        val bytes = ShortArray(pcm.size).also { System.arraycopy(pcm, 0, it, 0, pcm.size) }
        runCatching {
            val t = buildTrack(bytes, endless = true)
            t.setLoopPoints(0, pcm.size, -1)
            t.play()
            trackRef.set(t)
        }
    }

    private fun once(pcm: ShortArray) {
        runCatching {
            val t = buildTrack(pcm, endless = false)
            t.setPlaybackPositionUpdateListener(object : AudioTrack.OnPlaybackPositionUpdateListener {
                override fun onMarkerReached(track: AudioTrack) {
                    runCatching { track.release() }
                    if (trackRef.get() === track) trackRef.set(null)
                }

                override fun onPeriodicNotification(track: AudioTrack) {}
            })
            t.setNotificationMarkerPosition(pcm.size)
            t.play()
        }
    }

    private fun buildTrack(pcm: ShortArray, endless: Boolean): AudioTrack {
        val minBuf = AudioTrack.getMinBufferSize(
            SAMPLE_RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT,
        )
        val size = (pcm.size * 2).coerceAtLeast(minBuf * 2)
        val t = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    // Sonification, not speech: a synthesized tone declared as
                    // speech invites the voice pipeline's processing — gain
                    // control and noise suppression — which mangles a pure
                    // sine into something harsh.
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build(),
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(SAMPLE_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build(),
            )
            .setBufferSizeInBytes(size)
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build()
        val bytes = java.nio.ByteBuffer.allocate(pcm.size * 2)
        for (s in pcm) bytes.putShort(s)
        t.write(bytes.array(), 0, pcm.size * 2)
        return t
    }
}