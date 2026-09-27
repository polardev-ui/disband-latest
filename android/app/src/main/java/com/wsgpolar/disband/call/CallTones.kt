package com.wsgpolar.disband.call

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.PI
import kotlin.math.sin
import kotlin.math.min

/**
 * Custom warm phone tones. Prior attempts at 430Hz / 14% gain with 48kHz
 * MODE_STATIC resampling on the emulator aliased into ear-piercing static.
 * This version is intentionally muffled and calm: single low sine (400Hz),
 * ~3.5% gain, slow attack/release, 44.1kHz (host-native) so no resampling
 * on the emulator, and clean zero-crossing loops.
 */
object CallTones {
    private const val SAMPLE_RATE = 44100
    private val trackRef = AtomicReference<AudioTrack?>(null)

    private fun pcm(seconds: Double, freq: Double, gain: Double): ShortArray {
        val n = (SAMPLE_RATE * seconds).toInt()
        val out = ShortArray(n)
        // Muffled = slow attack, long release, no harsh transient
        val attack = (0.030 * SAMPLE_RATE).toInt().coerceAtLeast(1)
        val release = (0.080 * SAMPLE_RATE).toInt().coerceAtLeast(1).coerceAtMost(n / 2)
        for (i in 0 until n) {
            val raw = gain * sin(2.0 * PI * freq * i / SAMPLE_RATE)
            val rampIn = min(1.0, i.toDouble() / attack)
            val rampOut = min(1.0, (n - 1 - i).toDouble() / release)
            val s = raw * rampIn * rampOut
            out[i] = (s * 32767.0).toInt().coerceIn(-32768, 32767).toShort()
        }
        // Ensure true zero at loop boundary
        if (n > 1) { out[0] = 0; out[n - 1] = 0 }
        return out
    }

    private fun silence(seconds: Double) = ShortArray((seconds * SAMPLE_RATE).toInt())

    // Incoming ring you hear when someone calls you: warm double-burst,
    // unhurried — like a modern soft phone, not a 90s desk phone.
    private val ringtone by lazy {
        val burst = pcm(0.45, freq = 400.0, gain = 0.038)
        burst + silence(0.25) + burst + silence(1.5)
    }

    // Outgoing ringback (caller hears while waiting): single gentle pulse
    private val calling by lazy {
        pcm(0.35, freq = 390.0, gain = 0.032) + silence(2.8)
    }

    // Connected/join/leave chimes: brief, rounded, even softer
    private val connected by lazy { pcm(0.18, freq = 620.0, gain = 0.040) }
    private val joinChime by lazy { pcm(0.14, freq = 520.0, gain = 0.035) }
    private val leaveChime by lazy { pcm(0.14, freq = 380.0, gain = 0.035) }
    private val endChime by lazy { pcm(0.22, freq = 340.0, gain = 0.032) }

    fun startRingtone() = loop(ringtone)
    fun startCallingTone() = loop(calling)
    fun playConnected() = once(connected)
    fun playJoin() = once(joinChime)
    fun playLeave() = once(leaveChime)
    fun playEnd() = once(endChime)

    fun stop() {
        trackRef.getAndSet(null)?.let {
            runCatching { it.pause(); it.flush(); it.release() }
        }
    }

    private fun loop(pcm: ShortArray) {
        stop()
        runCatching {
            val t = buildTrack(pcm)
            // Whole buffer loops: burst+silence+burst+silence — ends at zero (silence)
            t.setLoopPoints(0, pcm.size, -1)
            t.play()
            trackRef.set(t)
        }
    }

    private fun once(pcm: ShortArray) {
        runCatching {
            val t = buildTrack(pcm)
            t.setNotificationMarkerPosition(pcm.size)
            t.setPlaybackPositionUpdateListener(object : AudioTrack.OnPlaybackPositionUpdateListener {
                override fun onMarkerReached(track: AudioTrack) { runCatching { track.release() } }
                override fun onPeriodicNotification(track: AudioTrack) {}
            })
            t.play()
            // One-shots self-release on marker; keep no ref
        }
    }

    private fun buildTrack(pcm: ShortArray): AudioTrack {
        val minBuf = AudioTrack.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val size = (pcm.size * 2).coerceAtLeast(minBuf * 2)
        val t = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
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
        // Native-order short → byte, no extra copy
        val buf = java.nio.ByteBuffer.allocateDirect(pcm.size * 2).order(java.nio.ByteOrder.nativeOrder())
        for (s in pcm) buf.putShort(s)
        buf.flip()
        // MODE_STATIC write: offset 0, size in bytes
        t.write(buf, pcm.size * 2, AudioTrack.WRITE_NON_BLOCKING)
        // Fallback blocking write if non-blocking wrote 0
        if (t.bufferSizeInFrames < pcm.size) {
            val fallback = java.nio.ByteBuffer.allocate(pcm.size * 2)
            for (s in pcm) fallback.putShort(s)
            t.write(fallback.array(), 0, pcm.size * 2)
        }
        return t
    }

    private operator fun ShortArray.plus(other: ShortArray): ShortArray {
        val r = ShortArray(size + other.size)
        System.arraycopy(this, 0, r, 0, size)
        System.arraycopy(other, 0, r, size, other.size)
        return r
    }
}
