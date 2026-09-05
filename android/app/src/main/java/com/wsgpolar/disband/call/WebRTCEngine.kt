package com.wsgpolar.disband.call

import android.content.Context
import kotlinx.coroutines.suspendCancellableCoroutine
import org.webrtc.AudioTrack
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.audio.JavaAudioDeviceModule
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Android port of the iOS `WebRTCEngine` — a single audio-only `PeerConnection`
 * with bundled ICE buffering, the exact same signal grammar as iOS/web
 * (offer/answer/ice over the `call:<callId>` bus), and the same track ids.
 */
class WebRTCEngine(
    appContext: Context,
    private val iceServers: List<PeerConnection.IceServer>,
    private val onSignal: (CallSignal) -> Unit,
    private val onRemoteAudioTrack: (AudioTrack?) -> Unit,
    private val onConnectionFailed: () -> Unit,
) {
    private val factory: PeerConnectionFactory
    private val pc: PeerConnection
    private val audioModule: JavaAudioDeviceModule
    private val localAudio: AudioTrack

    private var remoteAudio: AudioTrack? = null

    // Candidates that arrive before the remote description exist cannot be
    // added — buffer them and flush once setRemoteDescription succeeds.
    private val pendingCandidates = mutableListOf<IceCandidate>()
    private var hasRemoteDescription = false

    private val observer = object : PeerConnection.Observer {
        override fun onSignalingChange(state: PeerConnection.SignalingState) {}

        override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
            if (state == PeerConnection.IceConnectionState.CONNECTED ||
                state == PeerConnection.IceConnectionState.COMPLETED
            ) {
                remoteAudio?.setEnabled(true)
            }
        }

        override fun onConnectionChange(state: PeerConnection.PeerConnectionState) {
            if (state == PeerConnection.PeerConnectionState.DISCONNECTED ||
                state == PeerConnection.PeerConnectionState.FAILED ||
                state == PeerConnection.PeerConnectionState.CLOSED
            ) {
                onConnectionFailed()
            }
        }

        override fun onIceConnectionReceivingChange(receiving: Boolean) {}

        override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {}

        override fun onIceCandidate(candidate: IceCandidate) {
            onSignal(
                CallSignal(
                    type = "ice",
                    from = "",
                    to = null,
                    callId = null,
                    sdp = null,
                    candidate = CallIceCandidate(
                        candidate = candidate.sdp ?: "",
                        sdpMLineIndex = candidate.sdpMLineIndex,
                        sdpMid = candidate.sdpMid,
                    ),
                ),
            )
        }

        override fun onIceCandidatesRemoved(candidates: Array<IceCandidate>) {}

        override fun onAddStream(stream: MediaStream) {}

        override fun onRemoveStream(stream: MediaStream) {}

        override fun onDataChannel(channel: DataChannel) {}

        override fun onRenegotiationNeeded() {}

        override fun onTrack(transceiver: RtpTransceiver) {
            val track = transceiver.receiver.track()
            if (track is AudioTrack) {
                remoteAudio = track
                onRemoteAudioTrack(track)
            }
        }
    }

    init {
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(appContext)
                .setEnableInternalTracer(false)
                .createInitializationOptions(),
        )
        audioModule = JavaAudioDeviceModule.builder(appContext)
            .setUseHardwareAcousticEchoCanceler(true)
            .setUseHardwareNoiseSuppressor(true)
            .createAudioDeviceModule()

        factory = PeerConnectionFactory.builder()
            .setAudioDeviceModule(audioModule)
            .createPeerConnectionFactory()

        val config = PeerConnection.RTCConfiguration(iceServers)
        config.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
        config.continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY

        pc = factory.createPeerConnection(config, observer) ?: error("Failed to create PeerConnection")

        localAudio = factory.createAudioTrack("audio0", factory.createAudioSource(MediaConstraints()))
        pc.addTrack(localAudio, listOf("stream0"))
    }

    suspend fun makeOffer(): SessionDescription = createSdp(offer = true)

    suspend fun makeAnswer(): SessionDescription = createSdp(offer = false)

    private suspend fun createSdp(offer: Boolean): SessionDescription {
        val description = suspendCancellableCoroutine { cont ->
            val observer = sdpObserver(cont)
            if (offer) pc.createOffer(observer, MediaConstraints())
            else pc.createAnswer(observer, MediaConstraints())
        }
        setLocalDescription(description)
        return description
    }

    suspend fun setRemote(sdp: CallSdp) {
        val type = when (sdp.type) {
            "offer" -> SessionDescription.Type.OFFER
            "pranswer" -> SessionDescription.Type.PRANSWER
            "rollback" -> SessionDescription.Type.ROLLBACK
            else -> SessionDescription.Type.ANSWER
        }
        suspendCancellableCoroutine { cont ->
            pc.setRemoteDescription(sdpObserver(cont), SessionDescription(type, sdp.sdp))
        }
        hasRemoteDescription = true
        flushPendingCandidates()
    }

    suspend fun addIceCandidate(candidate: CallIceCandidate) {
        val ice = IceCandidate(candidate.sdpMid, candidate.sdpMLineIndex, candidate.candidate)
        if (!hasRemoteDescription) {
            pendingCandidates.add(ice)
            return
        }
        add(ice)
    }

    fun setMicEnabled(enabled: Boolean) {
        localAudio.setEnabled(enabled)
    }

    fun setRemoteAudioEnabled(enabled: Boolean) {
        remoteAudio?.setEnabled(enabled)
    }

    fun setSpeaker(on: Boolean) {
        audioModule.setSpeakerMute(!on)
    }

    fun dispose() {
        runCatching {
            pc.close()
            localAudio.dispose()
            remoteAudio?.let { runCatching { it.dispose() } }
        }
    }

    private suspend fun setLocalDescription(description: SessionDescription) {
        suspendCancellableCoroutine { cont ->
            pc.setLocalDescription(sdpObserver(cont), description)
        }
    }

    private suspend fun add(ice: IceCandidate) {
        runCatching { pc.addIceCandidate(ice) }
    }

    private fun flushPendingCandidates() {
        val queued = pendingCandidates.toList()
        pendingCandidates.clear()
        queued.forEach { runCatching { pc.addIceCandidate(it) } }
    }

    private fun sdpObserver(cont: CancellableContinuation<SessionDescription>): SdpObserver =
        object : SdpObserver {
            override fun onCreateSuccess(description: SessionDescription) {
                if (cont.isActive) cont.resume(description)
            }

            override fun onCreateFailure(error: String) {
                if (cont.isActive) cont.resumeWithException(RuntimeException(error))
            }

            override fun onSetSuccess() {}

            override fun onSetFailure(error: String) {
                if (cont.isActive) cont.resumeWithException(RuntimeException(error))
            }
        }
}

private typealias CancellableContinuation<T> = kotlinx.coroutines.CancellableContinuation<T>
private typealias MediaStream = org.webrtc.MediaStream
private typealias DataChannel = org.webrtc.DataChannel